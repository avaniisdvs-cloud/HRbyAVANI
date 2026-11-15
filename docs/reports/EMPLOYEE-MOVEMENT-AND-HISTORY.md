# Employee Assignment History & Movement Reporting

**Status:** ✅ **Delivered and DEV/UAT validated — NOT real-production-ready.** · **Date:** 2026-06-20
**Scope:** Expose effective-dated employee assignment history across ESS, Manager, HR Admin, Super Admin and a new cross-employee report + CSV export. **No schema changes, no migrations.**

## Release record

| Item | Detail |
|---|---|
| Feature PR | **PR #14** — `feat(history): Employee Assignment History & Movement Reporting` — **MERGED** to `main` at merge commit **`03b8b411`** |
| Navigation visibility fix | **PR #15** — `fix(nav): Surface Employee Movement Report in Reports menu` — **MERGED** to `main` at merge commit **`c91ee18a`** |
| `main` (integration / DEV-UAT) | `c91ee18a` |
| `production` (public DEV/UAT branch) | `c91ee18a` — advanced from `03b8b411`, published the PR #15 navigation fix to the public DEV/UAT domain |
| Public DEV/UAT domain | http://localhost:3001 (Vercel Production deployment of `c91ee18a`, state: success) |
| DB / schema / migration / package | **None.** No schema change, no migration file, no Neon migration required, no `package.json` change across PR #14 + PR #15. |
| Salary / compensation exposure | None on any new surface (see exclusion rule below). |
| Real production readiness | **Blocked** by documented UAT / data-coverage items (below). This is a DEV/UAT-grade publish, not a production cutover. |

See also: release governance — [`docs/governance/VERCEL_PRODUCTION_DEPLOYMENT_GATE.md`](../governance/VERCEL_PRODUCTION_DEPLOYMENT_GATE.md).

## What was delivered

| # | Surface | Where |
|---|---|---|
| 1 | **Shared secure reader** — one server-side reader for the effective-dated `worker_assignments` timeline | `modules/core-hr/assignment-history.ts` |
| 2 | **ESS "Employment History" tab** — employee sees own timeline (past/current/future) | `app/(employee)/me/ProfilePageClient.tsx`, `me/profile/page.tsx` |
| 3 | **Manager team-member history** — already exposed via `persons/[id]` from My Team; scoped by `getPerson` | (verification only — no change) |
| 4 | **HR/Super Admin person page** — added Current/Past/Future temporal badge (reuses `classifyTemporal`), as-of labels preserved | `app/(hr-admin)/persons/[id]/page.tsx` |
| 5 | **Employee Movement Report** — cross-employee, scoped, 12 filters, 15 columns | `modules/reports/employee-movement.ts`, `app/(hr-admin)/reports/employee-movement/page.tsx` |
| 6 | **Navigation** — "Employee Movement" under Reports (admin, workspace, manager navs in sync) | `config/admin-nav.ts`, `config/workspace-nav.ts`, `config/manager-nav.ts` |
| 7 | **CSV export** — `type=employee-movement`, same RBAC + filters as the report | `app/(hr-admin)/reports/export/route.ts` |

## Access control (mirrors existing scope — no RBAC broadening)

Decided by the pure `decideHistoryAccess()` (reader) and the role gate in the report/export:

| Role | Scope |
|---|---|
| EMPLOYEE | Own history only (ESS tab). No report/export access. |
| MANAGER | Direct reports only (DB-resolved, mirrors `isManagerDirectReport`). |
| HR_ADMIN / HR_DIRECTOR | Own legal entity only (entity-scoped). |
| SUPER_ADMIN | All employees / all entities. |
| PAYROLL_ADMIN / FINANCE / others | No history/movement access. |

Enforcement is **server-side** in every path (reader, report module, export route, and `getPerson`).

## Salary / compensation exclusion (hard rule)

- The reader and report select **non-sensitive fields only** — never `basic_salary`/compensation/allowance/payroll.
- `SALARY_REVISION` slices are **excluded in-query** from the **shared reader** (ESS), the **Movement Report**, and the **CSV export** — `ne(workerAssignments.actionType, 'SALARY_REVISION')` — and from the report filter dropdown. No pay-change history is surfaced on any new surface.
- **Pre-existing exposure (documented, not expanded):** the HR Admin / Super Admin person page (`persons/[id]`) has rendered the assignment `actionType` (which can include `SALARY_REVISION`, no amounts) since before this branch. This workstream only added a non-sensitive Current/Past/Future badge there; it did **not** add salary data and does **not** expand the pre-existing exposure. Excluding it there would alter certified HR behaviour and is left as a separate decision.
- Enforced by source-scan + in-query tests (`AHR-016`, `AHR-017`, `EMR-013`–`EMR-018`).

## Post-Codex remediation (2026-06-19)

- **Scope by CURRENT person entity, not historical slice** — `getEmployeeMovement` and `getMovementFilterOptions` resolve an authorised person set via `resolveMovementScope()` and filter on `persons.legalEntityId` (HR) / `persons.id` (manager direct reports). A historical assignment slice in the HR user's entity can no longer leak an employee who has since moved entities. URL params can only narrow within scope.
- **REPORTS:view enforced** — both functions call `requirePermission(user,'REPORTS','view')` (matches employee-history); page redirects and export returns 403 on deny.
- **q/status filters moved into the DB query before the row cap** (parameterised ILIKE + date predicates) — no matching rows dropped beyond the limit.
- **Truncated export blocked** — export returns HTTP 400 ("narrow filters") instead of silently capping.
- **Manager filter options** now derive only from direct reports' current assignments (no entity-wide person leak).

## Reports navigation visibility (PR #15, 2026-06-20)

PR #14 wired "Employee Movement" into all three nav configs (`admin-nav.ts`, `workspace-nav.ts`, `manager-nav.ts`). However, for admin roles the Reports **workspace secondary-nav panel is suppressed** — their effective Reports navigation is the in-page left-nav rendered by `app/(hr-admin)/reports/page.tsx`, which previously listed only the in-page query-param reports plus a standalone-route link for Insurance Reports. Employee Movement (also a standalone route, `/reports/employee-movement`) was not listed there, so Super Admin / HR Admin / HR Director could not discover it from the Reports UI.

PR #15 adds a single `<Link>` to `/reports/employee-movement` in that in-page panel, mirroring the existing Insurance Reports link (same admin role gate `['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']`, already-imported `BarChart3` icon, placed before Insurance Reports to match the `workspace-nav.ts` order). **UI-only, +20 lines, single file (`app/(hr-admin)/reports/page.tsx`).** No backend / report-query / export / RBAC / schema / package changes.

## Columns (Movement Report & CSV)

emp number · employee (EN/AR) · effective start · effective end · state (Current/Past/Future) · change type · change mode · department · position · job · grade · business unit · company (legal entity) · location · line manager · assignment status · reason. **No salary column.**

## Filters

employee (name/number) · company* · business unit · department · job · position · grade · line manager · effective date range · change type · status (current/past/future). *Company filter shown to SUPER_ADMIN only; HR is auto-scoped to own entity.

## Tests

- `tests/unit/assignment-history-reader.test.ts` (16) — RBAC matrix, temporal classification, salary-exclusion scan.
- `tests/unit/employee-movement-report.test.ts` (6) — role-gate deny paths, action types, salary-exclusion scan.
- Full unit suite green: **2119 passed / 12 skipped** (2026-06-19).

## Verification (read-only Neon DEV/UAT, approved)

- SUPER_ADMIN person page: future-dated slice shows **Future** badge; as-of labels intact; no salary.
- Movement report (SA): 76 records, 15 columns, all filters; `status=CURRENT` → 70; no salary text.
- CSV export: SA → HTTP 200 `text/csv`, 18 non-sensitive columns, no salary; EMPLOYEE → **403**.
- Manager nav: single "Employee Movement" link; report scoped (entity filter hidden).

### Known data-coverage limitations (data, not code)

These are **DEV/UAT data gaps**, not defects, and are the items that keep this feature from being real-production-ready:

1. **Single legal entity** — the current Neon DEV/UAT data set contains only one legal entity, so cross-entity HR scoping (HR_ADMIN entity isolation vs. HR_DIRECTOR cross-entity, Super Admin all-entity) is exercised by code/unit tests but cannot be observed end-to-end against multi-entity live data.
2. **Zero `SALARY_REVISION` rows** — there are no `SALARY_REVISION` assignment slices in the DEV/UAT data, so the in-query salary-exclusion behaviour is proven by source-scan + unit tests rather than by observing real pay-change rows being filtered out live.
3. **Demo/UAT login accounts not linked to person records** — accounts such as `employee@avaniis.dev`, `john.uat@avaniis.dev` are **not linked to a person record**, so the ESS "Employment History" tab and a linked Manager's team view could not be rendered end-to-end via login (both short-circuit / return empty). Authentication itself works; linking accounts is a DB write and out of scope. The ESS tab uses the same validated `AssignmentHistoryPanel` + unit-tested reader, proven live on a real pilot person via SUPER_ADMIN.

## Final status

**Delivered and DEV/UAT validated; NOT real-production-ready.** PR #14 and PR #15 are merged to `main`; the navigation fix is published to the public DEV/UAT domain via the `production` branch at `c91ee18a`. Real production readiness remains blocked by the data-coverage items above and by the production-environment prerequisites tracked in the [Vercel Production Deployment Gate](../governance/VERCEL_PRODUCTION_DEPLOYMENT_GATE.md).

## Governance

No schema changes · no migrations · no Neon migration required · no `package.json` changes · no Vercel env/settings changes · no DB data changes. PR #14 (`03b8b411`) and PR #15 (`c91ee18a`) merged to `main`; `production` advanced to `c91ee18a` (DEV/UAT publish only). Foundation model untouched.
