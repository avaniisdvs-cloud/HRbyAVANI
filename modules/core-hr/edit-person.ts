'use server'

/**
 * edit-person — dedicated server action for the Edit Person form.
 *
 * Follows the four-step contract:
 *   1. requireRole(...)               — auth + RBAC
 *   2. EditPersonSchema.parse(input)  — Zod validation
 *   3. db.transaction(async tx => ...)
 *   4. writeAuditLog inside the same transaction (Hard Rule 1)
 *
 * PII: emiratesId and passportNumber are encrypted before storage (Hard Rule 4).
 * NEVER delete persons (Hard Rule 3 — not applicable here, but noted).
 */

import { translateError } from '@/lib/app-error'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { encryptNullable } from '@/lib/encryption'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import {
  normalizeEmiratesId,
  EMIRATES_ID_REGEX,
  getAssignmentSensitiveUpdateFields,
} from './validations'

// ══════════════════════════════════════════════════════════════════════════
// Zod schema — field names match drizzle column camelCase exactly.
// All fields are optional; only supplied fields are written to DB.
// ══════════════════════════════════════════════════════════════════════════

const EditPersonSchema = z.object({
  // Identity — names
  firstNameEn:       z.string().min(1).max(100).optional(),
  lastNameEn:        z.string().min(1).max(100).optional(),
  fullNameEn:        z.string().min(1).max(200).optional(),
  fullNameAr:        z.string().max(200).optional(),
  preferredName:     z.string().max(100).optional(),

  // Personal details
  dateOfBirth:       z.string().optional(),   // ISO date string 'YYYY-MM-DD'
  gender:            z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  maritalStatus:     z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  nationalityCode:   z.string().length(3).optional(),  // ISO 3166-1 alpha-3 (e.g. ARE, GBR)

  // PII — encrypted before storage
  emiratesId:        z.string().regex(EMIRATES_ID_REGEX, 'BR-EID-001 format 784-XXXX-XXXXXXX-X').optional().nullable(),
  emiratesIdExpiry:  z.string().optional().nullable(),  // ISO date string
  passportNumber:    z.string().max(20).optional().nullable(),
  passportExpiry:    z.string().optional().nullable(),  // ISO date string

  // Visa / labour card
  visaNumber:           z.string().max(30).optional().nullable(),
  visaExpiry:           z.string().optional().nullable(),
  labourCardNumber:     z.string().max(30).optional().nullable(),
  labourCardExpiry:     z.string().optional().nullable(),

  // Assignment snapshot (denormalised on persons row)
  assignmentStatus:     z.string().optional(),
  currentDepartmentId:  z.string().uuid().optional().nullable(),
  currentPositionId:    z.string().uuid().optional().nullable(),
  currentGradeId:       z.string().uuid().optional().nullable(),
  currentLocationId:    z.string().uuid().optional().nullable(),
  lineManagerId:        z.string().uuid().optional().nullable(),
  // Task 2C — employment classification fields
  workerCategory:          z.enum(['FTE', 'CONTINGENT', 'CONTRACTOR']).optional().nullable(),
  employeeCode:            z.string().trim().max(50).optional().nullable(),
  currentJobId:            z.string().uuid().optional().nullable(),
  dottedLineManagerId:     z.string().uuid().optional().nullable(),
  noticePeriodDays:        z.number().int().min(0).max(180).optional(),
  probationMonthsGranted:  z.number().int().min(1).max(6).optional().nullable(),
})

export type EditPersonInput = z.infer<typeof EditPersonSchema>

// ══════════════════════════════════════════════════════════════════════════
// Result type
// ══════════════════════════════════════════════════════════════════════════

export type EditPersonResult =
  | { success: true;  personId: string }
  | { success: false; error: string }

// ══════════════════════════════════════════════════════════════════════════
// Server action
// ══════════════════════════════════════════════════════════════════════════

export async function updatePersonFromEdit(
  personId: string,
  rawInput: EditPersonInput,
): Promise<EditPersonResult> {
  try {
  // Step 1 — Auth + RBAC (must be first, before any DB op).
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'FORBIDDEN' }
  }

  // Step 2 — Zod validation.
  const parsed = EditPersonSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
    }
  }
  const data = parsed.data
  const assignmentFields = getAssignmentSensitiveUpdateFields(data as Record<string, unknown>)
  if (assignmentFields.length > 0) {
    return {
      success: false,
      error: `ASSIGNMENT_CHANGE_REQUIRES_LIFECYCLE: ${assignmentFields.join(', ')} must be changed through an effective-dated employment action.`,
    }
  }

  // Guard: nothing to update.
  if (Object.keys(data).length === 0) {
    return { success: false, error: 'No fields supplied for update' }
  }

  try {
    await db.transaction(async tx => {
      // Step 3 — Build update payload from only the supplied fields.
      // We never overwrite missing fields with undefined/null accidentally.
      const payload: Record<string, unknown> = {}

      if (data.firstNameEn      !== undefined) payload.firstNameEn      = data.firstNameEn
      if (data.lastNameEn       !== undefined) payload.lastNameEn       = data.lastNameEn
      if (data.fullNameEn       !== undefined) payload.fullNameEn       = data.fullNameEn
      if (data.fullNameAr       !== undefined) payload.fullNameAr       = data.fullNameAr
      if (data.preferredName    !== undefined) payload.preferredName    = data.preferredName
      if (data.dateOfBirth      !== undefined) payload.dateOfBirth      = data.dateOfBirth
      if (data.gender           !== undefined) payload.gender           = data.gender
      if (data.maritalStatus    !== undefined) payload.maritalStatus    = data.maritalStatus
      if (data.nationalityCode  !== undefined) payload.nationalityCode  = data.nationalityCode

      // PII — normalized then encrypted (Hard Rule 4).
      // QA-Audit-M7: normalize EID to canonical dashed form before encrypt.
      if (data.emiratesId !== undefined) {
        payload.emiratesId = encryptNullable(
          data.emiratesId ? normalizeEmiratesId(data.emiratesId) : data.emiratesId,
        )
      }
      if (data.emiratesIdExpiry !== undefined) payload.emiratesIdExpiry = data.emiratesIdExpiry
      if (data.passportNumber   !== undefined) payload.passportNumber   = encryptNullable(data.passportNumber)
      if (data.passportExpiry   !== undefined) payload.passportExpiry   = data.passportExpiry

      if (data.visaNumber         !== undefined) payload.visaNumber         = data.visaNumber
      if (data.visaExpiry         !== undefined) payload.visaExpiry         = data.visaExpiry
      if (data.labourCardNumber   !== undefined) payload.labourCardNumber   = data.labourCardNumber
      if (data.labourCardExpiry   !== undefined) payload.labourCardExpiry   = data.labourCardExpiry

      if (data.assignmentStatus    !== undefined) payload.assignmentStatus    = data.assignmentStatus
      if (data.currentDepartmentId !== undefined) payload.currentDepartmentId = data.currentDepartmentId
      if (data.currentPositionId   !== undefined) payload.currentPositionId   = data.currentPositionId
      if (data.currentGradeId      !== undefined) payload.currentGradeId      = data.currentGradeId
      if (data.currentLocationId   !== undefined) payload.currentLocationId   = data.currentLocationId
      if (data.lineManagerId       !== undefined) payload.lineManagerId       = data.lineManagerId
      // Task 2C — employment classification fields
      if (data.workerCategory         !== undefined) payload.workerCategory         = data.workerCategory
      if (data.employeeCode           !== undefined) payload.employeeCode           = data.employeeCode
      if (data.currentJobId           !== undefined) payload.currentJobId           = data.currentJobId
      if (data.dottedLineManagerId    !== undefined) payload.dottedLineManagerId    = data.dottedLineManagerId
      if (data.noticePeriodDays       !== undefined) payload.noticePeriodDays       = data.noticePeriodDays
      if (data.probationMonthsGranted !== undefined) payload.probationMonthsGranted = data.probationMonthsGranted

      // WHO columns — always touch on any write.
      payload.updatedBy     = user.id
      payload.updatedByName = user.name ?? user.id
      payload.updatedDate   = new Date()

      await tx
        .update(persons)
        .set(payload)
        .where(and(eq(persons.id, personId), eq(persons.tenantId, TENANT_ID)))

      // Step 4 — Audit row in the SAME transaction (Hard Rule 1).
      // NEVER write decrypted PII to audit_log — record only the field names touched.
      const touchedFields = Object.keys(data)
      const piiTouched = touchedFields.filter(f => ['emiratesId', 'passportNumber'].includes(f))
      const nonPiiChanged = touchedFields.filter(f => !['emiratesId', 'passportNumber'].includes(f))

      await writeAuditLog(
        {
          actorId:   user.id,
          actorName: user.name,
          actorRole: user.role,
          channel:   'WEB',
          eventType: 'PERSON.UPDATED',
          resourceType: 'persons',
          resourceId:   personId,
          changedFields: touchedFields,
          newValues: {
            // Safe non-PII fields only.
            ...Object.fromEntries(
              nonPiiChanged.map(f => [f, (data as Record<string, unknown>)[f]]),
            ),
            // Mark which PII fields were touched without storing their values.
            ...(piiTouched.length > 0 ? { piiFieldsTouched: piiTouched } : {}),
          },
          description: `Person record updated (${touchedFields.length} field(s) changed)`,
        },
        tx,
      )
    })

    return { success: true, personId }
  } catch (err) {
    console.error('[edit-person] updatePersonFromEdit error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error during person update',
    }
  }
  } catch (e) { translateError(e, 'updatePersonFromEdit') }
}
