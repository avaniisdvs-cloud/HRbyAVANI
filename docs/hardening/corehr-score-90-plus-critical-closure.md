# CoreHR 90+ Hardening - Phase 1 Critical Closure

Date: 2026-06-13  
Branch: `hardening/corehr-score-90-plus`  
Baseline commit at branch start: `86cde0f2950ea0d881331be4fd0b4d94c793438b`  
Scope: CoreHR product hardening only. No payroll implementation, no production DB writes, no destructive actions.

## Executive Status

Phase 1 Critical items are closed or classified with evidence.

| Item | Status | Evidence | Residual risk |
| --- | --- | --- | --- |
| Typecheck blocker from `ImportWizard` missing `isAr` | Already fixed before Phase 1 edits | `app/(hr-admin)/migration/import-wizard/ImportWizard.tsx` passes `isAr` to `StepBar`; `pnpm typecheck` passes | None for this item |
| Generic employee edit bypasses effective-dated assignment lifecycle | Fixed | Backend guards in `modules/core-hr/actions.ts` and `modules/core-hr/edit-person.ts`; UI read-only assignment fields in `PersonEditForm.tsx` and `PersonEditDrawer.tsx`; tests added | Assignment change workflow UX remains a Phase 2/3 product enhancement |
| Migration ledger / 0065 status contradiction | Fixed as documentation governance only | `docs/environment/migration-ledger.test.md`, `docs/environment/migration-ledger.production.md`, `drizzle/migrations/0065_identity_uniqueness.sql` aligned | Live database state still depends on ledger discipline and environment isolation |
| DataOps protected HR write governance too permissive for structured editor | Fixed | `lib/dataops/write-guard.ts` now blocks structured writes to protected HR tables and allows only explicit safe table allowlist; security tests expanded | Allowlist must be reviewed when new non-HR admin tables need DataOps editing |

Estimated product score after Phase 1: 85/100. This is not yet a 90+ product because high-severity product gaps remain in runtime permission rollout, contract validation, compensation/work-schedule foundations, and effective-date UX.

## Baseline Evidence

Initial dirty worktree before hardening was intentionally preserved:

- Modified before work began: `app/(employee)/me/ProfilePageClient.tsx`
- Modified before work began: `app/(hr-admin)/persons/new/PersonNewForm.tsx`
- Untracked before work began: `docs/enterprise-review-bundle/*`

Baseline gates:

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed with existing warnings only |
| `pnpm vitest run tests/unit/as-of-query.test.ts tests/unit/worker-assignment-asof-service.test.ts tests/unit/edit-person-save.test.ts tests/unit/employee-history-report.test.ts tests/unit/workflow-self-approval-guard.test.ts tests/security/dataops-write-guard.test.ts tests/security/rate-limit.test.ts tests/security/permission-resolver.test.ts tests/security/mfa-enforcement.test.ts` | Passed: 9 files, 134 tests |

Environment safety check:

| Command | Result |
| --- | --- |
| `env \| rg '^(DATABASE_ENV\|ENV_GOVERNANCE_MODE\|NODE_ENV\|DOCUMENT_STORAGE_PROVIDER\|ENABLE_DEV_ACCOUNTS\|ALLOW_NON_PROD_CLOUD_DB_WRITE\|ALLOW_UAT_RELOAD_WRITE\|ALLOW_PRODUCTION_DB_WRITE\|ENABLE_MIGRATION_CONSOLE)='` | No matching exported environment variables |

## Critical Item 1 - Typecheck Blocker

Classification: Already fixed in the current branch state before Phase 1 changes.

Evidence:

- `app/(hr-admin)/migration/import-wizard/ImportWizard.tsx`
- `StepBar` requires `{ current, isAr }`
- The caller already renders `<StepBar current={step} isAr={isAr} />`
- `pnpm typecheck` passed both baseline and final gates

No code change was made for this item.

## Critical Item 2 - Employee Edit Bypasses Effective-Dated Lifecycle

Classification: Confirmed and fixed.

Problem:

Generic person edit flows allowed assignment-sensitive fields to be submitted as direct person updates. That could mutate current assignment snapshots without requiring an effective-dated lifecycle action or preserving assignment history.

Assignment-sensitive fields now guarded:

- `assignmentStatus`
- `currentDepartmentId`
- `currentPositionId`
- `currentJobId`
- `currentGradeId`
- `currentLocationId`
- `lineManagerId`
- `dottedLineManagerId`

Files changed:

- `modules/core-hr/validations.ts`
- `modules/core-hr/actions.ts`
- `modules/core-hr/edit-person.ts`
- `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx`
- `app/(hr-admin)/persons/_components/PersonEditDrawer.tsx`
- `tests/unit/core-hr-schemas.test.ts`
- `tests/unit/person-assignment-edit-guard.test.ts`

Controls added:

- Shared helper `getAssignmentSensitiveUpdateFields(input)` detects sensitive fields from raw input.
- `updatePerson` rejects generic updates containing assignment-sensitive fields before opening the transaction.
- `updatePersonFromEdit` returns a controlled error before opening the transaction.
- HR edit screen and drawer now keep assignment fields visible but disabled/read-only.
- Generic edit payload builders no longer send assignment-sensitive fields.

Targeted verification:

| Command | Result |
| --- | --- |
| `pnpm vitest run tests/unit/core-hr-schemas.test.ts tests/unit/person-assignment-edit-guard.test.ts tests/unit/edit-person-save.test.ts` | Passed: 3 files, 89 tests |
| `pnpm typecheck` | Passed |

Residual note:

This hardening prevents unsafe direct mutation. It does not introduce a new transfer/promotion/manager-change workflow; that remains a later product capability enhancement.

## Critical Item 3 - Migration Governance Contradiction

Classification: Confirmed and fixed as documentation governance. No migration was executed.

Problem:

Migration 0065 had conflicting status indicators:

- DEV/UAT ledger contained both a verified row and a pending row.
- Migration SQL header said `Status: NOT APPLIED`.
- Production ledger lacked an explicit future-production 0065 row.

Files changed:

- `docs/environment/migration-ledger.test.md`
- `docs/environment/migration-ledger.production.md`
- `drizzle/migrations/0065_identity_uniqueness.sql`

Controls added:

- Stale DEV/UAT 0065 pending row reclassified as `superseded`.
- DEV/UAT matrix now separates applied baseline, WIP do-not-apply files, pending verification, verified migrations, and future production status.
- Production ledger now includes explicit 0065 pending status.
- 0065 SQL header now states `LEDGER-CONTROLLED` and points readers to the migration ledgers.

Targeted verification:

| Command | Result |
| --- | --- |
| `rg "0065.*pending\|0065.*verified\|0065.*superseded\|WIP do-not-apply\|future production pending\|LEDGER-CONTROLLED" docs/environment drizzle/migrations/0065_identity_uniqueness.sql -n` | Expected ledger/header rows present |
| `pnpm vitest run tests/unit/migration-factory-blockers.test.ts tests/unit/migration-console.test.ts` | Passed: 2 files, 42 tests |

Residual note:

This closes the repository-level contradiction. It does not independently query Neon or mutate any database.

## Critical Item 4 - DataOps Protected HR Write Governance

Classification: Confirmed and fixed.

Problem:

The DataOps guard blocked raw SQL writes and deletes for protected HR tables, but the structured row editor still allowed non-PII, non-temporal inserts/updates unless a later route or schema rejected them. For a CoreHR production surface, protected HR tables should not be editable through generic DataOps row tooling.

Files changed:

- `lib/dataops/write-guard.ts`
- `tests/security/dataops-write-guard.test.ts`

Controls added:

- `STRUCTURED_WRITE_ALLOWLIST` limits structured DataOps writes to explicitly safe tables.
- Protected HR tables are read-only through structured DataOps inserts/updates/deletes.
- Non-allowlisted non-HR tables are blocked by default.
- Existing PII and temporal guards continue to run first so more specific control failures are preserved.

Current structured write allowlist:

- `lookup_values`
- `saved_queries`

Targeted verification:

| Command | Result |
| --- | --- |
| `pnpm vitest run tests/security/dataops-write-guard.test.ts` | Passed: 1 file, 25 tests |

Residual note:

Future DataOps editable tables should be added only through explicit product/security review.

## Final Regression Gate

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed with warnings only |
| `pnpm vitest run tests/unit/core-hr-schemas.test.ts tests/unit/person-assignment-edit-guard.test.ts tests/unit/edit-person-save.test.ts tests/unit/as-of-query.test.ts tests/unit/worker-assignment-asof-service.test.ts tests/unit/employee-history-report.test.ts tests/unit/workflow-self-approval-guard.test.ts tests/unit/migration-factory-blockers.test.ts tests/unit/migration-console.test.ts tests/security/dataops-write-guard.test.ts tests/security/rate-limit.test.ts tests/security/permission-resolver.test.ts tests/security/mfa-enforcement.test.ts` | Passed: 13 files, 215 tests |

Lint warning summary:

- Warnings remained in existing files for direct `<img>` and `<a>` usage.
- No lint errors were introduced.
- Payroll-related lint warnings were not changed because payroll implementation is out of scope for this CoreHR hardening pass.

## Diff Scope Notes

Intentional Phase 1 files:

- `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx`
- `app/(hr-admin)/persons/_components/PersonEditDrawer.tsx`
- `docs/environment/migration-ledger.production.md`
- `docs/environment/migration-ledger.test.md`
- `drizzle/migrations/0065_identity_uniqueness.sql`
- `lib/dataops/write-guard.ts`
- `modules/core-hr/actions.ts`
- `modules/core-hr/edit-person.ts`
- `modules/core-hr/validations.ts`
- `tests/security/dataops-write-guard.test.ts`
- `tests/unit/core-hr-schemas.test.ts`
- `tests/unit/person-assignment-edit-guard.test.ts`

Pre-existing or concurrent dirty files observed and not reverted:

- `app/(employee)/me/ProfilePageClient.tsx`
- `app/(employee)/me/directory/[id]/page.tsx`
- `app/(hr-admin)/persons/new/PersonNewForm.tsx`
- `app/(hr-admin)/reports/_dashboards/FinanceDashboard.tsx`
- `docs/enterprise-review-bundle/*`

## No-Impact Confirmations

- No payroll module was implemented or modified for payroll functionality.
- No production database command was run.
- No migration was applied.
- No destructive filesystem or git reset command was run.
- No secrets were printed or changed.
- Foundation records and ledgers were clarified only where needed for repository governance.
- The hardening changes are additive controls and UI lockouts around existing CoreHR behavior.

## Phase 2 Entry Criteria

Phase 2 can start from this point because:

- Critical item report is complete.
- Typecheck is green.
- Lint has no errors.
- Targeted security/unit regression suite is green.
- Critical write-path risks for generic assignment edits and DataOps protected HR tables are now blocked.

Recommended Phase 2 order:

1. Runtime permission rollout and route/action authorization coverage.
2. Contract date/state validation and lifecycle integrity.
3. Compensation and work schedule foundation hardening.
4. Effective-date UI visibility and history clarity.
5. Full test/build gate and updated score report.
