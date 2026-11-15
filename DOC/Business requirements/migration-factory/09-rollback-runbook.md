# Migration Factory — Rollback Runbook

> **Status:** Documentation only. Implementation remains 🔴 **NO-GO**.
> **Date:** 2026-06-01
> **Purpose:** Exact, executable steps to recover the **application** and/or the **database** if a migration goes wrong.
> **Golden rule:** Code rollback ≠ Database rollback. Identify which is damaged (see `07` §5 decision tree) and run the matching section.

---

## Pre-requisites (the restore points these steps depend on)

| Restore point | Where | Created by |
|---|---|---|
| Git tag (e.g. `pre-migration-factory`) | GitHub `origin` | This workstream (automatable) |
| Offline ZIP | `/Users/d.kethari/D_Drive/HRMS_Backups/zips/<TS>_pre-migration-backup.zip` | This workstream (automatable) |
| **Neon branch (DB)** | Neon Console → Branches | **USER (manual)** — without this, §B is impossible |

> If the Neon branch was never created, **there is no database rollback.** Do not start migration until it exists and §B has been tested.

---

## §A. Application-code rollback (data intact, app broken)

**Use when:** UI/API/logic broke but the database is fine.

1. Identify the recovery tag:
   ```bash
   git fetch --tags origin
   git tag --list | grep pre-migration
   ```
2. Restore code to the tag (choose one):
   - Soft inspect: `git checkout <tag>` (detached HEAD, verify), or
   - Branch reset (if main must move back): create a revert/rollback branch from the tag and open a PR.
3. Redeploy: trigger a Vercel deploy of the restored ref (or `vercel rollback` to the certified deployment in `04-baseline-certification.md` item 2).
4. **Offline fallback** (if git/GitHub unavailable): unzip the backup and restore:
   ```bash
   unzip "/Users/d.kethari/D_Drive/HRMS_Backups/zips/<TS>_pre-migration-backup.zip" -d <restore-dir>
   # node_modules included → no reinstall needed; re-add .env files (excluded from backup)
   ```
5. Validate: app boots, routes resolve, no regression (run §D checks).

**Estimated time:** 2–10 min (deploy revert) · ~15 min (offline unzip).

---

## §B. Database rollback (data corrupted) — MANUAL, Neon Console

**Use when:** production data was changed/corrupted. ⚠️ **This is the step that protects employee data. Requires Neon Console access — Claude Code cannot perform it.**

1. Neon Console → your project → **Branches**.
2. Locate the pre-migration branch/snapshot (point-in-time T0) recorded in `04-baseline-certification.md` item 3.
3. **Restore** the database to that branch:
   - Neon "Restore" (point-in-time) on the primary branch, **or**
   - Promote the pre-migration branch and re-point the app's `DATABASE_URL` to it (then redeploy).
4. Verify data integrity: row counts match the certified baseline (`04` items 9–12 — entities 5, users 14, persons 21, workflows 22, feature-permissions 13, or the agreed current values at T0).
5. Confirm the app reconnects and existing modules work (run §D).

> Do **not** run destructive SQL to "undo" a migration by hand. Use the Neon branch restore — it is atomic and proven.

**Estimated time:** minutes (Neon point-in-time restore) + redeploy if re-pointing.

---

## §C. Staging-only cleanup (no production writes — Phase 1)

**Use when:** only `migration_*` staging tables were written (Phase 1, D2). No production impact.

```sql
-- Connection via DATABASE_URL (never POSTGRES_URL). Read carefully before running.
-- Discard a single bad batch (preferred):
DELETE FROM migration_validation_issues WHERE batch_id = :batchId;
DELETE FROM migration_staging_rows     WHERE batch_id = :batchId;
DELETE FROM migration_batches          WHERE id       = :batchId;

-- OR full teardown of the staging namespace (additive, no inbound FKs from prod):
DROP TABLE IF EXISTS migration_promotion_runs;
DROP TABLE IF EXISTS migration_validation_issues;
DROP TABLE IF EXISTS migration_staging_rows;
DROP TABLE IF EXISTS migration_batches;
```
*(These tables do not exist yet — listed for the future build. No production table is affected.)*

---

## §D. Post-rollback validation (run after §A or §B)

4-role regression (Super Admin / HR Admin / Manager / Employee) over: Navigation · Org Chart · Leave · Documents · Approvals · Payroll · ARIA · existing imports.

- [ ] Sign-in works for each role.
- [ ] Navigation renders correctly (rail + secondary nav).
- [ ] Existing APIs respond (health: `GET /api/health`, `GET /api/health/db`).
- [ ] Data integrity: baseline counts restored.
- [ ] No 4xx/5xx regression on previously-working routes.

> The runnable form of this checklist is a C7 deliverable (Playwright role projects + seed). Until then this is a manual checklist.

---

## §E. Rollback dry-run (do this BEFORE migrating)

A rollback you have never tested is not a rollback.

1. Create a throwaway Neon branch from prod.
2. Make a trivial reversible change on that branch.
3. Execute §B against that branch and confirm restoration.
4. Record the result + timing in `08-migration-readiness-checklist.md` (F).

> Migration stays **NOT READY** until §E passes at least once.

---

## What this runbook does NOT do
- ❌ Does not itself run any migration, DROP, or restore — it documents the steps.
- ❌ Does not access Neon Console (§B/§E are manual user actions).
- ❌ Does not modify application code, schema, routes, APIs, nav, or permissions.
