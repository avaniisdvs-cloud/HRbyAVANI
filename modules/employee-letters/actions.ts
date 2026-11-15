'use server'

/**
 * Employee Letters — Server Actions (Option B Dynamic Template Engine)
 * Pattern: Auth → Zod → db.transaction + audit → revalidatePath
 */
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, getCurrentUser } from '@/lib/auth'
import { assertSameEntity } from '@/lib/access'
import { writeAuditLog } from '@/lib/audit'
import { uploadDocument } from '@/lib/blob-storage'
import { TENANT_ID } from '@/lib/constants'
import {
  employeeLetters,
  letterTemplates,
  letterTemplateTypes,
  letterEmailJobs,
  legalEntities,
  persons,
  notificationLog,
  personDocuments,
} from '@/drizzle/schema'
import {
  getPersonWithDetails,
  getDefaultTemplate,
  nextLetterNumber,
  getLetterById,
  getPersonEmail,
} from './queries'
import { resolveTemplateBilingual, resolveTemplate } from './engine'
import { preflightCheck } from './preflight'
import { generateLetterPdf, formatLetterDate } from './generate-pdf'
import { sendLetterEmail } from './email'
import { translateTemplateToArabic } from './translate'

// ── Bulk generate letters ─────────────────────────────────────────────────────

const BulkGenerateSchema = z.object({
  typeCode:      z.string().min(2).max(10),
  personIds:     z.array(z.string().uuid()).min(1).max(100),
  templateId:    z.string().uuid().optional(),
  language:      z.enum(['en', 'ar', 'both']).default('en'),
  effectiveDate: z.string().optional(),
  newJobId:      z.string().uuid().optional(),
})

export async function bulkGenerateLetters(formData: FormData) {
  const session = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const input = BulkGenerateSchema.parse({
    typeCode:      formData.get('typeCode'),
    personIds:     JSON.parse(formData.get('personIds') as string),
    templateId:    formData.get('templateId') ?? undefined,
    language:      formData.get('language') ?? 'en',
    effectiveDate: formData.get('effectiveDate') ?? undefined,
    newJobId:      formData.get('newJobId') ?? undefined,
  })

  const results: Array<{ personId: string; letterId?: string; error?: string }> = []

  for (const personId of input.personIds) {
    try {
      const person = await getPersonWithDetails(personId)
      if (!person?.legalEntityId) {
        results.push({ personId, error: 'Person not found or no legal entity' })
        continue
      }

      const template = input.templateId
        ? await db.select().from(letterTemplates).where(eq(letterTemplates.id, input.templateId)).limit(1).then(r => r[0])
        : await getDefaultTemplate(input.typeCode, person.legalEntityId)

      if (!template) {
        results.push({ personId, error: `No template found for ${input.typeCode}` })
        continue
      }

      // Auto-translate AR body via Claude when AR is needed but template has none
      const needsAr = input.language === 'ar' || input.language === 'both'
      let templateBodyAr = template.bodyAr ?? ''
      if (needsAr && !templateBodyAr.trim()) {
        const translated = await translateTemplateToArabic(template.bodyEn)
        if (translated.success) {
          templateBodyAr = translated.bodyAr
        } else {
          results.push({ personId, error: `Auto-translate failed: ${translated.error}` })
          continue
        }
      }

      const letterNumber = await nextLetterNumber(input.typeCode)

      const ctx = {
        personId,
        legalEntityId:  person.legalEntityId,
        letterId:       '',
        letterNumber,
        effectiveDate:  input.effectiveDate ? new Date(input.effectiveDate) : null,
        newJobId:       input.newJobId,
        db:             db as any,
      }

      // Pre-generation field validation — only check AR body when generating Arabic content
      const preflightBodyAr = input.language === 'en' ? '' : templateBodyAr
      const preflight = await preflightCheck(template.bodyEn, preflightBodyAr, ctx)
      if (!preflight.valid) {
        const summary = preflight.issues
          .map(i => `${i.labelEn} (${i.issue === 'NO_RESOLVER' ? 'no DB mapping' : 'empty value'})`)
          .join(', ')
        results.push({ personId, error: `Preflight failed — fix required fields: ${summary}` })
        continue
      }

      const { resolvedEn, resolvedAr, snapshot } = await resolveTemplateBilingual(
        template.bodyEn, templateBodyAr, ctx,
      )

      let letterId = ''
      await db.transaction(async tx => {
        const [letter] = await tx.insert(employeeLetters).values({
          tenantId:            TENANT_ID,
          personId,
          legalEntityId:       person.legalEntityId!,
          templateId:          template.id,
          typeCode:            input.typeCode,
          letterNumber,
          status:              'DRAFT',
          resolvedBodyEn:      resolvedEn,
          resolvedBodyAr:      resolvedAr,
          tokenSnapshot:       snapshot,
          generatedBy:         session.id,
          generatedAt:         new Date(),
          effectiveDate:       input.effectiveDate ?? null,
          language:            input.language,
          createdBy:           session.id,
          createdByName:       session.name,
        }).returning({ id: employeeLetters.id })

        letterId = letter.id

        await writeAuditLog({
          actorId:      session.id,
          actorName:    session.name,
          actorRole:    session.role,
          channel:      'WEB',
          eventType:    'LETTER.GENERATE',
          resourceType: 'employee_letter',
          resourceId:   letter.id,
          newValues:    { typeCode: input.typeCode, letterNumber, personId },
        }, tx)
      })

      results.push({ personId, letterId })
    } catch (err) {
      results.push({ personId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  revalidatePath(`/employee-letters/${input.typeCode}`)
  return results
}

// ── Generate PDF for a single letter ─────────────────────────────────────────

export async function generateLetterPDF(letterId: string) {
  const session = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const letter = await getLetterById(letterId)
  if (!letter) throw new Error('Letter not found')
  if (!letter.resolvedBodyEn) throw new Error('Letter body not resolved — regenerate first')

  const result = await _autoGeneratePdf(letterId, session.id, session.name, session.role)
  if (!result.success) throw new Error(result.error ?? 'PDF generation failed')

  const updated = await getLetterById(letterId)
  revalidatePath(`/employee-letters/${letter.typeCode}`)
  return { pdfUrl: updated?.pdfUrl ?? '' }
}

// ── Bulk PDF generation ───────────────────────────────────────────────────────

export async function bulkGeneratePDFs(letterIds: string[]) {
  const results = await Promise.allSettled(letterIds.map(id => generateLetterPDF(id)))
  return results.map((r, i) => ({
    letterId: letterIds[i],
    success:  r.status === 'fulfilled',
    error:    r.status === 'rejected' ? String((r as PromiseRejectedResult).reason) : undefined,
  }))
}

// ── Send letter email ─────────────────────────────────────────────────────────

export async function sendLetterEmailAction(letterId: string): Promise<{ success: boolean; email?: string; error?: string }> {
  const session = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const letter = await getLetterById(letterId)
  if (!letter) return { success: false, error: 'Letter not found' }

  // P3-M-FALLBACK-EMAIL — SECURITY: never route a letter (which carries the
  // employee's PII) to a hardcoded personal mailbox. If there is no work email
  // on record, fail the send so HR can fix the address or hand over the letter
  // another way. The document must never leave the org boundary to a default.
  const email = await getPersonEmail(letter.personId)
  if (!email) {
    return {
      success: false,
      error:   'Employee has no work email on record — cannot send. Add a work email, or download the letter and deliver it directly.',
    }
  }

  // Auto-generate PDF if missing before sending
  let pdfUrl = letter.pdfUrl
  if (!pdfUrl) {
    try {
      const generated = await generateLetterPDF(letterId)
      pdfUrl = generated.pdfUrl
    } catch (e) {
      return { success: false, error: 'PDF generation failed — cannot send email' }
    }
  }

  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(eq(legalEntities.id, letter.legalEntityId))
    .limit(1)

  const [typeRow] = await db
    .select()
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.typeCode, letter.typeCode))
    .limit(1)

  const person = await getPersonWithDetails(letter.personId)

  const recipientName = person?.fullNameEn ?? ''

  let result: { success: boolean; email?: string; error?: string }
  try {
    result = await sendLetterEmail({
      recipientEmail: email,
      recipientName,
      letterNumber:   letter.letterNumber,
      letterTypeName: typeRow?.nameEn ?? letter.typeCode,
      companyName:    entity?.nameEn ?? '',
      emailFooter:    entity?.letterEmailFooter ?? undefined,
    })
  } catch (e) {
    result = { success: false, error: e instanceof Error ? e.message : 'Email send failed' }
  }

  const status = result.success ? 'SENT' : 'FAILED'

  await db.transaction(async tx => {
    await tx.update(employeeLetters)
      .set({
        emailSentAt:     result.success ? new Date() : null,
        emailRecipient:  email,
        emailStatus:     status,
        status:          result.success ? 'SENT' : letter.status,
        updatedBy:       session.id,
        updatedByName:   session.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(employeeLetters.id, letterId))

    await writeAuditLog({
      actorId:      session.id,
      actorName:    session.name,
      actorRole:    session.role,
      channel:      'WEB',
      eventType:    result.success ? 'LETTER.EMAIL_SENT' : 'LETTER.EMAIL_FAILED',
      resourceType: 'employee_letter',
      resourceId:   letterId,
      newValues:    { email, status, error: result.error },
    }, tx)
  })

  revalidatePath(`/employee-letters/${letter.typeCode}`)
  return { ...result, email }
}

// ── Bulk email ────────────────────────────────────────────────────────────────

export async function bulkSendEmailsAction(letterIds: string[]) {
  const session = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const jobRef  = `bulk-${Date.now()}`

  const settled = await Promise.allSettled(
    letterIds.map(async id => {
      const r = await sendLetterEmailAction(id)
      await db.insert(letterEmailJobs).values({
        tenantId:       TENANT_ID,
        jobRef,
        letterId:       id,
        recipientEmail: r.email ?? '',
        status:         r.success ? 'SENT' : 'FAILED',
        errorMessage:   r.error ?? null,
        attemptedAt:    new Date(),
        createdBy:      session.id,
        createdByName:  session.name,
      })
      return r
    }),
  )

  const values = settled.map(r =>
    r.status === 'fulfilled' ? r.value : { email: '', success: false },
  )
  return {
    sent:   values.filter(r => r.success).length,
    failed: values.filter(r => !r.success).length,
    jobRef,
  }
}

// ── Generate signing link (72-hour token) — kept for public link fallback ─────

export async function generateSigningLink(letterId: string): Promise<string> {
  const session   = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const letter    = await getLetterById(letterId)
  if (!letter) throw new Error('Letter not found')

  const token      = randomBytes(32).toString('hex')
  const expiresAt  = new Date(Date.now() + 72 * 60 * 60 * 1000)

  await db.transaction(async tx => {
    await tx.update(employeeLetters)
      .set({
        signingToken:          token,
        signingTokenExpiresAt: expiresAt,
        updatedBy:             session.id,
        updatedByName:         session.name,
        lastUpdatedDate:       new Date(),
      })
      .where(eq(employeeLetters.id, letterId))

    await writeAuditLog({
      actorId:      session.id,
      actorName:    session.name,
      actorRole:    session.role,
      channel:      'WEB',
      eventType:    'LETTER.SIGNING_LINK_GENERATED',
      resourceType: 'employee_letter',
      resourceId:   letterId,
      newValues:    { expiresAt: expiresAt.toISOString() },
    }, tx)
  })

  return token
}

// ── Send sign request → in-app bell notification to employee ──────────────────

export async function sendSignRequest(letterId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const letter = await getLetterById(letterId)
  if (!letter) return { success: false, error: 'Letter not found' }

  const [recipient] = await db
    .select({ id: persons.id, fullNameEn: persons.fullNameEn, legalEntityId: persons.legalEntityId })
    .from(persons)
    .where(eq(persons.id, letter.personId))
    .limit(1)
  if (!recipient) return { success: false, error: 'Employee record not found' }

  const [typeRow] = await db
    .select({ nameEn: letterTemplateTypes.nameEn, nameAr: letterTemplateTypes.nameAr })
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.typeCode, letter.typeCode))
    .limit(1)

  const letterTypeName = typeRow?.nameEn ?? letter.typeCode
  const letterTypeNameAr = typeRow?.nameAr ?? letter.typeCode

  const token     = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)
  const now       = new Date()

  try {
    await db.transaction(async tx => {
      await tx.update(employeeLetters)
        .set({
          signingToken:          token,
          signingTokenExpiresAt: expiresAt,
          status:                'PENDING_SIGNATURE' as string,
          updatedBy:             session.id,
          updatedByName:         session.name,
          lastUpdatedDate:       now,
        })
        .where(eq(employeeLetters.id, letterId))

      await tx.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId:     recipient.legalEntityId ?? undefined,
        recipientPersonId: recipient.id,
        notificationType:  'LETTER_SIGN_REQUEST',
        channel:           'IN_APP',
        subjectEn:         'Document Awaiting Your Signature',
        subjectAr:         'مستند في انتظار توقيعك',
        bodyEn:            `Your ${letterTypeName} (${letter.letterNumber}) requires your acknowledgement. Please open to review and sign.`,
        bodyAr:            `يتطلب ${letterTypeNameAr} (${letter.letterNumber}) موافقتك. يرجى الفتح والمراجعة والتوقيع.`,
        referenceType:     'EMPLOYEE_LETTER',
        referenceId:       letter.id,
        status:            'SENT',
        sentAt:            now,
        createdBy:         session.id,
        createdByName:     session.name,
      })

      await writeAuditLog({
        actorId:      session.id,
        actorName:    session.name,
        actorRole:    session.role,
        channel:      'WEB',
        eventType:    'LETTER.SIGN_REQUEST_SENT',
        resourceType: 'employee_letter',
        resourceId:   letterId,
        newValues:    { recipientPersonId: recipient.id, expiresAt: expiresAt.toISOString() },
      }, tx)
    })

    revalidatePath(`/employee-letters/${letter.typeCode}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to send sign request' }
  }
}

// ── Get letter for preview (with entity branding) ─────────────────────────────

export async function getLetterForPreview(letterId: string) {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const letter = await getLetterById(letterId)
  if (!letter) throw new Error('Letter not found')

  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(eq(legalEntities.id, letter.legalEntityId))
    .limit(1)

  const [person] = await db
    .select({ fullNameEn: persons.fullNameEn, personNumber: persons.personNumber })
    .from(persons)
    .where(eq(persons.id, letter.personId))
    .limit(1)

  return {
    ...letter,
    employeeName:          person?.fullNameEn ?? null,
    employeeNumber:        person?.personNumber ?? null,
    companyNameEn:         entity?.nameEn ?? '',
    primaryLogoUrl:        (entity?.letterLogoChoice === 'secondary'
                             ? entity?.secondaryLogoUrl
                             : entity?.primaryLogoUrl) ?? null,
    headerImageUrl:        entity?.headerImageUrl ?? null,
    footerImageUrl:        entity?.footerImageUrl ?? null,
    signatoryName:         entity?.signatoryName ?? null,
    signatoryTitle:        entity?.signatoryTitle ?? null,
    signatorySignatureUrl: entity?.signatorySignatureUrl ?? null,
  }
}

// ── Download letter PDF (generate first if missing) ───────────────────────────

export async function downloadLetterPDF(letterId: string): Promise<{ downloadUrl: string; filename: string }> {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const letter = await getLetterById(letterId)
  if (!letter) throw new Error('Letter not found')

  let pdfUrl = letter.pdfUrl
  if (!pdfUrl) {
    const generated = await generateLetterPDF(letterId)
    pdfUrl = generated.pdfUrl
  }

  const [person] = await db
    .select({ fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(eq(persons.id, letter.personId))
    .limit(1)

  const TYPE_LABELS: Record<string, string> = {
    PCL: 'Probation_Confirmation_Letter', EML: 'Employment_Letter',
    PML: 'Promotion_Letter',              DCL: 'Designation_Change_Letter',
    SAL: 'Salary_Amendment_Letter',       SC:  'Salary_Certificate',
    STL: 'Salary_Transfer_Letter',        TER: 'Termination_Letter',
  }
  const typeLabel = TYPE_LABELS[letter.typeCode] ?? letter.typeCode
  const safeName  = (person?.fullNameEn ?? 'Employee').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
  const safeRef   = letter.letterNumber.replace(/[^a-zA-Z0-9-]/g, '_')
  const filename  = `${typeLabel}_${safeName}_${safeRef}.pdf`

  return { downloadUrl: pdfUrl!, filename }
}

// ── Complete digital signing (authenticated ESS — validates token ownership) ──

const SigningSchema = z.object({
  token:        z.string().length(64),
  signedByName: z.string().min(1).max(200),
  signedIp:     z.string().max(45).optional(),
  signedDevice: z.string().max(500).optional(),
})

export async function completeLetterSigning(formData: FormData) {
  const session = await getCurrentUser()

  const input = SigningSchema.parse({
    token:        formData.get('token'),
    signedByName: formData.get('signedByName'),
    signedIp:     formData.get('signedIp') ?? undefined,
    signedDevice: formData.get('signedDevice') ?? undefined,
  })

  const [letter] = await db
    .select()
    .from(employeeLetters)
    .where(
      and(
        eq(employeeLetters.tenantId, TENANT_ID),
        eq(employeeLetters.signingToken, input.token),
      ),
    )
    .limit(1)

  if (!letter) throw new Error('Invalid signing link')
  if (letter.status === 'SIGNED') throw new Error('Already signed')
  if (letter.signingTokenExpiresAt && new Date() > new Date(letter.signingTokenExpiresAt)) {
    throw new Error('Signing link has expired')
  }

  // P3-A4 — SECURITY: fail-closed ownership. Only the letter's SUBJECT may sign.
  // The /letters/sign/[token] route is auth-gated by middleware, so the signer is
  // always authenticated. The previous guard (`if (sessionPerson && session.personId
  // && session.personId !== letter.personId)`) short-circuited when session.personId
  // was undefined (e.g. a first-time SSO user with no person record), letting an
  // authenticated user sign someone else's letter. Require an exact personId match.
  if (session.personId !== letter.personId) {
    throw new Error('You are not authorised to sign this document')
  }

  const now = new Date()

  await db.transaction(async tx => {
    await tx.update(employeeLetters)
      .set({
        status:          'SIGNED',
        signedAt:        now,
        signedByName:    input.signedByName,
        signedIp:        input.signedIp ?? null,
        signedDevice:    input.signedDevice ?? null,
        signingToken:    null,
        updatedBy:       letter.personId,
        updatedByName:   input.signedByName,
        lastUpdatedDate: now,
      })
      .where(eq(employeeLetters.id, letter.id))

    // Archive signed letter to person documents
    if (letter.pdfUrl) {
      const [person] = await db
        .select({ fullNameEn: persons.fullNameEn, legalEntityId: persons.legalEntityId })
        .from(persons)
        .where(eq(persons.id, letter.personId))
        .limit(1)

      const safeName = (input.signedByName ?? 'Employee').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
      const fileName = `${letter.letterNumber}_${safeName}.pdf`

      if (person?.legalEntityId) {
        await tx.insert(personDocuments).values({
          tenantId:      TENANT_ID,
          personId:      letter.personId,
          legalEntityId: person.legalEntityId,
          documentType:  'SIGNED_LETTER',
          documentTitle: `${letter.typeCode} — ${letter.letterNumber}`,
          storageKey:    letter.pdfUrl,
          fileName,
          mimeType:      'application/pdf',
          documentStatus: 'VALID',
          createdBy:     letter.personId,
          createdByName: input.signedByName,
        })
      }
    }

    // Mark related notification as read
    await tx.update(notificationLog)
      .set({ status: 'READ', readAt: now })
      .where(
        and(
          eq(notificationLog.tenantId, TENANT_ID),
          eq(notificationLog.recipientPersonId, letter.personId),
          eq(notificationLog.referenceId, letter.id),
          ne(notificationLog.status, 'READ'),
        ),
      )

    await writeAuditLog({
      actorId:      letter.personId,
      actorName:    input.signedByName,
      actorRole:    'EMPLOYEE',
      channel:      'WEB',
      eventType:    'LETTER.SIGNED',
      resourceType: 'employee_letter',
      resourceId:   letter.id,
      newValues:    { signedByName: input.signedByName, signedAt: now.toISOString(), signedIp: input.signedIp },
    }, tx)
  })

  // After signing a PCL, finalize probation status → CONFIRMED (employee becomes permanent)
  if (letter.typeCode === 'PCL') {
    const { finalizeProbationAfterSigning } = await import('@/modules/core-hr/probation/workflow-actions')
    await finalizeProbationAfterSigning(letter.id, letter.personId).catch(() => {
      // Non-fatal: PCL may have been manually issued without a review
    })
  }

  return { success: true, letterNumber: letter.letterNumber }
}

// ── Save letter template ──────────────────────────────────────────────────────

const SaveTemplateSchema = z.object({
  id:            z.string().uuid().optional(),
  typeCode:      z.string().min(2).max(10),
  legalEntityId: z.string().uuid().optional(),
  nameEn:        z.string().min(1).max(200),
  nameAr:        z.string().max(200).default(''),
  bodyEn:        z.string().min(1),
  bodyAr:        z.string().default(''),
  isDefault:     z.boolean().default(false),
})

export async function saveLetterTemplate(formData: FormData) {
  const session = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const input = SaveTemplateSchema.parse({
    id:            formData.get('id') ?? undefined,
    typeCode:      formData.get('typeCode'),
    legalEntityId: formData.get('legalEntityId') ?? undefined,
    nameEn:        formData.get('nameEn'),
    nameAr:        formData.get('nameAr'),
    bodyEn:        formData.get('bodyEn'),
    bodyAr:        formData.get('bodyAr'),
    isDefault:     formData.get('isDefault') === 'true',
  })

  const [type] = await db
    .select()
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.typeCode, input.typeCode))
    .limit(1)
  if (!type) throw new Error(`Unknown letter type: ${input.typeCode}`)

  await db.transaction(async tx => {
    if (input.id) {
      await tx.update(letterTemplates)
        .set({
          nameEn:          input.nameEn,
          nameAr:          input.nameAr,
          bodyEn:          input.bodyEn,
          bodyAr:          input.bodyAr,
          isDefault:       input.isDefault,
          updatedBy:       session.id,
          updatedByName:   session.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(letterTemplates.id, input.id))
    } else {
      const [created] = await tx.insert(letterTemplates).values({
        tenantId:      TENANT_ID,
        typeId:        type.id,
        legalEntityId: input.legalEntityId ?? null,
        nameEn:        input.nameEn,
        nameAr:        input.nameAr,
        bodyEn:        input.bodyEn,
        bodyAr:        input.bodyAr,
        isDefault:     input.isDefault,
        isActive:      true,
        version:       1,
        createdBy:     session.id,
        createdByName: session.name,
      }).returning({ id: letterTemplates.id })
      input.id = created.id
    }

    await writeAuditLog({
      actorId:      session.id,
      actorName:    session.name,
      actorRole:    session.role,
      channel:      'WEB',
      eventType:    'LETTER_TEMPLATE.' + (input.id ? 'UPDATE' : 'CREATE'),
      resourceType: 'letter_template',
      resourceId:   input.id,
      newValues:    { typeCode: input.typeCode, nameEn: input.nameEn },
    }, tx)
  })

  revalidatePath('/settings/letter-templates')
}

// ── ESS: employee self-service letter request ─────────────────────────────────

const EssRequestSchema = z.object({
  typeCode:  z.string().min(2).max(10),
  language:  z.enum(['en', 'ar']).default('en'),
  personId:  z.string().uuid(),
})

// Business-friendly error messages — never expose stack traces or DB errors to employees
const ESS_ERRORS = {
  LETTER_TYPE_NOT_FOUND: 'This letter type is not available. Please contact HR Administration.',
  ESS_NOT_ALLOWED:       'This letter type cannot be requested online. Please contact HR directly.',
  PERSON_NOT_FOUND:      'We cannot generate this letter because some required employee information is missing. Please contact HR to update your profile.',
  NO_TEMPLATE:           'This letter template is not configured yet. Please contact HR Administration to configure the template before requesting this letter.',
  TEMPLATE_INVALID:      'We cannot generate this letter because some required employee information is missing. Please contact HR to update your profile.',
  NO_APPROVER:           'This letter requires approval, but no approver is configured. Please contact HR Administration.',
  VALIDATION_ERROR:      'Invalid request. Please refresh the page and try again.',
  SYSTEM_ERROR:          'We could not submit your letter request right now. Please try again later or contact HR support.',
} as const

export async function requestLetter(formData: FormData): Promise<{
  success: boolean
  error?: string
  errorCode?: string
  letterId?: string
  requiresApproval?: boolean
  pdfGenerated?: boolean
}> {
  try {
    const session = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const parsed = EssRequestSchema.safeParse({
      typeCode: formData.get('typeCode'),
      language: formData.get('language') ?? 'en',
      personId: formData.get('personId'),
    })

    if (!parsed.success) {
      return { success: false, error: ESS_ERRORS.VALIDATION_ERROR, errorCode: 'VALIDATION_ERROR' }
    }

    const input = parsed.data

    // P3-A5 — SECURITY: an EMPLOYEE may ONLY request a letter for themselves.
    // The client-supplied personId is ignored for EMPLOYEE and bound to the
    // authenticated session; otherwise an employee could POST any UUID and
    // generate (and auto-PDF) another person's salary certificate. HR roles may
    // request on behalf of an employee — entity-scoped after the person resolves.
    let subjectPersonId = input.personId
    if (session.role === 'EMPLOYEE') {
      if (!session.personId) {
        return { success: false, error: ESS_ERRORS.PERSON_NOT_FOUND, errorCode: 'PERSON_NOT_FOUND' }
      }
      subjectPersonId = session.personId
    }

    const [type] = await db
      .select()
      .from(letterTemplateTypes)
      .where(eq(letterTemplateTypes.typeCode, input.typeCode))
      .limit(1)

    if (!type) {
      return { success: false, error: ESS_ERRORS.LETTER_TYPE_NOT_FOUND, errorCode: 'LETTER_TYPE_NOT_FOUND' }
    }
    if (!type.allowEssSelfRequest) {
      return { success: false, error: ESS_ERRORS.ESS_NOT_ALLOWED, errorCode: 'ESS_NOT_ALLOWED' }
    }

    const person = await getPersonWithDetails(subjectPersonId)
    if (!person?.legalEntityId) {
      return { success: false, error: ESS_ERRORS.PERSON_NOT_FOUND, errorCode: 'PERSON_NOT_FOUND' }
    }

    // P3-A5 — entity scope: a non-SUPER_ADMIN requester (incl. HR acting on behalf)
    // may only generate letters for employees in their own legal entity.
    try {
      assertSameEntity(session, person.legalEntityId)
    } catch {
      return { success: false, error: ESS_ERRORS.PERSON_NOT_FOUND, errorCode: 'PERSON_NOT_FOUND' }
    }

    const template = await getDefaultTemplate(input.typeCode, person.legalEntityId)
    if (!template) {
      return { success: false, error: ESS_ERRORS.NO_TEMPLATE, errorCode: 'NO_TEMPLATE' }
    }

    const letterNumber = await nextLetterNumber(input.typeCode)

    const ctx = {
      personId:      subjectPersonId,
      legalEntityId: person.legalEntityId,
      letterId:      '',
      letterNumber,
      db:            db as any,
    }

    const preflight = await preflightCheck(template.bodyEn, template.bodyAr ?? '', ctx)
    if (!preflight.valid) {
      const unresolvable = preflight.issues.filter(i => i.issue === 'NO_RESOLVER')
      if (unresolvable.length > 0) {
        return { success: false, error: ESS_ERRORS.TEMPLATE_INVALID, errorCode: 'TEMPLATE_INVALID' }
      }
    }

    const { resolvedEn, resolvedAr, snapshot } = await resolveTemplateBilingual(
      template.bodyEn, template.bodyAr ?? '', ctx,
    )

    let letterId = ''
    const initialStatus = type.requiresApproval ? 'PENDING_APPROVAL' : 'SUBMITTED'

    await db.transaction(async tx => {
      const [letter] = await tx.insert(employeeLetters).values({
        tenantId:            TENANT_ID,
        personId:            subjectPersonId,
        legalEntityId:       person.legalEntityId!,
        templateId:          template.id,
        typeCode:            input.typeCode,
        letterNumber,
        status:              initialStatus,
        resolvedBodyEn:      resolvedEn,
        resolvedBodyAr:      resolvedAr,
        tokenSnapshot:       snapshot,
        requestedByEmployee: true,
        requestedAt:         new Date(),
        language:            input.language,
        createdBy:           session.id,
        createdByName:       session.name,
      }).returning({ id: employeeLetters.id })

      letterId = letter.id

      await writeAuditLog({
        actorId:      session.id,
        actorName:    session.name,
        actorRole:    session.role,
        channel:      'WEB',
        eventType:    'LETTER.ESS_REQUEST',
        resourceType: 'employee_letter',
        resourceId:   letter.id,
        newValues:    { typeCode: input.typeCode, letterNumber, requiresApproval: type.requiresApproval },
      }, tx)
    })

    // Auto-generate PDF for letters that do not require HR approval.
    // On failure: status is updated to FAILED in DB and audit log is written.
    let pdfGenerated = false
    if (!type.requiresApproval && letterId) {
      const genResult = await _autoGeneratePdf(letterId, session.id, session.name, session.role)
      pdfGenerated = genResult.success
    }

    revalidatePath('/me/letters')
    return { success: true, letterId, requiresApproval: type.requiresApproval, pdfGenerated }
  } catch {
    return { success: false, error: ESS_ERRORS.SYSTEM_ERROR, errorCode: 'SYSTEM_ERROR' }
  }
}

// ── Internal: generate + upload PDF without a role check ─────────────────────
// Used by both generateLetterPDF (admin, after role check) and requestLetter (ESS auto-approval).

async function _autoGeneratePdf(
  letterId: string,
  actorId: string,
  actorName: string,
  actorRole: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const letter = await getLetterById(letterId)
    if (!letter?.resolvedBodyEn) return { success: false, error: 'Letter body not resolved' }

    const [entity] = await db
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.id, letter.legalEntityId))
      .limit(1)

    const lang = (letter.language ?? 'en') as 'en' | 'ar' | 'both'

    // ── 1. Render the PDF buffer. A throw here is a genuine generation failure. ──
    const pdfBuffer = await generateLetterPdf({
      letterNumber:          letter.letterNumber,
      letterDate:            formatLetterDate(letter.effectiveDate ?? new Date()),
      resolvedBodyEn:        letter.resolvedBodyEn,
      resolvedBodyAr:        letter.resolvedBodyAr ?? undefined,
      language:              lang,
      companyNameEn:         entity?.nameEn ?? '',
      primaryLogoUrl:        (entity?.letterLogoChoice === 'secondary'
                               ? entity?.secondaryLogoUrl
                               : entity?.primaryLogoUrl) ?? undefined,
      signatoryName:         entity?.signatoryName ?? undefined,
      signatoryTitle:        entity?.signatoryTitle ?? undefined,
      signatorySignatureUrl: entity?.signatorySignatureUrl ?? undefined,
    })

    // ── 2. Durable base64 copy — always written, survives Vercel restarts. ──
    const pdfData = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`

    // ── 3. Best-effort cloud upload. Storage being unconfigured must NOT fail
    //       the whole letter — the base64 copy is the canonical fallback. ──
    let cloudUrl = ''
    try {
      const uploaded = await uploadDocument({
        personId: letter.personId,
        file:     pdfBuffer,
        fileName: `${letter.letterNumber}.pdf`,
        mimeType: 'application/pdf',
      })
      cloudUrl = uploaded.sasUrl ?? ''
    } catch (storageErr) {
      console.info(
        `[letter-pdf] Cloud storage unavailable (${(storageErr as Error).message}). ` +
        'Letter stored as base64 in Neon — durable but not CDN-delivered.',
      )
    }

    await db.transaction(async tx => {
      await tx.update(employeeLetters)
        .set({
          pdfUrl:          cloudUrl,
          pdfData,
          failureReason:   null, // clear any prior failure on success
          status:          'APPROVED',
          generatedAt:     new Date(),
          generatedBy:     actorId,
          updatedBy:       actorId,
          updatedByName:   actorName,
          lastUpdatedDate: new Date(),
        })
        .where(eq(employeeLetters.id, letterId))

      await writeAuditLog({
        actorId,
        actorName,
        actorRole,
        channel:      'WEB',
        eventType:    'LETTER.PDF_GENERATED',
        resourceType: 'employee_letter',
        resourceId:   letterId,
        newValues:    { hasCloudUrl: !!cloudUrl, hasBase64: true },
      }, tx)
    })

    return { success: true }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    // Update letter status to FAILED, persist the real reason, write audit — non-throwing
    try {
      await db.transaction(async tx => {
        await tx.update(employeeLetters)
          .set({
            status:          'FAILED',
            failureReason:   errorMsg.slice(0, 2000),
            updatedBy:       actorId,
            updatedByName:   actorName,
            lastUpdatedDate: new Date(),
          })
          .where(eq(employeeLetters.id, letterId))

        await writeAuditLog({
          actorId,
          actorName,
          actorRole,
          channel:      'WEB',
          eventType:    'LETTER.PDF_GENERATION_FAILED',
          resourceType: 'employee_letter',
          resourceId:   letterId,
          newValues:    { error: errorMsg },
        }, tx)
      })
    } catch {
      // Best-effort audit — swallow secondary failure
    }
    return { success: false, error: errorMsg }
  }
}

// ── Fetch templates for a type (client-callable) ──────────────────────────────

export async function fetchTemplatesForType(typeCode: string) {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const { getTemplatesForType } = await import('./queries')
  return getTemplatesForType(typeCode)
}

// ── Get letter PDF URL (admin access, fresh SAS or existing URL) ──────────────
//
// Used by the admin employee profile Documents tab so HR can view/download
// any letter without routing through the ESS-only download-my API route.
// EMPLOYEE role is not permitted — employees must use /api/employee-letters/download-my.

export async function getLetterDocumentUrl(
  letterId: string,
): Promise<{ url: string; filename: string } | null> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const [letter] = await db
      .select({
        id:           employeeLetters.id,
        personId:     employeeLetters.personId,
        legalEntityId:employeeLetters.legalEntityId,
        typeCode:     employeeLetters.typeCode,
        letterNumber: employeeLetters.letterNumber,
        pdfUrl:       employeeLetters.pdfUrl,
        signedPdfUrl: employeeLetters.signedPdfUrl,
      })
      .from(employeeLetters)
      .where(and(
        eq(employeeLetters.tenantId, TENANT_ID),
        eq(employeeLetters.id, letterId),
      ))
      .limit(1)

    if (!letter) return null

    // Entity-scope guard
    if (
      user.role !== 'SUPER_ADMIN'
      && user.legalEntityId !== letter.legalEntityId
    ) {
      throw new Error('FORBIDDEN: cross-entity letter access denied')
    }

    const effectiveUrl = letter.signedPdfUrl ?? letter.pdfUrl
    if (!effectiveUrl) return null

    const safeRef  = letter.letterNumber.replace(/[^a-zA-Z0-9-]/g, '_')
    const filename = `${letter.typeCode}_${safeRef}.pdf`

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      actorEntityId:letter.legalEntityId,
      channel:      'WEB',
      eventType:    'LETTER.URL_ISSUED',
      resourceType: 'employee_letter',
      resourceId:   letter.id,
      entityId:     letter.legalEntityId,
      metadata:     { purpose: 'admin_view' },
    })

    return { url: effectiveUrl, filename }
  } catch (e) {
    const { translateError } = await import('@/lib/app-error')
    translateError(e, 'getLetterDocumentUrl')
    // translateError always throws — this line is unreachable but satisfies TS
    return null
  }
}
