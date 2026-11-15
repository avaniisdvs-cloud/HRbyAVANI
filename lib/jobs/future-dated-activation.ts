/**
 * ED-ACTIVATION-01 - Future-dated worker assignment activation.
 *
 * Materialises worker_assignment rows whose effective date has arrived:
 *   1. per-person advisory lock
 *   2. recompute current worker_assignment pointer
 *   3. validate one effective row and one isCurrent row
 *   4. sync denormalised person and position pointers
 *   5. audit in the same transaction
 *
 * The job is idempotent. A second run sees no due non-current rows and exits.
 */
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm'
import cron from 'node-cron'
import { db, type Tx } from '@/lib/db'
import { persons, positions, workerAssignments } from '@/drizzle/schema'
import type { WorkerAssignment } from '@/drizzle/schema'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { todayUae } from '@/lib/effective-date'
import { logger } from '@/lib/logger'
import { evaluateManagerRole } from '@/lib/evaluate-manager-role'
import {
  lockWorkerAssignmentTimelineTx,
  recomputeCurrentWorkerAssignmentPointerTx,
} from '@/modules/core-hr/worker-assignments/services'

const SYSTEM_ACTOR_ID   = '00000000-0000-0000-0000-000000000000'
const SYSTEM_ACTOR_NAME = 'system: future-dated-activation'
const ACTIVE_POSITION_STATUSES = new Set(['ACTIVE', 'ON_LEAVE', 'SUSPENDED'])

type SystemActor = {
  id: string
  name: string
  role: string
  legalEntityId: string
}

type PersonMaterializedState = {
  legalEntityId: string
  currentDepartmentId: string | null
  currentPositionId: string | null
  currentJobId: string | null
  currentLocationId: string | null
  currentGradeId: string | null
  lineManagerId: string | null
  dottedLineManagerId: string | null
  employmentType: string
  contractedHoursPerWeek: string
  assignmentStatus: string
}

type ActivationAssignment = Pick<
  WorkerAssignment,
  | 'id'
  | 'personId'
  | 'legalEntityId'
  | 'assignmentNumber'
  | 'effectiveStartDate'
  | 'effectiveEndDate'
  | 'assignmentStatus'
  | 'departmentId'
  | 'positionId'
  | 'jobId'
  | 'locationId'
  | 'gradeId'
  | 'lineManagerId'
  | 'dottedLineManagerId'
  | 'employmentType'
  | 'contractedHoursPerWeek'
>

export interface FutureDatedActivationResult {
  scanAt: Date
  activationDate: string
  candidatesFound: number
  personsFound: number
  activated: number
  skipped: Array<{ personId: string; reason: string }>
  errors: Array<{ personId: string; message: string }>
  activatedAssignments: Array<{
    personId: string
    assignmentId: string
    assignmentNumber: string
    effectiveStartDate: string
  }>
}

function systemActor(legalEntityId: string): SystemActor {
  return {
    id: SYSTEM_ACTOR_ID,
    name: SYSTEM_ACTOR_NAME,
    role: 'SUPER_ADMIN',
    legalEntityId,
  }
}

async function loadPersonMaterializedStateTx(
  tx: Tx,
  personId: string,
): Promise<PersonMaterializedState | null> {
  const [row] = await tx
    .select({
      legalEntityId:           persons.legalEntityId,
      currentDepartmentId:     persons.currentDepartmentId,
      currentPositionId:       persons.currentPositionId,
      currentJobId:            persons.currentJobId,
      currentLocationId:       persons.currentLocationId,
      currentGradeId:          persons.currentGradeId,
      lineManagerId:           persons.lineManagerId,
      dottedLineManagerId:     persons.dottedLineManagerId,
      employmentType:          persons.employmentType,
      contractedHoursPerWeek:  persons.contractedHoursPerWeek,
      assignmentStatus:        persons.assignmentStatus,
    })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.id, personId),
    ))
    .limit(1)

  return row ?? null
}

async function loadAssignmentByIdTx(
  tx: Tx,
  assignmentId: string,
): Promise<ActivationAssignment | null> {
  const [row] = await tx
    .select({
      id:                     workerAssignments.id,
      personId:               workerAssignments.personId,
      legalEntityId:          workerAssignments.legalEntityId,
      assignmentNumber:       workerAssignments.assignmentNumber,
      effectiveStartDate:     workerAssignments.effectiveStartDate,
      effectiveEndDate:       workerAssignments.effectiveEndDate,
      assignmentStatus:       workerAssignments.assignmentStatus,
      departmentId:           workerAssignments.departmentId,
      positionId:             workerAssignments.positionId,
      jobId:                  workerAssignments.jobId,
      locationId:             workerAssignments.locationId,
      gradeId:                workerAssignments.gradeId,
      lineManagerId:          workerAssignments.lineManagerId,
      dottedLineManagerId:    workerAssignments.dottedLineManagerId,
      employmentType:         workerAssignments.employmentType,
      contractedHoursPerWeek: workerAssignments.contractedHoursPerWeek,
    })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.id, assignmentId),
    ))
    .limit(1)

  return row ?? null
}

async function dueRowsForPersonTx(
  tx: Tx,
  personId: string,
  activationDate: string,
): Promise<Array<{ id: string }>> {
  return tx
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      eq(workerAssignments.isCurrent, false),
      lte(workerAssignments.effectiveStartDate, activationDate),
      gte(workerAssignments.effectiveEndDate, activationDate),
    ))
    .limit(2)
}

async function validateActivationInvariantsTx(
  tx: Tx,
  personId: string,
  expectedAssignmentId: string,
  activationDate: string,
): Promise<void> {
  const effectiveRows = await tx
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      lte(workerAssignments.effectiveStartDate, activationDate),
      gte(workerAssignments.effectiveEndDate, activationDate),
    ))
    .limit(2)

  if (effectiveRows.length !== 1) {
    throw new Error(`ED_ACTIVATION_INVARIANT_EFFECTIVE_ROW_COUNT: expected 1 effective assignment, found ${effectiveRows.length}`)
  }

  const currentRows = await tx
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(2)

  if (currentRows.length !== 1) {
    throw new Error(`ED_ACTIVATION_INVARIANT_CURRENT_ROW_COUNT: expected 1 current assignment, found ${currentRows.length}`)
  }

  if (effectiveRows[0].id !== expectedAssignmentId || currentRows[0].id !== expectedAssignmentId) {
    throw new Error('ED_ACTIVATION_INVARIANT_POINTER_MISMATCH: effective row and isCurrent row differ')
  }
}

async function syncPersonPointersTx(
  tx: Tx,
  actor: SystemActor,
  personId: string,
  assignment: ActivationAssignment,
): Promise<PersonMaterializedState | null> {
  const before = await loadPersonMaterializedStateTx(tx, personId)
  if (!before) return null

  await tx
    .update(persons)
    .set({
      legalEntityId:          assignment.legalEntityId,
      currentDepartmentId:    assignment.departmentId,
      currentPositionId:      assignment.positionId,
      currentJobId:           assignment.jobId,
      currentLocationId:      assignment.locationId,
      currentGradeId:         assignment.gradeId,
      lineManagerId:          assignment.lineManagerId,
      dottedLineManagerId:    assignment.dottedLineManagerId,
      employmentType:         assignment.employmentType,
      contractedHoursPerWeek: assignment.contractedHoursPerWeek,
      assignmentStatus:       assignment.assignmentStatus,
      updatedBy:              actor.id,
      updatedByName:          actor.name,
      updatedDate:            new Date(),
      lastUpdatedDate:        new Date(),
    })
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.id, personId),
    ))

  return before
}

async function syncPositionOccupancyTx(
  tx: Tx,
  actor: SystemActor,
  personId: string,
  previousPositionId: string | null,
  assignment: ActivationAssignment,
): Promise<void> {
  if (previousPositionId && previousPositionId !== assignment.positionId) {
    await tx
      .update(positions)
      .set({
        isOccupied:         false,
        occupiedByPersonId: null,
        vacancyStartDate:   activationVacancyDate(assignment),
        updatedBy:          actor.id,
        updatedByName:      actor.name,
        updatedDate:        new Date(),
        lastUpdatedDate:    new Date(),
      })
      .where(and(
        eq(positions.tenantId, TENANT_ID),
        eq(positions.id, previousPositionId),
        eq(positions.occupiedByPersonId, personId),
      ))
  }

  if (!assignment.positionId) return

  const occupiesPosition = ACTIVE_POSITION_STATUSES.has(assignment.assignmentStatus)
  await tx
    .update(positions)
    .set({
      isOccupied:         occupiesPosition,
      occupiedByPersonId: occupiesPosition ? personId : null,
      vacancyStartDate:   occupiesPosition ? null : activationVacancyDate(assignment),
      updatedBy:          actor.id,
      updatedByName:      actor.name,
      updatedDate:        new Date(),
      lastUpdatedDate:    new Date(),
    })
    .where(and(
      eq(positions.tenantId, TENANT_ID),
      eq(positions.id, assignment.positionId),
    ))
}

function activationVacancyDate(assignment: ActivationAssignment): string {
  return assignment.effectiveStartDate
}

async function activatePersonTx(
  tx: Tx,
  personId: string,
  activationDate: string,
  legalEntityId: string,
): Promise<{
  activated: boolean
  skippedReason?: string
  assignment?: ActivationAssignment
}> {
  await lockWorkerAssignmentTimelineTx(tx, personId)

  const dueRows = await dueRowsForPersonTx(tx, personId, activationDate)
  if (dueRows.length === 0) {
    return { activated: false, skippedReason: 'already-current-or-no-due-row' }
  }

  const actor = systemActor(legalEntityId)
  const { currentAssignmentId } = await recomputeCurrentWorkerAssignmentPointerTx(tx, actor, personId)
  if (!currentAssignmentId) {
    throw new Error('ED_ACTIVATION_NO_EFFECTIVE_ASSIGNMENT: recompute found no effective assignment')
  }

  await validateActivationInvariantsTx(tx, personId, currentAssignmentId, activationDate)

  const assignment = await loadAssignmentByIdTx(tx, currentAssignmentId)
  if (!assignment) {
    throw new Error(`ED_ACTIVATION_ASSIGNMENT_NOT_FOUND: ${currentAssignmentId}`)
  }

  const beforePerson = await syncPersonPointersTx(tx, actor, personId, assignment)
  await syncPositionOccupancyTx(tx, actor, personId, beforePerson?.currentPositionId ?? null, assignment)

  if (beforePerson?.lineManagerId && beforePerson.lineManagerId !== assignment.lineManagerId) {
    await evaluateManagerRole(beforePerson.lineManagerId, actor, tx)
  }
  if (assignment.lineManagerId) {
    await evaluateManagerRole(assignment.lineManagerId, actor, tx)
  }

  const beforeValues = beforePerson ? {
    legalEntityId:          beforePerson.legalEntityId,
    currentDepartmentId:    beforePerson.currentDepartmentId,
    currentPositionId:      beforePerson.currentPositionId,
    currentJobId:           beforePerson.currentJobId,
    currentLocationId:      beforePerson.currentLocationId,
    currentGradeId:         beforePerson.currentGradeId,
    lineManagerId:          beforePerson.lineManagerId,
    dottedLineManagerId:    beforePerson.dottedLineManagerId,
    employmentType:         beforePerson.employmentType,
    contractedHoursPerWeek: beforePerson.contractedHoursPerWeek,
    assignmentStatus:       beforePerson.assignmentStatus,
  } : {}

  const afterValues = {
    legalEntityId:          assignment.legalEntityId,
    currentDepartmentId:    assignment.departmentId,
    currentPositionId:      assignment.positionId,
    currentJobId:           assignment.jobId,
    currentLocationId:      assignment.locationId,
    currentGradeId:         assignment.gradeId,
    lineManagerId:          assignment.lineManagerId,
    dottedLineManagerId:    assignment.dottedLineManagerId,
    employmentType:         assignment.employmentType,
    contractedHoursPerWeek: assignment.contractedHoursPerWeek,
    assignmentStatus:       assignment.assignmentStatus,
  }

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: assignment.legalEntityId,
    channel:       'BATCH',
    eventType:     'WORKER_ASSIGNMENT.FUTURE_DATED_ACTIVATED',
    resourceType:  'worker_assignments',
    resourceId:    assignment.id,
    entityId:      assignment.legalEntityId,
    oldValues:     beforeValues,
    newValues:     afterValues,
    changedFields: diffFields(beforeValues, afterValues),
    metadata: {
      personId,
      activationDate,
      assignmentNumber: assignment.assignmentNumber,
      effectiveStartDate: assignment.effectiveStartDate,
      currentPointerRecomputed: true,
      personPointersSynced: Boolean(beforePerson),
      positionOccupancySynced: true,
      invariantValidation: 'passed',
    },
  }, tx)

  return { activated: true, assignment }
}

export async function runFutureDatedActivation(
  now: Date = new Date(),
): Promise<FutureDatedActivationResult> {
  const activationDate = todayUae()
  const dueRows = await db
    .select({
      id:                 workerAssignments.id,
      personId:           workerAssignments.personId,
      legalEntityId:      workerAssignments.legalEntityId,
      effectiveStartDate: workerAssignments.effectiveStartDate,
    })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      eq(workerAssignments.isCurrent, false),
      lte(workerAssignments.effectiveStartDate, activationDate),
      gte(workerAssignments.effectiveEndDate, activationDate),
    ))
    .orderBy(asc(workerAssignments.personId), asc(workerAssignments.effectiveStartDate))

  const candidatesByPerson = new Map<string, { legalEntityId: string }>()
  for (const row of dueRows) {
    if (!candidatesByPerson.has(row.personId)) {
      candidatesByPerson.set(row.personId, { legalEntityId: row.legalEntityId })
    }
  }

  const result: FutureDatedActivationResult = {
    scanAt: now,
    activationDate,
    candidatesFound: dueRows.length,
    personsFound: candidatesByPerson.size,
    activated: 0,
    skipped: [],
    errors: [],
    activatedAssignments: [],
  }

  for (const [personId, candidate] of candidatesByPerson.entries()) {
    try {
      const activation = await db.transaction(async tx =>
        activatePersonTx(tx as Tx, personId, activationDate, candidate.legalEntityId),
      )

      if (!activation.activated) {
        result.skipped.push({ personId, reason: activation.skippedReason ?? 'not-activated' })
        continue
      }

      result.activated++
      if (activation.assignment) {
        result.activatedAssignments.push({
          personId,
          assignmentId:        activation.assignment.id,
          assignmentNumber:    activation.assignment.assignmentNumber,
          effectiveStartDate:  activation.assignment.effectiveStartDate,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ personId, message })
      logger.error('future-dated-activation', 'person activation failed', {
        personId,
        error: message.slice(0, 300),
      })
    }
  }

  return result
}

/**
 * Schedule the activation job for 00:05 UAE (20:05 UTC).
 * Does not auto-run on import; call from the process driver.
 */
export function startFutureDatedActivationCron(): cron.ScheduledTask {
  return cron.schedule('5 20 * * *', async () => {
    try {
      const result = await runFutureDatedActivation()
      logger.info('future-dated-activation', 'tick complete', {
        activationDate: result.activationDate,
        candidatesFound: result.candidatesFound,
        personsFound: result.personsFound,
        activated: result.activated,
        skipped: result.skipped.length,
        errors: result.errors.length,
      })
    } catch (err) {
      logger.error('future-dated-activation', 'tick fatal', {
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      })
    }
  }, { timezone: 'UTC' })
}
