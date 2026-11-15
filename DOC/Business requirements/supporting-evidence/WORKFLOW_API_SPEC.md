# AVANIIS HR — Workflow Engine API Specification
## Server Actions, TypeScript Types, and Integration Contracts

**Status:** Design — Awaiting Implementation Approval  
**Date:** 2026-05-01  
**Runtime:** Next.js 14 Server Actions (`'use server'`)

---

## 1. TypeScript Types

```typescript
// ── Context Types ────────────────────────────────────────────────────────────

export interface WorkflowContext {
  // Employee attributes
  employee: {
    id:                  string
    gradeCode:           string
    gradeLevel:          number
    departmentId:        string
    entityId:            string
    nationalityIso3:     string
    nationalityCategory: 'UAE_NATIONAL' | 'GCC' | 'EXPAT'
    employmentType:      'FULL_TIME' | 'PART_TIME' | 'TEMPORARY'
    serviceMonths:       number
    serviceYears:        number
    probationStatus:     'ON_PROBATION' | 'CONFIRMED'
    isUaeNational:       boolean
    managerLevelsCount:  number
    lineManagerId:       string | null
    positionId:          string | null
    hajjTakenAtThisEmployer: boolean
    nursingBreakEndDate: string | null
  }
  // Request attributes (present based on workflow type)
  leave?: {
    type:             string
    days:             number
    workingDays:      number
    isBackdated:      boolean
    backdatedDays:    number
    balanceRemaining: number
    balancePctUsed:   number
    startMonth:       number
    spansRamadan:     boolean
  }
  salary?: {
    incrementPct:    number
    newBasic:        number
    currentBasic:    number
    incrementAed:    number
  }
  travel?: {
    destinationCountry: string
    isInternational:    boolean
    durationDays:       number
    estimatedCostAed:   number
    isGccCountry:       boolean
  }
  attendance?: {
    correctionType: 'PUNCH_IN' | 'PUNCH_OUT' | 'BOTH'
    missedDays:     number
    isRepeated:     boolean
  }
  employmentAction?: {
    type:              'PROMOTE' | 'TRANSFER' | 'GRADE_CHANGE'
    salaryImpactPct:   number
  }
  request?: {
    isFirstOfType:       boolean
    submittedDayOfWeek:  number  // 0=Sun...6=Sat
    requestedRole?:      string  // for access requests
  }
}

// ── Hierarchy Snapshot ──────────────────────────────────────────────────────

export interface PersonRef {
  id:         string
  name:       string
  nameAr:     string | null
  grade:      string | null
  gradeLevel: number | null
}

export interface PositionRef {
  positionId: string
  title:      string
  heldBy:     PersonRef | null  // null = vacant
}

export interface HierarchySnapshot {
  lineManager:    PersonRef | null
  lineManagerL2:  PersonRef | null
  lineManagerL3:  PersonRef | null
  lineManagerL4:  PersonRef | null
  lineManagerL5:  PersonRef | null
  hod:            PersonRef | null  // dept head
  positionChain:  PositionRef[]     // up to 5 levels
  entityHead:     PersonRef | null
  hrAdmins:       PersonRef[]
}

// ── Resolved Step ────────────────────────────────────────────────────────────

export type HierarchyType =
  | 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'
  | 'ROLE_IN_ORG' | 'ROLE_IN_DEPT' | 'NAMED_PERSON'
  | 'INITIATOR_SELF' | 'RULE_RESOLVED'

export interface ResolvedApprover {
  id:   string
  name: string
  nameAr: string | null
  role: string | null
}

export interface ResolvedStep {
  stepOrder:        number
  stepName:         string
  stepNameAr:       string | null
  stepType:         'APPROVAL' | 'REVIEW' | 'NOTIFY' | 'AUTO' | 'PARALLEL_GROUP'
  status:           'ACTIVE' | 'PENDING' | 'SKIPPED'
  resolvedApprovers: ResolvedApprover[]  // may be empty for SKIPPED
  hierarchyUsed:    HierarchyType | null
  hierarchyLevel:   number | null
  isParallel:       boolean
  parallelVoting:   'ANY_ONE' | 'ALL_MUST' | 'MAJORITY' | null
  skipReason:       string | null  // null unless status = SKIPPED
  slaHours:         number
  vacancyEncountered: boolean
  vacancyResolution:  string | null
  delegationApplied:  boolean
  originalApprover:   PersonRef | null  // if delegated
}

// ── Workflow Preview ─────────────────────────────────────────────────────────

export interface WorkflowPreview {
  workflowCode:           string
  workflowName:           string
  defaultHierarchyType:   HierarchyType
  resolvedSteps:          ResolvedStep[]
  totalActiveSteps:       number
  totalSkippedSteps:      number
  estimatedWorkingHours:  number  // sum of SLA hours for active steps
  warnings:               string[]  // e.g., 'Position X is currently vacant'
}

// ── Condition Result (for rule debuggability) ──────────────────────────────

export interface ConditionResult {
  conditionId:  string
  field:        string
  operator:     string
  expectedValue: unknown
  actualValue:   unknown
  passed:        boolean
}

export interface RuleEvaluationResult {
  ruleCode:    string
  ruleName:    string
  result:      boolean
  evaluatedConditions: ConditionResult[]
}

// ── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationInput {
  page:  number
  limit: number
}

export interface PaginatedResult<T> {
  items:    T[]
  total:    number
  page:     number
  limit:    number
  hasMore:  boolean
}

// ── Approval Queue ───────────────────────────────────────────────────────────

export interface PendingApprovalItem {
  instanceStepId:    string
  instanceId:        string
  workflowCode:      string
  workflowName:      string
  workflowNameAr:    string | null
  module:            string
  
  employeeId:        string
  employeeName:      string
  employeeNumber:    string
  employeeAvatar:    string | null
  departmentName:    string
  
  requestSummary:    string   // e.g., "8 days Annual Leave · 04 Jun → 12 Jun"
  requestSummaryAr:  string | null
  
  stepName:          string
  stepOrder:         number
  totalSteps:        number
  hierarchyTypeUsed: HierarchyType
  
  submittedAt:       Date
  slaDeadline:       Date
  slaHoursRemaining: number   // may be negative if overdue
  isOverdue:         boolean
  isDelegated:       boolean
  
  actionsAvailable:  string[]
}

// ── SLA Breach Report ────────────────────────────────────────────────────────

export interface SLABreachReport {
  processedAt:  Date
  totalFound:   number
  escalated:    number
  autoApproved: number
  autoRejected: number
  notifiedOnly: number
  errors:       Array<{ stepId: string; error: string }>
}

// ── Delegation Types ─────────────────────────────────────────────────────────

export type DelegationScope = 'ALL_WORKFLOWS' | 'BY_MODULE' | 'BY_HIERARCHY_TYPE'

export interface CreateDelegationInput {
  delegatorId:          string
  delegateId:           string
  delegationScope:      DelegationScope
  scopeModules?:        string[]
  scopeHierarchyTypes?: HierarchyType[]
  startDate:            string  // YYYY-MM-DD
  endDate:              string  // YYYY-MM-DD
  reason:               string
  approvedBy:           string  // HR Admin person ID
}

// ── Error Types ───────────────────────────────────────────────────────────────

export class WorkflowPreSubmitError extends Error {
  constructor(
    public guard:   string,    // e.g., 'HAJJ_ELIGIBILITY', 'LEAVE_BALANCE'
    public message: string,
    public ruleRef: string,    // e.g., 'BR-HJ-002'
    public data?:   Record<string, unknown>
  ) { super(message) }
}

export class WorkflowVacancyError extends Error {
  constructor(
    public positionId:    string,
    public positionTitle: string,
    public policy:        string   // 'BLOCK_WITH_ERROR'
  ) { super(`Cannot route: position ${positionTitle} is vacant and no fallback configured`) }
}

export class WorkflowUnauthorizedError extends Error {
  constructor(public message: string) { super(message) }
}
```

---

## 2. Server Action Interfaces

### 2.1 `submitWorkflow`

```typescript
'use server'

/**
 * Submit a request into a workflow.
 * Captures immutable hierarchy + context snapshots.
 * Resolves the full approval chain upfront.
 * Activates the first step and sends notifications.
 * 
 * Throws WorkflowPreSubmitError if any pre-submit guard fails.
 */
export async function submitWorkflow(input: {
  workflowCode: string
  entityType:   string     // e.g., 'absence_entries'
  entityId:     string     // UUID of the record being approved
  initiatorId:  string
  context:      WorkflowContext
  comments?:    string
}): Promise<{
  instance:      WorkflowInstanceV2
  resolvedSteps: ResolvedStep[]
  slaDeadline:   Date
}>
```

### 2.2 `takeWorkflowAction`

```typescript
'use server'

/**
 * Actor takes an action on their assigned workflow step.
 * Advances the workflow to the next step (or completes it).
 * Triggers downstream effects on final approval.
 * 
 * Throws WorkflowUnauthorizedError if actor is not the assigned approver.
 */
export async function takeWorkflowAction(input: {
  instanceStepId: string
  actorId:        string
  action:         'APPROVE' | 'REJECT' | 'SEND_BACK' | 'REQUEST_INFO' | 'DELEGATE'
  comments?:      string
  delegateToId?:  string  // required when action = 'DELEGATE'
  sendBackToStep?: number // required when action = 'SEND_BACK'; step_order to send back to
}): Promise<{
  updatedStep:   WorkflowInstanceStep
  nextStep:      WorkflowInstanceStep | null
  instanceStatus: string
}>
```

### 2.3 `previewWorkflow`

```typescript
'use server'

/**
 * Preview what the approval chain would look like for a given employee + context
 * WITHOUT creating a workflow instance.
 * 
 * Used in:
 *   - Employee "Your request will go to..." info before submitting
 *   - HR Admin Hierarchy Preview Tool in workflow builder
 *   - Testing workflow configuration changes
 */
export async function previewWorkflow(input: {
  workflowCode: string
  initiatorId:  string
  context:      WorkflowContext
}): Promise<WorkflowPreview>
```

### 2.4 `getPendingApprovals`

```typescript
'use server'

/**
 * Get paginated list of pending approval steps for an approver.
 * Scoped to their assigned steps only.
 * Includes SLA status, hierarchy type, employee context.
 */
export async function getPendingApprovals(input: {
  approverId: string
  filters?: {
    module?:        string
    entityId?:      string
    hierarchyType?: HierarchyType
    overdueOnly?:   boolean
    search?:        string  // employee name search
  }
  pagination: PaginationInput
  sortBy?: 'OLDEST_FIRST' | 'SLA_EXPIRING' | 'NEWEST'
}): Promise<PaginatedResult<PendingApprovalItem>>
```

### 2.5 `getWorkflowInstance`

```typescript
'use server'

/**
 * Get full workflow instance detail including all steps and audit log.
 * Used for:
 *   - Employee request status view
 *   - Approver detail drawer
 *   - HR Admin workflow monitoring
 * 
 * context_snapshot and hierarchy_snapshot are returned ONLY for HR_ADMIN and SUPER_ADMIN.
 */
export async function getWorkflowInstance(input: {
  instanceId: string
  actorId:    string
}): Promise<{
  instance:          WorkflowInstanceV2
  steps:             WorkflowInstanceStep[]
  auditLog:          WorkflowAuditLogEntry[]
  hierarchySnapshot: HierarchySnapshot | null  // null unless HR Admin
  contextSnapshot:   WorkflowContext | null     // null unless HR Admin
}>
```

### 2.6 `cancelWorkflow`

```typescript
'use server'

/**
 * Cancel an in-progress workflow.
 * Allowed by: initiator (if still in Step 1) or HR_ADMIN (any stage).
 */
export async function cancelWorkflow(input: {
  instanceId:  string
  cancelledBy: string
  reason:      string
}): Promise<void>
```

### 2.7 `createDelegation`

```typescript
'use server'

/**
 * Create a delegation record.
 * Validates: no self-delegation, no circular chains, no date overlap.
 * HR Admin approval required — approvedBy must be an HR_ADMIN person ID.
 */
export async function createDelegation(
  input: CreateDelegationInput
): Promise<WorkflowDelegation>
```

### 2.8 `switchHierarchyType` (Admin Escape Hatch)

```typescript
'use server'

/**
 * HR Admin can switch the hierarchy type for an in-flight workflow instance
 * in exceptional circumstances (e.g., wrong manager in org chart).
 * 
 * This re-resolves the current active step's approver using the new hierarchy type.
 * Audit event: HIERARCHY_SWITCHED with full rationale.
 * 
 * Restricted to: HR_ADMIN, SUPER_ADMIN
 */
export async function switchHierarchyType(input: {
  instanceId:       string
  newHierarchyType: HierarchyType
  newHierarchyLevel?: number
  newGroupId?:        string
  reason:           string
  authorizedBy:     string  // must be HR_ADMIN or SUPER_ADMIN
}): Promise<WorkflowInstanceV2>
```

### 2.9 `processSLABreaches` (Cron)

```typescript
/**
 * Called by cron job every 15 minutes.
 * NOT a server action — called from a background job runner.
 * 
 * Finds all active steps past their SLA deadline.
 * Applies per-step on_sla_breach action: ESCALATE / AUTO_APPROVE / AUTO_REJECT / NOTIFY_ONLY.
 */
export async function processSLABreaches(): Promise<SLABreachReport>
```

### 2.10 `resolveHierarchy` (Internal Service)

```typescript
/**
 * Pure hierarchy resolution service. NOT a server action.
 * Called internally by submitWorkflow and previewWorkflow.
 * 
 * Returns array of resolved approvers (parallel steps return multiple).
 * Includes full audit trail of vacancy handling and delegation.
 */
export async function resolveHierarchy(input: {
  hierarchyType:   HierarchyType
  hierarchyLevel?: number
  groupId?:        string
  role?:           string
  personId?:       string
  ruleId?:         string
  initiatorId:     string
  entityId:        string
  context:         WorkflowContext
  orgSnapshot:     HierarchySnapshot
  workflowDef:     WorkflowDefinitionV2
}): Promise<{
  approvers:           ResolvedApprover[]
  hierarchyPath:       string[]   // audit: which path was taken
  vacanciesEncountered: Array<{ positionId: string; resolution: string }>
  delegationsApplied:  Array<{ originalId: string; delegateId: string }>
}>
```

---

## 3. One-Click Email Approval Token Specification

### 3.1 Token Structure

Email notifications include signed action links for frictionless one-click approval.

```typescript
interface EmailActionToken {
  instanceStepId: string
  action:         'APPROVE' | 'REJECT'
  actorId:        string
  expiresAt:      number  // Unix timestamp = sla_deadline
  iat:            number  // issued at
  jti:            string  // unique token ID (prevents replay)
}
```

Signing algorithm: **HS256** using `process.env.WORKFLOW_TOKEN_SECRET`

### 3.2 Token Generation

```typescript
export function generateEmailActionToken(
  stepId:  string,
  action:  'APPROVE' | 'REJECT',
  actorId: string,
  slaDeadline: Date,
): string {
  const payload: EmailActionToken = {
    instanceStepId: stepId,
    action,
    actorId,
    expiresAt: Math.floor(slaDeadline.getTime() / 1000),
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
  }
  return jwt.sign(payload, process.env.WORKFLOW_TOKEN_SECRET!, { algorithm: 'HS256' })
}
```

### 3.3 Token Validation Endpoint

**Route:** `GET/POST /api/workflow/action?token=<JWT>`

```typescript
// Handler logic:
export async function handleEmailAction(token: string): Promise<Response> {
  // 1. Verify JWT signature
  const payload = jwt.verify(token, process.env.WORKFLOW_TOKEN_SECRET!) as EmailActionToken
  
  // 2. Check expiry (JWT exp claim)
  if (Date.now() / 1000 > payload.expiresAt) {
    return redirect('/approvals/expired?reason=token_expired')
  }
  
  // 3. Check token has not been used (jti blacklist in Redis/DB)
  const used = await isTokenUsed(payload.jti)
  if (used) return redirect('/approvals/expired?reason=already_used')
  
  // 4. Mark token as used (atomic)
  await markTokenUsed(payload.jti, payload.expiresAt)
  
  // 5. Execute action — same as takeWorkflowAction
  const result = await takeWorkflowAction({
    instanceStepId: payload.instanceStepId,
    actorId:        payload.actorId,
    action:         payload.action,
  })
  
  // 6. Redirect to success page
  return redirect(`/approvals/${payload.instanceStepId}/confirmed?action=${payload.action}`)
}
```

**Security properties:**
- Single-use (jti tracked in `workflow_token_usage` table)
- Expires at SLA deadline (incentivizes timely action)
- Actor identity embedded (cannot be used by different approver)
- HTTPS-only (set `Secure` flag)

### 3.4 Email Template with Action Links

```
Subject: Action Required: Annual Leave Request — Aisha Khalidi (8 days)

Dear {{approver.name}},

{{employee.name}} has submitted an Annual Leave request requiring your approval.

Details:
  Employee:  {{employee.name}} ({{employee.number}})
  Department: {{employee.department}}
  Leave type: Annual Leave
  Duration:  {{request.days}} days
  Dates:     {{request.start_date}} → {{request.end_date}}
  Balance:   {{request.balance_remaining}} days remaining

You are Step {{step.order}} of {{total_steps}}: {{step.name}}
Approval deadline: {{sla_deadline}} ({{sla_hours_remaining}} working hours remaining)

┌─────────────────────────────────────────────────────┐
│                                                     │
│   [✓ APPROVE]              [✕ REJECT]               │
│                                                     │
│   approve_link              reject_link             │
└─────────────────────────────────────────────────────┘

Or review full details: {{view_link}}

Note: These links expire at the approval deadline and can only be used once.

AVANIIS HR System
```

---

## 4. Real-Time Status Updates

### 4.1 Polling Pattern (Current Implementation)

Employee and approver views poll for status updates.

```typescript
// Client: poll every 30 seconds when page is visible
export function useWorkflowStatus(instanceId: string) {
  const { data, mutate } = useSWR(
    `/api/workflow/instance/${instanceId}/status`,
    fetcher,
    { refreshInterval: 30_000 }
  )
  return { status: data, refresh: mutate }
}

// Server action for status polling
export async function getWorkflowStatus(instanceId: string): Promise<{
  status:       string
  currentStep:  { stepName: string; stepOrder: number; approverName: string } | null
  lastActivity: Date
  completedAt:  Date | null
}>
```

### 4.2 WebSocket Upgrade Path (Future)

When real-time is prioritized, replace polling with server-sent events:

```typescript
// Route: GET /api/workflow/instance/:id/stream
// Content-Type: text/event-stream

// Events emitted:
// data: { type: 'STEP_ACTIVATED', stepId, stepName, approverName }
// data: { type: 'APPROVED', actorName, comments }
// data: { type: 'REJECTED', actorName, comments, rejectionReason }
// data: { type: 'SLA_BREACHED', stepId, escalatedTo }
// data: { type: 'COMPLETED', finalStatus }
```

---

## 5. Error Handling

All server actions follow this error contract:

```typescript
export type WorkflowActionResult<T> =
  | { success: true;  data: T }
  | { success: false; error: WorkflowError }

export interface WorkflowError {
  code:    string
  message: string
  ruleRef: string | null  // e.g., 'BR-HJ-002'
  data?:   Record<string, unknown>
}

// Error codes:
// PRE_SUBMIT_GUARD_FAILED  — leave balance, hajj, probation, etc.
// UNAUTHORIZED             — actor not assigned to this step
// STEP_NOT_ACTIVE          — step is PENDING or COMPLETED
// VACANCY_BLOCK            — position vacant + BLOCK_WITH_ERROR policy
// COMMENT_REQUIRED         — action requires comment but none provided
// DELEGATE_TO_SELF         — cannot delegate to yourself
// CIRCULAR_DELEGATION      — A→B and B→A both active
// TOKEN_EXPIRED            — one-click email token past SLA deadline
// TOKEN_USED               — one-click email token already consumed
// WORKFLOW_NOT_FOUND       — no active workflow definition for code+entity
// INSTANCE_NOT_FOUND       — instance ID does not exist or wrong tenant
```

---

## 6. Pre-Submit Guards Registry

All guards run synchronously before `submitWorkflow` creates any DB records.

```typescript
export interface PreSubmitGuard {
  code:     string         // e.g., 'LEAVE_BALANCE'
  applies:  (context: WorkflowContext, workflowCode: string) => boolean
  check:    (context: WorkflowContext) => Promise<{ pass: boolean; reason?: string }>
  ruleRef:  string         // business rule reference
}

export const PRE_SUBMIT_GUARDS: PreSubmitGuard[] = [
  {
    code: 'LEAVE_BALANCE',
    applies: (ctx, code) => code.startsWith('WF-LEAVE-') && ctx.leave?.type === 'ANNUAL',
    check: async (ctx) => ({
      pass: (ctx.leave!.balanceRemaining - ctx.leave!.days) >= 0,
      reason: `Insufficient leave balance (${ctx.leave!.balanceRemaining} days available, ${ctx.leave!.days} requested)`,
    }),
    ruleRef: 'BR-AL-001',
  },
  {
    code: 'PROBATION_LEAVE',
    applies: (ctx, code) => code.startsWith('WF-LEAVE-'),
    check: async (ctx) => ({
      pass: ctx.employee.probationStatus === 'CONFIRMED',
      reason: 'Leave cannot be taken during probation period',
    }),
    ruleRef: 'BR-AL-002',
  },
  {
    code: 'HAJJ_ELIGIBILITY',
    applies: (ctx, code) => code === WF_CODES.LEAVE_HAJJ,
    check: async (ctx) => ({
      pass: !ctx.employee.hajjTakenAtThisEmployer,
      reason: 'Hajj leave has already been taken during employment with this company (BR-HJ-002)',
    }),
    ruleRef: 'BR-HJ-002',
  },
  {
    code: 'SICK_CERT_REQUIRED',
    applies: (ctx, code) => code === WF_CODES.LEAVE_SICK,
    check: async (ctx) => {
      if (ctx.leave!.days <= 2) return { pass: true }
      const certUploaded = await checkMedicalCertUploaded(ctx.employee.id, ctx.leave!)
      return { pass: certUploaded, reason: 'Medical certificate required for sick leave exceeding 2 days (BR-SL-002)' }
    },
    ruleRef: 'BR-SL-002',
  },
  {
    code: 'PATERNITY_WINDOW',
    applies: (ctx, code) => code === WF_CODES.LEAVE_PATERNITY,
    check: async (ctx) => {
      const birthDate = await getLatestChildBirthDate(ctx.employee.id)
      if (!birthDate) return { pass: false, reason: 'No birth date recorded on file for paternity leave' }
      const windowEnd = addMonths(birthDate, 6)
      return { pass: new Date() <= windowEnd, reason: `Paternity leave window ended ${windowEnd.toISOString().slice(0,10)} (BR-PL-002)` }
    },
    ruleRef: 'BR-PL-002',
  },
  {
    code: 'OVERTIME_ANNUAL_CAP',
    applies: (ctx, code) => code === WF_CODES.OVERTIME,
    check: async (ctx) => {
      const ytdHours = await getYtdOvertimeHours(ctx.employee.id)
      const requested = ctx.request?.overtimeHours ?? 0
      return { pass: (ytdHours + requested) <= 144, reason: `Overtime annual cap of 144 hours would be exceeded (BR-OT-003). YTD: ${ytdHours}h` }
    },
    ruleRef: 'BR-OT-003',
  },
  {
    code: 'BANK_DETAILS_STEP_UP_AUTH',
    applies: (ctx, code) => code === WF_CODES.BANK_DETAILS,
    check: async (ctx) => {
      const reauthed = await checkRecentStepUpAuth(ctx.employee.id)
      return { pass: reauthed, reason: 'Re-authentication required before changing bank details' }
    },
    ruleRef: 'SECURITY-PDPL',
  },
]
```

---

## 7. Notification Service Interface

```typescript
export interface NotificationPayload {
  recipientId:    string
  workflowCode:   string
  eventType:      string
  instanceId:     string
  stepId?:        string
  templateVars:   Record<string, string>
  actionLinks?:   { approveToken?: string; rejectToken?: string }
  channels:       ('IN_APP' | 'EMAIL' | 'SMS' | 'PUSH')[]
  language:       'EN' | 'AR'
}

/**
 * Send workflow notification via all configured channels.
 * Resolves bilingual template, substitutes variables, inserts into notification_log,
 * dispatches to email queue (when SMTP connected) and in-app table.
 */
export async function sendWorkflowNotification(
  payload: NotificationPayload
): Promise<void>

/**
 * Generate signed one-click action links for email notifications.
 * Returns both approve and reject tokens.
 */
export function generateEmailActionLinks(
  stepId:      string,
  actorId:     string,
  slaDeadline: Date,
): { approveToken: string; rejectToken: string; viewLink: string }
```

---

## 8. Cron Job Specifications

```typescript
// File: lib/cron/workflow-cron.ts

// Every 15 minutes: SLA breach processing
export const slaBreachCron = {
  schedule: '*/15 * * * *',  // every 15 min
  timezone: 'Asia/Dubai',
  handler:  processSLABreaches,
}

// Every hour: SLA reminders
export const slaReminderCron = {
  schedule: '0 * * * *',     // every hour
  timezone: 'Asia/Dubai',
  handler:  async () => {
    // Find steps where sla_deadline is within sla_reminder_hours
    // AND reminder_sent_at IS NULL
    // Send reminder notification
    // Set reminder_sent_at = now()
  },
}

// Daily 06:00 GST: approver digest
export const dailyDigestCron = {
  schedule: '0 2 * * *',     // 02:00 UTC = 06:00 GST (UTC+4)
  timezone: 'Asia/Dubai',
  handler:  async () => {
    // Group pending approvals by approver
    // Send digest: "You have N pending approvals — X overdue"
  },
}

// Daily 00:00 GST: delegation expiry check
export const delegationExpiryCron = {
  schedule: '0 20 * * *',    // 20:00 UTC = 00:00 GST next day
  timezone: 'Asia/Dubai',
  handler:  async () => {
    // Deactivate delegations where end_date < today
    // Notify delegator: "Your delegation to X has ended"
    // Audit: DELEGATION_EXPIRED
  },
}
```
