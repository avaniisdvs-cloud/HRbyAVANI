# AVANIIS HR — P6 Remediation Evidence Bundle
## Supplied at the reviewer's request to validate the 2026-06-13 Foundation Stewardship controls

**Generated:** 2026-06-13 · Repo: /Users/d.kethari/D_Drive/AVANIIS_HR_SYS · Branch: main
**Why this bundle exists:** The original P1–P5 extraction bundles carried `lib/effective-date.ts`
and `lib/as-of-query.ts` but NOT the files below. The independent review (79→80) therefore could
not see the implementations for email delivery, segregation-of-duties (P2-T3), identity uniqueness
(P1-H4), or the runtime permission resolver (P3-D2). This bundle supplies them in full for
independent validation, plus a git timeline proving the remediation post-dates the 2026-06-12
revalidation the review relied upon.

All content below is verbatim and unmodified. Each file begins at a line of '=' with FILE [id]: <path>.


# ============================================================
# SECTION 0 — GIT TIMELINE (proves remediation post-dates the 2026-06-12 revalidation)
# ============================================================

Key fact: the QA revalidation the review leaned on was committed BEFORE the remediation.

| Artifact | Commit | Authored (local +04) |
|---|---|---|
| docs/qa-qc/revalidation-2026-06-12.md (review's evidence) | dec97e0 | 2026-06-12 17:17:36 |
| lib/permissions.ts (P3-D2 resolver) | c0667cc | 2026-06-13 06:11:32 |
| lib/workflow-guards.ts + workflow-engine.ts wiring (P2-T3) | c0667cc | 2026-06-13 06:11:32 |
| lib/identity-uniqueness.ts + lib/identity-hash.ts (P1-H4) | c0667cc | 2026-06-13 06:11:32 |
| drizzle/migrations/0065_identity_uniqueness.sql (P1-H4) | c0667cc | 2026-06-13 06:11:32 |

Commit c0667cc message: "feat(foundation): Stewardship controls P2-T3, P1-H4, P3-D2 (additive)"
=> ~13 hours separate the revalidation (06-12 17:17) from the remediation (06-13 06:11).
   P1-H4 was subsequently activated (enforcement on) through HEAD commit 61eb76b.

Raw git evidence:
```
2026-06-12 17:17:36 +0400  dec97e0  docs: enterprise-readiness review — closure records, revalidation, missing feature docs, CHANGELOG
2026-06-13 06:11:32 +0400  c0667cc  feat(foundation): Stewardship controls P2-T3, P1-H4, P3-D2 (additive)
```


# ============================================================
# SECTION 1 — P3-D2: Runtime permission resolver (EXISTS; rollout partial)
# ============================================================

Resolver is runtime-enforced (throws FORBIDDEN on DENY); it is the SECOND gate after requireRole().
Currently wired to 3 server actions (rollout is the open work — see memo §4 C2):
```
modules/core-hr/actions.ts:70:  await requirePermission(user, 'EMPLOYEE_CREATE', 'create')
modules/core-hr/actions.ts:654:  await requirePermission(user, 'EMPLOYEE_PROFILE', 'edit')
modules/reports/employee-history.ts:143:  await requirePermission(user, 'REPORTS', 'view')
```
Backing table feature_permissions (drizzle/schema/configuration.ts:539):
```
export const featurePermissions = pgTable('feature_permissions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  featureKey:     varchar('feature_key', { length: 80 }).notNull(),
  featureLabel:   varchar('feature_label', { length: 200 }).notNull(),
  featureGroup:   varchar('feature_group', { length: 80 }).notNull(),
  // { view, create, edit, delete, approve, export } booleans
  employeePerms:  jsonb('employee_perms').$type<PermSet>().notNull(),
  managerPerms:   jsonb('manager_perms').$type<PermSet>().notNull(),
  hrAdminPerms:   jsonb('hr_admin_perms').$type<PermSet>().notNull(),
  isSystemLocked: boolean('is_system_locked').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

================================================================================
FILE [P6-1]: lib/permissions.ts
LINES: 118
================================================================================
/**
 * Foundation Stewardship P3-D2 — runtime feature-permission enforcement.
 *
 * Second authorisation layer on top of requireRole(): evaluates the
 * admin-managed feature_permissions matrix (Access → Feature Permissions)
 * at runtime inside server actions.
 *
 * Design decisions (board-approved, additive — no schema change):
 *   • requireRole() remains the FIRST gate — requirePermission() never widens
 *     access, it can only narrow it further.
 *   • The matrix stores per-role PermSets for EMPLOYEE / MANAGER / HR_ADMIN.
 *     Roles outside the matrix (HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN,
 *     FINANCE) pass through — their authority is defined by requireRole and,
 *     for SUPER_ADMIN/HR_DIRECTOR, deliberately not curtailable from a UI
 *     that HR_ADMIN can reach.
 *   • Backward compatibility: if NO matrix row exists for a featureKey the
 *     check passes (legacy-allow). Enforcement begins the moment an admin
 *     creates the row. This prevents a big-bang lockout while making every
 *     wired action immediately governable.
 *   • Denials are structured-logged and throw 'FORBIDDEN:' errors identical
 *     in shape to requireRole failures, so existing catch blocks behave.
 *   • 60s in-process cache keeps the per-action overhead at one indexed read
 *     per minute per feature.
 *
 * Wiring pattern for ALL future modules (Payroll inherits automatically):
 *   const session = await auth()
 *   requireRole(session, 'HR_ADMIN')
 *   await requirePermission(session.user, 'payroll.runs', 'create')
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { featurePermissions, type PermAction, type PermSet } from '@/drizzle/schema'
import { logger } from '@/lib/logger'

interface MatrixRow {
  employeePerms: PermSet
  managerPerms:  PermSet
  hrAdminPerms:  PermSet
}

interface PermissionActor {
  role?:     string | null
  personId?: string | null
  id?:       string | null
}

const MATRIXED_ROLES: Record<string, keyof MatrixRow> = {
  EMPLOYEE: 'employeePerms',
  MANAGER:  'managerPerms',
  HR_ADMIN: 'hrAdminPerms',
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { row: MatrixRow | null; expires: number }>()

/** Test hook + admin-save hook: drop cached matrix rows immediately. */
export function invalidatePermissionCache(featureKey?: string): void {
  if (featureKey) cache.delete(featureKey)
  else cache.clear()
}

async function loadMatrixRow(featureKey: string): Promise<MatrixRow | null> {
  const cached = cache.get(featureKey)
  if (cached && cached.expires > Date.now()) return cached.row

  const rows = await db
    .select({
      employeePerms: featurePermissions.employeePerms,
      managerPerms:  featurePermissions.managerPerms,
      hrAdminPerms:  featurePermissions.hrAdminPerms,
    })
    .from(featurePermissions)
    .where(eq(featurePermissions.featureKey, featureKey))
    .limit(1)

  const row = rows[0] ?? null
  cache.set(featureKey, { row, expires: Date.now() + CACHE_TTL_MS })
  return row
}

/**
 * Pure evaluation — exported for unit tests.
 * Returns 'ALLOW' | 'DENY' | 'LEGACY_ALLOW' | 'ROLE_NOT_MATRIXED'.
 */
export function evaluatePermission(
  role: string | null | undefined,
  row: MatrixRow | null,
  action: PermAction,
): 'ALLOW' | 'DENY' | 'LEGACY_ALLOW' | 'ROLE_NOT_MATRIXED' {
  const permsKey = MATRIXED_ROLES[role ?? '']
  if (!permsKey) return 'ROLE_NOT_MATRIXED'
  if (!row) return 'LEGACY_ALLOW'
  return row[permsKey]?.[action] ? 'ALLOW' : 'DENY'
}

/**
 * Runtime permission gate. Throws 'FORBIDDEN:' on deny; resolves on allow.
 * Never widens access — call AFTER requireRole().
 */
export async function requirePermission(
  actor: PermissionActor,
  featureKey: string,
  action: PermAction,
): Promise<void> {
  const row = await loadMatrixRow(featureKey)
  const verdict = evaluatePermission(actor.role, row, action)

  if (verdict === 'DENY') {
    logger.warn('permissions', 'permission.denied', {
      featureKey,
      action,
      role:     actor.role ?? 'UNKNOWN',
      personId: actor.personId ?? actor.id ?? 'UNKNOWN',
    })
    throw new Error(`FORBIDDEN: role ${actor.role} lacks '${action}' permission on '${featureKey}'`)
  }
}



# ============================================================
# SECTION 2 — P2-T3: Segregation-of-duties / self-approval guard (IMPLEMENTED)
# ============================================================

================================================================================
FILE [P6-2a]: lib/workflow-guards.ts
LINES: 76
================================================================================
/**
 * Foundation Stewardship P2-T3 — Workflow self-approval prevention.
 *
 * Segregation-of-duties guard: no actor may decide (approve/reject) a workflow
 * instance they initiated, and no step may be delegated to the instance
 * initiator or to the delegating actor themselves. Applies to ALL roles
 * including HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN — the privileged-role
 * override in takeWorkflowAction authorises acting on OTHERS' steps, never
 * on the actor's own request. Only the SYSTEM actor (SLA auto-actions,
 * cron-driven escalation) is exempt.
 *
 * Pure module — no DB access — so every future program (Payroll, Talent, …)
 * inherits identical semantics and the logic is unit-testable in isolation.
 */

export type WorkflowDecision = 'APPROVE' | 'REJECT' | 'DELEGATE'

export interface SelfApprovalGuardInput {
  decision:             WorkflowDecision
  actorPersonId:        string
  initiatedByPersonId:  string | null | undefined
  delegateToPersonId?:  string | null
  isSystemAction:       boolean
}

export interface SelfApprovalGuardResult {
  blocked: boolean
  /** Stable machine-readable code for audit + tests. */
  code?:   'SELF_APPROVAL' | 'SELF_REJECTION' | 'DELEGATE_TO_INITIATOR' | 'DELEGATE_TO_SELF'
  /** User-safe English message (BR-WF-SOD-001). */
  error?:  string
}

// BR-WF-SOD-001: a workflow participant must never be the effective decision
// maker on their own request, directly or via delegation.
export function evaluateSelfApprovalGuard(input: SelfApprovalGuardInput): SelfApprovalGuardResult {
  const { decision, actorPersonId, initiatedByPersonId, delegateToPersonId, isSystemAction } = input

  if (isSystemAction) return { blocked: false }
  if (!initiatedByPersonId) return { blocked: false }

  if (decision === 'APPROVE' && actorPersonId === initiatedByPersonId) {
    return {
      blocked: true,
      code:    'SELF_APPROVAL',
      error:   'SELF_APPROVAL_BLOCKED: You cannot approve a request you submitted. Another authorised approver must action it.',
    }
  }

  if (decision === 'REJECT' && actorPersonId === initiatedByPersonId) {
    return {
      blocked: true,
      code:    'SELF_REJECTION',
      error:   'SELF_APPROVAL_BLOCKED: You cannot reject your own request from the approval queue — withdraw it via Cancel instead.',
    }
  }

  if (decision === 'DELEGATE' && delegateToPersonId) {
    if (delegateToPersonId === initiatedByPersonId) {
      return {
        blocked: true,
        code:    'DELEGATE_TO_INITIATOR',
        error:   'SELF_APPROVAL_BLOCKED: This step cannot be delegated to the person who submitted the request.',
      }
    }
    if (delegateToPersonId === actorPersonId) {
      return {
        blocked: true,
        code:    'DELEGATE_TO_SELF',
        error:   'DELEGATION_BLOCKED: You cannot delegate a step to yourself.',
      }
    }
  }

  return { blocked: false }
}


Wiring inside the engine (the guard is invoked on every workflow decision):
```
// lib/workflow-engine.ts — import + invocation
31:import { evaluateSelfApprovalGuard } from '@/lib/workflow-guards'
1209:    const sodVerdict = evaluateSelfApprovalGuard({
```
Full engine source follows (1,703 lines) for independent validation of the SoD block (~line 1206):

================================================================================
FILE [P6-2b]: lib/workflow-engine.ts
LINES: 1703
================================================================================
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

    // Load instance fields needed for SLA advancement and resource completion
    const instRows = await db
      .select({
        resourceType:          workflowInstancesV2.resourceType,
        resourceId:            workflowInstancesV2.resourceId,
        initiatedByPersonId:   workflowInstancesV2.initiatedByPersonId,
        legalEntityId:         workflowInstancesV2.legalEntityId,
        slaCalendarId:         workflowInstancesV2.slaCalendarId,
      })
      .from(workflowInstancesV2)
      .where(eq(workflowInstancesV2.id, stepInst.instanceId))
      .limit(1)

    const inst = instRows[0]

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
        case 'ESCALATE':
          // Fix 4: wrap both status updates atomically so a crash between the two
          // writes cannot leave the step ESCALATED while the instance remains IN_PROGRESS.
          await db.transaction(async tx => {
            await tx
              .update(workflowStepInstances)
              .set({
                status:           'ESCALATED',
                updatedBy:        SYSTEM_ACTOR.id,
                updatedByName:    SYSTEM_ACTOR.name,
                lastUpdatedDate:  new Date(),
              })
              .where(eq(workflowStepInstances.id, stepInstance.id))

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
          })
          break

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



# ============================================================
# SECTION 3 — P1-H4: Identity uniqueness (Emirates ID / passport / employee code)
# ============================================================

================================================================================
FILE [P6-3a]: drizzle/migrations/0065_identity_uniqueness.sql
LINES: 39
================================================================================
-- 0065 — Foundation Stewardship P1-H4: identity uniqueness (BR-ID-UNIQ-001)
-- Status: NOT APPLIED — apply via the migration-ledger process only
--         (docs/environment/migration-ledger.test.md → human approval → Neon SQL Editor).
-- Additive only: new nullable hash columns + partial UNIQUE indexes. No data change.
--
-- ── PRE-FLIGHT (run read-only BEFORE applying; all three must return 0 rows) ──
-- 1) employee_code duplicates (case-insensitive):
--    SELECT lower(employee_code), count(*) FROM persons
--      WHERE employee_code IS NOT NULL
--      GROUP BY tenant_id, lower(employee_code) HAVING count(*) > 1;
-- 2/3) Emirates-ID / passport duplicates cannot be detected in SQL (encrypted,
--    non-deterministic). Run scripts/backfill-identity-hashes.mjs with
--    REPORT_ONLY=true — it decrypts in-process, hashes, and reports duplicate
--    COUNTS only (never identifiers). Resolve any duplicates before Step 3.
--
-- ── STEP 1: hash columns (idempotent) ─────────────────────────────────────────
ALTER TABLE persons ADD COLUMN IF NOT EXISTS emirates_id_hash      varchar(64);
ALTER TABLE persons ADD COLUMN IF NOT EXISTS passport_number_hash  varchar(64);

-- ── STEP 2: employee_code uniqueness (live immediately — column already plain) ─
CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_employee_code
  ON persons (tenant_id, lower(employee_code))
  WHERE employee_code IS NOT NULL;

-- ── STEP 3: identity-hash uniqueness ──────────────────────────────────────────
-- Apply AFTER scripts/backfill-identity-hashes.mjs has populated the hashes
-- and the duplicate report is clean.
CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_emirates_id_hash
  ON persons (tenant_id, emirates_id_hash)
  WHERE emirates_id_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_passport_number_hash
  ON persons (tenant_id, passport_number_hash)
  WHERE passport_number_hash IS NOT NULL;

-- ── POST-APPLY ────────────────────────────────────────────────────────────────
-- Set IDENTITY_UNIQUENESS_ENFORCEMENT=true in the environment so the
-- application writes hashes on every create/update and pre-checks duplicates
-- in-transaction (lib/identity-uniqueness.ts). Record verification in ledger.


================================================================================
FILE [P6-3b]: lib/identity-uniqueness.ts
LINES: 124
================================================================================
/**
 * Foundation Stewardship P1-H4 — identity uniqueness service.
 *
 * Application-layer duplicate guard for person identity fields, called inside
 * the same transaction as the person INSERT/UPDATE so check + write are atomic
 * under the connection's snapshot. Migration 0065 adds matching partial UNIQUE
 * indexes as the database backstop (race-proof once applied).
 *
 * Layers:
 *   • employee_code  — plain column; case-insensitive check ALWAYS enforced.
 *   • emirates_id / passport_number — enforced via deterministic hash columns
 *     ONLY when IDENTITY_UNIQUENESS_ENFORCEMENT=true (post-0065 + backfill),
 *     because the hash columns do not exist on pre-0065 databases.
 */

import { and, eq, ne, sql } from 'drizzle-orm'
import { persons } from '@/drizzle/schema'
import type { DbOrTx } from '@/lib/db'
import {
  emiratesIdHash,
  passportNumberHash,
  isIdentityHashEnforcementEnabled,
} from '@/lib/identity-hash'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface IdentityUniquenessInput {
  /** Exclude this person (update path). Omit on create. */
  excludePersonId?: string
  employeeCode?:    string | null
  emiratesId?:      string | null   // cleartext (pre-encryption); hashed here
  passportNumber?:  string | null   // cleartext (pre-encryption); hashed here
}

export class IdentityConflictError extends Error {
  constructor(public readonly field: 'employeeCode' | 'emiratesId' | 'passportNumber') {
    super(
      field === 'employeeCode'
        ? 'IDENTITY_CONFLICT: Employee code is already assigned to another person.'
        : field === 'emiratesId'
          ? 'IDENTITY_CONFLICT: Emirates ID is already registered to another person.'
          : 'IDENTITY_CONFLICT: Passport number is already registered to another person.',
    )
    this.name = 'IdentityConflictError'
  }
}

async function existsOther(
  client: DbOrTx,
  condition: ReturnType<typeof sql> | ReturnType<typeof eq>,
  excludePersonId?: string,
): Promise<boolean> {
  const rows = await client
    .select({ id: persons.id })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      condition,
      excludePersonId ? ne(persons.id, excludePersonId) : undefined,
    ))
    .limit(1)
  return rows.length > 0
}

/**
 * Throws IdentityConflictError when another person already holds one of the
 * supplied identifiers. Call inside the person write transaction, BEFORE the
 * INSERT/UPDATE. BR-ID-UNIQ-001.
 */
export async function assertPersonIdentityUnique(
  client: DbOrTx,
  input: IdentityUniquenessInput,
): Promise<void> {
  const { excludePersonId } = input

  if (input.employeeCode) {
    const code = input.employeeCode.trim()
    if (code) {
      const dup = await existsOther(
        client,
        sql`lower(${persons.employeeCode}) = lower(${code})`,
        excludePersonId,
      )
      if (dup) throw new IdentityConflictError('employeeCode')
    }
  }

  if (!isIdentityHashEnforcementEnabled()) return

  const eidHash = emiratesIdHash(input.emiratesId)
  if (eidHash) {
    const dup = await existsOther(
      client,
      sql`${persons.emiratesIdHash} = ${eidHash}`,
      excludePersonId,
    )
    if (dup) throw new IdentityConflictError('emiratesId')
  }

  const ppHash = passportNumberHash(input.passportNumber)
  if (ppHash) {
    const dup = await existsOther(
      client,
      sql`${persons.passportNumberHash} = ${ppHash}`,
      excludePersonId,
    )
    if (dup) throw new IdentityConflictError('passportNumber')
  }
}

/**
 * Insert/update payload fragment for the hash columns. Returns {} while
 * enforcement is disabled so pre-0065 databases never see the new columns.
 */
export function identityHashColumns(
  emiratesId: string | null | undefined,
  passportNumber: string | null | undefined,
): { emiratesIdHash?: string | null; passportNumberHash?: string | null } {
  if (!isIdentityHashEnforcementEnabled()) return {}
  return {
    emiratesIdHash:     emiratesIdHash(emiratesId),
    passportNumberHash: passportNumberHash(passportNumber),
  }
}


================================================================================
FILE [P6-3c]: lib/identity-hash.ts
LINES: 64
================================================================================
/**
 * Foundation Stewardship P1-H4 — deterministic identity hashing.
 *
 * Emirates ID and passport number are stored AES-256-GCM encrypted
 * (non-deterministic IV), so the ciphertext columns can never carry a
 * uniqueness constraint. This module derives a deterministic, keyed
 * HMAC-SHA256 digest of the NORMALISED identifier. The digest:
 *   • is stable for the same identifier  → supports UNIQUE indexes
 *   • is keyed with ENCRYPTION_KEY       → not reversible by rainbow table
 *   • never contains the identifier      → safe to index and log counts of
 *
 * Enforcement is gated behind IDENTITY_UNIQUENESS_ENFORCEMENT=true so the
 * application remains fully compatible with databases where migration 0065
 * (hash columns + unique indexes) has not been applied yet. Sequence:
 *   1. apply 0065 (columns + indexes, per migration ledger process)
 *   2. run scripts/backfill-identity-hashes.mjs (guarded)
 *   3. set IDENTITY_UNIQUENESS_ENFORCEMENT=true
 */

import { createHmac } from 'crypto'

const HASH_CONTEXT_EID      = 'avaniis:identity:eid:v1'
const HASH_CONTEXT_PASSPORT = 'avaniis:identity:passport:v1'

function hmacKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex chars — identity hashing uses the same key material as field encryption')
  }
  return Buffer.from(hex, 'hex')
}

/** Canonical Emirates ID form for hashing: digits only (dashes/spaces removed). */
export function normalizeEmiratesIdForHash(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/** Canonical passport form for hashing: uppercase alphanumerics only. */
export function normalizePassportForHash(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function hash(context: string, normalised: string): string {
  return createHmac('sha256', hmacKey()).update(`${context}|${normalised}`).digest('hex')
}

export function emiratesIdHash(value: string | null | undefined): string | null {
  if (!value) return null
  const normalised = normalizeEmiratesIdForHash(value)
  if (!normalised) return null
  return hash(HASH_CONTEXT_EID, normalised)
}

export function passportNumberHash(value: string | null | undefined): string | null {
  if (!value) return null
  const normalised = normalizePassportForHash(value)
  if (!normalised) return null
  return hash(HASH_CONTEXT_PASSPORT, normalised)
}

/** Hash-backed uniqueness is active only after 0065 is applied + backfilled. */
export function isIdentityHashEnforcementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.IDENTITY_UNIQUENESS_ENFORCEMENT === 'true'
}



# ============================================================
# SECTION 4 — Email delivery (IMPLEMENTED: Graph + SMTP transports, queue, dispatcher cron)
# ============================================================

================================================================================
FILE [P6-4a]: modules/communication/providers/types.ts
LINES: 60
================================================================================
/**
 * Email provider abstraction — the contract every transport implements.
 * Server-only. Concrete providers: GraphEmailProvider, SmtpEmailProvider.
 */
import 'server-only'

export type ProviderType = 'GRAPH_API' | 'SMTP'

/** Resolved, DECRYPTED provider configuration handed to a provider instance. */
export interface ResolvedProviderConfig {
  providerType: ProviderType

  // Graph (decrypted secret)
  graphTenantId?: string | null
  graphClientId?: string | null
  graphClientSecret?: string | null
  graphSenderMailbox?: string | null
  graphSenderName?: string | null
  graphAuthorityUrl?: string | null
  graphBaseUrl?: string | null
  graphMailSendEndpoint?: string | null
  graphScope?: string | null
  graphUseSharedMailbox?: boolean | null

  // SMTP (decrypted password)
  smtpHost?: string | null
  smtpPort?: number | null
  smtpUsername?: string | null
  smtpPassword?: string | null
  smtpEncryption?: 'NONE' | 'SSL' | 'TLS' | 'STARTTLS' | null
  smtpSenderEmail?: string | null
  smtpSenderName?: string | null
  smtpAuthRequired?: boolean | null

  replyToEmail?: string | null
}

export interface OutboundEmail {
  to: string
  toName?: string
  subject: string
  html: string
  text?: string
  fromEmail?: string
  fromName?: string
  replyTo?: string
}

export interface ProviderSendResult {
  success: boolean
  providerMessageId?: string
  error?: string
}

export interface EmailProvider {
  readonly type: ProviderType
  send(email: OutboundEmail): Promise<ProviderSendResult>
  /** Lightweight credential / connectivity check used by Test Email + activation. */
  verify(): Promise<{ ok: boolean; error?: string }>
}


================================================================================
FILE [P6-4b]: modules/communication/providers/graph.ts
LINES: 116
================================================================================
/**
 * Microsoft Graph API email provider.
 *
 * Uses the OAuth2 client-credentials flow (raw fetch to the configurable
 * authority token endpoint — no SDK dependency) to obtain an app-only token,
 * then POSTs to the configurable Graph sendMail endpoint.
 *
 * All endpoints/authority/scope are admin-configurable (Section 3) so the
 * platform works against commercial, GCC-High, or sovereign Graph clouds.
 */
import 'server-only'
import type {
  EmailProvider,
  OutboundEmail,
  ProviderSendResult,
  ResolvedProviderConfig,
} from './types'

const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com'
const DEFAULT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const DEFAULT_SCOPE = 'https://graph.microsoft.com/.default'

export class GraphEmailProvider implements EmailProvider {
  readonly type = 'GRAPH_API' as const
  constructor(private readonly cfg: ResolvedProviderConfig) {}

  private tokenUrl(): string {
    const authority = (this.cfg.graphAuthorityUrl || DEFAULT_AUTHORITY).replace(/\/+$/, '')
    const tenant = this.cfg.graphTenantId
    if (!tenant) throw new Error('Graph Tenant ID is not configured')
    return `${authority}/${tenant}/oauth2/v2.0/token`
  }

  private sendUrl(): string {
    if (this.cfg.graphMailSendEndpoint) return this.cfg.graphMailSendEndpoint
    const base = (this.cfg.graphBaseUrl || DEFAULT_GRAPH_BASE).replace(/\/+$/, '')
    const mailbox = this.cfg.graphSenderMailbox
    if (!mailbox) throw new Error('Graph Sender Mailbox is not configured')
    return `${base}/users/${encodeURIComponent(mailbox)}/sendMail`
  }

  private async getToken(): Promise<string> {
    if (!this.cfg.graphClientId || !this.cfg.graphClientSecret) {
      throw new Error('Graph Client ID / Secret is not configured')
    }
    const body = new URLSearchParams({
      client_id:     this.cfg.graphClientId,
      client_secret: this.cfg.graphClientSecret,
      scope:         this.cfg.graphScope || DEFAULT_SCOPE,
      grant_type:    'client_credentials',
    })
    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const detail = await safeError(res)
      throw new Error(`Graph token request failed (${res.status}): ${detail}`)
    }
    const json = (await res.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('Graph token response missing access_token')
    return json.access_token
  }

  async send(email: OutboundEmail): Promise<ProviderSendResult> {
    try {
      const token = await this.getToken()
      const payload = {
        message: {
          subject: email.subject,
          body: { contentType: 'HTML', content: email.html },
          toRecipients: [{ emailAddress: { address: email.to, name: email.toName } }],
          ...(email.replyTo || this.cfg.replyToEmail
            ? { replyTo: [{ emailAddress: { address: email.replyTo || this.cfg.replyToEmail! } }] }
            : {}),
        },
        saveToSentItems: true,
      }
      const res = await fetch(this.sendUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      // Graph sendMail returns 202 Accepted with empty body on success.
      if (res.status === 202 || res.ok) {
        return { success: true, providerMessageId: res.headers.get('request-id') ?? undefined }
      }
      return { success: false, error: `Graph sendMail failed (${res.status}): ${await safeError(res)}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getToken() // proves tenant/client/secret/scope + connectivity
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

/** Reads an error body WITHOUT leaking secrets (Graph never echoes our secret). */
async function safeError(res: Response): Promise<string> {
  try {
    const txt = await res.text()
    return txt.slice(0, 500)
  } catch {
    return res.statusText
  }
}


================================================================================
FILE [P6-4c]: modules/communication/providers/smtp.ts
LINES: 65
================================================================================
/**
 * SMTP email provider (nodemailer). Works with any RFC-compliant SMTP server
 * (Office 365, Gmail Workspace, SendGrid SMTP relay, on-prem Exchange, etc.).
 */
import 'server-only'
import nodemailer from 'nodemailer'
import type {
  EmailProvider,
  OutboundEmail,
  ProviderSendResult,
  ResolvedProviderConfig,
} from './types'

export class SmtpEmailProvider implements EmailProvider {
  readonly type = 'SMTP' as const
  constructor(private readonly cfg: ResolvedProviderConfig) {}

  private transporter() {
    const port = this.cfg.smtpPort ?? 587
    const enc = this.cfg.smtpEncryption ?? (port === 465 ? 'SSL' : 'STARTTLS')
    if (!this.cfg.smtpHost) throw new Error('SMTP Host is not configured')
    return nodemailer.createTransport({
      host:   this.cfg.smtpHost,
      port,
      secure: enc === 'SSL', // implicit TLS (465); STARTTLS upgrades on 587
      requireTLS: enc === 'TLS' || enc === 'STARTTLS',
      ignoreTLS: enc === 'NONE',
      auth: this.cfg.smtpAuthRequired === false
        ? undefined
        : { user: this.cfg.smtpUsername ?? '', pass: this.cfg.smtpPassword ?? '' },
      tls: { rejectUnauthorized: enc !== 'NONE' },
    })
  }

  private fromHeader(email: OutboundEmail): string {
    const name = email.fromName || this.cfg.smtpSenderName || 'AVANIIS HR'
    const addr = email.fromEmail || this.cfg.smtpSenderEmail || this.cfg.smtpUsername || ''
    return addr ? `${name} <${addr}>` : name
  }

  async send(email: OutboundEmail): Promise<ProviderSendResult> {
    try {
      const info = await this.transporter().sendMail({
        from:    this.fromHeader(email),
        to:      email.toName ? `${email.toName} <${email.to}>` : email.to,
        subject: email.subject,
        html:    email.html,
        text:    email.text,
        replyTo: email.replyTo || this.cfg.replyToEmail || undefined,
      })
      return { success: true, providerMessageId: info.messageId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.transporter().verify()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}


================================================================================
FILE [P6-4d]: modules/communication/email-service.ts
LINES: 373
================================================================================
/**
 * EmailService — the single sanctioned path from a rendered message to a provider.
 *
 *   sendEmail()          — render + send an ad-hoc email immediately
 *   sendTemplateEmail()  — render a template by code + send immediately
 *   sendWorkflowEmail()  — convenience for workflow notifications w/ action links
 *   sendTestEmail()      — verify + send using a SPECIFIC (possibly inactive) row
 *   dispatchQueued()     — process a single QUEUED email_messages row (cron path)
 *   dispatchQueuedMessageById() — process one persisted QUEUED row immediately
 *   retryFailedEmail()   — requeue a FAILED message within its retry budget
 *
 * Server-only. Never imported by client components. Secrets never leave here.
 */
import 'server-only'
import { and, eq, lte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import {
  emailMessages,
  emailDeliveryEvents,
  emailTemplates,
} from '@/drizzle/schema/communication'
import {
  getActiveProvider,
  getSenderDefaults,
  resolveModuleSender,
  toResolvedConfig,
  buildProvider,
  type ProviderSettingsRow,
} from './settings'
import { renderTemplate, type TemplateVars } from './templates/render'
import { wrapBrandedEmail } from './templates/base-layout'
import { TEMPLATE_SEED_MAP } from './templates/seeds'
import type { EmailProvider, OutboundEmail } from './providers/types'
import {
  EMAIL_DELIVERY_REJECTION_EVENT,
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
  type EmailDeliveryPolicySource,
  type EmailDeliveryPolicyResult,
} from './delivery-policy'

type EmailMessageRow = typeof emailMessages.$inferSelect
type EmailAuditActor = { id: string; name: string; role: string }
type SendResult = { ok: boolean; error?: string; rejectedByPolicy?: boolean }

const SYSTEM_ACTOR: EmailAuditActor = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'system: email-delivery-policy',
  role: 'SYSTEM',
}

// ── Template resolution: DB row preferred, seed fallback ─────────────────────
async function resolveTemplate(code: string, lang = 'en') {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(and(
      eq(emailTemplates.tenantId, TENANT_ID),
      eq(emailTemplates.templateCode, code),
      eq(emailTemplates.languageCode, lang),
      eq(emailTemplates.isActive, true),
    ))
    .limit(1)
  if (row) {
    return {
      subjectTemplate: row.subjectTemplate,
      bodyHtmlTemplate: row.bodyHtmlTemplate,
      bodyTextTemplate: row.bodyTextTemplate,
    }
  }
  const seed = TEMPLATE_SEED_MAP[code]
  if (!seed) return null
  return {
    subjectTemplate: seed.subjectTemplate,
    bodyHtmlTemplate: seed.bodyHtmlTemplate,
    bodyTextTemplate: seed.bodyTextTemplate,
  }
}

// ── Delivery-event helpers ────────────────────────────────────────────────────
async function recordEvent(
  messageId: string,
  eventType: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'RETRY' | 'BOUNCED' | 'OPENED',
  payload?: Record<string, unknown>,
  exec: typeof db = db,
) {
  await exec.insert(emailDeliveryEvents).values({
    tenantId: TENANT_ID,
    emailMessageId: messageId,
    eventType,
    eventPayload: payload,
  })
}

async function auditPolicyRejection(args: {
  recipientEmail: string
  policy: EmailDeliveryPolicyResult
  source: EmailDeliveryPolicySource
  actor?: EmailAuditActor
  resourceType?: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
}) {
  const actor = args.actor ?? SYSTEM_ACTOR
  await db.transaction(async (tx) => {
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      channel: 'SYSTEM',
      eventType: EMAIL_DELIVERY_REJECTION_EVENT,
      resourceType: args.resourceType ?? 'email_delivery_policy',
      resourceId: args.resourceId ?? undefined,
      metadata: emailDeliveryPolicyMetadata(args.recipientEmail, args.policy, args.source, args.metadata),
    }, tx)
  })
}

// ── Core: deliver one persisted message row through the active provider ───────
export async function dispatchQueued(row: EmailMessageRow): Promise<{ success: boolean; error?: string }> {
  const policy = validateEmailDeliveryPolicy(row.recipientEmail)
  if (!policy.allowed) {
    await db.transaction(async (tx) => {
      await tx.update(emailMessages)
        .set({
          status: 'CANCELLED',
          lastError: policy.error.slice(0, 2000),
          updatedDate: new Date(),
        })
        .where(and(eq(emailMessages.id, row.id), eq(emailMessages.status, 'QUEUED')))

      await tx.insert(emailDeliveryEvents).values({
        tenantId: TENANT_ID,
        emailMessageId: row.id,
        eventType: 'FAILED',
        eventPayload: emailDeliveryPolicyMetadata(row.recipientEmail, policy, 'dispatchQueued'),
      })

      await writeAuditLog({
        actorId: SYSTEM_ACTOR.id,
        actorName: SYSTEM_ACTOR.name,
        actorRole: SYSTEM_ACTOR.role,
        channel: 'SYSTEM',
        eventType: EMAIL_DELIVERY_REJECTION_EVENT,
        resourceType: 'email_messages',
        resourceId: row.id,
        metadata: emailDeliveryPolicyMetadata(row.recipientEmail, policy, 'dispatchQueued', {
          templateCode: row.templateCode,
          module: row.module,
          workflowRequestId: row.workflowRequestId,
          workflowStepId: row.workflowStepId,
          businessObjectType: row.businessObjectType,
          businessObjectId: row.businessObjectId,
        }),
      }, tx)
    })
    return { success: false, error: policy.error }
  }

  const active = await getActiveProvider(row.tenantId)
  if (!active) {
    await markFailed(row.id, 'No active email provider configured')
    return { success: false, error: 'No active email provider configured' }
  }

  // Atomically CLAIM the message: QUEUED → SENDING only succeeds for the first
  // runner. This makes concurrent/overlapping cron invocations idempotent — a
  // message already SENDING/SENT/FAILED is skipped, never double-sent.
  const [claimed] = await db.update(emailMessages)
    .set({ status: 'SENDING', providerType: active.row.providerType, updatedDate: new Date() })
    .where(and(eq(emailMessages.id, row.id), eq(emailMessages.status, 'QUEUED')))
    .returning({ id: emailMessages.id })
  if (!claimed) {
    return { success: false, error: 'Message already claimed by another dispatcher run' }
  }
  await recordEvent(row.id, 'SENDING')

  // Re-render from stored payload if a template code is present; else use stored subject/html.
  let outbound: OutboundEmail
  const payload = (row.payloadJson ?? {}) as Record<string, unknown>
  if (row.templateCode) {
    const tpl = await resolveTemplate(row.templateCode)
    if (!tpl) {
      await markFailed(row.id, `Template not found: ${row.templateCode}`)
      return { success: false, error: 'Template not found' }
    }
    const rendered = renderTemplate({
      ...tpl,
      vars: (payload.vars ?? {}) as TemplateVars,
      rawKeys: (payload.rawKeys as string[]) ?? [],
      companyName: payload.companyName as string | undefined,
      legalEntityName: payload.legalEntityName as string | undefined,
      hrContact: payload.hrContact as string | undefined,
      complianceFooter: payload.complianceFooter as string | undefined,
      dir: (payload.dir as 'ltr' | 'rtl') ?? 'ltr',
    })
    outbound = {
      to: row.recipientEmail,
      toName: payload.recipientName as string | undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      fromEmail: row.senderEmail ?? undefined,
    }
  } else {
    outbound = {
      to: row.recipientEmail,
      subject: row.subject ?? '(no subject)',
      html: (payload.html as string) ?? wrapBrandedEmail({ title: row.subject ?? '', bodyHtml: '' }),
      fromEmail: row.senderEmail ?? undefined,
    }
  }

  const result = await active.provider.send(outbound)
  if (result.success) {
    await db.update(emailMessages)
      .set({ status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId ?? null, updatedDate: new Date() })
      .where(eq(emailMessages.id, row.id))
    await recordEvent(row.id, 'SENT', { providerMessageId: result.providerMessageId })
    return { success: true }
  }
  await markFailed(row.id, result.error ?? 'Unknown send error')
  return { success: false, error: result.error }
}

/**
 * Queue-first immediate delivery helper.
 *
 * The queue row remains authoritative. This helper only fetches an already
 * committed email_messages row and then reuses dispatchQueued(), including its
 * QUEUED -> SENDING atomic claim. If cron/manual retry races this call, exactly
 * one dispatcher can claim the row.
 */
export async function dispatchQueuedMessageById(messageId: string): Promise<{ success: boolean; error?: string }> {
  const [row] = await db
    .select()
    .from(emailMessages)
    .where(and(
      eq(emailMessages.tenantId, TENANT_ID),
      eq(emailMessages.id, messageId),
      eq(emailMessages.status, 'QUEUED'),
    ))
    .limit(1)

  if (!row) return { success: false, error: 'Message not found or not queued' }
  return dispatchQueued(row)
}

async function markFailed(id: string, error: string) {
  await db.update(emailMessages)
    .set({ status: 'FAILED', lastError: error.slice(0, 2000), retryCount: sql`${emailMessages.retryCount} + 1`, updatedDate: new Date() })
    .where(eq(emailMessages.id, id))
  await recordEvent(id, 'FAILED', { error: error.slice(0, 500) })
}

/** Pick + dispatch a batch of due QUEUED messages. Used by the cron route. */
export async function dispatchBatch(limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const rows = await db
    .select()
    .from(emailMessages)
    .where(and(
      eq(emailMessages.tenantId, TENANT_ID),
      inArray(emailMessages.status, ['QUEUED']),
      lte(emailMessages.sendAfter, new Date()),
    ))
    .limit(limit)

  let sent = 0, failed = 0
  for (const row of rows) {
    const r = await dispatchQueued(row)
    if (r.success) sent++; else failed++
  }
  return { processed: rows.length, sent, failed }
}

/** Requeue a FAILED message if it still has retry budget on the active provider. */
export async function retryFailedEmail(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.select().from(emailMessages).where(eq(emailMessages.id, messageId)).limit(1)
  if (!row) return { ok: false, error: 'Message not found' }
  if (row.status === 'SENT') return { ok: false, error: 'Message already sent' }
  if (row.status !== 'FAILED') return { ok: false, error: 'Only failed messages can be retried' }
  const active = await getActiveProvider(row.tenantId)
  const budget = active?.row.retryCount ?? 3
  if (row.retryCount >= budget) return { ok: false, error: `Retry budget exhausted (${budget})` }
  await db.update(emailMessages)
    .set({ status: 'QUEUED', sendAfter: new Date(), updatedDate: new Date() })
    .where(eq(emailMessages.id, messageId))
  await recordEvent(messageId, 'RETRY')
  return { ok: true }
}

// ── Immediate sends (test email) ──────────────────────────────────────────────

/** Verify + send a test email through a SPECIFIC provider row (need not be active). */
export async function sendTestEmail(
  providerRow: ProviderSettingsRow,
  to: string,
  auditActor?: EmailAuditActor,
): Promise<SendResult> {
  const policy = validateEmailDeliveryPolicy(to)
  if (!policy.allowed) {
    await auditPolicyRejection({
      recipientEmail: to,
      policy,
      source: 'sendTestEmail',
      actor: auditActor,
      resourceType: 'email_provider_settings',
      resourceId: providerRow.id,
      metadata: { providerType: providerRow.providerType },
    })
    return { ok: false, error: policy.error, rejectedByPolicy: true }
  }

  const provider: EmailProvider = buildProvider(toResolvedConfig(providerRow))
  const verify = await provider.verify()
  if (!verify.ok) return { ok: false, error: verify.error }

  const html = wrapBrandedEmail({
    title: 'AVANIIS HR — Test Email',
    bodyHtml: `<p>This is a test email confirming your <strong>${providerRow.providerType === 'GRAPH_API' ? 'Microsoft Graph API' : 'SMTP'}</strong> configuration is working.</p><p>If you received this, outbound email is correctly configured.</p>`,
  })
  const result = await provider.send({ to, subject: 'AVANIIS HR — Test Email', html })
  return { ok: result.success, error: result.error }
}

// ── Ad-hoc immediate sends (used by callers that want synchronous delivery) ───

export async function sendTemplateEmail(args: {
  to: string
  toName?: string
  templateCode: string
  vars: TemplateVars
  rawKeys?: string[]
  module?: string
  lang?: string
  actor?: EmailAuditActor
}): Promise<SendResult> {
  const policy = validateEmailDeliveryPolicy(args.to)
  if (!policy.allowed) {
    await auditPolicyRejection({
      recipientEmail: args.to,
      policy,
      source: 'sendTemplateEmail',
      actor: args.actor,
      metadata: {
        templateCode: args.templateCode,
        module: args.module ?? null,
      },
    })
    return { ok: false, error: policy.error, rejectedByPolicy: true }
  }

  const active = await getActiveProvider()
  if (!active) return { ok: false, error: 'No active email provider configured' }
  const tpl = await resolveTemplate(args.templateCode, args.lang ?? 'en')
  if (!tpl) return { ok: false, error: `Template not found: ${args.templateCode}` }
  const defaults = await getSenderDefaults()
  const sender = resolveModuleSender(defaults, args.module)
  const rendered = renderTemplate({ ...tpl, vars: args.vars, rawKeys: args.rawKeys })
  const result = await active.provider.send({
    to: args.to,
    toName: args.toName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromEmail: sender.fromEmail,
    fromName: sender.fromName,
    replyTo: sender.replyTo,
  })
  return { ok: result.success, error: result.error }
}


================================================================================
FILE [P6-4e]: modules/communication/orchestrator.ts
LINES: 235
================================================================================
/**
 * NotificationOrchestrator — the funnel for business events into channels.
 *
 * Hard rule (Section 9): business logic NEVER calls a provider directly. Modules
 * emit an event here; the orchestrator decides channels (today: in-app + email;
 * future: Teams / SMS / WhatsApp / push) and QUEUES email_messages rows. A cron
 * dispatcher (app/api/cron/email-dispatch) can later recover any rows not sent
 * by the immediate queue-first dispatcher.
 *
 * Queuing is decoupled from sending so a provider outage NEVER blocks or rolls
 * back the originating business transaction.
 */
import 'server-only'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import { emailMessages, emailDeliveryEvents } from '@/drizzle/schema/communication'
import { getSenderDefaults, resolveModuleSender } from './settings'
import type { TemplateVars } from './templates/render'
import { ctaButton } from './templates/base-layout'
import { issueApprovalLinks, type ActionLinks } from './action-tokens'
import { renderDecisionContextHtml, type DecisionContext } from './decision-context'
import {
  EMAIL_DELIVERY_REJECTION_EVENT,
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
} from './delivery-policy'
import { dispatchQueuedMessageById } from './email-service'

export interface QueueEmailArgs {
  templateCode: string
  module?: string
  recipientEmail: string
  recipientPersonId?: string
  recipientName?: string
  vars: TemplateVars
  /** Keys in vars whose values are trusted pre-built HTML (e.g. action buttons). */
  rawKeys?: string[]
  businessObjectType?: string
  businessObjectId?: string
  workflowRequestId?: string
  workflowStepId?: string
  companyName?: string
  legalEntityName?: string
  hrContact?: string
  complianceFooter?: string
  dir?: 'ltr' | 'rtl'
  decisionContext?: DecisionContext
  /**
   * queue_only keeps the historical outbox-only behaviour.
   * immediate queues first, commits the row, then invokes the same dispatcher
   * used by cron. Provider failures remain non-fatal to business workflows.
   */
  dispatchStrategy?: 'queue_only' | 'immediate'
  actor: { id: string; name: string; role?: string }
}

/**
 * Queue a templated email. Returns the new message id, or null on failure.
 * NEVER throws — callers (e.g. leave submission) must not be impacted by email
 * problems. Uses the global pool intentionally so it can be called AFTER the
 * business transaction commits.
 */
export async function queueEmail(args: QueueEmailArgs): Promise<string | null> {
  try {
    const policy = validateEmailDeliveryPolicy(args.recipientEmail)
    if (!policy.allowed) {
      await db.transaction(async (tx) => {
        await writeAuditLog({
          actorId: args.actor.id,
          actorName: args.actor.name,
          actorRole: args.actor.role ?? 'SYSTEM',
          channel: 'SYSTEM',
          eventType: EMAIL_DELIVERY_REJECTION_EVENT,
          resourceType: 'email_delivery_policy',
          resourceId: args.businessObjectId,
          metadata: emailDeliveryPolicyMetadata(args.recipientEmail, policy, 'queueEmail', {
            templateCode: args.templateCode,
            module: args.module ?? null,
            businessObjectType: args.businessObjectType ?? null,
            workflowRequestId: args.workflowRequestId ?? null,
            workflowStepId: args.workflowStepId ?? null,
            recipientPersonId: args.recipientPersonId ?? null,
          }),
        }, tx)
      })
      return null
    }

    const defaults = await getSenderDefaults()
    const sender = resolveModuleSender(defaults, args.module)

    const payloadJson = {
      vars: args.vars,
      rawKeys: args.rawKeys ?? [],
      recipientName: args.recipientName,
      companyName: args.companyName,
      legalEntityName: args.legalEntityName,
      hrContact: args.hrContact,
      complianceFooter: args.complianceFooter,
      dir: args.dir ?? 'ltr',
      decisionContext: args.decisionContext,
    }

    const messageId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(emailMessages).values({
        tenantId: TENANT_ID,
        templateCode: args.templateCode,
        module: args.module,
        recipientEmail: args.recipientEmail,
        recipientPersonId: args.recipientPersonId ?? null,
        senderEmail: sender.fromEmail ?? null,
        status: 'QUEUED',
        businessObjectType: args.businessObjectType ?? null,
        businessObjectId: args.businessObjectId ?? null,
        workflowRequestId: args.workflowRequestId ?? null,
        workflowStepId: args.workflowStepId ?? null,
        payloadJson,
        createdBy: args.actor.id,
        createdByName: args.actor.name,
      }).returning({ id: emailMessages.id })

      if (row) {
        await tx.insert(emailDeliveryEvents).values({
          tenantId: TENANT_ID,
          emailMessageId: row.id,
          eventType: 'QUEUED',
        })
      }
      return row?.id ?? null
    })

    if (messageId && args.dispatchStrategy === 'immediate') {
      try {
        const result = await dispatchQueuedMessageById(messageId)
        if (!result.success) {
          console.error('[orchestrator] immediate email dispatch failed (queue row retained):', result.error)
        }
      } catch (dispatchErr) {
        console.error('[orchestrator] immediate email dispatch threw (queue row retained):',
          dispatchErr instanceof Error ? dispatchErr.message : dispatchErr)
      }
    }

    return messageId
  } catch (err) {
    console.error('[orchestrator] queueEmail failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Convenience for workflow approval emails: issues APPROVE/REJECT/DELEGATE action links
 * (when enabled) and queues the email with rendered action buttons.
 */
export async function queueWorkflowApprovalEmail(args: {
  templateCode: string
  module?: string
  recipientEmail: string
  recipientPersonId: string
  recipientName?: string
  vars: TemplateVars
  workflowInstanceId: string
  workflowStepInstanceId: string
  approverPersonId: string
  businessObjectType?: string
  businessObjectId?: string
  enableWorkflowActions: boolean
  tokenExpiryMinutes: number
  decisionContext?: DecisionContext
  actor: { id: string; name: string }
}): Promise<string | null> {
  let actionButtons = ''
  const decisionContextHtml = args.decisionContext
    ? renderDecisionContextHtml(args.decisionContext)
    : ''
  const rawKeys = ['actionButtons', 'decisionContextHtml']
  const approvalEmailPolicy = validateEmailDeliveryPolicy(args.recipientEmail)
  if (!approvalEmailPolicy.allowed) {
    return queueEmail({
      templateCode: args.templateCode,
      module: args.module,
      recipientEmail: args.recipientEmail,
      recipientPersonId: args.recipientPersonId,
      recipientName: args.recipientName,
      vars: { ...args.vars, decisionContextHtml, actionButtons: decisionContextHtml },
      rawKeys,
      businessObjectType: args.businessObjectType,
      businessObjectId: args.businessObjectId,
      workflowRequestId: args.workflowInstanceId,
      workflowStepId: args.workflowStepInstanceId,
      decisionContext: args.decisionContext,
      dispatchStrategy: 'immediate',
      actor: args.actor,
    })
  }

  if (args.enableWorkflowActions) {
    try {
      const expiresAt = new Date(Date.now() + args.tokenExpiryMinutes * 60_000)
      const links: ActionLinks = await issueApprovalLinks({
        instanceId: args.workflowInstanceId,
        stepInstanceId: args.workflowStepInstanceId,
        approverPersonId: args.approverPersonId,
        expiresAt,
      })
      actionButtons =
        decisionContextHtml +
        ctaButton('Approve · موافقة', links.approveUrl, 'approve') +
        ctaButton('Reject · رفض', links.rejectUrl, 'reject') +
        ctaButton('Delegate · تفويض', links.delegateUrl, 'neutral')
    } catch (err) {
      console.error('[orchestrator] issueApprovalLinks failed (non-fatal):', err instanceof Error ? err.message : err)
    }
  } else {
    actionButtons = decisionContextHtml
  }

  return queueEmail({
    templateCode: args.templateCode,
    module: args.module,
    recipientEmail: args.recipientEmail,
    recipientPersonId: args.recipientPersonId,
    recipientName: args.recipientName,
    vars: { ...args.vars, decisionContextHtml, actionButtons },
    rawKeys,
    businessObjectType: args.businessObjectType,
    businessObjectId: args.businessObjectId,
    workflowRequestId: args.workflowInstanceId,
    workflowStepId: args.workflowStepInstanceId,
    decisionContext: args.decisionContext,
    dispatchStrategy: 'immediate',
    actor: args.actor,
  })
}


================================================================================
FILE [P6-4f]: app/api/cron/email-dispatch/route.ts
LINES: 40
================================================================================
/**
 * Email Dispatch Cron Endpoint.
 * Delivers QUEUED email_messages rows through the admin-selected provider.
 * Called by Vercel Cron (vercel.json schedule).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * This fills the historical gap where queued notifications were never dispatched.
 * Sending is fully decoupled from the originating business transaction.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dispatchBatch } from '@/modules/communication'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-email-dispatch', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await dispatchBatch(50)
    logger.info('cron-email-dispatch', 'tick complete', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('cron-email-dispatch', 'tick failed', { error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const POST = run
// Allow GET so Vercel Cron (which issues GET) and manual checks both work.
export const GET = run



# ============================================================
# SECTION 5 — FILE INDEX
# ============================================================

| ID | File | Lines | Validates |
|---|---|---|---|
| P6-1 | lib/permissions.ts | 118 | P3-D2 resolver |
| P6-2a | lib/workflow-guards.ts | 76 | P2-T3 guard logic |
| P6-2b | lib/workflow-engine.ts | 1703 | P2-T3 wiring |
| P6-3a | drizzle/migrations/0065_identity_uniqueness.sql | 39 | P1-H4 migration |
| P6-3b | lib/identity-uniqueness.ts | 124 | P1-H4 in-tx pre-check |
| P6-3c | lib/identity-hash.ts | 64 | P1-H4 hashing |
| P6-4a | modules/communication/providers/types.ts | 60 | email transport iface |
| P6-4b | modules/communication/providers/graph.ts | 116 | Graph send |
| P6-4c | modules/communication/providers/smtp.ts | 65 | SMTP send |
| P6-4d | modules/communication/email-service.ts | 373 | dispatchQueued |
| P6-4e | modules/communication/orchestrator.ts | 235 | queue |
| P6-4f | app/api/cron/email-dispatch/route.ts | 40 | dispatcher cron |
