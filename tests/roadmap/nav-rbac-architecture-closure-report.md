# AVANIIS HCM — Navigation, Ownership & Architecture Closure Report

**Sprint:** Architecture Closure (Navigation & RBAC Finalization)
**Date:** 2026-05-31
**Verdict:** ✅ In-scope closure objectives COMPLETE · ⚠️ RBAC access-policy items catalogued as backlog (deliberately not changed — see §7)

---

## 1. Executive summary

Five parallel investigation streams (A–E) audited the navigation, ownership, RBAC,
architecture-debt, and role surfaces of the platform. Findings were synthesized and
the **architecture-cleanup, ownership-cleanup, governance-enforcement, and
test-stabilization** work was implemented in four logical commits. Browser runtime
validation confirmed the Administration landing now shortcuts into Organization
rather than duplicating it.

A set of **RBAC access-policy inconsistencies** surfaced in Stream E (orphan menu
links, middleware-vs-layout disagreement on `/settings`, broad page guards). These
are *access decisions* that change who can reach what. Per the sprint restrictions
(**no RBAC regression, no business-logic change**) and because each was flagged
"confirm with stakeholder," they are documented here as a prioritized backlog rather
than silently altered.

---

## 2. Files changed

| Commit | File | Change |
|---|---|---|
| 1 `refactor(nav)` | `config/admin-landing.ts` | `org-setup` group: 8 master-data cards → 1 "Open Organization" shortcut (→`/master-data`). `leave-time` group: removed Work Schedules + Holiday Calendars (org-owned). |
| 1 | `app/(hr-admin)/settings/page.tsx` | Removed now-dead count queries (departments/positions/jobs/grades/holidays) + their imports. |
| 1 | `tests/unit/settings-landing.test.ts` | SL-011 re-pointed to live queries; SL-012 rewritten to assert operational set + `open-org` and *absence* of org master-data cards. |
| 2 `refactor(arch)` | `app/(hr-admin)/settings/_nav/SettingsNav.tsx` | **Deleted** (dead — nested settings sidebar removed in 5780f8d). |
| 2 | `app/(hr-admin)/settings/SettingsHubClient.tsx` | **Deleted** (dead — replaced by inline landing). |
| 2 | `tests/unit/admin-rbac-visibility.test.ts` | Removed redundant RBAC-V-003 / RBAC-V-005 (pinned the dead files); coverage retained by RBAC-V-001/004/009/010/011. |
| 3 `test(rbac)` | `tests/security/rbac-tests.test.ts` | RBAC-008 window anchored to `.insert(persons)` call (drift-proof); assertion unchanged. |
| 4 `test(nav)` | `tests/unit/nav-depth-governance.test.ts` | **New** — NAVDEPTH-001..012 max-depth-2 governance + type-source guard. |

Commits: `103f4bc`, `e8e62f3`, `6532a11`, `8183289`.

---

## 3. Ownership cleanup (Objective 1) — DONE

**Single owner achieved.** The Organization workspace owns all org master data
(legal entities, business units, departments, positions, grades, jobs, locations,
work schedules, holiday calendars, projects, leave types). Administration now holds
**one shortcut** ("Open Organization" → `/master-data` → redirects to the
Organization workspace entry).

Runtime proof (SUPER_ADMIN, `/settings`, port 3003):
- Organization Setup → single card "Open Organization" → `/master-data`.
- Leave & Time → Leave Rules, Absence Types, Backdate Policy only.
- `/master-data` → 302 → `/master-data/legal-entities` (Organization workspace). 0 console errors.

`workspace-nav.ts` and `admin-nav.ts` required **no change** — they never duplicated
org data under an Administration heading, so the two-nav-file sync invariant was not
triggered.

---

## 4. Architecture debt removed (Objective 2 / Stream D) — DONE

- `SettingsNav.tsx` (180 LOC) and `SettingsHubClient.tsx` deleted — proven zero
  runtime references (only a layout comment + source-inspection tests).
- 2 redundant tests removed; remaining tests assert the live config.
- **Kept** (proven still used): `config/settings-hub.ts` (SettingsDetailShell +
  CommandPalette), all `comingSoon` placeholder routes, `isNew` flags (cosmetic),
  and the git-ignored local-only `admin-preview/` dev page.
- Nav config imports audited: **no unused imports**; every non-`comingSoon` route
  resolves to a real page.

---

## 5. RBAC-008 resolution (Objective 3 / Stream C) — DONE

**Root cause: stale test, not a security gap.** Production `createPerson`
(`modules/core-hr/actions.ts`) explicitly sets `tenantId: TENANT_ID` on the persons
insert (and on `workerAssignments` / `workScheduleAssignments`). The test sliced a
fixed 4000-char window from the function start; the function grew (work-schedule
lookup + person-number generation) and pushed the insert past offset 4000.

**Fix:** anchor the inspection window to the `.insert(persons)` call site rather than
a fixed byte offset. Drift-proof, and the assertion (`/tenantId\s*:\s*TENANT_ID/`)
is unchanged — security coverage **not weakened**. RBAC suite: 60/60 pass.

---

## 6. Navigation governance (Objective 4 / Stream B) — DONE

New `tests/unit/nav-depth-governance.test.ts` (12 tests) enforces **max depth = 2**:

- Per-workspace navigable depth ≤ 2 (section-heading groups are transparent).
- Every leaf item across all six nav surfaces (WORKSPACE_NAV, ADMIN_NAV,
  MANAGER_NAV, EMPLOYEE_NAV, ADMIN_LANDING, SETTINGS_HUB) carries no nested
  collection.
- Type-source guards fail the instant `WorkspaceItem`/`NavItem`/`AdminCard`/
  `SettingsItem` gains a `children`/nested-`items` field.
- The 11 expected workspaces are asserted present.

Current state: **0 depth-3 violations** anywhere.

---

## 7. Role validation audit (Objective 5 / Stream E)

All **seven roles are real and live** (not aspirational): `SUPER_ADMIN`,
`HR_DIRECTOR`, `HR_ADMIN`, `PAYROLL_ADMIN`, `FINANCE`, `MANAGER`, `EMPLOYEE`
(`lib/auth.ts` KRole union; dev accounts; middleware ROLE_HOME / ROLE_GATED_PATHS).

### 7.1 Role matrix (current behavior)

| Role | Shell / Nav source | Visible workspaces (effective) | Config areas (admin landing) | Blocked / bounced | Landing |
|---|---|---|---|---|---|
| **SUPER_ADMIN** | WorkspaceRail + WORKSPACE_NAV | All 11 incl. DataOps | All 8 groups incl. **Platform & System** | — | `/dashboard` |
| **HR_DIRECTOR** | WorkspaceRail + WORKSPACE_NAV | 10 (no DataOps) | 7 groups (no Platform); Payroll full | DataOps, Platform & System, feature-permissions | `/dashboard` |
| **HR_ADMIN** | WorkspaceRail + WORKSPACE_NAV | 10 (no DataOps) | HR-operational groups; Payroll = Currency only; no Platform | Payroll runs/WPS, Platform, feature-permissions, DataOps | `/dashboard` |
| **PAYROLL_ADMIN** | WorkspaceRail + WORKSPACE_NAV (unfiltered) | Thin — Payroll is all `comingSoon`; Reports empty → bounce | Payroll group (D,S,P,F cards) | `/settings`, `/master-data`, `/users`, `/access` (middleware → `/dashboard`); Reports bounce | `/dashboard` |
| **FINANCE** | WorkspaceRail + WORKSPACE_NAV (unfiltered) | Thin — Payroll `comingSoon`; a few reports | Payroll group | Same as PAYROLL_ADMIN; partial Reports | `/dashboard` |
| **MANAGER** | AdminSidebar + ADMIN_NAV | Effective: Dashboard, Employees (read), Org Chart, Directory, Leave, Timesheets, Approvals, Reports, ARIA | — (no `/settings` access) | Users, Master Data, Probation, Exit, Workflow Builder, Settings, Feature Permissions all **shown but bounce** | `/dashboard` |
| **EMPLOYEE** | Employee layout + EMPLOYEE_NAV | ESS only (`/me/*`) | — | All `/(hr-admin)` routes | `/me` |

### 7.2 RBAC findings — BACKLOG (not changed this sprint)

These alter *who can reach what*; per restrictions they require stakeholder sign-off
before any code change. None is a new regression introduced by this sprint.

| ID | Severity | Finding | Recommended resolution |
|---|---|---|---|
| RBAC-BL-01 | Medium | `/settings` middleware (HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN) **disagrees** with `settings/layout.tsx` (also admits PAYROLL_ADMIN/FINANCE). PAYROLL_ADMIN/FINANCE see a Settings link that bounces to `/dashboard`. | Align layout array to middleware (strictest); add explicit role guard to `settings/page.tsx`. |
| RBAC-BL-02 | Low | `settings/page.tsx` has only a session check, no role guard (relies on layout + middleware). | Add page-level role guard (defense-in-depth). |
| RBAC-BL-03 | Low | Config-grade routes not in middleware ROLE_GATED_PATHS: `/configuration`, `/admin/probation`, `/admin/exit-clearance` (page-guarded only). | Add middleware entries; order `/admin/dataops` before any broad `/admin` entry. |
| RBAC-BL-04 | Low/Bug | `employee-letters/page.tsx` redirects to non-existent `/login` and has no role guard. | Fix to `/sign-in`; decide HR-only vs broad access. |
| RBAC-BL-05 | Low | Orphan menu links for PAYROLL_ADMIN/FINANCE (Users & Roles, Probation, Exit, Workflow Builder/Groups/Delegations, Reports) — visible, route bounces. | Add optional `roles?: string[]` to nav item schema; filter in rail/secondary nav. Visibility-only. |
| RBAC-BL-06 | Low | MANAGER's ADMIN_NAV exposes HR-only sections that bounce on click. | Trim ADMIN_NAV to MANAGER-reachable routes. Visibility-only. |
| RBAC-BL-07 | Medium | `admin/dataops` page guard allows all 7 roles (read) while nav is SUPER_ADMIN-only — URL is guessable. | Confirm intended read scope; tighten guard or document the scoped-read design. |
| RBAC-BL-08 | Low | Inconsistent unauthorized-redirect targets (`/me` vs `/dashboard`) cause double-redirect hops. | Standardize on a `roleHome(role)` helper from ROLE_HOME. |

---

## 8. Test results (this sprint)

| Suite | Result |
|---|---|
| `pnpm typecheck` | 0 errors |
| `pnpm lint` | 0 errors (pre-existing `<img>` warnings only) |
| `pnpm build` | exit 0 (all pages compiled) |
| Unit (`tests/unit`) | 1299 pass, 2 expected skip |
| Security (`tests/security`) | 180 pass |
| RBAC (`rbac-tests.test.ts`) | 60 pass (RBAC-008 restored) |
| Nav governance (new) | 12 pass |
| Browser runtime (SUPER_ADMIN `/settings`) | Verified — Open Organization shortcut, no console errors |

---

## 9. Regression risks

- **Low overall.** Changes are config-list edits, dead-file deletion, and test
  changes. No route, guard, schema, or business-logic change.
- `/master-data` redirect is pre-existing and unchanged; the shortcut depends on it.
- Dead-component deletion verified by repo-wide grep (zero runtime refs) + build +
  typecheck.
- RBAC backlog items (§7.2) are pre-existing; leaving them unchanged carries **no new
  risk** but the orphan-menu UX persists until addressed.

---

## 10. Production readiness

- ✅ All in-scope objectives (1–4, 6) complete and verified.
- ✅ QA gate green (typecheck, lint, build, unit, security, RBAC, governance).
- ✅ Runtime browser validation passed.
- ⚠️ RBAC access-policy backlog (§7.2) awaits stakeholder decisions before any code
  change — these are not deployment blockers for this sprint's scope.

**Recommendation:** Ready for UAT of the navigation/ownership/governance changes.
Schedule a follow-up to triage the §7.2 RBAC backlog with stakeholder input.
