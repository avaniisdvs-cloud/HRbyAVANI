'use server'

import { translateError, getErrorMessage } from '@/lib/app-error'
import { and, count, desc, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentUser } from '@/lib/auth'
import { evaluateViewerAccess } from '@/modules/workflow-intelligence/access'
import { TENANT_ID } from '@/lib/constants'
import {
  notificationLog,
  events,
  userAccounts,
} from '@/drizzle/schema'
import { absenceEntries, absenceTypes, persons } from '@/drizzle/schema'
import {
  workflowInstancesV2,
  workflowStepInstances,
} from '@/drizzle/schema/workflow-engine'
import { takeWorkflowAction } from '@/lib/workflow-engine'
import { ACTIONABLE_INSTANCE_STATUSES, TERMINAL_RESOURCE_STATUSES } from '@/modules/workflow'

// ACTIONABLE_INSTANCE_STATUSES (imported from the workflow module — the single
// source of truth) are workflow-instance statuses that still genuinely await an
// approver's action. Anything else (APPROVED/REJECTED/CANCELLED/RECALLED) is
// terminal — an approval notification pointing at such an instance must NOT count
// as unread/actionable, even if its own status column was never flipped to
// ACTIONED. Sharing the constant guarantees the bell can never disagree with the
// Approvals inbox, regardless of who decided the request or how.

export async function getMyNotifications(personId: string, _tenantId: string) {
  try {
    const rows = await db
      .select({
        id:             notificationLog.id,
        type:           notificationLog.notificationType,
        title:          notificationLog.subjectEn,
        message:        notificationLog.bodyEn,
        status:         notificationLog.status,
        createdAt:      notificationLog.createdDate,
        referenceId:    notificationLog.referenceId,
        referenceType:  notificationLog.referenceType,
        instanceStatus: workflowInstancesV2.status,
      })
      .from(notificationLog)
      // Reconcile each approval notification against its workflow instance's live
      // status. Join only fires for WORKFLOW_INSTANCE refs, so other notification
      // types (letters, absence entries) leave instanceStatus null and are untouched.
      .leftJoin(workflowInstancesV2, and(
        eq(notificationLog.referenceType, 'WORKFLOW_INSTANCE'),
        eq(workflowInstancesV2.id, notificationLog.referenceId),
      ))
      .where(and(
        eq(notificationLog.tenantId, TENANT_ID),
        eq(notificationLog.recipientPersonId, personId),
      ))
      .orderBy(desc(notificationLog.createdDate))
      .limit(50)

    return rows.map(r => {
      // A workflow-linked notification whose instance is no longer actionable is
      // treated as actioned — moves it to the "Actioned/Done" list and hides the
      // Approve/Reject buttons, matching what the Approvals inbox already shows.
      const wfTerminal =
        r.referenceType === 'WORKFLOW_INSTANCE' &&
        r.instanceStatus != null &&
        !ACTIONABLE_INSTANCE_STATUSES.includes(r.instanceStatus as typeof ACTIONABLE_INSTANCE_STATUSES[number])
      const isActioned = r.status === 'ACTIONED' || wfTerminal
      return {
        id:                 r.id,
        type:               r.type,
        title:              r.title ?? '',
        message:            r.message ?? '',
        isRead:             r.status === 'READ' || isActioned,
        isActioned,
        createdAt:          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        workflowInstanceId: r.referenceType === 'WORKFLOW_INSTANCE' ? r.referenceId : null,
        referenceId:        r.referenceId ?? null,
        referenceType:      r.referenceType ?? null,
      }
    })
  } catch (e) { translateError(e, 'getMyNotifications') }
}

export async function getUnreadCount(personId: string, _tenantId: string): Promise<number> {
  try {
    const [{ total }] = await db
      .select({ total: count() })
      .from(notificationLog)
      // Same reconciliation as getMyNotifications — keep the bell badge and the
      // panel list in lockstep with the workflow's real state.
      .leftJoin(workflowInstancesV2, and(
        eq(notificationLog.referenceType, 'WORKFLOW_INSTANCE'),
        eq(workflowInstancesV2.id, notificationLog.referenceId),
      ))
      .where(and(
        eq(notificationLog.tenantId, TENANT_ID),
        eq(notificationLog.recipientPersonId, personId),
        notInArray(notificationLog.status, ['READ', 'ACTIONED']),
        // Exclude approval notifications whose instance is already terminal.
        or(
          ne(notificationLog.referenceType, 'WORKFLOW_INSTANCE'),
          isNull(workflowInstancesV2.id),
          inArray(workflowInstancesV2.status, [...ACTIONABLE_INSTANCE_STATUSES]),
        ),
      ))
    return total
  } catch (e) { translateError(e, 'getUnreadCount') }
}

export async function markAllRead(
  personId: string,
  _tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      await db
        .update(notificationLog)
        .set({ status: 'READ', readAt: new Date() })
        .where(and(
          eq(notificationLog.tenantId, TENANT_ID),
          eq(notificationLog.recipientPersonId, personId),
          ne(notificationLog.status, 'READ'),
        ))
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'markAllRead') }
}

export async function getApprovalDetail(workflowInstanceId: string) {
  try {
    const user = await getCurrentUser()

    const [instance] = await db
      .select({
        id:                  workflowInstancesV2.id,
        status:              workflowInstancesV2.status,
        resourceType:        workflowInstancesV2.resourceType,
        resourceId:          workflowInstancesV2.resourceId,
        initiatedByPersonId: workflowInstancesV2.initiatedByPersonId,
        legalEntityId:       workflowInstancesV2.legalEntityId,
        contextSnapshot:     workflowInstancesV2.contextSnapshot,
      })
      .from(workflowInstancesV2)
      .where(and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.id, workflowInstanceId),
      ))
      .limit(1)

    if (!instance) throw new Error('NOT_FOUND: workflow instance')

    // Access gate — aligned with Phase B getWorkflowTimeline (evaluateViewerAccess):
    //   SUPER_ADMIN global · HR_ADMIN/HR_DIRECTOR entity-scoped · others must be a
    //   stakeholder (initiator / in-chain assignee / decider / delegate). Plus the
    //   bell's legitimate signal: a notification recipient for this instance.
    // Fails closed: unauthorized → throw (handled by the panel as "no access").
    const pid = user.personId ?? null

    const stepRows = await db
      .select({ assignee: workflowStepInstances.assignedToPersonId, status: workflowStepInstances.status })
      .from(workflowStepInstances)
      .where(eq(workflowStepInstances.instanceId, workflowInstanceId))
    const stepAssigneePersonIds = stepRows.map(r => r.assignee)
    const hasPendingStep = stepRows.some(r => r.status === 'PENDING')

    let isDeciderOrDelegate = false
    if (pid) {
      const probe = await db
        .select({ id: workflowStepInstances.id })
        .from(workflowStepInstances)
        .where(and(
          eq(workflowStepInstances.instanceId, workflowInstanceId),
          or(
            eq(workflowStepInstances.decidedByPersonId, pid),
            eq(workflowStepInstances.delegatedToPersonId, pid),
          ),
        ))
        .limit(1)
      isDeciderOrDelegate = probe.length > 0
    }

    let allowed = evaluateViewerAccess({
      role:                  user.role,
      personId:              pid,
      viewerLegalEntityId:   user.legalEntityId,
      initiatedByPersonId:   instance.initiatedByPersonId,
      instanceLegalEntityId: instance.legalEntityId,
      stepAssigneePersonIds,
      isDeciderOrDelegate,
    })

    // Bell-specific stakeholder signal: recipient of a notification for this instance.
    if (!allowed && pid) {
      const [notifRow] = await db
        .select({ id: notificationLog.id })
        .from(notificationLog)
        .where(and(
          eq(notificationLog.tenantId, TENANT_ID),
          eq(notificationLog.recipientPersonId, pid),
          eq(notificationLog.referenceId, workflowInstanceId),
        ))
        .limit(1)
      allowed = !!notifRow
    }

    if (!allowed) {
      throw new Error('FORBIDDEN: you do not have access to this approval')
    }

    // ── Actionability — the single contract the action buttons obey ───────────
    // A request is actionable from the bell ONLY when the workflow instance is
    // non-terminal, a PENDING step exists, AND the underlying resource is not in
    // a terminal status. The last clause is what stops a CANCELLED leave whose
    // workflow row was never reconciled (LR-0000001 class) from showing live
    // Approve/Reject buttons even though the detail clearly reads CANCELLED.
    const instanceActionable = ACTIONABLE_INSTANCE_STATUSES
      .includes(instance.status as typeof ACTIONABLE_INSTANCE_STATUSES[number])
    function actionability(resourceStatus: string | null) {
      const terminalSet = TERMINAL_RESOURCE_STATUSES[instance.resourceType] ?? []
      if (resourceStatus != null && terminalSet.includes(resourceStatus)) {
        return { isActionable: false, actionDisabledReason: `Request is ${resourceStatus} — no longer actionable` }
      }
      if (!instanceActionable) {
        return { isActionable: false, actionDisabledReason: `Workflow is ${instance.status} — no longer actionable` }
      }
      if (!hasPendingStep) {
        return { isActionable: false, actionDisabledReason: 'No pending approval step' }
      }
      return { isActionable: true, actionDisabledReason: null as string | null }
    }

    // Leave request — look up by resourceId (v2 stores absence entry UUID)
    if (instance.resourceType === 'absence_entries') {
      const rows = await db
        .select({
          entry: absenceEntries,
          person: {
            id:           persons.id,
            fullNameEn:   persons.fullNameEn,
            personNumber: persons.personNumber,
          },
          absenceType: {
            typeNameEn: absenceTypes.typeNameEn,
            typeNameAr: absenceTypes.typeNameAr,
          },
        })
        .from(absenceEntries)
        .leftJoin(persons, eq(absenceEntries.personId, persons.id))
        .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
        .where(and(
          eq(absenceEntries.tenantId, TENANT_ID),
          eq(absenceEntries.id, instance.resourceId),
        ))
        .limit(1)

      if (!rows.length) return { instance, entry: null, person: null, absenceType: null, hireContext: null, ...actionability(null) }
      return { instance, ...rows[0], hireContext: null, ...actionability(rows[0].entry?.status ?? null) }
    }

    // Backdated hire approval — resourceType = 'persons', resourceId = personId
    if (instance.resourceType === 'persons' && instance.resourceId) {
      const [personRow] = await db
        .select({
          id:           persons.id,
          fullNameEn:   persons.fullNameEn,
          personNumber: persons.personNumber,
          hireDate:     persons.hireDate,
        })
        .from(persons)
        .where(and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.id, instance.resourceId),
        ))
        .limit(1)

      // Read backdatingDays and reason from the submission-time context snapshot.
      // These values were stored when the workflow was triggered and must not drift
      // as calendar days pass — the approver sees what was requested, not today's count.
      // Fall back to a live calculation only for legacy instances that pre-date this field.
      const ctxFields            = (instance.contextSnapshot as { fields?: Record<string, unknown> } | null)?.fields ?? {}
      const storedBackdatingDays = typeof ctxFields.backdatingDays === 'number' ? ctxFields.backdatingDays : null
      const storedReason         = typeof ctxFields.reason === 'string' ? ctxFields.reason : null

      return {
        instance,
        entry:       null,
        absenceType: null,
        person:      personRow
          ? { id: personRow.id, fullNameEn: personRow.fullNameEn, personNumber: personRow.personNumber }
          : null,
        hireContext: personRow?.hireDate
          ? {
              hireDate:      personRow.hireDate,
              backdatingDays: storedBackdatingDays ??
                Math.floor((Date.now() - new Date(personRow.hireDate).getTime()) / 86_400_000),
              reason: storedReason,
            }
          : null,
        ...actionability(null),
      }
    }

    return { instance, entry: null, person: null, absenceType: null, hireContext: null as { hireDate: Date | string; backdatingDays: number | null; reason: string | null } | null, ...actionability(null) }
  } catch (e) { translateError(e, 'getApprovalDetail') }
}

export async function approveRequest(
  workflowInstanceId: string,
  _actorId: string,
  _actorName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      // Find the pending v2 step for this instance
      const [pendingStep] = await db
        .select({ id: workflowStepInstances.id })
        .from(workflowStepInstances)
        .where(and(
          eq(workflowStepInstances.instanceId, workflowInstanceId),
          eq(workflowStepInstances.status, 'PENDING'),
        ))
        .limit(1)

      if (!pendingStep) return { success: false, error: 'No pending step found for this workflow.' }

      const result = await takeWorkflowAction({
        stepInstanceId: pendingStep.id,
        actorPersonId:  'CURRENT_USER',
        decision:       'APPROVE',
      })

      if (!result.success) return { success: false, error: result.error }

      await db.transaction(async tx => {
        await writeAuditLog(
          {
            actorId:       user.personId ?? user.id,
            actorName:     user.name ?? '',
            actorRole:     user.role ?? '',
            actorEntityId: user.legalEntityId,
            channel:       'WEB',
            eventType:     'WORKFLOW.APPROVED',
            resourceType:  'WORKFLOW_INSTANCE',
            resourceId:    workflowInstanceId,
            metadata:      { instanceStatus: result.instanceStatus },
          },
          tx,
        )
        if (user.personId) {
          await tx
            .update(notificationLog)
            .set({ status: 'ACTIONED', readAt: new Date() })
            .where(and(
              eq(notificationLog.tenantId, TENANT_ID),
              eq(notificationLog.recipientPersonId, user.personId),
              eq(notificationLog.referenceId, workflowInstanceId),
            ))
        }
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'approveRequest') }
    }
  } catch (e) { translateError(e, 'approveRequest') }
}

export async function rejectRequest(
  workflowInstanceId: string,
  reason: string,
  _actorId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!reason || !reason.trim()) {
      return { success: false, error: 'Rejection reason is required.' }
    }
    try {
      const user = await getCurrentUser()

      const [pendingStep] = await db
        .select({ id: workflowStepInstances.id })
        .from(workflowStepInstances)
        .where(and(
          eq(workflowStepInstances.instanceId, workflowInstanceId),
          eq(workflowStepInstances.status, 'PENDING'),
        ))
        .limit(1)

      if (!pendingStep) return { success: false, error: 'No pending step found for this workflow.' }

      const result = await takeWorkflowAction({
        stepInstanceId: pendingStep.id,
        actorPersonId:  'CURRENT_USER',
        decision:       'REJECT',
        decisionNote:   reason,
      })

      if (!result.success) return { success: false, error: result.error }

      await db.transaction(async tx => {
        await writeAuditLog(
          {
            actorId:       user.personId ?? user.id,
            actorName:     user.name ?? '',
            actorRole:     user.role ?? '',
            actorEntityId: user.legalEntityId,
            channel:       'WEB',
            eventType:     'WORKFLOW.REJECTED',
            resourceType:  'WORKFLOW_INSTANCE',
            resourceId:    workflowInstanceId,
            metadata:      { reason, instanceStatus: result.instanceStatus },
          },
          tx,
        )
        if (user.personId) {
          await tx
            .update(notificationLog)
            .set({ status: 'ACTIONED', readAt: new Date() })
            .where(and(
              eq(notificationLog.tenantId, TENANT_ID),
              eq(notificationLog.recipientPersonId, user.personId),
              eq(notificationLog.referenceId, workflowInstanceId),
            ))
        }
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'rejectRequest') }
    }
  } catch (e) { translateError(e, 'rejectRequest') }
}

export async function requestInfo(
  workflowInstanceId: string,
  question: string,
  _actorId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!question || !question.trim()) {
      return { success: false, error: 'Question is required.' }
    }
    try {
      const user = await getCurrentUser()
      await db.transaction(async tx => {
        await tx.insert(events).values({
          tenantId:  TENANT_ID,
          eventType: 'workflow.info_requested',
          payload:   {
            workflowInstanceId,
            question:  question.trim(),
            askedBy:   user.name,
            askedById: user.personId,
          },
        })
        await writeAuditLog(
          {
            actorId:       user.personId ?? user.id,
            actorName:     user.name ?? '',
            actorRole:     user.role ?? '',
            actorEntityId: user.legalEntityId,
            channel:       'WEB',
            eventType:     'WORKFLOW.INFO_REQUESTED',
            resourceType:  'WORKFLOW_INSTANCE',
            resourceId:    workflowInstanceId,
            metadata:      { question: question.trim() },
          },
          tx,
        )
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'requestInfo') }
}

export async function getPreferences(): Promise<Record<string, string>> {
  try {
    const user = await getCurrentUser()
    if (!user.personId) return {}
    const [row] = await db
      .select({ preferences: userAccounts.preferences })
      .from(userAccounts)
      .where(and(
        eq(userAccounts.tenantId, TENANT_ID),
        eq(userAccounts.personId, user.personId),
      ))
      .limit(1)
    return (row?.preferences ?? {}) as Record<string, string>
  } catch (e) { translateError(e, 'getPreferences') }
}

export async function updatePreferences(
  _userId: string,
  prefs: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()
      if (!user.personId) return { success: false, error: 'No person linked to account. Contact HR Admin.' }

      // Use .returning() so we can detect if the WHERE clause matched any row.
      // If 0 rows returned, the preferences column may not exist in the DB yet.
      const updated = await db
        .update(userAccounts)
        .set({ preferences: prefs })
        .where(and(
          eq(userAccounts.tenantId, TENANT_ID),
          eq(userAccounts.personId, user.personId),
        ))
        .returning({ id: userAccounts.id })

      if (updated.length === 0) {
        // Fallback: no user_accounts row found for this personId — log and return informative error
        console.warn('[updatePreferences] 0 rows updated for personId', user.personId)
        return { success: false, error: 'User account record not found. Please contact IT support.' }
      }

      return { success: true }
    } catch (err) {
      console.error('[updatePreferences]', err)
      return { success: false, error: err instanceof Error ? err.message : 'Failed to save preferences.' }
    }
  } catch (e) { translateError(e, 'updatePreferences') }
}
