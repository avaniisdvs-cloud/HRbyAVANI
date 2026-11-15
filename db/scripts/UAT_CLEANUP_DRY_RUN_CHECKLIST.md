# UAT Cleanup — Manual Dry-Run Checklist (Neon Branch)

> **Documentation only.** This guide is for YOU to run manually in the Neon Console.
> Claude has NOT executed any SQL and will not. No DB changes have been made.
>
> Scripts referenced:
> - `db/scripts/CLEANUP_UAT_BUSINESS_DATA.sql`
> - `db/scripts/VERIFY_UAT_CLEANUP.sql`

---

## ⛔ READ THIS FIRST — DO NOT RUN AGAINST PRIMARY / LIVE

- The live database (the one serving **http://localhost:3001**) is the **primary** Neon database — typically the branch named **`main`** or **`production`**.
- **NEVER run CLEANUP against primary**, not even as a dry run. A dry run still opens a real DELETE/UPDATE transaction.
- This entire procedure must run on a **throwaway Neon branch** created from primary. The branch is a copy-on-write clone — anything you do there is isolated and disposable.
- Before running, **double-check the branch selector** in the SQL Editor reads your new UAT branch name — NOT `main` / `production`.
- If you are ever unsure which branch is selected: **stop and re-check.** Do not run.

---

## 1. Create the Neon branch

1. Open **Neon Console** → select your **AVANIIS HR project**.
2. Left sidebar → **Branches** → **Create branch** (a.k.a. "New branch").
3. Settings:
   - **Branch name:** `uat-pre-cleanup-2026-06-03` (use today's date so it's obvious & disposable).
   - **Parent / source branch:** your primary branch (`main` or `production`) — so the branch is a full copy of live data.
   - **Include data up to:** "Now" / latest (default).
4. Click **Create branch**. Wait for status **Ready** (a few seconds — copy-on-write is instant).

> This branch is your rollback safety net. If anything ever went wrong on a real run, you simply discard the branch. For a dry run with `ROLLBACK;` nothing persists anyway.

---

## 2. Select the branch in the Neon SQL Editor

1. Left sidebar → **SQL Editor**.
2. At the **top of the editor**, find the **branch dropdown** (and the database/role dropdowns next to it).
3. Set the **branch dropdown** to **`uat-pre-cleanup-2026-06-03`**.
   - ✅ Confirm it does **NOT** say `main` or `production`.
4. Set **Database** to the application DB (usually `neondb`) and **Role** to the owner role.

> 🔁 Sanity check before running anything — paste and run this one line first:
> ```sql
> SELECT current_database(), (SELECT count(*) FROM legal_entities) AS entities;
> ```
> You should see ~5 entities (the pre-cleanup baseline you already captured). This confirms you're on a data-bearing branch.

---

## 3. Run CLEANUP as a DRY RUN (replace `COMMIT;` with `ROLLBACK;`)

1. Open `db/scripts/CLEANUP_UAT_BUSINESS_DATA.sql` and copy its **entire contents** into the SQL Editor.
2. Scroll to the **very bottom**. You will see:
   ```sql
   COMMIT;
   -- ROLLBACK;   -- <- uncomment (and comment COMMIT) for a dry run
   ```
3. Change it to:
   ```sql
   -- COMMIT;
   ROLLBACK;
   ```
   (Comment out `COMMIT;`, uncomment `ROLLBACK;`.)
4. Leave everything else exactly as-is — including the `BEGIN;` at the top and the `\set ON_ERROR_STOP on` line (the Neon editor ignores the `\set`; harmless).
5. Click **Run**.

> Because the transaction ends in `ROLLBACK;`, **nothing is persisted** — but every `SELECT` count block still prints its results to the editor. That's what you capture.

> If the run errors out partway (e.g. an unexpected FK), the whole transaction auto-rolls back — the DB is still untouched. Note the error text and paste it back; do not retry blindly.

---

## 4. Output / counts to capture

The script prints **three labelled result sets**. Capture **all three in full**:

| Result set | Label column value | What it shows |
|---|---|---|
| A | `phase = 'BEFORE'` | Row counts of the delete-set tables **before** deletion (your baseline). |
| B | `phase = 'AFTER'`  | Row counts **after** the (about-to-be-rolled-back) deletes — expect **0** for all delete-set tables, except the preserved Super-Admin person/account rows. |
| C | `phase = 'PRESERVED'` | Counts of AVN-001, Super-Admin accounts/persons, grades, grade_salary_ranges, and config tables — all must stay **> 0**. |

Also capture, if shown:
- Any **NOTICE** messages (e.g. "GUARDS PASSED…", or "% SUPER_ADMIN accounts found").
- Any **error** message (there should be none on a clean branch).

> Tip: in the Neon editor, each `SELECT` renders as a separate grid. Use the export / copy-as-CSV (or just screenshot each grid) so nothing is truncated.

---

## 5. Prove the rollback occurred

After the dry run finishes, run these **read-only** checks **in the same editor / same branch**. If `ROLLBACK` worked, the data is exactly as it was before:

```sql
-- (a) Business data is STILL THERE (rollback undid the deletes):
SELECT 'post-rollback re-count' AS check,
       (SELECT count(*) FROM persons)            AS persons,
       (SELECT count(*) FROM worker_assignments) AS worker_assignments,
       (SELECT count(*) FROM legal_entities)     AS legal_entities,
       (SELECT count(*) FROM audit_log)          AS audit_log;
```
Expected: these match your **BEFORE** counts (≈ the same non-zero numbers) — proving the deletes were rolled back, not persisted.

```sql
-- (b) AVN-001 name was NOT permanently changed (rollback undid the UPDATE too):
SELECT name_en FROM legal_entities WHERE entity_code = 'AVN-001';
```
Expected: still the **old/misspelled** value `AVANIIS Property Developement LLC` — confirming the Phase 10 name fix was also rolled back.

> If (a) shows the original non-zero counts and (b) still shows the old name, **rollback is proven.** If instead counts are 0 / the name is corrected, the transaction COMMITTED by mistake — discard the branch immediately and tell me.

---

## 6. What to paste back here for validation

Paste these, as text or screenshots:

1. The **BEFORE** result set (full).
2. The **AFTER** result set (full).
3. The **PRESERVED** result set (full).
4. Any **NOTICE** / error messages from the run.
5. The **post-rollback re-count** from step 5(a).
6. The **AVN-001 name** from step 5(b).
7. Confirmation of the **branch name** you ran on (so I can verify it wasn't primary).

I'll then validate:
- BEFORE → AFTER shows the intended tables going to 0 (deletes correct & complete),
- PRESERVED stayed intact (platform + AVN-001 + Super-Admins survived),
- the post-rollback re-count proves nothing persisted,
- and give a PASS/FAIL readiness verdict for a real (`COMMIT`) run.

---

## 7. ⚠️ Explicit warning (repeat)

> **DO NOT run `CLEANUP_UAT_BUSINESS_DATA.sql` against the primary / live database under any circumstances** — not even as a dry run.
> Only run it on the disposable Neon branch created in Step 1, with the branch selector verified in Step 2.
> When in doubt about which branch is selected, **stop and re-check** before clicking Run.

---

### Optional next step (after a clean dry run)
Once the dry-run results validate, the real run is identical except you keep `COMMIT;` (and skip the `ROLLBACK;`), still **on a fresh branch**. Then run `VERIFY_UAT_CLEANUP.sql` and expect check **#8 OVERALL → PASS**. Paste those results back too.
