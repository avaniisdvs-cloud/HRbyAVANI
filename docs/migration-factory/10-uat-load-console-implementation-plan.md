# UAT Migration Load Console — Implementation Plan

> **Status:** PLAN ONLY. No code written, no DB writes. For approval before build.
> **Date:** 2026-06-02
> **Feature:** A Super-Admin-only, RBAC-gated, audited, **branch-only** UI to review → seed master data → upload → validate → confirm the UAT employee load.
> **Target runtime:** Neon branch `br-square-union-al2bxhr1` only (production hard-blocked).

---

## 0. Relationship to existing governance

- This is a **pragmatic, lighter** design than the full staging-table Migration Factory in docs 00–09. It does **not** use `migration_*` staging tables; it **reuses the existing bulk-import engine** (`modules/core-hr/bulk-import/`) for employees and **seeds master data** directly via a transactional, audited path.
- Building it **partially closes the C1–C7 conditions** for this scope (see §7).
- ⚠ **Freeze impact:** this lifts the design freeze (doc 05) for this scoped feature only. Proceeding to build = explicit acknowledgement that `config/workspace-nav.ts` and `NAVDEPTH-002` will change (deliberately, per C3).
- **Precedent:** the existing **DataOps console** (`/admin/dataops`, SUPER_ADMIN-only) is the exact pattern this mirrors.

---

## 1. User-facing flow (5 steps + 1 post-step)

A stepper at **`/admin/migration`**, visible only to SUPER_ADMIN:

| Step | Screen | Action | Write? |
|---|---|---|---|
| 0 | **Branch safety banner** | Shows target DB host + "BRANCH-SAFE ✅ / PRODUCTION-BLOCKED 🔴" | none |
| 1 | **Review master data** | Renders the planned BU / grade / locations / 6 depts / positions from the manifest; shows what already exists on the branch vs what will be created | read-only |
| 2 | **Seed master data** | Creates missing master data (idempotent upsert by code). Requires type-to-confirm | ✅ (transaction + audit) |
| 3 | **Upload workbook** | Upload `PILOT-BATCH-1-import.xlsx` | none (staged in memory) |
| 4 | **Validation results** | Runs `validateImportFile`; shows ERROR/WARNING per row; blocks confirm if any ERROR | read-only |
| 5 | **Confirm load** | Runs `confirmImport` after explicit confirmation | ✅ (transaction + audit) |
| 6 | **Backfill dept heads** | Sets the 6 `departments.head_person_id` now that employees exist | ✅ (transaction + audit) |

Every write step shows a **preview + explicit confirmation** before executing, and reports created/skipped/failed counts after.

---

## 2. Files to ADD

### Module: `modules/migration/`
| File | Purpose |
|---|---|
| `modules/migration/manifest.ts` | Canonical master-data manifest (1 BU, grade `KPD-G-01`, 4 locations, 6 depts `KPD-DP-001..006`, 48 positions+jobs with source codes, 6 HOD links). Pure typed data derived from `PHASE2-master-data-blueprint.md`. |
| `modules/migration/branch-safety.ts` | `getBranchTarget()` + `assertBranchSafe()` — reads DB host, refuses if it matches the production endpoint; requires `ENABLE_MIGRATION_CONSOLE=true`. |
| `modules/migration/seed-actions.ts` | `getMigrationStatus()` (read), `seedMasterData(confirm)` (write), `backfillDepartmentHeads(confirm)` (write). All SA-gated, branch-checked, transactional, audited, idempotent. |
| `modules/migration/index.ts` | Barrel (cross-module import rule). |
| `modules/migration/types.ts` | `MigrationStatus`, `SeedResult`, `MasterDataItem`. |

### Routes/Pages: `app/(hr-admin)/admin/migration/`
| File | Purpose |
|---|---|
| `page.tsx` | Server component; SA guard (`auth()` → redirect if not SUPER_ADMIN, mirrors dataops); loads manifest + branch status; renders client shell. |
| `MigrationConsoleClient.tsx` | Stepper orchestration, state. |
| `components/BranchSafetyBanner.tsx` | Step 0 banner. |
| `components/MasterDataReview.tsx` | Step 1. |
| `components/SeedMasterDataPanel.tsx` | Step 2 (+ confirm modal). |
| `components/UploadWorkbookPanel.tsx` | Step 3 (reuses existing upload UI if present). |
| `components/ValidationResultsTable.tsx` | Step 4. |
| `components/ConfirmLoadPanel.tsx` | Steps 5–6 (+ confirm modal). |

### API (minimal — prefer Server Actions)
| File | Purpose |
|---|---|
| `app/api/migration/branch-status/route.ts` | Optional GET for live branch-safety status; SA-gated. *(Only if a client poll is needed; otherwise omit.)* |

### Tests
| File | Purpose |
|---|---|
| `tests/unit/migration-console.test.ts` | RBAC (SA-only), branch-safety guard (prod-blocked), manifest integrity (48 positions, 6 depts, codes unique), idempotency, audit events. |
| `tests/unit/migration-branch-safety.test.ts` | `assertBranchSafe()` blocks the prod host fragment; requires the env flag. |

---

## 3. Files to MODIFY

| File | Change | Condition |
|---|---|---|
| `config/workspace-nav.ts` | **Append** a 12th workspace `{ id:'migration', labelEn:'Migration / UAT Load', superAdminOnly:true, route:'/admin/migration', … }` after `dataops`. Append-only. | C3 / D4 |
| `tests/unit/nav-depth-governance.test.ts` | NAVDEPTH-002: add `'migration'` → 12 expected workspace ids; **add new test** asserting MANAGER/EMPLOYEE/HR_ADMIN cannot see the `migration` workspace. | **C3** |
| `middleware.ts` | Add to `ROLE_GATED_PATHS` (before broad `/admin`): `{ prefix:'/admin/migration', allowed:['SUPER_ADMIN'] }` and `{ prefix:'/api/migration', allowed:['SUPER_ADMIN'] }`. | **C1** |
| `config/admin-nav.ts` | **NOT TOUCHED** — Migration must never appear for MANAGER. | D4 / C6 |

---

## 4. Server Actions / functions (detail)

| Function | Signature (planned) | Guards |
|---|---|---|
| `getMigrationStatus()` | → `{ branch: BranchSafety, manifest, existing, gaps }` | `requireRole(['SUPER_ADMIN'])`; read-only |
| `seedMasterData(confirm: 'SEED')` | → `SeedResult{ created[], skipped[], failed[] }` | SA + `assertBranchSafe()` + `db.transaction` + `writeAuditLog('MIGRATION.MASTER_DATA_SEEDED')`; idempotent (upsert by code) |
| `validateImportFile(file)` | **REUSE** `modules/core-hr/bulk-import/actions.ts` | already SA/HR-gated + validation |
| `confirmImport(validatedBatch)` | **REUSE** existing | already transactional + audited |
| `backfillDepartmentHeads(confirm)` | → updates 6 `departments.head_person_id` | SA + branch-safe + transaction + audit |
| `assertBranchSafe()` | throws `PROD_WRITE_BLOCKED` if host = prod / flag off | used by every write action |

**Reuse, don't rebuild:** employee creation goes entirely through the existing `validateImportFile`/`confirmImport` (which already encrypt PII, validate codes, run in transactions, write audit). The new module only adds the **master-data seed** + **dept-head backfill** + the **UI/orchestration**.

---

## 5. Safety design (your explicit requirements)

| Requirement | Implementation |
|---|---|
| **RBAC** | `requireRole(['SUPER_ADMIN'])` on every action + page guard + middleware `ROLE_GATED_PATHS`. A `feature_permissions` row `MIGRATION_LOAD` is metadata only (per C4 — the real gate is requireRole + middleware). |
| **Branch-only** | `assertBranchSafe()` reads the live DB host; if it matches the production endpoint fragment (`ep-empty-boat-…`, from baseline cert) → throw + audit `MIGRATION.BLOCKED_PROD_GUARD`. Also requires `ENABLE_MIGRATION_CONSOLE=true` (feature dark in prod by default). Step-0 banner shows the resolved target. |
| **Audit** | Every write inside `db.transaction` + `writeAuditLog`. Events: `MASTER_DATA_SEEDED`, `DEPT_HEADS_BACKFILLED`, `IMPORT_VALIDATED`, `IMPORT_CONFIRMED`, `BLOCKED_PROD_GUARD`. |
| **Confirmation** | Each write step = preview + type-to-confirm (`SEED` / `LOAD`) + explicit button. No write without it. |
| **Idempotency** | Seed upserts by code (skip existing) → re-runnable. Employee importer remains non-idempotent (rejects dupes) — surfaced in the UI. |
| **No raw script** | All writes go through SA-gated server actions with the above controls. No hidden script path. |

---

## 6. Load sequence enforced by the console

1. (Step 2) Verify AVN-001 → BU → grade → locations → **positions+jobs** → **departments (head NULL)**.
2. (Steps 3–5) Validate + import the 17 employees — **managers-first ordering** baked into the workbook (Talal → 6 HODs → reports).
3. (Step 6) Backfill the 6 `departments.head_person_id`.
4. Functional-manager 2nd pass — **deferred** (out of pilot scope; Talal-only resolvable).

---

## 7. C1–C7 coverage (this feature)

| # | Condition | Status in this plan |
|---|---|---|
| C1 | Middleware + `requireRole` SA-only | ✅ designed (§3, §5) |
| C2 | PII encrypted before persist | ✅ employee PII via existing importer's encryption; master data has no PII |
| C3 | NAVDEPTH-002 update + visibility test | ✅ designed (§3) |
| C4 | `feature_permissions` metadata-only | ✅ designed (§5) |
| C5 | Transactional + audited writes | ✅ designed (§4, §5) |
| C6 | Enforceable execution | 🟡 pilot scale (17) is small + synchronous; add `export const maxDuration`; **full-population async/batch deferred** to a later iteration |
| C7 | Backup + rollback tested | ✅ done (branch + verified rollback) |

---

## 8. Out of scope (this build)
- Oracle Fusion CSV ingestion engine + `migration_*` staging tables (the full factory, docs 00–09).
- Async/background processing for large loads (C6 full form) — pilot is synchronous.
- Functional-manager links, leave-balance load (File 04.1), payroll.

---

## 9. Estimated footprint
- **New files:** ~12 (5 module, ~7 UI, 2 test).
- **Modified files:** 3 (`workspace-nav.ts`, `nav-depth-governance.test.ts`, `middleware.ts`). `admin-nav.ts` untouched.
- **DB schema changes:** **none** (reuses existing tables; master data via existing entities).
- **New migration:** **none** for the pilot.

---

## 10. Approval gate (before build)

- [ ] Approve this plan + file inventory
- [ ] Confirm freeze-lift for the 3 modified shared files (workspace-nav, nav test, middleware)
- [ ] Confirm route location `/admin/migration` (mirrors `/admin/dataops`)
- [ ] Confirm `ENABLE_MIGRATION_CONSOLE` env-flag approach + prod-host block

> On approval, build order: branch-safety + manifest → seed action + tests → UI steps → nav/middleware wiring (C1/C3) → end-to-end on the branch. **No DB writes until the console's own confirm steps are used.**
