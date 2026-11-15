'use server'

/**
 * S3-10 — Person dependents (with encrypted EID + passport).
 *
 * BR-INS-004 — max 9 active dependents per employee.
 * BR-INS-005 — child age cap 18 (or 25 if student); enforced at insurance enrolment.
 * Hard Rule 4: emirates_id and passport_number ciphertext only.
 *
 * Insurance auto-enrolment note: dependent is NOT automatically enrolled on add.
 * HR Admin must explicitly enrol via the insurance tab once the visa doc is uploaded.
 * This is intentional: dependent visa upload typically happens after the dependent record
 * is created, and BR-INS-002 blocks enrolment without a visa document.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, count } from 'drizzle-orm'
import { personDependents, persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { encryptNullable } from '@/lib/encryption'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { TENANT_ID } from '@/lib/constants'
import type { ActionMode } from '@/lib/action-mode'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import { AddDependentSchema, type AddDependentInput } from './validations'

export async function addDependent(
  input: AddDependentInput,
  mode: ActionMode = 'UPDATE',
): Promise<{ id: string; dependentNumber: number }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'EMPLOYEE_PROFILE', 'edit')
  if (mode === 'CORRECTION') requireCorrectionModePermission(user.role)
  const data = AddDependentSchema.parse(input)

  let newId = ''
  let depNumber = 0

  await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    // QA-Audit-C2 — entity-scope gate.
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity dependent write denied')
    }

    // BR-INS-004 — max 9 active dependents.
    const [{ activeCount }] = await tx
      .select({ activeCount: count() })
      .from(personDependents)
      .where(and(
        eq(personDependents.tenantId, TENANT_ID),
        eq(personDependents.personId, data.personId),
      ))
    if (Number(activeCount) >= 9) {
      throw new Error('BR-INS-004: maximum 9 dependents per employee')
    }
    depNumber = Number(activeCount) + 1

    // Hard Rule 4 — encrypt before insert.
    const encEid      = encryptNullable(data.emiratesId)
    const encPassport = encryptNullable(data.passportNumber)

    const [row] = await tx
      .insert(personDependents)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        dependentNumber: depNumber,
        relationship:    data.relationship,
        firstNameEn:     data.firstNameEn,
        middleNameEn:    data.middleNameEn,
        lastNameEn:      data.lastNameEn,
        fullNameAr:      data.fullNameAr,
        dateOfBirth:     data.dateOfBirth,
        gender:          data.gender,
        nationalityCode: data.nationalityCode,
        emiratesId:        encEid,
        emiratesIdExpiry:  data.emiratesIdExpiry,
        passportNumber:    encPassport,
        passportCountry:   data.passportCountry,
        passportExpiry:    data.passportExpiry,
        effectiveFrom:   data.effectiveFrom,
        approvalStatus:  'PENDING',
        actionMode:      mode,
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: personDependents.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: person.legalEntityId,
      channel:       'WEB',
      eventType:     'DEPENDENT.ADDED',
      resourceType:  'person_dependents',
      resourceId:    newId,
      entityId:      person.legalEntityId,
      actionMode:    mode,
      newValues: {
        personId: data.personId,
        relationship: data.relationship,
        dependentNumber: depNumber,
        piiFields: [
          data.emiratesId      ? 'emiratesId'      : null,
          data.passportNumber  ? 'passportNumber'  : null,
        ].filter(Boolean),
      },
    }, tx)
  })

  return { id: newId, dependentNumber: depNumber }
  } catch (e) { translateError(e, 'addDependent') }
}
