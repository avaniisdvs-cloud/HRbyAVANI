/**
 * AVANIIS HR — Workflow Engine v2 Core
 * Implements: submitWorkflow, takeWorkflowAction, previewWorkflow, processSLABreaches
 * All mutations are Server Actions — must be called from Server Components or API routes.
 */
'use server'

import { db, type DB, type DbOrTx } from '@/lib/db'
import { eq, and, lte, inArray, desc, or, isNull, count } from 'drizzle-orm'
import {
  workflowDefinitionsV2,
  workflowStepsV2,
  workflowInstancesV2,
  workflowStepInstances,
  workflowAuditLog,
  workflowEmailTokens,
  workflowNotificationQueue,
  workflowSlaCalendars,
  workflowRules,
  type WorkflowStepV2,
  type ResolvedApprover,
  type HierarchySnapshot,
  type ContextSnapshot,
} from '@/drizzle/schema/workflow-engine'
import { persons, grades, legalEntities, absenceEntries, absenceTypes, notificationLog, workerAssignments, hiringRequests, transferRequests } from '@/drizzle/schema'
import { probationReviews } from '@/drizzle/schema/probation'
import { buildLeaveDecisionNotificationBody } from './leave-notification'
import { evaluateRules, buildWorkflowContext, type WorkflowContext } from './workflow-rules'
import { resolveApprovalChain } from './workflow-hierarchy'
import { buildWorkflowRoutingContext } from '@/lib/workflow-routing'
import { evaluateSelfApprovalGuard } from '@/lib/workflow-guards'
import { writeAuditLog } from '@/lib/audit'
import { calculateSLADeadline } from './workflow-sla'
import { getCurrentUser } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { randomUUID } from 'crypto'
import { createHmac, randomBytes } from 'crypto'

// ─── Types ───────────────────────────────────────────────────────────────────
// DbOrTx is imported from @/lib/db so it can be shared with callers that need
// to pass an outer transaction (e.g. submitLeaveRequest → submitWorkflow).

// ─── Constants ────────────────────────────────────────────────────────────────

// System actor — must reference a real persons.id row (FK constraint on decidedByPersonId etc.).
// '22222222-...' = System Administrator seeded in test-mdm.ts (exists in every env).
const SYSTEM_ACTOR = { id: '22222222-2222-2222-2222-222222222222', name: 'AVANIIS Workflow Engine' }

/**
 * Resolve a human-readable display name for the given actor person ID.
 * - System actor → returns SYSTEM_ACTOR.name without a DB round-trip.
 * - Known person → returns persons.fullNameEn.
 * - Unknown / deleted person → returns 'Workflow approver' (never leaks a raw UUID).
 */
export async function resolveActorDisplayName(actorPersonId: string): Promise<string> {
  if (actorPersonId === SYSTEM_ACTOR.id) return SYSTEM_ACTOR.name
  const rows = await db
    .select({ fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(eq(persons.id, actorPersonId))
    .limit(1)
  return rows[0]?.fullNameEn ?? 'Workflow approver'
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubmitWorkflowParams {
  workflowCode: string
  resourceType: string       // 'absence_entry' | 'worker_assignment' | etc.
  resourceId: string
  initiatedByPersonId: string
  legalEntityId: string
  contextOverrides?: Partial<WorkflowContext>
  /**
   * COLLISION-003 fix (Phase 3 Priority 6C):
   * Optional outer transaction from the caller.  When provided, all writes in
   * submitWorkflow participate in the caller's transaction rather than opening
   * an independent one.  This makes leave-request creation + workflow submission
   * fully atomic: a crash after the workflow writes and before the caller's
   * absenceEntries.status update rolls back both sides together.
   *
   * When omitted (all other callers), submitWorkflow opens its own db.transaction
   * exactly as before — zero behaviour change for the rest of the system.
   */
  tx?: DbOrTx
}

export interface TakeWorkflowActionParams {
  stepInstanceId: string
  actorPersonId: string
  decision: 'APPROVE' | 'REJECT' | 'DELEGATE'
  decisionNote?: string
  delegateToPersonId?: string    // required when decision = DELEGATE
  ipAddress?: string
  userAgent?: string
}

export interface WorkflowSubmitResult {
  success: boolean
  instanceId?: string
  error?: string
}

export interface WorkflowActionResult {
  success: boolean
  instanceStatus?: string
  error?: string
}

export interface PreviewWorkflowResult {
  workflowCode: string
  workflowName: string
  resolvedChain: Array<{
    stepOrder: number
    stepCode: string
    stepName: string
    approverName: string
    approverPersonId: string
    hierarchyType: string
    slaHours: number
    isFyiOnly: boolean
  }>
  totalSteps: number
}

// ─── Context builder ──────────────────────────────────────────────────────────

async function loadPersonContext(
  personId: string,
  resourceType: string,
  resourceId: string,
  overrides?: Partial<WorkflowContext>,
  // DEADLOCK-FIX: runs inside submitWorkflow, which may itself run inside a
  // caller's transaction (max:1 pool). Use the supplied executor so these reads
  // share the transaction's connection instead of deadlocking on the global pool.
  executor: DbOrTx = db,
): Promise<WorkflowContext> {
  const rows = await executor
    .select({
      id:                   persons.id,
      fullNameEn:           persons.fullNameEn,
      gradeLevel:           grades.gradeLevel,
      nationalityCategory:  persons.nationalityCategory,
      employmentType:       persons.employmentType,
      hireDate:             persons.hireDate,
      lineManagerId:        persons.lineManagerId,
      gender:               persons.gender,
      religion:             persons.religion,
      maritalStatus:        persons.maritalStatus,
      basicSalary:          persons.basicSalary,
      payrollId:            persons.payrollId,
      contractedHoursPerWeek: persons.contractedHoursPerWeek,
      probationEndDate:     persons.probationEndDate,
      isActive:             persons.isActive,
    })
    .from(persons)
    .leftJoin(grades, eq(persons.currentGradeId, grades.id))
    .where(eq(persons.id, personId))
    .limit(1)

  if (!rows.length) throw new Error(`Person not found: ${personId}`)

  const p = rows[0]
  const now = new Date()
  const hireDate = new Date(p.hireDate ?? now)
  const serviceMonths = Math.floor(
    (now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  )
  const isOnProbation = p.probationEndDate ? new Date(p.probationEndDate) > now : false

  // A person is a manager only if at least one active assignment lists them as
  // line_manager_id. The old check (lineManagerId !== null) tested whether the
  // person HAS a manager — the opposite of what the workflow engine needs.
  const directReportRows = await executor
    .select({ total: count() })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.lineManagerId, personId),
      eq(workerAssignments.isCurrent, true),
      eq(workerAssignments.assignmentStatus, 'ACTIVE'),
    ))
  const isManager = Number(directReportRows[0]?.total ?? 0) > 0

  return buildWorkflowContext({
    personId,
    fullName:             p.fullNameEn ?? '',
    gradeLevel:           p.gradeLevel ?? 1,
    nationalityCategory:  p.nationalityCategory,
    employmentType:       p.employmentType,
    serviceMonths,
    departmentType:       '',   // populated by caller via overrides
    legalEntityType:      '',
    isOnProbation,
    isManager,
    gender:               p.gender,
    religion:             p.religion ?? null,
    maritalStatus:        p.maritalStatus ?? null,
    basicSalary:          parseFloat(String(p.basicSalary ?? 0)),
    payrollId:            p.payrollId,
    contractHoursPerWeek: parseFloat(String(p.contractedHoursPerWeek ?? 48)),
    resourceType,
    resourceId,
    extra: overrides,
  })
}

function normalizeWorkflowDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}/)) return value.slice(0, 10)
  return null
}

function workflowContextDate(ctx: WorkflowContext): string | null {
  const keys = [
    "workflow.as_of_date",
    "resource.effective_date",
    "assignment.effective_date",
    "leave.start_date",
  ]
  for (const key of keys) {
    const value = normalizeWorkflowDate(ctx[key])
    if (value) return value
  }
  return null
}

async function resolveWorkflowAsOfDate(
  resourceType: string,
  resourceId: string,
  ctx: WorkflowContext,
  executor: DbOrTx = db,
): Promise<string | null> {
  const contextDate = workflowContextDate(ctx)
  if (contextDate) return contextDate

  if (resourceType === "absence_entries") {
    const rows = await executor
      .select({ asOfDate: absenceEntries.startDate })
      .from(absenceEntries)
      .where(and(eq(absenceEntries.tenantId, TENANT_ID), eq(absenceEntries.id, resourceId)))
      .limit(1)
    return normalizeWorkflowDate(rows[0]?.asOfDate)
  }

  if (resourceType === "transfer_requests") {
    const rows = await executor
      .select({ asOfDate: transferRequests.effectiveDate })
      .from(transferRequests)
      .where(and(eq(transferRequests.tenantId, TENANT_ID), eq(transferRequests.id, resourceId)))
      .limit(1)
    return normalizeWorkflowDate(rows[0]?.asOfDate)
  }

  if (resourceType === "hiring_requests") {
    const rows = await executor
      .select({ requiredByDate: hiringRequests.requiredByDate, requestedDate: hiringRequests.requestedDate })
      .from(hiringRequests)
      .where(and(eq(hiringRequests.tenantId, TENANT_ID), eq(hiringRequests.id, resourceId)))
      .limit(1)
    return normalizeWorkflowDate(rows[0]?.requiredByDate) ?? normalizeWorkflowDate(rows[0]?.requestedDate)
  }

  if (resourceType === "probation_review" || resourceType === "probation_reviews") {
    const rows = await executor
      .select({ asOfDate: probationReviews.probationEndDateAtInitiation })
      .from(probationReviews)
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, resourceId)))
      .limit(1)
    return normalizeWorkflowDate(rows[0]?.asOfDate)
  }

  return null
}

function workflowHasLineManagerStep(steps: WorkflowStepV2[]): boolean {
  return steps.some(step => step.isActive && step.hierarchyType === "LINE_MANAGER")
}

// ─── Audit logger ─────────────────────────────────────────────────────────────

async function writeAudit(params: {
  instanceId: string
  stepInstanceId?: string
  action: typeof workflowAuditLog.$inferInsert['action']
  actorPersonId?: string
  actorName?: string
  ipAddress?: string
  userAgent?: string
  eventData?: Record<string, unknown>
  tx?: DbOrTx
}) {
  const client = params.tx ?? db
  await client.insert(workflowAuditLog).values({
    id:             randomUUID(),
    tenantId:       TENANT_ID,
    instanceId:     params.instanceId,
    stepInstanceId: params.stepInstanceId,
    action:         params.action,
    actorPersonId:  params.actorPersonId,
    actorName:      params.actorName ?? SYSTEM_ACTOR.name,
    ipAddress:      params.ipAddress as never,
    userAgent:      params.userAgent,
    eventData:      params.eventData,
    loggedAt:       new Date(),
  })
}

// ─── Notification queuer ──────────────────────────────────────────────────────

async function queueNotification(params: {
  instanceId: string
  stepInstanceId?: string
  recipientPersonId: string
  templateCode: string
  channel?: string
  actionUrl?: string
  tx?: DbOrTx
}) {
  const client = params.tx ?? db
  await client.insert(workflowNotificationQueue).values({
    id:              randomUUID(),
    tenantId:        TENANT_ID,
    instanceId:      params.instanceId,
    stepInstanceId:  params.stepInstanceId,
    channel:         (params.channel ?? 'EMAIL') as 'EMAIL',
    recipientPersonId: params.recipientPersonId,
    templateCode:    params.templateCode,
    actionUrl:       params.actionUrl,
    status:          'QUEUED',
    sendAfter:       new Date(),
    retryCount:      0,
    createdAt:       new Date(),
  })
}

// ─── JWT email token issuer ───────────────────────────────────────────────────

function issueEmailToken(params: {
  instanceId: string
  stepInstanceId: string
  personId: string
  action: 'APPROVE' | 'REJECT' | 'DELEGATE'
  expiresAt: Date
}): { jti: string; token: string } {
  const jti = randomBytes(32).toString('hex')
  const jwtSecret = process.env.WORKFLOW_JWT_SECRET
  if (!jwtSecret) throw new Error('WORKFLOW_JWT_SECRET env var is required')
  const secret = jwtSecret

  const payload = {
    jti,
    sub:  params.personId,
    inst: params.instanceId,
    step: params.stepInstanceId,
    act:  params.action,
    exp:  Math.floor(params.expiresAt.getTime() / 1000),
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig    = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')

  return { jti, token: `${header}.${body}.${sig}` }
}

// ─── activateNextStep ─────────────────────────────────────────────────────────

async function activateNextStep(
  instanceId: string,
  completedStepOrder: number,
  legalEntityId: string,
  calendarId: string | null,
  tx: DbOrTx,
): Promise<boolean> {
  const nextStepInstances = await tx
    .select()
    .from(workflowStepInstances)
    .where(
      and(
        eq(workflowStepInstances.instanceId, instanceId),
        eq(workflowStepInstances.status, 'WAITING'),
      ),
    )
    .orderBy(workflowStepInstances.stepOrder)
    .limit(1)

  if (!nextStepInstances.length) return false  // no more steps

  const next = nextStepInstances[0]

  // Look up the step definition to get per-step slaHours
  const stepDefRows = await tx
    .select({ slaHours: workflowStepsV2.slaHours })
    .from(workflowStepsV2)
    .where(eq(workflowStepsV2.id, next.stepId))
    .limit(1)

  const stepSlaHours = stepDefRows[0]?.slaHours ?? 48
  const stepSlaDeadline = await calculateSLADeadline({
    slaWorkingHours: stepSlaHours,
    legalEntityId,
    calendarId,
    fromDate: new Date(),
  })

  await tx
    .update(workflowStepInstances)
    .set({
      status:       'PENDING',
      slaDeadline:  stepSlaDeadline,
      updatedBy:    SYSTEM_ACTOR.id,
      updatedByName: SYSTEM_ACTOR.name,
      lastUpdatedDate: new Date(),
    })
    .where(eq(workflowStepInstances.id, next.id))

  // Update instance's current step
  await tx
    .update(workflowInstancesV2)
    .set({
      currentStepId:    next.stepId,
      currentStepOrder: next.stepOrder,
      status:           'IN_PROGRESS',
      updatedBy:        SYSTEM_ACTOR.id,
      updatedByName:    SYSTEM_ACTOR.name,
      lastUpdatedDate:  new Date(),
    })
    .where(eq(workflowInstancesV2.id, instanceId))

  // Queue approval notification
  if (next.assignedToPersonId) {
    // Generate one-click email token
    const { jti, token } = issueEmailToken({
      instanceId,
      stepInstanceId: next.id,
      personId:       next.assignedToPersonId,
      action:         'APPROVE',
      expiresAt:      stepSlaDeadline,
    })

    // Store token in DB for blacklist check
    await tx.insert(workflowEmailTokens).values({
      jti,
      tenantId:          TENANT_ID,
      instanceId,
      stepInstanceId:    next.id,
      intendedAction:    'APPROVE',
      issuedToPersonId:  next.assignedToPersonId,
      expiresAt:         stepSlaDeadline,
      createdAt:         new Date(),
    })

    await tx
      .update(workflowStepInstances)
      .set({ emailTokenJti: jti })
      .where(eq(workflowStepInstances.id, next.id))

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hr.avaniis.ae'
    const actionUrl = `${baseUrl}/api/workflow/action?token=${token}`

    await queueNotification({
      instanceId,
      stepInstanceId:    next.id,
      recipientPersonId: next.assignedToPersonId,
      templateCode:      'WF_APPROVAL_REQUEST',
      actionUrl,
      tx,
    })

    // IN_APP bell notification for the NEXT approver. Parity with the line-manager
    // notification created at submit time by submitLeaveRequest — without this, only
    // the first (line-manager) approver gets a bell alert; downstream approvers
    // (HR Admin, CEO, …) were reachable only via email. Best-effort context lookup
    // for a friendly bilingual message; reuses the proven LEAVE_APPROVAL_REQUESTED
    // type so the (varchar) notification_type never hits a constraint surprise.
    const [instCtx] = await tx
      .select({
        legalEntityId:  workflowInstancesV2.legalEntityId,
        initiatorName:  persons.fullNameEn,
        workflowNameEn: workflowDefinitionsV2.workflowNameEn,
        workflowNameAr: workflowDefinitionsV2.workflowNameAr,
      })
      .from(workflowInstancesV2)
      .leftJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
      .leftJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
      .where(eq(workflowInstancesV2.id, instanceId))
      .limit(1)

    const wfNameEn = instCtx?.workflowNameEn ?? 'Request'
    const wfNameAr = instCtx?.workflowNameAr ?? 'طلب'
    const reqName  = instCtx?.initiatorName ?? 'An employee'

    await tx.insert(notificationLog).values({
      tenantId:          TENANT_ID,
      legalEntityId:     instCtx?.legalEntityId ?? (legalEntityId || null),
      recipientPersonId: next.assignedToPersonId,
      notificationType:  'LEAVE_APPROVAL_REQUESTED',
      channel:           'IN_APP',
      subjectEn:         `${wfNameEn} Awaiting Your Approval`,
      subjectAr:         `${wfNameAr} في انتظار موافقتك`,
      bodyEn:            `${reqName} has submitted a ${wfNameEn} that requires your approval. Please review and approve or reject.`,
      bodyAr:            `قام ${reqName} بتقديم ${wfNameAr} يتطلب موافقتك. يرجى المراجعة واتخاذ القرار المناسب.`,
      referenceType:     'WORKFLOW_INSTANCE',
      referenceId:       instanceId,
      status:            'SENT',
      createdBy:         SYSTEM_ACTOR.id,
      createdByName:     SYSTEM_ACTOR.name,
      createdDate:       new Date(),
    })

    await writeAudit({
      instanceId,
      stepInstanceId: next.id,
      action: 'TOKEN_ISSUED',
      actorPersonId: SYSTEM_ACTOR.id,
      eventData: { jti, personId: next.assignedToPersonId },
      tx,
    })
  }

  return true
}

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Submit a new workflow instance for approval.
 * - Selects the matching workflow definition
 * - Evaluates condition trees against the submission context
 * - Resolves the full approval chain
 * - Captures immutable hierarchy + context snapshots
 * - Creates step instances and activates step 1
 */
export async function submitWorkflow(
  params: SubmitWorkflowParams,
): Promise<WorkflowSubmitResult> {
  try {
    const { workflowCode, resourceType, resourceId, legalEntityId, contextOverrides, tx: outerTx } = params

    // DEADLOCK-FIX: when an outer transaction is supplied (e.g. submitLeaveRequest
    // wraps submitWorkflow for atomicity), ALL pre-flight reads below must run on
    // that transaction's connection. The production pool is max:1 (lib/db.ts); a
    // read issued on the global `db` pool while the outer transaction holds the
    // only connection waits forever → the submit hangs and nothing is created.
    // With no outer tx, `reader` is the global `db` (unchanged for other callers).
    const reader: DbOrTx = outerTx ?? db

    const currentUser = await getCurrentUser()
    if (!currentUser) return { success: false, error: 'Unauthenticated' }

    // params.initiatedByPersonId is the resource owner (e.g. the employee requesting leave).
    // currentUser.personId is the actor (may be HR_ADMIN filing on someone's behalf).
    // Approval chain must be resolved from the resource owner, not the actor, so
    // the LINE_MANAGER traversal starts at the correct person.
    const initiatedByPersonId = params.initiatedByPersonId || currentUser.personId || ''
    if (!initiatedByPersonId) return { success: false, error: 'No initiator person ID — user account not linked to an employee record' }

    // 1. Load workflow definition
    const defRows = await reader
      .select()
      .from(workflowDefinitionsV2)
      .where(
        and(
          eq(workflowDefinitionsV2.tenantId, TENANT_ID),
          eq(workflowDefinitionsV2.workflowCode, workflowCode),
          eq(workflowDefinitionsV2.isActive, true),
        ),
      )
      .orderBy(desc(workflowDefinitionsV2.version))
      .limit(1)

    if (!defRows.length) {
      return { success: false, error: `No active workflow found for code: ${workflowCode}` }
    }

    const def = defRows[0]

    // 2. Load steps
    const steps = await reader
      .select()
      .from(workflowStepsV2)
      .where(
        and(
          eq(workflowStepsV2.workflowDefinitionId, def.id),
          eq(workflowStepsV2.isActive, true),
        ),
      )
      .orderBy(workflowStepsV2.stepOrder)

    // 3. Build context
    const ctx = await loadPersonContext(initiatedByPersonId, resourceType, resourceId, contextOverrides, reader)

    // 4. Load all rules for this definition's steps
    const ruleIds = steps
      .map(s => s.activationConditionId)
      .filter((id): id is string => id !== null)

    const rulesData = ruleIds.length
      ? await reader
          .select({ id: workflowRules.id, conditionTree: workflowRules.conditionTree })
          .from(workflowRules)
          .where(inArray(workflowRules.id, ruleIds))
      : []

    // Also check selector rule
    if (def.selectorRuleId) {
      const selectorRows = await reader
        .select({ id: workflowRules.id, conditionTree: workflowRules.conditionTree })
        .from(workflowRules)
        .where(eq(workflowRules.id, def.selectorRuleId))
        .limit(1)
      if (selectorRows.length) rulesData.push(selectorRows[0])
    }

    const firedRuleIds = evaluateRules(
      rulesData.map(r => ({ id: r.id, conditionTree: r.conditionTree as never })),
      ctx,
    )

    // 5. Resolve approval chain
  const workflowAsOfDate = await resolveWorkflowAsOfDate(resourceType, resourceId, ctx, reader)
    if (!workflowAsOfDate && workflowHasLineManagerStep(steps as WorkflowStepV2[])) {
      return { success: false, error: "NO_MANAGER_AS_OF_DATE: workflow as-of date is required for line-manager routing" }
    }
    const routingContext = buildWorkflowRoutingContext({
      subjectAsOfDate: workflowAsOfDate ?? new Date().toISOString().slice(0, 10),
      routingDate:     normalizeWorkflowDate(ctx['workflow.routing_date']) ?? workflowAsOfDate ?? new Date().toISOString().slice(0, 10),
      resourceType,
      resourceId,
      workflowCode,
      tenantId:        TENANT_ID,
      personId:        initiatedByPersonId,
    })

    const resolvedSteps = await resolveApprovalChain({
      steps: steps as WorkflowStepV2[],
      submitterPersonId: initiatedByPersonId,
      workflowCode,
      onApproverNotFound: def.onApproverNotFound as 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR',
      fallbackPersonId: def.fallbackPersonId,
      firedRuleIds,
      ctx,
      routingContext,
    })

    if (!resolvedSteps.length) {
      return { success: false, error: 'No approvers could be resolved for this workflow.' }
    }

    // 6. Build snapshots
    const hierarchySnapshot: HierarchySnapshot = {
      encryptedAt:   new Date().toISOString(),
      resolvedSteps,
      resolvedBy:    'avaniis-workflow-engine-v2',
    }

    const contextSnapshot: ContextSnapshot = {
      encryptedAt:  new Date().toISOString(),
      resourceType,
      resourceId,
      fields:       { ...ctx, routingContext } as unknown as Record<string, unknown>,
    }

    // 7. Calculate SLA deadline
    const slaCalendarRows = await reader
      .select({ id: workflowSlaCalendars.id })
      .from(workflowSlaCalendars)
      .where(
        and(
          eq(workflowSlaCalendars.tenantId, TENANT_ID),
          eq(workflowSlaCalendars.isDefault, true),
          eq(workflowSlaCalendars.isActive, true),
        ),
      )
      .limit(1)

    const calendarId = slaCalendarRows[0]?.id ?? null

    const slaDeadline = await calculateSLADeadline({
      slaWorkingHours: def.defaultSlaHours,
      legalEntityId,
      calendarId,
    })

    // Pre-compute step SLA deadlines — read-only calls that must stay OUTSIDE the
    // write transaction to avoid nested transactions and minimise lock duration.
    const stepSlaDeadlines: Date[] = []
    for (let i = 0; i < resolvedSteps.length; i++) {
      const resolved = resolvedSteps[i]
      const matchingStep = steps.find(
        s => s.stepCode === resolved.stepCode || s.stepOrder === resolved.stepOrder,
      )
      const stepSlaHours = matchingStep?.slaHours ?? def.defaultSlaHours
      stepSlaDeadlines.push(
        await calculateSLADeadline({
          slaWorkingHours: stepSlaHours,
          legalEntityId,
          calendarId,
        }),
      )
    }

    // 8. Create instance + all related records.
    // COLLISION-003 fix (Phase 3 Priority 6C): all writes (instance row, step instances,
    // email token, notification queue, audit) participate in a single transaction.
    // When an outer tx is supplied by the caller (e.g. submitLeaveRequest), all writes
    // join that transaction — leave-request creation and workflow submission become fully
    // atomic. When no outer tx is supplied, submitWorkflow opens its own transaction
    // exactly as before (zero behaviour change for other callers).
    const instanceId = randomUUID()
    const firstStep  = resolvedSteps[0]
    const firstStepId = steps.find(s => s.stepOrder === resolvedSteps[0].stepOrder)?.id

    // doWrites: all database mutations for step 8. Accepts either the outer caller's
    // transaction or the fresh transaction opened below — same body either way.
    const doWrites = async (client: DbOrTx) => {
      // 8a. Insert workflow instance
      await client.insert(workflowInstancesV2).values({
        id:                    instanceId,
        tenantId:              TENANT_ID,
        workflowDefinitionId:  def.id,
        legalEntityId,
        resourceType,
        resourceId,
        initiatedByPersonId,
        status:                'PENDING',
        currentStepOrder:      1,
        hierarchySnapshot:     hierarchySnapshot as never,
        contextSnapshot:       contextSnapshot as never,
        resolvedSteps:         resolvedSteps as never,
        slaCalendarId:         calendarId,
        slaDeadline,
        startedAt:             new Date(),
        createdBy:             initiatedByPersonId,
        createdByName:         ctx['employee.full_name'],
        createdDate:           new Date(),
      })

      // 8b. Insert step instances (SLA deadlines pre-computed above)
      for (let i = 0; i < resolvedSteps.length; i++) {
        const resolved = resolvedSteps[i]
        const matchingStep = steps.find(
          s => s.stepCode === resolved.stepCode || s.stepOrder === resolved.stepOrder,
        )
        const isFirst = i === 0

        await client.insert(workflowStepInstances).values({
          id:                  randomUUID(),
          tenantId:            TENANT_ID,
          instanceId,
          stepId:              matchingStep?.id ?? steps[0].id,
          stepOrder:           resolved.stepOrder,
          status:              isFirst ? 'PENDING' : 'WAITING',
          assignedToPersonId:  resolved.personId,
          slaDeadline:         isFirst ? stepSlaDeadlines[i] : null,
          createdBy:           SYSTEM_ACTOR.id,
          createdByName:       SYSTEM_ACTOR.name,
          createdDate:         new Date(),
        })
      }

      // 8c. Update instance with first step reference
      if (firstStepId) {
        await client
          .update(workflowInstancesV2)
          .set({
            currentStepId:    firstStepId,
            currentStepOrder: 1,
            status:           'IN_PROGRESS',
            updatedBy:        SYSTEM_ACTOR.id,
            updatedByName:    SYSTEM_ACTOR.name,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(workflowInstancesV2.id, instanceId))
      }

      // 8d. Queue notification for step 1 approver
      // SELECT uses client so it reads the step row just inserted in 8b above.
      const firstStepInstance = await client
        .select()
        .from(workflowStepInstances)
        .where(
          and(
            eq(workflowStepInstances.instanceId, instanceId),
            eq(workflowStepInstances.stepOrder, 1),
          ),
        )
        .limit(1)

      if (firstStepInstance.length && firstStep.personId) {
        const { jti, token } = issueEmailToken({
          instanceId,
          stepInstanceId: firstStepInstance[0].id,
          personId:       firstStep.personId,
          action:         'APPROVE',
          expiresAt:      slaDeadline,
        })

        await client.insert(workflowEmailTokens).values({
          jti,
          tenantId:         TENANT_ID,
          instanceId,
          stepInstanceId:   firstStepInstance[0].id,
          intendedAction:   'APPROVE',
          issuedToPersonId: firstStep.personId,
          expiresAt:        slaDeadline,
          createdAt:        new Date(),
        })

        await client
          .update(workflowStepInstances)
          .set({ emailTokenJti: jti })
          .where(eq(workflowStepInstances.id, firstStepInstance[0].id))

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hr.avaniis.ae'
        await queueNotification({
          instanceId,
          stepInstanceId:    firstStepInstance[0].id,
          recipientPersonId: firstStep.personId,
          templateCode:      'WF_APPROVAL_REQUEST',
          actionUrl:         `${baseUrl}/api/workflow/action?token=${token}`,
          tx:                client,
        })
      }

      // 8e. Audit — inside transaction so it rolls back with the rest on error
      await writeAudit({
        instanceId,
        action:        'SUBMITTED',
        actorPersonId: initiatedByPersonId,
        eventData: {
          workflowCode,
          resourceType,
          resourceId,
          totalSteps: resolvedSteps.length,
          slaDeadline: slaDeadline.toISOString(),
        },
        tx: client,
      })
    }

    // Conditional transaction dispatch (COLLISION-003 fix):
    // When the caller supplies an outer tx, participate in it directly.
    // Otherwise open an independent db.transaction (existing behaviour for
    // all callers other than submitLeaveRequest).
    if (outerTx) {
      await doWrites(outerTx)
    } else {
      await db.transaction(async _tx => doWrites(_tx as unknown as DbOrTx))
    }

    return { success: true, instanceId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * After a workflow instance reaches a terminal status (APPROVED / REJECTED),
 * update the originating resource record and notify the requester.
 * Extend the switch for each resource type as new workflows are added.
 */
async function dispatchResourceCompletion(params: {
  resourceType:          string
  resourceId:            string
  finalStatus:           'APPROVED' | 'REJECTED'
  initiatedByPersonId:   string
  legalEntityId:         string
  actorPersonId:         string
  actorDisplayName:      string
  decisionNote?:         string | null
  /** Pass the caller's transaction so resource update + notification are atomic. */
  tx?:                   DbOrTx
}): Promise<void> {
  const {
    resourceType, resourceId, finalStatus,
    initiatedByPersonId, legalEntityId, actorPersonId, actorDisplayName, decisionNote, tx,
  } = params
  // Use the caller's transaction when provided; fall back to the global db client.
  // COLLISION-PROBATION fix (Phase 3 P6E): applyProbationOutcome now accepts the caller's
  // tx and all probation writes join the outer transaction. When tx is undefined, each
  // branch opens its own db.transaction (backward compatible for standalone callers).
  const client = tx ?? db

  if (resourceType === 'absence_entries') {
    // Fetch leave details before updating status — needed for enriched notification body.
    const leaveRows = await db
      .select({
        startDate:    absenceEntries.startDate,
        endDate:      absenceEntries.endDate,
        durationDays: absenceEntries.durationDays,
        typeNameEn:   absenceTypes.typeNameEn,
        typeNameAr:   absenceTypes.typeNameAr,
      })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(eq(absenceEntries.id, resourceId), eq(absenceEntries.tenantId, TENANT_ID)))
      .limit(1)
    const leaveDetail = leaveRows[0] ?? null

    await client
      .update(absenceEntries)
      .set({
        status:          finalStatus,
        updatedBy:       actorPersonId,
        updatedByName:   actorDisplayName,
        updatedDate:     new Date(),
        lastUpdatedDate: new Date(),
      })
      .where(and(eq(absenceEntries.id, resourceId), eq(absenceEntries.tenantId, TENANT_ID)))

    const isApproved = finalStatus === 'APPROVED'
    const notifType  = isApproved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED'
    const subjectEn  = isApproved ? 'Your Leave Request Has Been Approved' : 'Your Leave Request Has Been Rejected'
    const subjectAr  = isApproved ? 'تمت الموافقة على طلب إجازتك'        : 'تم رفض طلب إجازتك'

    const { bodyEn, bodyAr } = buildLeaveDecisionNotificationBody({
      isApproved,
      actorDisplayName,
      typeNameEn:   leaveDetail?.typeNameEn,
      typeNameAr:   leaveDetail?.typeNameAr,
      startDate:    leaveDetail?.startDate as string | null | undefined,
      endDate:      leaveDetail?.endDate   as string | null | undefined,
      durationDays: leaveDetail?.durationDays as number | string | null | undefined,
      decisionNote,
    })

    await client.insert(notificationLog).values({
      tenantId:          TENANT_ID,
      legalEntityId,
      recipientPersonId: initiatedByPersonId,
      notificationType:  notifType,
      channel:           'IN_APP',
      subjectEn,
      subjectAr,
      bodyEn,
      bodyAr,
      referenceType:     'ABSENCE_ENTRY',
      referenceId:       resourceId,
      status:            'SENT',
      sentAt:            new Date(),
      createdBy:         actorPersonId,
      createdByName:     actorDisplayName,
    })
  }
  // Probation review completion — routes to applyProbationOutcome.
  // COLLISION-PROBATION fix (Phase 3 P6E): pass tx so probation writes join the
  // caller's post-claim transaction atomically.
  if (resourceType === 'probation_review') {
    const { applyProbationOutcome } = await import('@/modules/core-hr/probation/workflow-actions')
    await applyProbationOutcome({
      reviewId:       resourceId,
      finalStatus,
      actorPersonId,
      legalEntityId,
      decisionNote:   decisionNote ?? undefined,
      tx,             // join caller's post-claim transaction
    })
  }

  // Hiring request approval/rejection.
  // Updating status releases the partial unique index on (tenant_id, position_id)
  // WHERE status = 'PENDING_APPROVAL' (migration 0041), allowing re-hiring for the
  // same position once this request is resolved.
  if (resourceType === 'hiring_requests') {
    const now = new Date()
    await client
      .update(hiringRequests)
      .set({
        status:          finalStatus,          // 'APPROVED' | 'REJECTED'
        updatedBy:       actorPersonId,
        updatedByName:   actorDisplayName,
        updatedDate:     now,
        lastUpdatedDate: now,
      })
      .where(and(eq(hiringRequests.id, resourceId), eq(hiringRequests.tenantId, TENANT_ID)))

    const isApproved = finalStatus === 'APPROVED'
    await client.insert(notificationLog).values({
      tenantId:          TENANT_ID,
      legalEntityId,
      recipientPersonId: initiatedByPersonId,
      notificationType:  isApproved ? 'HIRING_REQUEST_APPROVED' : 'HIRING_REQUEST_REJECTED',
      channel:           'IN_APP',
      subjectEn:         isApproved
        ? 'Your Hiring Request Has Been Approved'
        : 'Your Hiring Request Has Been Rejected',
      subjectAr:         isApproved
        ? 'تمت الموافقة على طلب التوظيف'
        : 'تم رفض طلب التوظيف',
      bodyEn:            isApproved
        ? `Your hiring request has been approved by ${actorDisplayName}.${decisionNote ? ` Note: ${decisionNote}` : ''}`
        : `Your hiring request has been rejected by ${actorDisplayName}.${decisionNote ? ` Reason: ${decisionNote}` : ''}`,
      bodyAr:            isApproved
        ? `تمت الموافقة على طلب التوظيف من قِبل ${actorDisplayName}.${decisionNote ? ` ملاحظة: ${decisionNote}` : ''}`
        : `تم رفض طلب التوظيف من قِبل ${actorDisplayName}.${decisionNote ? ` السبب: ${decisionNote}` : ''}`,
      referenceType:     'HIRING_REQUEST',
      referenceId:       resourceId,
      status:            'SENT',
      sentAt:            now,
      createdBy:         actorPersonId,
      createdByName:     actorDisplayName,
    })
  }

  // Transfer/promotion request approval or rejection.
  // Updating status releases the partial unique index on (tenant_id, person_id)
  // WHERE status = 'PENDING_APPROVAL' (migration 0042), allowing a new transfer
  // or promotion request to be raised for the same person once this one is resolved.
  if (resourceType === 'transfer_requests') {
    const now = new Date()
    await client
      .update(transferRequests)
      .set({
        status:          finalStatus,          // 'APPROVED' | 'REJECTED'
        updatedBy:       actorPersonId,
        updatedByName:   actorDisplayName,
        updatedDate:     now,
        lastUpdatedDate: now,
      })
      .where(and(eq(transferRequests.id, resourceId), eq(transferRequests.tenantId, TENANT_ID)))

    // Apply-back: on FINAL approval, actually move the employee (close+open the
    // worker_assignment + record the employment_action). Previously missing, so
    // approved transfers/promotions never took effect. No-ops on rejection;
    // joins this transaction so apply + status + audit are atomic.
    if (finalStatus === 'APPROVED') {
      const { applyTransferOutcome } = await import('@/modules/core-hr/employment-actions/workflow-actions')
      await applyTransferOutcome({
        requestId:        resourceId,
        finalStatus,
        actorPersonId,
        actorDisplayName,
        legalEntityId,
        tx:               client,
      })
    }

    const isApproved = finalStatus === 'APPROVED'
    await client.insert(notificationLog).values({
      tenantId:          TENANT_ID,
      legalEntityId,
      recipientPersonId: initiatedByPersonId,
      notificationType:  isApproved ? 'TRANSFER_REQUEST_APPROVED' : 'TRANSFER_REQUEST_REJECTED',
      channel:           'IN_APP',
      subjectEn:         isApproved
        ? 'Your Transfer Request Has Been Approved'
        : 'Your Transfer Request Has Been Rejected',
      subjectAr:         isApproved
        ? 'تمت الموافقة على طلب النقل'
        : 'تم رفض طلب النقل',
      bodyEn:            isApproved
        ? `Your transfer/promotion request has been approved by ${actorDisplayName}.${decisionNote ? ` Note: ${decisionNote}` : ''}`
        : `Your transfer/promotion request has been rejected by ${actorDisplayName}.${decisionNote ? ` Reason: ${decisionNote}` : ''}`,
      bodyAr:            isApproved
        ? `تمت الموافقة على طلب النقل/الترقية من قِبل ${actorDisplayName}.${decisionNote ? ` ملاحظة: ${decisionNote}` : ''}`
        : `تم رفض طلب النقل/الترقية من قِبل ${actorDisplayName}.${decisionNote ? ` السبب: ${decisionNote}` : ''}`,
      referenceType:     'TRANSFER_REQUEST',
      referenceId:       resourceId,
      status:            'SENT',
      sentAt:            now,
      createdBy:         actorPersonId,
      createdByName:     actorDisplayName,
    })
  }

  // Add other resourceType cases here as new workflows are introduced
}

/**
 * Cancel a workflow instance when its underlying resource is cancelled (e.g. an
 * employee cancels their leave request). Closes the instance (status CANCELLED)
 * and RECALLs any still-open steps so no approver can action a cancelled request
 * from any entry point. Idempotent — skips instances already in a terminal state.
 * Participates in the caller's transaction when `tx` is supplied.
 */
export async function cancelWorkflowInstance(params: {
  instanceId: string
  actorPersonId?: string
  actorName?: string
  reason?: string
  tx?: DbOrTx
}): Promise<{ success: boolean; error?: string }> {
  const { instanceId, actorPersonId, actorName, reason, tx } = params
  const client = tx ?? db

  const [inst] = await client
    .select({ status: workflowInstancesV2.status })
    .from(workflowInstancesV2)
    .where(eq(workflowInstancesV2.id, instanceId))
    .limit(1)
  if (!inst) return { success: false, error: 'Workflow instance not found' }

  // Already terminal — nothing to close (idempotent, safe to call repeatedly).
  if ((['APPROVED', 'REJECTED', 'CANCELLED', 'RECALLED'] as string[]).includes(inst.status)) {
    return { success: true }
  }

  await client
    .update(workflowInstancesV2)
    .set({
      status:          'CANCELLED',
      completedAt:     new Date(),
      recalledBy:      actorPersonId ?? null,
      recalledAt:      new Date(),
      recallReason:    reason,
      updatedBy:       actorPersonId ?? SYSTEM_ACTOR.id,
      updatedByName:   actorName ?? SYSTEM_ACTOR.name,
      lastUpdatedDate: new Date(),
    })
    .where(eq(workflowInstancesV2.id, instanceId))

  // Recall any still-open steps so they are no longer actionable from the
  // Approvals menu / bell after the request is cancelled.
  await client
    .update(workflowStepInstances)
    .set({
      status:          'RECALLED',
      updatedBy:       actorPersonId ?? SYSTEM_ACTOR.id,
      updatedByName:   actorName ?? SYSTEM_ACTOR.name,
      lastUpdatedDate: new Date(),
    })
    .where(and(
      eq(workflowStepInstances.instanceId, instanceId),
      inArray(workflowStepInstances.status, ['WAITING', 'PENDING']),
    ))

  await writeAudit({
    instanceId,
    action:        'INSTANCE_CANCELLED',
    actorPersonId,
    actorName:     actorName ?? SYSTEM_ACTOR.name,
    eventData:     { reason },
    tx: client,
  })

  return { success: true }
}

/**
 * Record a decision (Approve / Reject / Delegate) on a workflow step.
 * Advances to the next step on approval, completes the instance on final approval.
 */
export async function takeWorkflowAction(
  params: TakeWorkflowActionParams,
): Promise<WorkflowActionResult> {
  try {
    const { stepInstanceId, decision, decisionNote, delegateToPersonId, ipAddress, userAgent } = params
    // Resolve actorPersonId and role from session
    let actorPersonId = params.actorPersonId
    const sessionUser = await getCurrentUser().catch(() => null)
    if (actorPersonId === 'CURRENT_USER' || !actorPersonId) {
      // Never fall back to params.actorPersonId here — it IS 'CURRENT_USER', not a UUID.
      actorPersonId = sessionUser?.personId ?? SYSTEM_ACTOR.id
    }

    // Resolve display name once — used for all updatedByName / createdByName fields.
    // resolveActorDisplayName never returns a raw UUID: falls back to 'Workflow approver'.
    const actorDisplayName = await resolveActorDisplayName(actorPersonId)

    // Load step instance
    const stepRows = await db
      .select()
      .from(workflowStepInstances)
      .where(eq(workflowStepInstances.id, stepInstanceId))
      .limit(1)

    if (!stepRows.length) return { success: false, error: 'Step instance not found' }

    const stepInst = stepRows[0]
    if (stepInst.status !== 'PENDING') {
      return { success: false, error: `Step is not actionable (status: ${stepInst.status})` }
    }

    // Authorisation check: actor must be assigned approver, delegated to,
    // or a privileged role (HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN override).
    const PRIVILEGED_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
    const isSystemAction    = actorPersonId === SYSTEM_ACTOR.id
    const isPrivileged      = PRIVILEGED_ROLES.includes(sessionUser?.role ?? '')
    const isAuthorised      =
      stepInst.assignedToPersonId === actorPersonId ||
      stepInst.delegatedToPersonId === actorPersonId

    if (!isSystemAction && !isPrivileged && !isAuthorised) {
      return { success: false, error: 'Actor is not authorised to action this step' }
    }

    // Load instance fields needed for SLA advancement and resource completion.
    // The absence-resource status is fetched in this SAME query via a conditional
    // LEFT JOIN (only matches when resourceType='absence_entries') so the
    // resource-terminal guard below needs NO extra db round-trip — keeping the
    // engine's query sequence unchanged.
    const instRows = await db
      .select({
        resourceType:          workflowInstancesV2.resourceType,
        resourceId:            workflowInstancesV2.resourceId,
        initiatedByPersonId:   workflowInstancesV2.initiatedByPersonId,
        legalEntityId:         workflowInstancesV2.legalEntityId,
        slaCalendarId:         workflowInstancesV2.slaCalendarId,
        absenceStatus:         absenceEntries.status,
      })
      .from(workflowInstancesV2)
      .leftJoin(absenceEntries, and(
        eq(workflowInstancesV2.resourceType, 'absence_entries'),
        eq(absenceEntries.id, workflowInstancesV2.resourceId),
      ))
      .where(eq(workflowInstancesV2.id, stepInst.instanceId))
      .limit(1)

    const inst = instRows[0]

    // ── Resource-terminal guard (escaped-defect P0) ───────────────────────────
    // Even with a PENDING step, a decision must be refused when the UNDERLYING
    // resource is already terminal. Workflow rows and resource rows can diverge
    // for legacy/seeded data (e.g. a CANCELLED leave whose instance stayed
    // IN_PROGRESS and whose step was never recalled — LR-0000001). No UI-only
    // protection: this is enforced for every caller (bell, /approvals form,
    // email one-click, ARIA) because they all route through takeWorkflowAction.
    // Resource status comes from the instRows LEFT JOIN above — no extra query.
    const ABSENCE_TERMINAL = ['CANCELLED', 'REJECTED', 'WITHDRAWN', 'TAKEN']
    if (inst?.resourceType === 'absence_entries' && inst.absenceStatus && ABSENCE_TERMINAL.includes(inst.absenceStatus)) {
      return { success: false, error: `Request is ${inst.absenceStatus} — it can no longer be approved or rejected` }
    }

    // P2-T3 (BR-WF-SOD-001): segregation of duties — block self-approval,
    // self-rejection-from-queue, and delegation to the initiator/self.
    // Applies to privileged roles too; only the SYSTEM actor is exempt.
    const sodVerdict = evaluateSelfApprovalGuard({
      decision,
      actorPersonId,
      initiatedByPersonId: inst?.initiatedByPersonId,
      delegateToPersonId,
      isSystemAction,
    })
    if (sodVerdict.blocked) {
      await writeAuditLog({
        actorId:      actorPersonId,
        actorName:    actorDisplayName,
        actorRole:    sessionUser?.role ?? 'UNKNOWN',
        channel:      'WEB',
        ipAddress,
        eventType:    'WORKFLOW.SELF_APPROVAL_BLOCKED',
        resourceType: 'workflow_step_instances',
        resourceId:   stepInstanceId,
        metadata:     {
          code:        sodVerdict.code,
          decision,
          instanceId:  stepInst.instanceId,
          initiatedBy: inst?.initiatedByPersonId,
          delegateToPersonId: delegateToPersonId ?? null,
        },
        description:  'Workflow decision blocked by segregation-of-duties guard (P2-T3 / BR-WF-SOD-001)',
      })
      return { success: false, error: sodVerdict.error! }
    }

    const auditAction = decision === 'APPROVE' ? 'STEP_APPROVED'
      : decision === 'REJECT'                  ? 'STEP_REJECTED'
      :                                          'STEP_DELEGATED'

    if (decision === 'DELEGATE') {
      if (!delegateToPersonId) return { success: false, error: 'delegateToPersonId required for DELEGATE' }

      // PPCDA-01 H8: cross-entity delegation guard for the V2 path (used by
      // PAYROLL_RUN_APPROVAL). The V1 engine guards this in modules/config; the V2
      // path did not. A workflow decision must not be reassigned to a person
      // outside the instance's legal entity. SYSTEM and SUPER_ADMIN are exempt.
      // The Server Action is an open API, so re-check rather than trust the client.
      if (!isSystemAction && sessionUser?.role !== 'SUPER_ADMIN') {
        const [delegateTarget] = await db
          .select({ legalEntityId: persons.legalEntityId, isActive: persons.isActive })
          .from(persons)
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, delegateToPersonId)))
          .limit(1)
        if (!delegateTarget || !delegateTarget.isActive) {
          return { success: false, error: 'Delegate target is not an active person' }
        }
        if (inst?.legalEntityId && delegateTarget.legalEntityId !== inst.legalEntityId) {
          return { success: false, error: 'Cannot delegate this approval across legal entities' }
        }
      }

      // Fix 2 (COLLISION-003): wrap delegate update + audit in a single transaction
      // so a crash between the two writes cannot leave the step updated but unaudited.
      await db.transaction(async _tx => {
        const tx = _tx as unknown as DbOrTx
        await tx
          .update(workflowStepInstances)
          .set({
            status:                 'PENDING',
            assignedToPersonId:     delegateToPersonId,
            delegatedFromPersonId:  actorPersonId,
            delegatedAt:            new Date(),
            decisionNote,
            updatedBy:              actorPersonId,
            updatedByName:          actorDisplayName,
            lastUpdatedDate:        new Date(),
          })
          .where(eq(workflowStepInstances.id, stepInstanceId))

        await writeAudit({
          instanceId:     stepInst.instanceId,
          stepInstanceId,
          action:         'STEP_DELEGATED',
          actorPersonId,
          actorName:      actorDisplayName,
          ipAddress,
          userAgent,
          eventData:      { delegateToPersonId, decisionNote },
          tx,
        })

        // The delegator has actioned this request (by delegating) — clear their
        // in-app notification so their bell matches the decision, same as
        // approve/reject. The delegatee is notified separately by the queue.
        if (!isSystemAction) {
          await tx
            .update(notificationLog)
            .set({ status: 'ACTIONED', readAt: new Date() })
            .where(and(
              eq(notificationLog.tenantId, TENANT_ID),
              eq(notificationLog.recipientPersonId, actorPersonId),
              eq(notificationLog.referenceId, stepInst.instanceId),
            ))
        }
      })

      return { success: true, instanceStatus: 'IN_PROGRESS' }
    }

    // Record decision — COLLISION-001 fix: atomic check+update using WHERE status='PENDING'.
    // Adding status='PENDING' to the WHERE clause makes the guard atomic at the DB level:
    // only the first concurrent caller will match a PENDING row; the second will get 0 rows
    // back and we detect the race via the empty RETURNING result — no double-approval possible.
    const claimed = await db
      .update(workflowStepInstances)
      .set({
        status:            decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedByPersonId: actorPersonId,
        decision,
        decisionNote,
        decidedAt:         new Date(),
        updatedBy:         actorPersonId,
        updatedByName:     actorDisplayName,
        lastUpdatedDate:   new Date(),
      })
      .where(and(
        eq(workflowStepInstances.id, stepInstanceId),
        eq(workflowStepInstances.status, 'PENDING'),  // atomic: only succeeds once
      ))
      .returning({ id: workflowStepInstances.id })

    if (!claimed.length) {
      // Another actor (or the SLA cron) already actioned this step concurrently.
      // Return a safe, non-crashing error — the step is in its correct final state.
      return { success: false, error: 'Step was already actioned by another approver (concurrent action detected)' }
    }

    // Post-claim writes — all inside a single transaction (COLLISION-006 fix).
    // The atomic claim above intentionally stays OUTSIDE this transaction:
    // including the claim here would hold a row lock for the entire post-claim
    // duration, serialising all concurrent approvals and nullifying COLLISION-001.
    let finalStatus: 'REJECTED' | 'APPROVED' | 'IN_PROGRESS' = 'IN_PROGRESS'

    await db.transaction(async _tx => {
      const tx = _tx as unknown as DbOrTx
      await writeAudit({
        instanceId:     stepInst.instanceId,
        stepInstanceId,
        action:         auditAction as 'STEP_APPROVED' | 'STEP_REJECTED',
        actorPersonId,
        actorName:      actorDisplayName,
        ipAddress,
        userAgent,
        eventData:      { decision, decisionNote },
        tx,
      })

      // Single source of truth: clear the acting approver's in-app notification
      // for this instance the moment a decision is recorded — so the bell reflects
      // the same status as the decision, no matter which entry point was used
      // (Approvals menu → takeWorkflowAction, or bell → approveRequest). System
      // actions (SLA auto-approve/reject) have no recipient notification to clear.
      if (!isSystemAction) {
        await tx
          .update(notificationLog)
          .set({ status: 'ACTIONED', readAt: new Date() })
          .where(and(
            eq(notificationLog.tenantId, TENANT_ID),
            eq(notificationLog.recipientPersonId, actorPersonId),
            eq(notificationLog.referenceId, stepInst.instanceId),
          ))
      }

      if (decision === 'REJECT') {
        // Reject the entire instance
        await tx
          .update(workflowInstancesV2)
          .set({
            status:           'REJECTED',
            completedAt:      new Date(),
            finalDecisionBy:  actorPersonId,
            rejectionReason:  decisionNote,
            updatedBy:        actorPersonId,
            updatedByName:    actorDisplayName,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(workflowInstancesV2.id, stepInst.instanceId))

        await writeAudit({
          instanceId: stepInst.instanceId,
          action:     'INSTANCE_REJECTED',
          actorPersonId,
          actorName:  actorDisplayName,
          eventData:  { rejectedAtStep: stepInst.stepOrder, reason: decisionNote },
          tx,
        })

        if (inst) {
          await dispatchResourceCompletion({
            resourceType:        inst.resourceType,
            resourceId:          inst.resourceId,
            finalStatus:         'REJECTED',
            initiatedByPersonId: inst.initiatedByPersonId,
            legalEntityId:       inst.legalEntityId,
            actorPersonId,
            actorDisplayName,
            decisionNote,
            tx,
          })
        }

        finalStatus = 'REJECTED'
        return  // exit transaction callback — outer code reads finalStatus
      }

      // Approval: try to advance to next step
      const hasNextStep = await activateNextStep(
        stepInst.instanceId,
        stepInst.stepOrder,
        inst?.legalEntityId ?? '',
        inst?.slaCalendarId ?? null,
        tx,  // thread tx so activateNextStep writes are part of this transaction
      )

      if (!hasNextStep) {
        // All steps approved — complete instance
        await tx
          .update(workflowInstancesV2)
          .set({
            status:           'APPROVED',
            completedAt:      new Date(),
            finalDecisionBy:  actorPersonId,
            updatedBy:        actorPersonId,
            updatedByName:    actorDisplayName,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(workflowInstancesV2.id, stepInst.instanceId))

        await writeAudit({
          instanceId: stepInst.instanceId,
          action:     'INSTANCE_APPROVED',
          actorPersonId,
          actorName:  actorDisplayName,
          eventData:  { completedAt: new Date().toISOString() },
          tx,
        })

        if (inst) {
          await dispatchResourceCompletion({
            resourceType:        inst.resourceType,
            resourceId:          inst.resourceId,
            finalStatus:         'APPROVED',
            initiatedByPersonId: inst.initiatedByPersonId,
            legalEntityId:       inst.legalEntityId,
            actorPersonId,
            actorDisplayName,
            decisionNote,
            tx,
          })
        }

        finalStatus = 'APPROVED'
      }
      // else: hasNextStep = true → instance remains IN_PROGRESS, finalStatus stays default
    })

    return { success: true, instanceStatus: finalStatus }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Preview what the approval chain would look like for a given workflow context.
 * Does NOT create any DB records — read-only.
 */
export async function previewWorkflow(params: {
  workflowCode: string
  submitterPersonId: string
  legalEntityId: string
  contextOverrides?: Partial<WorkflowContext>
}): Promise<PreviewWorkflowResult | null> {
  const { workflowCode, submitterPersonId, legalEntityId, contextOverrides } = params

  const defRows = await db
    .select()
    .from(workflowDefinitionsV2)
    .where(
      and(
        eq(workflowDefinitionsV2.tenantId, TENANT_ID),
        eq(workflowDefinitionsV2.workflowCode, workflowCode),
        eq(workflowDefinitionsV2.isActive, true),
      ),
    )
    .limit(1)

  if (!defRows.length) return null

  const def = defRows[0]

  const steps = await db
    .select()
    .from(workflowStepsV2)
    .where(
      and(
        eq(workflowStepsV2.workflowDefinitionId, def.id),
        eq(workflowStepsV2.isActive, true),
      ),
    )
    .orderBy(workflowStepsV2.stepOrder)

  const ctx = await loadPersonContext(submitterPersonId, 'preview', 'preview', contextOverrides)

  const ruleIds = steps
    .map(s => s.activationConditionId)
    .filter((id): id is string => id !== null)

  const rulesData = ruleIds.length
    ? await db
        .select({ id: workflowRules.id, conditionTree: workflowRules.conditionTree })
        .from(workflowRules)
        .where(inArray(workflowRules.id, ruleIds))
    : []

  const firedRuleIds = evaluateRules(
    rulesData.map(r => ({ id: r.id, conditionTree: r.conditionTree as never })),
    ctx,
  )

  const workflowAsOfDate = await resolveWorkflowAsOfDate("preview", "preview", ctx)
  if (!workflowAsOfDate && workflowHasLineManagerStep(steps as WorkflowStepV2[])) return null
  const routingContext = buildWorkflowRoutingContext({
    subjectAsOfDate: workflowAsOfDate!,
    routingDate:     normalizeWorkflowDate(ctx['workflow.routing_date']) ?? workflowAsOfDate!,
    resourceType:    'preview',
    resourceId:      'preview',
    workflowCode,
    tenantId:        TENANT_ID,
    personId:        submitterPersonId,
  })

  const resolvedSteps = await resolveApprovalChain({
    steps: steps as WorkflowStepV2[],
    submitterPersonId,
    workflowCode,
    onApproverNotFound: def.onApproverNotFound as 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR',
    fallbackPersonId: def.fallbackPersonId,
    firedRuleIds,
    ctx,
    routingContext,
  })

  const chain = resolvedSteps.map(resolved => {
    const matchingStep = steps.find(
      s => s.stepCode === resolved.stepCode || s.stepOrder === resolved.stepOrder,
    )
    return {
      stepOrder:        resolved.stepOrder,
      stepCode:         resolved.stepCode,
      stepName:         matchingStep?.stepNameEn ?? resolved.stepCode,
      approverName:     resolved.personName,
      approverPersonId: resolved.personId,
      hierarchyType:    resolved.hierarchyType,
      slaHours:         matchingStep?.slaHours ?? def.defaultSlaHours,
      isFyiOnly:        matchingStep?.isFyiOnly ?? false,
    }
  })

  return {
    workflowCode,
    workflowName: def.workflowNameEn,
    resolvedChain: chain,
    totalSteps: chain.length,
  }
}

/**
 * Cron job handler: scan for SLA breaches and escalate / auto-approve as configured.
 * Run every 30 minutes via vercel cron or app-level scheduler.
 */
export async function processSLABreaches(): Promise<{ processed: number; errors: number }> {
  let processed = 0
  let errors = 0
  const now = new Date()

  // Find all step instances that are PENDING and past their SLA deadline
  const breachedSteps = await db
    .select({
      stepInstance:    workflowStepInstances,
      definition:      workflowDefinitionsV2,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowInstancesV2, eq(workflowStepInstances.instanceId, workflowInstancesV2.id))
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .where(
      and(
        eq(workflowStepInstances.status, 'PENDING'),
        lte(workflowStepInstances.slaDeadline, now),
        or(
          isNull(workflowStepInstances.remindedAt),
          lte(workflowStepInstances.remindedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ),
      ),
    )
    .limit(100)

  for (const { stepInstance, definition } of breachedSteps) {
    try {
      // Load the corresponding step definition to get on_sla_breach policy
      const stepDefRows = await db
        .select()
        .from(workflowStepsV2)
        .where(eq(workflowStepsV2.id, stepInstance.stepId))
        .limit(1)

      const onBreach = (stepDefRows[0]?.onSlaBreach ?? 'ESCALATE') as string

      await writeAudit({
        instanceId:     stepInstance.instanceId,
        stepInstanceId: stepInstance.id,
        action:         'SLA_ESCALATED',
        actorPersonId:  SYSTEM_ACTOR.id,
        actorName:      SYSTEM_ACTOR.name,
        eventData:      { onBreach, deadline: stepInstance.slaDeadline?.toISOString() },
      })

      switch (onBreach) {
        case 'ESCALATE': {
          // PPCDA-01 H9: a breached step must not become a silent dead-end. If an
          // escalation owner is configured (workflowStepsV2.escalation_person_id),
          // REASSIGN the step to them and KEEP it PENDING so it stays actionable
          // (takeWorkflowAction rejects any non-PENDING step), then notify them.
          // Without a configured owner we fall back to the legacy ESCALATED flag
          // but still notify the current assignee so the breach is visible.
          // remindedAt is stamped so the SLA query's 24h cooldown prevents an
          // immediate re-escalation loop on the next cron tick.
          const escalationPersonId = stepDefRows[0]?.escalationPersonId ?? null
          // Fix 4: wrap status updates + notification atomically so a crash cannot
          // leave the step reassigned/escalated while the instance is inconsistent.
          await db.transaction(async tx => {
            const txTyped = tx as DbOrTx
            if (escalationPersonId) {
              await tx
                .update(workflowStepInstances)
                .set({
                  // stays PENDING — now actionable by the escalation owner
                  assignedToPersonId: escalationPersonId,
                  remindedAt:         new Date(),
                  updatedBy:          SYSTEM_ACTOR.id,
                  updatedByName:      SYSTEM_ACTOR.name,
                  lastUpdatedDate:    new Date(),
                })
                .where(eq(workflowStepInstances.id, stepInstance.id))
            } else {
              await tx
                .update(workflowStepInstances)
                .set({
                  status:           'ESCALATED',
                  remindedAt:       new Date(),
                  updatedBy:        SYSTEM_ACTOR.id,
                  updatedByName:    SYSTEM_ACTOR.name,
                  lastUpdatedDate:  new Date(),
                })
                .where(eq(workflowStepInstances.id, stepInstance.id))
            }

            await tx
              .update(workflowInstancesV2)
              .set({
                status:        'ESCALATED',
                escalatedAt:   new Date(),
                updatedBy:     SYSTEM_ACTOR.id,
                updatedByName: SYSTEM_ACTOR.name,
                lastUpdatedDate: new Date(),
              })
              .where(eq(workflowInstancesV2.id, stepInstance.instanceId))

            // Notify someone — the escalation owner if configured, else the
            // currently-assigned approver — so the breach is never silent.
            const notifyPersonId = escalationPersonId ?? stepInstance.assignedToPersonId
            if (notifyPersonId) {
              await queueNotification({
                instanceId:        stepInstance.instanceId,
                stepInstanceId:    stepInstance.id,
                recipientPersonId: notifyPersonId,
                templateCode:      'WF_APPROVAL_REQUEST',
                tx:                txTyped,
              })
            }
          })
          break
        }

        case 'AUTO_APPROVE':
          await takeWorkflowAction({
            stepInstanceId: stepInstance.id,
            actorPersonId:  SYSTEM_ACTOR.id,
            decision:       'APPROVE',
            decisionNote:   'Auto-approved by system: SLA deadline breached',
          })
          break

        case 'AUTO_REJECT':
          await takeWorkflowAction({
            stepInstanceId: stepInstance.id,
            actorPersonId:  SYSTEM_ACTOR.id,
            decision:       'REJECT',
            decisionNote:   'Auto-rejected by system: SLA deadline breached',
          })
          break

        case 'SEND_REMINDER':
          // Fix 5: notification queue + remindedAt update + audit are atomic.
          // Without this, a crash after queueNotification but before the DB update
          // would send duplicate reminders on the next cron tick.
          await db.transaction(async tx => {
            // Cast tx to DbOrTx — Drizzle infers a union when multiple db.transaction
            // calls exist in the same switch block, causing a variance mismatch at
            // optional tx parameter sites.  The runtime type is always correct.
            const txTyped = tx as DbOrTx
            if (stepInstance.assignedToPersonId) {
              await queueNotification({
                instanceId:        stepInstance.instanceId,
                stepInstanceId:    stepInstance.id,
                recipientPersonId: stepInstance.assignedToPersonId,
                templateCode:      'WF_SLA_REMINDER',
                tx:                txTyped,
              })
            }
            await tx
              .update(workflowStepInstances)
              .set({
                remindedAt:       new Date(),
                updatedBy:        SYSTEM_ACTOR.id,
                updatedByName:    SYSTEM_ACTOR.name,
                lastUpdatedDate:  new Date(),
              })
              .where(eq(workflowStepInstances.id, stepInstance.id))

            await writeAudit({
              instanceId:     stepInstance.instanceId,
              stepInstanceId: stepInstance.id,
              action:         'SLA_REMINDER_SENT',
              tx:             txTyped,
            })
          })
          break
      }

      processed++
    } catch (err) {
      console.error('[workflow-sla] Error processing step', stepInstance.id, err)
      errors++
    }
  }

  return { processed, errors }
}
