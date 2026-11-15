import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Task 9 — AI Multi-Agent Workflow Simulation and Collision Tests
 *
 * Tests: COL-001 through COL-037, ARIA-LOCK-001 through ARIA-LOCK-007,
 *         PROB-001 through PROB-007
 *
 * Covers eight collision scenarios:
 *
 *   COLLISION-001: Double-Approval Race (COL-001–003)
 *     Two concurrent callers both read status='PENDING' and attempt to approve.
 *     PRE-FIX:  both succeed → double approval written → audit trail corrupted.
 *     POST-FIX: atomic UPDATE WHERE status='PENDING' + RETURNING — only the first
 *               caller gets rows back; the second gets [] and returns a safe error.
 *
 *   COLLISION-002: SLA Cron vs Live Approval Race (COL-004–005)
 *     processSLABreaches AUTO_APPROVE races with a human approver.
 *     COL-004: step already APPROVED when cron reads → early status guard fires.
 *     COL-005: both read PENDING simultaneously; cron's atomic UPDATE returns [] (human won).
 *
 *   COLLISION-004: Duplicate Hiring Request (COL-006–008, COL-017–023)
 *     COL-006–008: audit and control tests (still valid — mock DB bypasses constraint).
 *     COL-017–023: FIXED (Phase 3 P6A) — migration 0041 adds partial unique index
 *       uq_hiring_request_pending ON hiring_requests (tenant_id, position_id)
 *       WHERE status = 'PENDING_APPROVAL'; createHiringRequest surfaces 23505 as a
 *       friendly message; dispatchResourceCompletion now handles 'hiring_requests'.
 *
 *   COLLISION-004B: Duplicate Transfer Request (COL-024–030)
 *     FIXED (Phase 3 P6B) — migration 0042 adds partial unique index
 *       uq_transfer_request_pending ON transfer_requests (tenant_id, person_id)
 *       WHERE status = 'PENDING_APPROVAL'; createTransferRequest surfaces 23505;
 *       dispatchResourceCompletion now handles 'transfer_requests'.
 *
 *   COLLISION-003: Leave Request Caller-Level Transaction Split (COL-031–037)
 *     submitLeaveRequest previously called submitWorkflow() in its own Tx A, then
 *     opened a separate db.transaction to update absenceEntries.status (Tx B). A
 *     crash between commits left diverged state: workflow IN_PROGRESS, leave DRAFT.
 *     FIXED (Phase 3 P6C) — submitWorkflow accepts tx?: DbOrTx; submitLeaveRequest
 *     wraps both submitWorkflow({..., tx}) and the status update in one outer
 *     db.transaction. DbOrTx promoted to lib/db.ts export for shared use.
 *
 *   ARIA-LOCK: Concurrent ARIA Leave Creation Race (ARIA-LOCK-001–007)
 *     Two concurrent ARIA "Yes, confirm" responses for the same person and
 *     overlapping dates both call createLeaveRequest simultaneously. With Postgres
 *     READ COMMITTED isolation both transactions read "no overlap" before either
 *     commits, so both insert DRAFT entries for the same dates (overlap check
 *     bypassed). FIXED (Phase 3 P6D) — pg_advisory_xact_lock(hashtext('leave:'||
 *     personId)) acquired at the START of createLeaveRequest's db.transaction,
 *     before the overlap check. Serialises per-person; different persons proceed
 *     concurrently. Lock is transaction-scoped (auto-released on commit/rollback).
 *
 *   COLLISION-PROBATION: Probation Review Transaction Boundary (PROB-001–007)
 *     applyProbationOutcome previously managed its own db.transaction inside each
 *     outcome branch (REJECTED / CONFIRM / EXTEND / FAIL). When called from
 *     dispatchResourceCompletion (itself inside the post-claim transaction), the
 *     probation writes ran in a SEPARATE nested transaction, breaking the atomicity
 *     guarantee: workflow engine's post-claim tx could commit while applyProbation-
 *     Outcome's inner tx failed (or vice versa), leaving workflow COMPLETED but
 *     probation still PENDING_HR.
 *     FIXED (Phase 3 P6E) — applyProbationOutcome accepts tx?: DbOrTx; each branch
 *     uses runBranch(client: DbOrTx) closure dispatched via: outerTx provided →
 *     runBranch(outerTx); otherwise → db.transaction(runBranch). generateProbation-
 *     Letter remains outside the tx (bare db.insert — accepted low risk; orphaned
 *     letter is non-critical). triggerTerminationApproval remains outside the tx
 *     intentionally (FAIL branch only). dispatchResourceCompletion passes tx to
 *     applyProbationOutcome.
 *
 * All tests run against mock DB — no live Postgres connection required.
 * Pattern mirrors tests/integration/workflow-engine.test.ts.
 */

// ── Environment ───────────────────────────────────────────────────────────────

// takeWorkflowAction calls issueEmailToken which reads WORKFLOW_JWT_SECRET.
// Set before any module-level code in the SUT executes.
process.env.WORKFLOW_JWT_SECRET = 'test-secret-at-least-32-chars-long'
process.env.NEXT_PUBLIC_APP_URL  = 'https://hr.avaniis.test'

// ── Shared query queue + spies ────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const auditSpy   = vi.fn()
const insertSpy  = vi.fn()
const valuesSpy  = vi.fn()
const updateSpy  = vi.fn()
const setSpy     = vi.fn()

// ── Proxy helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a chainable Proxy that consumes the next entry from queryQueue when
 * the caller awaits it (.then is called).  Every chained method (from, where,
 * limit, orderBy, innerJoin, leftJoin, returning) returns a new proxy so any
 * chain depth is handled without explicit stub configuration.
 */
function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
      }
      return () => makeProxy()
    },
  })
}

/**
 * makeUpdateChain — standard chainable update mock.
 * The .returning() override allows individual tests to return a custom result
 * for the atomic UPDATE WHERE status='PENDING' RETURNING clause.
 */
function makeUpdateChain(returningResult: unknown[] = []) {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return {
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(returningResult)),
        })),
        // plain where without returning (non-atomic updates in the engine)
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(undefined).then(resolve, reject),
      }
    }),
  }
}

function makeInsertChain(returnRows: unknown[] = []) {
  return {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      const p = Promise.resolve(returnRows)
      return Object.assign(p, {
        returning: vi.fn(() => Promise.resolve(returnRows)),
      })
    }),
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

const session = {
  user: {
    id:       '11111111-1111-1111-1111-111111111111',
    personId: '11111111-1111-1111-1111-111111111111',
    name:     'Test Actor',
    role:     'HR_ADMIN',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
  },
}

// ── Module mocks ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => { insertSpy('called'); return makeInsertChain([]) }),
  update:      vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve(session.user)),
  requireRole:    vi.fn(() => Promise.resolve(session.user)),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => {
    auditSpy(event, tx)
    return Promise.resolve()
  }),
  diffFields: () => [],
}))

vi.mock('@/lib/constants', () => ({
  TENANT_ID:    'test-tenant',
  AVANIIS_TENANT_ID:'test-tenant',
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Workflow engine imports external SLA calendar + hierarchy resolvers — stub them.
vi.mock('@/lib/workflow-sla', () => ({
  calculateSLADeadline: vi.fn(() => Promise.resolve(new Date(Date.now() + 48 * 3600 * 1000))),
}))

vi.mock('@/lib/workflow-hierarchy', () => ({
  resolveApprovalChain: vi.fn(() => Promise.resolve([])),
}))

vi.mock('@/lib/workflow-rules', () => ({
  evaluateRules:       vi.fn(() => []),
  buildWorkflowContext: vi.fn((ctx: unknown) => ctx),
}))

vi.mock('@/lib/leave-notification', () => ({
  buildLeaveDecisionNotificationBody: vi.fn(() => ({ bodyEn: '', bodyAr: '' })),
}))

vi.mock('@/lib/app-error', () => ({
  translateError: vi.fn((e: unknown) => { throw e }),
}))

// Schema objects — Drizzle ORM schema is used as table references, not executed.
vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowDefinitionsV2:    { id: {}, tenantId: {}, workflowCode: {}, isActive: {}, version: {}, defaultSlaHours: {}, onApproverNotFound: {}, fallbackPersonId: {}, selectorRuleId: {}, workflowNameEn: {} },
  workflowStepsV2:          { id: {}, workflowDefinitionId: {}, isActive: {}, stepOrder: {}, stepCode: {}, stepNameEn: {}, slaHours: {}, activationConditionId: {}, isFyiOnly: {}, onSlaBreach: {} },
  workflowInstancesV2:      { id: {}, tenantId: {}, workflowDefinitionId: {}, legalEntityId: {}, resourceType: {}, resourceId: {}, initiatedByPersonId: {}, status: {}, currentStepId: {}, currentStepOrder: {}, hierarchySnapshot: {}, contextSnapshot: {}, resolvedSteps: {}, slaCalendarId: {}, slaDeadline: {}, startedAt: {}, createdBy: {}, createdByName: {}, createdDate: {}, completedAt: {}, finalDecisionBy: {}, rejectionReason: {}, escalatedAt: {}, updatedBy: {}, updatedByName: {}, lastUpdatedDate: {} },
  workflowStepInstances:    { id: {}, tenantId: {}, instanceId: {}, stepId: {}, stepOrder: {}, status: {}, assignedToPersonId: {}, delegatedToPersonId: {}, delegatedFromPersonId: {}, delegatedAt: {}, emailTokenJti: {}, slaDeadline: {}, decidedByPersonId: {}, decision: {}, decisionNote: {}, decidedAt: {}, remindedAt: {}, updatedBy: {}, updatedByName: {}, lastUpdatedDate: {}, createdBy: {}, createdByName: {}, createdDate: {} },
  workflowAuditLog:         { id: {}, tenantId: {}, instanceId: {}, stepInstanceId: {}, action: {}, actorPersonId: {}, actorName: {}, ipAddress: {}, userAgent: {}, eventData: {}, loggedAt: {} },
  workflowEmailTokens:      { jti: {}, tenantId: {}, instanceId: {}, stepInstanceId: {}, intendedAction: {}, issuedToPersonId: {}, expiresAt: {}, createdAt: {} },
  workflowNotificationQueue:{ id: {}, tenantId: {}, instanceId: {}, stepInstanceId: {}, channel: {}, recipientPersonId: {}, templateCode: {}, actionUrl: {}, status: {}, sendAfter: {}, retryCount: {}, createdAt: {} },
  workflowSlaCalendars:     { id: {}, tenantId: {}, isDefault: {}, isActive: {} },
  workflowRules:            { id: {}, conditionTree: {} },
}))

vi.mock('@/drizzle/schema', () => ({
  persons:              { id: {}, tenantId: {}, fullNameEn: {}, lineManagerId: {}, isActive: {}, nationalityCategory: {}, employmentType: {}, hireDate: {}, gender: {}, religion: {}, maritalStatus: {}, basicSalary: {}, payrollId: {}, contractedHoursPerWeek: {}, probationEndDate: {}, currentGradeId: {} },
  grades:               { id: {}, gradeLevel: {} },
  legalEntities:        {},
  absenceEntries:       { id: {}, tenantId: {}, status: {}, updatedBy: {}, updatedByName: {}, updatedDate: {}, lastUpdatedDate: {}, startDate: {}, endDate: {}, durationDays: {}, absenceTypeId: {} },
  absenceTypes:         { id: {}, typeNameEn: {}, typeNameAr: {} },
  notificationLog:      { tenantId: {}, legalEntityId: {}, recipientPersonId: {}, notificationType: {}, channel: {}, subjectEn: {}, subjectAr: {}, bodyEn: {}, bodyAr: {}, referenceType: {}, referenceId: {}, status: {}, sentAt: {}, createdBy: {}, createdByName: {} },
  workerAssignments:    { id: {}, tenantId: {}, personId: {}, effectiveStartDate: {}, effectiveEndDate: {}, effectiveSequence: {}, lineManagerId: {}, isCurrent: {}, assignmentStatus: {}, createdDate: {} },
  hiringRequests:       { id: {}, tenantId: {}, positionId: {}, departmentId: {}, requestType: {}, replacementFor: {}, requiredByDate: {}, budgetApproved: {}, budgetAmount: {}, justification: {}, urgency: {}, status: {}, requestedById: {}, requestedByName: {}, createdBy: {}, createdByName: {} },
  transferRequests:     { id: {}, tenantId: {}, personId: {}, currentPositionId: {}, targetPositionId: {}, targetDepartmentId: {}, requestType: {}, effectiveDate: {}, reason: {}, notes: {}, status: {}, requestedById: {}, requestedByName: {}, createdBy: {}, createdByName: {}, updatedBy: {}, updatedByName: {}, updatedDate: {}, lastUpdatedDate: {} },
  positions:            { id: {}, tenantId: {}, occupiedByPersonId: {} },
}))

vi.mock('drizzle-orm', () => ({
  eq:      () => ({}),
  ne:      () => ({}),
  and:     (...a: unknown[]) => a,
  or:      (...a: unknown[]) => a,
  inArray: () => ({}),
  count:   () => ({}),
  lt:      () => ({}),
  lte:     () => ({}),
  gte:     () => ({}),
  gt:      () => ({}),
  isNull:  () => ({}),
  asc:     () => ({}),
  desc:    () => ({}),
  sql:     () => ({}),
  ilike:   () => ({}),
}))

// ── Dynamic imports (after mocks are registered) ──────────────────────────────

const { takeWorkflowAction, submitWorkflow, processSLABreaches } =
  await import('@/lib/workflow-engine')

const { createHiringRequest, createTransferRequest } =
  await import('@/modules/core-hr/org-chart-actions')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STEP_ID     = 'step-aaaaaaaa-0001'
const INSTANCE_ID = 'inst-bbbbbbbb-0001'
const ACTOR_ID    = '11111111-1111-1111-1111-111111111111'

/** A PENDING step instance (pre-decision state). */
function pendingStepRow(overrides: Record<string, unknown> = {}): unknown[] {
  return [{
    id:                  STEP_ID,
    instanceId:          INSTANCE_ID,
    stepId:              'step-def-001',
    stepOrder:           1,
    status:              'PENDING',
    assignedToPersonId:  ACTOR_ID,
    delegatedToPersonId: null,
    decisionNote:        null,
    slaDeadline:         new Date(Date.now() + 3600 * 1000),
    ...overrides,
  }]
}

/** An IN_PROGRESS workflow instance row. */
function instanceRow(overrides: Record<string, unknown> = {}): unknown[] {
  return [{
    resourceType:         'absence_entries',
    resourceId:           'abs-001',
    initiatedByPersonId:  '33333333-3333-3333-3333-333333333333',
    legalEntityId:        '00000000-0000-0000-0000-0000000000a1',
    slaCalendarId:        null,
    ...overrides,
  }]
}

/** Standard params for takeWorkflowAction. */
function approveParams(overrides: Partial<Parameters<typeof takeWorkflowAction>[0]> = {}): Parameters<typeof takeWorkflowAction>[0] {
  return {
    stepInstanceId: STEP_ID,
    actorPersonId:  ACTOR_ID,
    decision:       'APPROVE',
    ...overrides,
  }
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  auditSpy.mockClear()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()

  // Restore session to default HR_ADMIN
  session.user.id       = ACTOR_ID
  session.user.personId = ACTOR_ID
  session.user.role     = 'HR_ADMIN'
  session.user.name     = 'Test Actor'

  // Default: select returns proxy consuming queryQueue
  mockDb.select.mockImplementation(() => makeProxy())
  // Default: insert success
  mockDb.insert.mockImplementation(() => { insertSpy('called'); return makeInsertChain([]) })
  // Default: update with empty RETURNING (tests override per-scenario)
  mockDb.update.mockImplementation(() => { updateSpy('called'); return makeUpdateChain([]) })
  // Default: transaction executes the callback directly (no tx isolation needed for unit)
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    return fn({
      insert: vi.fn(() => { insertSpy('tx-insert'); return makeInsertChain([{ id: 'new-id' }]) }),
      update: vi.fn(() => { updateSpy('tx-update'); return makeUpdateChain([]) }),
      select: vi.fn(() => makeProxy()),
    })
  })

  // WORKFLOW_JWT_SECRET must survive across test resets
  process.env.WORKFLOW_JWT_SECRET = 'test-secret-at-least-32-chars-long'
})

// ═══════════════════════════════════════════════════════════════════════════════
// COLLISION-001: Double-Approval Race Condition
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task 9 — AI Workflow Collision Tests', () => {
  describe('COLLISION-001: Double-Approval Race Condition', () => {
    /**
     * COL-001: First concurrent caller successfully claims the step.
     *
     * Scenario: Two actors call takeWorkflowAction simultaneously.
     *   Pre-fix:  Both read PENDING, both succeed → double write.
     *   Post-fix: The atomic UPDATE WHERE status='PENDING' RETURNING returns [{id}]
     *             for the first caller, confirming ownership. Result: success: true.
     *
     * Mock sequence:
     *   1. db.select × 1 → persons row (resolveActorDisplayName)
     *   2. db.select × 1 → pendingStepRow (step instance load)
     *   3. db.select × 1 → instanceRow (workflow instance fields)
     *   4. db.update  → returning([{id}])  ← first caller claims step
     *   5. db.insert  → workflowAuditLog (STEP_APPROVED audit)
     *   6. db.select  → [] (activateNextStep: no WAITING steps → final step)
     *   7. db.update  → workflowInstancesV2 set status=APPROVED
     *   8. db.insert  → workflowAuditLog (INSTANCE_APPROVED audit)
     *   9. db.insert  → notificationLog (dispatchResourceCompletion absence_entries)
     *   10. db.update → absenceEntries set status=APPROVED
     */
    it('COL-001: first concurrent caller claims the step and receives success', async () => {
      // Steps 1–3: select calls consumed via queryQueue
      queryQueue = [
        [{ fullNameEn: 'Manager A' }],   // resolveActorDisplayName → persons lookup
        pendingStepRow(),                  // workflowStepInstances load
        instanceRow(),                     // workflowInstancesV2 load
      ]

      // Step 4: atomic UPDATE WHERE status='PENDING' RETURNING → [{id}] = claimed
      mockDb.update.mockImplementationOnce(() => {
        updateSpy('atomic-claim')
        return makeUpdateChain([{ id: STEP_ID }])
      })
      // Subsequent updates (instance status, absenceEntries) succeed silently
      mockDb.update.mockImplementation(() => {
        updateSpy('subsequent-update')
        return makeUpdateChain([])
      })

      // activateNextStep select (step 6): no WAITING steps → final step path
      // absenceEntries select in dispatchResourceCompletion
      queryQueue.push(
        [],                                        // activateNextStep: WAITING steps
        [{ startDate: '2026-06-01', endDate: '2026-06-05', durationDays: 5, typeNameEn: 'Annual', typeNameAr: 'سنوية' }], // absenceEntries fetch
      )

      const result = await takeWorkflowAction(approveParams())

      expect(result.success).toBe(true)
      expect(result.instanceStatus).toBe('APPROVED')

      // The atomic update must have been called at least once (the claim call)
      const atomicCall = updateSpy.mock.calls.find(c => c[0] === 'atomic-claim')
      expect(atomicCall).toBeDefined()
    })

    /**
     * COL-002: Second concurrent caller finds step already actioned — APPROVE race.
     *
     * Scenario: The step was claimed by Actor A milliseconds earlier.
     *   Pre-fix:  Both writes succeed → duplicate APPROVED record.
     *   Post-fix: The atomic UPDATE WHERE returns [] (0 rows matched because
     *             the status is no longer PENDING).  The function returns
     *             { success: false, error: 'Step was already actioned...' }.
     *             No audit entry is written for this caller.
     *
     * Mock sequence:
     *   1. db.select → persons row (resolveActorDisplayName)
     *   2. db.select → pendingStepRow (status guard reads PENDING — race window)
     *   3. db.select → instanceRow
     *   4. db.update → returning([])  ← second caller: another actor beat us
     */
    it('COL-002: second concurrent APPROVE caller receives concurrent-action error', async () => {
      // NOTE: actorPersonId '22222222-...' is the SYSTEM_ACTOR in the engine.
      // resolveActorDisplayName short-circuits for the system actor (no DB call).
      // So the first queue slot is the step instance row, not a persons lookup.
      queryQueue = [
        pendingStepRow(),                  // status guard still sees PENDING (race window)
        instanceRow(),                     // instance fields
      ]

      // Atomic UPDATE returns [] → step was already claimed by first caller
      mockDb.update.mockImplementationOnce(() => {
        updateSpy('atomic-missed')
        return makeUpdateChain([])  // empty RETURNING = lost the race
      })

      const result = await takeWorkflowAction(approveParams({
        actorPersonId: '22222222-2222-2222-2222-222222222222',
      }))

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/already actioned by another approver/i)

      // CRITICAL: no audit entry should be written when the race is detected
      // (the engine returns immediately after checking claimed.length === 0)
      const auditCalls = auditSpy.mock.calls
      const stepApprovedAudit = auditCalls.find((call: unknown[]) => {
        const ev = call[0] as { action?: string }
        return ev?.action === 'STEP_APPROVED' || ev?.action === 'INSTANCE_APPROVED'
      })
      expect(stepApprovedAudit).toBeUndefined()
    })

    /**
     * COL-003: Second concurrent caller finds step already actioned — REJECT race.
     *
     * Scenario: Same as COL-002 but the decision is REJECT.
     *   Pre-fix:  REJECTED written twice → reject reason overwritten on second write.
     *   Post-fix: Atomic UPDATE returns [] → safe error returned, no double-reject.
     *
     * Mock sequence: identical to COL-002 but decision=REJECT.
     */
    it('COL-003: second concurrent REJECT caller receives concurrent-action error', async () => {
      queryQueue = [
        [{ fullNameEn: 'Manager C' }],   // resolveActorDisplayName
        pendingStepRow(),                  // status guard reads PENDING (race window)
        instanceRow(),
      ]

      // Atomic UPDATE returns [] — another actor (or cron) got there first
      mockDb.update.mockImplementationOnce(() => {
        updateSpy('reject-atomic-missed')
        return makeUpdateChain([])
      })

      const result = await takeWorkflowAction(approveParams({
        actorPersonId: '44444444-4444-4444-4444-444444444444',
        decision:      'REJECT',
        decisionNote:  'Policy violation',
      }))

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/already actioned by another approver/i)

      // No INSTANCE_REJECTED or STEP_REJECTED audit should be written
      const instanceRejectedAudit = auditSpy.mock.calls.find((call: unknown[]) => {
        const ev = call[0] as { action?: string }
        return ev?.action === 'INSTANCE_REJECTED' || ev?.action === 'STEP_REJECTED'
      })
      expect(instanceRejectedAudit).toBeUndefined()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // COLLISION-002: SLA Cron vs Live Approval Race
  // ═════════════════════════════════════════════════════════════════════════════

  describe('COLLISION-002: SLA Cron vs Live Approval Race', () => {
    /**
     * COL-004: Cron reads step already APPROVED — early status guard fires.
     *
     * Scenario: Human approves at 09:00:00. Cron runs at 09:00:01 (after SLA breach
     *   detection lag).  By the time cron calls takeWorkflowAction the step status
     *   is already 'APPROVED', not 'PENDING'.
     *   Pre-fix:  No status guard → cron overwrites approved decision.
     *   Post-fix: The early guard `if (stepInst.status !== 'PENDING')` fires and
     *             returns { success: false, error: 'Step is not actionable (status: APPROVED)' }.
     *
     * Mock sequence:
     *   1. db.select → persons row (resolveActorDisplayName — system actor short-circuits)
     *   2. db.select → stepRow with status='APPROVED' (step already finalised)
     *   → guard fires; atomic UPDATE is never reached.
     */
    it('COL-004: SLA cron auto-approve on already-APPROVED step returns not-actionable error', async () => {
      // System actor (cron) resolveActorDisplayName short-circuits without a DB call
      // because actorPersonId === SYSTEM_ACTOR.id.  The next select is the step load.
      queryQueue = [
        pendingStepRow({ status: 'APPROVED' }),  // step is already APPROVED
      ]

      const SYSTEM_ACTOR_ID = '22222222-2222-2222-2222-222222222222'

      const result = await takeWorkflowAction({
        stepInstanceId: STEP_ID,
        actorPersonId:  SYSTEM_ACTOR_ID,
        decision:       'APPROVE',
        decisionNote:   'Auto-approved by system: SLA deadline breached',
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not actionable/i)
      expect(result.error).toMatch(/APPROVED/i)

      // Atomic UPDATE must NOT have been called — guard should have returned early
      const atomicUpdate = updateSpy.mock.calls.find(c => c[0] === 'atomic-claim')
      expect(atomicUpdate).toBeUndefined()
    })

    /**
     * COL-005: Both cron and human read PENDING simultaneously; cron loses the race.
     *
     * Scenario: Cron and the human approver both read status='PENDING' at the same
     *   instant.  The human's UPDATE commits first.  Cron's atomic UPDATE returns [].
     *   Pre-fix:  Cron's second UPDATE overwrites the human decision.
     *   Post-fix: Cron caller gets { success: false, error: 'Step was already actioned
     *             by another approver (concurrent action detected)' }.
     *
     * Mock sequence:
     *   1. (system actor → no persons lookup — resolveActorDisplayName short-circuits)
     *   2. db.select → pendingStepRow (cron reads PENDING — race window)
     *   3. db.select → instanceRow
     *   4. db.update → returning([])  ← human committed first; cron gets 0 rows
     */
    it('COL-005: SLA cron loses atomic race to human approver', async () => {
      queryQueue = [
        pendingStepRow(),   // cron reads PENDING (race window — human hasn't committed yet)
        instanceRow(),      // instance fields
      ]

      // Atomic UPDATE returns [] — human approver won the race
      mockDb.update.mockImplementationOnce(() => {
        updateSpy('cron-atomic-missed')
        return makeUpdateChain([])
      })

      const SYSTEM_ACTOR_ID = '22222222-2222-2222-2222-222222222222'

      const result = await takeWorkflowAction({
        stepInstanceId: STEP_ID,
        actorPersonId:  SYSTEM_ACTOR_ID,
        decision:       'APPROVE',
        decisionNote:   'Auto-approved by system: SLA deadline breached',
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/already actioned by another approver/i)

      // Verify no audit was written for the cron's (losing) attempt
      const stepApprovedAudit = auditSpy.mock.calls.find((call: unknown[]) => {
        const ev = call[0] as { action?: string }
        return ev?.action === 'STEP_APPROVED' || ev?.action === 'INSTANCE_APPROVED'
      })
      expect(stepApprovedAudit).toBeUndefined()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // COLLISION-004: Duplicate Hiring Request (Known Gap)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('COLLISION-004: Duplicate Hiring Request (base tests — mock DB; real guard in COL-017–023)', () => {
    /**
     * Valid input shared across COL-006–COL-008.
     * Justification is ≥ 30 characters as required by the validation guard.
     */
    const validHiringInput = {
      positionId:   'pos-vacant-col-001',
      departmentId: 'dept-engineering',
      requestType:  'NEW_HEADCOUNT' as const,
      justification:'We urgently need to fill this position to meet Q3 project delivery commitments.',
      urgency:      'HIGH' as const,
    }

    /**
     * COL-006: Single createHiringRequest call succeeds.
     *
     * Scenario: Baseline — verify the happy path produces one insert + one audit.
     *   This is the control test; COL-007 then calls the function twice to document
     *   the duplicate-insert gap.
     *
     * Expected: result.success = true; db.transaction called once; writeAuditLog called once.
     */
    it('COL-006: single createHiringRequest call succeeds with one insert and one audit', async () => {
      // mockTx inside transaction inserts and returns a new id
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          insert: vi.fn(() => {
            insertSpy('hiring-tx-insert')
            return makeInsertChain([{ id: 'hiring-req-001' }])
          }),
          update: vi.fn(() => makeUpdateChain([])),
          select: vi.fn(() => makeProxy()),
        }
        return fn(tx)
      })

      const result = await createHiringRequest(validHiringInput)

      expect(result).toBeDefined()
      expect(result!.success).toBe(true)
      expect(result!.error).toBeUndefined()

      // One transaction call → one insert inside it
      expect(mockDb.transaction).toHaveBeenCalledOnce()
      const hiringInsert = insertSpy.mock.calls.find(c => c[0] === 'hiring-tx-insert')
      expect(hiringInsert).toBeDefined()

      // Audit must be written inside the transaction (Hard Rule 1)
      expect(auditSpy).toHaveBeenCalledOnce()
    })

    /**
     * COL-007: Two sequential createHiringRequest calls for the same position both succeed.
     *
     * Scenario: HR Admin submits a hiring request for position X.
     *   Before the first request reaches APPROVED, a second browser tab (or concurrent
     *   agent session) submits another request for the same position.
     *   Pre-fix:  No duplicate guard → both inserts succeed → two PENDING_APPROVAL rows
     *             for the same position enter the approval pipeline.
     *   Post-fix: (KNOWN GAP) No duplicate guard exists in the current implementation.
     *             Both calls return success: true and both inserts are written.
     *             This test documents the gap — a unique constraint or pre-insert SELECT
     *             should be added in a future sprint.
     *
     * KNOWN GAP: COLLISION-004 — createHiringRequest has no idempotency guard.
     *   Mitigation until fixed: UI disables the submit button after first click;
     *   approval workflow assigns a unique workflow instance per request,
     *   so approvers see two separate items and can reject the duplicate.
     */
    it('COL-007: two sequential mock-DB requests for same position both succeed — mock bypasses DB constraint (real guard in migration 0041 + COL-017)', async () => {
      // Each call gets its own transaction that succeeds independently
      mockDb.transaction
        .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
          const tx = {
            insert: vi.fn(() => {
              insertSpy('first-tx-insert')
              return makeInsertChain([{ id: 'hiring-req-col-001a' }])
            }),
            update: vi.fn(() => makeUpdateChain([])),
            select: vi.fn(() => makeProxy()),
          }
          return fn(tx)
        })
        .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
          const tx = {
            insert: vi.fn(() => {
              insertSpy('second-tx-insert')
              return makeInsertChain([{ id: 'hiring-req-col-001b' }])
            }),
            update: vi.fn(() => makeUpdateChain([])),
            select: vi.fn(() => makeProxy()),
          }
          return fn(tx)
        })

      const [result1, result2] = await Promise.all([
        createHiringRequest(validHiringInput),
        createHiringRequest(validHiringInput),
      ])

      // KNOWN GAP: both succeed — no duplicate detection
      expect(result1!.success).toBe(true)
      expect(result2!.success).toBe(true)

      // Two separate transaction calls confirm two inserts reached the DB layer
      expect(mockDb.transaction).toHaveBeenCalledTimes(2)

      const firstInsert  = insertSpy.mock.calls.find(c => c[0] === 'first-tx-insert')
      const secondInsert = insertSpy.mock.calls.find(c => c[0] === 'second-tx-insert')
      expect(firstInsert).toBeDefined()
      expect(secondInsert).toBeDefined()

      // Both produce audit entries — two rows in audit_log for same position
      expect(auditSpy).toHaveBeenCalledTimes(2)
    })

    /**
     * COL-008: writeAuditLog is called inside the transaction for each hiring request.
     *
     * Scenario: Verifies Hard Rule 1 compliance — every DB write must have a
     *   corresponding audit.log() call inside the SAME transaction.
     *   The writeAuditLog mock receives `tx` as its second argument.
     *   We confirm the second argument is truthy (the tx object was passed through).
     *
     * This is especially important for collision detection: if the duplicate-guard
     * is added later, the guard must also be inside the transaction to remain atomic.
     */
    it('COL-008: audit log is written inside the transaction — Hard Rule 1 compliance', async () => {
      let capturedTx: unknown = undefined

      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          insert: vi.fn(() => {
            insertSpy('audit-compliance-insert')
            return makeInsertChain([{ id: 'hiring-req-col-008' }])
          }),
          update: vi.fn(() => makeUpdateChain([])),
          select: vi.fn(() => makeProxy()),
        }
        const result = await fn(tx)
        // Capture what was passed to writeAuditLog as the second argument
        if (auditSpy.mock.calls.length > 0) {
          capturedTx = auditSpy.mock.calls[0][1]
        }
        return result
      })

      const result = await createHiringRequest(validHiringInput)

      expect(result!.success).toBe(true)
      expect(auditSpy).toHaveBeenCalledOnce()

      // Hard Rule 1: second argument to writeAuditLog must be the tx object
      // (not undefined / null) — confirms the audit is bound to the same transaction.
      expect(capturedTx).toBeDefined()
      expect(capturedTx).not.toBeNull()

      // The audit event must identify the hiring request creation
      const [auditEvent] = auditSpy.mock.calls[0] as [{ eventType: string }]
      expect(auditEvent.eventType).toBe('HIRING_REQUEST_CREATED')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Fix 1–5 Atomicity Regression Suite (COL-009 – COL-016)
  // Verifies that each atomicity gap closed in Priority 2 remains closed.
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Fix 1: submitWorkflow atomicity (COLLISION-003)', () => {
    /**
     * COL-009: submitWorkflow wraps all write operations in a single db.transaction.
     *
     * Pre-fix: 6 bare db.insert/db.update calls — a crash between any two writes
     *   leaves a partially-created workflow instance visible to concurrent readers.
     * Post-fix: all writes are inside one db.transaction callback; bare db.insert /
     *   db.update for the write section are replaced by tx.insert / tx.update.
     *
     * Asserts:
     *   - result.success = true, instanceId present
     *   - db.transaction called exactly once (all writes in one tx)
     *   - bare mockDb.insert is NOT called for workflow instance / step writes
     */
    it('COL-009: submitWorkflow wraps all writes in exactly one db.transaction', async () => {
      // Provide one resolved approver so submitWorkflow reaches the write section.
      const { resolveApprovalChain } = await import('@/lib/workflow-hierarchy')
      vi.mocked(resolveApprovalChain as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { stepOrder: 1, stepCode: 'STEP_1', personId: 'approver-001', personName: 'Approver One', hierarchyType: 'LINE_MANAGER', isFyiOnly: false },
      ])

      // Read-phase: definition → steps → person → isManager → SLA calendar
      queryQueue = [
        [{ id: 'wf-def-001', workflowCode: 'LEAVE_APPROVAL', defaultSlaHours: 48, isActive: true,
           version: 1, onApproverNotFound: 'ESCALATE_UP', fallbackPersonId: null,
           selectorRuleId: null, workflowNameEn: 'Leave Approval' }],
        [{ id: 'step-def-001', workflowDefinitionId: 'wf-def-001', isActive: true, stepOrder: 1,
           stepCode: 'STEP_1', stepNameEn: 'Step 1', slaHours: 48, activationConditionId: null,
           isFyiOnly: false, onSlaBreach: 'ESCALATE' }],
        [{ id: 'person-001', fullNameEn: 'Employee A', gradeLevel: 3,
           nationalityCategory: 'UAE', employmentType: 'FULL_TIME', hireDate: '2023-01-01',
           lineManagerId: null, gender: null, religion: null, maritalStatus: null,
           basicSalary: '5000', payrollId: null, contractedHoursPerWeek: '48',
           probationEndDate: null, isActive: true }],
        [{ total: 0 }],   // isManager check
        [{ id: 'cal-001' }],  // SLA calendar
      ]

      let txCallCount = 0
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        txCallCount++
        return fn({
          insert: vi.fn(() => { insertSpy('tx-write'); return makeInsertChain([{ id: 'new-step-id' }]) }),
          update: vi.fn(() => makeUpdateChain([])),
          select: vi.fn(() => makeProxy()),
        })
      })

      const result = await submitWorkflow({
        workflowCode:         'LEAVE_APPROVAL',
        resourceType:         'absence_entries',
        resourceId:           'abs-col-009',
        initiatedByPersonId:  'person-001',
        legalEntityId:        '00000000-0000-0000-0000-0000000000a1',
      })

      expect(result.success).toBe(true)
      expect(result.instanceId).toBeDefined()
      // COLLISION-003 regression: writes go through exactly one transaction
      expect(txCallCount).toBe(1)
      // No bare db.insert should be called for the workflow instance / step rows
      const bareInserts = insertSpy.mock.calls.filter(c => c[0] === 'called')
      expect(bareInserts).toHaveLength(0)
    })

    /**
     * COL-010: submitWorkflow returns success: false if the transaction throws.
     *
     * Ensures the error boundary still works with the new transaction wrapper —
     * the outer try/catch must surface the error cleanly, not leave a partial state.
     */
    it('COL-010: submitWorkflow surfaces transaction error as success: false', async () => {
      const { resolveApprovalChain } = await import('@/lib/workflow-hierarchy')
      vi.mocked(resolveApprovalChain as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { stepOrder: 1, stepCode: 'STEP_1', personId: 'approver-001', personName: 'Approver One', hierarchyType: 'LINE_MANAGER', isFyiOnly: false },
      ])

      queryQueue = [
        [{ id: 'wf-def-002', workflowCode: 'LEAVE_APPROVAL', defaultSlaHours: 48, isActive: true,
           version: 1, onApproverNotFound: 'ESCALATE_UP', fallbackPersonId: null,
           selectorRuleId: null, workflowNameEn: 'Leave Approval' }],
        [{ id: 'step-def-002', workflowDefinitionId: 'wf-def-002', isActive: true, stepOrder: 1,
           stepCode: 'STEP_1', stepNameEn: 'Step 1', slaHours: 48, activationConditionId: null,
           isFyiOnly: false, onSlaBreach: 'ESCALATE' }],
        [{ id: 'person-002', fullNameEn: 'Employee B', gradeLevel: 2,
           nationalityCategory: 'UAE', employmentType: 'FULL_TIME', hireDate: '2023-01-01',
           lineManagerId: null, gender: null, religion: null, maritalStatus: null,
           basicSalary: '4000', payrollId: null, contractedHoursPerWeek: '48',
           probationEndDate: null, isActive: true }],
        [{ total: 0 }],
        [{ id: 'cal-002' }],
      ]

      // Simulate DB constraint violation inside the transaction
      mockDb.transaction.mockRejectedValueOnce(new Error('DB constraint violation'))

      const result = await submitWorkflow({
        workflowCode:         'LEAVE_APPROVAL',
        resourceType:         'absence_entries',
        resourceId:           'abs-col-010',
        initiatedByPersonId:  'person-002',
        legalEntityId:        '00000000-0000-0000-0000-0000000000a1',
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/DB constraint violation/i)
    })
  })

  describe('Fix 2: DELEGATE branch atomicity', () => {
    /**
     * COL-011: takeWorkflowAction DELEGATE branch wraps update+audit in db.transaction.
     *
     * Pre-fix: two bare writes (db.update + bare writeAudit) — a crash after the step
     *   update but before the audit leaves the step reassigned without an audit trail.
     * Post-fix: both writes are inside one db.transaction callback.
     *
     * Asserts:
     *   - result.success = true, instanceStatus = IN_PROGRESS
     *   - db.transaction called exactly once for the DELEGATE path
     *   - bare mockDb.update NOT called for the delegate step update
     */
    it('COL-011: DELEGATE branch wraps step-update and audit in one db.transaction', async () => {
      // resolveActorDisplayName → persons lookup, step load, instance load, then
      // the PPCDA-01 H8 cross-entity guard's delegate-target lookup (HR_ADMIN is
      // not exempt, so the guard runs). Target is active and in the SAME entity
      // as instanceRow() (…0000a1), so the guard passes and DELEGATE proceeds.
      queryQueue = [
        [{ fullNameEn: 'Delegating Manager' }],  // resolveActorDisplayName
        pendingStepRow(),                          // step load
        instanceRow(),                             // instance load (inst.legalEntityId)
        [{ legalEntityId: '00000000-0000-0000-0000-0000000000a1', isActive: true }], // H8 delegate-target lookup
      ]

      let txCallCount = 0
      const txUpdateSpy = vi.fn()
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        txCallCount++
        return fn({
          insert: vi.fn(() => { insertSpy('delegate-tx-insert'); return makeInsertChain([]) }),
          update: vi.fn(() => { txUpdateSpy('delegate-tx-update'); return makeUpdateChain([]) }),
          select: vi.fn(() => makeProxy()),
        })
      })

      const result = await takeWorkflowAction(approveParams({
        decision:            'DELEGATE',
        delegateToPersonId:  '55555555-5555-5555-5555-555555555555',
      }))

      expect(result.success).toBe(true)
      expect(result.instanceStatus).toBe('IN_PROGRESS')
      // DELEGATE Fix 2 regression: one transaction for the delegate writes
      expect(txCallCount).toBe(1)
      // Step update must go through tx, not bare db.update
      expect(txUpdateSpy).toHaveBeenCalled()
      // No bare db.update for the delegate update
      const bareDelegateUpdate = updateSpy.mock.calls.find(c => c[0] === 'called')
      expect(bareDelegateUpdate).toBeUndefined()
    })
  })

  describe('Fix 3: post-claim writes atomicity (COLLISION-006)', () => {
    /**
     * COL-012: REJECT path — post-claim writes wrapped in db.transaction.
     *
     * Pre-fix: after the atomic claim, instance rejection + audit + resource update
     *   were three separate bare writes — a crash between any two produced
     *   a claimed-but-not-rejected instance.
     * Post-fix: all three are inside one db.transaction.
     *
     * Asserts:
     *   - result.success = true, instanceStatus = REJECTED
     *   - db.transaction called once for post-claim writes
     *   - tx.update called inside the transaction (not bare db.update)
     */
    it('COL-012: REJECT post-claim writes run inside one db.transaction', async () => {
      queryQueue = [
        [{ fullNameEn: 'Rejecting Manager' }],
        pendingStepRow(),
        instanceRow(),
        // absenceEntries detail for dispatchResourceCompletion
        [{ startDate: '2026-06-01', endDate: '2026-06-03', durationDays: 2, typeNameEn: 'Annual', typeNameAr: 'سنوية' }],
      ]

      // Atomic claim succeeds
      mockDb.update.mockImplementationOnce(() => {
        updateSpy('atomic-claim')
        return makeUpdateChain([{ id: STEP_ID }])
      })

      let txCallCount = 0
      const txUpdateSpy = vi.fn()
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        txCallCount++
        return fn({
          insert: vi.fn(() => { insertSpy('reject-tx-insert'); return makeInsertChain([]) }),
          update: vi.fn(() => { txUpdateSpy('reject-tx-update'); return makeUpdateChain([]) }),
          select: vi.fn(() => makeProxy()),
        })
      })

      const result = await takeWorkflowAction(approveParams({
        decision:     'REJECT',
        decisionNote: 'Rejected by COL-012 test',
      }))

      expect(result.success).toBe(true)
      expect(result.instanceStatus).toBe('REJECTED')
      // COLLISION-006 regression: one post-claim transaction
      expect(txCallCount).toBe(1)
      expect(txUpdateSpy).toHaveBeenCalled()
    })

    /**
     * COL-013: APPROVE (final step) — post-claim + dispatchResourceCompletion atomic.
     *
     * Pre-fix: instance completion + audit + resource update were separate bare writes.
     * Post-fix: all inside one db.transaction; dispatchResourceCompletion receives `tx`
     *   so the absence status update and notification insert are part of the same tx.
     *
     * Asserts:
     *   - result.success = true, instanceStatus = APPROVED
     *   - db.transaction called once post-claim
     *   - tx.update called for absence status (dispatchResourceCompletion used tx, not db)
     *   - tx.insert called for notificationLog (same tx)
     */
    it('COL-013: APPROVE final-step post-claim and resource completion run in one tx', async () => {
      // Order matters: positions 0-2 are consumed by db.select BEFORE the transaction.
      // Position 3 is consumed by tx.select inside activateNextStep (WAITING-step query).
      // Position 4 is consumed by db.select inside dispatchResourceCompletion (absence detail).
      queryQueue = [
        [{ fullNameEn: 'Final Approver' }],   // 0: resolveActorDisplayName
        pendingStepRow(),                        // 1: step instance load
        instanceRow(),                           // 2: workflow instance load
        [],                                      // 3: activateNextStep WAITING-step → [] = final step
        [{ startDate: '2026-07-01', endDate: '2026-07-05', durationDays: 5,
           typeNameEn: 'Annual', typeNameAr: 'سنوية' }],  // 4: absence detail (dispatchResourceCompletion)
      ]

      // Atomic claim succeeds
      mockDb.update.mockImplementationOnce(() => {
        updateSpy('atomic-claim')
        return makeUpdateChain([{ id: STEP_ID }])
      })

      let txCallCount = 0
      const txUpdateSpy = vi.fn()
      const txInsertSpy = vi.fn()
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        txCallCount++
        return fn({
          // tx.select used by activateNextStep to check WAITING steps
          select: vi.fn(() => makeProxy()),
          update: vi.fn(() => { txUpdateSpy('approve-tx-update'); return makeUpdateChain([]) }),
          insert: vi.fn(() => { txInsertSpy('approve-tx-insert'); return makeInsertChain([]) }),
        })
      })

      const result = await takeWorkflowAction(approveParams())

      expect(result.success).toBe(true)
      expect(result.instanceStatus).toBe('APPROVED')
      // Post-claim + resource completion in one transaction
      expect(txCallCount).toBe(1)
      // tx.update must be called: instance APPROVED + absenceEntries status update
      expect(txUpdateSpy).toHaveBeenCalled()
      // tx.insert must be called: audit + notificationLog
      expect(txInsertSpy).toHaveBeenCalled()
    })

    /**
     * COL-014: dispatchResourceCompletion absence update uses tx, not bare db.
     *
     * Verifies Fix 3b: the `client = tx ?? db` pattern means that when called with
     * a transaction, the absence status update and notification insert are part of
     * the caller's transaction — not auto-committed on separate connections.
     *
     * This test complements COL-013 by explicitly asserting that the bare
     * mockDb.update is NOT called for the absence entry (it should go through tx).
     */
    it('COL-014: absence status update goes through tx, not bare db.update', async () => {
      queryQueue = [
        [{ fullNameEn: 'TX-Threading Approver' }],  // 0: persons
        pendingStepRow(),                              // 1: step
        instanceRow(),                                 // 2: instance
        [],                                            // 3: activateNextStep WAITING → final step
        [{ startDate: '2026-08-01', endDate: '2026-08-03', durationDays: 2,
           typeNameEn: 'Annual', typeNameAr: 'سنوية' }],  // 4: absence detail
      ]

      mockDb.update.mockImplementationOnce(() => {
        updateSpy('atomic-claim-col014')
        return makeUpdateChain([{ id: STEP_ID }])
      })

      // Track whether bare db.update is called AFTER the claim
      // (the atomic claim is db.update, but subsequent updates should be tx.update)
      let postClaimBareUpdateCalled = false
      mockDb.update.mockImplementation(() => {
        // Any db.update AFTER the atomic claim is a bare write — should not happen
        postClaimBareUpdateCalled = true
        updateSpy('bare-post-claim-update')
        return makeUpdateChain([])
      })

      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        return fn({
          select: vi.fn(() => makeProxy()),
          update: vi.fn(() => makeUpdateChain([])),
          insert: vi.fn(() => makeInsertChain([])),
        })
      })

      await takeWorkflowAction(approveParams())

      // Post-claim absence update must NOT hit bare db.update — it should use tx.update
      expect(postClaimBareUpdateCalled).toBe(false)
    })
  })

  describe('Fix 4 & 5: SLA breach atomicity (processSLABreaches)', () => {
    /** Shared factory for a breached step with a given onBreach policy. */
    function breachedStep(onBreach: string) {
      return {
        stepInstance: {
          id:                  'breach-step-001',
          instanceId:          'breach-inst-001',
          stepId:              'step-def-breach',
          stepOrder:           1,
          status:              'PENDING',
          assignedToPersonId:  'approver-breach',
          slaDeadline:         new Date(Date.now() - 1000), // already past
          remindedAt:          null,
        },
        definition: {
          id: 'wf-def-breach', workflowCode: 'LEAVE_APPROVAL',
        },
      }
    }

    /**
     * COL-015: processSLABreaches ESCALATE case wraps status updates in db.transaction.
     *
     * Pre-fix: two bare db.update calls — step could be ESCALATED while instance
     *   remains IN_PROGRESS if the second update fails.
     * Post-fix: both updates are inside one db.transaction.
     *
     * Asserts: db.transaction called, result.processed = 1, result.errors = 0.
     */
    it('COL-015: ESCALATE SLA breach wraps both status updates in db.transaction', async () => {
      queryQueue = [
        [breachedStep('ESCALATE')],   // breachedSteps main query
        [{ onSlaBreach: 'ESCALATE' }], // step definition query
      ]

      let txCallCount = 0
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        txCallCount++
        return fn({
          update: vi.fn(() => makeUpdateChain([])),
          insert: vi.fn(() => makeInsertChain([])),
          select: vi.fn(() => makeProxy()),
        })
      })

      const result = await processSLABreaches()

      expect(result.processed).toBe(1)
      expect(result.errors).toBe(0)
      // Fix 4 regression: ESCALATE uses one transaction
      expect(txCallCount).toBe(1)
    })

    /**
     * COL-016: processSLABreaches SEND_REMINDER case wraps notification+update+audit
     * in db.transaction.
     *
     * Pre-fix: queueNotification + remindedAt update + audit were separate bare writes.
     *   A crash after notification insert but before remindedAt update would send
     *   duplicate reminders on the next cron tick (the step stays un-reminded).
     * Post-fix: all three writes inside one db.transaction.
     *
     * Asserts: db.transaction called, result.processed = 1, no duplicate notification.
     */
    it('COL-016: SEND_REMINDER SLA breach wraps notification + remindedAt + audit in one tx', async () => {
      queryQueue = [
        [breachedStep('SEND_REMINDER')],   // breachedSteps query
        [{ onSlaBreach: 'SEND_REMINDER' }], // step definition
      ]

      let txCallCount = 0
      const txInsertSpy = vi.fn()
      const txUpdateSpy = vi.fn()
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        txCallCount++
        return fn({
          insert: vi.fn(() => { txInsertSpy('reminder-tx-insert'); return makeInsertChain([]) }),
          update: vi.fn(() => { txUpdateSpy('reminder-tx-update'); return makeUpdateChain([]) }),
          select: vi.fn(() => makeProxy()),
        })
      })

      const result = await processSLABreaches()

      expect(result.processed).toBe(1)
      expect(result.errors).toBe(0)
      // Fix 5 regression: SEND_REMINDER uses one transaction
      expect(txCallCount).toBe(1)
      // Both notification insert and remindedAt update went through tx
      expect(txInsertSpy).toHaveBeenCalled()
      expect(txUpdateSpy).toHaveBeenCalled()
      // No bare db.update for remindedAt — should be tx.update
      const bareRemindedAtUpdate = updateSpy.mock.calls.filter(c => c[0] === 'called')
      expect(bareRemindedAtUpdate).toHaveLength(0)
    })

    /**
     * STORM-007: processSLABreaches does NOT send a duplicate reminder if
     * remindedAt was set < 24 hours ago (WHERE clause dedup).
     *
     * Scenario: Fix 5 makes the (notification + remindedAt) write atomic.
     * The breach query already filters out recently-reminded steps via:
     *   OR(isNull(remindedAt), lte(remindedAt, now-24h))
     * If the system crashes between notification insert and remindedAt update,
     * the transaction rolls back entirely — remindedAt stays null and the step
     * is correctly picked up again on the next cron tick (one reminder, not two).
     *
     * This test verifies the query-level dedup: a step reminded < 24 h ago is
     * NOT returned by the breachedSteps query → result.processed = 0.
     */
    it('STORM-007: recently-reminded step is excluded by the dedup WHERE clause', async () => {
      // The breachedSteps query returns [] because the remindedAt guard filters it out.
      // This simulates the state AFTER a successful remind cycle (remindedAt is fresh).
      queryQueue = [
        [],  // breachedSteps → empty (WHERE clause excluded the recently-reminded step)
      ]

      const result = await processSLABreaches()

      expect(result.processed).toBe(0)
      expect(result.errors).toBe(0)
      // No transaction should be opened — there are no breached steps to process
      expect(mockDb.transaction).not.toHaveBeenCalled()
      // No notification inserted
      const notifInsert = insertSpy.mock.calls.find(c => c[0] === 'reminder-tx-insert')
      expect(notifInsert).toBeUndefined()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // COLLISION-004 Fix: Hiring Request Uniqueness (COL-017 – COL-023)
  // Phase 3 Priority 6A — migration 0041 + dispatchResourceCompletion handler
  // + createHiringRequest 23505 error surfacing.
  // ═════════════════════════════════════════════════════════════════════════════

  describe('COLLISION-004 Fix: hiring request uniqueness hardening (COL-017–023)', () => {
    /**
     * COL-017: createHiringRequest surfaces a friendly error when the DB throws 23505.
     *
     * Scenario: Two concurrent requests for the same position — the second reaches
     *   the DB after the partial unique index (migration 0041) is in place.  Postgres
     *   raises error code 23505.  The inner catch in createHiringRequest must detect
     *   the code and return a human-readable message, not a raw DB error string.
     *
     * Expected: result.success = false; result.error contains 'already pending approval'.
     */
    it('COL-017: createHiringRequest returns a friendly message when DB raises 23505 unique violation', async () => {
      const uniqueViolation = new Error(
        'duplicate key value violates unique constraint "uq_hiring_request_pending"'
      )
      ;(uniqueViolation as unknown as Record<string, unknown>).code = '23505'

      mockDb.transaction.mockImplementationOnce(async () => {
        throw uniqueViolation
      })

      const result = await createHiringRequest({
        positionId:    'pos-col-017',
        departmentId:  'dept-col-017',
        requestType:   'NEW_HIRE',
        justification: 'This justification is at least thirty characters long for validation.',
        urgency:       'STANDARD',
      })

      expect(result).toBeDefined()
      expect(result!.success).toBe(false)
      expect(result!.error).toMatch(/already pending approval/i)
      // Must NOT leak the raw Postgres error string
      expect(result!.error).not.toMatch(/duplicate key/i)
      expect(result!.error).not.toMatch(/violates unique constraint/i)
    })

    /**
     * COL-018: Non-23505 DB errors still surface as the raw message (regression guard).
     *
     * Scenario: A DB connection error (not a uniqueness violation) must not be silently
     *   mapped to the "already pending" message.  This test guards against over-broad
     *   error handling.
     *
     * Expected: result.success = false; result.error does NOT contain 'already pending approval'.
     */
    it('COL-018: non-23505 DB errors are not mapped to the friendly duplicate message', async () => {
      const connectionError = new Error('connection timeout')
      ;(connectionError as unknown as Record<string, unknown>).code = '08006'  // connection failure

      mockDb.transaction.mockImplementationOnce(async () => {
        throw connectionError
      })

      const result = await createHiringRequest({
        positionId:    'pos-col-018',
        departmentId:  'dept-col-018',
        requestType:   'REPLACEMENT',
        justification: 'This justification is at least thirty characters long for validation.',
      })

      expect(result).toBeDefined()
      expect(result!.success).toBe(false)
      // Should return the raw error message, not the duplicate guard message
      expect(result!.error).not.toMatch(/already pending approval/i)
      expect(result!.error).toContain('connection timeout')
    })

    /**
     * COL-019: dispatchResourceCompletion source contains the hiring_requests case.
     *
     * Source-inspection test: verifies that the hiring_requests branch was added to
     * dispatchResourceCompletion in lib/workflow-engine.ts.  The branch must update
     * the hiring request status and insert a notification.
     *
     * This guards against the case being removed or misspelled without test coverage.
     */
    it('COL-019: dispatchResourceCompletion source contains hiring_requests case', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      // The case must exist
      expect(src).toContain("resourceType === 'hiring_requests'")
      // Must update hiringRequests status
      expect(src).toContain('hiringRequests')
      expect(src).toContain("status:          finalStatus")
    })

    /**
     * COL-020: dispatchResourceCompletion hiring_requests branch inserts bilingual
     * HIRING_REQUEST_APPROVED / HIRING_REQUEST_REJECTED notifications.
     *
     * Expected: both notification type strings appear in the source.
     */
    it('COL-020: dispatchResourceCompletion inserts HIRING_REQUEST_APPROVED and HIRING_REQUEST_REJECTED notifications', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      expect(src).toContain('HIRING_REQUEST_APPROVED')
      expect(src).toContain('HIRING_REQUEST_REJECTED')
      // Arabic subject lines present (bilingual requirement)
      expect(src).toContain('تمت الموافقة على طلب التوظيف')
      expect(src).toContain('تم رفض طلب التوظيف')
    })

    /**
     * COL-021: dispatchResourceCompletion hiring_requests case uses `client` (tx-safe).
     *
     * The `client` variable is set to `tx ?? db`, so when the caller passes a
     * transaction, the hiring request update and notification insert participate in
     * the same atomic commit.  Bare `db.update` would break atomicity.
     *
     * This guards against accidentally using bare `db` in the hiring_requests branch.
     */
    it('COL-021: dispatchResourceCompletion hiring_requests branch uses client (transaction-safe), not bare db', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      // Find the hiring_requests block and verify `client` is used
      const hiringIdx = src.indexOf("resourceType === 'hiring_requests'")
      expect(hiringIdx).toBeGreaterThan(0)

      // Slice the hiring_requests block (up to the next `if (` or end of function)
      const nextBlockIdx = src.indexOf('\n  // Add other', hiringIdx)
      const hiringBlock  = src.slice(hiringIdx, nextBlockIdx > 0 ? nextBlockIdx : hiringIdx + 2000)

      // Must use client, not bare db
      expect(hiringBlock).toContain('await client')
      expect(hiringBlock).not.toContain('await db.update(hiringRequests)')
      expect(hiringBlock).not.toContain('await db.insert(notificationLog)')
    })

    /**
     * COL-022: Migration 0041 exists and contains the partial unique index DDL.
     *
     * File-system check: ensures the migration file was created and the SQL is
     * syntactically complete — index name, table, columns, and WHERE predicate.
     */
    it('COL-022: migration 0041 exists with the correct partial unique index DDL', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const migPath = path.resolve(
        __dirname,
        '../../drizzle/migrations/0041_hiring_request_uniqueness.sql',
      )

      expect(fs.existsSync(migPath), 'migration 0041 file must exist').toBe(true)

      const sql = fs.readFileSync(migPath, 'utf-8')

      // Index name
      expect(sql).toContain('uq_hiring_request_pending')
      // Table
      expect(sql).toContain('hiring_requests')
      // Columns — both tenant and position for multi-tenant defence-in-depth
      expect(sql).toContain('tenant_id')
      expect(sql).toContain('position_id')
      // Partial predicate
      expect(sql).toContain("WHERE status = 'PENDING_APPROVAL'")
      // Safe migration (idempotent)
      expect(sql).toContain('IF NOT EXISTS')
    })

    /**
     * COL-023: createHiringRequest source contains the 23505 guard.
     *
     * Source-inspection test: verifies the inner catch in createHiringRequest reads
     * the Postgres error code and returns a friendly message before falling through to
     * the generic handler.
     */
    it('COL-023: createHiringRequest source contains the 23505 unique-violation guard', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../modules/core-hr/org-chart-actions.ts'),
        'utf-8',
      )

      // The 23505 code check must be present
      expect(src).toContain("'23505'")
      // Friendly message must reference the business concept
      expect(src).toMatch(/already pending approval/i)
      // The pgCode variable (or equivalent) must read the error code property
      expect(src).toContain('.code')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // COLLISION-004B Fix: Transfer Request Uniqueness (COL-024 – COL-030)
  // Phase 3 Priority 6B — migration 0042 + dispatchResourceCompletion handler
  // + createTransferRequest 23505 error surfacing.
  // ═════════════════════════════════════════════════════════════════════════════

  describe('COLLISION-004B Fix: transfer request uniqueness hardening (COL-024–030)', () => {
    /**
     * Shared valid input for COL-024 and COL-025.
     * effectiveDate is an ISO string; justification is implicit through role/notes.
     */
    const validTransferInput = {
      nodeId:              'pos-col-024-src',
      targetPositionId:    'pos-col-024-tgt',
      targetDepartmentId:  '',
      requestType:         'TRANSFER' as const,
      effectiveDate:       '2026-06-01',
      reason:              'ORG_NEED' as const,
      notes:               'Reorg transfer for COL-024 test',
    }

    /**
     * COL-024: createTransferRequest succeeds in the happy path.
     *
     * Scenario: Baseline — single request for a person creates one insert and one audit.
     * The position lookup (db.select) must return a person record before the transaction.
     *
     * Expected: result.success = true; db.transaction called once; audit called once.
     */
    it('COL-024: single createTransferRequest call succeeds with one insert and one audit', async () => {
      // Queue the position lookup result (db.select → personId)
      queryQueue = [[{ personId: 'person-col-024' }]]

      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          insert: vi.fn(() => {
            insertSpy('transfer-tx-insert')
            return makeInsertChain([{ id: 'transfer-req-024' }])
          }),
          update: vi.fn(() => makeUpdateChain([])),
          select: vi.fn(() => makeProxy()),
        }
        return fn(tx)
      })

      const result = await createTransferRequest(validTransferInput)

      expect(result).toBeDefined()
      expect(result!.success).toBe(true)
      expect(result!.error).toBeUndefined()
      expect(mockDb.transaction).toHaveBeenCalledOnce()
      const xferInsert = insertSpy.mock.calls.find(c => c[0] === 'transfer-tx-insert')
      expect(xferInsert).toBeDefined()
      expect(auditSpy).toHaveBeenCalledOnce()
    })

    /**
     * COL-025: createTransferRequest returns a friendly message when DB raises 23505.
     *
     * Scenario: Two concurrent transfer requests for the same person — the second
     *   hits the partial unique index (migration 0042) and raises Postgres error 23505.
     *   The inner catch must return a human-readable message, not a raw DB error.
     *
     * Expected: result.success = false; result.error contains 'already pending approval'.
     */
    it('COL-025: createTransferRequest returns a friendly message when DB raises 23505 unique violation', async () => {
      queryQueue = [[{ personId: 'person-col-025' }]]

      const uniqueViolation = new Error(
        'duplicate key value violates unique constraint "uq_transfer_request_pending"'
      )
      ;(uniqueViolation as unknown as Record<string, unknown>).code = '23505'

      mockDb.transaction.mockImplementationOnce(async () => {
        throw uniqueViolation
      })

      const result = await createTransferRequest(validTransferInput)

      expect(result).toBeDefined()
      expect(result!.success).toBe(false)
      expect(result!.error).toMatch(/already pending approval/i)
      expect(result!.error).not.toMatch(/duplicate key/i)
      expect(result!.error).not.toMatch(/violates unique constraint/i)
    })

    /**
     * COL-026: Non-23505 errors are not mapped to the friendly duplicate message.
     *
     * Scenario: A DB connection error must not be silently promoted to the
     *   "already pending" message. Guards against over-broad error handling.
     *
     * Expected: result.success = false; error is the raw message, not duplicate text.
     */
    it('COL-026: non-23505 DB errors are not mapped to the friendly duplicate message', async () => {
      queryQueue = [[{ personId: 'person-col-026' }]]

      const connectionError = new Error('connection reset by peer')
      ;(connectionError as unknown as Record<string, unknown>).code = '08006'

      mockDb.transaction.mockImplementationOnce(async () => {
        throw connectionError
      })

      const result = await createTransferRequest(validTransferInput)

      expect(result).toBeDefined()
      expect(result!.success).toBe(false)
      expect(result!.error).not.toMatch(/already pending approval/i)
      expect(result!.error).toContain('connection reset by peer')
    })

    /**
     * COL-027: dispatchResourceCompletion source contains the transfer_requests case.
     *
     * Source-inspection test: verifies the transfer_requests branch exists in
     * dispatchResourceCompletion in lib/workflow-engine.ts.
     */
    it('COL-027: dispatchResourceCompletion source contains transfer_requests case', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      expect(src).toContain("resourceType === 'transfer_requests'")
      expect(src).toContain('transferRequests')
      // Must update status on completion
      expect(src).toMatch(/update\(transferRequests\)/)
    })

    /**
     * COL-028: dispatchResourceCompletion transfer_requests inserts bilingual notifications.
     *
     * Expected: TRANSFER_REQUEST_APPROVED and TRANSFER_REQUEST_REJECTED notification types
     * and Arabic subject lines are present in the source.
     */
    it('COL-028: dispatchResourceCompletion inserts TRANSFER_REQUEST_APPROVED and TRANSFER_REQUEST_REJECTED notifications', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      expect(src).toContain('TRANSFER_REQUEST_APPROVED')
      expect(src).toContain('TRANSFER_REQUEST_REJECTED')
      // Arabic subject lines (bilingual requirement)
      expect(src).toContain('تمت الموافقة على طلب النقل')
      expect(src).toContain('تم رفض طلب النقل')
    })

    /**
     * COL-029: dispatchResourceCompletion transfer_requests uses client (transaction-safe).
     *
     * The `client` variable is `tx ?? db`, so the update and notification insert
     * participate in the caller's transaction.  Bare `db.update` would break atomicity.
     */
    it('COL-029: dispatchResourceCompletion transfer_requests branch uses client (not bare db)', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      const transferIdx = src.indexOf("resourceType === 'transfer_requests'")
      expect(transferIdx).toBeGreaterThan(0)

      // Slice the transfer_requests block (up to the closing comment)
      const nextBlockIdx = src.indexOf('\n  // Add other', transferIdx)
      const transferBlock = src.slice(transferIdx, nextBlockIdx > 0 ? nextBlockIdx : transferIdx + 2500)

      expect(transferBlock).toContain('await client')
      expect(transferBlock).not.toContain('await db.update(transferRequests)')
      expect(transferBlock).not.toContain('await db.insert(notificationLog)')
    })

    /**
     * COL-030: Migration 0042 exists with the correct partial unique index DDL.
     *
     * File-system check: ensures the migration file was created and the SQL is
     * complete — index name, table, columns, and WHERE predicate.
     */
    it('COL-030: migration 0042 exists with the correct partial unique index DDL', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const migPath = path.resolve(
        __dirname,
        '../../drizzle/migrations/0042_transfer_request_uniqueness.sql',
      )

      expect(fs.existsSync(migPath), 'migration 0042 file must exist').toBe(true)

      const sql = fs.readFileSync(migPath, 'utf-8')

      expect(sql).toContain('uq_transfer_request_pending')
      expect(sql).toContain('transfer_requests')
      expect(sql).toContain('tenant_id')
      expect(sql).toContain('person_id')
      expect(sql).toContain("WHERE status = 'PENDING_APPROVAL'")
      expect(sql).toContain('IF NOT EXISTS')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLISION-003 Fix: submitLeaveRequest caller-level transaction hardening
  // (Phase 3 Priority 6C — COL-031–037)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // COLLISION-003 (caller-level): submitLeaveRequest in modules/absence/actions.ts
  // previously called submitWorkflow() in its own internal transaction (Tx A), then
  // opened a separate db.transaction() to update absenceEntries.status (Tx B). A
  // crash between these two commits left the system with a committed workflow
  // instance but a DRAFT leave record — diverged state with no rollback path.
  //
  // FIX (Phase 3 Priority 6C): submitWorkflow now accepts an optional tx?: DbOrTx
  // param. submitLeaveRequest wraps both submitWorkflow({..., tx}) and the status
  // update in a single outer db.transaction. If anything fails, both roll back.
  //
  // These tests are source-inspection tests that verify the structural fix is in
  // place — no live DB required. This approach is consistent with COL-017–030.

  describe('COLLISION-003 Fix: submitLeaveRequest caller-level transaction hardening (COL-031–037)', () => {
    /**
     * COL-031: SubmitWorkflowParams includes tx?: DbOrTx.
     *
     * The tx field is the entry point for the COLLISION-003 fix. Without it,
     * submitWorkflow has no way to participate in the caller's transaction.
     */
    it('COL-031: SubmitWorkflowParams has tx?: DbOrTx property', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      // The interface must exist and include tx?: DbOrTx
      expect(src).toContain('SubmitWorkflowParams')
      expect(src).toMatch(/tx\?:\s*DbOrTx/)
    })

    /**
     * COL-032: submitWorkflow extracts outerTx from params and has a doWrites helper.
     *
     * doWrites is the closure that accepts a DbOrTx parameter. The conditional
     * dispatch (if outerTx / else db.transaction) drives the atomicity fix.
     */
    it('COL-032: submitWorkflow has doWrites helper with conditional outerTx dispatch', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      // doWrites closure must exist
      expect(src).toContain('const doWrites = async (client: DbOrTx)')
      // Conditional dispatch must exist
      expect(src).toContain('if (outerTx)')
      expect(src).toContain('doWrites(outerTx)')
    })

    /**
     * COL-033: submitWorkflow calls doWrites(outerTx) when tx is supplied,
     * and falls back to db.transaction otherwise.
     *
     * Verifies both branches of the conditional dispatch so we know neither
     * path was accidentally removed.
     */
    it('COL-033: submitWorkflow has both tx-supplied and standalone-tx branches', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      // tx-supplied path: doWrites(outerTx)
      expect(src).toContain('await doWrites(outerTx)')
      // standalone path: db.transaction wrapping doWrites
      expect(src).toMatch(/db\.transaction\(async _tx => doWrites\(_tx/)
    })

    /**
     * COL-034: submitLeaveRequest passes tx: outerTx to submitWorkflow.
     *
     * Without this, the fix is never activated — submitWorkflow would ignore
     * the outer transaction and create its own independent Tx A again.
     */
    it('COL-034: submitLeaveRequest passes tx: outerTx to submitWorkflow call', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../modules/absence/actions.ts'),
        'utf-8',
      )

      // The submitWorkflow call inside submitLeaveRequest must pass tx: outerTx
      expect(src).toContain('tx: outerTx')
      // submitWorkflow must be called with the outer tx
      expect(src).toMatch(/submitWorkflow\([\s\S]{0,500}tx: outerTx/)
    })

    /**
     * COL-035: submitLeaveRequest uses a single outer db.transaction that
     * wraps both submitWorkflow and the absenceEntries status update.
     *
     * The key structural invariant: there is one and only one db.transaction
     * block in the submitLeaveRequest function body that encloses both the
     * workflow submission and the status update.
     */
    it('COL-035: submitLeaveRequest wraps submitWorkflow + status update in one outer db.transaction', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../modules/absence/actions.ts'),
        'utf-8',
      )

      // The outer transaction must return v2InstanceId
      expect(src).toContain('v2InstanceId: instanceId')
      // The outer transaction pattern must exist
      expect(src).toMatch(/const \{ v2InstanceId \} = await db\.transaction/)
      // submitWorkflow must appear inside the outer transaction region
      // (verify by checking submitWorkflow is called with tx: outerTx)
      expect(src).toMatch(/await submitWorkflow\([\s\S]{0,800}tx: outerTx/)
      // absenceEntries update must also be inside (uses outerTx)
      expect(src).toMatch(/outerTx\s*\.update\(absenceEntries\)/)
    })

    /**
     * COL-036: DbOrTx is exported from lib/db.ts.
     *
     * The type export is required so both lib/workflow-engine.ts and
     * modules/absence/actions.ts can reference the same type without
     * circular imports or local re-definitions.
     */
    it('COL-036: DbOrTx is exported from lib/db.ts', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/db.ts'),
        'utf-8',
      )

      expect(src).toContain('export type DbOrTx')
      expect(src).toContain('export type Tx')
    })

    /**
     * COL-037: lib/workflow-engine.ts imports DbOrTx from @/lib/db (not local).
     *
     * Verifies the type was promoted to a shared location rather than being
     * duplicated — prevents future type drift if db.ts changes.
     */
    it('COL-037: workflow-engine imports DbOrTx from @/lib/db', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../lib/workflow-engine.ts'),
        'utf-8',
      )

      // Import line must include DbOrTx from @/lib/db
      expect(src).toMatch(/import \{[^}]*DbOrTx[^}]*\} from '@\/lib\/db'/)
      // Local re-definition of DbOrTx/Tx must no longer exist
      expect(src).not.toMatch(/^type Tx\s*=/m)
      expect(src).not.toMatch(/^type DbOrTx\s*=/m)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // ARIA-LOCK Fix: createLeaveRequest per-person advisory lock (ARIA-LOCK-001–007)
  //
  // These source-inspection tests verify the structural concurrency guard
  // introduced in Phase 3 Priority 6D. They act as regression sentinels:
  // if the advisory lock is accidentally removed or moved after the overlap
  // check, the tests fail immediately rather than at runtime under load.
  // ══════════════════════════════════════════════════════════════════════════

  describe('ARIA-LOCK Fix: createLeaveRequest per-person advisory lock (ARIA-LOCK-001–007)', () => {
    const absenceSrcPath = '../../modules/absence/actions.ts'

    /**
     * ARIA-LOCK-001: pg_advisory_xact_lock keyed on personId exists in
     * createLeaveRequest.
     *
     * The fix must use a PERSON-scoped lock (not entity-scoped) so that
     * two ARIA sessions for different people are never serialised against
     * each other. The key 'leave:' prefix distinguishes this lock from the
     * 'payroll_run:' and LR-number advisory locks.
     */
    it('ARIA-LOCK-001: createLeaveRequest acquires pg_advisory_xact_lock keyed on personId', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, absenceSrcPath),
        'utf-8',
      )

      // Must contain pg_advisory_xact_lock with the person-scoped key
      expect(src).toContain("pg_advisory_xact_lock(hashtext('leave:' || ${data.personId}))")
    })

    /**
     * ARIA-LOCK-002: advisory lock key uses person-scoped hashtext, not
     * entity-scoped, so different persons in the same entity are not
     * serialised against each other.
     *
     * Entity-scoped lock would unnecessarily block Person A's create while
     * Person B's is in flight — wrong granularity for ARIA concurrency.
     */
    it('ARIA-LOCK-002: advisory lock key is person-scoped (leave: prefix), not entity-scoped', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, absenceSrcPath),
        'utf-8',
      )

      // Person-scoped key must be present
      expect(src).toMatch(/pg_advisory_xact_lock\(hashtext\('leave:'\s*\|\|\s*\$\{data\.personId\}\)\)/)
      // Must NOT use legalEntityId as the sole lock key in the overlap guard
      // (the legalEntityId lock in nextRequestNumber is for LR-number uniqueness
      // only — a different concern from overlap serialisation)
      expect(src).not.toMatch(/pg_advisory_xact_lock\(hashtext\('leave:'\s*\|\|\s*\$\{[^}]*legalEntityId[^}]*\}\)\)/)
    })

    /**
     * ARIA-LOCK-003: advisory lock is called inside db.transaction so it is
     * transaction-scoped (pg_advisory_xact_lock) and auto-released on commit
     * or rollback without requiring an explicit unlock call.
     *
     * Using pg_advisory_lock (session-scoped) instead would require an
     * explicit release and would persist past transaction boundaries.
     */
    it('ARIA-LOCK-003: advisory lock is transaction-scoped (pg_advisory_xact_lock not pg_advisory_lock)', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, absenceSrcPath),
        'utf-8',
      )

      // Transaction-scoped variant must be present
      expect(src).toContain('pg_advisory_xact_lock')
      // Session-scoped variant must NOT be the mechanism used for ARIA-LOCK
      // (session locks require explicit release; transaction locks do not)
      // Note: this checks that pg_advisory_lock without _xact_ is not in the
      // leave: key context — presence elsewhere (e.g. comments) is fine.
      const leaveAdvisoryLines = src
        .split('\n')
        .filter(l => l.includes("'leave:'"))
      leaveAdvisoryLines.forEach(line => {
        expect(line).not.toMatch(/pg_advisory_lock\b(?!_xact_)/)
      })
    })

    /**
     * ARIA-LOCK-004: advisory lock is acquired BEFORE loadPersonScope in the
     * createLeaveRequest transaction body.
     *
     * Acquiring the lock after the overlap check would not fix the race —
     * the overlap check must run while the lock is held.
     */
    it('ARIA-LOCK-004: advisory lock appears before loadPersonScope in source order', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, absenceSrcPath),
        'utf-8',
      )

      const lockIdx        = src.indexOf("pg_advisory_xact_lock(hashtext('leave:'")
      const loadPersonIdx  = src.indexOf('loadPersonScope(tx, data.personId)')

      expect(lockIdx).toBeGreaterThan(-1)
      expect(loadPersonIdx).toBeGreaterThan(-1)
      // Lock must appear earlier in the file than loadPersonScope call inside
      // the same transaction block
      expect(lockIdx).toBeLessThan(loadPersonIdx)
    })

    /**
     * ARIA-LOCK-005: submitConfirmedLeaveRequest in ARIA actions handles
     * OVERLAP errors with a user-friendly bilingual message.
     *
     * When the advisory lock causes the second concurrent caller to fail the
     * overlap check, submitConfirmedLeaveRequest must surface a helpful message
     * rather than an unhandled exception — ensuring ARIA chat never crashes.
     */
    it('ARIA-LOCK-005: submitConfirmedLeaveRequest handles OVERLAP error with user-friendly message', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../modules/aria/actions.ts'),
        'utf-8',
      )

      // OVERLAP branch must be handled (msg.startsWith('OVERLAP'))
      expect(src).toContain("msg.startsWith('OVERLAP')")
      // Must return a bilingual AriaResponse (not rethrow)
      expect(src).toMatch(/OVERLAP[\s\S]{0,400}ariaResponse\.message\s*=/)
    })

    /**
     * ARIA-LOCK-006: the only ARIA chat mutation path is
     * submitConfirmedLeaveRequest. All other ARIA handlers are read-only.
     *
     * This ensures the advisory lock is the only concurrency guard needed
     * in the ARIA chat flow — there are no other write paths to protect.
     */
    it('ARIA-LOCK-006: sendAriaMessage write path is exclusively LEAVE_REQUEST_CONFIRM intent', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../modules/aria/actions.ts'),
        'utf-8',
      )

      // The submit call must be gated on LEAVE_REQUEST_CONFIRM intent
      expect(src).toContain("intentResult.intent === 'LEAVE_REQUEST_CONFIRM' && pendingDraft")
      // P3-A1: identity is re-derived server-side — the submit now uses safeCtx
      // (session-derived) instead of the client-supplied sessionCtx.
      expect(src).toContain('submitConfirmedLeaveRequest(pendingDraft, safeCtx)')
      // Hard Rule 7 comment must still be present (protection intent is documented)
      expect(src).toContain('Hard Rule 7')
    })

    /**
     * ARIA-LOCK-007: ARIA read-only intent handlers in services.ts contain no
     * db.insert or db.update calls — they are purely SELECT paths.
     *
     * This validates the inventory finding that no other ARIA handler needs
     * concurrency protection beyond the leave creation path.
     */
    it('ARIA-LOCK-007: ARIA read-only handlers in services.ts contain no db.insert / db.update calls', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(
        path.resolve(__dirname, '../../modules/aria/services.ts'),
        'utf-8',
      )

      // services.ts must not contain direct insert or update calls
      // (all data writes flow through modules/absence/actions.ts)
      expect(src).not.toMatch(/\.insert\s*\(/)
      expect(src).not.toMatch(/\.update\s*\(/)
      // Must contain only SELECT-style queries (confirm read-only nature)
      expect(src).toContain('.select(')
    })
  })

  // ── COLLISION-PROBATION Fix: applyProbationOutcome tx threading (PROB-001–007) ─

  describe('COLLISION-PROBATION Fix: applyProbationOutcome tx threading (PROB-001–007)', () => {
    const probationSrcPath   = '../../modules/core-hr/probation/workflow-actions.ts'
    const workflowEnginePath = '../../lib/workflow-engine.ts'

    /**
     * PROB-001: applyProbationOutcome signature accepts an optional tx?: DbOrTx param.
     * This is the contract extension that allows dispatchResourceCompletion to thread
     * the post-claim transaction into the probation write path.
     */
    it('PROB-001: applyProbationOutcome signature accepts tx?: DbOrTx', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, probationSrcPath), 'utf-8')

      // The function signature must include tx?: DbOrTx
      expect(src).toMatch(/applyProbationOutcome\(params:\s*\{[\s\S]{0,600}tx\?\s*:\s*DbOrTx/)
    })

    /**
     * PROB-002: applyProbationOutcome destructures tx: outerTx from params so each
     * branch can reference outerTx (the outer transaction) vs internal db.transaction.
     */
    it('PROB-002: applyProbationOutcome destructures tx: outerTx from params', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, probationSrcPath), 'utf-8')

      // Destructuring pattern: tx: outerTx from params
      expect(src).toContain('tx: outerTx')
    })

    /**
     * PROB-003: REJECTED branch uses runReject closure and conditional dispatch.
     * The outer tx is used when provided; otherwise db.transaction is opened.
     * This ensures the REJECTED outcome joins the caller's post-claim transaction.
     */
    it('PROB-003: REJECTED branch uses runReject closure with outerTx conditional dispatch', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, probationSrcPath), 'utf-8')

      expect(src).toContain('const runReject = async (client: DbOrTx)')
      expect(src).toMatch(/if\s*\(outerTx\)\s*\{[\s\S]{0,50}await runReject\(outerTx\)/)
      expect(src).toMatch(/runReject\(_tx as unknown as DbOrTx\)/)
    })

    /**
     * PROB-004: CONFIRM branch uses runConfirm closure and conditional dispatch.
     * The CONFIRM branch is the most common outcome — PENDING_ACKNOWLEDGMENT waiting
     * for employee to sign their PCL. Both the review update and notification join
     * the outer transaction.
     */
    it('PROB-004: CONFIRM branch uses runConfirm closure with outerTx conditional dispatch', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, probationSrcPath), 'utf-8')

      expect(src).toContain('const runConfirm = async (client: DbOrTx)')
      expect(src).toMatch(/if\s*\(outerTx\)\s*\{[\s\S]{0,50}await runConfirm\(outerTx\)/)
      expect(src).toMatch(/runConfirm\(_tx as unknown as DbOrTx\)/)
    })

    /**
     * PROB-005: EXTEND branch uses runExtend closure and conditional dispatch.
     * The EXTEND branch writes to both persons (new probationEndDate) and
     * probationReviews — both must be atomic with the outer workflow transaction.
     */
    it('PROB-005: EXTEND branch uses runExtend closure with outerTx conditional dispatch', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, probationSrcPath), 'utf-8')

      expect(src).toContain('const runExtend = async (client: DbOrTx)')
      expect(src).toMatch(/if\s*\(outerTx\)\s*\{[\s\S]{0,50}await runExtend\(outerTx\)/)
      expect(src).toMatch(/runExtend\(_tx as unknown as DbOrTx\)/)
    })

    /**
     * PROB-006: FAIL branch uses runFail closure and conditional dispatch.
     * triggerTerminationApproval must remain outside the transaction (intentional
     * design — the termination trigger must not be rolled back if the outer tx
     * rolls back for an unrelated reason after probation writes succeed).
     */
    it('PROB-006: FAIL branch uses runFail closure and triggerTerminationApproval stays outside', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, probationSrcPath), 'utf-8')

      expect(src).toContain('const runFail = async (client: DbOrTx)')
      expect(src).toMatch(/if\s*\(outerTx\)\s*\{[\s\S]{0,50}await runFail\(outerTx\)/)
      expect(src).toMatch(/runFail\(_tx as unknown as DbOrTx\)/)
      // triggerTerminationApproval call must appear AFTER the runFail block
      const runFailIdx       = src.indexOf('const runFail = async')
      const terminationIdx   = src.indexOf('triggerTerminationApproval(')
      expect(runFailIdx).toBeGreaterThan(-1)
      expect(terminationIdx).toBeGreaterThan(-1)
      expect(terminationIdx).toBeGreaterThan(runFailIdx)
    })

    /**
     * PROB-007: dispatchResourceCompletion in workflow-engine.ts passes tx to
     * applyProbationOutcome, completing the chain. Without this change the tx
     * threading in applyProbationOutcome would never be exercised from the engine.
     */
    it('PROB-007: dispatchResourceCompletion passes tx to applyProbationOutcome', async () => {
      const fs   = await import('fs')
      const path = await import('path')
      const src  = fs.readFileSync(path.resolve(__dirname, workflowEnginePath), 'utf-8')

      // The probation_review case must pass tx: to applyProbationOutcome
      expect(src).toMatch(/applyProbationOutcome\(\{[\s\S]{0,300}tx,/)
      // The old "known limitation (COLLISION-PROBATION)" comment must be gone
      expect(src).not.toContain('known limitation (COLLISION-PROBATION)')
      // The fix comment must be present
      expect(src).toContain('COLLISION-PROBATION fix')
    })
  })
})
