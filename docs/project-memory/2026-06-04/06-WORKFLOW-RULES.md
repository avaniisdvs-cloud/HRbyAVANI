# 06 — WORKFLOW RULES

> Last updated: 2026-06-04
> Sources: lib/workflow-engine.ts, drizzle/schema/workflow-engine.ts, drizzle/schema/transactions.ts, drizzle/schema/configuration.ts, drizzle/schema/actions.ts

---

## Workflow Engine Architecture

| Dimension | Detail |
|---|---|
| Location | `lib/workflow-engine.ts` (primary engine) |
| Pattern | Configurable approval chains stored in `workflow_definitions_v2` + `workflow_steps_v2` tables |
| Runtime state | `workflow_instances_v2` + `workflow_step_instances` |
| Actions (canonical) | **APPROVE, REJECT, DELEGATE** — these 3 only. No other action is valid at a decision point. |
| SLA escalation | Cron job at `/api/cron/workflow-sla` (Vercel: 09:00 UTC daily). Actions: ESCALATE, AUTO_APPROVE, AUTO_REJECT, SEND_REMINDER, BLOCK_FREEZE |
| Notifications | Postgres outbox pattern via `notification_log` table + `lib/jobs/process-driver.ts` cron poller |
| Hierarchy resolution | `lib/workflow-hierarchy.ts` — resolves LINE_MANAGER, POSITION, CUSTOM_GROUP approver chains |
| Rules evaluation | `lib/workflow-rules.ts` — AND/OR condition tree evaluation |
| SLA calculation | `lib/workflow-sla.ts` — UAE working hours-aware deadline computation |
| Atomicity | **All workflow mutations wrapped in `db.transaction`** — collision-hardened 2026-05-24 |

### Key Schema Tables

| Table | Purpose |
|---|---|
| `workflow_definitions_v2` | Workflow templates (one per process type) |
| `workflow_steps_v2` | Step definitions within a workflow — order, approver type, SLA, conditions |
| `workflow_rules` | Condition rules for step evaluation |
| `workflow_sla_calendars` | UAE working-hours calendar for SLA deadline computation |
| `approval_groups` / `approval_group_members` | Custom approver groups (CUSTOM_GROUP type) |
| `workflow_instances_v2` | Live approval instance per submitted request |
| `workflow_step_instances` | Per-step runtime state (WAITING/PENDING/APPROVED/REJECTED/etc.) |
| `workflow_audit_log` | Immutable record of every decision taken |
| `workflow_email_tokens` | Email-link approval tokens (one-click approve/reject via email) |
| `workflow_delegation_rules` | Permanent delegation rules (different from per-instance DELEGATE action) |
| `workflow_notification_queue` | Outbound notification queue for workflow events |

### Legacy Tables (still present, workflow-engine v1)

| Table | Status |
|---|---|
| `workflow_definitions` (configuration.ts) | V1 — still referenced by some older code paths |
| `workflow_stages` (configuration.ts) | V1 |
| `workflow_routing_rules` (configuration.ts) | V1 |
| `workflow_instances` (transactions.ts) | V1 — has `currentDelegateePersonId` for per-instance delegation |
| `approval_delegations` (transactions.ts) | V1 temporary approval authority transfer |

---

## Workflow Types (resource types)

The `dispatchResourceCompletion` function in `lib/workflow-engine.ts` handles completion for these resource types:

| Resource Type | Table Updated on Approval | Uniqueness Constraint | Notes |
|---|---|---|---|
| `absence_entry` / `leave_requests` | `absence_entries.status` → APPROVED/REJECTED | None (advisory lock per person) | pg_advisory_xact_lock serialises per-person to prevent overlap race |
| `hiring_requests` | `hiring_requests.status` → APPROVED/REJECTED/FULFILLED | `uq_hiring_request_pending` (migration 0041) — only 1 PENDING_APPROVAL per position | COLLISION-004 fix |
| `transfer_requests` | `transfer_requests.status` → APPROVED/REJECTED/CANCELLED | `uq_transfer_request_pending` (migration 0042) — only 1 PENDING_APPROVAL per person | COLLISION-004B fix |
| `probation_review` | `probation_reviews.status` → CONFIRM/EXTEND/FAIL/REJECTED | None | COLLISION-PROBATION fix: tx? DbOrTx param |
| `insurance_enrollments` | `medical_insurance_enrolments.status` | None | |

The `resourceType` and `resourceId` columns on `workflow_instances_v2` link the workflow to the business record.

---

## State Transitions

### Leave Requests (`absence_entries`)

```
DRAFT
  ↓ (submitWorkflow)
PENDING_APPROVAL
  ↓ (APPROVE)       ↓ (REJECT)
APPROVED          REJECTED
  ↓ (employee withdraws)
CANCELLED
```

Backdating check runs before `db.transaction` — if `startDate < today`, `resolveBackdatePolicy` is called. No policy row = BLOCKED (safe default).

### Hiring Requests

```
PENDING_APPROVAL (max 1 per position via partial unique index)
  ↓ APPROVE → APPROVED → FULFILLED (when hired)
  ↓ REJECT  → REJECTED
  ↓ Cancel  → CANCELLED
```

### Transfer Requests

```
PENDING_APPROVAL (max 1 per person via partial unique index)
  ↓ APPROVE → APPROVED
  ↓ REJECT  → REJECTED
  ↓ Cancel  → CANCELLED
```

### Probation Reviews

```
PENDING
  ↓ HR decision:
CONFIRM   (employment confirmed)
EXTEND    (probation period extended)
FAIL      (triggers termination workflow)
REJECTED  (review rejected without action)
```

### Workflow Step Instances

```
WAITING → PENDING → APPROVED
                  → REJECTED
                  → DELEGATED (step reassigned; does not advance workflow)
                  → ESCALATED (SLA breach)
                  → SKIPPED   (conditional rule evaluation)
                  → AUTO_APPROVED (SLA auto-approve action)
                  → RECALLED
```

### Workflow Instances

```
PENDING → IN_PROGRESS → APPROVED
                      → REJECTED
                      → CANCELLED
                      → ESCALATED
                      → ON_HOLD
                      → RECALLED
```

---

## Collision Hardening Applied (all FIXED as of 2026-05-24)

All collision vulnerabilities have been resolved. Status verified in `tests/roadmap/collision-matrix.md` v6.0.

| Collision | Fix | Location |
|---|---|---|
| COLLISION-001: double-approval race | Atomic `UPDATE WHERE status='PENDING' RETURNING id` — empty return = concurrent race → safe error | `lib/workflow-engine.ts` `takeWorkflowAction` |
| COLLISION-002: SLA cron double-approve | Resolved automatically by COLLISION-001 fix (SLA AUTO_APPROVE uses `takeWorkflowAction`) | Same |
| COLLISION-003 engine: submitWorkflow multi-step bare inserts not atomic | Full `db.transaction` wrapping instance + steps + notification inserts + audit | `lib/workflow-engine.ts` `submitWorkflow` |
| COLLISION-003 caller: submitLeaveRequest + submitWorkflow in separate transactions | Single outer `db.transaction` wraps both; `submitWorkflow` accepts `tx?: DbOrTx` param | `modules/absence/actions.ts`, `lib/workflow-engine.ts` |
| COLLISION-004: hiring_requests duplicate pending | `uq_hiring_request_pending` partial unique index `(tenant_id, position_id) WHERE status = 'PENDING_APPROVAL'` | Migration 0041 |
| COLLISION-004B: transfer_requests duplicate pending | `uq_transfer_request_pending` partial unique index `(tenant_id, person_id) WHERE status = 'PENDING_APPROVAL'` | Migration 0042 |
| ARIA-LOCK: createLeaveRequest optimistic overlap guard | `pg_advisory_xact_lock(hashtext('leave:' || personId))` as first op inside `db.transaction`, before overlap check. Serialises per person; lock is tx-scoped. | `modules/absence/actions.ts` `createLeaveRequest` |
| COLLISION-DELEGATE: DELEGATE branch bare writes | `db.transaction` wraps step reassign + audit | `lib/workflow-engine.ts` |
| COLLISION-SLA-BRANCH ESCALATE: dual-write not atomic | `db.transaction` wraps step + instance writes | `lib/workflow-engine.ts` |
| COLLISION-SLA-BRANCH SEND_REMINDER: notification dedup | `db.transaction` wraps notification insert + `remindedAt` SET | `lib/workflow-engine.ts` |
| COLLISION-PROBATION: applyProbationOutcome owns its own tx | `tx?: DbOrTx` param; all 4 outcome branches refactored to `runBranch(client: DbOrTx)` closure with conditional dispatch | `modules/core-hr/probation/workflow-actions.ts` |
| COLLISION-NOTIF: probation alert duplicate notifications | 24h dedup check before insert; `skipped` counter in response | `app/api/cron/probation-alerts/route.ts` |
| RISK-PAYROLL-2: concurrent payroll run number collision | `pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))` inside `db.transaction` before MAX read | `modules/payroll/actions.ts` |

**Test coverage:** 52/52 collision tests pass (`tests/integration/workflow-collision.test.ts`).

---

## Business Invariants

1. **Every workflow decision must be exactly one of: APPROVE, REJECT, DELEGATE.** No other action is valid at a decision step. (MEMORY.md: "Workflow decisions must include Delegate" — Approve/Reject/Delegate is the canonical 3-button set.)

2. **DELEGATE reassigns the step but does NOT advance the workflow.** The delegate becomes the new authoritative approver for that step instance. The `workflow_instances_v2.currentDelegateePersonId` field is cleared after the next decision.

3. **SLA cron (`/api/cron/workflow-sla`) triggers AUTO_APPROVE or ESCALATE on deadline breach.** The breach action is configured per step in `workflow_steps_v2.slaBreachAction`. Valid: ESCALATE, AUTO_APPROVE, AUTO_REJECT, SEND_REMINDER, BLOCK_FREEZE.

4. **Resource completion (`dispatchResourceCompletion`) must join the post-claim transaction.** The function accepts an optional `tx?: DbOrTx` parameter — always pass the current transaction when calling from within a workflow action handler.

5. **The partial unique index prevents >1 PENDING_APPROVAL per position (hiring) or person (transfer).** When a 23505 unique constraint violation occurs, the application converts it to a user-friendly bilingual message — never let the raw Postgres error reach the UI.

6. **`submitWorkflow` accepts an optional outer transaction (`tx?: DbOrTx`).** When provided, all workflow writes join the caller's transaction. When omitted, `submitWorkflow` opens its own `db.transaction`. Pass `tx` from `createLeaveRequest` to make leave creation + workflow submission fully atomic.

7. **`applyProbationOutcome` accepts an optional outer transaction (`tx?: DbOrTx`).** The `runBranch(client: DbOrTx)` closure handles all 4 outcome branches (REJECTED, CONFIRM, EXTEND, FAIL) consistently. Note: `generateProbationLetter` and `triggerTerminationApproval` intentionally remain outside the transaction (accepted design decision).

8. **The `SYSTEM_ACTOR` UUID ('22222222-...') must reference a real `persons.id` row.** It is the actor for AUTO_APPROVE, escalation, and SLA actions. This row must exist in every environment (seeded via `test-mdm.ts`).

---

## Leave Workflow Specifics

### createLeaveRequest flow

1. `pg_advisory_xact_lock(hashtext('leave:' || personId))` — first thing inside `db.transaction`. Serialises per-person.
2. `loadPersonScope` — verify person exists, get entity, get leave balance
3. **Backdate policy check** (if `startDate < today`): call `resolveBackdatePolicy(employeeEntityId, absenceTypeId, daysBack)`. No policy row = BLOCKED. Throws BACKDATE_POLICY_MISSING if not found.
4. **Overlap check** — query `absence_entries` for any PENDING or APPROVED leave overlapping the requested period
5. Create `absence_entries` row (status: PENDING_APPROVAL)
6. Call `submitWorkflow({ ..., tx: outerTx })` — workflow joins the outer transaction
7. All 6 steps are in a single `db.transaction` — atomic

### Backdate Policy

- Table: `leave_backdate_policies` (configuration.ts)
- Unique on `(tenant_id, legal_entity_id, absence_type_id)`
- `backdatingEnabled = false` → BACKDATE_NOT_ALLOWED (bilingual EN · AR error)
- `backdateLimitDays` = 0 → BACKDATE_LIMIT_EXCEEDED immediately
- No policy row → BACKDATE_POLICY_MISSING (BLOCKED — safe default)
- Employee entity resolved from `persons.legalEntityId` — never from caller-supplied data (BDP-009)

---

## Notification Workflow

### Postgres Outbox Pattern

Notifications never block the main request. They flow through:

1. **Write**: `notification_log` row inserted (status: PENDING) inside the same `db.transaction` as the business write
2. **Poll**: `lib/jobs/process-driver.ts` — node-cron poller picks up PENDING rows, sends via SMTP/in-app
3. **Status update**: row updated to SENT or FAILED
4. **Retry**: FAILED rows retried on next poll cycle (at-least-once delivery)

### Notification Types

| Type | Channel | When |
|---|---|---|
| LEAVE_REQUEST_APPROVED | IN_APP + EMAIL | Leave approved by workflow |
| LEAVE_REQUEST_REJECTED | IN_APP + EMAIL | Leave rejected by workflow |
| WORKFLOW_STEP_ASSIGNED | IN_APP + EMAIL | New step assigned to approver |
| PROBATION_ENDING | IN_APP | 30/14/7 days before probation end |
| SYSTEM_ALERT | IN_APP | New SSO user, system events |
| HIRING_REQUEST_* | IN_APP + EMAIL | Hiring workflow state changes |
| TRANSFER_REQUEST_* | IN_APP + EMAIL | Transfer workflow state changes |

### SLA Cron Schedule

- **Vercel cron:** `/api/cron/workflow-sla` — runs at 09:00 UTC daily (`vercel.json`)
- **Probation alerts:** `/api/cron/probation-alerts` — 24h dedup prevents duplicate alerts on retry
- **Outbox poller:** `lib/jobs/process-driver.ts` — node-cron, continuous polling in background

---

## Adding a New Workflow for a New Resource Type

To add a workflow for a new resource type (e.g., `expense_claims`):

1. **Schema:** Add the resource table to the appropriate schema file with `status` column (PENDING_APPROVAL/APPROVED/REJECTED)
2. **Uniqueness:** Add a partial unique index `WHERE status = 'PENDING_APPROVAL'` if only one pending approval per entity makes sense (migration file)
3. **dispatchResourceCompletion:** Add a case for the new `resourceType` in `lib/workflow-engine.ts` `dispatchResourceCompletion` function — update status + send bilingual notification (pass `client` not `db`)
4. **Submit:** Call `submitWorkflow({ workflowCode: 'EXPENSE_CLAIM', resourceType: 'expense_claims', resourceId: ..., tx: outerTx })` from within the creation `db.transaction`
5. **UI:** Add APPROVE/REJECT/DELEGATE buttons in the approvals inbox
6. **Error handling:** Catch `23505` (unique constraint) and return friendly bilingual error message

Never call `submitWorkflow` outside of a `db.transaction` — the caller must always provide an outer `tx`.
