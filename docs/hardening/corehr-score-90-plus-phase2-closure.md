# CoreHR 90+ Hardening - Phase 2 Closure

Date: 2026-06-13  
Branch: `hardening/corehr-score-90-plus`  
Scope: CoreHR product hardening only. No payroll implementation, no production DB writes, no migrations applied.

## Executive Status

Phase 2 high-severity hardening is complete for the selected CoreHR surfaces:

- Runtime feature-permission rollout for high-value CoreHR mutation paths.
- Contract lifecycle/date integrity guards.
- Work schedule assignment scope/date controls.
- Grade compensation-band authorization and validation controls.

Estimated CoreHR product capability score after Phase 2: 90/100.

This is a product-hardening estimate, not a production go-live certification. Remaining production-hardening work still includes broader E2E coverage, storage hardening, full environment isolation, and deeper UI regression testing.

## Phase 2 Fixes

| Area | Status | Evidence | Risk reduced |
| --- | --- | --- | --- |
| Runtime permission rollout | Closed for selected CoreHR high-value write paths | `modules/access/actions.ts`, `modules/core-hr/worker-assignments/actions.ts`, `modules/core-hr/contracts/actions.ts`, `modules/core-hr/employment-actions/actions.ts`, `modules/core-hr/bank-details/actions.ts`, `modules/core-hr/dependents/actions.ts`, `modules/core-hr/contacts/actions.ts`, `modules/core-hr/documents/actions.ts`, `modules/core-hr/work-schedule-assignment-actions.ts`, `tests/security/permission-resolver.test.ts` | Feature permissions are no longer merely UI metadata for these mutation paths |
| Contract lifecycle integrity | Closed | `modules/core-hr/contracts/actions.ts`, `lib/app-error.ts`, `tests/integration/contracts-actions.test.ts` | Blocks active overlapping contracts, contract-before-hire, invalid amendment windows, invalid correction windows, and termination before contract start |
| Work schedule assignment controls | Closed | `modules/core-hr/work-schedule-assignment-actions.ts`, `lib/app-error.ts`, `tests/unit/working-calendar.test.ts` | Blocks cross-entity schedule assignment, inactive/mismatched schedules, unsupported future-dated current rows, and unauthenticated history reads |
| Grade compensation-band controls | Closed | `app/(hr-admin)/master-data/grades/components/GradeActions.ts`, `tests/unit/grade-actions-hardening.test.ts` | Adds server-side role gates, HR Admin entity scoping, non-negative numeric salary-band validation |

## Verification

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed with warnings only |
| `pnpm vitest run tests/security/permission-resolver.test.ts tests/security/rbac-tests.test.ts tests/security/dataops-write-guard.test.ts tests/unit/core-hr-schemas.test.ts tests/unit/person-assignment-edit-guard.test.ts tests/unit/edit-person-save.test.ts tests/unit/working-calendar.test.ts tests/unit/grade-actions-hardening.test.ts tests/unit/as-of-query.test.ts tests/unit/worker-assignment-asof-service.test.ts tests/unit/employee-history-report.test.ts tests/unit/workflow-self-approval-guard.test.ts tests/unit/migration-factory-blockers.test.ts tests/unit/migration-console.test.ts tests/security/rate-limit.test.ts tests/security/permission-resolver.test.ts tests/security/mfa-enforcement.test.ts tests/integration/contracts-actions.test.ts tests/integration/bank-dependents-documents.test.ts tests/integration/employment-actions.test.ts` | Passed: 19 files, 393 tests |

Lint warnings remained pre-existing warning classes:

- Direct `<img>` usage in several UI components.
- Direct `<a>` navigation in a few pages.
- Payroll page lint warnings were not changed because payroll implementation is out of scope for this CoreHR hardening pass.

## No-Impact Confirmations

- No payroll feature was implemented.
- No database migration was created or applied.
- No production database command was run.
- No destructive command was run.
- No secrets were read, printed, or changed.
- Existing dirty/untracked enterprise review bundle files were preserved.

## Remaining Risks

| Risk | Why it remains | Suggested timing |
| --- | --- | --- |
| Full UI regression coverage | Source/unit/integration gates are green, but no browser E2E pass was run in this hardening phase | Before production hardening |
| Salary elements are payroll-owned | Salary elements exist in the repository, but payroll development is explicitly out of scope here | During payroll design, not CoreHR hardening |
| Work schedule future dating is blocked, not implemented | Future-dated work schedule writes are prevented from becoming bad current rows, but a full activation workflow is not built | Before using future schedule changes operationally |
| Feature-permission matrix still covers only EMPLOYEE / MANAGER / HR_ADMIN buckets | Existing architecture intentionally passes through HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE | Human governance decision before wider RBAC redesign |
| Production environment isolation/storage | Project docs still identify environment/storage blockers | Before production go-live |

## Current Recommendation

CoreHR is now strong enough to continue product build-out and prepare payroll design discovery.

Do not begin payroll development until the remaining payroll-specific design decisions are closed, especially salary element ownership, retroactivity/proration, finance handoff, and period-based as-of rules.

Safest next sequence:

1. Run full build and, if environment allows, role-based Playwright smoke tests.
2. Produce a final product capability scorecard from current code and docs.
3. Close production environment/storage blockers.
4. Begin payroll design workshops using the hardened CoreHR foundation as input, not as an assumed payroll module.
