'use server'

/**
 * Workflow Engine v2 — Query Actions
 * Fetches pending approvals, instance details, and step history from v2 tables.
 */
import { db } from '@/lib/db'
import { eq, and, or, inArray, desc, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  workflowStepInstances,
  workflowInstancesV2,
  workflowDefinitionsV2,
  workflowStepsV2,
  workflowAuditLog,
  approvalGroups,
} from '@/drizzle/schema/workflow-engine'
import { persons, absenceEntries, absenceTypes } from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { ACTIONABLE_INSTANCE_STATUSES, TERMINAL_RESOURCE_STATUSES, type ApprovalInboxRow } from './constants'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingApprovalV2 {
  stepInstanceId: string
  instanceId: string
  workflowCode: string
  workflowNameEn: string
  resourceType: string
  resourceId: string
  initiatorName: string
  initiatorPersonId: string
  stepOrder: number
  stepName: string
  slaDeadline: Date | null
  isBreached: boolean
  hoursUntilBreach: number | null
  startedAt: Date
  isFyiOnly: boolean
  canDelegate: boolean
}

export interface WorkflowInstanceDetailV2 {
  instanceId: string
  workflowCode: string
  workflowNameEn: string
  status: string
  resourceType: string
  resourceId: string
  legalEntityId: string
  initiatorName: string
  initiatedByPersonId: string
  startedAt: Date
  completedAt: Date | null
  slaDeadline: Date | null
  steps: Array<{
    stepInstanceId: string
    stepOrder: number
    stepName: string
    status: string
    assigneeName: string | null
    assigneePersonId: string | null
    decision: string | null
    decisionNote: string | null
    decidedAt: Date | null
    slaDeadline: Date | null
    isFyiOnly: boolean
    canDelegate: boolean
  }>
  auditEvents: Array<{
    action: string
    actorName: string | null
    loggedAt: Date
    eventData: Record<string, unknown> | null
  }>
}

// ─── Single source of truth — manager approval inbox ─────────────────────────

/**
 * THE single source of truth for "what is in my approval inbox".
 *
 * A row is actionable for the current actor ONLY when ALL hold:
 *   • the step is PENDING and assigned-to OR delegated-to the actor
 *     (person + delegate routing — see PO decision; role/group routing is not
 *      used by current workflows);
 *   • the workflow instance is in an actionable (non-terminal) status;
 *   • the underlying resource is not in a terminal status (e.g. a CANCELLED
 *     leave can never be approved).
 *
 * Every surface — Overview count, Overview "Needs your review", Approvals
 * Pending tab, /workflows, the notification bell — derives from this function
 * (directly, or via getPendingApprovalsV2 which filters this to actionable
 * rows). This is what prevents Overview and Approvals from ever disagreeing.
 *
 * Returns BOTH actionable and (for transparency) any matched-but-blocked rows
 * with isActionable=false and a reason; callers that show a "pending" list must
 * filter on isActionable.
 */
export async function getActionableApprovalInbox(): Promise<ApprovalInboxRow[]> {
  const user = await requireRole([
    'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
  ])

  if (!user.personId) return []
  const me = user.personId

  const rows = await db
    .select({
      stepInstance:  workflowStepInstances,
      instance:      workflowInstancesV2,
      definition:    workflowDefinitionsV2,
      step:          workflowStepsV2,
      initiatorName: persons.fullNameEn,
      absenceStatus:   absenceEntries.status,
      absenceStart:    absenceEntries.startDate,
      absenceEnd:      absenceEntries.endDate,
      leaveTypeName:   absenceTypes.typeNameEn,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowInstancesV2, eq(workflowStepInstances.instanceId, workflowInstancesV2.id))
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .innerJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
    // Resource enrichment for leave requests; null for other resource types.
    .leftJoin(absenceEntries, and(
      eq(workflowInstancesV2.resourceType, 'absence_entries'),
      eq(absenceEntries.id, workflowInstancesV2.resourceId),
    ))
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(
      and(
        eq(workflowStepInstances.tenantId, TENANT_ID),
        eq(workflowStepInstances.status, 'PENDING'),
        // person + delegate routing
        or(
          eq(workflowStepInstances.assignedToPersonId, me),
          eq(workflowStepInstances.delegatedToPersonId, me),
        ),
      ),
    )
    .orderBy(workflowStepInstances.slaDeadline)
    .limit(100)

  const now = new Date()

  return rows.map(r => {
    const deadline = r.stepInstance.slaDeadline
    const isBreached = deadline ? now > deadline : false
    const hoursUntilBreach = deadline
      ? Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60))
      : null

    const workflowStatus = r.instance.status
    const businessStatus = r.instance.resourceType === 'absence_entries'
      ? (r.absenceStatus ?? null)
      : null

    // Compute actionability — the single contract.
    const instanceTerminal = !ACTIONABLE_INSTANCE_STATUSES
      .includes(workflowStatus as typeof ACTIONABLE_INSTANCE_STATUSES[number])
    const resourceTerminalStatuses = TERMINAL_RESOURCE_STATUSES[r.instance.resourceType] ?? []
    const resourceTerminal = businessStatus != null && resourceTerminalStatuses.includes(businessStatus)

    let isActionable = true
    let actionDisabledReason: string | null = null
    if (resourceTerminal) {
      isActionable = false
      actionDisabledReason = `Request is ${businessStatus} — no longer actionable`
    } else if (instanceTerminal) {
      isActionable = false
      actionDisabledReason = `Workflow is ${workflowStatus} — no longer actionable`
    }

    return {
      stepInstanceId:    r.stepInstance.id,
      instanceId:        r.instance.id,
      resourceId:        r.instance.resourceId,
      stepId:            r.stepInstance.stepId,
      workflowCode:      r.definition.workflowCode,
      workflowNameEn:    r.definition.workflowNameEn,
      resourceType:      r.instance.resourceType,
      stepOrder:         r.stepInstance.stepOrder,
      stepName:          r.step.stepNameEn,
      initiatorPersonId: r.instance.initiatedByPersonId,
      initiatorName:     r.initiatorName ?? '—',
      assignedToPersonId: r.stepInstance.assignedToPersonId ?? null,
      startDate:         r.absenceStart ?? null,
      endDate:           r.absenceEnd ?? null,
      leaveTypeName:     r.leaveTypeName ?? null,
      businessStatus,
      workflowStatus,
      isActionable,
      actionDisabledReason,
      slaDeadline:       deadline,
      isBreached,
      hoursUntilBreach,
      startedAt:         r.instance.startedAt,
      decidedAt:         r.stepInstance.decidedAt,
      isFyiOnly:         r.step.isFyiOnly,
      canDelegate:       r.step.canDelegate,
    }
  })
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Returns all *actionable* pending step instances for the current user.
 *
 * Thin wrapper over {@link getActionableApprovalInbox} that filters to
 * actionable rows and maps to the legacy PendingApprovalV2 shape consumed by
 * the Approvals page and /workflows. Because it now flows through the single
 * source of truth, cancelled/terminal-resource steps (e.g. a CANCELLED leave
 * whose workflow row was never reconciled) are excluded everywhere at once.
 */
export async function getPendingApprovalsV2(): Promise<PendingApprovalV2[]> {
  const inbox = await getActionableApprovalInbox()
  return inbox
    .filter(r => r.isActionable)
    .map(r => ({
      stepInstanceId:    r.stepInstanceId,
      instanceId:        r.instanceId,
      workflowCode:      r.workflowCode,
      workflowNameEn:    r.workflowNameEn,
      resourceType:      r.resourceType,
      resourceId:        r.resourceId,
      initiatorName:     r.initiatorName,
      initiatorPersonId: r.initiatorPersonId,
      stepOrder:         r.stepOrder,
      stepName:          r.stepName,
      slaDeadline:       r.slaDeadline,
      isBreached:        r.isBreached,
      hoursUntilBreach:  r.hoursUntilBreach,
      startedAt:         r.startedAt,
      isFyiOnly:         r.isFyiOnly,
      canDelegate:       r.canDelegate,
    }))
}

/**
 * Returns full detail for a single workflow instance (for the detail/action page).
 */
export async function getWorkflowInstanceDetailV2(instanceId: string): Promise<WorkflowInstanceDetailV2 | null> {
  await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const instanceRows = await db
    .select({
      instance:      workflowInstancesV2,
      definition:    workflowDefinitionsV2,
      initiatorName: persons.fullNameEn,
    })
    .from(workflowInstancesV2)
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
    .where(
      and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.id, instanceId),
      ),
    )
    .limit(1)

  if (!instanceRows.length) return null

  const { instance, definition, initiatorName } = instanceRows[0]

  // Load step instances with assignee names
  const stepRows = await db
    .select({
      stepInstance:     workflowStepInstances,
      step:             workflowStepsV2,
      assigneeName:     persons.fullNameEn,
      assigneePersonId: workflowStepInstances.assignedToPersonId,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(eq(workflowStepInstances.instanceId, instanceId))
    .orderBy(workflowStepInstances.stepOrder)

  // Load audit log
  const auditRows = await db
    .select()
    .from(workflowAuditLog)
    .where(eq(workflowAuditLog.instanceId, instanceId))
    .orderBy(desc(workflowAuditLog.loggedAt))
    .limit(50)

  return {
    instanceId:          instance.id,
    workflowCode:        definition.workflowCode,
    workflowNameEn:      definition.workflowNameEn,
    status:              instance.status,
    resourceType:        instance.resourceType,
    resourceId:          instance.resourceId,
    legalEntityId:       instance.legalEntityId,
    initiatorName:       initiatorName ?? '—',
    initiatedByPersonId: instance.initiatedByPersonId,
    startedAt:           instance.startedAt,
    completedAt:         instance.completedAt,
    slaDeadline:         instance.slaDeadline,
    steps: stepRows.map(r => ({
      stepInstanceId: r.stepInstance.id,
      stepOrder:      r.stepInstance.stepOrder,
      stepName:       r.step.stepNameEn,
      status:         r.stepInstance.status,
      assigneeName:     r.assigneeName ?? null,
      assigneePersonId: r.assigneePersonId ?? null,
      decision:         r.stepInstance.decision,
      decisionNote:   r.stepInstance.decisionNote,
      decidedAt:      r.stepInstance.decidedAt,
      slaDeadline:    r.stepInstance.slaDeadline,
      isFyiOnly:      r.step.isFyiOnly,
      canDelegate:    r.step.canDelegate,
    })),
    auditEvents: auditRows.map(r => ({
      action:    r.action,
      actorName: r.actorName,
      loggedAt:  r.loggedAt,
      eventData: r.eventData as Record<string, unknown> | null,
    })),
  }
}

// ─── Employee Request Queries (Unit 9) ───────────────────────────────────────

export interface MyRequestRow {
  instanceId:       string
  workflowCode:     string
  workflowNameEn:   string
  resourceType:     string
  resourceId:       string
  status:           string
  startedAt:        Date
  completedAt:      Date | null
  slaDeadline:      Date | null
  currentStepOrder: number
}

export interface WorkflowStatusDetail {
  instanceId:          string
  workflowCode:        string
  workflowNameEn:      string
  status:              string
  startedAt:           Date
  completedAt:         Date | null
  initiatedByPersonId: string
  slaDeadline:         Date | null
  slaHours:            number
  steps: Array<{
    stepInstanceId:   string
    stepOrder:        number
    stepName:         string
    status:           string
    assigneeName:     string | null
    assigneePersonId: string | null
    decidedAt:        Date | null
  }>
}

/**
 * Returns all workflow instances initiated by the current user (employee self-service).
 */
export async function getMyWorkflowRequests(): Promise<MyRequestRow[]> {
  const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (!user.personId) return []

  return db
    .select({
      instanceId:       workflowInstancesV2.id,
      workflowCode:     workflowDefinitionsV2.workflowCode,
      workflowNameEn:   workflowDefinitionsV2.workflowNameEn,
      resourceType:     workflowInstancesV2.resourceType,
      resourceId:       workflowInstancesV2.resourceId,
      status:           workflowInstancesV2.status,
      startedAt:        workflowInstancesV2.startedAt,
      completedAt:      workflowInstancesV2.completedAt,
      slaDeadline:      workflowInstancesV2.slaDeadline,
      currentStepOrder: workflowInstancesV2.currentStepOrder,
    })
    .from(workflowInstancesV2)
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .where(
      and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.initiatedByPersonId, user.personId),
      ),
    )
    .orderBy(desc(workflowInstancesV2.startedAt))
    .limit(50)
}

/**
 * Returns full status detail for a workflow instance looked up by resourceId.
 */
export async function getWorkflowStatusForRequest(
  resourceId: string,
): Promise<WorkflowStatusDetail | null> {
  await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const rows = await db
    .select({
      instanceId:          workflowInstancesV2.id,
      workflowCode:        workflowDefinitionsV2.workflowCode,
      workflowNameEn:      workflowDefinitionsV2.workflowNameEn,
      status:              workflowInstancesV2.status,
      startedAt:           workflowInstancesV2.startedAt,
      completedAt:         workflowInstancesV2.completedAt,
      initiatedByPersonId: workflowInstancesV2.initiatedByPersonId,
      slaDeadline:         workflowInstancesV2.slaDeadline,
      slaHours:            workflowDefinitionsV2.defaultSlaHours,
    })
    .from(workflowInstancesV2)
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .where(
      and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.resourceId, resourceId),
      ),
    )
    .limit(1)

  if (!rows.length) return null
  const instance = rows[0]

  const stepRows = await db
    .select({
      stepInstanceId:   workflowStepInstances.id,
      stepOrder:        workflowStepInstances.stepOrder,
      stepName:         workflowStepsV2.stepNameEn,
      status:           workflowStepInstances.status,
      assigneeName:     persons.fullNameEn,
      assigneePersonId: workflowStepInstances.assignedToPersonId,
      decidedAt:        workflowStepInstances.decidedAt,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(eq(workflowStepInstances.instanceId, instance.instanceId))
    .orderBy(workflowStepInstances.stepOrder)

  return {
    ...instance,
    steps: stepRows.map(r => ({
      stepInstanceId:   r.stepInstanceId,
      stepOrder:        r.stepOrder,
      stepName:         r.stepName,
      status:           r.status,
      assigneeName:     r.assigneeName ?? null,
      assigneePersonId: r.assigneePersonId ?? null,
      decidedAt:        r.decidedAt,
    })),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// getApprovalHistoryForUser — steps the current user already actioned
// ══════════════════════════════════════════════════════════════════════════════

export interface ApprovalHistoryRow {
  instanceId:          string
  workflowCode:        string
  workflowNameEn:      string
  resourceType:        string
  resourceId:          string
  requesterName:       string
  myStepName:          string
  myDecision:          string | null   // 'APPROVE' | 'REJECT' | 'DELEGATE'
  decidedAt:           Date | null
  instanceStatus:      string
  currentStepName:     string | null   // current pending step (next/active approver)
  currentApproverName: string | null
  leaveStartDate:      string | null
  leaveEndDate:        string | null
  leaveTypeName:       string | null
}

/**
 * Returns workflow steps the current user has personally decided
 * (approved / rejected / delegated) — i.e. their approval history.
 *
 * Approved/rejected items no longer "vanish": the Pending inbox loses them,
 * but they appear here with the user's decision, when they decided, the request
 * context, and where the request stands now (current/next approver).
 */
export async function getApprovalHistoryForUser(): Promise<ApprovalHistoryRow[]> {
  const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (!user.personId) return []

  const rows = await db
    .select({
      instanceId:     workflowInstancesV2.id,
      workflowCode:   workflowDefinitionsV2.workflowCode,
      workflowNameEn: workflowDefinitionsV2.workflowNameEn,
      resourceType:   workflowInstancesV2.resourceType,
      resourceId:     workflowInstancesV2.resourceId,
      requesterName:  persons.fullNameEn,
      myStepName:     workflowStepsV2.stepNameEn,
      myDecision:     workflowStepInstances.decision,
      decidedAt:      workflowStepInstances.decidedAt,
      instanceStatus: workflowInstancesV2.status,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowInstancesV2, eq(workflowStepInstances.instanceId, workflowInstancesV2.id))
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
    .where(and(
      eq(workflowStepInstances.tenantId, TENANT_ID),
      eq(workflowStepInstances.decidedByPersonId, user.personId),
    ))
    .orderBy(desc(workflowStepInstances.decidedAt))
    .limit(100)

  if (rows.length === 0) return []

  const instanceIds = [...new Set(rows.map(r => r.instanceId))]

  // Current pending step (the active/next approver) per instance — batch.
  const pendingRows = await db
    .select({
      instanceId:   workflowStepInstances.instanceId,
      stepName:     workflowStepsV2.stepNameEn,
      approverName: persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(and(
      eq(workflowStepInstances.tenantId, TENANT_ID),
      inArray(workflowStepInstances.instanceId, instanceIds),
      eq(workflowStepInstances.status, 'PENDING'),
    ))
  const pendingMap = new Map<string, { stepName: string; approverName: string | null }>()
  for (const p of pendingRows) {
    if (!pendingMap.has(p.instanceId)) {
      pendingMap.set(p.instanceId, { stepName: p.stepName, approverName: p.approverName ?? null })
    }
  }

  // Leave enrichment (dates + type) for leave requests — batch.
  const leaveIds = [...new Set(rows.filter(r => r.resourceType === 'absence_entries').map(r => r.resourceId))]
  const leaveMap = new Map<string, { start: string | null; end: string | null; type: string | null }>()
  if (leaveIds.length > 0) {
    const lr = await db
      .select({
        id:    absenceEntries.id,
        start: absenceEntries.startDate,
        end:   absenceEntries.endDate,
        type:  absenceTypes.typeNameEn,
      })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        inArray(absenceEntries.id, leaveIds),
      ))
    for (const l of lr) leaveMap.set(l.id, { start: l.start, end: l.end, type: l.type })
  }

  return rows.map(r => {
    const pend = pendingMap.get(r.instanceId)
    const lv   = leaveMap.get(r.resourceId)
    return {
      instanceId:          r.instanceId,
      workflowCode:        r.workflowCode,
      workflowNameEn:      r.workflowNameEn,
      resourceType:        r.resourceType,
      resourceId:          r.resourceId,
      requesterName:       r.requesterName ?? '—',
      myStepName:          r.myStepName,
      myDecision:          r.myDecision,
      decidedAt:           r.decidedAt,
      instanceStatus:      r.instanceStatus,
      currentStepName:     pend?.stepName ?? null,
      currentApproverName: pend?.approverName ?? null,
      leaveStartDate:      lv?.start ?? null,
      leaveEndDate:        lv?.end ?? null,
      leaveTypeName:       lv?.type ?? null,
    }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// resolvePendingApprover — used by ARIA to surface pending-approver info
// ══════════════════════════════════════════════════════════════════════════════

export interface PendingApproverInfo {
  stepName:     string
  approverLabel: string
  /** Describes how the approver was resolved. */
  approverType: 'PERSON' | 'DELEGATED' | 'GROUP' | 'ROLE' | 'CONFIG_WARNING'
}

/**
 * Returns the current pending approver for a workflow instance.
 *
 * Resolution priority (highest first):
 *   1. delegatedToPersonId  — someone it was delegated to
 *   2. assignedToPersonId   — the directly assigned person
 *   3. assignedToGroupId    — an approval group
 *   4. hierarchyRole        — a named role (e.g. HR_ADMIN, LINE_MANAGER)
 *   5. CONFIG_WARNING       — no approver resolvable; workflow mis-configured
 *
 * Does NOT call requireRole — callers are responsible for scope enforcement
 * (e.g. ARIA's handleLeaveRequestStatus which already gates on listLeaveRequests).
 */
export async function resolvePendingApprover(
  instanceId: string,
): Promise<PendingApproverInfo | null> {
  const [row] = await db
    .select({
      stepName:            workflowStepsV2.stepNameEn,
      hierarchyRole:       workflowStepsV2.hierarchyRole,
      assignedToPersonId:  workflowStepInstances.assignedToPersonId,
      assignedToGroupId:   workflowStepInstances.assignedToGroupId,
      delegatedToPersonId: workflowStepInstances.delegatedToPersonId,
      assigneeName:        persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(and(
      eq(workflowStepInstances.instanceId, instanceId),
      eq(workflowStepInstances.status, 'PENDING'),
    ))
    .orderBy(workflowStepInstances.stepOrder)
    .limit(1)

  if (!row) return null

  // 1. Delegated approver
  if (row.delegatedToPersonId) {
    const [delegate] = await db
      .select({ fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, row.delegatedToPersonId)))
      .limit(1)
    return {
      stepName:      row.stepName,
      approverLabel: delegate?.fullNameEn
        ? `${delegate.fullNameEn} (delegated)`
        : 'Delegated approver (name unavailable)',
      approverType:  'DELEGATED',
    }
  }

  // 2. Directly assigned person
  if (row.assigneeName) {
    return {
      stepName:      row.stepName,
      approverLabel: row.assigneeName,
      approverType:  'PERSON',
    }
  }

  // 3. Approval group
  if (row.assignedToGroupId) {
    const [group] = await db
      .select({ groupNameEn: approvalGroups.groupNameEn })
      .from(approvalGroups)
      .where(and(
        eq(approvalGroups.tenantId, TENANT_ID),
        eq(approvalGroups.id, row.assignedToGroupId),
      ))
      .limit(1)
    return {
      stepName:      row.stepName,
      approverLabel: group?.groupNameEn
        ? `${group.groupNameEn} (approval group)`
        : 'Approval group (name unavailable)',
      approverType:  'GROUP',
    }
  }

  // 4. Role-based routing (hierarchyRole stored on the step definition)
  if (row.hierarchyRole) {
    const label = row.hierarchyRole
      .split('_')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
    return {
      stepName:      row.stepName,
      approverLabel: label,
      approverType:  'ROLE',
    }
  }

  // 5. Configuration warning — step exists but has no approver assignment
  return {
    stepName:      row.stepName,
    approverLabel: 'This request is pending, but the workflow step does not currently have an assigned approver. HR should review the workflow configuration.',
    approverType:  'CONFIG_WARNING',
  }
}

/** Bilingual pending-approver label, used by list/report views. */
export interface PendingApproverLabel {
  approverType:    PendingApproverInfo['approverType']
  /** Concrete display label, EN. Empty for CONFIG_WARNING. */
  approverLabelEn: string
  /** Concrete display label, AR (falls back to EN where no AR exists). */
  approverLabelAr: string
}

/**
 * Batched variant of {@link resolvePendingApprover}: resolves the current
 * pending approver for many workflow instances in a single query (avoids N+1
 * in report/list views). Returns a record keyed by instanceId; instances with
 * no PENDING step are simply absent from the result.
 *
 * Same resolution priority as resolvePendingApprover (delegated → person →
 * group → role → config-warning). CONFIG_WARNING entries carry empty labels so
 * callers render "Pending" only, never an error string.
 */
export async function resolvePendingApprovers(
  instanceIds: string[],
): Promise<Record<string, PendingApproverLabel>> {
  const ids = Array.from(new Set(instanceIds.filter(Boolean)))
  if (ids.length === 0) return {}

  const delegatePersons = alias(persons, 'delegate_persons')

  const rows = await db
    .select({
      instanceId:          workflowStepInstances.instanceId,
      hierarchyRole:       workflowStepsV2.hierarchyRole,
      assignedPersonEn:    persons.fullNameEn,
      assignedPersonAr:    persons.fullNameAr,
      assignedToGroupId:   workflowStepInstances.assignedToGroupId,
      groupNameEn:         approvalGroups.groupNameEn,
      groupNameAr:         approvalGroups.groupNameAr,
      delegatedToPersonId: workflowStepInstances.delegatedToPersonId,
      delegatedPersonEn:   delegatePersons.fullNameEn,
      delegatedPersonAr:   delegatePersons.fullNameAr,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .leftJoin(delegatePersons, eq(workflowStepInstances.delegatedToPersonId, delegatePersons.id))
    .leftJoin(approvalGroups, eq(workflowStepInstances.assignedToGroupId, approvalGroups.id))
    .where(and(
      inArray(workflowStepInstances.instanceId, ids),
      eq(workflowStepInstances.status, 'PENDING'),
    ))
    .orderBy(workflowStepInstances.stepOrder)

  const out: Record<string, PendingApproverLabel> = {}
  for (const row of rows) {
    // Rows arrive ordered by stepOrder asc; first seen per instance is the
    // earliest PENDING step (the one currently awaiting a decision).
    if (out[row.instanceId]) continue

    // 1. Delegated approver
    if (row.delegatedToPersonId) {
      out[row.instanceId] = {
        approverType:    'DELEGATED',
        approverLabelEn: row.delegatedPersonEn ? `${row.delegatedPersonEn} (delegated)` : 'Delegated approver',
        approverLabelAr: row.delegatedPersonAr
          ? `${row.delegatedPersonAr} (مفوّض)`
          : (row.delegatedPersonEn ? `${row.delegatedPersonEn} (delegated)` : 'مفوّض'),
      }
      continue
    }
    // 2. Directly assigned person
    if (row.assignedPersonEn) {
      out[row.instanceId] = {
        approverType:    'PERSON',
        approverLabelEn: row.assignedPersonEn,
        approverLabelAr: row.assignedPersonAr ?? row.assignedPersonEn,
      }
      continue
    }
    // 3. Approval group
    if (row.assignedToGroupId) {
      out[row.instanceId] = {
        approverType:    'GROUP',
        approverLabelEn: row.groupNameEn ? `${row.groupNameEn} (approval group)` : 'Approval group',
        approverLabelAr: row.groupNameAr
          ? `${row.groupNameAr} (مجموعة موافقة)`
          : (row.groupNameEn ? `${row.groupNameEn} (approval group)` : 'مجموعة موافقة'),
      }
      continue
    }
    // 4. Role-based routing
    if (row.hierarchyRole) {
      const label = row.hierarchyRole
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      out[row.instanceId] = { approverType: 'ROLE', approverLabelEn: label, approverLabelAr: label }
      continue
    }
    // 5. Config warning — empty labels so caller shows "Pending" only.
    out[row.instanceId] = { approverType: 'CONFIG_WARNING', approverLabelEn: '', approverLabelAr: '' }
  }
  return out
}
