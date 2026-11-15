# Neon → Azure PostgreSQL Migration Runbook — Core HR

> **DBA + CAB gated. No migration is applied by this document.** Pairs with
> `docs/environment/PRODUCTION-MIGRATION-RUNBOOK.md` and the ledgers
> `migration-ledger.test.md` / `migration-ledger.production.md`.
> Read-only planning aid: `node scripts/migration-preflight.mjs`.

## 0. Pre-conditions / gates
- [ ] CAB approval pack reviewed; migration window scheduled
- [ ] DBA owner assigned; rollback owner assigned
- [ ] Azure PostgreSQL Flexible Server provisioned (version ≥ 16 to match Neon)
- [ ] Maintenance window + stakeholder comms agreed
- [ ] **Approval to apply** recorded (DBA + CAB) — required before any write

## 1. Backup steps (source = Neon DEV/UAT or prod-of-record)
- [ ] Record source SHA of app + ledger state
- [ ] `pg_dump` full logical backup: `pg_dump "$NEON_URL" -Fc -f neon_backup_<ts>.dump`
- [ ] Verify dump integrity: `pg_restore --list neon_backup_<ts>.dump | head`
- [ ] Store backup in secure, access-controlled location; record checksum
- [ ] Capture baseline **row counts** (Section 4) from source for later comparison

## 2. Restore / migration steps (target = Azure PostgreSQL)
- [ ] Create target DB + role; enforce `sslmode=require`; firewall to app subnet only
- [ ] Restore baseline: `pg_restore -d "$AZURE_URL" --no-owner --role=<app_role> neon_backup_<ts>.dump`
- [ ] Apply manual-SQL migrations in order per ledger (journal covers 0000–0039;
      0040+ are manual SQL applied via SQL editor — do **not** rely on
      `drizzle-kit migrate` beyond 0039)
- [ ] **WIP migrations `0055/0056/0057/0060` are do-not-apply** (flagged by preflight)
- [ ] Apply `0067` only per Section 7 decision
- [ ] Record each apply in `migration-ledger.production.md` (status → applied)

## 3. Validation steps
- [ ] `to_regclass()` presence checks for key tables (persons, positions,
      assignments, absence_entries, workflow_*, audit_log, document tables)
- [ ] Index + constraint presence (effective-dating 0063/0064, identity 0065)
- [ ] App connects with prod `DATABASE_URL`; `/api/health/db` → 200
- [ ] `pnpm prod:preflight` exit `0` against the Azure target config

## 4. Row-count checks (source vs target)
Run on both and compare (expect equality for migrated tables):
```sql
SELECT 'persons' t, count(*) FROM persons
UNION ALL SELECT 'positions', count(*) FROM positions
UNION ALL SELECT 'worker_assignments', count(*) FROM worker_assignments
UNION ALL SELECT 'absence_entries', count(*) FROM absence_entries
UNION ALL SELECT 'workflow_instances', count(*) FROM workflow_instances
UNION ALL SELECT 'audit_log', count(*) FROM audit_log;
```
- [ ] Counts match source baseline (or deltas explained + approved)

## 5. Key Core HR validation checks
- [ ] Sample person record decrypts PII correctly (encryption key parity)
- [ ] Org chart renders; reporting chains resolve
- [ ] A leave balance reads correctly (incl. a cross-year case — 648b20d behavior)
- [ ] An approval/workflow instance is queryable; audit trail intact
- [ ] Separated-worker login blocked (auth guard present)
- [ ] No payroll tables required for Core HR operation (payroll gated off)

## 6. Rollback plan
- [ ] If validation fails: stop; do not point production app at the target
- [ ] Restore target from backup (or re-provision) before retry
- [ ] For an applied additive migration, use its documented rollback (e.g. drop
      added trigger/columns/indexes) — see each migration file header
- [ ] Keep Neon source intact until Azure target is signed off (no source mutation)
- [ ] Record rollback in change log + ledger

## 7. Migration `0067` decision / apply / verify
- **What:** `0067_workflow_audit_immutability.sql` — DB-level append-only trigger on
  `workflow_audit_log` (parity with `audit_log`/0005). Idempotent.
- **Current status:** file present in repo; **ledger `pending`; NOT applied.** App
  already enforces the INSERT-only invariant in code, so it is defence-in-depth.
- **Decision (record one):**
  - ☐ Apply during go-live window (recommended for audit parity), **or**
  - ☐ Schedule separately post-go-live (acceptable — app-level invariant holds)
- **Apply (only under DBA + CAB approval):** run the SQL via Azure SQL editor.
- **Verify:** `trg_workflow_audit_log_immutable` exists; an `UPDATE`/`DELETE` on
  `workflow_audit_log` raises `restrict_violation`; update ledger → verified.
- **Rollback:** drop trigger + function (see file header).

## 8. Approval gates
| Gate | Owner | Status |
|---|---|---|
| Backup taken + verified | DBA | ☐ |
| Rehearsal on clone passed | DBA | ☐ |
| Apply approved | DBA + CAB | ☐ |
| Post-apply verification passed | DBA | ☐ |
| Ledger updated (applied/verified) | DBA | ☐ |
