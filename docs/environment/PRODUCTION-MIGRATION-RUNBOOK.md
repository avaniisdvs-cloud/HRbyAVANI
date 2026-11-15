# Production Migration Runbook & Readiness Pack

> **Status: PREPARED / REHEARSAL-READY.** Production migration execution remains **PENDING** approval, backup, clone rehearsal, apply, verification, and sign-off.
> **This document and the preflight script DO NOT apply any migration.** Migrations **0062–0067** (and any later pending) are **NOT applied to production** by this task. No cloud DB was written.

Preflight (read-only, local): `node scripts/migration-preflight.mjs` — lists migrations, flags `_wip_`, checks numbering gaps + ledger consistency. Makes no DB connection.

## 0. Context (verified)
- Journal covers `0000–0039`; **`0040+` are manual SQL** applied via Neon SQL Editor (human-gated).
- `_wip_` migrations (`0055_wip_…`, `0056_wip_…`, `0057_wip_…`, `0060_wip_…`) are **do-not-apply** to production until audited/reissued.
- **Duplicate-numbered files exist** (`0052_document_file_data` + `0052_person_profile_photo_data`; `0055_payroll_run_number_per_entity` + `0055_wip_step_instance_columns`) — the runbook MUST specify exact filenames and apply order, not numbers alone.
- Production ledger SSOT: `docs/environment/migration-ledger.production.md` (0062–0065 = `pending`).

## 1. Production migration execution checklist (per window)
1. [ ] CAB change record approved; window scheduled; rollback owner on call.
2. [ ] DBA/Data Owner approval recorded for the exact ordered file list.
3. [ ] **Backup taken** (§2) and restore-tested on the clone (§5).
4. [ ] **Clone rehearsal** completed and verified (§5).
5. [ ] Apply migrations in **exact filename order** (not number), `_wip_` excluded.
6. [ ] Run **verification queries** (§4) after EACH migration; stop on first failure.
7. [ ] Update ledger: `applied` → (after checks) `verified`, with timestamp + operator.
8. [ ] Smoke the affected routes; confirm no 5xx; confirm app health endpoint OK.
9. [ ] Record evidence (query outputs) on the CAB record.

## 2. Backup-before-migration checklist
- [ ] Full logical backup (`pg_dump`) of the production DB to secure storage.
- [ ] Note the Neon branch/restore point (PITR timestamp) immediately pre-window.
- [ ] Verify backup integrity (restore to throwaway target, row-count spot check).
- [ ] Record backup location + restore command in the CAB record.

## 3. Rollback plan
- **Additive migrations** (columns/tables/indexes — e.g. 0065 identity, 0066 gross-draft): rollback = drop the added objects (per each file's documented rollback posture) **after approval**.
- **Constraint/trigger migrations** (0063 effective-dating integrity, 0067 audit immutability): rollback = drop the constraint/trigger/function (per file header).
- **Data-affecting** (0059 backfill, any NULL→sentinel): rollback = **restore from backup/PITR**; do not hand-reverse data. Requires DBA + Data Owner sign-off.
- Decision rule: if any migration in the window mutates data, the window rollback is **restore-from-backup**, not partial drops.

## 4. Verification SQL/checklist (run after each migration)
Generic per migration:
- [ ] Object exists: `SELECT to_regclass('public.<table_or_view>') IS NOT NULL;`
- [ ] Column added: `SELECT count(*) FROM information_schema.columns WHERE table_name=$t AND column_name=$c;`
- [ ] Constraint/trigger present and enforcing (attempt a guarded negative test on a scratch row in a transaction that is **rolled back**).
- [ ] No unexpected row-count delta on touched tables vs pre-window snapshot.
- Migration-specific checks: copy the "Production Verification" cell for each row from `migration-ledger.production.md` (e.g. 0066 = table + 4 indexes incl. both partial predicates).

## 5. Production clone rehearsal checklist (MANDATORY before prod)
1. [ ] Create a clone/branch of production data (Neon branch or restored `pg_dump`).
2. [ ] Apply the full ordered window to the clone.
3. [ ] Run all §4 verification queries on the clone — all must pass.
4. [ ] Time the window; confirm acceptable downtime/at-risk duration.
5. [ ] Rehearse the rollback path on the clone.
6. [ ] Attach clone-rehearsal evidence to the CAB record.

## 6. Identity-uniqueness special case (0065)
- 0065 adds nullable hash columns + unique indexes. **Pre-flight on prod data required:** run duplicate-detection SELECTs and backfill hashes **before** creating the unique indexes, or index creation will fail on existing duplicates. DBA + Data Owner must approve any de-duplication.

## 7. DBA / Data Owner approval checklist
- [ ] Exact ordered file list reviewed.
- [ ] Data conversions identified (NULL→sentinel effective dates in 0063 lineage; 0059 backfill; 0065 hash backfill) and approved.
- [ ] Backup + restore-test confirmed.
- [ ] Verification + rollback plans approved.

## 8. CAB / Change Manager approval checklist
- [ ] Change record with window, risk, rollback, comms plan.
- [ ] Business + HR sign-off attached.
- [ ] Go/No-Go decision recorded; named approvers.

## 9. Hard statement
This runbook is **preparation only**. No migration has been applied to production. Production migration status remains **OPEN — pending production environment, approval, backup, rehearsal, apply, verification, and sign-off.**
