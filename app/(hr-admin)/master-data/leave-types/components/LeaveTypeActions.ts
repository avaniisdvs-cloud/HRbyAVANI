'use server'

import { db } from '@/lib/db'
import { absenceTypes } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'

// ── Zod schema ───────────────────────────────────────────────────────────────

const leaveTypeSchema = z.object({
  legalEntityId:          z.string().uuid().optional().nullable(),
  typeCode:               z.string().min(1, 'Type code is required').max(30).transform(v => v.toUpperCase()),
  typeNameEn:             z.string().min(1, 'English name is required').max(200),
  typeNameAr:             z.string().max(200).default(''),
  isStatutory:            z.boolean().default(false),
  isPaid:                 z.enum(['FULL_PAY', 'HALF_PAY', 'NO_PAY', 'TIERED'], { required_error: 'Pay type is required' }),
  maxDaysPerYear:         z.coerce.number().positive().optional().nullable(),
  maxConsecutiveDays:     z.coerce.number().positive().optional().nullable(),
  minServiceMonths:       z.coerce.number().int().min(0).default(0),
  minNoticeDays:          z.coerce.number().int().min(0).default(0),
  requiresMedicalCert:    z.boolean().default(false),
  certRequiredAfterDays:  z.coerce.number().int().positive().optional().nullable(),
  genderRestriction:      z.string().max(10).optional().nullable(),
  religionRestriction:    z.string().max(30).optional().nullable(),
  approvalRequired:       z.boolean().default(true),
  isOneTimePerEmployment: z.boolean().default(false),
  payrollElementCode:     z.string().max(50).optional().nullable(),
})

type LeaveTypeInput = z.infer<typeof leaveTypeSchema>

function parseLeaveTypeForm(fd: FormData): LeaveTypeInput {
  return leaveTypeSchema.parse({
    legalEntityId:          fd.get('legalEntityId') || null,
    typeCode:               fd.get('typeCode'),
    typeNameEn:             fd.get('typeNameEn'),
    typeNameAr:             fd.get('typeNameAr'),
    isStatutory:            fd.get('isStatutory') === 'true',
    isPaid:                 fd.get('isPaid'),
    maxDaysPerYear:         fd.get('maxDaysPerYear') ? Number(fd.get('maxDaysPerYear')) : null,
    maxConsecutiveDays:     fd.get('maxConsecutiveDays') ? Number(fd.get('maxConsecutiveDays')) : null,
    minServiceMonths:       fd.get('minServiceMonths') ?? '0',
    minNoticeDays:          fd.get('minNoticeDays') ?? '0',
    requiresMedicalCert:    fd.get('requiresMedicalCert') === 'true',
    certRequiredAfterDays:  fd.get('certRequiredAfterDays') ? Number(fd.get('certRequiredAfterDays')) : null,
    genderRestriction:      fd.get('genderRestriction') || null,
    religionRestriction:    fd.get('religionRestriction') || null,
    approvalRequired:       fd.get('approvalRequired') === 'true',
    isOneTimePerEmployment: fd.get('isOneTimePerEmployment') === 'true',
    payrollElementCode:     fd.get('payrollElementCode') || null,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertCodeUnique(typeCode: string, excludeId?: string): Promise<void> {
  const existing = await db
    .select({ id: absenceTypes.id })
    .from(absenceTypes)
    .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.typeCode, typeCode)))
    .limit(1)

  const conflict = existing.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error(`Leave type code "${typeCode}" already exists.`)
  }
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function createLeaveType(fd: FormData): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseLeaveTypeForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.typeNameAr) {
      input.typeNameAr = (await translateToArabic(input.typeNameEn)) ?? ''
    }

    await assertCodeUnique(input.typeCode)

    const [row] = await db
      .insert(absenceTypes)
      .values({
        tenantId:               TENANT_ID,
        legalEntityId:          input.legalEntityId ?? null,
        typeCode:               input.typeCode,
        typeNameEn:             input.typeNameEn,
        typeNameAr:             input.typeNameAr,
        isStatutory:            input.isStatutory,
        isPaid:                 input.isPaid,
        maxDaysPerYear:         input.maxDaysPerYear != null ? String(input.maxDaysPerYear) : null,
        maxConsecutiveDays:     input.maxConsecutiveDays != null ? String(input.maxConsecutiveDays) : null,
        minServiceMonths:       input.minServiceMonths,
        minNoticeDays:          input.minNoticeDays,
        requiresMedicalCert:    input.requiresMedicalCert,
        certRequiredAfterDays:  input.certRequiredAfterDays ?? null,
        genderRestriction:      input.genderRestriction ?? null,
        religionRestriction:    input.religionRestriction ?? null,
        approvalRequired:       input.approvalRequired,
        isOneTimePerEmployment: input.isOneTimePerEmployment,
        payrollElementCode:     input.payrollElementCode ?? null,
        isActive:               true,
        createdBy:              actor.id,
        createdByName:          actor.name,
      })
      .returning({ id: absenceTypes.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_TYPE_CREATED',
      resourceType:  'absence_types',
      resourceId:    row.id,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Leave type ${input.typeCode} (${input.typeNameEn}) created`,
    })

    revalidatePath('/master-data/leave-types')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'createLeaveType') }
  }
}

export async function updateLeaveType(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseLeaveTypeForm(fd)

    await assertCodeUnique(input.typeCode, id)

    const [before] = await db
      .select()
      .from(absenceTypes)
      .where(eq(absenceTypes.id, id))
      .limit(1)

    if (!before) throw new Error('Leave type not found.')

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.typeNameAr || input.typeNameEn !== before.typeNameEn) {
      input.typeNameAr = (await translateToArabic(input.typeNameEn)) ?? input.typeNameAr ?? ''
    }

    await db
      .update(absenceTypes)
      .set({
        legalEntityId:          input.legalEntityId ?? null,
        typeNameEn:             input.typeNameEn,
        typeNameAr:             input.typeNameAr,
        isStatutory:            input.isStatutory,
        isPaid:                 input.isPaid,
        maxDaysPerYear:         input.maxDaysPerYear != null ? String(input.maxDaysPerYear) : null,
        maxConsecutiveDays:     input.maxConsecutiveDays != null ? String(input.maxConsecutiveDays) : null,
        minServiceMonths:       input.minServiceMonths,
        minNoticeDays:          input.minNoticeDays,
        requiresMedicalCert:    input.requiresMedicalCert,
        certRequiredAfterDays:  input.certRequiredAfterDays ?? null,
        genderRestriction:      input.genderRestriction ?? null,
        religionRestriction:    input.religionRestriction ?? null,
        approvalRequired:       input.approvalRequired,
        isOneTimePerEmployment: input.isOneTimePerEmployment,
        payrollElementCode:     input.payrollElementCode ?? null,
        updatedBy:              actor.id,
        updatedByName:          actor.name,
        lastUpdatedDate:        new Date(),
      })
      .where(eq(absenceTypes.id, id))

    const afterValues = input as unknown as Record<string, unknown>
    const beforeValues = before as unknown as Record<string, unknown>

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_TYPE_UPDATED',
      resourceType:  'absence_types',
      resourceId:    id,
      oldValues:     beforeValues,
      newValues:     afterValues,
      changedFields: diffFields(beforeValues, afterValues),
      metadata:      { changeReason, resourceName: before.typeNameEn, resourceNameAr: before.typeNameAr },
      description:   `Leave type ${input.typeCode} updated: ${changeReason}`,
    })

    revalidatePath('/master-data/leave-types')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'updateLeaveType') }
  }
}

export async function disableLeaveType(
  id: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [record] = await db
      .select({ typeCode: absenceTypes.typeCode, typeNameEn: absenceTypes.typeNameEn, isStatutory: absenceTypes.isStatutory })
      .from(absenceTypes)
      .where(eq(absenceTypes.id, id))
      .limit(1)

    if (!record) throw new Error('Leave type not found.')
    if (record.isStatutory) {
      throw new Error('BR-LV-006: Statutory leave types cannot be disabled.')
    }

    await db
      .update(absenceTypes)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(absenceTypes.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_TYPE_DISABLED',
      resourceType:  'absence_types',
      resourceId:    id,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Leave type ${record.typeCode} disabled: ${reason}`,
    })

    revalidatePath('/master-data/leave-types')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'disableLeaveType') }
  }
}

export async function enableLeaveType(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [record] = await db
      .select({ typeCode: absenceTypes.typeCode })
      .from(absenceTypes)
      .where(eq(absenceTypes.id, id))
      .limit(1)

    if (!record) throw new Error('Leave type not found.')

    await db
      .update(absenceTypes)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(absenceTypes.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_TYPE_ENABLED',
      resourceType:  'absence_types',
      resourceId:    id,
      newValues:     { isActive: true },
      description:   `Leave type ${record.typeCode} re-enabled`,
    })

    revalidatePath('/master-data/leave-types')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'enableLeaveType') }
  }
}
