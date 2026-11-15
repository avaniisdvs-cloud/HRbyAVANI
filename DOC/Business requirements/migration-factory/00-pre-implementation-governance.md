# Migration Factory — Pre-Implementation Governance

> **Status:** Documentation & design only. **Implementation = NO-GO** until conditions **C1–C7** are explicitly closed by the project owner.
> **Date:** 2026-06-01 (revised post Build Readiness Review)
> **Author:** Claude Code (read-only baseline + governance synthesis + BRR corrections)
> **Scope of this document:** Locked decisions, impact analysis, regression risk assessment, backup strategy, rollback strategy, Go/No-Go gate, the non-regression rule, and the BRR build conditions (C1–C10). No application logic, migrations, or database changes are made by this document.

---

> ## ⚠️ Build Readiness Review Corrections (applied 2026-06-01)
>
> This document was reviewed by 6 code-verifying reviewers + an adversarial red-team pass, and several original claims were **verified false against the codebase**. All corrections are marked inline with **🔴 CORRECTION** callouts. Summary of what changed:
> 1. **Navigation impact** was "No Impact (append-only)" → **corrected to Low Impact**: appending a workspace **breaks the existing passing test NAVDEPTH-002**.
> 2. **NAV-001–010 citation** as the nav safety-net → **removed**: that suite guards the EMPLOYEE sidebar, not `WORKSPACE_NAV`.
> 3. **`feature_permissions` default-deny** described as an access-control layer → **corrected**: it has **zero runtime enforcement** (metadata only).
> 4. **`POSTGRES_URL`** references → **corrected to `DATABASE_URL`** (the var the code actually reads).
> 5. **Neon `max:1` pool analysis** → **corrected**: `max:1` applies **only when `NODE_ENV==='production'`**; staging uses a pool of 10.
> 6. **Audit** → staging writes (not just promotion) must use `db.transaction() + writeAuditLog`; the nearest sibling (`saveFeaturePermissions`) omits audit and must not be copied.
> 7. **PII in staging** → encryption was deferred to promotion; **corrected**: Hard Rule 3 is unconditional — PII must be encrypted before INSERT into staging, and must not leak into `audit_log`.
>
> New section **§10 Build Readiness Conditions (C1–C10)** is the authoritative gate.

---

## 0. Purpose & Prime Directive

The Migration Factory is an **additive-only** capability to migrate data from **Oracle Fusion** into AVANIIS HCM.

> **PRIME DIRECTIVE (non-negotiable):** No existing AVANIIS HCM functionality may be degraded, modified, removed, or impacted as a side effect of this project. The Migration Factory is additive only. Every existing module must continue to function exactly as it does today.

Protected modules (must remain unchanged): Employee Self Service, Manager Self Service, HR Administration, Core HR, Organization Chart, Leave Management, Time & Attendance, Documents, Letters, Approvals, Workflows, Payroll, ARIA, Master Data Management, Security, RBAC, Reporting, Dashboard, existing Bulk Import functions, existing APIs, existing integrations.

---

## 1. Verified Baseline (current system state, 2026-06-01)

Authoritative inventory taken from the live codebase (read-only). Supersedes older numbers in `CLAUDE.md` session records.

| Dimension | Verified value |
|---|---|
| Route pages (`page.tsx`) | **119** |
| API handlers (`route.ts`) | **27** |
| Migration files | **63** (highest number **0054**; next slot **0055**; 0040–0054 are manual SQL via Neon SQL Editor) |
| Tables | **100+** (109 `pgTable` defs across 11 schema files) |
| Roles | **7**: `EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE, HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN` |
| High-privilege roles | `HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN` |
| DataOps console | Present, SUPER_ADMIN-only (`/admin/dataops`, `/api/dataops/*`). Can already run raw SQL + table CRUD. |
| Existing import | Server-Action based; only `GET /api/persons/import/template` exists as an import API. Engine in `modules/core-hr/bulk-import/import-engine.ts` — **must not be reused/refactored** by the Factory. |
| Navigation | 3 role-segregated systems: `config/workspace-nav.ts` (HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN), `config/admin-nav.ts` (MANAGER), `EmployeeSidebar.tsx` (EMPLOYEE). SUPER_ADMIN-only via `superAdminOnly` flag. |
| RBAC enforcement | **`requireRole(allowed: KRole[])` (`lib/auth.ts`) is the only request-boundary gate, plus `middleware.ts` `ROLE_GATED_PATHS`.** `feature_permissions` is a config/editor table with **no runtime enforcement** (see §4 R5). |
| DB connection var | **`DATABASE_URL`** (read by `lib/db.ts` + `drizzle.config.ts`). *(Not `POSTGRES_URL`.)* |
| Neon pool | `lib/db.ts`: `max:1` **only when `NODE_ENV==='production'`**; otherwise default pool of **10**. |

---

## 2. Locked Decisions (confirmed by project owner, 2026-06-01)

| # | Decision | Chosen value | Rationale |
|---|---|---|---|
| D1 | **Migration scope (this phase)** | **Workforce Master + Org Structure + Absence only** | Phased rollout; payroll history deferred |
| D2 | **Write target** | **Isolated staging only** (`migration_*` tables); production tables untouched | Lowest regression risk; clean rollback |
| D3 | **Ingestion** | **Fully independent** (new `app/api/migration/*` + new Server Actions) | Existing `/persons/import` pipeline and `import-engine.ts` never modified |
| D4 | **Navigation placement** | **New SUPER_ADMIN top-level workspace** in `workspace-nav.ts` only | Auto-hidden from other roles; never added to `admin-nav.ts` |
| D5 | **Promotion to production** | **Out of scope this phase**; gets its own separate Go/No-Go gate | Concentrates real regression risk into a single, explicitly-gated future step |

---

## 3. Impact Analysis

Design profile: additive subsystem that ingests Fusion extracts into new `migration_*` staging tables only, with validation/preview, behind a SUPER_ADMIN-only workspace, via independent ingestion code. **No production table is written in this phase.**

| Dimension | Change | Classification |
|---|---|---|
| Navigation | Append 1 workspace to `WORKSPACE_NAV` (`superAdminOnly:true`) | **🔴 Low Impact** — see correction below (was wrongly "No Impact") |
| Routes | New `app/(hr-admin)/migration-factory/*` segment (SUPER_ADMIN-gated) | **No Impact** (new segment) — but gating needs C1 |
| APIs | New `app/api/migration/*`; `/persons/import/*` + `import-engine.ts` untouched | **No Impact** |
| RBAC | New `requireRole(['SUPER_ADMIN'])` + middleware gate (C1) | **No Impact** |
| Database | New `migration_*` tables, migration **0055**; no `ALTER` on existing tables | **No Impact** |
| Shared infra | Neon pool, `(hr-admin)` auth shell | **Low–Medium Impact** — see R1 (corrected) |
| `workspace-nav.ts` + `NAVDEPTH-002` test | Shared file edited (append) + existing test must be updated | **Low Impact** — see R2 (corrected) |

> **🔴 CORRECTION (BRR, ✅-verified):** Navigation is **not** "No Impact." `tests/unit/nav-depth-governance.test.ts` **NAVDEPTH-002** hardcodes exactly **11 workspace ids** (`overview, people, org, leave, payroll, workflows, documents, reports, admin, ai, dataops`) and asserts the set is present. Appending a 12th Migration Factory workspace **fails this currently-passing test** unless it is deliberately updated to 12. The append is therefore a *deliberate, tested change* — Low Impact — not an inert no-op.

**Net:** every protected module is **No/Low Impact**, contingent on R1, R2, and conditions C1–C7 being satisfied.

---

## 4. Regression Risk Assessment

| ID | Functionality at risk | Failure scenario | User impact | Mitigation |
|---|---|---|---|---|
| **R1** | All live pages (shared Neon pool) | Bulk ingest holds connections / long transactions → live latency or timeouts | Existing users see slow pages mid-migration | **C6**: hard batch cap, `maxDuration`, async/background via cron+outbox, off-peak gate, orphan cleanup cron. See correction below. |
| **R2** | Admin rail rendering + `NAVDEPTH-002` test | Bad/undeliberate edit to `workspace-nav.ts`; or new SUPER_ADMIN workspace visible to MANAGER/EMPLOYEE | HR_ADMIN/HR_DIRECTOR lose nav, or unauthorized visibility | **C3**: deliberately update NAVDEPTH-002 to 12; add a NEW test asserting MANAGER/EMPLOYEE cannot see the workspace. See correction below. |
| **R3** | Rollback cleanliness | `migration_*` FK into existing tables → cannot drop cleanly | Rollback blocked | ✅-verified clean: no inbound FK from production; `resolved_target_id` is a plain `uuid`. Lock intra-set FK design (**C8**). |
| **R4** | `persons`/`worker_assignments`/`absence_*` integrity (**future promotion**) | Promotion lands bad data | Corrupted live HR data | **Out of scope this phase (D5).** Separate gate: dry-run, effective-date, transactional, audited, PII-encrypted. |
| **R5** | Access control | New route/action/API reachable by non-SUPER_ADMIN | Privilege escalation | **C1**: add `/migration-factory` + `/api/migration` to middleware `ROLE_GATED_PATHS`; `requireRole(['SUPER_ADMIN'])` on every handler. See correction below. |
| **R6** | Nav two-file invariant | Migration Factory added to `admin-nav.ts` | Unauthorized visibility | Documented intentional divergence: lives in `workspace-nav.ts` ONLY. Guard via C3 test. |
| **R7** *(new)* | Audit completeness (Hard Rule 1) | Staging writes copy `saveFeaturePermissions` (which omits audit) → unaudited migration writes | Compliance/audit gap | **C5**: every staging write uses `db.transaction() + writeAuditLog`. |
| **R8** *(new)* | PII at rest + audit spillage | Plaintext `emirates_id`/`passport`/`iban` in staging jsonb, or in `audit_log.new_values` | PDPL / Hard Rule 3 violation | **C2**: encrypt PII before INSERT; redact payloads from audit (precedent FIX-2G-002). |

> **🔴 CORRECTION — R2 (BRR, ✅-verified):** The original R2 cited "nav-invariant unit test (precedent: NAV-001–010)" as the safety net. **This is wrong.** `NAV-001–010` lives in `tests/unit/employee-navigation.test.ts` and only locks the **EMPLOYEE sidebar order** — it never references `WORKSPACE_NAV`. There is currently **no test** asserting MANAGER/EMPLOYEE cannot see a SUPER_ADMIN workspace. C3 creates one.

> **🔴 CORRECTION — R5 (BRR, ✅-verified):** The original R5/§7 listed the `feature_permissions` "default-deny row" alongside `requireRole` as a second enforcement layer. **`feature_permissions` has zero runtime enforcement** — the `employeePerms/managerPerms/hrAdminPerms` columns are read ONLY in the editor UI (`_FeaturePermissionsClient.tsx`) and its server action. It provides **no access protection**. The real gate is `requireRole(['SUPER_ADMIN'])` **plus the middleware entry of C1** — not the permissions row.

> **🔴 CORRECTION — R1 (BRR, ✅-verified):** The original R1 analysis assumed `max:1`. `lib/db.ts` applies `max:1` **only when `NODE_ENV==='production'`** (line 27); otherwise the default pool of **10** is used. Since the Factory runs first in **staging** (likely not `NODE_ENV=production`, possibly `ENABLE_DEV_ACCOUNTS=true` which also bypasses MFA), the contention profile differs by environment. On production, `max:1` per warm instance means a long ingest transaction **serializes every other query in that instance** — directly threatening the dashboard's 6-query `Promise.all` (the NFR-01 fix). Honest rating: **Medium, unmitigated until C6 enforcement exists.**

---

## 5. Backup Strategy

To be executed **before any data-modification activity** (before migration 0055 is applied or any staging write occurs).

### Application
- Tag current commit (`a88e3d1`) as `pre-migration-factory-baseline`.
- Create feature branch `feat/migration-factory`.
- Record the current Vercel production deployment ID.

### Database
- Take a **Neon branch** (instant copy-on-write snapshot) immediately before applying migration 0055.
- Take a `pg_dump` logical export (connection via **`DATABASE_URL`** — *🔴 corrected from `POSTGRES_URL`*), stored off-Neon, dated and scope-tagged.

### Configuration
- Export `feature_permissions`, nav configs (git-tracked), workflow definitions, MDM tables to dated JSON before any data activity.

### Local backup rule (project standing instruction)
- Any local backup ZIP must **include `node_modules/`**, exclude `.next/`, and the report must show the **full absolute path** of the ZIP.

> **🔴 CORRECTION (BRR):** The backup steps above are currently **aspirational** — no script or CI hook automates them. **C7** requires turning this into an executable runbook before build sign-off.

---

## 6. Rollback Strategy

### Rollback triggers
Existing-route 4xx/5xx regression · permission denial on existing features · migration data corruption/mismatch · deployment failure · UAT regression in any protected module · page p95 degradation beyond NFR-01 during/after migration activity · **orphaned batch stuck in `VALIDATING` after a timeout/redeploy** *(new, see C6)*.

### Rollback procedure
1. Revert Vercel deployment to the recorded pre-migration deployment ID (~1 min).
2. `git revert` the feature-branch merge (this reverts the NAVDEPTH-002 update too).
3. Restore the Neon branch **or** `DROP` the additive `migration_*` tables (no inbound FKs from production → clean drop; order per `01-staging-schema-design.md` §5).
4. Remove any `MIGRATION_FACTORY` config rows.

### Rollback validation
Re-run the 4-role regression set (Super Admin / HR Admin / Manager / Employee) over: Navigation, Org Chart, Leave, Documents, Approvals, Payroll, ARIA, existing imports. Confirm Navigation / APIs / Permissions / Data integrity restored.

> **🔴 CORRECTION (BRR, ✅-verified):** The "4-role regression set, 30–45 min" is **not a runnable artifact** — e2e specs are parallel role files, several HA-* currently skipped for missing seed data. **C7** requires a real, runnable validation checklist before sign-off.

### Estimated rollback time
Deployment revert ~1–2 min; table drop seconds; validation ~30–45 min (once C7 makes it runnable).

---

## 7. Existing-Functionality Non-Regression Rule (binding)

1. **No modification** of existing navigation behavior, permissions behavior, APIs, employee imports (incl. `import-engine.ts`), or workflows — unless explicitly approved.
2. **Prefer** new routes, components, services, permissions, menu groups over modifying existing logic.
3. Migration Factory navigation is added to **`workspace-nav.ts` only**, as a SUPER_ADMIN top-level workspace. **`admin-nav.ts` is never touched. Nothing is exposed to HR_ADMIN.**
4. Database changes are **additive only**: new `migration_*` tables. No `ALTER` of existing tables, no reuse of unrelated columns, no constraint changes.
5. Before any feature is "complete," a 4-role regression validation must pass with **zero regression**.
6. Promotion of staged data into production (D5) is a **separate, future, explicitly-gated phase**.
7. *(new)* Every staging write is transactional + audited (Hard Rule 1). PII is encrypted before persist (Hard Rule 3) and redacted from audit values.

---

## 8. Go / No-Go Gate

| Gate item | Status |
|---|---|
| Impact analysis | 🟢 Complete (§3) — corrected |
| Regression plan | 🟢 Complete (§4) — R1–R8; R4 deferred to its own gate |
| Backup strategy | 🟡 Defined but not executable (§5) — closed by **C7** |
| Rollback strategy | 🟡 Defined; validation not runnable (§6) — closed by **C7** |
| Existing functionality unaffected | 🟡 By construction, **contingent on C1–C7** |
| Build Readiness Conditions C1–C7 | 🔴 **OPEN** |
| **Owner approval to implement** | 🔴 **PENDING — implementation remains NO-GO** |

> **Current verdict: APPROVE WITH CONDITIONS. Implementation = NO-GO until C1–C7 are explicitly closed.**

---

## 9. Related Documents

- `docs/migration-factory/01-staging-schema-design.md` — proposed `migration_*` staging table set (design only).
- `docs/migration-factory/02-build-readiness-review.md` — full Build Readiness Review (findings + conditions).

---

## 10. Build Readiness Conditions (C1–C10) — authoritative gate

**Blocking (must be closed before any code; implementation NO-GO until then):**

| # | Condition | Source finding (✅-verified) |
|---|---|---|
| **C1** | Add `/migration-factory` + `/api/migration` to `middleware.ts` `ROLE_GATED_PATHS` (`allowed: ['SUPER_ADMIN']`). `requireRole(['SUPER_ADMIN'])` mandatory on every page/action/API. | `(hr-admin)/layout.tsx` admits EMPLOYEE/MANAGER; no middleware backstop exists for migration routes |
| **C2** | Encrypt PII (`emirates_id`/`passport`/`iban`/etc.) via `lib/encryption.ts` **before INSERT** into staging; ensure `raw_payload`/`normalized_payload` never reach `audit_log.new_values` (redact — precedent FIX-2G-002). | Hard Rule 3 unconditional; documented prior leak class |
| **C3** | Deliberately update `NAVDEPTH-002` to 12 workspaces **and** add a new test asserting MANAGER/EMPLOYEE cannot see the SUPER_ADMIN workspace. Remove the false NAV-001–010 citation. | NAVDEPTH-002 hardcodes 11; NAV-001-010 is the employee sidebar |
| **C4** | Treat `feature_permissions` as metadata-only (no runtime enforcement) **or** wire real enforcement. Do not rely on a "default-deny row" for protection — rely on C1 + `requireRole`. | Zero runtime consumers verified |
| **C5** | Every staging write uses `db.transaction() + writeAuditLog`. Do **not** copy `saveFeaturePermissions` (omits audit). Audit permission toggling too. | Hard Rule 1; sibling violates it |
| **C6** | Make R1 enforceable: hard batch-size cap (e.g. 500), `export const maxDuration`, async/background processing via the existing cron + Postgres outbox pattern, off-peak gate, and an orphaned-batch cleanup cron. | No `maxDuration`/batching/cleanup today; `max:1` prod serialization |
| **C7** | Executable backup/rollback runbook (git tag + Vercel deploy id + Neon branch) using **`DATABASE_URL`**; runnable 4-role regression checklist. | Wrong env var verified; suite aspirational |

**Design (decide before build; non-blocking):**

| # | Condition |
|---|---|
| **C8** | Lock OD-2 to **Option A** (enforced intra-set FKs) so rollback DROP order is fixed. |
| **C9** | Define the DataOps ↔ Migration Factory boundary + row-locking to prevent two SUPER_ADMIN surfaces corrupting a batch mid-validation. |
| **C10** | Define ERROR-vs-WARNING thresholds for cross-reference validation; document that migration **0055** is a manual, un-journalled Neon step (`drizzle-kit migrate` will NOT create the staging tables). |

**Not required for Phase 1:** multi-tenancy (only for future-customer migrations); the promotion phase (its own gate, D5).
