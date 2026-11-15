# ED-2D-3 Future-Bounded Retro Split

## Approved Scope

ED-2D-3 supports one enterprise timeline case:

- A worker has a materialized current assignment row already bounded by an approved future assignment.
- HR applies a retroactive or current-dated correction inside the bounded current period.
- The current period is split without changing the approved future row.

No payroll recalculation, leave balance recalculation, same-day sequencing, or additional future-row creation is included in this scope.

## Timeline Contract

Before:

| Row | Date Range | Status | is_current | action_mode |
| --- | --- | --- | --- | --- |
| A | S to F-1 | ACTIVE | true | UPDATE |
| F | F to 9999-12-31 | ACTIVE | false | FUTURE_DATED |

After:

| Row | Date Range | Status | is_current | action_mode |
| --- | --- | --- | --- | --- |
| A | S to D-1 | ACTIVE | false | unchanged |
| R | D to F-1 | ACTIVE | true | RETRO_SPLIT |
| F | F to 9999-12-31 | ACTIVE | false | FUTURE_DATED |

The future row is preserved unchanged. The replacement row is the current materialized row until the future row becomes effective or is cancelled.

## Timeline Invariants

- Exactly one active worker assignment row may be current after recomputation.
- Active assignment rows must not overlap.
- Inactive future rows are retained for audit and ignored by active as-of resolution.
- `RETRO_SPLIT` is a persisted generated row mode, not a caller-selectable `changeAssignmentTx` mode.
- The worker-assignment current pointer is recomputed after timeline mutation instead of relying on branch-local `is_current` assumptions.
- Timeline mutations are serialized with a per-person transaction advisory lock.

## Rejection Rules

The operation must reject:

- `D <= S`
- `D >= F`
- future-effective retro split dates
- missing future boundary
- inactive future boundary
- multiple active future boundaries
- same-day sequence scenarios that require `effective_sequence > 1`

## Cancellation After Split

If future row F is cancelled after the split:

| Row | Date Range | Status | is_current |
| --- | --- | --- | --- |
| A | S to D-1 | ACTIVE | false |
| R | D to 9999-12-31 | ACTIVE | true |
| F | F to 9999-12-31 | INACTIVE | false |

Cancellation must retain F for audit, repair R to the sentinel end date, recompute the worker-assignment current pointer, restore denormalized person pointers, and keep duplicate-current and active-overlap counts at zero.

## Out Of Scope

- Payroll retro calculation
- Leave balance redesign or accrual recalculation
- Phase 2D-4 or Phase 2D-5
- Same-day multi-sequence DateTrack support
- Multiple pending future assignment rows for the same worker
- Editing or replacing the future row through this operation

## Downstream Warning

The operation records downstream impact metadata when salary elements, leave plan enrolments, or payroll assignments intersect the rewritten assignment period. This is warning metadata only. It does not recalculate salary, payroll, leave balances, accruals, or payroll assignments.

Payroll and leave streams must treat this metadata as an input signal for later retro processing design.

## UAT Requirements

UAT replay must prove:

- A/R/F timeline creation from a real transfer or promotion path.
- Pending Changes still shows F after the split.
- As-of resolution returns A before D, R from D to F-1, and F from F.
- Future cancellation repairs R to 9999-12-31 and marks F inactive.
- Duplicate-current groups remain zero.
- Active overlaps remain zero.
- Workflow apply-back remains compatible with transfer and promotion.
- Audit metadata includes current-pointer recomputation and downstream impact warning counts.

## ED-2D-3C Certification Outcome

Certification date: 2026-06-11

Result: PASS

Phase 2D-3 status: CLOSED

Certified worker:

| Field | Value |
| --- | --- |
| Employee | K1035 / Arunprasanth Kathavarayan |
| Person ID | 5b1595bd-e375-45be-9a4f-defcd2da2262 |
| Retro/current split date D | 2026-06-11 |
| Future boundary F | 2026-07-26 |

Certified timeline before future cancellation:

| Row | Assignment | Date Range | Status | is_current | action_mode |
| --- | --- | --- | --- | --- | --- |
| A | WA-0000321 | 2024-10-04 to 2026-06-10 | ACTIVE | false | UPDATE |
| R | WA-0000751 | 2026-06-11 to 2026-07-25 | ACTIVE | true | RETRO_SPLIT |
| F | WA-0000741 | 2026-07-26 to 9999-12-31 | ACTIVE | false | FUTURE_DATED |

Certified timeline after future cancellation:

| Row | Assignment | Date Range | Status | is_current | action_mode |
| --- | --- | --- | --- | --- | --- |
| A | WA-0000321 | 2024-10-04 to 2026-06-10 | ACTIVE | false | UPDATE |
| R | WA-0000751 | 2026-06-11 to 9999-12-31 | ACTIVE | true | RETRO_SPLIT |
| F | WA-0000741 | 2026-07-26 to 9999-12-31 | INACTIVE | false | FUTURE_DATED |

Certification matrix:

| Category | Result |
| --- | --- |
| Timeline | PASS |
| Workflow | PASS |
| Cancellation | PASS |
| Pending Changes | PASS |
| Reporting and as-of reads | PASS |
| Audit | PASS |
| Payroll impact warning | PASS |
| Leave impact warning | PASS |
| Failure paths | PASS |
| Invariants | PASS |
| Regression | PASS |

Certification evidence:

- Duplicate-current groups: 0
- Active overlaps: 0
- Matured active `FUTURE_DATED` rows: 0
- Date-order violations: 0
- Active overlap constraint: present and excludes `INACTIVE` rows
- Current-pointer recomputation: replacement row R is current after split and after cancellation repair
- Pending Changes: future row F visible after split and removed after cancellation
- Downstream impact metadata: salary element count 1, payroll assignment count 1, leave plan enrolment count 1
- Audit events: future creation, workflow submission, workflow approval, retro split, and cancellation were captured
- Regression: `pnpm typecheck` passed; targeted effective-dating and workflow routing Vitest suites passed

Temporary execution artifacts:

- `/private/tmp/ed-2d-3c-certification.ts` was a disposable UAT certification runner and is not part of the durable regression suite.
- `/private/tmp/ed-2d-3c-resume.ts` was a disposable resume runner with hard-coded UAT evidence row IDs and is not part of the durable regression suite.

Future reusable regression coverage belongs in the repo test suites, especially `tests/unit/worker-assignment-future-bounded-retro-split.test.ts`, `tests/unit/worker-assignment-future-cancel.test.ts`, `tests/unit/pending-changes-asof-read.test.ts`, and `tests/integration/employment-actions.test.ts`.
