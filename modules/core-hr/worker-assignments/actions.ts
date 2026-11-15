'use server'

/**
 * S3-05 — Worker assignment Server Actions.
 *
 * Worker assignments are EFFECTIVE-DATED (Hard Rule 3). When any of
 * (department, position, job, grade, location, manager, employment_type,
 * work_schedule) changes, we close the current row (effective_end_date =
 * effectiveDate - 1; is_current=false) and insert a new one starting on
 * effectiveDate. The full history is preserved forever.
 *
 * QA-Audit-C3 — actual DB work lives in ./services.ts (tx-aware helpers)
 * so employment-actions can reuse them inside a single transaction.
 */
import { translateError } from '@/lib/app-error'
import { eq } from 'drizzle-orm'
import { persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { TENANT_ID } from '@/lib/constants'
import {
  CreateWorkerAssignmentSchema, ChangeWorkerAssignmentSchema,
  type CreateWorkerAssignmentInput, type ChangeWorkerAssignmentInput,
} from './validations'
import { createAssignmentTx, changeAssignmentTx } from './services'

// ══════════════════════════════════════════════════════════════════════════
// 1 — createWorkerAssignment (used at hire — no current row exists)
// ══════════════════════════════════════════════════════════════════════════

export async function createWorkerAssignment(
  input: CreateWorkerAssignmentInput,
): Promise<{ id: string; assignmentNumber: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'create')
  const data = CreateWorkerAssignmentSchema.parse(input)

  return await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity assignment not allowed')
    }

    return createAssignmentTx(tx, {
      id:            user.id,
      name:          user.name,
      role:          user.role,
      personId:      user.personId,
      legalEntityId: user.legalEntityId,
    }, data)
  })
  } catch (e) { translateError(e, 'createWorkerAssignment') }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — changeWorkerAssignment (close-current + open-new — effective-dated)
// ══════════════════════════════════════════════════════════════════════════

export async function changeWorkerAssignment(
  input: ChangeWorkerAssignmentInput,
): Promise<{ closedId: string | null; newId: string; newAssignmentNumber: string | null }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'edit')
  const data = ChangeWorkerAssignmentSchema.parse(input)

  return await db.transaction(async tx => {
    const [person] = await tx
      .select({ legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity change not allowed')
    }

    const result = await changeAssignmentTx(tx, {
      id:            user.id,
      name:          user.name,
      role:          user.role,
      personId:      user.personId,
      legalEntityId: user.legalEntityId,
    }, data)

    return {
      closedId:            result.mode === 'UPDATE' ? result.closedId : null,
      newId:               result.mode === 'UPDATE' ? result.newId : result.mode === 'FUTURE_DATED' ? result.futureId : result.correctedId,
      newAssignmentNumber: result.mode === 'UPDATE' ? result.newAssignmentNumber : result.mode === 'FUTURE_DATED' ? result.futureAssignmentNumber : null,
    }
  })
  } catch (e) { translateError(e, 'changeWorkerAssignment') }
}
