# Phase C — Design Review: RBAC & Workflow Operations

> Branch: `feat/workflow-intelligence-platform` · Status: **DESIGN ONLY — no code, awaiting approval**
> Depends on: Phase A (read model) + Phase B (`getWorkflowOperations` already built & tested).

---

## 0. Critical finding that reshapes Phase C (read first)

The blueprint said *"seed `feature_permissions` for all 7 roles (migration 0058) and enforce."* On inspection of the live code, that is based on a misread of the model:

- **`feature_permissions` has only 3 role buckets** — `employeePerms`, `managerPerms`, `hrAdminPerms` (JSONB `{view,create,edit,delete,approve,export}`), one row per `feature_key` (`drizzle/schema/configuration.ts:539`). There are **no** columns for PAYROLL_ADMIN, FINANCE, HR_DIRECTOR, SUPER_ADMIN.
- **No runtime gate consults it.** A search for `hasFeaturePermission` / `canAccessFeature` / any resolver returns nothing. `feature_permissions` is a **configuration/display matrix** edited at `/access/feature-permissions`; it is **not** the live authorization layer.
- **Actual enforcement** is three real layers: `requireRole()` (role lists), `middleware.ts` `ROLE_GATED_PATHS` (path prefixes), and Phase B's `evaluateViewerAccess` (row-level).

**Design decision (recommended): do NOT add a 7-bucket schema migration in Phase C.** Forcing 4 new JSONB columns + a resolver + wiring it as a new enforcement layer is a large, risky change that would touch the existing `/access/feature-permissions` UI and is *not* required to ship Workflow Operations. Phase C enforces the new surface with the **proven** layers (`requireRole` + middleware + `getWorkflowOperations`' built-in gate). The 7-role `feature_permissions` expansion is recorded as a **separate future RBAC-hygiene item**, not part of Phase C.

→ This keeps Phase C **migration-light** (optionally zero migrations — see §2) and avoids destabilizing a working config screen.

---

## 1. Exact files to be modified / added

### Added
| File | Purpose |
|---|---|
| `app/(hr-admin)/approvals/operations/page.tsx` | NEW — org-wide Workflow Operations console (HR+); reads `getWorkflowOperations` |
| `tests/unit/wip-phase-c.test.ts` | NEW — WIPC-001…0xx (role/entity matrix, nav, middleware) |

### Changed (small, additive)
| File | Change |
|---|---|
| `middleware.ts` | Add `ROLE_GATED_PATHS` entry: `{ prefix: '/approvals/operations', allowed: ['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN'] }` (defense-in-depth path gate) |
| `config/workspace-nav.ts` | Add a "Workflow Operations" nav item (route `/approvals/operations`) under the existing Approvals group, visible to HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN |
| `config/admin-nav.ts` | (Consistency) keep MANAGER nav unchanged; **no** Operations item for MANAGER. Optionally fix the pre-existing MANAGER "Feature Permissions" nav entry that doesn't match its HR-only middleware gate (flagged, low priority) |
| `modules/workflow-intelligence/index.ts` | Already exports `getWorkflowOperations` (Phase B) — no change needed |

> **Not touched:** `lib/workflow-engine.ts`, `workflow-hierarchy.ts`, `modules/absence/*`, the existing `/approvals` pending/history pages, `/approvals/[instanceId]` detail, dashboards, reports, `/access/feature-permissions`.

---

## 2. Migrations required

**Recommended: NONE.** `getWorkflowOperations` reads the Phase A `workflow_intelligence_view` (already applied). RBAC is enforced in code. No schema change.

**Optional (config-only, not schema):** one `feature_permissions` *row* for a `workflow.operations` feature key in the existing 3-bucket shape, purely so the `/access/feature-permissions` matrix lists it for visibility. This is an idempotent `INSERT … ON CONFLICT (feature_key) DO NOTHING` (data, not DDL) — include only if you want it surfaced on that screen. **It does not gate anything.** If approved, it lands in the migration folder + the production bundle as a data seed (clearly marked "config seed, not enforcement").

→ Phase C adds **0 schema migrations**. (The blueprint's `0058` is dropped per §0.)

---

## 3. New permissions / feature_permissions

- **No new enforcement permissions.** Access to Workflow Operations is enforced by `requireRole` (page), `ROLE_GATED_PATHS` (middleware), and `getWorkflowOperations`' internal `HIGH_PRIVILEGE` gate + entity scope.
- **Optional config row** (`workflow.operations`, group "Workflows"): `hrAdminPerms={view,export:true}`, `managerPerms`/`employeePerms` all-false. Display-only.

---

## 4. Full role matrix (Workflow Operations + existing surfaces)

| Role | `/approvals` Pending | `/approvals` My-decisions | `/approvals/[id]` detail | **`/approvals/operations` (NEW)** | Scope on Operations |
|---|---|---|---|---|---|
| **SUPER_ADMIN** | ✅ own queue | ✅ own | ✅ any (Phase B) | ✅ | **All legal entities** |
| **HR_DIRECTOR** | ✅ own queue | ✅ own | ✅ entity-scoped | ✅ | **Own legal entity** |
| **HR_ADMIN** | ✅ own queue | ✅ own | ✅ entity-scoped | ✅ | **Own legal entity** |
| **MANAGER** | ✅ own queue | ✅ own | ✅ stakeholder-only | ❌ redirect | — |
| **EMPLOYEE** | ✅ own queue | ✅ own | ✅ stakeholder-only | ❌ redirect | — |
| **PAYROLL_ADMIN** | ✅ own queue | ✅ own | ✅ stakeholder-only | ❌ redirect (Phase C) | — *(payroll-scoped ops = future)* |
| **FINANCE** | ✅ own queue | ✅ own | ✅ stakeholder-only | ❌ redirect (Phase C) | — |

This matrix is exactly what `getWorkflowOperations` already enforces (Phase B): `HIGH_PRIVILEGE = {HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN}`; non-privileged → empty; SUPER_ADMIN → all entities, others → `legal_entity_id = session.legalEntityId`.

> **Note on PAYROLL_ADMIN/FINANCE:** the original brief floated "payroll sees payroll workflows" in Operations. That requires a payroll-scoped variant and is **deferred** (not in Phase C) to keep the gate single and proven. They retain full personal approval access; they just don't get the org-wide console yet.

---

## 5. Who can access `/approvals/operations`

`HR_ADMIN`, `HR_DIRECTOR`, `SUPER_ADMIN` only. Enforced at **three** layers (defense-in-depth):
1. **Middleware** `ROLE_GATED_PATHS` → non-allowed roles redirected to their role home before the page renders.
2. **Page** `requireRole(['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN'])` (server component guard).
3. **Service** `getWorkflowOperations` returns empty for any other role (fail-safe even if a route slips).

---

## 6. Legal-entity scoping rules

- **SUPER_ADMIN:** unscoped — sees all `legal_entity_id`s (global oversight).
- **HR_ADMIN / HR_DIRECTOR:** scoped to `session.user.legalEntityId` (their own entity). `getWorkflowOperations` injects `WHERE legal_entity_id = :viewerEntity`.
- Scope is applied in **SQL**, not post-filtered in JS — no cross-entity rows ever leave the DB for a scoped admin.
- (Multi-entity HR admins: the session currently carries a single `legalEntityId`. Broadening to `allowedEntityIds` is a future enhancement; Phase C scopes to the primary entity, which is conservative and correct.)

## 7. Cross-entity access rules

- Only **SUPER_ADMIN** crosses entities. HR_ADMIN/HR_DIRECTOR **cannot** see another entity's workflows in Operations — identical to the Phase B detail-page rule. No cross-entity leakage path exists (SQL-scoped).
- Aggregates (pending count, breached count, bottleneck-by-approver) are computed **within the same scoped query**, so an HR admin's totals reflect only their entity.

## 8. Example workflows visible to each role (Operations console)

- **SUPER_ADMIN:** every in-flight + completed instance across all entities — e.g. Annual Leave (Entity A), Sick Leave (Entity B), Hiring (Entity C), Transfers, Probation.
- **HR_DIRECTOR / HR_ADMIN (Entity A):** only Entity-A instances — e.g. Shakeel's Annual Leave, John's Annual Leave, Entity-A hiring requests; **not** Entity-B's.
- **MANAGER / EMPLOYEE / PAYROLL_ADMIN / FINANCE:** Operations not accessible. They still see their **own** pending queue and decision history on `/approvals` (unchanged).

---

## 9. Impact on existing approvals screens

**None.** `/approvals` (Pending + My-decisions tabs) and `/approvals/[instanceId]` (detail, Phase B) are untouched. Operations is a **new, separate** route. No change to data sources, queries, or behavior of existing screens.

## 10. Impact on dashboards

**None in Phase C.** Dashboards are not modified. (The `getWorkflowOperations` aggregates *could* later feed an HR dashboard widget — explicitly out of scope here.)

## 11. Impact on navigation

- **Added:** one "Workflow Operations" item in `config/workspace-nav.ts` (HR workspace rail), shown to HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN. Employees/managers (who use `EmployeeSidebar` / `admin-nav.ts`) do **not** see it.
- **Unchanged:** the existing "Approvals" item (all approver roles). The employee sidebar Approvals item (Phase-prior) is unaffected.
- **Optional consistency fix (flagged):** `admin-nav.ts` shows MANAGER a "Feature Permissions" entry while middleware gates `/access` to HR-only — a pre-existing mismatch. Low priority; can be corrected in Phase C or deferred.

## 12. Impact on reporting

**None.** The `reports/` module is untouched. Operations is operational oversight, not a report. (A future "workflow throughput / SLA" report could reuse `getWorkflowOperations` — out of scope.)

---

## 13. Rollback plan

Pure code revert — **no DB to undo** (no schema migration):
1. `git revert <phase-c-commit>` → removes the Operations page, the nav item, and the middleware gate.
2. `getWorkflowOperations` (Phase B) remains but is unreferenced and harmless.
3. If the optional `feature_permissions` config row was seeded: `DELETE FROM feature_permissions WHERE feature_key='workflow.operations';` (data-only, safe).

No impact on existing approvals, dashboards, reports, or navigation for other roles.

## 14. Test plan (`tests/unit/wip-phase-c.test.ts`)

| ID | Test |
|---|---|
| WIPC-001..003 | `getWorkflowOperations` role gate: HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN allowed; MANAGER/EMPLOYEE/PAYROLL_ADMIN/FINANCE → empty result |
| WIPC-004..005 | Entity scope: HR roles → `legal_entity_id = viewer entity` clause present; SUPER_ADMIN → unscoped (`TRUE`) |
| WIPC-006 | Aggregates computed within the scoped query (pending/breached/byApprover) |
| WIPC-007..008 | Middleware `ROLE_GATED_PATHS` includes `/approvals/operations` for exactly the 3 HR roles; non-HR redirected |
| WIPC-009 | Operations page calls `requireRole(['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN'])` (server guard) |
| WIPC-010 | `workspace-nav.ts` Operations item visible to HR roles only; absent from employee/manager nav |
| WIPC-011 | Existing `/approvals` pending/history + `/approvals/[id]` unchanged (no diff to their data sources) |
| WIPC-012 | Phase C adds **0 schema migrations** (migration set unchanged vs Phase B) |

Plus required validation: `pnpm typecheck` (0 errors) · targeted Phase C tests · full unit suite green · production build.

---

## Summary of decisions for your approval
1. **No 7-bucket `feature_permissions` migration** — enforce via the proven layers (recommended). ✅/✏️?
2. **Operations = HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN only**, entity-scoped (SUPER global). ✅/✏️?
3. **PAYROLL_ADMIN/FINANCE excluded from Operations in Phase C** (payroll-scoped ops deferred). ✅/✏️?
4. **0 schema migrations** (optional display-only config row available if you want it). ✅/✏️?
