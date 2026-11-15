# AVANIIS HR — E2E Test Traceability Matrix
> Generated: 2026-05-12 | **Last run: 2026-05-22 | 85/96 ✅ | 11/96 ⏭️**

## How to update this matrix
After each test run, paste the Playwright JSON report into Claude and ask:
"Update the matrix checkboxes from this report."
Or run: `pnpm playwright test --reporter=json > tests/e2e/last-run.json`

---

## Legend
| Symbol | Meaning |
|--------|---------|
| ⬜ | Not run |
| ✅ | Pass |
| ❌ | Fail |
| ⏭️ | Skipped |
| 🔒 | Blocked (dependency not met) |

---

## SUPER_ADMIN Profile

| TC ID | Module | Test Name | Route | Status | Last Run | Notes |
|-------|--------|-----------|-------|--------|----------|-------|
| SA-001 | Settings | AI Agent config loads with 5 tabs | /settings/ai-agent | ✅ | 2026-05-22 | |
| SA-002 | Settings | Appearance page loads | /settings/appearance | ✅ | 2026-05-22 | |
| SA-003 | Settings | Branding page loads | /settings/branding | ✅ | 2026-05-22 | |
| SA-004 | Settings | Compliance settings load | /settings/compliance | ✅ | 2026-05-22 | |
| SA-005 | Settings | Custom fields list + new form | /settings/custom-fields | ✅ | 2026-05-22 | |
| SA-006 | Settings | Delegations list loads | /settings/delegations | ✅ | 2026-05-22 | |
| SA-007 | Settings | Employee numbers settings load | /settings/employee-numbers | ✅ | 2026-05-22 | |
| SA-008 | Settings | Form layout drag-drop editor loads | /settings/form-layout | ✅ | 2026-05-22 | |
| SA-009 | Settings | Leave rules editor loads | /settings/leave-rules | ✅ | 2026-05-22 | |
| SA-010 | Settings | Notification settings load | /settings/notifications | ✅ | 2026-05-22 | |
| SA-011 | Settings | Permissions page loads | /settings/permissions | ✅ | 2026-05-22 | |
| SA-012 | Settings | Policy settings load | /settings/policy | ✅ | 2026-05-22 | |
| SA-013 | Settings | Work schedules settings load | /settings/work-schedules | ✅ | 2026-05-22 | |
| SA-014 | Users | User list loads with at least one row | /users | ✅ | 2026-05-22 | |
| SA-015 | Users | New user form loads + validates empty submit | /users/new | ✅ | 2026-05-22 | No DB write |
| SA-016 | Access | Feature permission toggles load | /access/feature-permissions | ✅ | 2026-05-22 | |
| SA-017 | Access | SUPER_ADMIN can reach ai-agent settings | /settings/ai-agent | ✅ | 2026-05-22 | Role guard |
| SA-018 | Settings | Workflows settings load | /settings/workflows | ✅ | 2026-05-22 | |

---

## HR_ADMIN Profile

| TC ID | Module | Test Name | Route | Status | Last Run | Notes |
|-------|--------|-----------|-------|--------|----------|-------|
| HA-001 | MDM | Legal entities list + create drawer + history | /master-data/legal-entities | ✅ | 2026-05-22 | |
| HA-002 | MDM | Departments list + create + history | /master-data/departments | ✅ | 2026-05-22 | |
| HA-003 | MDM | Positions list + create + history | /master-data/positions | ✅ | 2026-05-22 | |
| HA-004 | MDM | Grades list + create + history | /master-data/grades | ✅ | 2026-05-22 | |
| HA-005 | MDM | Locations list + create + history | /master-data/locations | ✅ | 2026-05-22 | |
| HA-006 | MDM | Work schedules list + create + history | /master-data/work-schedules | ✅ | 2026-05-22 | |
| HA-007 | MDM | Holiday calendars list + create + history | /master-data/holiday-calendars | ✅ | 2026-05-22 | |
| HA-008 | MDM | Leave types list + create + history | /master-data/leave-types | ✅ | 2026-05-22 | |
| HA-009 | MDM | Jobs list + create + history | /master-data/jobs | ✅ | 2026-05-22 | |
| HA-010 | Persons | Person list + filter bar + search | /persons | ✅ | 2026-05-22 | |
| HA-011 | Persons | New employee form validates empty submit | /persons/new | ✅ | 2026-05-22 | No DB write |
| HA-012 | Persons | Person detail page + tabs visible | /persons/[id] | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed) |
| HA-013 | Persons | Person edit form + drawer | /persons/[id]/edit | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed) |
| HA-014 | Persons | Bank details PII masking | /persons/[id]/bank-details | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed) |
| HA-015 | Persons | Dependents section loads | /persons/[id]/dependents | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed) |
| HA-016 | Persons | Documents list container loads | /persons/[id]/documents | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed) |
| HA-017 | Absence | Leave list + filter bar | /absence | ✅ | 2026-05-22 | |
| HA-018 | Absence | New leave 50/50 split layout | /absence/new | ✅ | 2026-05-22 | No DB write |
| HA-019 | Absence | Decision bar: exactly 3 buttons (BR-29) | /absence/[id] | ✅ | 2026-05-22 | BR-29 |
| HA-020 | Absence | Balance cards render | /absence/balances | ✅ | 2026-05-22 | |
| HA-021 | Absence | Calendar renders | /absence/calendar | ✅ | 2026-05-22 | |
| HA-022 | Absence | Rules editor loads | /absence/rules | ✅ | 2026-05-22 | |
| HA-023 | Workflow | Definitions list loads | /configuration/workflows | ✅ | 2026-05-22 | |
| HA-024 | Workflow | Step editor + ConditionBuilder | /configuration/workflows/[id] | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed) |
| HA-025 | Workflow | Delegations list | /configuration/workflows/delegations | ✅ | 2026-05-22 | |
| HA-026 | Workflow | Approval groups list | /configuration/workflows/groups | ✅ | 2026-05-22 | |
| HA-027 | Workflow | Approvals inbox renders | /approvals | ✅ | 2026-05-22 | |
| HA-028 | Workflow | Approval decision: exactly 3 buttons (BR-29) | /approvals/[id] | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed; BR-29) |
| HA-029 | Workflow | SLA cron endpoint returns 200 | /api/cron/workflow-sla | ⏭️ | 2026-05-22 | Expected skip — CRON_SECRET not present in CI |
| HA-030 | Org Chart | Canvas loads with nodes | /org-chart | ✅ | 2026-05-22 | |
| HA-031 | Org Chart | Filter panel opens | /org-chart | ✅ | 2026-05-22 | |
| HA-032 | Org Chart | Search highlights nodes | /org-chart | ✅ | 2026-05-22 | |
| HA-033 | Org Chart | Expand/collapse subtree | /org-chart | ✅ | 2026-05-22 | |
| HA-034 | Org Chart | Export PNG button visible + not disabled | /org-chart | ✅ | 2026-05-22 | |
| HA-035 | Reports | HRAdminDashboard + KPICards | /reports | ✅ | 2026-05-22 | |
| HA-036 | Timesheets | HR admin timesheet view | /timesheets | ✅ | 2026-05-22 | |
| HA-037 | Directory | Card grid + search | /directory | ✅ | 2026-05-22 | |
| HA-038 | ARIA OS | Dark theme + 9-tab strip | /aria | ✅ | 2026-05-22 | |
| HA-039 | ARIA OS | UAE Labour Law tab renders | /aria | ✅ | 2026-05-22 | |
| HA-040 | ARIA OS | Reports tab renders 8 cards | /aria | ✅ | 2026-05-22 | |
| HA-041 | ARIA OS | Alerts tab + filter tabs | /aria | ✅ | 2026-05-22 | |
| HA-042 | ARIA OS | Approvals tab inline buttons | /aria | ✅ | 2026-05-22 | |
| HA-043 | ARIA OS | Compliance tab ScoreRing SVG | /aria | ✅ | 2026-05-22 | |
| HA-044 | Global UI | Notification bell + panel | top bar | ✅ | 2026-05-22 | |
| HA-045 | Global UI | Global search dropdown | top bar | ✅ | 2026-05-22 | |
| HA-046 | Global UI | Profile menu opens | top bar | ✅ | 2026-05-22 | |
| HA-047 | Security | HR_ADMIN blocked from SA settings | /settings/ai-agent | ✅ | 2026-05-22 | Role guard |

---

## MANAGER Profile

| TC ID | Module | Test Name | Route | Status | Last Run | Notes |
|-------|--------|-----------|-------|--------|----------|-------|
| MG-001 | Timesheets | Team timesheet view loads | /timesheets/team | ✅ | 2026-05-22 | |
| MG-002 | Org Chart | My Team shortcut visible | /org-chart | ✅ | 2026-05-22 | |
| MG-003 | Absence | Leave list scoped to team | /absence | ✅ | 2026-05-22 | |
| MG-004 | Absence | Decision bar 3 buttons (BR-29) | /absence/[id] | ⏭️ | 2026-05-22 | Expected skip — seed data not present in CI (@requiresSeed; BR-29) |
| MG-005 | Approvals | Inbox renders | /approvals | ✅ | 2026-05-22 | |
| MG-006 | Workflow | Workflow instances list | /workflows | ✅ | 2026-05-22 | |
| MG-007 | Reports | ManagerDashboard (not HR dashboard) | /reports | ✅ | 2026-05-22 | Role scope |
| MG-008 | ARIA | Floating widget opens | all pages | ✅ | 2026-05-22 | |
| MG-009 | ARIA | Team query returns real data | /me/aria | ✅ | 2026-05-22 | No hallucinations |
| MG-010 | Security | Blocked from Settings | /settings/ai-agent | ✅ | 2026-05-22 | Role guard |
| MG-011 | Security | Blocked from Users | /users | ✅ | 2026-05-22 | Role guard |
| MG-012 | Security | Blocked from MDM | /master-data/departments | ✅ | 2026-05-22 | Role guard |
| MG-013 | Security | Blocked from Persons admin | /persons | ✅ | 2026-05-22 | Role guard |
| MG-014 | Security | Blocked from ARIA OS | /aria | ✅ | 2026-05-22 | Role guard |

---

## EMPLOYEE Profile

| TC ID | Module | Test Name | Route | Status | Last Run | Notes |
|-------|--------|-----------|-------|--------|----------|-------|
| EM-001 | ESS | Dashboard loads | /me | ✅ | 2026-05-22 | |
| EM-002 | ESS | Profile tabs all visible | /me/profile | ⏭️ | 2026-05-22 | Expected skip — employee@avaniis.dev has no linked person record in CI (@requiresPerson) |
| EM-003 | ESS | Personal timesheet + exception form | /me/timesheet | ✅ | 2026-05-22 | |
| EM-004 | ESS | Accommodations page loads | /me/accommodations | ✅ | 2026-05-22 | |
| EM-005 | ESS | My requests list | /me/requests | ✅ | 2026-05-22 | |
| EM-006 | ESS | ARIA employee chat + input | /me/aria | ✅ | 2026-05-22 | |
| EM-007 | ESS | Employee directory search | /me/directory | ✅ | 2026-05-22 | |
| EM-008 | ESS | Org chart accessible | /org-chart | ✅ | 2026-05-22 | All-role access |
| EM-009 | ESS | DSAR download button visible | /me/profile | ⏭️ | 2026-05-22 | Expected skip — employee@avaniis.dev has no linked person record in CI (@requiresPerson) |
| EM-010 | ESS | Theme preference persists on reload | /me/profile | ✅ | 2026-05-22 | |
| EM-011 | ESS | Leave request form accessible | /me/requests | ✅ | 2026-05-22 | @requiresPerson — passed in this run; see notes |
| EM-012 | Security | Blocked from Persons admin | /persons | ✅ | 2026-05-22 | Role guard |
| EM-013 | Security | Blocked from HR Absence admin | /absence | ✅ | 2026-05-22 | Role guard |
| EM-014 | Security | Blocked from MDM | /master-data/departments | ✅ | 2026-05-22 | Role guard |
| EM-015 | Security | Blocked from Users | /users | ✅ | 2026-05-22 | Role guard |
| EM-016 | Security | Blocked from ARIA OS | /aria | ✅ | 2026-05-22 | Role guard |
| EM-017 | Security | Blocked from Reports admin | /reports | ✅ | 2026-05-22 | Role guard |

---

## Summary

| Profile | Total | ✅ Pass | ❌ Fail | ⏭️ Skip | ⬜ Not Run |
|---------|-------|---------|---------|---------|-----------|
| SUPER_ADMIN | 18 | 18 | 0 | 0 | 0 |
| HR_ADMIN | 47 | 39 | 0 | 8 | 0 |
| MANAGER | 14 | 13 | 0 | 1 | 0 |
| EMPLOYEE | 17 | 15 | 0 | 2 | 0 |
| **TOTAL** | **96** | **85** | **0** | **11** | **0** |

> **Note:** 102 tests ran in the E2E suite (91 pass, 11 skip); 96 are tracked in this matrix. 6 tests added to spec files after this matrix was generated are not yet listed. All 91 non-skipped tests pass.

---

## How to run

```bash
# All roles (role projects only)
pnpm playwright test --project=super-admin --project=hr-admin --project=manager --project=employee

# Single role
pnpm playwright test --project=hr-admin

# With UI
pnpm playwright test --ui

# Generate JSON for matrix update
pnpm playwright test --reporter=json > tests/e2e/last-run.json
```

## Updating this matrix after a run
Paste `tests/e2e/last-run.json` content into Claude and say:
"Update TEST_TRACEABILITY_MATRIX.md checkboxes from this Playwright JSON report."

---

## Important notes

| Note | Detail |
|------|--------|
| Actual dev emails | `super.admin@avaniis.dev`, `hr.admin@avaniis.dev`, `manager@avaniis.dev`, `employee@avaniis.dev` |
| Password | `demo` for all roles |
| SLA cron (HA-029) | Requires `CRON_SECRET` set in `.env.local` — skipped otherwise |
| @requiresSeed tests | Skip when DB has no seed data for the relevant entity |
| @requiresPerson tests | Skip when `employee@avaniis.dev` has no linked `persons` record |
| BR-29 | Every leave/approval decision panel must expose exactly 3 buttons: Approve, Reject, Delegate |
| EM-011 | Also tagged @requiresPerson in spec; passed in 2026-05-22 run (employee record present or graceful fallback) |
