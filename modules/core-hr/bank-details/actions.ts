'use server'

/**
 * S3-10 — Bank-details Server Actions with IBAN encryption.
 *
 * BR-WPS-004: UAE IBAN must be 23 chars starting with AE.
 * Hard Rule 4: IBAN ciphertext is the only thing persisted; the plaintext
 *              never lives outside this stack frame.
 * Hard Rule 3: closing a bank-details row uses effective-date close +
 *              insert (never DELETE).
 */
import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import { personBankDetails, persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { encrypt, decryptNullable } from '@/lib/encryption'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { addDays } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import type { ActionMode } from '@/lib/action-mode'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import { assertUaeIbanFormat, maskTail } from '../services'
import { CreateBankDetailsSchema, type CreateBankDetailsInput } from './validations'

export async function createBankDetails(
  input: CreateBankDetailsInput,
  mode: ActionMode = 'UPDATE',
  correctionNote?: string,
): Promise<{ id: string }> {
  try {
  if (mode === 'CORRECTION' && !correctionNote?.trim()) {
    throw new Error('CORRECTION mode requires a non-empty correctionNote')
  }
  const user = await requireRole(['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'EMPLOYEE_PROFILE', 'edit')
  // CORRECTION mode is restricted to HR_DIRECTOR / SUPER_ADMIN.
  if (mode === 'CORRECTION') requireCorrectionModePermission(user.role)

  const data = CreateBankDetailsSchema.parse(input)
  assertUaeIbanFormat(data.iban)

  let resultId = ''

  await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity bank-details write denied')
    }

    const ibanCiphertext = encrypt(data.iban)

    if (mode === 'CORRECTION') {
      // ── CORRECTION: update existing primary row in-place; no new history row ──
      // Read the current primary row so we can audit masked before/after IBAN.
      const [existing] = await tx
        .select({ id: personBankDetails.id, iban: personBankDetails.iban,
                  bankName: personBankDetails.bankName, bankCode: personBankDetails.bankCode })
        .from(personBankDetails)
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          eq(personBankDetails.personId, data.personId),
          eq(personBankDetails.isPrimary, true),
        ))
        .limit(1)
      if (!existing) throw new Error('no active bank-details record to correct')

      await tx
        .update(personBankDetails)
        .set({
          bankName:        data.bankName,
          bankCode:        data.bankCode,
          iban:            ibanCiphertext,
          accountName:     data.accountName,
          accountType:     data.accountType,
          currency:        data.currency,
          isWpsAccount:    data.isWpsAccount,
          actionMode:      'CORRECTION',
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(personBankDetails.id, existing.id))
      resultId = existing.id

      const oldIbanMasked = maskTail(decryptNullable(existing.iban), 4)
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: person.legalEntityId,
        channel: 'WEB',
        eventType: 'BANK_DETAILS.CORRECTED',
        resourceType: 'person_bank_details',
        resourceId: resultId,
        entityId: person.legalEntityId,
        actionMode: 'CORRECTION',
        oldValues: { bankName: existing.bankName, bankCode: existing.bankCode, ibanMasked: oldIbanMasked },
        newValues: { bankName: data.bankName, bankCode: data.bankCode,
                     ibanMasked: maskTail(data.iban, 4), isWpsAccount: data.isWpsAccount },
        metadata: { correctionNote },
      }, tx)

    } else {
      // ── UPDATE: close current primary row, insert new effective-dated row ─────
      const closeDate = addDays(data.effectiveFrom, -1)
      await tx
        .update(personBankDetails)
        .set({
          effectiveTo: closeDate, isPrimary: false,
          updatedBy: user.id, updatedByName: user.name,
          updatedDate: new Date(), lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          eq(personBankDetails.personId, data.personId),
          eq(personBankDetails.isPrimary, true),
        ))

      const [row] = await tx
        .insert(personBankDetails)
        .values({
          tenantId: TENANT_ID, personId: data.personId,
          bankName: data.bankName, bankCode: data.bankCode,
          iban: ibanCiphertext, accountName: data.accountName,
          accountType: data.accountType, currency: data.currency,
          isPrimary: true, isWpsAccount: data.isWpsAccount,
          effectiveFrom: data.effectiveFrom, effectiveTo: null,
          actionMode: 'UPDATE',
          createdBy: user.id, createdByName: user.name,
        })
        .returning({ id: personBankDetails.id })
      resultId = row.id

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: person.legalEntityId,
        channel: 'WEB', eventType: 'BANK_DETAILS.CREATED',
        resourceType: 'person_bank_details', resourceId: resultId,
        entityId: person.legalEntityId, actionMode: 'UPDATE',
        newValues: { personId: data.personId, bankName: data.bankName, bankCode: data.bankCode,
                     ibanMasked: maskTail(data.iban, 4), isWpsAccount: data.isWpsAccount,
                     effectiveFrom: data.effectiveFrom },
      }, tx)
    }
  })

  return { id: resultId }
  } catch (e) { translateError(e, 'createBankDetails') }
}

/**
 * Returns the active bank record for a person with the IBAN either
 * decrypted (PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN) or masked. HR_ADMIN
 * sees the masked form by default — matches Security spec §2.3.
 */
export async function getBankDetails(personId: string): Promise<{
  id:           string | null
  bankName:     string | null
  bankCode:     string | null
  iban:         string | null
  ibanMasked:   boolean
  accountName:  string | null
  isWpsAccount: boolean
} | null> {
  try {
  const user = await requireRole([
    'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'EMPLOYEE',
  ])
  await requirePermission(user, 'EMPLOYEE_PROFILE', 'view')

  const [row] = await db
    .select()
    .from(personBankDetails)
    .where(and(
      eq(personBankDetails.tenantId, TENANT_ID),
      eq(personBankDetails.personId, personId),
      eq(personBankDetails.isPrimary, true),
    ))
    .limit(1)
  if (!row) return null

  // QA-Audit-C2 — entity scope: caller must share the person's legal entity.
  const [person] = await db
    .select({ legalEntityId: persons.legalEntityId })
    .from(persons).where(eq(persons.id, personId)).limit(1)
  if (!person) return null
  const isSelf = user.personId === personId
  if (
    user.role !== 'SUPER_ADMIN'
    && !isSelf
    && user.legalEntityId !== person.legalEntityId
  ) {
    throw new Error('FORBIDDEN: cross-entity bank-details read denied')
  }
  // EMPLOYEE may only read their own — same gate as getPerson.
  if (user.role === 'EMPLOYEE' && !isSelf) {
    throw new Error('FORBIDDEN: employees may only read their own bank details')
  }

  // PII reveal: PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN, or self.
  const fullPii = ['PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)
                || isSelf
  const plaintextIban = decryptNullable(row.iban)

  if (fullPii) {
    try {
      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: person.legalEntityId,
        channel:       'WEB',
        eventType:     'BANK_DETAILS.IBAN_VIEWED',
        resourceType:  'person_bank_details',
        resourceId:    row.id,
        metadata:      { unmasked: true },
      })
    } catch (err) {
      console.error('[bank-details] audit failed:', err)
    }
  }

  return {
    id:           row.id,
    bankName:     row.bankName,
    bankCode:     row.bankCode,
    iban:         fullPii ? plaintextIban : maskTail(plaintextIban, 4),
    ibanMasked:   !fullPii,
    accountName:  row.accountName,
    isWpsAccount: row.isWpsAccount,
  }
  } catch (e) { translateError(e, 'getBankDetails') }
}
