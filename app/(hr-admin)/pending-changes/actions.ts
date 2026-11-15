'use server'

/**
 * Phase 5 — Future-Dated Changes dashboard actions.
 *
 * getPendingFutureChanges()     — read-only query for HR_ADMIN+
 * cancelFutureDatedChange()     — mutation for HR_DIRECTOR / SUPER_ADMIN only
 *
 * Every query is scoped to TENANT_ID.
 * Every mutation writes an audit row in the same transaction.
 */

import { revalidatePath } from 'next/cache'
import { and, asc, eq, gt, gte, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  workerAssignments,
  leavePlanEnrolments,
  workScheduleAssignments,
  payrollAssignments,
  salaryElements,
  contracts,
  persons,
  departments,
  absencePlans,
} from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
// Imported from the services file directly (not the module barrel): these are
// db-bound tx helpers, and exporting them from the barrel pulls the postgres
// driver into client bundles that import the barrel's Server Actions.
import {
  lockWorkerAssignmentTimelineTx,
  recomputeCurrentWorkerAssignmentPointerTx,
} from '@/modules/core-hr/worker-assignments/services'

const CancelSchema = z.object({
  changeType: z.enum(['ASSIGNMENT', 'LEAVE_PLAN', 'WORK_SCHEDULE', 'PAYROLL', 'SALARY', 'CONTRACT']),
  id:         z.string().uuid('id must be a valid UUID'),
})

// ── Return type ───────────────────────────────────────────────────────────────

export interface PendingChange {
  id:            string
  changeType:    'ASSIGNMENT' | 'LEAVE_PLAN' | 'WORK_SCHEDULE' | 'PAYROLL' | 'SALARY' | 'CONTRACT'
  personId:      string
  personName:    string
  personNumber:  string
  effectiveDate: string
  description:   string
  isCurrent:     boolean
  canCancel:     boolean
}

// ── Helper — today as ISO date string ────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isPendingEffectiveDatedRow(input: {
  effectiveStartDate: string
  effectiveEndDate?: string | null
  today: string
  isCurrent?: boolean
}): boolean {
  if (input.isCurrent === false) return false

  const effectiveEndDate = input.effectiveEndDate ?? EFFECTIVE_END_OF_TIME

  return (
    input.effectiveStartDate > input.today &&
    effectiveEndDate >= input.effectiveStartDate
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// READ — getPendingFutureChanges
// ══════════════════════════════════════════════════════════════════════════════

export async function getPendingFutureChanges(): Promise<PendingChange[]> {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const today = todayIso()
  const results: PendingChange[] = []

  // ── 1. Worker Assignments ─────────────────────────────────────────────────
  const assignments = await db
    .select({
      id:               workerAssignments.id,
      personId:         workerAssignments.personId,
      effectiveStartDate: workerAssignments.effectiveStartDate,
      assignmentStatus: workerAssignments.assignmentStatus,
      effectiveEndDate:   workerAssignments.effectiveEndDate,
      isCurrent:        workerAssignments.isCurrent,
      departmentNameEn: departments.nameEn,
      fullNameEn:       persons.fullNameEn,
      personNumber:     persons.personNumber,
    })
    .from(workerAssignments)
    .leftJoin(persons,     and(
      eq(workerAssignments.personId, persons.id),
      eq(persons.tenantId, TENANT_ID),
    ))
    .leftJoin(departments, and(
      eq(workerAssignments.departmentId, departments.id),
      eq(departments.tenantId, TENANT_ID),
    ))
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.actionMode, 'FUTURE_DATED'),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      gt(workerAssignments.effectiveStartDate, today),
    ))

  for (const row of assignments) {
    if (!isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today })) continue
    results.push({
      id:            row.id,
      changeType:    'ASSIGNMENT',
      personId:      row.personId,
      personName:    row.fullNameEn ?? 'Unknown',
      personNumber:  row.personNumber ?? '',
      effectiveDate: row.effectiveStartDate,
      description:   `Assignment to ${row.departmentNameEn ?? 'department'} — status: ${row.assignmentStatus}`,
      isCurrent:     true,
      canCancel:     true,
    })
  }

  // ── 2. Leave Plan Enrolments ──────────────────────────────────────────────
  const leaveEnrolments = await db
    .select({
      id:                 leavePlanEnrolments.id,
      personId:           leavePlanEnrolments.personId,
      effectiveStartDate: leavePlanEnrolments.effectiveStartDate,
      isCurrent:          leavePlanEnrolments.isCurrent,
      effectiveEndDate:   leavePlanEnrolments.effectiveEndDate,
      fullNameEn:         persons.fullNameEn,
      personNumber:       persons.personNumber,
      planNameEn:         absencePlans.planNameEn,
    })
    .from(leavePlanEnrolments)
    .leftJoin(persons, and(
      eq(leavePlanEnrolments.personId, persons.id),
      eq(persons.tenantId, TENANT_ID),
    ))
    .leftJoin(absencePlans, and(
      eq(leavePlanEnrolments.absencePlanId, absencePlans.id),
      eq(absencePlans.tenantId, TENANT_ID),
    ))
    .where(and(
      eq(leavePlanEnrolments.tenantId, TENANT_ID),
      eq(leavePlanEnrolments.isCurrent, true),
      gt(leavePlanEnrolments.effectiveStartDate, today),
    ))

  for (const row of leaveEnrolments) {
    if (!isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today, isCurrent: row.isCurrent })) continue
    results.push({
      id:            row.id,
      changeType:    'LEAVE_PLAN',
      personId:      row.personId,
      personName:    row.fullNameEn ?? 'Unknown',
      personNumber:  row.personNumber ?? '',
      effectiveDate: row.effectiveStartDate,
      description:   `Leave plan enrolment — ${row.planNameEn ?? 'plan'}`,
      isCurrent:     true,
      canCancel:     true,
    })
  }

  // ── 3. Work Schedule Assignments ──────────────────────────────────────────
  const scheduleAssignments = await db
    .select({
      id:                 workScheduleAssignments.id,
      personId:           workScheduleAssignments.personId,
      effectiveStartDate: workScheduleAssignments.effectiveStartDate,
      workScheduleId:     workScheduleAssignments.workScheduleId,
      effectiveEndDate:   workScheduleAssignments.effectiveEndDate,
      isCurrent:          workScheduleAssignments.isCurrent,
      fullNameEn:         persons.fullNameEn,
      personNumber:       persons.personNumber,
    })
    .from(workScheduleAssignments)
    .leftJoin(persons, and(
      eq(workScheduleAssignments.personId, persons.id),
      eq(persons.tenantId, TENANT_ID),
    ))
    .where(and(
      eq(workScheduleAssignments.tenantId, TENANT_ID),
      eq(workScheduleAssignments.isCurrent, true),
      gt(workScheduleAssignments.effectiveStartDate, today),
    ))

  for (const row of scheduleAssignments) {
    if (!isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today, isCurrent: row.isCurrent })) continue
    results.push({
      id:            row.id,
      changeType:    'WORK_SCHEDULE',
      personId:      row.personId,
      personName:    row.fullNameEn ?? 'Unknown',
      personNumber:  row.personNumber ?? '',
      effectiveDate: row.effectiveStartDate,
      description:   `Work schedule assignment — schedule ID: ${row.workScheduleId}`,
      isCurrent:     true,
      canCancel:     true,
    })
  }

  // ── 4. Payroll Assignments ────────────────────────────────────────────────
  const payrollRows = await db
    .select({
      id:                 payrollAssignments.id,
      personId:           payrollAssignments.personId,
      effectiveStartDate: payrollAssignments.effectiveStartDate,
      payrollId:          payrollAssignments.payrollId,
      effectiveEndDate:   payrollAssignments.effectiveEndDate,
      payrollGroup:       payrollAssignments.payrollGroup,
      isCurrent:          payrollAssignments.isCurrent,
      fullNameEn:         persons.fullNameEn,
      personNumber:       persons.personNumber,
    })
    .from(payrollAssignments)
    .leftJoin(persons, and(
      eq(payrollAssignments.personId, persons.id),
      eq(persons.tenantId, TENANT_ID),
    ))
    .where(and(
      eq(payrollAssignments.tenantId, TENANT_ID),
      eq(payrollAssignments.isCurrent, true),
      gt(payrollAssignments.effectiveStartDate, today),
    ))

  for (const row of payrollRows) {
    if (!isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today, isCurrent: row.isCurrent })) continue
    results.push({
      id:            row.id,
      changeType:    'PAYROLL',
      personId:      row.personId,
      personName:    row.fullNameEn ?? 'Unknown',
      personNumber:  row.personNumber ?? '',
      effectiveDate: row.effectiveStartDate,
      description:   `Payroll assignment — group: ${row.payrollGroup ?? 'STANDARD'}`,
      isCurrent:     true,
      canCancel:     true,
    })
  }

  // ── 5. Salary Elements ────────────────────────────────────────────────────
  // salaryElements uses actionMode (FUTURE_DATED) rather than isCurrent flag.
  // We treat all future-effective rows as isCurrent=true for display purposes.
  const salaryRows = await db
    .select({
      id:                    salaryElements.id,
      personId:              salaryElements.personId,
      effectiveStartDate:    salaryElements.effectiveStartDate,
      elementClassification: salaryElements.elementClassification,
      effectiveEndDate:      salaryElements.effectiveEndDate,
      amount:                salaryElements.amount,
      currency:              salaryElements.currency,
      elementNameEn:         salaryElements.elementNameEn,
      fullNameEn:            persons.fullNameEn,
      personNumber:          persons.personNumber,
    })
    .from(salaryElements)
    .leftJoin(persons, and(
      eq(salaryElements.personId, persons.id),
      eq(persons.tenantId, TENANT_ID),
    ))
    .where(and(
      eq(salaryElements.tenantId, TENANT_ID),
      gt(salaryElements.effectiveStartDate, today),
      gte(salaryElements.effectiveEndDate, salaryElements.effectiveStartDate),
    ))

  for (const row of salaryRows) {
    if (!isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today })) continue
    const amountStr = row.amount
      ? `${row.currency} ${parseFloat(row.amount).toLocaleString('en-AE', { minimumFractionDigits: 2 })}`
      : 'amount TBD'
    results.push({
      id:            row.id,
      changeType:    'SALARY',
      personId:      row.personId,
      personName:    row.fullNameEn ?? 'Unknown',
      personNumber:  row.personNumber ?? '',
      effectiveDate: row.effectiveStartDate,
      description:   `${row.elementNameEn} (${row.elementClassification}) — ${amountStr}`,
      isCurrent:     true,
      canCancel:     true,
    })
  }

  // ── 6. Contracts — future start date, ACTIVE status ───────────────────────
  const contractRows = await db
    .select({
      id:           contracts.id,
      personId:     contracts.personId,
      startDate:    contracts.startDate,
      contractType: contracts.contractType,
      status:       contracts.status,
      fullNameEn:   persons.fullNameEn,
      personNumber: persons.personNumber,
    })
    .from(contracts)
    .leftJoin(persons, and(
      eq(contracts.personId, persons.id),
      eq(persons.tenantId, TENANT_ID),
    ))
    .where(and(
      eq(contracts.tenantId, TENANT_ID),
      eq(contracts.status, 'ACTIVE'),
      gt(contracts.startDate, today),
    ))

  for (const row of contractRows) {
    results.push({
      id:            row.id,
      changeType:    'CONTRACT',
      personId:      row.personId,
      personName:    row.fullNameEn ?? 'Unknown',
      personNumber:  row.personNumber ?? '',
      effectiveDate: row.startDate,
      description:   `${row.contractType} contract — status: ${row.status}`,
      isCurrent:     true,
      canCancel:     true,
    })
  }

  // Sort all results ascending by effectiveDate
  results.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))

  return results
}

// ══════════════════════════════════════════════════════════════════════════════
// WRITE — cancelFutureDatedChange
// ══════════════════════════════════════════════════════════════════════════════

export async function cancelFutureDatedChange(
  changeType: PendingChange['changeType'],
  id:         string,
): Promise<{ error?: string }> {
  let parsed: z.infer<typeof CancelSchema>
  try {
    parsed = CancelSchema.parse({ changeType, id })
  } catch (err) {
    return { error: err instanceof z.ZodError ? err.errors[0].message : 'Invalid input.' }
  }

  let actor: Awaited<ReturnType<typeof requireRole>>
  try {
    actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  } catch {
    return { error: 'FORBIDDEN: Only HR Director or Super Admin can cancel future-dated changes.' }
  }

  const today = todayIso()

  try {
    await db.transaction(async tx => {
      let auditMetadata: Record<string, unknown> = {
        changeType:   parsed.changeType,
        cancelledAt:  new Date().toISOString(),
      }

      switch (parsed.changeType) {
        case 'ASSIGNMENT': {
          let [futureAssignment] = await tx
            .select({
              id:                 workerAssignments.id,
              personId:           workerAssignments.personId,
              effectiveStartDate: workerAssignments.effectiveStartDate,
              effectiveEndDate:   workerAssignments.effectiveEndDate,
            })
            .from(workerAssignments)
            .where(and(
              eq(workerAssignments.id, parsed.id),
              eq(workerAssignments.tenantId, TENANT_ID),
              eq(workerAssignments.actionMode, 'FUTURE_DATED'),
              ne(workerAssignments.assignmentStatus, 'INACTIVE'),
              gt(workerAssignments.effectiveStartDate, today),
            ))
            .limit(1)
          if (!futureAssignment) throw new Error('NOT_FOUND: Assignment not found or already effective/cancelled.')

          await lockWorkerAssignmentTimelineTx(tx, futureAssignment.personId)

          const [lockedFutureAssignment] = await tx
            .select({
              id:                 workerAssignments.id,
              personId:           workerAssignments.personId,
              effectiveStartDate: workerAssignments.effectiveStartDate,
              effectiveEndDate:   workerAssignments.effectiveEndDate,
            })
            .from(workerAssignments)
            .where(and(
              eq(workerAssignments.id, parsed.id),
              eq(workerAssignments.tenantId, TENANT_ID),
              eq(workerAssignments.actionMode, 'FUTURE_DATED'),
              ne(workerAssignments.assignmentStatus, 'INACTIVE'),
              gt(workerAssignments.effectiveStartDate, today),
            ))
            .limit(1)
          if (!lockedFutureAssignment) throw new Error('NOT_FOUND: Assignment not found or already effective/cancelled.')
          futureAssignment = lockedFutureAssignment

          const predecessorClosedDate = addDays(futureAssignment.effectiveStartDate, -1)
          const [predecessor] = await tx
            .select({
              id:                 workerAssignments.id,
              effectiveEndDate:   workerAssignments.effectiveEndDate,
              departmentId:       workerAssignments.departmentId,
              positionId:         workerAssignments.positionId,
              jobId:              workerAssignments.jobId,
              gradeId:            workerAssignments.gradeId,
              locationId:         workerAssignments.locationId,
              lineManagerId:      workerAssignments.lineManagerId,
            })
            .from(workerAssignments)
            .where(and(
              eq(workerAssignments.tenantId, TENANT_ID),
              eq(workerAssignments.personId, futureAssignment.personId),
              eq(workerAssignments.effectiveEndDate, predecessorClosedDate),
            ))
            .limit(1)
          if (!predecessor) {
            throw new Error('TIMELINE_REPAIR_FAILED: predecessor assignment not found; future assignment was not cancelled.')
          }

          const [nextFuture] = await tx
            .select({
              id:                 workerAssignments.id,
              effectiveStartDate: workerAssignments.effectiveStartDate,
            })
            .from(workerAssignments)
            .where(and(
              eq(workerAssignments.tenantId, TENANT_ID),
              eq(workerAssignments.personId, futureAssignment.personId),
              eq(workerAssignments.actionMode, 'FUTURE_DATED'),
              ne(workerAssignments.assignmentStatus, 'INACTIVE'),
              gt(workerAssignments.effectiveStartDate, futureAssignment.effectiveStartDate),
              gt(workerAssignments.effectiveStartDate, today),
            ))
            .orderBy(asc(workerAssignments.effectiveStartDate))
            .limit(1)

          const repairedEndDate = nextFuture
            ? addDays(nextFuture.effectiveStartDate, -1)
            : EFFECTIVE_END_OF_TIME

          // BR-ED-CANCEL-001: cancelled future rows are retained for audit, but
          // must be excluded from active overlap enforcement before reopening
          // the predecessor range.
          const rows = await tx
            .update(workerAssignments)
            .set({
              isCurrent:        false,
              assignmentStatus: 'INACTIVE',
              updatedBy:        actor.id,
              updatedByName:    actor.name,
              lastUpdatedDate:  new Date(),
            })
            .where(and(
              eq(workerAssignments.id, parsed.id),
              eq(workerAssignments.tenantId, TENANT_ID),
              gt(workerAssignments.effectiveStartDate, today),
            ))
            .returning({ id: workerAssignments.id })
          if (rows.length === 0) throw new Error('NOT_FOUND: Assignment not found or already effective/cancelled.')

          await tx
            .update(workerAssignments)
            .set({
              effectiveEndDate: repairedEndDate,
              isCurrent:        true,
              updatedBy:        actor.id,
              updatedByName:    actor.name,
              lastUpdatedDate:  new Date(),
            })
            .where(eq(workerAssignments.id, predecessor.id))

          const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, {
            id:            actor.id,
            name:          actor.name,
            role:          actor.role,
            personId:      actor.personId,
            legalEntityId: actor.legalEntityId,
          }, futureAssignment.personId)

          // BR-ED-CANCEL-002: denormalised current pointers follow the restored
          // predecessor assignment; future cancellation must not leave stale
          // future values on persons.
          await tx
            .update(persons)
            .set({
              currentDepartmentId: predecessor.departmentId,
              currentPositionId:   predecessor.positionId,
              currentJobId:        predecessor.jobId,
              currentGradeId:      predecessor.gradeId,
              currentLocationId:   predecessor.locationId,
              lineManagerId:       predecessor.lineManagerId,
              updatedBy:           actor.id,
              updatedByName:       actor.name,
              lastUpdatedDate:     new Date(),
            })
            .where(and(
              eq(persons.id, futureAssignment.personId),
              eq(persons.tenantId, TENANT_ID),
            ))

          auditMetadata = {
            ...auditMetadata,
            cancelledFutureAssignmentId: futureAssignment.id,
            personId:                    futureAssignment.personId,
            futureEffectiveStartDate:    futureAssignment.effectiveStartDate,
            futureEffectiveEndDate:      futureAssignment.effectiveEndDate,
            predecessorAssignmentId:     predecessor.id,
            predecessorOldEffectiveEndDate: predecessor.effectiveEndDate,
            predecessorNewEffectiveEndDate: repairedEndDate,
            nextFutureAssignmentId:      nextFuture?.id ?? null,
            nextFutureEffectiveStartDate: nextFuture?.effectiveStartDate ?? null,
            timelineRepairApplied:       true,
            compatibilityIsCurrentPreserved: true,
            futureMarkedInactiveBeforePredecessorRepair: true,
            personPointersRestored:      true,
            currentPointerRecomputed:    true,
            recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
          }
          break
        }
        case 'LEAVE_PLAN': {
          const rows = await tx
            .update(leavePlanEnrolments)
            .set({ isCurrent: false, updatedBy: actor.id, updatedByName: actor.name, lastUpdatedDate: new Date() })
            .where(and(
              eq(leavePlanEnrolments.id, parsed.id),
              eq(leavePlanEnrolments.tenantId, TENANT_ID),
              gt(leavePlanEnrolments.effectiveStartDate, today),
            ))
            .returning({ id: leavePlanEnrolments.id })
          if (rows.length === 0) throw new Error('NOT_FOUND: Leave plan enrolment not found or already effective/cancelled.')
          break
        }
        case 'WORK_SCHEDULE': {
          const rows = await tx
            .update(workScheduleAssignments)
            .set({ isCurrent: false, updatedBy: actor.id, updatedByName: actor.name, lastUpdatedDate: new Date() })
            .where(and(
              eq(workScheduleAssignments.id, parsed.id),
              eq(workScheduleAssignments.tenantId, TENANT_ID),
              gt(workScheduleAssignments.effectiveStartDate, today),
            ))
            .returning({ id: workScheduleAssignments.id })
          if (rows.length === 0) throw new Error('NOT_FOUND: Work schedule assignment not found or already effective/cancelled.')
          break
        }
        case 'PAYROLL': {
          const rows = await tx
            .update(payrollAssignments)
            .set({ isCurrent: false, updatedBy: actor.id, updatedByName: actor.name, lastUpdatedDate: new Date() })
            .where(and(
              eq(payrollAssignments.id, parsed.id),
              eq(payrollAssignments.tenantId, TENANT_ID),
              gt(payrollAssignments.effectiveStartDate, today),
            ))
            .returning({ id: payrollAssignments.id })
          if (rows.length === 0) throw new Error('NOT_FOUND: Payroll assignment not found or already effective/cancelled.')
          break
        }
        case 'SALARY': {
          // salaryElements has no isCurrent — set effectiveEndDate to yesterday to
          // logically cancel it before it takes effect.
          const yesterday = addDays(today, -1)
          const rows = await tx
            .update(salaryElements)
            .set({
              effectiveEndDate: yesterday,
              updatedBy:        actor.id,
              updatedByName:    actor.name,
              lastUpdatedDate:  new Date(),
            })
            .where(and(
              eq(salaryElements.id, parsed.id),
              eq(salaryElements.tenantId, TENANT_ID),
              gt(salaryElements.effectiveStartDate, today),
            ))
            .returning({ id: salaryElements.id })
          if (rows.length === 0) throw new Error('NOT_FOUND: Salary element not found or already effective/cancelled.')
          break
        }
        case 'CONTRACT': {
          const rows = await tx
            .update(contracts)
            .set({
              status:          'CANCELLED',
              isCurrent:       false,
              updatedBy:       actor.id,
              updatedByName:   actor.name,
              lastUpdatedDate: new Date(),
            })
            .where(and(
              eq(contracts.id, parsed.id),
              eq(contracts.tenantId, TENANT_ID),
              gt(contracts.startDate, today),
            ))
            .returning({ id: contracts.id })
          if (rows.length === 0) throw new Error('NOT_FOUND: Contract not found or already effective/cancelled.')
          break
        }
      }

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'FUTURE_CHANGE.CANCELLED',
        resourceType: changeTypeToTableName(parsed.changeType),
        resourceId:   parsed.id,
        description:  `Future-dated ${parsed.changeType} change cancelled before effective date.`,
        metadata:     auditMetadata,
      }, tx)
    })

    revalidatePath('/pending-changes')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unexpected error cancelling change.' }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function changeTypeToTableName(ct: PendingChange['changeType']): string {
  const map: Record<PendingChange['changeType'], string> = {
    ASSIGNMENT:    'worker_assignments',
    LEAVE_PLAN:    'leave_plan_enrolments',
    WORK_SCHEDULE: 'work_schedule_assignments',
    PAYROLL:       'payroll_assignments',
    SALARY:        'salary_elements',
    CONTRACT:      'contracts',
  }
  return map[ct]
}
