# Future Production Migration Ledger

Purpose: track manual SQL and approved database changes against the future Production database.

Current status: Production is not active yet. This ledger is prepared so Production can be introduced later without changing the repo guardrail model.

Target rule: this ledger applies only when `ENV_GOVERNANCE_MODE=uat-prod` and `DATABASE_ENV=production`. Reloads, Step 2 Clear, and Migration Factory destructive operations are not allowed in production.

## Status Legend

| Status | Meaning |
|---|---|
| `pending` | Approved for planning, not applied |
| `approved` | Human approval granted for production window |
| `applied` | SQL executed, verification not complete |
| `verified` | Post-apply verification passed |
| `rolled_back` | Reverted through documented rollback posture |
| `superseded` | Replaced by a later migration or package |

## Ledger

| Migration | File | Status | Target | Applied At | Applied By | Test/UAT Evidence | Production Verification | Rollback Posture | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 0062 | `drizzle/migrations/0062_email_platform.sql` | pending | Production | - | - | Required | Required after apply | Additive SQL; rollback by disabling email platform or dropping additive objects after approval | Must not apply until Email Platform release gate approves production |
| 0063 | `drizzle/migrations/0063_effective_dating_integrity.sql` | pending | Production | - | - | Test/UAT verified | Required before production sign-off | Restore from backup/branch point or approved corrective SQL | Production apply requires separate approval |
| 0064 | `drizzle/migrations/0064_worker_assignment_active_timeline.sql` | pending | Production | - | - | Test/UAT verified | Required before production sign-off | Restore from backup/branch point or approved corrective SQL | Production apply requires separate approval |
| 0065 | `drizzle/migrations/0065_identity_uniqueness.sql` | pending | Production | - | - | Test/UAT verified | Required before production sign-off | Additive — rollback = drop 3 unique indexes + 2 nullable columns after approval | Future isolated Production Environment only. Do not confuse this with the current Production Deployment, which serves the DEV/UAT database. |

## Current Future Production Migration Status Matrix

| Migration set | Current status | Meaning / action |
|---|---|---|
| 0062 | future production pending | Do not apply until future Production exists and Email Platform production readiness is approved. |
| 0063 | future production pending | Do not apply until future Production exists and a production migration window is approved. |
| 0064 | future production pending | Do not apply until future Production exists and a production migration window is approved. |
| 0065 | future production pending | Do not apply until future Production exists and identity-uniqueness prechecks/backfill are completed against that Production database. |
| WIP migrations | WIP do-not-apply | Any `_wip_` migration remains outside production scope until audited, renamed/reissued if needed, and ledgered. |

## Required Entry Format

For each production migration, add:

```text
Migration:
File:
Human approval:
Change window:
Production target evidence:
Test/UAT ledger link:
Precheck SQL:
Apply evidence:
Verification SQL:
Rollback posture:
Result:
```

## Production Rules

1. Production migrations are manual, approved operations after Production exists.
2. Production reloads are forbidden.
3. Migration Console must remain disabled.
4. Demo accounts must remain disabled.
5. Email live mode requires separate Email Platform production readiness approval.
