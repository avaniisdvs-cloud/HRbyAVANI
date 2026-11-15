/**
 * Workflow apply-back for approved Transfer / Promotion requests.
 *
 * Mirrors modules/core-hr/probation/workflow-actions.applyProbationOutcome: called
 * by lib/workflow-engine.dispatchResourceCompletion on FINAL approval, joining the
 * engine's post-claim transaction so the assignment change + audit are atomic with
 * the workflow completion.
 *
 * BACKGROUND: previously, an APPROVED transfer_request only flipped status + sent a
 * notification — the worker_assignment was never changed (the approval was
 * cosmetic). This applies the approved change via the proven tx-aware primitive
 * changeAssignmentTx (close current row + open new row), then records the immutable
 * employment_action and syncs persons.* pointers — exactly like runLifecycleChange,
 * but driven by the request row and the approver (no interactive auth).
 *
 * Hard Rule 1: every write joins the same transaction + writes an audit row.
 * The workflow engine remains the system of record — this only APPLIES an already
 * human-approved decision; it never initiates one.
 */
import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { isFutureDated, yearsOfService } from '@/lib/effective-date'
import { employmentActions, persons, transferRequests } from '@/drizzle/schema'
import { deriveNoticePeriodDays } from '../contracts/services'
import { changeAssignmentTx } from '../worker-assignments/services'

export async function applyTransferOutcome(params: {
  requestId:        string
  finalStatus:      'APPROVED' | 'REJECTED'
  actorPersonId:    string
  actorDisplayName: string
  legalEntityId:    string
  /** Engine post-claim transaction — all writes join it for atomicity. */
  tx:               DbOrTx
}): Promise<void> {
  const { requestId, finalStatus, actorPersonId, actorDisplayName, tx } = params

  // Only an approval applies a change. Rejection/cancellation: nothing to apply
  // (the engine has already set the request status + notified).
  if (finalStatus !== 'APPROVED') return

  const [request] = await tx
    .select()
    .from(transferRequests)
    .where(and(eq(transferRequests.tenantId, TENANT_ID), eq(transferRequests.id, requestId)))
    .limit(1)
  if (!request) throw new Error(`Transfer request not found: ${requestId}`)

  const [person] = await tx
    .select()
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, request.personId)))
    .limit(1)
  if (!person) throw new Error(`Person not found for transfer request: ${request.personId}`)

  const actionType: 'TRANSFER' | 'PROMOTION' = request.requestType === 'PROMOTION' ? 'PROMOTION' : 'TRANSFER'
  const effectiveDate = request.effectiveDate
  const reason = request.notes?.trim() || request.reason

  const assignmentMode = isFutureDated(effectiveDate) ? 'FUTURE_DATED' : 'UPDATE'

  // Post-approval system apply: role is irrelevant outside correction mode.
  const actor = {
    id:            actorPersonId,
    name:          actorDisplayName,
    role:          'SUPER_ADMIN',
    personId:      actorPersonId,
    legalEntityId: person.legalEntityId,
  }

  // Apply the approved assignment change in the correct effective-dating mode.
  const assignmentResult = await changeAssignmentTx(tx, actor, {
    personId:     request.personId,
    effectiveDate,
    actionType,
    actionReason: reason,
    departmentId: request.targetDepartmentId ?? undefined,
    positionId:   request.targetPositionId   ?? undefined,
    gradeId:      request.targetGradeId       ?? undefined,   // PROMOTION
    mode:         assignmentMode,
  })
  if (assignmentResult.mode !== assignmentMode) throw new Error('unexpected assignment mode')
  const newAssignmentId = assignmentResult.mode === 'UPDATE'
    ? assignmentResult.newId
    : assignmentResult.futureId
  const { current: currentAssignment } = assignmentResult

  // BR-NP-001 — recompute notice period from total service.
  const newNotice = deriveNoticePeriodDays(yearsOfService(person.hireDate, effectiveDate))

  // Immutable employment_action row (before/after snapshot).
  const [actionRow] = await tx
    .insert(employmentActions)
    .values({
      tenantId:             TENANT_ID,
      personId:             request.personId,
      legalEntityId:        person.legalEntityId,
      assignmentId:         newAssignmentId,
      actionType,
      actionDate:           effectiveDate,
      effectiveDate,
      reasonCode:           actionType,
      reasonText:           reason,
      beforeDepartmentId:   currentAssignment.departmentId,
      beforePositionId:     currentAssignment.positionId,
      beforeGradeId:        currentAssignment.gradeId,
      beforeLocationId:     currentAssignment.locationId,
      beforeManagerId:      currentAssignment.lineManagerId,
      beforeEmploymentType: currentAssignment.employmentType,
      beforeStatus:         currentAssignment.assignmentStatus,
      afterDepartmentId:    request.targetDepartmentId ?? currentAssignment.departmentId,
      afterPositionId:      request.targetPositionId   ?? currentAssignment.positionId,
      afterGradeId:         request.targetGradeId      ?? currentAssignment.gradeId,
      afterLocationId:      currentAssignment.locationId,
      afterManagerId:       currentAssignment.lineManagerId,
      afterEmploymentType:  currentAssignment.employmentType,
      afterStatus:          currentAssignment.assignmentStatus,
      initiatedBy:          request.requestedById,
      approvedBy:           actorPersonId,
      approvalDate:         effectiveDate,
      status:               'APPROVED',
      createdBy:            actorPersonId,
      createdByName:        actorDisplayName,
    })
    .returning({ id: employmentActions.id })

  // Denormalised current pointers move only for immediately effective changes.
  if (assignmentMode === 'UPDATE') {
    await tx
      .update(persons)
      .set({
        currentDepartmentId: request.targetDepartmentId ?? person.currentDepartmentId,
        currentPositionId:   request.targetPositionId   ?? person.currentPositionId,
        currentGradeId:      request.targetGradeId       ?? person.currentGradeId,
        noticePeriodDays:    newNotice,
        updatedBy:           actorPersonId,
        updatedByName:       actorDisplayName,
        updatedDate:         new Date(),
        lastUpdatedDate:     new Date(),
      })
      .where(eq(persons.id, request.personId))
  }

  await writeAuditLog({
    actorId:       actorPersonId,
    actorName:     actorDisplayName,
    actorRole:     'SUPER_ADMIN',
    actorEntityId: person.legalEntityId,
    channel:       'SYSTEM',
    eventType:     `EMPLOYMENT_ACTION.${actionType}`,
    resourceType:  'employment_actions',
    resourceId:    actionRow.id,
    entityId:      person.legalEntityId,
    metadata: {
      personId:                request.personId,
      transferRequestId:       requestId,
      effectiveDate,
      reason,
      previousAssignmentId:    currentAssignment.id,
      newAssignmentId,
      assignmentMode,
      appliedNoticePeriodDays: newNotice,
      personPointersUpdated:   assignmentMode === 'UPDATE',
      appliedViaWorkflow:      true,
    },
  }, tx)
}
