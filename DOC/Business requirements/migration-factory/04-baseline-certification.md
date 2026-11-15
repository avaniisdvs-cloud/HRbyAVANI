# Migration Factory — Pre-Implementation Baseline Certification

> **Purpose:** Capture the exact, verified state of the AVANIIS HCM platform **immediately before** any Migration Factory implementation begins. This is the non-regression reference point: after the build, every value here must be reconcilable, and any production-side count must be unchanged by Phase 1 (which writes only to isolated staging).
>
> **Certification date:** 2026-06-01
> **Certified by:** Claude Code (automated baseline capture) on behalf of `d.kethari@avaniis.example`
> **Implementation status at certification:** 🔴 **NO-GO** (C1–C7 open)

---

## Certified Baseline Values

| # | Dimension | Certified value | Verification method |
|---|---|---|---|
| 1 | **Git SHA (HEAD)** | `97c8608e13e7089ba3a49011420163879d211f30` (branch `main`) | `git rev-parse HEAD` |
| 2 | **Vercel deployment ID (current Production)** | `khcm-ai-os-31dg-3k8dl3rqh` — `https://khcm-ai-os-31dg-3k8dl3rqh-Avaniis Engineerings-projects.vercel.app` (● Ready, age 40m at capture; project `Avaniis Engineerings-projects/khcm-ai-os-31dg`) | `vercel ls` (CLI 54.5.1, authenticated) |
| 3 | **Neon branch** | ✅ **`br-square-union-al2bxhr1`** — created 2026-06-01 from production `main` (Head / point-in-time). This is the database restore point. | Neon Console → Branches (confirmed by project owner `d.kethari@avaniis.example`) |
| 4 | **Migration count** | **63** files; highest number **0054**; next additive slot **0055**. Journal tracks 0000–0039; 0040–0054 are manual Neon SQL. | `ls drizzle/migrations/*.sql` |
| 5 | **Route count** | **146** routable endpoints = 119 page routes + 27 API handlers | `find app -name page.tsx` + `find app/api -name route.ts` |
| 6 | **Page count** | **119** (`page.tsx`) | `find app -name page.tsx \| wc -l` |
| 7 | **API count** | **27** (`route.ts` under `app/api`) | `find app/api -name route.ts \| wc -l` |
| 8 | **Role count** | **7** — `EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE, HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN` | `modules/auth/config.ts` (KRole enum) |
| 9 | **Entity count** | **5** legal entities (`legal_entities`) | read-only `SELECT count(*)` via `DATABASE_URL` |
| 10 | **User count** | **14** user accounts (`user_accounts`); **21** person records (`persons`) | read-only `SELECT count(*)` via `DATABASE_URL` |
| 11 | **Workflow count** | **22** definitions = 10 (`workflow_definitions`) + 12 (`workflow_definitions_v2`); 3 active instances (`workflow_instances_v2`) | read-only `SELECT count(*)` via `DATABASE_URL` |
| 12 | **Feature-permission count** | **13** rows (`feature_permissions`) | read-only `SELECT count(*)` via `DATABASE_URL` |

---

## Supporting Inventory (cross-reference)

| Dimension | Value |
|---|---|
| Tables | 100+ (109 `pgTable` defs across 11 schema files) |
| DB connection variable | `DATABASE_URL` (read by `lib/db.ts` + `drizzle.config.ts`) |
| Neon pool config | `lib/db.ts`: `max:1` only when `NODE_ENV==='production'`; else default pool 10 |
| Navigation systems | `config/workspace-nav.ts` (admins, 11 workspaces), `config/admin-nav.ts` (MANAGER), `EmployeeSidebar.tsx` (EMPLOYEE) |
| RBAC enforcement | `requireRole(['…'])` (`lib/auth.ts`) + `middleware.ts` `ROLE_GATED_PATHS`. `feature_permissions` = metadata, no runtime enforcement |
| Migration 0054 | Applied to Neon (verified: `departments.work_schedule_id` column + `idx_departments_work_schedule` + FK present) |

---

## Verification Method (overall)

1. **Source-controlled facts** (SHA, migrations, routes, pages, APIs, roles): derived directly from the working tree at the certified SHA via shell inventory commands.
2. **Runtime/production facts** (Vercel deployment): read via authenticated `vercel` CLI; the most-recent ● Ready Production deployment is certified as the rollback target.
3. **Database facts** (entities, users, workflows, feature-permissions): **read-only `SELECT count(*)`** against the live Neon database via `DATABASE_URL`. No writes, no schema changes, no DDL — only counts. Connection string never logged or exposed.
4. **Manual capture required:** the Neon **branch identifier** must be recorded from the Neon Console before build start (cannot be safely derived via SQL).

---

## Certification Statement

The values above represent the verified pre-implementation baseline of AVANIIS HCM as of **2026-06-01** at git SHA `97c8608`. This baseline is the non-regression reference for the Migration Factory project.

**Post-build reconciliation rule (Phase 1):** because Phase 1 writes only to isolated `migration_*` staging tables (Decision D2), the following **must be unchanged** after the build versus this baseline: entity count, user count, workflow count, feature-permission count (other than an intentional `MIGRATION_FACTORY`-related row if C4 elects to add one), role count, and all existing route/page/API behavior. Migration count is expected to increase by exactly one (0055, additive). Any other drift is a regression and a rollback trigger.

> **Open items to finalize before build start:** ~~record the Neon branch identifier (item 3)~~ ✅ Done (`br-square-union-al2bxhr1`). Confirm the certified Vercel deployment is still the live Production target at build time.

**Database backup status: ✅ Neon branch `br-square-union-al2bxhr1` created 2026-06-01. Rollback verified 2026-06-02 — all 5 baseline counts confirmed via SQL Editor on the branch.**
**Implementation status: 🟡 PARTIALLY READY** — code + DB protection complete. Remaining gates: C (DB target decision) and D (Oracle Fusion source data).
