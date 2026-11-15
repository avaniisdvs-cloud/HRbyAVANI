# DEV/UAT Migration Ledger

Purpose: track manual SQL and guarded database changes against the current active DEV/UAT database.

Target rule: this ledger applies only when `DATABASE_ENV=test` or `DATABASE_ENV=uat`.

Current mode: `ENV_GOVERNANCE_MODE=single-dev-uat`. When future Production exists and `ENV_GOVERNANCE_MODE=uat-prod`, the target host must differ from `PROD_DATABASE_URL`.

## Status Legend

| Status | Meaning |
|---|---|
| `pending` | Approved for planning, not applied |
| `applied` | SQL executed, verification not complete |
| `verified` | Post-apply verification passed |
| `rolled_back` | Reverted through documented rollback posture |
| `superseded` | Replaced by a later migration or package |

## Ledger

| Migration | File | Status | Target | Applied At | Applied By | Precheck Evidence | Verification Evidence | Rollback Posture | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 0055 | `drizzle/migrations/0055_payroll_run_number_per_entity.sql` | pending | DEV/UAT | Not applied (per 2026-06-04 project-memory) | — | — | Not verified — requires read-only DB check (does index `uq_payroll_run_number_per_entity` exist? is global `payroll_runs_run_number_unique` dropped?) | Additive index swap; rollback documented in-file header | **PPCDA-01 L3.** Real (non-WIP) payroll migration: swaps `payroll_runs.run_number` global unique → composite `(tenant_id, legal_entity_id, run_number)`. ⚠ **Filename slot 0055 collides with the WIP `0055_wip_step_instance_columns.sql`** — this row is the authoritative owner of slot 0055; the WIP file must be renumbered by the Activation Board (note: 4 unit tests hardcode both filenames, so renaming requires coordinated test updates). 2026-06-04 docs (`03-CURRENT-STATE.md`, `04-DATABASE-MODEL.md`) list this file as "not applied to any environment". **Payroll-readiness gate:** verify+apply before any multi-entity payroll run (without it, two entities both minting `PR-000001` will throw 23505 on the global unique). |
| 0062 | `drizzle/migrations/0062_email_platform.sql` | applied | DEV/UAT | Before 2026-06-12 (exact time not recorded) | Not recorded — ledger backfilled | Not recorded | All 5 tables (email_provider_settings, email_sender_defaults, email_templates, email_messages, email_delivery_events) confirmed present via read-only check 2026-06-12 — see `docs/effective-dating/01-ED-CLOSURE-VERIFICATION-2026-06-12.md` §4 | Additive SQL; rollback by disabling email platform or dropping additive objects after approval | Status corrected 2026-06-12: was stale `pending` while tables existed live. Formal post-apply verification still required to reach `verified` |
| 0063 | `drizzle/migrations/0063_effective_dating_integrity.sql` | verified | DEV/UAT | See effective-dating activation report | Codex/UAT | Passed | Passed | Restore point / reload package posture | Core HR effective dating certified |
| 0064 | `drizzle/migrations/0064_worker_assignment_active_timeline.sql` | verified | DEV/UAT | See Phase 2D-3 evidence | Codex/UAT | Passed | Passed | Restore point / reload package posture | Phase 2D-3 certification prerequisite |
| 0065 | `drizzle/migrations/0065_identity_uniqueness.sql` | verified | DEV/UAT | 2026-06-12 | Activation Board (human-authorized) | REPORT_ONLY backfill: 71 persons, 0 EID/0 passport duplicate groups | Columns + 3 unique indexes confirmed live; 71 hashes backfilled; `IDENTITY_UNIQUENESS_ENFORCEMENT=true` set (local + Vercel prod env) | Additive — rollback = drop 3 unique indexes + 2 nullable columns | Foundation Stewardship P1-H4 (BR-ID-UNIQ-001). ⚠ Production *deployment* redeploy still required for the running app to read the new env var (was push-deployed before the var was added) |
| 0065 | `drizzle/migrations/0065_identity_uniqueness.sql` | superseded | DEV/UAT | - | - | Pre-flight duplicate report required (in-file instructions + `scripts/backfill-identity-hashes.mjs REPORT_ONLY=true`) | Superseded by verified row above | Additive (nullable columns + partial unique indexes); rollback = drop indexes/columns after approval | Stale pre-activation planning row retained for audit trail only. Authoritative DEV/UAT status is the verified 0065 row above. |
| 0067 | `drizzle/migrations/0067_workflow_audit_immutability.sql` | verified | DEV/UAT | Present in DEV/UAT (Neon); confirmed 2026-06-17 by read-only catalog probe — apply timing not recorded (ledger drift) | Read-only catalog probe (no write) | N/A — idempotent trigger/function; INSERT-only invariant already holds in app code | **Effect present in DEV/UAT (Neon), confirmed 2026-06-17 via read-only catalog probe:** `to_regclass('public.workflow_audit_log')` not null; `pg_proc` has `workflow_audit_log_immutable` (1); `pg_trigger` has `trg_workflow_audit_log_immutable` (1, non-internal); `pg_get_triggerdef` = `CREATE TRIGGER trg_workflow_audit_log_immutable BEFORE DELETE OR UPDATE ON public.workflow_audit_log FOR EACH ROW EXECUTE FUNCTION workflow_audit_log_immutable()`. **No migration apply was performed during this reconciliation — read-only verification only.** | Idempotent; rollback = drop trigger + function (see file header) | **Core HR hardening B3.** Status reconciled 2026-06-17: was stale `pending`; effect was already live in DEV/UAT. ⚠ Apply timing/author not recorded — DBA/Activation Board to confirm provenance. Future isolated Production apply remains pending (BLK-013). |

## Current DEV/UAT Migration Status Matrix

| Migration set | Current status | Meaning / action |
|---|---|---|
| 0000-0039 | applied | Tracked by `drizzle/migrations/meta/_journal.json`; these are the only migrations covered by `pnpm drizzle-kit migrate`. |
| 0040-0054 | applied | Historical manual foundation baseline. Do not re-apply without ledger review. |
| `0055_payroll_run_number_per_entity.sql` | pending (unverified) | **PPCDA-01 L3.** Real payroll migration (NOT WIP) — per-entity run-number uniqueness. Apply status unconfirmed; verify + apply before multi-entity payroll. Authoritative owner of slot 0055 (collides with the WIP file below — Board to renumber the WIP file + update the 4 tests that hardcode the names). See detailed row above. |
| `0055_wip_step_instance_columns.sql` | WIP do-not-apply | Work-in-progress migration; not approved for DEV/UAT apply until audited and ledgered. ⚠ Filename collides with the real `0055_payroll_run_number_per_entity.sql`; must be renumbered by the Activation Board. |
| `0056_wip_notification_queue_meta.sql` | WIP do-not-apply | Work-in-progress migration; not approved for DEV/UAT apply until audited and ledgered. |
| `0057_wip_audit_immutability.sql` | WIP do-not-apply | Work-in-progress migration; not approved for DEV/UAT apply until audited and ledgered. |
| `0060_wip_intelligence_view.sql` | WIP do-not-apply | Work-in-progress migration; not approved for DEV/UAT apply until audited and ledgered. |
| `0061_absence_type_requires_balance.sql` | pending verification | Apply status is not authoritative in this ledger. Do not rely on it or apply it until audited and ledgered. |
| 0062 | applied | Email platform objects exist in DEV/UAT; formal post-apply verification is still required before marking `verified`. |
| 0063 | verified | Effective-dating integrity constraints verified in DEV/UAT. |
| 0064 | verified | Worker-assignment active-timeline constraint verified in DEV/UAT. |
| 0065 | verified | Identity uniqueness verified in DEV/UAT. The stale pending row is marked `superseded`. |
| 0067 | verified | Core HR B3: `workflow_audit_log` append-only DB trigger (parity with `audit_log`/0005). **Effect present in DEV/UAT — reconciled 2026-06-17 from stale `pending` via read-only catalog probe (trigger + function confirmed live; no apply performed).** Future isolated Production apply remains pending (BLK-013). |
| Future isolated Production Environment | future production pending | Production status is tracked only in `docs/environment/migration-ledger.production.md`; do not infer production status from this DEV/UAT ledger. |

## Required Entry Format

For each new migration, add:

```text
Migration:
File:
Target DATABASE_ENV:
Target host evidence:
Precheck SQL:
Apply command or SQL editor evidence:
Verification SQL:
Rollback posture:
Human approval:
Result:
```

## Future Production Promotion Rule

No future Production migration may proceed unless the matching DEV/UAT ledger entry is `verified`.
