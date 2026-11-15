import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { employeeLetters, legalEntities, persons, letterTemplateTypes } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { generateLetterPdf, formatLetterDate } from '@/modules/employee-letters/generate-pdf'
import { writeAuditLog } from '@/lib/audit'
import { uploadDocument } from '@/lib/blob-storage'
import path from 'path'
import fs   from 'fs'

const TYPE_LABELS: Record<string, string> = {
  PCL: 'Probation_Confirmation_Letter',
  EML: 'Employment_Letter',
  PML: 'Promotion_Letter',
  DCL: 'Designation_Change_Letter',
  SAL: 'Salary_Amendment_Letter',
  SC:  'Salary_Certificate',
  STL: 'Salary_Transfer_Letter',
  TER: 'Termination_Letter',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const letterId = req.nextUrl.searchParams.get('id')
  if (!letterId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Load letter
  const [letter] = await db
    .select()
    .from(employeeLetters)
    .where(and(eq(employeeLetters.tenantId, TENANT_ID), eq(employeeLetters.id, letterId)))
    .limit(1)
  if (!letter) return NextResponse.json({ error: 'Letter not found' }, { status: 404 })

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

  // Build filename: <TypeLabel>_<EmployeeName>_<LetterNumber>.pdf
  const typeLabel  = TYPE_LABELS[letter.typeCode] ?? letter.typeCode.replace(/[^a-zA-Z0-9]/g, '_')
  const safeName   = (person?.fullNameEn ?? 'Employee').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
  const safeRef    = letter.letterNumber.replace(/[^a-zA-Z0-9-]/g, '_')
  const filename   = `${typeLabel}_${safeName}_${safeRef}.pdf`

  let pdfBytes: Buffer

  // Prefer cloud URL, then durable base64 fallback (migration 0053).
  // Treat empty string (unconfigured cloud storage) as absent.
  const existingPdf = (letter.pdfUrl || null) ?? (letter.pdfData || null)
  if (existingPdf) {
    pdfBytes = await fetchPdfBytes(existingPdf)
  } else {
    // Generate fresh PDF
    if (!letter.resolvedBodyEn) {
      return NextResponse.json({ error: 'Letter body not resolved — regenerate first' }, { status: 400 })
    }

    const lang = (letter.language ?? 'en') as 'en' | 'ar' | 'both'

    pdfBytes = await generateLetterPdf({
      letterNumber:          letter.letterNumber,
      letterDate:            formatLetterDate(letter.effectiveDate ?? new Date()),
      resolvedBodyEn:        letter.resolvedBodyEn,
      resolvedBodyAr:        letter.resolvedBodyAr ?? undefined,
      language:              lang,
      companyNameEn:         entity?.nameEn ?? '',
      primaryLogoUrl:        (entity?.letterLogoChoice === 'secondary'
                               ? entity?.secondaryLogoUrl
                               : entity?.primaryLogoUrl) ?? undefined,
      footerImageUrl:        entity?.footerImageUrl ?? undefined,
      signatoryName:         entity?.signatoryName ?? undefined,
      signatoryTitle:        entity?.signatoryTitle ?? undefined,
      signatorySignatureUrl: entity?.signatorySignatureUrl ?? undefined,
    })

    // Persist the generated PDF — base64 fallback always; cloud URL best-effort.
    const pdfData = `data:application/pdf;base64,${pdfBytes.toString('base64')}`
    try {
      let cloudUrl = ''
      try {
        const uploaded = await uploadDocument({
          personId: letter.personId,
          file:     pdfBytes,
          fileName: `${letter.letterNumber}.pdf`,
          mimeType: 'application/pdf',
        })
        cloudUrl = uploaded.sasUrl ?? ''
      } catch { /* cloud unconfigured — base64 is the durable copy */ }

      await db.update(employeeLetters)
        .set({
          pdfUrl:          cloudUrl,
          pdfData,
          failureReason:   null,
          status:          'APPROVED',
          updatedBy:       session.user.id,
          updatedByName:   session.user.name ?? '',
          lastUpdatedDate: new Date(),
        })
        .where(eq(employeeLetters.id, letterId))

      await writeAuditLog({
        actorId:      session.user.id,
        actorName:    session.user.name ?? '',
        actorRole:    session.user.role,
        channel:      'WEB',
        eventType:    'LETTER.PDF_DOWNLOADED',
        resourceType: 'employee_letter',
        resourceId:   letterId,
        newValues:    { filename },
      })
    } catch {
      // Non-fatal — we still return the PDF bytes
    }
  }

  // ?mode=view → inline browser display; default → force download
  const mode        = req.nextUrl.searchParams.get('mode') ?? 'download'
  const disposition = mode === 'view'
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`

  return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': disposition,
      'Content-Length':      String(pdfBytes.length),
      'Cache-Control':       'no-store',
    },
  })
}

async function fetchPdfBytes(pdfUrl: string): Promise<Buffer> {
  // Durable base64 data URL (migration 0053) — decode directly.
  if (pdfUrl.startsWith('data:')) {
    const base64 = pdfUrl.slice(pdfUrl.indexOf(',') + 1)
    return Buffer.from(base64, 'base64')
  }
  // Dev: root-relative path written to public/
  if (pdfUrl.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', pdfUrl)
    try {
      return fs.readFileSync(filePath)
    } catch {
      throw new Error(`Dev PDF not found on disk: ${filePath}`)
    }
  }
  // Legacy stub (old dev URLs before this fix)
  if (pdfUrl.startsWith('local://')) {
    const storageKey = pdfUrl.replace('local://stub/', '').split('?')[0]
    const filePath   = path.join(process.cwd(), 'public', 'uploads', storageKey)
    try {
      return fs.readFileSync(filePath)
    } catch {
      throw new Error('Dev PDF stub not found — please regenerate the letter')
    }
  }
  // Prod: Azure SAS URL
  const resp = await fetch(pdfUrl)
  if (!resp.ok) throw new Error(`Failed to fetch PDF: ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}
