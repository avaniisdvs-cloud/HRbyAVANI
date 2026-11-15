# Employee History Report

**Created:** 2026-06-12 · **Status:** Implemented — committed `9390788`, in certified baseline `f524664` · **Navigation:** Reports → Employee History

## Purpose
HR-facing report that reconstructs a single employee's full effective-dated employment timeline — assignment periods (position, department, grade, manager, status) with effective start/end dates — built on the Phase 2 as-of/temporal read foundation. Primary consumer of the effective-dating remediation for auditors and HR admins verifying historical corrections, future-dated changes, and retro splits.

## Implementation
| Layer | Path |
|---|---|
| Page (HR Admin workspace) | `app/(hr-admin)/reports/employee-history/page.tsx` |
| Server logic | `modules/reports/employee-history.ts` |
| Unit tests | `tests/unit/employee-history-report.test.ts` (8 tests, green 2026-06-12) |
| Navigation entries | `config/workspace-nav.ts` + `config/admin-nav.ts` (both files must stay in sync) |

## Access control
Server action follows the standard pattern: `auth()` + role gate (HR roles; entity-scoped for HR_ADMIN, cross-entity for HR_DIRECTOR/SUPER_ADMIN), read-only — no DB writes.

## Data semantics
- Rows come from `worker_assignments` ordered by `effective_start_date`; INACTIVE (cancelled future) rows are shown flagged for audit context, not as part of the active timeline.
- Open-ended periods display the sentinel `9999-12-31` as "Present".
- Historical master-data labels resolve via the MDM history readers (`lib/mdm-history.ts`, Phase 2B-5) so renamed departments/grades show their name as of the period.

## Related documents
- `docs/effective-dating/00-EFFECTIVE-DATING-IMPLEMENTATION.md`
- `docs/effective-dating/ed-2d-3-future-bounded-retro-split.md` (certification uses this report as reporting evidence)
