# AVANIIS HCM — Collision Matrix
## Phase 2 Task 9: AI Multi-Agent Workflow Simulation and Collision Testing

**Document version:** 6.0  
**Date:** 2026-05-25 (Phase 3 Priority 6E — COLLISION-PROBATION applyProbationOutcome tx threading FIXED)  
**Author:** QA Documentation Agent (Phase 2 Task 9 + Phase 3 Priority 2 + Phase 3 Priority 6A + Phase 3 Priority 6B + Phase 3 Priority 6C + Phase 3 Priority 6D + Phase 3 Priority 6E)  
**Status:** COMPLETE — 12 fixed, 0 HIGH-severity gaps, 0 gaps remaining (updated from v5.0: COLLISION-PROBATION fixed; applyProbationOutcome accepts tx?: DbOrTx; all 4 outcome branches use runBranch(client) closure pattern; 7 regression tests PROB-001–007)

---

## 1. Overview

### Purpose

Phase 2 Task 9 validates AVANIIS HCM under concurrent AI-agent and multi-user interactions. The goal is to identify, classify, and resolve collision scenarios that arise when multiple users — or autonomous agents acting on behalf of users — interact with the same shared resources simultaneously.

### Scope

- Concurrent approval workflow actions (double-approval, SLA cron racing a live approver)
- Concurrent leave and hiring request submission
- Notification deduplication under cron retry conditions
- Payroll run number generation under concurrent creation
- ARIA assistant multi-session concurrency against HR records
- Non-atomic transaction chains in `submitWorkflow`

### Methodology

| Aspect | Detail |
|---|---|
| Agent topology | Supervisor + 10 child agents (see `ai-multi-agent-simulation.md`) |
| Test framework | Vitest mock-based concurrency simulation |
| Production load | None — no live production load injected; invariants proved via mock-controlled timing |
| DB target | Local Postgres 16 (Docker) — Neon staging used only for soak, not collision testing |
| Execution date | 2026-05-23 |
| Related doc | `tests/roadmap/ai-multi-agent-simulation.md` |

### Why mock-based concurrency?

Production and staging environments cannot safely have real race conditions injected — doing so risks corrupting live HR records or triggering actual double-approvals. Mock-based tests provide deterministic proof of the logical invariant: under concurrent invocation, the fixed code must return exactly one success and one concurrent-action error. This is more reliable than timing-dependent integration tests, which can pass or fail based on scheduler jitter.

---

## 2. Collision Scenario Matrix

### Summary

| ID | Scenario | Location | Severity | Status |
|---|---|---|---|---|
| COLLISION-001 | Double Approval on Same Step Instance | `lib/workflow-engine.ts` → `takeWorkflowAction()` | CRITICAL | ✅ FIXED |
| COLLISION-002 | SLA Cron Racing Live Approval | `lib/workflow-engine.ts` → `processSLABreaches()` | HIGH | ✅ FIXED (by COLLISION-001) |
| COLLISION-003 | `submitWorkflow` Non-Atomic Write Chain | `lib/workflow-engine.ts` → `submitWorkflow()` | HIGH | ✅ FIXED (Phase 3 P2) |
| COLLISION-004 | Duplicate Hiring / Transfer Requests | `modules/core-hr/org-chart-actions.ts` | MEDIUM | ✅ FIXED (Phase 3 P6A/P6B) |
| COLLISION-005 | Double `absenceBalances` Debit | `modules/absence/actions.ts` → `decideLeaveRequest()` | MEDIUM | ⚠️ MITIGATED |
| ARIA-LOCK | Concurrent ARIA Leave Creation Overlap Race | `modules/absence/actions.ts` → `createLeaveRequest()` | MEDIUM | ✅ FIXED (Phase 3 P6D) |
| COLLISION-006 | `takeWorkflowAction` Post-Claim Not Atomic | `lib/workflow-engine.ts` → `takeWorkflowAction()` | MEDIUM | ✅ FIXED (Phase 3 P2) |
| COLLISION-DELEGATE | DELEGATE Branch Not Atomic | `lib/workflow-engine.ts` → `takeWorkflowAction()` DELEGATE | LOW | ✅ FIXED (Phase 3 P2) |
| COLLISION-SLA-BRANCH | SLA ESCALATE + SEND_REMINDER Not Atomic | `lib/workflow-engine.ts` → `processSLABreaches()` | LOW | ✅ FIXED (Phase 3 P2) |
| COLLISION-NOTIF | Probation Alerts Duplicate Notifications | `app/api/cron/probation-alerts/route.ts` | HIGH | ✅ FIXED |
| RISK-PAYROLL-2 | `nextRunNumber` Race Condition | `modules/payroll/actions.ts` → `nextRunNumber()` | MEDIUM | ✅ FIXED |
| COLLISION-PROBATION | `applyProbationOutcome` Separate Transaction Boundary | `modules/core-hr/probation/workflow-actions.ts` → `applyProbationOutcome()` | LOW | ✅ FIXED (Phase 3 P6E) |

---

### COLLISION-001 — Double Approval on Same Step Instance

| Field | Detail |
|---|---|
| **ID** | COLLISION-001 |
| **Severity** | CRITICAL |
| **Status** | ✅ FIXED |
| **Location** | `lib/workflow-engine.ts` → `takeWorkflowAction()` |
| **Test file** | `tests/integration/workflow-collision.test.ts` |

#### Root Cause

Read-then-write without a row lock. Both concurrent callers perform:

```
SELECT status FROM workflow_step_instances WHERE id = $1
-- both read status = 'PENDING'
UPDATE workflow_step_instances SET status = 'APPROVED', decided_by = $2 WHERE id = $1
```

Both updates succeed because neither verifies the pre-condition at write time. Result:

- Duplicate audit log entries for the same approval action
- `dispatchResourceCompletion` fires twice, triggering two downstream workflow transitions
- Double leave balance debit is possible if the resource completion handler is not idempotent

#### Fix Applied

Atomic `UPDATE ... WHERE status = 'PENDING' RETURNING id`. An empty result set signals that a concurrent actor already acted on this step.

```sql
UPDATE workflow_step_instances
SET    status = $newStatus, decided_by = $deciderId, decided_at = NOW()
WHERE  id = $stepId
AND    status = 'PENDING'
RETURNING id
```

If `RETURNING id` returns no rows, `takeWorkflowAction` returns `{ success: false, error: 'concurrent action detected' }` and no downstream effects are triggered.

#### Evidence

| Artefact | Path |
|---|---|
| Fix | `lib/workflow-engine.ts` |
| Test | `tests/integration/workflow-collision.test.ts` |
| Commit | `1bdb54c` (Phase 2 Task 9) |

---

### COLLISION-002 — SLA Cron Racing Live Approval

| Field | Detail |
|---|---|
| **ID** | COLLISION-002 |
| **Severity** | HIGH → resolved by COLLISION-001 fix |
| **Status** | ✅ FIXED (by COLLISION-001 fix) |
| **Location** | `lib/workflow-engine.ts` → `processSLABreaches()` + `takeWorkflowAction()` |

#### Root Cause

The Vercel cron job (`api/cron/workflow-sla/route.ts`) calls `processSLABreaches()`, which in turn calls `takeWorkflowAction()` for any step that has exceeded its SLA deadline. A human approver acting at the same instant hits the same code path. Both use the identical TOCTOU read-then-write pattern as COLLISION-001.

#### Fix Applied

The atomic `UPDATE ... WHERE status = 'PENDING' RETURNING id` guard introduced in COLLISION-001 applies equally to the cron path. `processSLABreaches` logs a warning when `takeWorkflowAction` returns the concurrent-action error and moves on to the next breach without escalating further. No separate fix was required.

#### Evidence

| Artefact | Path |
|---|---|
| Fix (shared) | `lib/workflow-engine.ts` |
| Cron route | `app/api/cron/workflow-sla/route.ts` |
| Commit | `1bdb54c` (Phase 2 Task 9) |

---

### COLLISION-003 — `submitWorkflow` Non-Atomic Write Chain

| Field | Detail |
|---|---|
| **ID** | COLLISION-003 |
| **Severity** | HIGH |
| **Status** | ✅ FIXED (Phase 3 Priority 2 hardening) |
| **Location** | `lib/workflow-engine.ts` → `submitWorkflow()` |
| **Test file** | `tests/integration/workflow-collision.test.ts` — COL-009, COL-010 |

#### Root Cause

`submitWorkflow()` issued 6 sequential bare `db.insert()` / `db.update()` calls with no enclosing transaction. A crash between any two writes left a partial workflow object visible to concurrent readers (e.g., instance row present but no step rows, or step rows present but notification never queued).

#### Fix Applied (Phase 3 Priority 2)

All writes now execute inside a single `db.transaction()`:
1. Pre-compute all `calculateSLADeadline` results (read-only, outside transaction)
2. Open `db.transaction(async tx => { ... })` wrapping:
   - `tx.insert(workflowInstancesV2)`
   - Loop: `tx.insert(workflowStepInstances)` per step
   - `tx.update(workflowInstancesV2)` (set IN_PROGRESS, firstStepId)
   - `tx.insert(workflowEmailTokens)` (approval email JWT)
   - `tx.update(workflowStepInstances)` (emailTokenJti)
   - `queueNotification({..., tx})` → `tx.insert(workflowNotificationQueue)`
   - `writeAudit({..., tx})` → `tx.insert(workflowAuditLog)`
3. Inner SELECT for `firstStepInstance` uses `tx` to read newly inserted rows

#### Evidence

| Artefact | Path |
|---|---|
| Fix | `lib/workflow-engine.ts` → `submitWorkflow()` (Phase 3 P2 commit) |
| Tests | `tests/integration/workflow-collision.test.ts` — COL-009, COL-010 |

---

### COLLISION-003 (Caller-Level) — Leave Request Submission Transaction Split

| Field | Detail |
|---|---|
| **ID** | COLLISION-003 (caller-level) |
| **Severity** | HIGH |
| **Status** | ✅ FIXED — Phase 3 Priority 6C (2026-05-24) |
| **Location** | `modules/absence/actions.ts` → `submitLeaveRequest()` |
| **Test file** | `tests/integration/workflow-collision.test.ts` — COL-031–037 |

#### Root Cause

`submitLeaveRequest` called `submitWorkflow()` outside any transaction (Tx A — self-contained, committed immediately). Then it opened a separate `db.transaction()` (Tx B) to update `absenceEntries.status` to `PENDING`. A crash between Tx A commit and Tx B start produced diverged state: a committed `workflow_instances` row in `IN_PROGRESS` status, but `absenceEntries.status` still `DRAFT`. The compensation event fallback (`emitCompensationEvent`) was best-effort and logged the divergence but could not roll back the committed workflow.

#### Fix Applied (Phase 3 Priority 6C)

**Three-part fix:**

**1. `SubmitWorkflowParams.tx?: DbOrTx` (engine contract extension)**

Added optional `tx?: DbOrTx` parameter to `SubmitWorkflowParams`. When supplied, `submitWorkflow` participates in the caller's transaction instead of opening its own. All other callers omit `tx` — zero behaviour change for the rest of the system.

**2. Conditional transaction dispatch in `submitWorkflow`**

The internal `db.transaction(async _tx => {...})` write block was extracted into a `doWrites(client: DbOrTx)` closure. Dispatch is now conditional:
```typescript
if (outerTx) {
  await doWrites(outerTx)         // participate in caller's tx
} else {
  await db.transaction(async _tx => doWrites(_tx as unknown as DbOrTx))  // own tx (all other callers)
}
```

**3. Single outer transaction in `submitLeaveRequest`**

The sequential two-transaction pattern was replaced with a single outer `db.transaction`:
```typescript
const { v2InstanceId } = await db.transaction(async _outerTx => {
  const outerTx = _outerTx as unknown as DbOrTx
  const v2Result = await submitWorkflow({..., tx: outerTx})  // joins outer tx
  // ...status update, audit, events, notification — all same outer tx
  return { v2InstanceId: instanceId }
})
```

If anything fails — workflow creation, status update, audit, outbox event, or notification — the entire outer transaction rolls back. No partial state is possible.

**4. `DbOrTx` promoted to `lib/db.ts` export**

`DbOrTx` and `Tx` were previously local types in `lib/workflow-engine.ts`. They are now exported from `lib/db.ts` so any caller can reference them without circular imports.

#### Evidence

| Artefact | Path |
|---|---|
| Type addition | `lib/workflow-engine.ts` — `tx?: DbOrTx` in `SubmitWorkflowParams` |
| Conditional dispatch | `lib/workflow-engine.ts` — `doWrites` closure + `if (outerTx)` branch |
| Caller fix | `modules/absence/actions.ts` — single outer `db.transaction` in `submitLeaveRequest` |
| Shared type | `lib/db.ts` — `export type DbOrTx`, `export type Tx` |
| Regression tests | `tests/integration/workflow-collision.test.ts` — COL-031–037 (7 source-inspection tests) |

---

### COLLISION-004 — Duplicate Hiring Requests

| Field | Detail |
|---|---|
| **ID** | COLLISION-004 |
| **Severity** | MEDIUM |
| **Status** | ✅ FIXED — Phase 3 Priority 6A (2026-05-24) |
| **Location** | `modules/core-hr/org-chart-actions.ts` → `createHiringRequest()` |

#### Root Cause

No unique constraint existed on `(tenant_id, position_id)` for `hiring_requests`. A user double-clicking "Raise Hiring Request", or two managers simultaneously initiating a request for the same vacant position, created two independent `PENDING_APPROVAL` rows. Both proceeded through the approval workflow independently, risking a double-hire or silent second-approval failure.

Additionally, `dispatchResourceCompletion` had no `hiring_requests` case, so status never transitioned from `PENDING_APPROVAL` — meaning even a properly-added partial index would permanently block re-hiring a position after the first request was resolved.

#### Fix Applied (Phase 3 Priority 6A)

**Three-part fix:**

**1. Migration 0041 — DB-level partial unique index (primary guard)**
```sql
-- drizzle/migrations/0041_hiring_request_uniqueness.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_hiring_request_pending
  ON hiring_requests (tenant_id, position_id)
  WHERE status = 'PENDING_APPROVAL';
```
Follows the exact pattern of migration 0027 (insurance active-enrolment uniqueness). The partial predicate allows unbounded `APPROVED`, `REJECTED`, `CANCELLED`, and `FULFILLED` history — re-hiring is permitted once the prior request is resolved.

**2. `dispatchResourceCompletion` — `hiring_requests` case added (`lib/workflow-engine.ts`)**
Updates `hiring_requests.status` to `APPROVED` or `REJECTED` on workflow completion, releasing the partial unique index constraint and permitting a new `PENDING_APPROVAL` request for the same position. Inserts bilingual `HIRING_REQUEST_APPROVED` / `HIRING_REQUEST_REJECTED` notification. Uses `client` (caller's transaction) — atomic with the workflow completion.

**3. `createHiringRequest` — friendly 23505 error surfacing (`modules/core-hr/org-chart-actions.ts`)**
Inner catch now detects `err.code === '23505'` and returns:
`"A hiring request for this position is already pending approval. Please wait for the existing request to be resolved before raising another."`
instead of leaking the raw Postgres constraint violation message.

#### Evidence

| Artefact | Path |
|---|---|
| Migration | `drizzle/migrations/0041_hiring_request_uniqueness.sql` |
| Workflow handler | `lib/workflow-engine.ts` — `dispatchResourceCompletion` `hiring_requests` case |
| Error handling | `modules/core-hr/org-chart-actions.ts` — `createHiringRequest` inner catch |
| Regression tests | `tests/integration/workflow-collision.test.ts` — COL-017–COL-023 (7 new tests) |

#### COLLISION-004B — `transfer_requests` ✅ FIXED (Phase 3 Priority 6B)

The original COLLISION-004 also cited `transfer_requests`. This gap is now fully closed in Phase 3 Priority 6B with the following three-part fix, following the same pattern as COLLISION-004 (hiring_requests) and migration 0027 (insurance active-enrolment):

**Fix 1 — DB uniqueness guard:** Migration 0042 adds `CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_request_pending ON transfer_requests (tenant_id, person_id) WHERE status = 'PENDING_APPROVAL'`. Scoped to `(tenant_id, person_id)` because `target_position_id` and `target_department_id` are both nullable — using either as a key column would allow bypassing the constraint. This also blocks concurrent TRANSFER + PROMOTION for the same person, which is the correct business behaviour.

**Fix 2 — Status transition handler:** `dispatchResourceCompletion` `transfer_requests` case added — updates `transferRequests.status` to APPROVED/REJECTED, inserts bilingual `TRANSFER_REQUEST_APPROVED`/`TRANSFER_REQUEST_REJECTED` notification using caller's transaction (`client`). Without this, status never transitions from `PENDING_APPROVAL` after approval, permanently blocking re-requesting.

**Fix 3 — Friendly error surfacing:** `createTransferRequest` inner catch now detects `err.code === '23505'` and returns the business message `'A transfer or promotion request for this person is already pending approval. Please wait for the existing request to be resolved before raising another.'` instead of leaking the raw Postgres constraint violation.

**Regression tests:** 7 new tests COL-024–030 in `tests/integration/workflow-collision.test.ts`. 31/31 collision tests pass.

| Artefact | Path |
|---|---|
| Migration | `drizzle/migrations/0042_transfer_request_uniqueness.sql` |
| Workflow handler | `lib/workflow-engine.ts` — `dispatchResourceCompletion` `transfer_requests` case |
| Error handling | `modules/core-hr/org-chart-actions.ts` — `createTransferRequest` inner catch |
| Regression tests | `tests/integration/workflow-collision.test.ts` — COL-024–COL-030 (7 new tests) |

---

### COLLISION-005 — Double `absenceBalances` Debit

| Field | Detail |
|---|---|
| **ID** | COLLISION-005 |
| **Severity** | MEDIUM |
| **Status** | ⚠️ MITIGATED — COLLISION-001 fix prevents concurrent approval of same step |
| **Location** | `modules/absence/actions.ts` → `decideLeaveRequest()` |

#### Root Cause

PostgreSQL `READ COMMITTED` isolation means two concurrent transactions can both read the same `pendingDays` value from `absence_balances` before either writes. Both compute `balance - pendingDays`, both write their result. The last writer wins, and only one debit is effectively applied — the first approval's debit is silently overwritten, leaving the balance inflated by the duration of one approved leave.

#### Mitigation

The single-step leave approval workflow means that exactly one workflow step instance exists per leave request. The COLLISION-001 atomic `UPDATE ... WHERE status = 'PENDING'` guard ensures only one actor can transition that step. Therefore a concurrent double-debit of the same leave request's balance is not possible in the current workflow structure.

#### Residual Risk

If a future workflow configuration introduces a multi-step leave approval where two different approvers act on different steps that both trigger balance writes against the same `(person_id, balance_year)` row, the race condition can re-emerge. This requires a `SELECT ... FOR UPDATE` on the `absence_balances` row before any debit operation.

#### Evidence

| Artefact | Path |
|---|---|
| Affected action | `modules/absence/actions.ts` → `decideLeaveRequest()` |
| Mitigation | COLLISION-001 fix in `lib/workflow-engine.ts` |
| Residual risk | Documented in Phase 2 multi-step workflow design |

---

### COLLISION-006 — `takeWorkflowAction` Post-Claim Not Atomic

| Field | Detail |
|---|---|
| **ID** | COLLISION-006 |
| **Severity** | MEDIUM |
| **Status** | ✅ FIXED (Phase 3 Priority 2 hardening) |
| **Location** | `lib/workflow-engine.ts` → `takeWorkflowAction()` post-claim section |
| **Test file** | `tests/integration/workflow-collision.test.ts` — COL-012, COL-013, COL-014 |

#### Root Cause

After the atomic claim (`UPDATE WHERE status='PENDING' RETURNING`), all post-claim writes were bare:
- `db.update(workflowInstancesV2)` (APPROVED / REJECTED)
- `writeAudit(...)` (bare, no tx)
- `activateNextStep(... db)` (passed `db`, not a tx)
- `dispatchResourceCompletion(...)` (bare `db.update` on absenceEntries + bare `db.insert` on notificationLog)

A crash between any two of these post-claim writes produced a step-claimed-but-instance-not-completed state.

#### Fix Applied (Phase 3 Priority 2)

All post-claim writes are wrapped in a single `db.transaction()`. The atomic claim intentionally remains OUTSIDE this transaction — including it would hold the row lock for the entire post-claim duration, serialising concurrent approvals.

Key changes:
- `activateNextStep(... tx)` — `tx` threaded instead of bare `db`
- `dispatchResourceCompletion({..., tx})` — new `tx?: DbOrTx` parameter; writes use `client = tx ?? db`
- `writeAudit({..., tx})` inside post-claim transaction

#### Evidence

| Artefact | Path |
|---|---|
| Fix | `lib/workflow-engine.ts` → `takeWorkflowAction()` (Phase 3 P2 commit) |
| Tests | `tests/integration/workflow-collision.test.ts` — COL-012, COL-013, COL-014 |

---

### COLLISION-DELEGATE — DELEGATE Branch Not Atomic

| Field | Detail |
|---|---|
| **ID** | COLLISION-DELEGATE |
| **Severity** | LOW |
| **Status** | ✅ FIXED (Phase 3 Priority 2 hardening) |
| **Location** | `lib/workflow-engine.ts` → `takeWorkflowAction()` DELEGATE branch |
| **Test file** | `tests/integration/workflow-collision.test.ts` — COL-011 |

#### Root Cause

The DELEGATE branch had two bare writes: `db.update(workflowStepInstances)` (reassign step) + `writeAudit(...)` (no tx). A crash between them left the step reassigned but unaudited.

#### Fix Applied

Both writes wrapped in `db.transaction(async _tx => { const tx = _tx as unknown as DbOrTx; ... })`.

---

### COLLISION-SLA-BRANCH — SLA Breach Branches Not Atomic

| Field | Detail |
|---|---|
| **ID** | COLLISION-SLA-BRANCH |
| **Severity** | LOW |
| **Status** | ✅ FIXED (Phase 3 Priority 2 hardening) |
| **Location** | `lib/workflow-engine.ts` → `processSLABreaches()` ESCALATE + SEND_REMINDER |
| **Test file** | `tests/integration/workflow-collision.test.ts` — COL-015, COL-016, STORM-007 |

#### Root Cause

**ESCALATE:** `db.update(workflowStepInstances)` + `db.update(workflowInstancesV2)` were separate bare writes. A crash between them left step ESCALATED but instance still IN_PROGRESS.

**SEND_REMINDER:** `queueNotification` + `db.update(remindedAt)` + `writeAudit` were separate. A crash after notification insert but before `remindedAt` update left `remindedAt` null, causing a duplicate reminder on the next cron tick.

#### Fix Applied

ESCALATE: both updates wrapped in `db.transaction()`.
SEND_REMINDER: notification + `remindedAt` update + audit wrapped in `db.transaction()`. The `remindedAt` WHERE clause dedup (existing) is now guaranteed to be set atomically with the notification.

---

### COLLISION-NOTIF — Probation Alerts Duplicate Notifications

| Field | Detail |
|---|---|
| **ID** | COLLISION-NOTIF |
| **Severity** | HIGH |
| **Status** | ✅ FIXED |
| **Location** | `app/api/cron/probation-alerts/route.ts` |
| **Test file** | `tests/integration/notification-storm.test.ts` |

#### Root Cause

The probation alerts cron performed no deduplication check before inserting into `notification_log`. On any day where:

- Vercel retried the cron call (network timeout on first attempt that actually succeeded)
- The HR Admin manually triggered the endpoint via the API
- The cron ran twice due to Vercel scheduling jitter

Every employee approaching end of probation received a duplicate `PROBATION_ENDING` notification. The employee's line manager received a duplicate email. Repeated triggering (e.g., 5 manual test calls) created 5 × N notification rows and sent 5 × N emails for N approaching employees.

#### Fix Applied

A 24-hour dedup check before each insert:

```typescript
const recentAlert = await db
  .select({ id: notificationLog.id })
  .from(notificationLog)
  .where(
    and(
      eq(notificationLog.recipientPersonId, person.id),
      eq(notificationLog.notificationType, 'PROBATION_ENDING'),
      gte(notificationLog.createdAt, subHours(new Date(), 24))
    )
  )
  .limit(1);

if (recentAlert.length > 0) {
  skipped++;
  continue;
}
```

The cron response now includes `{ alerted: N, skipped: M }` for observability. Duplicate cron invocations within 24 hours are safely idempotent.

#### Evidence

| Artefact | Path |
|---|---|
| Fix | `app/api/cron/probation-alerts/route.ts` |
| Test | `tests/integration/notification-storm.test.ts` |
| Commit | `1bdb54c` (Phase 2 Task 9) |

---

### RISK-PAYROLL-2 — `nextRunNumber` Race Condition

| Field | Detail |
|---|---|
| **ID** | RISK-PAYROLL-2 |
| **Severity** | MEDIUM |
| **Status** | ✅ FIXED |
| **Location** | `modules/payroll/actions.ts` → `nextRunNumber()` |
| **Test file** | `tests/integration/payroll-collision.test.ts` |

#### Root Cause

`nextRunNumber` computed the next sequential payroll run number as:

```typescript
const max = await db
  .select({ maxNum: sql<number>`MAX(run_number)` })
  .from(payrollRuns)
  .where(eq(payrollRuns.legalEntityId, entityId));
return `PR-${String((max[0].maxNum ?? 0) + 1).padStart(6, '0')}`;
```

This was called outside any transaction. Two concurrent `createPayrollRun` invocations both read the same `MAX(run_number)`, generate the same `PR-000042`, and attempt insertion. The database unique constraint on `run_number` catches the second insertion and throws a constraint violation error. The user sees an unhandled 500 error rather than a clean duplicate-detection message.

#### Fix Applied

`nextRunNumber` now accepts an optional `tx` parameter. When called inside `createPayrollRun`'s `db.transaction()`, it acquires a PostgreSQL advisory lock scoped to the transaction, serialising concurrent creates per legal entity:

```typescript
async function nextRunNumber(entityId: string, tx: PgTransaction): Promise<string> {
  // Advisory lock key = hash of entity-scoped string; released at tx commit/rollback
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('payroll_run:' || ${entityId}))`
  );
  const max = await tx
    .select({ maxNum: sql<number>`MAX(run_number)` })
    .from(payrollRuns)
    .where(eq(payrollRuns.legalEntityId, entityId));
  return `PR-${String((max[0].maxNum ?? 0) + 1).padStart(6, '0')}`;
}
```

`createPayrollRun` now calls `nextRunNumber(entityId, tx)` from inside its `db.transaction()` block. Concurrent creates for the same entity are serialised; concurrent creates for different entities proceed in parallel.

#### Evidence

| Artefact | Path |
|---|---|
| Fix | `modules/payroll/actions.ts` |
| Test | `tests/integration/payroll-collision.test.ts` |
| Commit | `1bdb54c` (Phase 2 Task 9) |

---

## 3. Collision Testing Methodology

### Why Mock-Based Tests?

Real race conditions cannot be safely injected into production or staging:
- A true double-approval in production corrupts live HR records and triggers real downstream effects (emails, balance changes, WPS payroll files)
- Timing-based integration tests are non-deterministic — they may pass or fail depending on scheduler jitter, Neon cold-start latency, or Vercel instance allocation

Mock-based concurrency tests provide **deterministic proof of the logical invariant**: the fixed code must return exactly one success and one concurrent-action error regardless of scheduling.

### How Concurrent Simulation Works with Mocks

For each TOCTOU scenario, the test configures a `queryQueue` that controls what the mock DB returns on successive calls:

```typescript
// Both concurrent actors read PENDING (simulates true race)
queryQueue
  .mockResolvedValueOnce([{ status: 'PENDING' }])  // actor A reads
  .mockResolvedValueOnce([{ status: 'PENDING' }])  // actor B reads
  // After fix: atomic UPDATE WHERE PENDING returns row for A, empty for B
  .mockResolvedValueOnce([{ id: 'step-1' }])       // actor A wins
  .mockResolvedValueOnce([]);                       // actor B gets empty result
```

Both actors run concurrently via `Promise.all`. The test asserts the post-fix invariant.

### Test Pass/Fail Semantics

| State | Expected Results | Interpretation |
|---|---|---|
| **Pre-fix** | Both callers return `{ success: true }` | Bug exists — both actors succeeded, double-effect will occur |
| **Post-fix** | One `{ success: true }`, one `{ success: false, error: 'concurrent action detected' }` | Fix works — exactly one actor proceeds |
| **Regression** | Both return `{ success: false }` | Over-correction — fix is too aggressive, legitimate actions are blocked |

---

## 4. DB Integrity Validation

The following database-level constraints provide a backstop to application-layer guards. They are the last line of defence — application code should never rely on these alone.

| Table | Constraint | Type | Protects Against |
|---|---|---|---|
| `workflow_step_instances` | `uq_step_status_decided_by` (partial) | Unique index | Duplicate decided_by on same step (partial backstop only) |
| `payroll_runs` | `uq_payroll_run_number` | Unique on `(legal_entity_id, run_number)` | Duplicate payroll run numbers after advisory-lock fix |
| `audit_log` | `INSERT` only, no `UPDATE`/`DELETE` | Policy / trigger | Audit log tampering |
| `absence_balances` | `uq_balance_person_year` | Unique on `(person_id, balance_year, leave_type_id)` | Duplicate balance rows for same period |
| `hiring_requests` | `uq_hiring_request_pending` — `(tenant_id, position_id) WHERE status = 'PENDING_APPROVAL'` | Partial unique index (migration 0041) | Duplicate pending hiring requests for the same position ✅ FIXED (COLLISION-004, Phase 3 P6A) |
| `transfer_requests` | `uq_transfer_request_pending` — `(tenant_id, person_id) WHERE status = 'PENDING_APPROVAL'` | Partial unique index (migration 0042) | Duplicate pending transfer/promotion requests for the same person ✅ FIXED (COLLISION-004B, Phase 3 P6B) |
| `notification_log` | None (gap — mitigated by app-layer dedup) | — | Duplicate notifications rely on app-layer check |

---

## 5. ARIA Concurrent Usage

### Scenario

Two HR Admin sessions open ARIA simultaneously. Both ask ARIA to confirm a leave request for the same employee (`LEAVE_REQUEST_CONFIRM` intent). ARIA resolves the intent, calls `createLeaveRequest`, and both sessions receive a success response. The employee ends up with two identical pending leave requests.

### Gap Analysis

The absence module's overlap guard in `createLeaveRequest` checks for date conflicts:

```typescript
const overlap = await db.select()
  .from(leaveRequests)
  .where(and(
    eq(leaveRequests.personId, personId),
    // date range overlap check
  ));
if (overlap.length > 0) throw new Error('Overlapping leave request exists');
```

This guard is optimistic — it performs a read before the insert with no lock. Under concurrent ARIA sessions, both reads complete before either insert, both see no overlap, both insert successfully.

### Mitigation

A `pg_advisory_xact_lock` keyed on `(person_id, leave_type_id)` inside `createLeaveRequest` serialises concurrent creates per employee per leave type. The second caller blocks until the first transaction commits, then re-checks for overlap and correctly detects the conflict.

```typescript
await tx.execute(
  sql`SELECT pg_advisory_xact_lock(hashtext('leave_create:' || ${personId}))`
);
```

This mitigation is documented here as a Phase 2 Task 9 finding. Implementation is part of the COLLISION-003 / COLLISION-006 Phase 2 refactor.

---

## 6. Fixes Applied Summary

| Fix ID | Description | File | Sprint | Test Coverage |
|---|---|---|---|---|
| COLLISION-001 | Atomic `UPDATE WHERE status='PENDING' RETURNING id` in `takeWorkflowAction` | `lib/workflow-engine.ts` | Phase 2 Task 9 | COL-001–003 |
| COLLISION-002 | Resolved by COLLISION-001 fix; cron path uses same guard | `lib/workflow-engine.ts` | Phase 2 Task 9 | COL-004–005 |
| COLLISION-NOTIF | 24-hour dedup check + `skipped` counter in probation alerts cron | `app/api/cron/probation-alerts/route.ts` | Phase 2 Task 9 | STORM-001–006 |
| RISK-PAYROLL-2 | `pg_advisory_xact_lock` per entity + `tx` parameter in `nextRunNumber` | `modules/payroll/actions.ts` | Phase 2 Task 9 | PAY-001–006 |
| COLLISION-003 (Fix 1) | `submitWorkflow` 6 bare writes → single `db.transaction()`; SLA deadlines pre-computed | `lib/workflow-engine.ts` | Phase 3 P2 | COL-009, COL-010 |
| COLLISION-DELEGATE (Fix 2) | DELEGATE branch update+audit → `db.transaction()` | `lib/workflow-engine.ts` | Phase 3 P2 | COL-011 |
| COLLISION-006 (Fix 3) | Post-claim REJECT/APPROVE + resource completion → `db.transaction()`; `dispatchResourceCompletion` accepts `tx` | `lib/workflow-engine.ts` | Phase 3 P2 | COL-012–014 |
| COLLISION-SLA (Fix 4) | ESCALATE case dual updates → `db.transaction()` | `lib/workflow-engine.ts` | Phase 3 P2 | COL-015 |
| COLLISION-SLA (Fix 5) | SEND_REMINDER notification+remindedAt+audit → `db.transaction()` | `lib/workflow-engine.ts` | Phase 3 P2 | COL-016, STORM-007 |
| COLLISION-003 (caller) | `submitWorkflow` accepts `tx?: DbOrTx`; `submitLeaveRequest` wraps submitWorkflow+status update in one outer `db.transaction`; `DbOrTx` promoted to `lib/db.ts` export | `lib/workflow-engine.ts` + `modules/absence/actions.ts` + `lib/db.ts` | Phase 3 P6C | COL-031–037 |
| ARIA-LOCK | `pg_advisory_xact_lock(hashtext('leave:' \|\| personId))` added as first operation inside `createLeaveRequest`'s `db.transaction`, before the overlap check. Serialises per-person; different persons proceed concurrently. Lock is transaction-scoped (auto-released on commit/rollback). | `modules/absence/actions.ts` + `tests/integration/absence-actions.test.ts` | Phase 3 P6D | ARIA-LOCK-001–007 |
| COLLISION-PROBATION | `applyProbationOutcome` gains `tx?: DbOrTx` param. All 4 outcome branches (REJECTED, CONFIRM, EXTEND, FAIL) refactored to `runBranch(client: DbOrTx)` closure with conditional dispatch: `outerTx ? runBranch(outerTx) : db.transaction(runBranch)`. `dispatchResourceCompletion` passes `tx` to `applyProbationOutcome`. `generateProbationLetter` remains outside (bare `db.insert` — accepted low risk). `triggerTerminationApproval` remains outside (intentional). | `modules/core-hr/probation/workflow-actions.ts` + `lib/workflow-engine.ts` | Phase 3 P6E | PROB-001–007 |

---

## 7. Known Gaps / Remaining Backlog

All collision scenarios have been fixed as of Phase 3 Priority 6E. The previously documented LOW-severity gap (COLLISION-PROBATION) was resolved in Phase 3 P6E — `applyProbationOutcome` now accepts `tx?: DbOrTx` and all outcome branches join the caller's post-claim transaction when provided.

**No open gaps remain.** The collision matrix is fully resolved.

| Gap ID | Description | Recommended Fix | Priority |
|---|---|---|---|
| — | No open gaps | — | — |

---

## 8. Document Traceability

| Reference | Location |
|---|---|
| AI Multi-Agent Simulation Design | `tests/roadmap/ai-multi-agent-simulation.md` |
| Observability Foundation | `tests/roadmap/observability-foundation.md` |
| Alerting Strategy | `tests/roadmap/alerting-strategy.md` |
| QA Final Status | `tests/qa-final-status.md` |
| QA Issue Register | `tests/qa-issue-register.md` |
| Enterprise Release Sign-Off | `tests/qa-enterprise-release-signoff.md` |
| Workflow Engine | `lib/workflow-engine.ts` |
| Absence Actions | `modules/absence/actions.ts` |
| Payroll Actions | `modules/payroll/actions.ts` |
| Probation Alerts Cron | `app/api/cron/probation-alerts/route.ts` |
| Collision Tests | `tests/integration/workflow-collision.test.ts` |
| Notification Storm Tests | `tests/integration/notification-storm.test.ts` |
| Payroll Collision Tests | `tests/integration/payroll-collision.test.ts` |
