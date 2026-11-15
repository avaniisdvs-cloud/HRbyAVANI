/**
 * Tx-aware helpers used internally by worker-assignments AND
 * employment-actions. Pure async functions — NOT Server Actions.
 *
 * QA-Audit-C3 fix — employment-actions.ts used to open a SECOND tx for
 * employment_action insert + persons sync, after worker-assignments had
 * already committed its own tx. If the second tx failed, worker_assignments
 * was orphaned. These helpers accept a caller-supplied tx so all writes
 * land atomically.
 *
 * Caller is expected to have ALREADY:
 *   • authenticated + role-checked (requireRole)
 *   • validated input (Schema.parse)
 *   • verified entity scope
 *
 * These helpers ONLY do DB work + audit log inside the supplied tx.
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import {
  workerAssignments,
  persons,
  userAccounts,
  medicalInsurancePolicySettings,
  salaryElements,
  leavePlanEnrolments,
  payrollAssignments,
} from '@/drizzle/schema'
import type { WorkerAssignment } from '@/drizzle/schema'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME, isFutureDated, todayUae, type DateParam } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import { enrolEmployeeTx } from '@/modules/insurance/lifecycle'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import type { ActionMode, ChangeAssignmentMode } from '@/lib/action-mode'
import { getAsOfRow, workerAssignmentAsOfAdapter } from '@/lib/as-of-query'

export type { ActionMode }

// Tx shape — only the methods we need.
type Tx = {
  select:  typeof import('@/lib/db').db.select
  insert:  typeof import('@/lib/db').db.insert
  update:  typeof import('@/lib/db').db.update
  execute: typeof import('@/lib/db').db.execute
}

interface ActorContext {
  id:            string
  name:          string
  role:          string
  personId?:     string
  legalEntityId: string
}

// ── Find current active worker_assignment ─────────────────────────────────

export async function findCurrentAssignmentTx(
  tx:       Tx,
  personId: string,
  asOfDate: DateParam = todayUae(),
): Promise<WorkerAssignment | null> {
  return getAsOfRow<WorkerAssignment>(
    tx,
    workerAssignmentAsOfAdapter,
    { tenantId: TENANT_ID, personId },
    asOfDate,
  )
}

export type AssignmentSliceResolution =
  | { status: 'ok'; slice: WorkerAssignment }
  | {
      status: 'no_match'
      reason: 'NO_ASSIGNMENT_SLICE_FOR_DATE'
      personId: string
      effectiveDate: DateParam
    }
  | {
      status: 'conflict'
      reason: 'MULTIPLE_ASSIGNMENT_SLICES_FOR_DATE'
      personId: string
      effectiveDate: DateParam
      matchingIds: string[]
    }

// Read-only resolver for retroactive planning: finds the single assignment
// slice effective on the requested date without changing the timeline.
export async function resolveAssignmentSliceForDateTx(
  tx:            Tx,
  personId:      string,
  effectiveDate: DateParam,
): Promise<AssignmentSliceResolution> {
  const rows = await tx
    .select()
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      sql`${workerAssignments.effectiveStartDate} <= ${effectiveDate}`,
      sql`${workerAssignments.effectiveEndDate} >= ${effectiveDate}`,
    ))
    .limit(2)

  if (rows.length === 0) {
    return {
      status: 'no_match',
      reason: 'NO_ASSIGNMENT_SLICE_FOR_DATE',
      personId,
      effectiveDate,
    }
  }

  if (rows.length > 1) {
    return {
      status: 'conflict',
      reason: 'MULTIPLE_ASSIGNMENT_SLICES_FOR_DATE',
      personId,
      effectiveDate,
      matchingIds: rows.map(row => row.id),
    }
  }

  return { status: 'ok', slice: rows[0] }
}

// ── Auto-promote manager role ─────────────────────────────────────────────
// When a worker is assigned a line manager, upgrade that manager's
// avaniisRole from EMPLOYEE → MANAGER if they only have ESS access.

async function promoteToManagerRoleTx(
  tx:         Tx,
  actor:      ActorContext,
  managerPersonId: string,
): Promise<void> {
  const [account] = await tx
    .select({ id: userAccounts.id, avaniisRole: userAccounts.avaniisRole })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.personId, managerPersonId),
      eq(userAccounts.avaniisRole, 'EMPLOYEE'),
      eq(userAccounts.isActive, true),
    ))
    .limit(1)

  if (!account) return  // already a manager/admin or no account linked

  await tx
    .update(userAccounts)
    .set({
      avaniisRole:   'MANAGER',
      updatedBy:     actor.id,
      updatedByName: actor.name,
      updatedDate:   new Date(),
    })
    .where(eq(userAccounts.id, account.id))

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: actor.legalEntityId,
    channel:       'SYSTEM',
    eventType:     'USER_ACCOUNT.ROLE_AUTO_PROMOTED',
    resourceType:  'user_accounts',
    resourceId:    account.id,
    entityId:      actor.legalEntityId,
    metadata:      { previousRole: 'EMPLOYEE', newRole: 'MANAGER', reason: 'auto-promotion: has direct reports' },
  }, tx)
}

// ── Generate next assignment number (per legal entity) ────────────────────

export async function nextAssignmentNumberTx(
  tx:            Tx,
  legalEntityId: string,
): Promise<string> {
  const result = await tx
    .select({ n: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.legalEntityId, legalEntityId),
    ))
  return `WA-${String((result[0]?.n ?? 0) + 1).padStart(7, '0')}`
}

export async function lockWorkerAssignmentTimelineTx(
  tx:       Tx,
  personId: string,
): Promise<void> {
  await tx.execute(sql`SET LOCAL lock_timeout = '8000ms'`)
  await tx.execute(sql`SET LOCAL statement_timeout = '25000ms'`)
  await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15000ms'`)
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('worker_assignment:' || ${personId}))`)
}

export async function recomputeCurrentWorkerAssignmentPointerTx(
  tx:       Tx,
  user:     ActorContext,
  personId: string,
): Promise<{ currentAssignmentId: string | null }> {
  const today = todayUae()
  const [currentRow] = await tx
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      sql`${workerAssignments.effectiveStartDate} <= ${today}`,
      sql`${workerAssignments.effectiveEndDate} >= ${today}`,
    ))
    .orderBy(
      desc(workerAssignments.effectiveStartDate),
      desc(workerAssignments.effectiveSequence),
      desc(workerAssignments.createdDate),
    )
    .limit(1)

  await tx
    .update(workerAssignments)
    .set({
      isCurrent:       false,
      updatedBy:       user.id,
      updatedByName:   user.name,
      lastUpdatedDate: new Date(),
    })
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
    ))

  if (currentRow) {
    await tx
      .update(workerAssignments)
      .set({
        isCurrent:       true,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(workerAssignments.id, currentRow.id))
  }

  return { currentAssignmentId: currentRow?.id ?? null }
}

type AssignmentDownstreamImpact = {
  periodStartDate: string
  periodEndDate: string
  salaryElementCount: number
  leavePlanEnrolmentCount: number
  payrollAssignmentCount: number
  hasIntersectingDownstreamRecords: boolean
  warning: string | null
}

async function countOverlappingPersonRowsTx(
  tx:        Tx,
  table:     typeof salaryElements | typeof leavePlanEnrolments | typeof payrollAssignments,
  personId:  string,
  startDate: string,
  endDate:   string,
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(table)
    .where(and(
      eq(table.tenantId, TENANT_ID),
      eq(table.personId, personId),
      sql`${table.effectiveStartDate} <= ${endDate}`,
      sql`${table.effectiveEndDate} >= ${startDate}`,
    ))

  return Number(row?.n ?? 0)
}

async function collectAssignmentDownstreamImpactTx(
  tx:        Tx,
  personId:  string,
  startDate: string,
  endDate:   string,
): Promise<AssignmentDownstreamImpact> {
  const salaryElementCount = await countOverlappingPersonRowsTx(tx, salaryElements, personId, startDate, endDate)
  const leavePlanEnrolmentCount = await countOverlappingPersonRowsTx(tx, leavePlanEnrolments, personId, startDate, endDate)
  const payrollAssignmentCount = await countOverlappingPersonRowsTx(tx, payrollAssignments, personId, startDate, endDate)

  const hasIntersectingDownstreamRecords =
    salaryElementCount > 0 ||
    leavePlanEnrolmentCount > 0 ||
    payrollAssignmentCount > 0

  return {
    periodStartDate: startDate,
    periodEndDate:   endDate,
    salaryElementCount,
    leavePlanEnrolmentCount,
    payrollAssignmentCount,
    hasIntersectingDownstreamRecords,
    warning: hasIntersectingDownstreamRecords
      ? 'Worker assignment retro split intersects downstream effective-dated records; payroll, leave, and salary recalculation are outside ED-2D-3 scope.'
      : null,
  }
}

// ── Create a fresh worker_assignment row (only when none current exists) ─

export interface CreateAssignmentTxInput {
  personId:           string
  legalEntityId:      string
  effectiveStartDate: string
  positionId?:        string
  jobId?:             string
  departmentId:       string
  locationId?:        string
  gradeId?:           string
  businessUnitId?:    string
  lineManagerId?:     string
  dottedLineManagerId?: string
  employmentType:     string
  contractedHoursPerWeek: number
  workScheduleId?:    string
  actionType:         string
  actionReason?:      string
  primaryCostCentreCode?:   string
  secondaryCostCentreCode?: string
  costSplitPercentage?:     number
  notes?:             string
}

export async function createAssignmentTx(
  tx:    Tx,
  user:  ActorContext,
  data:  CreateAssignmentTxInput,
): Promise<{ id: string; assignmentNumber: string }> {
  // Hard Rule 3 — never overwrite a current row.
  const existing = await findCurrentAssignmentTx(tx, data.personId)
  if (existing) {
    throw new Error('person already has a current assignment; use changeAssignmentTx')
  }

  const newNum = await nextAssignmentNumberTx(tx, data.legalEntityId)
  const [row] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId:           data.personId,
      legalEntityId:      data.legalEntityId,
      assignmentNumber:   newNum,
      effectiveStartDate: data.effectiveStartDate,
      effectiveEndDate:   EFFECTIVE_END_OF_TIME,
      assignmentStatus:   'ACTIVE',
      positionId:         data.positionId,
      jobId:              data.jobId,
      departmentId:       data.departmentId,
      locationId:         data.locationId,
      gradeId:            data.gradeId,
      businessUnitId:     data.businessUnitId,
      lineManagerId:      data.lineManagerId,
      dottedLineManagerId: data.dottedLineManagerId,
      employmentType:     data.employmentType,
      contractedHoursPerWeek: data.contractedHoursPerWeek.toString(),
      workScheduleId:     data.workScheduleId,
      actionType:         data.actionType,
      actionReason:       data.actionReason,
      actionInitiatedBy:  user.personId ?? user.id,
      actionApprovedBy:   user.personId ?? user.id,
      actionApprovalDate: data.effectiveStartDate,
      primaryCostCentreCode:   data.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode,
      costSplitPercentage:     data.costSplitPercentage?.toString(),
      isCurrent:               true,
      actionMode:              'UPDATE',
      effectiveSequence:       1,
      notes:                   data.notes,
      createdBy:               user.id,
      createdByName:           user.name,
    })
    .returning({ id: workerAssignments.id })

  await writeAuditLog({
    actorId:       user.id,
    actorName:     user.name,
    actorRole:     user.role,
    actorEntityId: data.legalEntityId,
    channel:       'WEB',
    eventType:     'WORKER_ASSIGNMENT.CREATED',
    resourceType:  'worker_assignments',
    resourceId:    row.id,
    entityId:      data.legalEntityId,
    newValues: {
      assignmentNumber: newNum,
      personId: data.personId,
      departmentId: data.departmentId,
      actionType: data.actionType,
      effectiveStartDate: data.effectiveStartDate,
    },
  }, tx)

  // Auto-promote line manager from EMPLOYEE → MANAGER when they gain a direct report
  if (data.lineManagerId) {
    await promoteToManagerRoleTx(tx, user, data.lineManagerId)
  }

  // BR-INS-001: auto-enrol on hire when policy setting is enabled
  if (data.actionType === 'HIRE') {
    try {
      const [policy] = await tx
        .select({ autoEnrolOnHire: medicalInsurancePolicySettings.autoEnrolOnHire })
        .from(medicalInsurancePolicySettings)
        .where(and(
          eq(medicalInsurancePolicySettings.tenantId, TENANT_ID),
          eq(medicalInsurancePolicySettings.legalEntityId, data.legalEntityId),
        ))
        .limit(1)

      if (policy?.autoEnrolOnHire !== false) {
        await enrolEmployeeTx(tx, user, {
          personId:      data.personId,
          legalEntityId: data.legalEntityId,
          effectiveDate: data.effectiveStartDate,
        })
      }
    } catch {
      // Insurance enrolment failure must not block the hire action.
      // The HR Admin can manually enrol from the insurance tab.
    }
  }

  return { id: row.id, assignmentNumber: newNum }
}

// ── Effective-date close current + insert new (or correct in-place) ─────────

export interface ChangeAssignmentTxInput {
  personId:        string
  effectiveDate:   string
  actionType:      string
  actionReason:    string
  // UPDATE (default): close current row and open a new one — records a real business event.
  // CORRECTION: update the existing row in-place — fixes a data-entry error, no new history row.
  // FUTURE_DATED: inserts a future row (isCurrent=false) — takes effect on effectiveDate.
  mode?:           ChangeAssignmentMode
  // Required when mode=CORRECTION; captured in audit trail.
  correctionNote?: string
  positionId?:     string
  jobId?:          string
  departmentId?:   string
  locationId?:     string
  gradeId?:        string
  businessUnitId?: string
  lineManagerId?:  string
  dottedLineManagerId?: string
  employmentType?: string
  contractedHoursPerWeek?: number
  workScheduleId?: string
  primaryCostCentreCode?:   string
  secondaryCostCentreCode?: string
  costSplitPercentage?:     number
  // BR-PRJ-001: project cost-centre assignment (optional)
  projectId?:              string
  projectAllocationPct?:   number
  notes?:          string
  // Optional FK back to the employment_actions or workflow_instances row.
  sourceTransactionId?: string
}

export interface RetroSplitAssignmentTxInput {
  personId:        string
  effectiveDate:   string
  actionType:      string
  actionReason:    string
  positionId?:     string
  jobId?:          string
  departmentId?:   string
  locationId?:     string
  gradeId?:        string
  businessUnitId?: string
  lineManagerId?:  string
  dottedLineManagerId?: string
  employmentType?: string
  contractedHoursPerWeek?: number
  workScheduleId?: string
  primaryCostCentreCode?:   string
  secondaryCostCentreCode?: string
  costSplitPercentage?:     number
  projectId?:              string
  projectAllocationPct?:   number
  notes?:          string
  sourceTransactionId?: string
}

export type ChangeAssignmentTxResult =
  | { mode: 'UPDATE';       closedId: string; newId: string; newAssignmentNumber: string; current: WorkerAssignment }
  | { mode: 'CORRECTION';   correctedId: string; current: WorkerAssignment }
  | { mode: 'FUTURE_DATED'; futureId: string;  futureAssignmentNumber: string; current: WorkerAssignment }

export async function retroSplitAssignmentTx(
  tx:    Tx,
  user:  ActorContext,
  data:  RetroSplitAssignmentTxInput,
): Promise<{
  mode: 'RETRO_SPLIT'
  originalId: string
  replacementId: string
  replacementAssignmentNumber: string
}> {
  await lockWorkerAssignmentTimelineTx(tx, data.personId)

  const resolution = await resolveAssignmentSliceForDateTx(tx, data.personId, data.effectiveDate)

  if (resolution.status === 'no_match') {
    throw new Error(
      `RETRO_SPLIT_NO_ASSIGNMENT_SLICE: no worker assignment slice exists for ${data.effectiveDate}`,
    )
  }

  if (resolution.status === 'conflict') {
    throw new Error(
      `RETRO_SPLIT_CONFLICT: multiple worker assignment slices match ${data.effectiveDate}`,
    )
  }

  const slice = resolution.slice
  const sliceEffectiveEndDate = slice.effectiveEndDate ?? EFFECTIVE_END_OF_TIME

  if (data.effectiveDate === slice.effectiveStartDate) {
    throw new Error('RETRO_SPLIT_SAME_DAY_SEQUENCE_UNSUPPORTED: effectiveDate equals slice start')
  }

  if (data.effectiveDate < slice.effectiveStartDate || data.effectiveDate > sliceEffectiveEndDate) {
    throw new Error('RETRO_SPLIT_INVALID_RANGE: effectiveDate must fall inside the resolved slice')
  }

  if (slice.isCurrent || data.effectiveDate >= todayUae()) {
    throw new Error('RETRO_SPLIT_CURRENT_SLICE_UNSUPPORTED: Phase 2D-2 supports historical slices only')
  }

  const futureRows = await tx
    .select({
      id:                 workerAssignments.id,
      effectiveStartDate: workerAssignments.effectiveStartDate,
    })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, data.personId),
      sql`${workerAssignments.id} <> ${slice.id}`,
      sql`${workerAssignments.effectiveStartDate} > ${data.effectiveDate}`,
      sql`${workerAssignments.effectiveStartDate} <= ${sliceEffectiveEndDate}`,
    ))
    .orderBy(workerAssignments.effectiveStartDate)
    .limit(2)

  if (futureRows.length > 1) {
    throw new Error('RETRO_SPLIT_AMBIGUOUS_FUTURE_OVERLAP: multiple later slices bound this split')
  }

  const nextFuture = futureRows[0]
  const originalOldEffectiveEndDate = sliceEffectiveEndDate
  const originalNewEffectiveEndDate = addDays(data.effectiveDate, -1)
  const replacementEffectiveEndDate = nextFuture
    ? addDays(nextFuture.effectiveStartDate, -1)
    : originalOldEffectiveEndDate

  await tx
    .update(workerAssignments)
    .set({
      effectiveEndDate: originalNewEffectiveEndDate,
      isCurrent:        false,
      updatedBy:        user.id,
      updatedByName:    user.name,
      updatedDate:      new Date(),
      lastUpdatedDate:  new Date(),
    })
    .where(eq(workerAssignments.id, slice.id))

  const newNum = await nextAssignmentNumberTx(tx, slice.legalEntityId)
  const [row] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId:           slice.personId,
      legalEntityId:      slice.legalEntityId,
      assignmentNumber:   newNum,
      effectiveStartDate: data.effectiveDate,
      effectiveEndDate:   replacementEffectiveEndDate,
      assignmentStatus:   slice.assignmentStatus,
      positionId:         data.positionId        ?? slice.positionId,
      jobId:              data.jobId             ?? slice.jobId,
      departmentId:       data.departmentId      ?? slice.departmentId,
      locationId:         data.locationId        ?? slice.locationId,
      gradeId:            data.gradeId           ?? slice.gradeId,
      businessUnitId:     data.businessUnitId    ?? slice.businessUnitId,
      lineManagerId:      data.lineManagerId     ?? slice.lineManagerId,
      dottedLineManagerId: data.dottedLineManagerId ?? slice.dottedLineManagerId,
      employmentType:     data.employmentType    ?? slice.employmentType,
      contractedHoursPerWeek: data.contractedHoursPerWeek?.toString() ?? slice.contractedHoursPerWeek,
      workScheduleId:     data.workScheduleId    ?? slice.workScheduleId,
      actionType:         data.actionType,
      actionReason:       data.actionReason,
      actionInitiatedBy:  user.personId ?? user.id,
      actionApprovedBy:   user.personId ?? user.id,
      actionApprovalDate: data.effectiveDate,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? slice.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? slice.secondaryCostCentreCode,
      costSplitPercentage:     data.costSplitPercentage?.toString() ?? slice.costSplitPercentage,
      projectId:               data.projectId               ?? slice.projectId,
      projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : slice.projectAllocationPct,
      isCurrent:               false,
      actionMode:              'RETRO_SPLIT',
      effectiveSequence:       1,
      sourceTransactionId:     data.sourceTransactionId,
      notes:                   data.notes ?? slice.notes,
      createdBy:               user.id,
      createdByName:           user.name,
    })
    .returning({ id: workerAssignments.id })

  const before: Record<string, unknown> = {
    positionId:              slice.positionId,
    jobId:                   slice.jobId,
    departmentId:            slice.departmentId,
    locationId:              slice.locationId,
    gradeId:                 slice.gradeId,
    businessUnitId:          slice.businessUnitId,
    lineManagerId:           slice.lineManagerId,
    dottedLineManagerId:     slice.dottedLineManagerId,
    employmentType:          slice.employmentType,
    contractedHoursPerWeek:  slice.contractedHoursPerWeek,
    workScheduleId:          slice.workScheduleId,
    actionType:              slice.actionType,
    actionReason:            slice.actionReason,
    primaryCostCentreCode:   slice.primaryCostCentreCode,
    secondaryCostCentreCode: slice.secondaryCostCentreCode,
    notes:                   slice.notes,
  }

  const after: Record<string, unknown> = {
    positionId:              data.positionId              ?? slice.positionId,
    jobId:                   data.jobId                   ?? slice.jobId,
    departmentId:            data.departmentId            ?? slice.departmentId,
    locationId:              data.locationId              ?? slice.locationId,
    gradeId:                 data.gradeId                 ?? slice.gradeId,
    businessUnitId:          data.businessUnitId          ?? slice.businessUnitId,
    lineManagerId:           data.lineManagerId           ?? slice.lineManagerId,
    dottedLineManagerId:     data.dottedLineManagerId     ?? slice.dottedLineManagerId,
    employmentType:          data.employmentType          ?? slice.employmentType,
    contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? slice.contractedHoursPerWeek,
    workScheduleId:          data.workScheduleId          ?? slice.workScheduleId,
    actionType:              data.actionType,
    actionReason:            data.actionReason,
    primaryCostCentreCode:   data.primaryCostCentreCode   ?? slice.primaryCostCentreCode,
    secondaryCostCentreCode: data.secondaryCostCentreCode ?? slice.secondaryCostCentreCode,
    notes:                   data.notes                   ?? slice.notes,
  }

  const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)
  const downstreamImpact = await collectAssignmentDownstreamImpactTx(
    tx,
    data.personId,
    data.effectiveDate,
    replacementEffectiveEndDate,
  )

  await writeAuditLog({
    actorId:       user.id,
    actorName:     user.name,
    actorRole:     user.role,
    actorEntityId: slice.legalEntityId,
    channel:       'WEB',
    eventType:     'WORKER_ASSIGNMENT.RETRO_SPLIT',
    resourceType:  'worker_assignments',
    resourceId:    row.id,
    entityId:      slice.legalEntityId,
    oldValues:     before,
    newValues:     after,
    changedFields: diffFields(before, after),
    metadata: {
      actionType:                 data.actionType,
      actionMode:                 'RETRO_SPLIT',
      actionReason:               data.actionReason,
      effectiveDate:              data.effectiveDate,
      originalAssignmentId:       slice.id,
      originalOldEffectiveEndDate,
      originalNewEffectiveEndDate,
      replacementAssignmentId:    row.id,
      replacementEffectiveStartDate: data.effectiveDate,
      replacementEffectiveEndDate,
      nextFutureAssignmentId:     nextFuture?.id ?? null,
      nextFutureEffectiveStartDate: nextFuture?.effectiveStartDate ?? null,
      replacementIsCurrent:       false,
      existingCurrentPreserved:   true,
      currentPointerRecomputed:   true,
      recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
      downstreamImpact,
      sourceTransactionId:        data.sourceTransactionId,
    },
  }, tx)

  return {
    mode: 'RETRO_SPLIT',
    originalId: slice.id,
    replacementId: row.id,
    replacementAssignmentNumber: newNum,
  }
}

export async function changeAssignmentTx(
  tx:    Tx,
  user:  ActorContext,
  data:  ChangeAssignmentTxInput,
): Promise<ChangeAssignmentTxResult> {
  const mode: ChangeAssignmentMode = data.mode ?? 'UPDATE'

  // Role-gate: only HR_DIRECTOR and SUPER_ADMIN may use Correction Mode.
  if (mode === 'CORRECTION') requireCorrectionModePermission(user.role)

  await lockWorkerAssignmentTimelineTx(tx, data.personId)

  const current = await findCurrentAssignmentTx(tx, data.personId)
  if (!current) throw new Error('no current worker_assignment for this person')

  // ── CORRECTION MODE ───────────────────────────────────────────────────────
  // Edits the existing row in-place; does not create a new history row.
  // The old values are captured in the audit log before the write.
  if (mode === 'CORRECTION') {
    if (!data.correctionNote?.trim()) {
      throw new Error('CORRECTION mode requires a non-empty correctionNote')
    }

    const before: Record<string, unknown> = {
      positionId:              current.positionId,
      jobId:                   current.jobId,
      departmentId:            current.departmentId,
      locationId:              current.locationId,
      gradeId:                 current.gradeId,
      businessUnitId:          current.businessUnitId,
      lineManagerId:           current.lineManagerId,
      dottedLineManagerId:     current.dottedLineManagerId,
      employmentType:          current.employmentType,
      contractedHoursPerWeek:  current.contractedHoursPerWeek,
      workScheduleId:          current.workScheduleId,
      actionType:              current.actionType,
      actionReason:            current.actionReason,
      primaryCostCentreCode:   current.primaryCostCentreCode,
      secondaryCostCentreCode: current.secondaryCostCentreCode,
      notes:                   current.notes,
    }

    const after: Record<string, unknown> = {
      positionId:              data.positionId              ?? current.positionId,
      jobId:                   data.jobId                   ?? current.jobId,
      departmentId:            data.departmentId            ?? current.departmentId,
      locationId:              data.locationId              ?? current.locationId,
      gradeId:                 data.gradeId                 ?? current.gradeId,
      businessUnitId:          data.businessUnitId          ?? current.businessUnitId,
      lineManagerId:           data.lineManagerId           ?? current.lineManagerId,
      dottedLineManagerId:     data.dottedLineManagerId     ?? current.dottedLineManagerId,
      employmentType:          data.employmentType          ?? current.employmentType,
      contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
      workScheduleId:          data.workScheduleId          ?? current.workScheduleId,
      actionType:              data.actionType,
      actionReason:            data.actionReason,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
      notes:                   data.notes                   ?? current.notes,
    }

    await tx
      .update(workerAssignments)
      .set({
        positionId:              data.positionId              ?? current.positionId,
        jobId:                   data.jobId                   ?? current.jobId,
        departmentId:            data.departmentId            ?? current.departmentId,
        locationId:              data.locationId              ?? current.locationId,
        gradeId:                 data.gradeId                 ?? current.gradeId,
        businessUnitId:          data.businessUnitId          ?? current.businessUnitId,
        lineManagerId:           data.lineManagerId           ?? current.lineManagerId,
        dottedLineManagerId:     data.dottedLineManagerId     ?? current.dottedLineManagerId,
        employmentType:          data.employmentType          ?? current.employmentType,
        contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
        workScheduleId:          data.workScheduleId          ?? current.workScheduleId,
        actionType:              data.actionType,
        actionReason:            data.actionReason,
        primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
        secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
        projectId:               data.projectId               ?? current.projectId,
        projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
        notes:                   data.notes                   ?? current.notes,
        actionMode:              'CORRECTION',
        // correctsRowId is intentionally null here — we ARE the row being
        // corrected (in-place update). The audit log holds the before/after diff.
        correctsRowId:           null,
        updatedBy:               user.id,
        updatedByName:           user.name,
        updatedDate:             new Date(),
        lastUpdatedDate:         new Date(),
      })
      .where(eq(workerAssignments.id, current.id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'WORKER_ASSIGNMENT.CORRECTED',
      resourceType:  'worker_assignments',
      resourceId:    current.id,
      entityId:      current.legalEntityId,
      actionMode:    'CORRECTION',
      oldValues:     before,
      newValues:     after,
      changedFields: diffFields(before, after),
      metadata: {
        correctionNote:  data.correctionNote,
        actionType:      data.actionType,
        effectiveDate:   data.effectiveDate,
      },
    }, tx)

    return { mode: 'CORRECTION', correctedId: current.id, current }
  }

  // ── FUTURE_DATED MODE ─────────────────────────────────────────────────────
  // Inserts a new row with isCurrent=false. The current row stays materialised
  // as isCurrent=true for legacy consumers, but its date range is closed to
  // effectiveDate - 1 so query-based as-of reads and exclusion constraints are
  // timeline-correct without needing a materialisation job in this phase.
  if (mode === 'FUTURE_DATED') {
    if (!isFutureDated(data.effectiveDate)) {
      throw new Error('FUTURE_DATED mode requires effectiveDate after today')
    }
    if (data.effectiveDate <= current.effectiveStartDate) {
      throw new Error('effectiveDate must be after the current row\'s start')
    }

    // Phase 2C-1: only one pending future assignment per person until
    // materialisation and cancellation repair exist. Exclude the predecessor
    // row below because this branch intentionally closes that range to D-1.
    const [existingFuture] = await tx
      .select({
        id:                 workerAssignments.id,
        assignmentNumber:   workerAssignments.assignmentNumber,
        effectiveStartDate: workerAssignments.effectiveStartDate,
      })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, data.personId),
        sql`${workerAssignments.id} <> ${current.id}`,
        sql`${workerAssignments.effectiveStartDate} > ${todayUae()}`,
        sql`${workerAssignments.effectiveEndDate} >= ${data.effectiveDate}`,
      ))
      .limit(1)
    if (existingFuture) {
      throw new Error(
        `DUPLICATE_FUTURE_CHANGE: a pending future change already exists for this person ` +
        `on ${existingFuture.effectiveStartDate} (${existingFuture.assignmentNumber}). ` +
        `Cancel it before creating a new one.`,
      )
    }

    const predecessorOldEffectiveEndDate = current.effectiveEndDate
    const predecessorNewEffectiveEndDate = addDays(data.effectiveDate, -1)

    await tx
      .update(workerAssignments)
      .set({
        effectiveEndDate: predecessorNewEffectiveEndDate,
        isCurrent:        true,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(workerAssignments.id, current.id))

    const newNum = await nextAssignmentNumberTx(tx, current.legalEntityId)
    const [row] = await tx
      .insert(workerAssignments)
      .values({
        tenantId:           TENANT_ID,
        personId:           current.personId,
        legalEntityId:      current.legalEntityId,
        assignmentNumber:   newNum,
        effectiveStartDate: data.effectiveDate,
        effectiveEndDate:   EFFECTIVE_END_OF_TIME,
        assignmentStatus:   current.assignmentStatus,
        positionId:         data.positionId        ?? current.positionId,
        jobId:              data.jobId             ?? current.jobId,
        departmentId:       data.departmentId      ?? current.departmentId,
        locationId:         data.locationId        ?? current.locationId,
        gradeId:            data.gradeId           ?? current.gradeId,
        businessUnitId:     data.businessUnitId    ?? current.businessUnitId,
        lineManagerId:      data.lineManagerId     ?? current.lineManagerId,
        dottedLineManagerId: data.dottedLineManagerId ?? current.dottedLineManagerId,
        employmentType:     data.employmentType    ?? current.employmentType,
        contractedHoursPerWeek: data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
        workScheduleId:     data.workScheduleId    ?? current.workScheduleId,
        actionType:         data.actionType,
        actionReason:       data.actionReason,
        actionInitiatedBy:  user.personId ?? user.id,
        primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
        secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
        costSplitPercentage:     data.costSplitPercentage?.toString() ?? current.costSplitPercentage,
        projectId:               data.projectId               ?? current.projectId,
        projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
        isCurrent:               false,  // not current until effectiveDate arrives
        actionMode:              'FUTURE_DATED',
        effectiveSequence:       1,
        sourceTransactionId:     data.sourceTransactionId,
        notes:                   data.notes ?? current.notes,
        createdBy:               user.id,
        createdByName:           user.name,
      })
      .returning({ id: workerAssignments.id })

    const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'WORKER_ASSIGNMENT.FUTURE_DATED',
      resourceType:  'worker_assignments',
      resourceId:    row.id,
      entityId:      current.legalEntityId,
      actionMode:    'FUTURE_DATED',
      metadata: {
        actionType:           data.actionType,
        actionReason:         data.actionReason,
        effectiveDate:        data.effectiveDate,
        predecessorAssignmentId: current.id,
        predecessorOldEffectiveEndDate,
        predecessorNewEffectiveEndDate,
        futureAssignmentId:   row.id,
        compatibilityIsCurrentPreserved: true,
        currentPointerRecomputed: true,
        recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
        sourceTransactionId:  data.sourceTransactionId,
      },
    }, tx)

    return { mode: 'FUTURE_DATED', futureId: row.id, futureAssignmentNumber: newNum, current }
  }

  // ── UPDATE MODE (default) ─────────────────────────────────────────────────
  // Closes the current row and opens a new one — the standard business event.
  if (data.effectiveDate <= current.effectiveStartDate) {
    throw new Error('effectiveDate must be after the current row\'s start')
  }

  const currentEffectiveEndDate = current.effectiveEndDate ?? EFFECTIVE_END_OF_TIME

  // ED-2D-3: a current row can already be date-bounded by an approved
  // future-dated assignment. A retro/current UPDATE inside that bounded slice
  // must preserve the future row and open the replacement only until F-1.
  if (currentEffectiveEndDate !== EFFECTIVE_END_OF_TIME) {
    if (data.effectiveDate > todayUae()) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_REQUIRES_RETRO_OR_CURRENT_DATE: effectiveDate must be today or earlier')
    }

    const futureBoundaryStartDate = addDays(currentEffectiveEndDate, 1)
    if (data.effectiveDate >= futureBoundaryStartDate) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_INVALID_RANGE: effectiveDate must be before the future boundary')
    }

    const futureBoundaries = await tx
      .select({
        id:                 workerAssignments.id,
        assignmentNumber:   workerAssignments.assignmentNumber,
        effectiveStartDate: workerAssignments.effectiveStartDate,
        assignmentStatus:   workerAssignments.assignmentStatus,
      })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, data.personId),
        sql`${workerAssignments.id} <> ${current.id}`,
        eq(workerAssignments.actionMode, 'FUTURE_DATED'),
        sql`${workerAssignments.effectiveStartDate} > ${currentEffectiveEndDate}`,
      ))
      .orderBy(workerAssignments.effectiveStartDate)
      .limit(2)

    if (futureBoundaries.length === 0) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_MISSING_FUTURE_BOUNDARY: bounded current row has no future assignment boundary')
    }
    if (futureBoundaries.length > 1) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_MULTIPLE_FUTURE_BOUNDARIES: exactly one future assignment boundary is supported')
    }

    const futureBoundary = futureBoundaries[0]
    if (futureBoundary.assignmentStatus === 'INACTIVE') {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_INACTIVE_FUTURE_BOUNDARY: future assignment boundary is inactive')
    }
    if (futureBoundary.effectiveStartDate !== futureBoundaryStartDate) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_MISSING_FUTURE_BOUNDARY: future assignment must start the day after the bounded current row')
    }

    const originalOldEffectiveEndDate = currentEffectiveEndDate
    const originalNewEffectiveEndDate = addDays(data.effectiveDate, -1)
    const replacementEffectiveEndDate = currentEffectiveEndDate

    await tx
      .update(workerAssignments)
      .set({
        effectiveEndDate: originalNewEffectiveEndDate,
        isCurrent:        false,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(workerAssignments.id, current.id))

    const newNum = await nextAssignmentNumberTx(tx, current.legalEntityId)
    const [row] = await tx
      .insert(workerAssignments)
      .values({
        tenantId:           TENANT_ID,
        personId:           current.personId,
        legalEntityId:      current.legalEntityId,
        assignmentNumber:   newNum,
        effectiveStartDate: data.effectiveDate,
        effectiveEndDate:   replacementEffectiveEndDate,
        assignmentStatus:   current.assignmentStatus,
        positionId:         data.positionId        ?? current.positionId,
        jobId:              data.jobId             ?? current.jobId,
        departmentId:       data.departmentId      ?? current.departmentId,
        locationId:         data.locationId        ?? current.locationId,
        gradeId:            data.gradeId           ?? current.gradeId,
        businessUnitId:     data.businessUnitId    ?? current.businessUnitId,
        lineManagerId:      data.lineManagerId     ?? current.lineManagerId,
        dottedLineManagerId: data.dottedLineManagerId ?? current.dottedLineManagerId,
        employmentType:     data.employmentType    ?? current.employmentType,
        contractedHoursPerWeek: (data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek),
        workScheduleId:     data.workScheduleId    ?? current.workScheduleId,
        actionType:         data.actionType,
        actionReason:       data.actionReason,
        actionInitiatedBy:  user.personId ?? user.id,
        actionApprovedBy:   user.personId ?? user.id,
        actionApprovalDate: data.effectiveDate,
        primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
        secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
        costSplitPercentage:     data.costSplitPercentage?.toString() ?? current.costSplitPercentage,
        projectId:               data.projectId               ?? current.projectId,
        projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
        isCurrent:               true,
        actionMode:              'RETRO_SPLIT',
        effectiveSequence:       1,
        sourceTransactionId:     data.sourceTransactionId,
        notes:                   data.notes ?? current.notes,
        createdBy:               user.id,
        createdByName:           user.name,
      })
      .returning({ id: workerAssignments.id })

    const before: Record<string, unknown> = {
      positionId:              current.positionId,
      jobId:                   current.jobId,
      departmentId:            current.departmentId,
      locationId:              current.locationId,
      gradeId:                 current.gradeId,
      businessUnitId:          current.businessUnitId,
      lineManagerId:           current.lineManagerId,
      dottedLineManagerId:     current.dottedLineManagerId,
      employmentType:          current.employmentType,
      contractedHoursPerWeek:  current.contractedHoursPerWeek,
      workScheduleId:          current.workScheduleId,
      actionType:              current.actionType,
      actionReason:            current.actionReason,
      primaryCostCentreCode:   current.primaryCostCentreCode,
      secondaryCostCentreCode: current.secondaryCostCentreCode,
      notes:                   current.notes,
    }

    const after: Record<string, unknown> = {
      positionId:              data.positionId              ?? current.positionId,
      jobId:                   data.jobId                   ?? current.jobId,
      departmentId:            data.departmentId            ?? current.departmentId,
      locationId:              data.locationId              ?? current.locationId,
      gradeId:                 data.gradeId                 ?? current.gradeId,
      businessUnitId:          data.businessUnitId          ?? current.businessUnitId,
      lineManagerId:           data.lineManagerId           ?? current.lineManagerId,
      dottedLineManagerId:     data.dottedLineManagerId     ?? current.dottedLineManagerId,
      employmentType:          data.employmentType          ?? current.employmentType,
      contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
      workScheduleId:          data.workScheduleId          ?? current.workScheduleId,
      actionType:              data.actionType,
      actionReason:            data.actionReason,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
      notes:                   data.notes                   ?? current.notes,
    }

    const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)
    const downstreamImpact = await collectAssignmentDownstreamImpactTx(
      tx,
      data.personId,
      data.effectiveDate,
      replacementEffectiveEndDate,
    )

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'WORKER_ASSIGNMENT.RETRO_SPLIT',
      resourceType:  'worker_assignments',
      resourceId:    row.id,
      entityId:      current.legalEntityId,
      oldValues:     before,
      newValues:     after,
      changedFields: diffFields(before, after),
      metadata: {
        actionType:                 data.actionType,
        actionMode:                 'RETRO_SPLIT',
        actionReason:               data.actionReason,
        effectiveDate:              data.effectiveDate,
        originalAssignmentId:       current.id,
        originalOldEffectiveEndDate,
        originalNewEffectiveEndDate,
        replacementAssignmentId:    row.id,
        replacementEffectiveStartDate: data.effectiveDate,
        replacementEffectiveEndDate,
        replacementIsCurrent:       true,
        currentPointerRecomputed:   true,
        recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
        futureBoundaryAssignmentId: futureBoundary.id,
        futureBoundaryAssignmentNumber: futureBoundary.assignmentNumber,
        futureBoundaryEffectiveStartDate: futureBoundary.effectiveStartDate,
        futureBoundaryPreserved:    true,
        futureBoundedRetroSplit:    true,
        assignmentModeCompatibility: 'UPDATE',
        downstreamImpact,
        sourceTransactionId:        data.sourceTransactionId,
      },
    }, tx)

    const effectiveManagerId = data.lineManagerId ?? current.lineManagerId
    if (effectiveManagerId) {
      await promoteToManagerRoleTx(tx, user, effectiveManagerId)
    }

    return {
      mode:                'UPDATE',
      closedId:            current.id,
      newId:               row.id,
      newAssignmentNumber: newNum,
      current,
    }
  }

  // 1) close current row.
  const closeDate = addDays(data.effectiveDate, -1)
  await tx
    .update(workerAssignments)
    .set({
      effectiveEndDate: closeDate,
      isCurrent:        false,
      updatedBy:        user.id,
      updatedByName:    user.name,
      updatedDate:      new Date(),
      lastUpdatedDate:  new Date(),
    })
    .where(eq(workerAssignments.id, current.id))

  // 2) open new row carrying forward unchanged columns.
  const newNum = await nextAssignmentNumberTx(tx, current.legalEntityId)
  const [row] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId:           current.personId,
      legalEntityId:      current.legalEntityId,
      assignmentNumber:   newNum,
      effectiveStartDate: data.effectiveDate,
      effectiveEndDate:   EFFECTIVE_END_OF_TIME,
      assignmentStatus:   current.assignmentStatus,
      positionId:         data.positionId        ?? current.positionId,
      jobId:              data.jobId             ?? current.jobId,
      departmentId:       data.departmentId      ?? current.departmentId,
      locationId:         data.locationId        ?? current.locationId,
      gradeId:            data.gradeId           ?? current.gradeId,
      businessUnitId:     data.businessUnitId    ?? current.businessUnitId,
      lineManagerId:      data.lineManagerId     ?? current.lineManagerId,
      dottedLineManagerId: data.dottedLineManagerId ?? current.dottedLineManagerId,
      employmentType:     data.employmentType    ?? current.employmentType,
      contractedHoursPerWeek: (data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek),
      workScheduleId:     data.workScheduleId    ?? current.workScheduleId,
      actionType:         data.actionType,
      actionReason:       data.actionReason,
      actionInitiatedBy:  user.personId ?? user.id,
      actionApprovedBy:   user.personId ?? user.id,
      actionApprovalDate: data.effectiveDate,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
      costSplitPercentage:     data.costSplitPercentage?.toString() ?? current.costSplitPercentage,
      projectId:               data.projectId               ?? current.projectId,
      projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
      isCurrent:               true,
      actionMode:              'UPDATE',
      sourceTransactionId:     data.sourceTransactionId,
      notes:                   data.notes ?? current.notes,
      createdBy:               user.id,
      createdByName:           user.name,
    })
    .returning({ id: workerAssignments.id })

  const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)

  await writeAuditLog({
    actorId:       user.id,
    actorName:     user.name,
    actorRole:     user.role,
    actorEntityId: current.legalEntityId,
    channel:       'WEB',
    eventType:     'WORKER_ASSIGNMENT.CHANGED',
    resourceType:  'worker_assignments',
    resourceId:    row.id,
    entityId:      current.legalEntityId,
    actionMode:    'UPDATE',
    metadata: {
      actionType:               data.actionType,
      actionReason:             data.actionReason,
      effectiveDate:            data.effectiveDate,
      previousAssignmentId:     current.id,
      previousAssignmentNumber: current.assignmentNumber,
      currentPointerRecomputed: true,
      recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
      sourceTransactionId:      data.sourceTransactionId,
    },
  }, tx)

  // Auto-promote new (or changed) line manager from EMPLOYEE → MANAGER
  const effectiveManagerId = data.lineManagerId ?? current.lineManagerId
  if (effectiveManagerId) {
    await promoteToManagerRoleTx(tx, user, effectiveManagerId)
  }

  return {
    mode:                'UPDATE',
    closedId:            current.id,
    newId:               row.id,
    newAssignmentNumber: newNum,
    current,
  }
}
