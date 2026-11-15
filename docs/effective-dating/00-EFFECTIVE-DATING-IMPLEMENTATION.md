# Effective-Dating Implementation — Phases 1, 2A–2D (Design & Evidence Record)

**Status:** Phases 1, 2A–2D COMPLETE — merged to `main` in certified baseline `f524664` (2026-06-12) · **Date:** 2026-06-12
**Origin:** Remediation of `docs/project-memory/2026-06-04/19-EFFECTIVE-DATING-AUDIT.md` (audit score 45/100, 2026-06-06).
**Benchmark:** Oracle Fusion DateTrack (`…/20-ORACLE-FUSION-DATETRACK-REFERENCE.md`).
**Certification:** Phase 2D-3 certified PASS 11/11 — `docs/effective-dating/ed-2d-3-future-bounded-retro-split.md` (2026-06-11).

---

## Phase map

| Phase | Commit | Delivers | Key files |
|---|---|---|---|
| 1 (R2) | `a34b3bd` | DB integrity: sentinel `9999-12-31` backfill+defaults; date-order CHECKs; EXCLUDE-gist overlap prevention; partial-UNIQUE one-current; as-of indexes — 10 tables | `drizzle/migrations/0063_effective_dating_integrity.sql`, `drizzle/schema/foundation.ts` |
| 1 (R1) | `398ae2e` | Nightly auto-activation of matured future assignments (idempotent, error-firewalled, audited, CRON_SECRET-gated) | `lib/jobs/future-dated-activation.ts`, `app/api/cron/future-dated-activation/route.ts`, `vercel.json` |
| 2A | `68ccc84` | Shared as-of query engine: `resolveAsOfRow`/`getAsOfRow`, predicate `start <= asOf AND end >= asOf`, 10 table adapters | `lib/as-of-query.ts` |
| 2B-1…5 | `9d7494a` `fd80337` `b3803c4` `8f47bb4` `af71383` | As-of reads: worker assignments, workflow manager routing, leave plan enrolments, pending changes, historical MDM labels | `modules/core-hr/worker-assignments/services.ts`, `lib/workflow-routing.ts`, `lib/workflow-hierarchy.ts`, `modules/absence/leave-plan-enrolment-actions.ts`, `lib/mdm-history.ts` |
| 2C-1/2 | `ea02b65` `97d5445` | FUTURE_DATED mode (close predecessor at D-1, insert future row `isCurrent=false`); cancellation repair (predecessor re-extended to sentinel; cancelled row kept INACTIVE for audit) | `modules/core-hr/worker-assignments/services.ts` |
| 2D-1/2 | `def377d` `d4a986f` | Retro slice resolver; historical retro split — periods are SPLIT, never overwritten | same services.ts (`retroSplitAssignmentTx`) |
| 2D-3 | `236036f` | Future-bounded retro split + certification; migration `0064` excludes INACTIVE rows from active-timeline constraint/index; canonical as-of workflow routing | `drizzle/migrations/0064_worker_assignment_active_timeline.sql`, `lib/workflow-routing.ts` |

## Design invariants (enforced at DB level, not just application code)

1. **One current row** per `(tenant_id, person_id)` — partial UNIQUE `uq_*_one_current WHERE is_current = true`.
2. **No overlapping periods** — `EXCLUDE USING gist (tenant_id, business-key, daterange(start, end, '[]') WITH &&)`; worker_assignments variant excludes `assignment_status = 'INACTIVE'` (0064) so cancelled futures stay for audit without blocking the timeline.
3. **Date order** — CHECK `effective_start_date <= effective_end_date` (and `valid_from <= valid_to` on history tables).
4. **Open-ended = sentinel `9999-12-31`** (`EFFECTIVE_END_OF_TIME` in `lib/effective-date.ts`) — never NULL.
5. **History is never deleted** — corrections split periods (2D-2); CORRECTION in-place edit is restricted to HR_DIRECTOR/SUPER_ADMIN with mandatory note + before/after audit.
6. **Concurrency** — per-person advisory lock (`lockWorkerAssignmentTimelineTx`) wraps every timeline mutation; DB constraint violations are translated to user-safe messages (error firewall).

## Change modes (worker assignments)

| Mode | Behaviour | Who |
|---|---|---|
| UPDATE | Close current row at effective-date − 1; open new row to sentinel; recompute one-current pointer | HR roles |
| FUTURE_DATED | Effective date must be future; current row closed at D-1; future row inserted `isCurrent=false`; activated by nightly cron when matured | HR roles |
| CORRECTION | In-place fix, mandatory note, full before/after audit | HR_DIRECTOR / SUPER_ADMIN |
| RETRO SPLIT | Historical correction splits the affected slice; future-bounded variant preserves an approved future row's start boundary | HR roles (validated) |

## Test evidence (83 tests, 12 files, all green 2026-06-12)

`as-of-query` (11) · `effective-dating-sentinel` (7) · `effective-dating-error-firewall` (2) · `worker-assignment-future-bounded-retro-split` (12) · `worker-assignment-retro-split` (7) · `worker-assignment-future-cancel` (8) · `future-dated-activation` (6) · `future-dated-activation-behavior` (2) · `workflow-canonical-routing` (5) · `workflow-manager-asof` (5) · `pending-changes-asof-read` (10) · `employee-history-report` (8). Plus `worker-assignment-asof-service`, `worker-assignment-retro-slice-resolver`, `worker-assignment-future-dated`, `worker-assignment-active-timeline-constraint`, `leave-plan-enrolment-asof`, `tests/lib/effective-date.test.ts`, and Phase 2D-3 scenarios in `tests/integration/employment-actions.test.ts`.

## Deployment status

Migration apply status is tracked ONLY in `docs/environment/migration-ledger.test.md` (0063/0064 recorded `verified` for DEV/UAT) and `migration-ledger.production.md` (0063/0064 `pending` — production not active). Live-database verification is outside this document's scope.

## Deliberately deferred (open gaps — pending PO decisions Q20.2 / Q20.3 / Q20.5 in audit doc 19)

- **Retro payroll / arrears** for closed periods (payroll still reads current values; `retroPay` not computed).
- **Mid-period proration** (payroll applies full-period values).
- **As-of EOSB** (`modules/payroll/calculation-engine.ts` uses today + current basic salary).
- **Date-tracked absence balances** (`absence_balances` remains a single mutable row per person/type/year).
- **As-of org chart** (`lib/org-chart/build-tree.ts` joins `is_current = true` only).
- As-of UI date picker (backend engine ready; no front-end control yet).
