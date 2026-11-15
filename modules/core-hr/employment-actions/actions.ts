'use server'

/**
 * S3-06 — Employment-action Server Actions.
 *
 * Each public action records ONE row in `employment_actions` (immutable
 * before/after snapshot) AND closes-current+opens-new on
 * `worker_assignments` (effective-dated). Per QA-Audit-C3 every action runs
 * BOTH writes inside a SINGLE Drizzle transaction so the audit trail can
 * never desync from the assignment table.
 *
 * Per QA-Audit-H1 every public Server Action runs the corresponding Zod
 * schema's .parse() on its input — TypeScript types are not enforced at
 * the wire boundary.
 *
 * Public actions:
 *   • hire        — initial assignment + employment_action(HIRE)
 *   • transfer    — department / location change → TRANSFER
 *   • promotion   — grade / position upward change → PROMOTION
 *   • gradeChange — generic grade move (up or down) → PROMOTION/DEMOTION
 *
 * BR-NP-001 — when a TRANSFER results in service crossing 5/10 years,
 *             persons.notice_period_days is recomputed.
 */
import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import {
  employmentActions, workerAssignments, persons, grades,
} from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole, type SessionUser } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { isFutureDated, yearsOfService } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import {
  createAssignmentTx, changeAssignmentTx,
} from '../worker-assignments/services'
import { deriveNoticePeriodDays } from '../contracts/services'
import {
  HireSchema, TransferSchema, PromotionSchema, GradeChangeSchema,
  type HireInput, type TransferInput, type PromotionInput, type GradeChangeInput,
} from './validations'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function actorOf(user: SessionUser) {
  return {
    id:            user.id,
    name:          user.name,
    role:          user.role,
    personId:      user.personId,
    legalEntityId: user.legalEntityId,
  }
}

// ── Hire ───────────────────────────────────────────────────────────────────

export async function hire(input: HireInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'create')
  const data = HireSchema.parse(input)

  return await db.transaction(async tx => {
    // QA-Audit-C2 — entity scope.
    const [person] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
      .limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity hire not allowed')
    }
    if (data.legalEntityId !== person.legalEntityId) {
      throw new Error('legalEntityId must match the person\'s entity')
    }

    // 1) Open the worker_assignment row (Hard Rule 3 — fails if one exists).
    const { id: assignmentId } = await createAssignmentTx(tx, actorOf(user), {
      personId:           data.personId,
      legalEntityId:      data.legalEntityId,
      effectiveStartDate: data.effectiveStartDate,
      positionId:         data.positionId,
      jobId:              data.jobId,
      departmentId:       data.departmentId,
      locationId:         data.locationId,
      gradeId:            data.gradeId,
      businessUnitId:     data.businessUnitId,
      lineManagerId:      data.lineManagerId,
      employmentType:     data.employmentType,
      contractedHoursPerWeek: data.contractedHoursPerWeek,
      actionType:         'HIRE',
      actionReason:       data.reasonText,
    })

    // 2) Record the employment_action (immutable before/after snapshot).
    const [actionRow] = await tx
      .insert(employmentActions)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        legalEntityId:   data.legalEntityId,
        assignmentId,
        actionType:      'HIRE',
        actionDate:      data.effectiveStartDate,
        effectiveDate:   data.effectiveStartDate,
        reasonCode:      'NEW_HIRE',
        reasonText:      data.reasonText,
        afterDepartmentId: data.departmentId,
        afterPositionId:   data.positionId,
        afterGradeId:      data.gradeId,
        afterLocationId:   data.locationId,
        afterEmploymentType: data.employmentType,
        afterStatus:       'ACTIVE',
        initiatedBy:       user.personId ?? user.id,
        approvedBy:        user.personId ?? user.id,
        approvalDate:      data.effectiveStartDate,
        status:            'APPROVED',
        createdBy:         user.id,
        createdByName:     user.name,
      })
      .returning({ id: employmentActions.id })

    // 3) Sync persons.* denormalised pointers.
    await tx
      .update(persons)
      .set({
        assignmentStatus:    'ACTIVE',
        currentDepartmentId: data.departmentId,
        currentPositionId:   data.positionId,
        currentJobId:        data.jobId,
        currentLocationId:   data.locationId,
        currentGradeId:      data.gradeId,
        lineManagerId:       data.lineManagerId,
        updatedBy:           user.id,
        updatedByName:       user.name,
        updatedDate:         new Date(),
        lastUpdatedDate:     new Date(),
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))

    // 4) Audit row in same tx (Hard Rule 1).
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId,
      channel:       'WEB',
      eventType:     'EMPLOYMENT_ACTION.HIRE',
      resourceType:  'employment_actions',
      resourceId:    actionRow.id,
      entityId:      data.legalEntityId,
      newValues: {
        actionType:    'HIRE',
        personId:      data.personId,
        departmentId:  data.departmentId,
        effectiveDate: data.effectiveStartDate,
      },
    }, tx)

    return { assignmentId, actionId: actionRow.id }
  })
  } catch (e) { translateError(e, 'hire') }
}

// ── Transfer ──────────────────────────────────────────────────────────────

export async function transfer(input: TransferInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  // QA-Audit-H1 — explicit Zod parse at the wire boundary.
  const data = TransferSchema.parse(input)
  return await runLifecycleChange('TRANSFER', data.personId, data.effectiveDate, data.reasonText, {
    departmentId:        data.newDepartmentId,
    locationId:          data.newLocationId,
    businessUnitId:      data.newBusinessUnitId,
    lineManagerId:       data.newLineManagerId,
    projectId:           data.newProjectId,
    projectAllocationPct: data.newProjectAllocationPct,
  })
  } catch (e) { translateError(e, 'transfer') }
}

// ── Promotion ─────────────────────────────────────────────────────────────

export async function promotion(input: PromotionInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  const data = PromotionSchema.parse(input)
  return await runGradeChange(data.personId, data.effectiveDate, data.reasonText, {
    newGradeId:    data.newGradeId,
    newPositionId: data.newPositionId,
    newJobId:      data.newJobId,
  })
  } catch (e) { translateError(e, 'promotion') }
}

// ── Generic grade change (auto PROMOTION vs DEMOTION) ────────────────────

export async function gradeChange(input: GradeChangeInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  const data = GradeChangeSchema.parse(input)
  return await runGradeChange(data.personId, data.effectiveDate, data.reasonText, {
    newGradeId: data.newGradeId,
  })
  } catch (e) { translateError(e, 'gradeChange') }
}

// ══════════════════════════════════════════════════════════════════════════
// Internal helpers — shared across transfer / promotion / grade-change.
// All DB work runs in ONE transaction (QA-Audit-C3).
// ══════════════════════════════════════════════════════════════════════════

interface AssignmentChange {
  positionId?:    string
  jobId?:         string
  departmentId?:  string
  locationId?:    string
  gradeId?:       string
  businessUnitId?: string
  lineManagerId?:  string
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'TEMPORARY' | 'TASK_BASED' | 'FLEXIBLE' | 'REMOTE' | 'SHARED'
  // BR-PRJ-001: project cost-centre assignment
  projectId?:              string
  projectAllocationPct?:   number
}

async function runLifecycleChange(
  actionType: 'TRANSFER' | 'PROMOTION' | 'DEMOTION',
  personId:   string,
  effectiveDate: string,
  reason:     string,
  delta:      AssignmentChange,
): Promise<{ assignmentId: string; actionId: string }> {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'edit')

  return await db.transaction(async tx => {
    const [person] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)
    if (!person) throw new Error('person not found')

    // QA-Audit-C2 — entity scope.
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity lifecycle action not allowed')
    }

    // BR-ED-001: future-effective lifecycle changes must stay pending until
    // their effective date; current/today-or-past changes apply immediately.
    const assignmentMode = isFutureDated(effectiveDate) ? 'FUTURE_DATED' : 'UPDATE'

    // changeAssignmentTx fetches the current row and applies the requested
    // effective-dating mode inside our tx.
    const assignmentResult = await changeAssignmentTx(
      tx, actorOf(user),
      {
        personId,
        effectiveDate,
        actionType,
        actionReason: reason,
        departmentId:   delta.departmentId,
        positionId:     delta.positionId,
        jobId:          delta.jobId,
        locationId:     delta.locationId,
        gradeId:        delta.gradeId,
        businessUnitId:       delta.businessUnitId,
        lineManagerId:        delta.lineManagerId,
        employmentType:       delta.employmentType,
        projectId:            delta.projectId,
        projectAllocationPct: delta.projectAllocationPct,
        mode: assignmentMode,
      },
    )
    if (assignmentResult.mode !== assignmentMode) throw new Error('unexpected assignment mode')
    const newAssignmentId = assignmentResult.mode === 'UPDATE'
      ? assignmentResult.newId
      : assignmentResult.futureId
    const { current: currentAssignment } = assignmentResult

    // BR-NP-001 — recompute notice period from total service.
    const newNotice = deriveNoticePeriodDays(
      yearsOfService(person.hireDate, effectiveDate),
    )

    // Insert the immutable employment_action row.
    const [actionRow] = await tx
      .insert(employmentActions)
      .values({
        tenantId:      TENANT_ID,
        personId,
        legalEntityId: person.legalEntityId,
        assignmentId:  newAssignmentId,
        actionType,
        actionDate:    effectiveDate,
        effectiveDate,
        reasonCode:    actionType,
        reasonText:    reason,
        beforeDepartmentId:  currentAssignment.departmentId,
        beforePositionId:    currentAssignment.positionId,
        beforeGradeId:       currentAssignment.gradeId,
        beforeLocationId:    currentAssignment.locationId,
        beforeManagerId:     currentAssignment.lineManagerId,
        beforeEmploymentType: currentAssignment.employmentType,
        beforeStatus:        currentAssignment.assignmentStatus,
        afterDepartmentId:   delta.departmentId  ?? currentAssignment.departmentId,
        afterPositionId:     delta.positionId    ?? currentAssignment.positionId,
        afterGradeId:        delta.gradeId       ?? currentAssignment.gradeId,
        afterLocationId:     delta.locationId    ?? currentAssignment.locationId,
        afterManagerId:      delta.lineManagerId ?? currentAssignment.lineManagerId,
        afterEmploymentType: delta.employmentType ?? currentAssignment.employmentType,
        afterStatus:         currentAssignment.assignmentStatus,
        initiatedBy:         user.personId ?? user.id,
        approvedBy:          user.personId ?? user.id,
        approvalDate:        effectiveDate,
        status:              'APPROVED',
        createdBy:           user.id,
        createdByName:       user.name,
      })
      .returning({ id: employmentActions.id })

    // BR-ED-002: denormalised current pointers are materialised-current state.
    // They must not move ahead of a future-effective assignment.
    if (assignmentMode === 'UPDATE') {
      await tx
        .update(persons)
        .set({
          currentDepartmentId: delta.departmentId  ?? person.currentDepartmentId,
          currentPositionId:   delta.positionId    ?? person.currentPositionId,
          currentJobId:        delta.jobId         ?? person.currentJobId,
          currentLocationId:   delta.locationId    ?? person.currentLocationId,
          currentGradeId:      delta.gradeId       ?? person.currentGradeId,
          lineManagerId:       delta.lineManagerId ?? person.lineManagerId,
          noticePeriodDays:    newNotice,
          updatedBy:           user.id,
          updatedByName:       user.name,
          updatedDate:         new Date(),
          lastUpdatedDate:     new Date(),
        })
        .where(eq(persons.id, personId))
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: person.legalEntityId,
      channel:       'WEB',
      eventType:     `EMPLOYMENT_ACTION.${actionType}`,
      resourceType:  'employment_actions',
      resourceId:    actionRow.id,
      entityId:      person.legalEntityId,
      metadata: {
        personId,
        effectiveDate,
        reason,
        previousAssignmentId:    currentAssignment.id,
        newAssignmentId,
        assignmentMode,
        appliedNoticePeriodDays: newNotice,
        personPointersUpdated:   assignmentMode === 'UPDATE',
      },
    }, tx)

    return { assignmentId: newAssignmentId, actionId: actionRow.id }
  })
}

async function runGradeChange(
  personId:      string,
  effectiveDate: string,
  reason:        string,
  delta:         { newGradeId: string; newPositionId?: string; newJobId?: string },
): Promise<{ assignmentId: string; actionId: string }> {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'edit')

  // Pre-flight: read both grade levels (outside tx — pure read, ok).
  const [currentAssignment] = await db
    .select({ gradeId: workerAssignments.gradeId })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)
  if (!currentAssignment) throw new Error('no current assignment for this person')

  let actionType: 'PROMOTION' | 'DEMOTION' = 'PROMOTION'
  if (currentAssignment.gradeId) {
    const [oldGrade] = await db
      .select({ level: grades.gradeLevel })
      .from(grades)
      .where(eq(grades.id, currentAssignment.gradeId))
      .limit(1)
    const [newGrade] = await db
      .select({ level: grades.gradeLevel })
      .from(grades)
      .where(eq(grades.id, delta.newGradeId))
      .limit(1)
    const oldLevel = oldGrade?.level ?? 0
    const newLevel = newGrade?.level ?? 0
    actionType = newLevel < oldLevel ? 'DEMOTION' : 'PROMOTION'
  }

  return runLifecycleChange(actionType, personId, effectiveDate, reason, {
    gradeId:    delta.newGradeId,
    positionId: delta.newPositionId,
    jobId:      delta.newJobId,
  })
}
