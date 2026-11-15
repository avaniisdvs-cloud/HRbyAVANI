# Migration Factory — Incident Record: Workflow v2 Seed Skipped

> **Date:** 2026-06-05
> **Severity:** High (all leave submissions blocked on the affected database)
> **Status:** Resolved
> **Affected database:** Neon production (`ep-empty-boat-***`, `eu-central-1 / neondb`)
> **Trigger case:** Employee `s.khan@avaniis.example` (person K952) could not submit Annual Leave.

---

## Symptom

When a logged-in employee submitted an Annual Leave request, the app returned the generic, non-actionable error:

> *"Action could not be completed. An error occurred in the Server Components render. The specific message is omitted in production builds…"*

No business-friendly message was shown. The leave request remained a DRAFT (e.g. `LR-0000001`); it never reached PENDING.

## Actual cause

The **workflow engine v2 configuration was missing** from the affected database — `workflow_definitions_v2` had **0 rows**. Leave submission (`submitLeaveRequest` → `submitWorkflow('WF_ANNUAL_LEAVE')`) requires an active approval workflow to build the approval chain. With no definition found, the engine returned `No active workflow found for code: WF_ANNUAL_LEAVE` (`lib/workflow-engine.ts:499`), which `modules/absence/actions.ts:639` re-threw as `Workflow engine error: …`. The `catch` then called `translateError()` (`modules/absence/actions.ts:833`), which always re-throws (`lib/app-error.ts:585`); in production Next.js sanitised that thrown server-action error into the opaque "Server Components render" message — hiding the real cause.

The root reason the table was empty: the workflow seed (`drizzle/seed-workflow-v2.ts`) was **never run against this database**. Schema migrations and the employee data migration (persons, assignments, balances) had loaded fine, but workflow config — which the employee migration does **not** produce — was skipped.

## Misleading hypothesis (disproven)

The first hypothesis was a **missing / uninitialized leave balance** (`BALANCE_NOT_INITIALIZED`, `modules/absence/actions.ts:690`). This was **disproven by direct read-only inspection** of the database:

- s.khan **has** an active user account, person record (K952), and a current ACTIVE assignment with a line manager (K1207, Dorababu Kethari — active MANAGER).
- s.khan **has** a 2026 Annual Leave balance row (`closing_balance_days = 21.29`, `requires_balance = true`).

Balance was never the problem. The investigation then traced the failure to the empty `workflow_definitions_v2` table.

## Fix applied

Ran the **existing, idempotent** workflow seed against the affected Neon database:

```bash
npx tsx drizzle/seed-workflow-v2.ts
```

Result: 7 workflow rules, **12 workflow definitions** (incl. `WF_ANNUAL_LEAVE`), and their steps seeded. `WF_ANNUAL_LEAVE` now active with steps `LM_APPROVAL` (Line Manager, 48h) → `HOD_APPROVAL` (Head of Dept, 24h). No application code changed, no schema changed, no employee data touched, no balances modified.

## Lesson

**Workflow engine configuration is mandatory platform setup and is separate from the employee data migration.** It must be seeded — and verified — on **every** target database (UAT branch and production) *after* schema migrations and *before* employee migration / leave testing. This is now enforced as gate **G** in `08-migration-readiness-checklist.md` and as an explicit ordered step (step 5) in `07-production-cutover-and-rollback-strategy.md` §3.

## Canonical migration order (post-incident)

1. Apply schema migrations
2. **`npx tsx drizzle/seed-workflow-v2.ts`** ← the step that was skipped (verify per gate G)
3. **Insert the workflow system-actor person row** `22222222-2222-2222-2222-222222222222` (verify per gate G) — see addendum below
4. Reference/config seeds (absence types, etc.)
5. Employee data migration (persons, assignments, balances)
6. Leave-testing smoke check — submit Annual Leave end-to-end **AND approve through a multi-step chain** (confirms the Step 1 → Step 2 advance, the path that fails when step 3 above is skipped)

---

## Addendum (2026-06-05) — Second missing platform row: the workflow system actor

**Symptom:** After the workflow seed (above) was applied and single-step approval was certified, a **multi-step** Annual Leave workflow (Line Manager → HR Admin → CEO) failed **when the line manager approved** — error on `INSERT INTO workflow_audit_log … TOKEN_ISSUED …`.

**Actual cause:** The workflow engine stamps every *automatic* action (advancing to the next approver, SLA auto-approve/escalate, reminders) with a fixed **system identity** — person `22222222-2222-2222-2222-222222222222` ("AVANIIS Workflow Engine"). `workflow_audit_log.actor_person_id` has a foreign key to `persons.id`, and that row did not exist on the migrated DB → FK violation. The engine treats this actor as *virtual* (it resolves the name without a DB read), but the audit FK still requires the row to exist.

**Why it passed certification yet broke later:** A **single-step** workflow never advances to a next step, so the system-actor audit path is never exercised. Certification used a single-step config; the failure appeared only after the workflow was reconfigured to **multiple steps**. Same class of gap as the workflow seed — a platform-setup row not produced by the employee migration, invisible until a specific path runs.

**Fix applied:** Inserted one system-actor person row (flagged `is_system_user = true`, `exclude_from_headcount = true`, `is_active = false` so it never appears in directory/headcount/payroll) via the Neon SQL Editor. No application code changed, no schema changed, no employee data or balances touched.

**Related code fix (separate, deployed):** the bell vs. Approvals-menu notification inconsistency — approving via the Approvals menu (`takeWorkflowAction`) did not clear the approver's in-app notification, while the bell path did. `takeWorkflowAction()` now marks the acting approver's notification `ACTIONED` atomically with the decision, so the notification status matches the decision regardless of entry point.

**Lesson:** "Platform setup" includes **both** the workflow config seed **and** the system-actor person row. Both must exist and be verified on every target DB before employee migration / leave testing, and the smoke test must include a **multi-step** approval advance — a single-step test does not exercise the system-actor path. Enforced as gate **G** checks 6–7 in `08-migration-readiness-checklist.md`.
