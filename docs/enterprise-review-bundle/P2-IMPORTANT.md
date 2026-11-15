# AVANIIS HR — Enterprise Review Extraction Bundle
## PRIORITY 2 — IMPORTANT
Generated: 2026-06-13 · Source repo: /Users/d.kethari/D_Drive/AVANIIS_HR_SYS · Branch: main
Delimiter: each file begins at a line of '=' with FILE [id]: <path>. Content is verbatim, unmodified.

================================================================================
FILE [P2-01]: docs/architecture/phase-b-design-review.md
LINES: 172
================================================================================
# Phase B — Design Review: Shared Services & Universal Timeline

> Branch: `feat/workflow-intelligence-platform` · Status: **DESIGN ONLY — no code, awaiting approval**
> Depends on: Phase A (read model) — applied & durably verified.
> Guarantee: Phase B is **additive and behind existing routes**. No migration, no schema change, no engine/routing/leave-submission behavior change.

---

## 1. Exact files to be added / changed

### Added (new)
| File | Purpose |
|---|---|
| `modules/workflow-intelligence/index.ts` | Module barrel (the only module that queries `workflow_intelligence_view`) |
| `modules/workflow-intelligence/queries.ts` | The 6 read services (Section 2) |
| `modules/workflow-intelligence/types.ts` | `WorkflowTimeline`, `NotificationPreview`, `WorkflowOpsRow`, `WorkflowIntelligenceRow`, paginated-result types |
| `lib/workflow-status.ts` | Single source for status → label/color/icon (bilingual). Replaces scattered inline status maps |
| `components/workflow/WorkflowTimeline.tsx` | One timeline component (steps + audit, merged, chronological) used by every surface |
| `components/workflow/WorkflowStatusBadge.tsx` | Status pill driven by `lib/workflow-status.ts` |
| `tests/unit/wip-phase-b.test.ts` | Phase B tests (Section 10) |

### Changed (additive, behavior-preserving)
| File | Change | Risk control |
|---|---|---|
| `app/(hr-admin)/approvals/[instanceId]/page.tsx` | Swap data source `getWorkflowInstanceDetailV2` → `getWorkflowTimeline(session, id)`; render `WorkflowTimeline` in place of the inline approval-chain + audit cards. Action form logic unchanged. | If `getWorkflowTimeline` returns `null` → `notFound()` (today it renders). Net effect: **adds** authorization; authorized users see identical content |
| `modules/workflow/queries.ts` | `getWorkflowInstanceDetailV2`, `getPendingApprovalsV2`, `getApprovalHistoryForUser` become **thin re-exports / wrappers** of the new view-backed implementations (kept for import-compat). No signature change. | Backward-compatible; existing callers untouched |
| `modules/aria/approval-queries.ts` | `getPendingApprovalsForUser`, `getLeaveRecommendationForInstance`, `getLeaveRequestSummaryForInstance` retained; `getApprovalNotificationPreview` added and used by the bell. | Existing exports unchanged |
| `components/topbar/NotificationPanel.tsx` (+ `NotificationBell.tsx`) | Workflow notifications render a compact `WorkflowTimeline` preview via `getApprovalNotificationPreview`. Non-workflow notifications unchanged. | Additive branch; other notifications identical |

> **Not touched in Phase B:** `lib/workflow-engine.ts`, `lib/workflow-hierarchy.ts`, `modules/absence/*` (leave submission), `middleware.ts`, any migration file, any Drizzle schema file.

---

## 2. The 6 read services (`modules/workflow-intelligence/queries.ts`)

All read `workflow_intelligence_view` exclusively; all take the caller's `session` and enforce scope server-side.

| # | Service | Signature | Responsibility |
|---|---|---|---|
| 1 | `getWorkflowTimeline` | `(session, instanceId) → Promise<WorkflowTimeline \| null>` | **Row-level authorized** single-instance read (steps + audit + intelligence). `null` ⇒ caller returns 403/404. Logs `DETAIL_VIEWED`. |
| 2 | `getPendingApprovalsForUser` | `(session, opts?) → Promise<{ rows; total; hasMore }>` | Pending steps assigned to user **or** active delegate. Paginated. (Re-homes existing fn.) |
| 3 | `getApprovalHistoryForUser` | `(session, opts?) → Promise<{ rows; total }>` | Steps the user decided. (Re-homes existing fn.) |
| 4 | `getApprovalNotificationPreview` | `(session, instanceId) → Promise<NotificationPreview>` | Bell-sized projection: current/next/previous approver + ARIA snapshot + resource summary. **Same auth gate as `getWorkflowTimeline`.** |
| 5 | `getWorkflowOperations` | `(session, filters) → Promise<{ rows; total; aggregates }>` | Org-wide oversight. **HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN only**, entity-scoped (SUPER_ADMIN = all). *Function built in B; its UI page `/approvals/operations` lands in Phase C.* |
| 6 | `getWorkflowIntelligence` | `(session, { personId?, instanceId? }) → Promise<WorkflowIntelligenceRow[]>` | ARIA-facing read used by the `WORKFLOW_REQUEST_STATUS` intent (Phase F wires ARIA). Scope: own data, or any if HIGH_PRIVILEGE. |

---

## 3. How `workflow_intelligence_view` will be read

- Drizzle has no model for a SQL view, so the module reads it via **typed raw SQL** (`db.execute(sql\`SELECT … FROM workflow_intelligence_view WHERE …\`)`) mapped to `types.ts` interfaces — one query per service, no N+1.
- The view already computes status, current/next approver, `age_hours`, `sla_hours_remaining`, `is_sla_breached`, `escalation_count`, and `previous_decisions` **once** (Phase A). Services add only `WHERE`/pagination/auth predicates.
- ARIA recommendation join (`workflow_recommendations`) is **not** in Phase B (that table is Phase D); the preview reads the existing `absence_entries.aria_recommendation_json` via the current helper until Phase D generalizes it.

---

## 4. `getWorkflowTimeline` row-level authorization

```
authorized(session, instance) :=
    session.personId == instance.initiated_by_person_id          -- I'm the requester
 OR EXISTS step WHERE step.assigned_to_person_id == session.personId  -- I'm/was an approver in the chain
 OR EXISTS step WHERE step.decided_by_person_id  == session.personId  -- I decided a step
 OR EXISTS step WHERE step.delegated_to_person_id == session.personId -- delegated to me
 OR ( session.role ∈ {HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN}
        AND ( session.role == SUPER_ADMIN
              OR instance.legal_entity_id ∈ session.allowedEntityIds ) )  -- admin override, entity-scoped
```

- Implemented as a single authorization probe (instance + step membership) **before** returning any data. Fails closed: not authorized ⇒ return `null`.
- The detail page maps `null` → `notFound()`; the bell preview maps `null` → "no longer available".
- On success, writes a `DETAIL_VIEWED` audit row (best-effort, append-only) for traceability.
- This is the **only** behavioral change in Phase B, and it **adds** a restriction — it never grants access anyone lacks today.

---

## 5. Current CWE-639 exposure (concrete)

`getWorkflowInstanceDetailV2` (`modules/workflow/queries.ts:145`) gates on **role only**:

```ts
await requireRole(['EMPLOYEE','MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN'])  // role check ONLY
// …then SELECTs the instance by id with NO predicate tying it to the caller
.where(and(eq(workflowInstancesV2.tenantId, TENANT_ID), eq(workflowInstancesV2.id, instanceId)))
```

It returns the full instance, **all** steps (assignees, decisions, notes), the requester's name, and `resourceId`. The page (`/approvals/[instanceId]`) only uses identity to decide whether to show the *action buttons* — the **data is returned to anyone with any approver role**.

**Vulnerable request (today):**
```
John Smith (role EMPLOYEE, personId = J) is logged in.
He guesses/obtains another employee's instance id and navigates to:
  GET /approvals/9f1c…   (Fatima's salary-grievance leave, John is NOT in the chain)
→ getWorkflowInstanceDetailV2('9f1c…') passes (John is EMPLOYEE) and returns
  Fatima's leave dates, reason/notes, approver chain, and audit trail.
→ IDOR / CWE-639: object reference with no ownership check.
```

## 6. Fixed authorization behavior (after Phase B)

```
Same request: GET /approvals/9f1c…  as John (EMPLOYEE, not in chain)
→ getWorkflowTimeline(session, '9f1c…')
   authorized() = false (not initiator, not approver, not admin)
   → returns null → page calls notFound() → John sees 404, no data leaked.

Fatima (initiator) → authorized (initiator) → sees her own request. ✅ unchanged
Shareef (assigned HR Admin step) → authorized (in chain) → full timeline + action. ✅ unchanged
HR Director (same entity) → authorized (admin override, entity-scoped) → view-only. ✅ unchanged
```

---

## 7. Role access matrix (Approval Detail / Timeline)

| Role | Own initiated request | Request where they are an approver/decider | Arbitrary request they're not part of | Change vs today |
|---|---|---|---|---|
| **SUPER_ADMIN** | ✅ | ✅ | ✅ (all entities, admin override) | No change (still full) |
| **HR_ADMIN** | ✅ | ✅ | ✅ **only within their legal entity** (was: any) | **Tightened** to entity scope |
| **HR_DIRECTOR** | ✅ | ✅ | ✅ **only within their legal entity** | **Tightened** to entity scope |
| **MANAGER** | ✅ | ✅ | ❌ (was: ✅ — leak) | **Fixed** (no longer leaks) |
| **EMPLOYEE** | ✅ | ✅ (e.g. an employee acting as an approver) | ❌ (was: ✅ — leak) | **Fixed** (no longer leaks) |

> Net effect: **everyone keeps the access they legitimately need; only the leak path closes.** Admin oversight is preserved but correctly entity-scoped (SUPER_ADMIN remains global).

---

## 8. UI integration points

| Surface | File | Integration | Behavior for authorized users |
|---|---|---|---|
| **Approval detail** | `app/(hr-admin)/approvals/[instanceId]/page.tsx` | `getWorkflowTimeline` + `<WorkflowTimeline>` replaces inline chain/audit cards | Identical content; action form/Approve-Reject-Delegate unchanged |
| **Employee request detail** | (reuses the same route/component) | Same `WorkflowTimeline`, view-only (employee is initiator, not approver) | Now shows the audit trail symmetric with HR (additive) |
| **Notification / bell** | `components/topbar/NotificationPanel.tsx` | Workflow notifications → `getApprovalNotificationPreview` → compact `WorkflowTimeline` | Non-workflow notifications unchanged; inline Approve/Reject only if active approver |

The Pending and My-decisions tabs on `/approvals` (already shipped) switch to the re-homed `getPendingApprovalsForUser` / `getApprovalHistoryForUser` — same rows, now sourced from the view.

---

## 9. Explicit confirmations

- ✅ **No new migrations** — Phase B only *reads* Phase A's view.
- ✅ **No schema changes** — no Drizzle table/column edits.
- ✅ **No approval engine behavior change** — `lib/workflow-engine.ts` / `workflow-hierarchy.ts` untouched (submit/approve/reject/delegate/SLA all identical).
- ✅ **No workflow routing change** — approver resolution and step advancement unchanged.
- ✅ **No leave submission behavior change** — `modules/absence/*` untouched.
- ✅ **No regression to existing approvals, ESS, manager screens, or dashboards** — data sources re-homed 1:1 behind unchanged signatures; only new restriction is closing the detail-leak.

---

## 10. Tests to be added (`tests/unit/wip-phase-b.test.ts`)

| ID | Test |
|---|---|
| WIPB-001..004 | `getWorkflowTimeline` authorization: initiator ✓ · in-chain approver ✓ · decider ✓ · delegate ✓ |
| WIPB-005..007 | Non-stakeholder EMPLOYEE → null · non-stakeholder MANAGER → null · cross-entity HR_ADMIN → null |
| WIPB-008..009 | HR_ADMIN same-entity → authorized · SUPER_ADMIN any-entity → authorized |
| WIPB-010 | Unauthorized read returns `null` (fails closed); page maps to `notFound()` |
| WIPB-011 | `DETAIL_VIEWED` audit written on authorized read |
| WIPB-012..013 | `lib/workflow-status.ts` single source: every status has bilingual label + color/icon; no inline status map remains in detail page |
| WIPB-014..015 | `WorkflowTimeline` merges steps + audit chronologically; uses `friendlyAuditLabel` (no raw ENUM) |
| WIPB-016 | `getApprovalNotificationPreview` uses the same auth gate as `getWorkflowTimeline` |
| WIPB-017 | `getWorkflowOperations` rejects non-HR roles (returns empty/forbidden) and is entity-scoped |
| WIPB-018 | Re-homed `getPendingApprovalsForUser`/`getApprovalHistoryForUser` keep their existing return contract (no regression) |
| WIPB-019..020 | No new migration files added in Phase B; no Drizzle schema diff |

Plus: `pnpm typecheck` (0 errors) and the **full unit suite** must stay green (rule 8).

---

## Rollback (Phase B)
Pure code revert — no DB to undo. `git revert` the Phase B commit restores the prior inline detail/data path (kept in git history). Phase A view/columns remain (harmless, unread).


================================================================================
FILE [P2-01]: docs/architecture/phase-c-design-review.md
LINES: 156
================================================================================
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


================================================================================
FILE [P2-01]: docs/architecture/phase-d-design-review.md
LINES: 271
================================================================================
# Phase D — Design Review: Type Registry, Generic Recommendations, De-coupling

> Branch: `feat/workflow-intelligence-platform` · Status: **DESIGN ONLY — no code, awaiting approval**
> Depends on: Phases A–C. **This is the first phase that intentionally touches the engine** (`dispatchResourceCompletion`) — designed so observable behavior is **identical**, guarded by a seeded registry + a retained fallback.

---

## 0. Goal & guiding principle

Today the engine hardcodes per-resource logic and leave owns the AI model:
- `dispatchResourceCompletion` (`lib/workflow-engine.ts:775`) is an `if (resourceType === …)` chain: `absence_entries` (line 797, inline leave notification via `buildLeaveDecisionNotificationBody`), `probation_review` (861), `hiring_requests` (877), `transfer_requests` (922).
- ARIA recommendations live in the **leave-only** column `absence_entries.aria_recommendation_json`; `getLeaveRecommendationForInstance` and `generateLeaveRecommendation` are leave-specific.

Phase D introduces a **registry** (what to do per resource type), **notification templates** (message text as data), and a **generic recommendations** table — so new workflow types register via config, not engine edits.

**Principle: Expand → Migrate → Contract.** Phase D is the *Expand + Migrate* step. Every change is additive; the legacy if-chain, inline text, and leave JSON column are **retained as fallbacks**. The *Contract* (delete legacy paths/column) is a **separate future phase** after parity is proven in production.

---

## 1. Exact files to be added / changed

### Added
| File | Purpose |
|---|---|
| `modules/workflow/registry.ts` | **Code registry**: `resourceType → { applyOutcome, notificationTemplateCode, recommendationProvider?, detailLoader? }`. The real decoupling (handlers are code, not data). |
| `drizzle/schema/workflow-engine.ts` (additions) | Drizzle defs for 3 new tables |
| `drizzle/migrations/0061_workflow_type_registry.sql` | `workflow_type_registry` table + seed |
| `drizzle/migrations/0062_notification_templates.sql` | `notification_templates` table + seed |
| `drizzle/migrations/0063_workflow_recommendations.sql` | `workflow_recommendations` table |
| `modules/aria/recommendations.ts` | Generic read/write over `workflow_recommendations` (+ a `leave` provider that wraps existing logic) |
| `app/(employee)/me/requests/page.tsx` | NEW — ESS "My Requests" status tracker (Part 2 below); generic over all workflow types |
| `tests/unit/wip-phase-d.test.ts` | WIPD-001…0xx (parity + fallback + safety + requester visibility) |

**Added for Part 2 (Requester Workflow Visibility):**
| File | Purpose |
|---|---|
| `modules/workflow-intelligence/queries.ts` (add `getMyWorkflowRequests`) | Reads `workflow_intelligence_view WHERE initiated_by_person_id = session.personId` — generic, all resource types, requester-scoped |
| `app/(employee)/me/requests/page.tsx` | ESS list: status · current approver · stage · progress · SLA, each linking to the existing detail timeline |
| `components/employee/EmployeeSidebar.tsx` (change) | Add a "My Requests" nav item (`/me/requests`) |

### Changed (engine + ARIA, behavior-preserving via fallback)
| File | Change | Safety |
|---|---|---|
| `lib/workflow-engine.ts` | `dispatchResourceCompletion` dispatches through `registry[resourceType]`; **falls back to the existing if-chain** when the type is absent/inactive. Notification body resolved from `notification_templates` with **fallback to current inline text / `buildLeaveDecisionNotificationBody`**. | Registry seeded with the 4 existing types → same handler; fallback guarantees no regression if registry/template missing |
| `modules/aria/leave-recommendation.ts` | After computing, **writes `workflow_recommendations`** (generic) in addition to / instead of the leave JSON; logic unchanged | Dual-write during migration; legacy column retained |
| `modules/aria/approval-queries.ts` | `getLeaveRecommendationForInstance` reads `workflow_recommendations` first, **falls back to `absence_entries.aria_recommendation_json`** | No reader breaks; old rows still resolve |
| `drizzle/migrations/_PRODUCTION_SCHEMA_BUNDLE.sql` | Append Section 2 DDL for 0061/0062/0063 + changelog | living bundle stays current |

> **Not touched:** `resolveApprovalChain` / `workflow-hierarchy.ts` (routing), `workflow_definitions_v2` / `workflow_steps_v2` (the builder's tables), `submitWorkflow`/`takeWorkflowAction`/`activateNextStep` (submission & advancement), `modules/absence/*` (leave submission). The approval **chain** is unchanged; only post-completion dispatch + message text + recommendation storage move.

---

## 2. Exact migrations proposed (additive, slots 0061–0063)

**0061 — `workflow_type_registry`** (config/metadata; handlers stay in code)
```
resource_type (PK), workflow_code_prefix (nullable), outcome_handler_key varchar NOT NULL,
notification_template_prefix varchar, recommendation_provider varchar NULL,
is_active boolean NOT NULL DEFAULT true, created_at, updated_at
```
Seed (identical to today's behavior): `absence_entries` (handler `leave`, recommendation_provider `leave`), `hiring_requests` (handler `hiring`), `transfer_requests` (handler `transfer`), `probation_review` (handler `probation`). `is_active=true` for all four.

**0062 — `notification_templates`**
```
template_code (PK), resource_type, event varchar (APPROVED|REJECTED|REQUESTED),
subject_en, subject_ar, body_en, body_ar, placeholders jsonb, is_active bool DEFAULT true
```
Seed: the **exact** current strings — `LEAVE_APPROVED`/`LEAVE_REJECTED` (mirroring `buildLeaveDecisionNotificationBody` output), `HIRING_REQUEST_APPROVED/REJECTED`, `TRANSFER_REQUEST_APPROVED/REJECTED`, plus the in-app `LEAVE_APPROVAL_REQUESTED`. Byte-for-byte parity is the seed's acceptance test.

**0063 — `workflow_recommendations`** (generic, replaces leave-only JSON)
```
id uuid PK, tenant_id, instance_id (FK workflow_instances_v2), resource_type,
recommendation_code varchar (APPROVE|REJECT|REVIEW), confidence_score numeric,
summary_en text, summary_ar text, factors jsonb, context_snapshot jsonb,
model_version varchar, created_at
```
Index `(instance_id)`. No FK to resource tables (generic).

All three: `CREATE TABLE IF NOT EXISTS` + idempotent seeds (`ON CONFLICT DO NOTHING`). **No column drops. No ALTER of existing tables.**

---

## 3. Data model — before / after

| Concern | Before | After (Phase D) | Legacy kept? |
|---|---|---|---|
| Per-type completion logic | hardcoded `if`-chain in `dispatchResourceCompletion` | `registry[resourceType].applyOutcome` (code), governed by `workflow_type_registry.is_active` | ✅ if-chain retained as fallback |
| Notification text | inline strings + `buildLeaveDecisionNotificationBody` | `notification_templates` rows (data) | ✅ inline/builder retained as fallback |
| AI recommendation storage | `absence_entries.aria_recommendation_json` (leave only) | `workflow_recommendations` (any resource type) | ✅ column retained, read as fallback |
| New workflow type onboarding | code edit to the if-chain + new column | one `workflow_type_registry` row + one code handler entry + templates | — |

---

## 4. Backward-compatibility rules (the safety contract)

1. **Additive only** — three new tables; **zero** drops/renames/ALTERs of existing objects.
2. **Seeded parity** — registry + templates seeded so the four existing resource types produce **identical** status transitions and **identical** notification text. A unit test asserts template output == legacy `buildLeaveDecisionNotificationBody` output.
3. **Fallback everywhere** — if a resource type is missing from the registry (or `is_active=false`), the engine uses the **existing if-chain**. If a template is missing, it uses the **existing inline text**. If `workflow_recommendations` has no row, readers fall back to `absence_entries.aria_recommendation_json`. Nothing breaks if Phase D's *data* isn't applied.
4. **Dual-write recommendations** — ARIA writes the generic table; the legacy JSON column keeps working for already-stored recommendations.
5. **Contract deferred** — dropping the legacy column / removing the if-chain fallback is a **future phase**, only after production parity is confirmed.

---

## 5. Does any existing workflow behavior change?

**No observable change is the explicit acceptance criterion.** Status transitions, approval routing, who-approves, SLA, and notification *content* remain identical (seeded parity + fallback). What changes is **internal**: completion dispatch flows through the registry instead of a literal `if`-chain, and message text/recommendations are sourced from tables. Verified by:
- a **parity test** per resource type (registry handler result == legacy branch result),
- a **template parity test** (rendered text == current text),
- the full integration suite (`workflow-collision`, `notification-storm`, `absence-actions`) staying green.

If any parity check fails, the type simply stays on its fallback — no regression ships.

---

## 6. How the 8 leave types stay safe (Annual/Sick/Maternity/Hajj/Emergency/Paternity/Unpaid/Study)

**Key insight: all leave types share `resource_type = 'absence_entries'`.** They differ only by `workflow_code` (`WF_ANNUAL_LEAVE`, `WF_SICK_LEAVE`, …), which selects the **approval definition/steps** — *not* the completion handler. `dispatchResourceCompletion` already treats them identically via the single `absence_entries` branch.

Therefore:
- The registry has **one** `absence_entries` entry → the `leave` handler → all 8 leave types dispatch identically, exactly as today.
- One `LEAVE_*` template family serves all 8 (the current text is leave-type-agnostic, enriched at runtime with the type name from `absence_entries`).
- The `leave` recommendation provider serves all 8.
- No per-leave-type code exists today and none is introduced. Adding a 9th leave type in future needs **zero** Phase-D changes (same resource type).

Routing for each leave type is governed by its workflow definition/steps (unchanged), so Annual's Line-Manager→HR→CEO chain and any other type's chain are untouched.

---

## 7. Impact summary (focus areas)

- **Existing leave workflows:** identical behavior (seeded parity + fallback). ✅
- **Workflow builder:** **no impact** — it edits `workflow_definitions_v2`/`workflow_steps_v2` (the approval chain), which Phase D does not touch. The registry governs *completion dispatch*, a separate concern. ✅
- **Approval routing:** **no impact** — `resolveApprovalChain`/hierarchy untouched. ✅
- **ARIA recommendations:** storage generalised (leave JSON → `workflow_recommendations`); visible behavior identical for leave (only leave has a provider in Phase D); foundation laid for hiring/transfer/probation recommendations later with no engine change. ✅
- **Notifications:** text moves to templates, seeded byte-identical; fallback to inline text. ✅

---

## 8. Part 2 — Requester Workflow Visibility (Employee Status Tracker)

**Added to Phase D scope. Reuses the existing Workflow Intelligence foundation — no separate architecture, no new schema.**

### What the requester sees (any workflow they initiated: leave, promotion, transfer, letters, probation, hiring, future)
1. Current workflow status · 2. Current approver name · 3. Current approval stage (`n / total`) · 4. Previous approvals/decisions · 5. Next approver (if any) · 6. Total progress · 7. Full approvals/decisions timeline.

e.g. **"Pending with: Dorababu Kethari (Line Manager)"**, then **"Pending with: Shareef Kozhisseri (HR Admin)"**, then **"Pending with: Talal Al Gaddah (CEO)"** — all rendered from the same view columns (`current_approver_name`, `current_step_name`, `current_step_order`/`total_steps`, `previous_decisions`, `next_approver_name`).

### How it maps onto the existing foundation (zero duplication)
| Need | Reuses (already built) | New in Phase D Part 2 |
|---|---|---|
| Status / current+next approver / stage / progress / SLA | **`workflow_intelligence_view`** (Phase A) — generic, all resource types | — |
| Timeline of approvals & decisions | **`WorkflowTimeline`** component (Phase B) | — (no new/duplicate timeline) |
| Detail screen for one request | **`/approvals/[instanceId]`** — `getWorkflowTimeline` already authorizes the **initiator** (Phase B `evaluateViewerAccess`: `initiatedByPersonId === personId`) | — (requester already sees their own detail) |
| ESS list of *my* requests across all types | `getMyWorkflowRequests` reads the view, **scoped to `initiated_by_person_id = session.personId`** | ESS page `/me/requests` + sidebar item |

### Row-level authorization (requester sees only their own)
- **List:** `getMyWorkflowRequests` hard-filters `initiated_by_person_id = session.user.personId` in SQL — a requester can never see another person's requests. No role check needed beyond "is authenticated" (everyone can see their *own*).
- **Detail:** clicking through goes to `/approvals/[instanceId]`, gated by Phase B `getWorkflowTimeline`. The initiator passes the `initiatedByPersonId === personId` branch → sees their own; a tampered id for someone else's request → `null` → `notFound()`. **No new authorization code** — Phase B already covers the requester case.

### Generic over every workflow type
The view and timeline are keyed on `resource_type` generically. A new workflow type (e.g. Study Leave, an expense claim, a future module) appears in "My Requests" automatically the moment it has a `workflow_instances_v2` row — **no per-type UI**, no code change. This is symmetric with the Phase D decoupling goal.

### No schema impact
Part 2 adds **no migrations** — it only *reads* the Phase A view. (Phase D's 0061–0063 are for the decoupling work; Part 2 needs none.)

### Navigation
Add "My Requests" (`/me/requests`, bilingual) to `EmployeeSidebar`. Managers/HR also initiate requests; if desired, the same list is reachable for them too, but the ESS item targets employees specifically (admins already have richer surfaces). The existing employee "My Leave" view is unchanged; "My Requests" is the **cross-type** tracker.

### Backward compatibility
Purely additive (one read service + one ESS page + one nav item). Existing leave/ESS screens unchanged. Rollback = revert the page + nav item; the service is net-new and unreferenced after revert.

## 9. Part 3 — Approval Review Performance Investigation & Fix

**Added to Phase D scope.** Symptom: Manager → Approvals → **Review** (`/approvals/[instanceId]`) takes ~1–2 minutes to open.

### Request-path profile (sequential, server-side, before render)
```
auth() → getWorkflowTimeline(session,id)
   ├─ getWorkflowInstanceDetailV2(id)   → 3 sequential queries
   │     instance lookup ~274ms · steps ~280ms · audit ~291ms        (measured, dev→Neon)
   ├─ isAuthorizedViewer probe          → +1 query (skipped if granted sync)
   ├─ readViewRow(id)                   → intelligence view ~405ms
   └─ DETAIL_VIEWED audit insert        → +1 write
→ Promise.all(
     getLeaveRecommendationForInstance(id),   ◀── ROOT CAUSE
     getLeaveRequestSummaryForInstance(id)    → 1 query
  )
```

### Root cause (confirmed in code)
`getLeaveRecommendationForInstance` (`modules/aria/approval-queries.ts:~37`) does **synchronous on-demand AI generation** when no cached recommendation exists:
```
if (!row.ariaRecommendationJson && row.resourceId) {
  await generateLeaveRecommendation(row.resourceId)   // ← blocks the page
  ...
}
```
`generateLeaveRecommendation` (`modules/aria/leave-recommendation.ts`) runs **~8 sequential DB queries** (request, employee, balance, dept, team-coverage ×2, history) **then a blocking `anthropic.messages.create({ model: 'claude-sonnet-4-6', … })`** call. An ARIA key IS configured, so the call executes; with the Anthropic SDK's default retries/backoff (and a suspect model id), this stretches to tens of seconds → **1–2 min on the render path**, on **every** review open for a leave that has no cached recommendation.

### Findings against the checklist
| Investigation item | Finding |
|---|---|
| Slow queries | Base reads ~270–405ms each (network latency dev→Neon; ~40ms on Vercel co-located). Not the cause. |
| N+1 patterns | **None** in the detail path (queries are batched/single). ARIA prep is a *fixed* 8 queries, not N+1. |
| Missing indexes | None critical. *Optional:* `(instance_id, action)` on `workflow_audit_log` for the view's `escalation_count` subquery. |
| Blocking API/service calls | **YES — `anthropic.messages.create` on the render path** (the dominant cost). |
| Synchronous ARIA/recommendation loading | **YES — the root cause.** |
| Sequential server-side loading | Secondary: `getWorkflowInstanceDetailV2` (3 queries) → view → audit run sequentially; parallelizable (~1.25s → ~0.4s locally). |
| Duplicate workflow-detail queries | Page calls `getWorkflowTimeline` **once**; no duplicate detail load. ✅ |
| Slowest function | `generateLeaveRecommendation` (Claude call + 8 queries). |

### Fix plan (performance only — NO UI redesign)
1. **Remove synchronous AI generation from the render path.** `getLeaveRecommendationForInstance` (and the Phase D generic `getRecommendation`) become **read-only** — return the cached recommendation or `null`. `null` → the card's existing "recommendation unavailable — review manually" fallback. *(eliminates the Claude call + 8 prep queries from page open — directly meets "No synchronous AI generation during page open".)*
2. **Generate asynchronously.** Recommendations are produced off the request path — by the outbox poller / a deferred job (original design), surfaced through the Phase D generic `recommendationProvider` writing `workflow_recommendations`. The page only **reads**.
3. **Parallelize independent reads** in `getWorkflowTimeline`/`authorizeAndLoad`: run the instance/steps/audit/view reads with `Promise.all` instead of sequentially. *(meets "Workflow timeline load < 1 second".)*
4. **No duplicate detail queries** — keep the single `getWorkflowTimeline` call; `getApprovalNotificationPreview` (bell) and the page share `authorizeAndLoad` (already factored).
5. *(Optional)* add `(instance_id, action)` index on `workflow_audit_log` if the view subquery shows up under load (additive migration; only if measured to matter).

### Performance targets → how met
| Target | Met by |
|---|---|
| Review first render < 2s | Fix #1 removes the AI call (the 1–2 min); remaining data path ~0.4s locally / <0.2s on Vercel |
| Timeline load < 1s | Fix #3 parallelizes reads |
| No synchronous AI generation during page open | Fix #1 (read-only fetch) + #2 (async provider) |
| No duplicate workflow-detail queries | Fix #4 (single `getWorkflowTimeline`) |

### Files changed (Part 3)
- `modules/aria/approval-queries.ts` — `getLeaveRecommendationForInstance` → read-only (drop the `generateLeaveRecommendation` call on render).
- `modules/workflow-intelligence/queries.ts` — parallelize reads inside `authorizeAndLoad`/`getWorkflowTimeline`.
- (Phase D) `modules/aria/recommendations.ts` + outbox wiring — async generation path.
- *(no UI change; no migration unless the optional index is adopted.)*

### Measurement (before / after)
- **Before:** ~1–2 min first open per instance (sync ARIA gen + retries); cached opens were already fast.
- **After (target, to be measured at implementation):** review first render < 2s consistently (no AI on render); timeline data path < 1s. Method: instrument the page's server timing (existing `lib/telemetry` `startTimer`/Server-Timing) and capture before/after on the branch deploy.

### Severity note
This is a **production-grade hang** and the fix (remove 4 lines of synchronous generation) is tiny and isolated. It can ship as an **immediate hotfix** independent of the rest of Phase D if you want relief now — say the word and I'll do just Fix #1 as a standalone commit, measured, before the larger Phase D work.

> **Not in scope (documented as future enhancement):** any redesign of the review page UI, streaming/partial render, or React Suspense boundaries for the ARIA card. Phase D Part 3 is strictly performance/query/data-loading.

## Validation plan

| Layer | Check |
|---|---|
| Typecheck | `pnpm typecheck` → 0 errors |
| Unit (new) | WIPD: registry dispatch maps the 4 types to the right handler; fallback to if-chain when type absent/inactive; template render == legacy text (parity); recommendation read prefers new table, falls back to legacy JSON; all-8-leave-types resolve to the single `absence_entries` handler; no FK from `workflow_recommendations` to resource tables |
| Unit (Part 2) | `getMyWorkflowRequests` SQL hard-filters `initiated_by_person_id = session.personId` (requester-scoped); returns all resource types (not leave-only); `/me/requests` renders status/current approver/stage/progress and links to `/approvals/[instanceId]`; reuses `WorkflowTimeline` (no second timeline implementation); detail access for a non-owned id → `notFound()` via Phase B gate; sidebar "My Requests" item present |
| Integration | `workflow-collision`, `notification-storm`, `absence-actions`, `payroll-collision` stay green (completion path unchanged in effect) |
| Full unit suite | all green |
| Build | `pnpm build` success |
| DB | apply 0061/0062/0063 in Neon SQL Editor; verify tables + seeds; re-run idempotent |
| Parity gate | a leave request completing produces the same status + same notification text before vs after (manual UAT on the branch DB) |

---

## Rollback plan

Two independent levels:
1. **Data-only (instant, no deploy):** set `workflow_type_registry.is_active=false` (or `DELETE` the rows) → the engine reverts to the legacy if-chain for those types. Templates/recommendations similarly fall back. No code change needed.
2. **Code revert:** `git revert <phase-d-commit>` removes the registry dispatch + generic reads/writes; the new tables remain (unread, harmless). Drop them only if desired: `DROP TABLE workflow_recommendations, notification_templates, workflow_type_registry;` (additive, safe to drop — nothing else references them).

No legacy data is mutated or dropped in Phase D, so rollback never loses information.

---

## Decisions for approval
1. **Registry = code handlers + a config table** (handlers can't live in SQL); table governs is_active + template/provider wiring. ✅/✏️?
2. **Fallback retained** (if-chain, inline text, legacy JSON) until a future Contract phase. ✅/✏️?
3. **Migrations 0061/0062/0063**, additive, seeded for byte-identical behavior. ✅/✏️?
4. **ARIA dual-write** to `workflow_recommendations` (+ legacy JSON readable). ✅/✏️?


================================================================================
FILE [P2-01]: docs/architecture/wip-current-state-findings.json
LINES: 466
================================================================================
[
  {
    "subsystem": "AVANIIS Workflow Engine v2 & Canonical State Model",
    "currentState": "## Current Workflow Engine Architecture (v2)\n\n### Instance Lifecycle & State Management\n\n**Workflow Instance Creation (submitWorkflow)**\n- Located: `/lib/workflow-engine.ts` lines 460–768\n- Creates `workflowInstancesV2` row with status='PENDING' → 'IN_PROGRESS'\n- Immutable snapshots captured at submission: `hierarchySnapshot` (approvers + metadata), `contextSnapshot` (resource + employee fields), `resolvedSteps` array (all 3 are JSONB, stored in instance)\n- All writes (instance, step instances, email tokens, audit, notifications) participate in optional caller-supplied transaction for atomicity (COLLISION-003 fix)\n- Schema: `/drizzle/schema/workflow-engine.ts` lines 381–421\n\n**Step Lifecycle (State Machine)**\n- Statuses: WAITING → PENDING → APPROVED|REJECTED|DELEGATED|ESCALATED|SKIPPED|AUTO_APPROVED\n- First step created with status='PENDING' at submission; subsequent steps created WAITING\n- `activateNextStep()` (lines 292–446) advances WAITING → PENDING when prior step APPROVED\n- Each step instance stored in `workflowStepInstances` table with `assignedToPersonId`, `decidedByPersonId`, `decision`, `decisionNote`, `decidedAt`, `slaDeadline`\n- Delegation: reassigns `assignedToPersonId` to `delegateToPersonId`, status stays PENDING\n\n**Completion Flow**\n- Instance reaches terminal status (APPROVED|REJECTED) when all steps approved or any step rejected\n- `dispatchResourceCompletion()` (lines 775–964) routes by resource type:\n  - **absence_entries**: updates `absenceEntries.status`, inserts bilingual notification_log row (LEAVE_APPROVED|LEAVE_REJECTED), calls `buildLeaveDecisionNotificationBody()` for enriched text\n  - **probation_review**: calls `applyProbationOutcome()` in modules/core-hr/probation/workflow-actions.ts (receives caller's tx for atomicity)\n  - **hiring_requests**: updates `hiringRequests.status`, inserts notification_log (HIRING_REQUEST_APPROVED|REJECTED)\n  - **transfer_requests**: updates `transferRequests.status`, inserts notification_log (TRANSFER_REQUEST_APPROVED|REJECTED)\n  - Each branch receives optional `tx` parameter to join caller's post-claim transaction (COLLISION-PROBATION fix, lines 794–795)\n\n### State Duplication Across Tables\n\n**Workflow Instance State** (canonical authority):\n- `workflowInstancesV2.status` — master status (PENDING|IN_PROGRESS|APPROVED|REJECTED|CANCELLED|ESCALATED|ON_HOLD|RECALLED)\n- `workflowInstancesV2.currentStepId`, `currentStepOrder` — current position\n- `workflowInstancesV2.slaDeadline`, `escalatedAt`, `reminderSentAt` — timeline\n- `workflowInstancesV2.finalDecisionBy`, `rejectionReason` — outcome metadata\n- Immutable snapshots: `hierarchySnapshot`, `contextSnapshot`, `resolvedSteps`\n\n**Resource Table State** (derived/synced):\n- `absenceEntries.status` — DRAFT|PENDING|APPROVED|REJECTED|CANCELLED|TAKEN|RECALLED (initially DRAFT, flipped to PENDING at workflow submission via submitLeaveRequest atomicity wrapper)\n- `absenceEntries.workflowInstanceId` — back-reference to instance (optional, no FK constraint)\n- `absenceEntries.approvedBy`, `approvalDate`, `rejectionReason` — copied from workflow decision, but NOT canonical (workflow-engine writes these; duplication of workflow_instance_v2.finalDecisionBy / rejectionReason)\n- **Same pattern for** `hiringRequests.status`, `transferRequests.status`\n\n**Workflow Audit Log** (INSERT-only ledger):\n- `workflowAuditLog` — immutable record of all actions (SUBMITTED, STEP_APPROVED, STEP_REJECTED, INSTANCE_APPROVED, INSTANCE_REJECTED, SLA_ESCALATED, TOKEN_ISSUED, etc.)\n- Indexed on (instanceId, loggedAt) and (actorPersonId, loggedAt)\n\n**Notification Queues & Log** (separate systems):\n- `workflowNotificationQueue` — transient, QUEUED → SENT|FAILED (for email dispatch)\n- `notificationLog` (in transactions.ts) — persistent, PENDING|SENT|DELIVERED|READ|FAILED (bilingual notifications for all domains)\n\n### Hierarchy Resolution & Context\n\n**Hierarchy Types** (resolveApprovalChain in `/lib/workflow-hierarchy.ts` lines 452–581):\n1. **LINE_MANAGER**: traverse persons.lineManagerId (or workerAssignments.lineManagerId if current assignment exists)\n   - Levels: 1=N+1, 2=N+2, -1=HOD (dept head), -2=entity head\n   - Includes delegation check via `workflowDelegationRules` (delegationFrom/delegationTo dates + workflowCodes filter)\n2. **POSITION**: traverse positions.reportsToPositionId (occupiedByPersonId when filled)\n   - Policies on vacancy: ESCALATE_UP, USE_FALLBACK, ASSIGN_HR_ADMIN, BLOCK_WITH_ERROR\n3. **CUSTOM_GROUP**: resolve `approvalGroups.id` → `approvalGroupMembers` (STATIC/DYNAMIC/HYBRID membership, with voting methods: ANY_ONE|MAJORITY|ALL|WEIGHTED)\n\n**Context Snapshot** (buildWorkflowContext in `/lib/workflow-engine.ts` lines 124–201):\n- Flat key-value structure (~30 fields): employee.*, leave.*, assignment.*, overtime.*, document.*, resource.*\n- Rules evaluated against these fields: AND/OR condition trees with 15+ operators (EQUALS, IN, GREATER_THAN, CONTAINS, etc.)\n- Stored as JSONB in contextSnapshot for audit trail\n\n### Resource Types Supported\n\n1. **absence_entries** (leave requests) — triggers workflow code 'LEAVE_REQUEST_WF' (or variant per leave type)\n2. **hiring_requests** — triggers 'HIRING_REQUEST_WF'\n3. **transfer_requests** — triggers 'TRANSFER_REQUEST_WF'\n4. **probation_review** — triggers 'PROBATION_CONFIRMATION_WF'\n5. Extensible: any table can submit via `submitWorkflow(resourceType, resourceId)` + matching workflow definition\n\n### Leave-Specific Coupling\n\n**Tightly Coupled in Workflow Engine:**\n- `buildLeaveDecisionNotificationBody()` in `/lib/leave-notification.ts` (pure helpers; used by dispatchResourceCompletion for absence_entries only)\n- Notification body enriched with typeNameEn|Ar, startDate, endDate, durationDays from absenceEntries table (lines 829–857 in workflow-engine.ts)\n- Medical certificate validation can be defined in workflow rules (context field 'leave.has_medical_cert')\n- Balance checks via context 'leave.balance_pct_used', 'leave.balance_days_remaining'\n\n**Not Decoupled:**\n- Leave notification text is hard-coded in dispatchResourceCompletion, not templated/configurable per resource type\n- ARIA leave recommendation stored in absenceEntries.ariaRecommendationJson (processed in modules/aria/approval-queries.ts); no generic recommendation model\n- Leave balance snapshot (balanceBeforeDays, balanceAfterDays) maintained in absenceEntries; no generic \"resource snapshot\" pattern\n\n### SLA & Escalation\n\n**Per-Step SLA**: workflowStepsV2.slaHours (default 48); escalation policy in onSlaBreach (ESCALATE|AUTO_APPROVE|AUTO_REJECT|SEND_REMINDER)\n**Instance SLA**: workflowDefinitionsV2.defaultSlaHours aggregated per step\n**Calendar**: workflowSlaCalendars (working days 0–4 for UAE, timezone Asia/Dubai, Ramadan adjustments)\n**Cron Job**: processSLABreaches() (lines 1313–1451) runs every 30min, detects PENDING steps past deadline, applies policy atomically in transaction\n\n### Query Layer\n\n**Queries**: modules/workflow/queries.ts\n- `getPendingApprovalsV2()` — joins workflowStepInstances → workflowInstancesV2 → workflowDefinitionsV2 → workflowStepsV2, filters on status='PENDING' + assigned user\n- Returns: stepInstanceId, instanceId, workflowCode, resourceType, resourceId, initiatorName, stepOrder, slaDeadline, isBreached (calculated)\n\n**ARIA Integration**: modules/aria/approval-queries.ts\n- `getPendingApprovalsForUser()` — wraps getPendingApprovalsV2, batch-fetches leave details from absenceEntries for absence_entries resource type only\n- Joins workflowInstancesV2 → absenceEntries for ARIA recommendation retrieval (ariaRecommendationJson field)\n\n### Audit & Intelligence\n\n**Immutable Audit Log**:\n- INSERT-only design; indexes on (instanceId, loggedAt) and (actorPersonId, loggedAt)\n- Action types: SUBMITTED, STEP_APPROVED, STEP_REJECTED, STEP_ESCALATED, STEP_SKIPPED, INSTANCE_APPROVED, INSTANCE_REJECTED, SLA_REMINDER_SENT, SLA_ESCALATED, TOKEN_ISSUED, TOKEN_USED, TOKEN_EXPIRED, RULE_EVALUATED, HIERARCHY_RESOLVED, SNAPSHOT_CREATED\n\n**Email Token Security**:\n- JWT-based one-click approval (issueEmailToken, lines 262–288)\n- Stored in workflowEmailTokens with jti (unique constraint), expiresAt, usedAt\n- Token issued for each step activation, contains instanceId, stepInstanceId, personId, action (APPROVE|REJECT|DELEGATE), exp\n\n**No Generic Intelligence Model**: No dedicated \"Notification\", \"Intelligence\", or \"Signal\" tables. Leave-specific ARIA recommendation stored as JSONB in absenceEntries. No schema for cross-domain intelligence aggregation.\n\n---\n\n## Key Files\n\n- `/lib/workflow-engine.ts` — core submitWorkflow, takeWorkflowAction, activateNextStep, dispatchResourceCompletion\n- `/lib/workflow-hierarchy.ts` — resolveApprovalChain, LINE_MANAGER|POSITION|CUSTOM_GROUP resolvers\n- `/lib/workflow-rules.ts` — evaluateRules (AND/OR condition trees)\n- `/drizzle/schema/workflow-engine.ts` — all 12 workflow tables (definitions, instances, steps, groups, delegation, audit, notifications, tokens, calendars)\n- `/modules/workflow/queries.ts` — getPendingApprovalsV2\n- `/modules/aria/approval-queries.ts` — getPendingApprovalsForUser (ARIA-specific leave enrichment)\n- `/modules/core-hr/probation/workflow-actions.ts` — applyProbationOutcome (resource completion handler)\n- `/lib/leave-notification.ts` — buildLeaveDecisionNotificationBody (leave-specific)\n- `/modules/absence/actions.ts` — submitLeaveRequest (atomicity wrapper for leave + workflow)\n- `/drizzle/schema/foundation.ts` — resource tables: absenceEntries (status, workflowInstanceId, approvedBy), hiringRequests (status), transferRequests (status), leavePlanEnrolments, accommodationRequests\n- `/drizzle/schema/actions.ts` — hiringRequests, transferRequests (with status='PENDING_APPROVAL'|'APPROVED'|'REJECTED')\n- `/drizzle/schema/transactions.ts` — notificationLog (separate from workflowNotificationQueue)\n",
    "keyFiles": [
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/workflow-engine.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/workflow-hierarchy.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/workflow-rules.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/workflow-engine.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/workflow/queries.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/approval-queries.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/core-hr/probation/workflow-actions.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/leave-notification.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/absence/actions.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/foundation.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/actions.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/transactions.ts"
    ],
    "strengths": [
      "Immutable snapshot design (hierarchySnapshot, contextSnapshot, resolvedSteps in JSONB) decouples approval chain resolution from later config changes",
      "Atomic transaction support for caller-supplied outer tx (submitLeaveRequest wraps submitWorkflow); handles COLLISION-003 and COLLISION-PROBATION fixes",
      "Plug-and-play resource type routing via dispatchResourceCompletion switch statement; supports absence_entries, hiring_requests, transfer_requests, probation_review",
      "Hybrid hierarchy system (LINE_MANAGER + POSITION + CUSTOM_GROUP) with delegation rules (workflowDelegationRules table) covers diverse org structures",
      "AND/OR condition trees with 15+ operators and field-path resolution enable flexible workflow activation rules without code changes",
      "INSERT-only audit log with dual indexing (instance + actor timeline) ensures compliance-grade event ledger",
      "Per-step SLA with calendar-aware calculations (UAE working hours, Ramadan adjustments) + escalation policies (ESCALATE|AUTO_APPROVE|AUTO_REJECT|SEND_REMINDER)",
      "Email token (JWT) security model with one-click approval + jti blacklist prevents double-approval race conditions (COLLISION-001 fix via atomic WHERE status='PENDING')",
      "Role-based authorization (PRIVILEGED_ROLES check for HR_ADMIN|HR_DIRECTOR|SUPER_ADMIN) + approver matching prevents unauthorized actions"
    ],
    "gaps": [
      "Resource table state (absenceEntries.status, approvedBy, rejectionReason) duplicates workflowInstancesV2 state; no single source of truth — e.g., if workflowInstancesV2.status='APPROVED' but absenceEntries.status='PENDING' due to crash between two writes, queries may return inconsistent data",
      "Leave-specific logic tightly coupled: buildLeaveDecisionNotificationBody() is in lib/leave-notification.ts, called only from dispatchResourceCompletion absence_entries branch; hiring_requests and transfer_requests have inline notification text (lines 897–915), no shared template",
      "No generic Intelligence/Recommendation model; ARIA recommendations stored as ariaRecommendationJson in absenceEntries only, unreachable for other resource types",
      "No schema for cross-domain notifications (e.g., 'approval_required' for any workflow, 'escalation_alert' for any SLA breach) — notificationLog type is free-form varchar, no enum validation",
      "Group voting (ANY_ONE|MAJORITY|ALL|WEIGHTED) defined in approvalGroups.votingMethod but not implemented in resolveApprovalChain — all groups return all members equally; minApprovals field unused",
      "Dynamic/HYBRID approval group membership not implemented; resolveGroupMembers() only resolves STATIC members (lines 362–393)",
      "No parallel approval support; all steps are sequential (activateNextStep fetches next WAITING with ORDER BY stepOrder); stepEffect='PARALLEL_ADD' defined but never evaluated for concurrency",
      "Recall/On-Hold states (RECALLED, ON_HOLD in instanceStatusEnum) defined in schema but no code paths trigger them; incomplete state machine",
      "No schema for workflowContext overrides per instance; contextOverrides param in submitWorkflow accepted but stored only in snapshot.fields, not queryable as a row",
      "Selector rules (workflowDefinitionsV2.selectorRuleId) for workflow-definition-level activation not fully documented; evaluateRules processes them but unclear when/why they differ from step activation rules"
    ],
    "risks": [
      {
        "risk": "State duplication race condition: absenceEntries.status and workflowInstancesV2.status can diverge if submitLeaveRequest outer transaction crashes after workflow commit but before status update, or dispatchResourceCompletion crashes after one write. Queries (e.g., ARIA approval-queries.ts) join both tables and may return inconsistent results.",
        "severity": "HIGH",
        "mitigation": "Eliminate duplication: make absenceEntries.status a VIEW over workflowInstancesV2.status (when workflowInstanceId is set), or maintain single source of truth in workflowInstancesV2 only, reading resource details via JOIN at query time (already done in approval-queries.ts). Add CHECK constraint: absenceEntries.status must match workflowInstancesV2 status (if workflowInstanceId is set)."
      },
      {
        "risk": "Hardcoded resource-type routing in dispatchResourceCompletion switch (lines 797–963) creates no-deploy-without-code burden for new workflow types (hiring_requests, transfer_requests added; probation_review requires code import). Adding a 6th type requires backend merge.",
        "severity": "MEDIUM",
        "mitigation": "Extract resource handlers to a registry pattern: Map<resourceType, (params) => Promise<void>>. Store config in DB (resource_type_handlers table: name, handlerCode, isActive) or import factory from modules/{domain}/workflow-handlers.ts. allowlist check in dispatchResourceCompletion."
      },
      {
        "risk": "ARIA recommendation (ariaRecommendationJson) lives only in absenceEntries; if hiring/transfer workflows need AI recommendation in future, no schema exists. Adding now requires migration + code.",
        "severity": "MEDIUM",
        "mitigation": "Create generic table workflow_recommendations (instanceId, recommendation, confidenceScore, metadata JSONB, createdAt). Decouple ARIA from leave: trigger job or event-handler on INSTANCE_SUBMITTED to fetch ARIA score (if applicable), write to workflow_recommendations. Queries join this table instead of absenceEntries.aria*."
      },
      {
        "risk": "Email token (JWT) stored in workflowEmailTokens with jti as PK; no cleanup policy defined. Table unbounded growth if approvals issue many tokens (e.g., 1000 approvers × 365 days = 365k rows). No TTL or archive process.",
        "severity": "LOW",
        "mitigation": "Add periodic cleanup job: DELETE FROM workflowEmailTokens WHERE expiresAt < NOW() - INTERVAL '90 days'. Alternatively, add usedAt index and purge only used tokens older than threshold. Document retention policy."
      },
      {
        "risk": "Group voting (minApprovals, votingMethod in approvalGroups) never enforced; resolveGroupMembers returns all members, but takeWorkflowAction approves entire step if any member approves. For MAJORITY or ALL voting, approval logic missing.",
        "severity": "MEDIUM",
        "mitigation": "Implement group voting engine: store groupDecisions table (groupStepInstanceId, personId, decision, decidedAt). On CUSTOM_GROUP step approval, check minApprovals threshold via vote count. For voting='WEIGHTED', sum voteWeight instead of count. Reject if quorum not met."
      },
      {
        "risk": "Rule evaluation (evaluateRules) receives ConditionNode trees but no depth limit or complexity budget — malicious rule with 1000-level nesting or circular JSON refs could OOM or hang. No input validation.",
        "severity": "MEDIUM",
        "mitigation": "Validate rule tree on insert: MAX_DEPTH=10, MAX_TERMS=100, MAX_ARRAY_LENGTH=50. Add timeout (e.g., 5s) to evaluateRules call. Log slow rules (>1s). Sanitize JSON before insert via JSON schema validator."
      },
      {
        "risk": "Context snapshot stores employee.* fields at submission time but does not capture grade changes (e.g., if grade level changed after submission, rule 'employee.grade_level > 5' still uses old context). Workflow approval chain frozen but context is stale.",
        "severity": "LOW",
        "mitigation": "Document context-at-submission semantic in code. If rules need fresh data, add context-refresh flag to step definition (fetchFreshContext=true) to load live data in evaluateRules at approval time, with audit trail. Or provide context_delta tracking."
      },
      {
        "risk": "No versioning for workflow definitions; workflowDefinitionsV2.version is incremented but old instances keep immutable snapshot — ok. But workflowStepsV2 can be edited (isActive flag), breaking historic audit trail visualization if step is soft-deleted. Dashboard showing step history may show [DELETED] for old approvals.",
        "severity": "LOW",
        "mitigation": "Ensure step soft-delete is never allowed if isActive=true instances exist. Add unique index on (workflowDefinitionId, stepOrder, isActive=true) to enforce single active version. Denormalize step name to stepInstance.stepNameAtApprovalTime when claiming step."
      },
      {
        "risk": "No schema for approval delegation workflows (re-approval after delegation); if approver delegates to subordinate who then delegates up-chain, potential infinite loop or missing approval. No cycle detection in delegation resolver.",
        "severity": "LOW",
        "mitigation": "Add delegationDepth counter in workflowStepInstances; reject if > MAX_DELEGATION_DEPTH (e.g., 3). Log all delegation events with timestamps in audit log. Dashboard warning if step has been delegated multiple times."
      }
    ],
    "recommendations": [
      "Unify state model: Remove status from absenceEntries|hiringRequests|transferRequests; add VIEW or computed column that reads from workflowInstancesV2.status. Query layer should populate resource.status field from workflow instance only, ensuring single source of truth.",
      "Create generic ResourceCompletion interface: interface IResourceCompletionHandler { resourceType: string; applyOutcome(params): Promise<void> }. Move leave|hiring|transfer handlers to modules/{domain}/workflow-handlers.ts, register in a handler factory. Use dynamic import in dispatchResourceCompletion to support new types without backend code change.",
      "Extract leave notification to configurable template: Move buildLeaveDecisionNotificationBody logic to notification_templates table (templateCode, resourceType, placeholders, bodyEn, bodyAr). dispatchResourceCompletion queries template at runtime instead of hard-coding. Same for hiring/transfer approval notifications.",
      "Implement group voting engine: Add groupDecisions table (groupStepInstanceId, personId, decision, decidedAt). When CUSTOM_GROUP step advances, require minApprovals threshold (check votingMethod: ANY_ONE=1, MAJORITY=ceil(count/2), ALL=count, WEIGHTED=sumWeights). Block approval until quorum met.",
      "Implement dynamic group membership: evaluateGroupMembers(groupId, context) evaluates approvalGroups.dynamicCondition (if memberType=DYNAMIC) against current context. Cache result per step instance to avoid repeated queries during approval.",
      "Add workflow context versioning: workflowContextSnapshots table (instanceId, version, snapshot, createdAt, reason). Allow stepInstance.refreshContextBefore (boolean); if true, call buildWorkflowContext again at approval time and audit delta. Enable rules to reference 'live' grade|location vs 'submission-time'.",
      "Create schema for multi-domain recommendations: workflowRecommendations (instanceId, recommendationType, score, metadata, createdAt). Replace absenceEntries.aria* with FK reference. Decouples ARIA from leave; supports hiring/transfer AI recommendations in future.",
      "Implement step-level voting/co-approvers: workflowStepVoters (stepInstanceId, personId, canDelegate, mustApproveBy, voteWeight). Allow hierarchyType='VOTING' where multiple people must approve (ANY_ONE|MAJORITY|ALL based on step config).",
      "Add workflow pause/recall mechanism: Enable ON_HOLD state via new action takeWorkflowAction(decision='PAUSE', stepInstanceId). Route to workflowInstancesV2 status='ON_HOLD', save recall reason. Allow authorized users to RECALL to prior step (e.g., for rework). Audit as INSTANCE_ON_HOLD, INSTANCE_RECALLED.",
      "Create context-delta tracking: Store contextChange rows (instanceId, fieldName, oldValue, newValue, detectedAt) when evaluateRules detects stale context. UI warning: 'Context refreshed: grade changed from 3→5; re-evaluate?'. Seller can Force-Refresh-Context action (increments context version, re-runs rules).",
      "Implement step effect system fully: PARALLEL_ADD steps should activate simultaneously (all WAITING steps with same stepCode prefix activate together). Store step-group metadata to identify parallel siblings. Update activateNextStep to handle parallel cohorts.",
      "Add rule-execution timeout and profiling: evaluateRules(ruleId, context, timeoutMs=5000) throws on timeout. Log slow rules (>1s) to system_performance table. Dashboard: Rule Profiler showing evaluation time distribution. Alert if new rule exceeds baseline.",
      "Enforce depth limits on condition trees: Validate rule.conditionTree on insert via MAX_DEPTH=10, MAX_TERMS=100. Return 422 on violation. Sanitize JSON before Drizzle insert (use zod schema for ConditionNode).",
      "Add approval chain visualization API: GET /api/workflow/preview returns resolved chain as DAG with parallel markers. UI shows step tiles with 'Parallel' badge, prerequisite edges. Supports workflow builder 'try me' preview.",
      "Implement SLA enforcement as policy table: workflowSlaPolicies (workflowCode, escalationLevel, actionAfterHours, action, escalateToPersonId|escalateToGroupId). Decouple processSLABreaches cron from hardcoded policies. Support custom escalation per workflow."
    ]
  },
  {
    "subsystem": "RBAC + Approval Query Boundaries",
    "currentState": "## 7 Roles and Session Claims\n\n**Defined in `/lib/auth.ts` (lines 461–468):**\n- `SUPER_ADMIN` — full system access, MFA-verified via Entra ID\n- `HR_ADMIN` — workflow + people config, MFA-verified via Entra ID\n- `HR_DIRECTOR` — workflow + people config, MFA-verified via Entra ID\n- `PAYROLL_ADMIN` — payroll-scoped, single-factor auth\n- `FINANCE` — reports + payroll, single-factor auth\n- `MANAGER` — team approvals + direct reports, single-factor auth\n- `EMPLOYEE` — self-service requests, single-factor auth\n\n**Session JWT carries:** id, email, name, role, legalEntityId, personId, mfaVerified (boolean | undefined)\n\n**MFA Enforcement (SEC-04):**\n- HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] (line 526)\n- Enforced in `requireRole()` (lines 528–548): `mfaVerified === false` blocks high-privilege operations in production (unless NODE_ENV=development)\n- Dev bypass: ENABLE_DEV_ACCOUNTS=true bypasses MFA for local testing\n\n## RBAC Path Gating (middleware.ts)\n\n**ROLE_GATED_PATHS array (lines 28–103)** defines 8 path prefix guards:\n1. `/admin/dataops` → SUPER_ADMIN only (raw DB console)\n2. `/admin/migration` → SUPER_ADMIN only (UAT data load)\n3. `/configuration` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN\n4. `/admin/probation` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN\n5. `/admin/exit-clearance` → HR_ADMIN | HR_DIRECTOR | MANAGER | PAYROLL_ADMIN | SUPER_ADMIN (union for detail-page legitimate users)\n6. `/master-data` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN\n7. `/access` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN\n8. `/users` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN\n9. `/settings` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN\n10. `/dashboard` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN | PAYROLL_ADMIN | FINANCE | MANAGER\n11. `/persons` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN | PAYROLL_ADMIN | FINANCE | MANAGER\n12. `/aria` → HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN | PAYROLL_ADMIN | FINANCE | MANAGER\n\nFallback role home (ROLE_HOME map, lines 16–24): EMPLOYEE → `/me`, all others → `/dashboard`\n\n## Approval Query Scoping\n\n**getPendingApprovalsV2() `/modules/workflow/queries.ts` (lines 82–140):**\n- Filters: `status='PENDING'` AND `assignedToPersonId=user.personId` (line 106)\n- Returns only steps assigned to the **current user** — no org-wide visibility\n- Query scope: workflowStepInstances joined to instances, definitions, steps\n- Used by: `/approvals` page (both employee and HR-admin UI)\n\n**getApprovalHistoryForUser() `/modules/workflow/queries.ts` (lines 388–458):**\n- Filters: `decidedByPersonId=user.personId` (line 412)\n- Returns steps already **actioned by the current user** (APPROVED | REJECTED | DELEGATED)\n- Enriches with current/next pending step and leave details\n- Used by: `/approvals?tab=history` (approval history tab)\n\n**getWorkflowInstanceDetailV2() `/modules/workflow/queries.ts` (lines 145–225):**\n- Accepts instanceId, no role filtering on the detail itself\n- Returns full instance + all steps (both pending and completed) + audit log (50 most recent)\n- Joined to workflowAuditLog (lines 184–189)\n- **No row-level security** — any authenticated user can view any instance detail if they have the URL/ID\n\n**getPendingApprovalsForUser() `/modules/aria/approval-queries.ts` (lines 41–143):**\n- Calls getPendingApprovalsV2() internally\n- Batch-enriches with person dept names and leave details\n- Returns formatted PendingApproval[] for UI consumption\n- Same scoping as v2: assignedToPersonId only\n\n**getLeaveRecommendationForInstance() `/modules/aria/approval-queries.ts` (lines 157–205):**\n- Fetches ariaRecommendationJson from absence_entries for a given instanceId\n- Generates recommendation on-demand via generateLeaveRecommendation() if not yet computed\n- **No scoping** — returns data for any instance if the resourceType is 'absence_entries'\n\n**getLeaveRequestSummaryForInstance() `/modules/aria/approval-queries.ts` (lines 236–300):**\n- Fetches leave request details (employee, dates, balance, attachment) from absence_entries + absenceTypes + persons\n- Joined to workflowInstancesV2 on (resourceId, resourceType='absence_entries')\n- **No explicit role/assignment check** — any authenticated user can query any instanceId\n\n## Feature Permissions (`feature_permissions` table)\n\n**Schema: `/drizzle/schema/configuration.ts` (approx. lines 54–82 custom field section references)**\n\n**Migration: `/drizzle/migrations/0012_feature_permissions.sql`**\n\n**Columns:**\n- feature_key (varchar 80, unique) — e.g., 'LEAVE_REQUEST', 'WORKFLOWS'\n- feature_label, feature_group — English labels\n- employee_perms, manager_perms, hr_admin_perms — JSONB { view, create, edit, delete, approve, export }\n- is_system_locked — prevents UI editing for core features\n\n**Seeded rows (16 feature keys):**\n- People & Workforce: EMPLOYEE_PROFILE, EMPLOYEE_CREATE, ASSIGNMENTS\n- Leave & Time: LEAVE_REQUEST, LEAVE_CALENDAR, LEAVE_BALANCES\n- Workflows: WORKFLOWS\n- Reports: REPORTS\n- Admin & Access: USER_MANAGEMENT, SETTINGS, FEATURE_PERMISSIONS (all system_locked=true), ARIA_ASSISTANT, MASTER_DATA\n\n**Current usage:** Only EMPLOYEE, MANAGER, HR_ADMIN_PERMS are populated in the migration. PAYROLL_ADMIN, FINANCE, HR_DIRECTOR, SUPER_ADMIN rows are **not seeded** — missing from the table.\n\n**Usage in UI:** Feature permissions are referenced in test files (`tests/e2e/super-admin.spec.ts` mentions role toggles) but **no runtime enforcement in route handlers or queries**. The table exists but is not consulted by business logic.\n\n## Navigation & Visibility\n\n**Workspace nav config: `/config/workspace-nav.ts`**\n- 12 workspaces (Overview, People, Organization, Leave & Time, Payroll, Workflows, Documents, Reports, AI, Administration, DataOps, Migration)\n- Workspaces marked `superAdminOnly: true` (lines 64, 368, 383) hidden from HR_ADMIN / HR_DIRECTOR\n- Approvals listed under \"Overview\" workspace as a route item (line 131)\n- Workflow builder, approval groups, delegations under \"Workflows\" workspace (lines 283–289)\n- Feature Permissions UI under \"Administration\" (line 356, superAdminOnly=true)\n\n**Admin nav config: `/config/admin-nav.ts`**\n- Used by MANAGER role only (7 groups)\n- Mirrors workspace-nav structure; Approvals, Workflow Builder, Approval Groups, Delegations in \"Workflows\" group (lines 216–249)\n- Feature Permissions under \"Admin & Access\" (line 410, not superAdminOnly — **BUG: MANAGER should not see feature perms**)\n\n**Employee nav: `/app/(employee)/me/` sidebar**\n- Employee sees: home, leave, requests, letters, documents, profile, timesheet, insurance, accommodations, bank-details, aria\n- `/me/requests` shows only **user's own initiated requests** (not approvals or workflow ops)\n- `/me/leave` and `/me/requests/[requestId]` show self-service workflow status\n\n## Audit Trail\n\n**workflow_audit_log table: `/drizzle/schema/workflow-engine.ts` (lines 465–483)**\n- Columns: id, tenantId, instanceId, stepInstanceId, action (enum), actorPersonId, actorName, ipAddress, userAgent, eventData (jsonb), loggedAt\n- Indexes: on instanceId+loggedAt, on actorPersonId+loggedAt\n- **No query exists to fetch org-wide audit or approvals by role.** Only getWorkflowInstanceDetailV2() surfaces audit for a single instance.\n\n## Current UI Pages\n\n- **`/approvals` (HR_ADMIN+):** Two-tab layout (Pending | My decisions)\n  - Pending tab: getPendingApprovalsV2() — steps assigned to me\n  - History tab: getApprovalHistoryForUser() — steps I've already decided\n  - Detail: `/approvals/[instanceId]` — full instance detail + audit log\n  \n- **`/me/requests` (EMPLOYEE):** My workflow instances initiated by me (getMyWorkflowRequests)\n  \n- **`/me/leave`:** Leave request status for own submissions\n\n- **`/configuration/workflows`:** Workflow definition builder (HR_ADMIN+ only)\n\n- **`/configuration/workflows/groups`:** Approval group management (HR_ADMIN+ only)\n\n- **`/configuration/workflows/delegations`:** Delegation rules (HR_ADMIN+ only)",
    "keyFiles": [
      "/lib/auth.ts — Session types, KRole enum, HIGH_PRIVILEGE_ROLES, requireRole(), roleHome()",
      "/middleware.ts — ROLE_GATED_PATHS array, role-based path routing, OBS-003 request ID",
      "/modules/workflow/queries.ts — getPendingApprovalsV2(), getWorkflowInstanceDetailV2(), getMyWorkflowRequests(), getApprovalHistoryForUser()",
      "/modules/aria/approval-queries.ts — getPendingApprovalsForUser(), getLeaveRecommendationForInstance(), getLeaveRequestSummaryForInstance()",
      "/drizzle/schema/workflow-engine.ts — workflowInstancesV2, workflowStepInstances, approvalGroups, approvalGroupMembers, workflowStepsV2, workflowAuditLog tables",
      "/drizzle/schema/configuration.ts — featurePermissions table definition",
      "/drizzle/migrations/0012_feature_permissions.sql — feature permission rows seeding",
      "/app/(hr-admin)/approvals/page.tsx — Pending & History approvals UI",
      "/app/(employee)/me/requests/page.tsx — Employee's own requests",
      "/config/workspace-nav.ts — 12 workspaces for HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN",
      "/config/admin-nav.ts — 7 nav groups for MANAGER role"
    ],
    "strengths": [
      "Clean role-based segmentation in JWT: 7 distinct roles with clear intent",
      "MFA enforcement for high-privilege operations (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN) via mfaVerified claim",
      "Middleware defense-in-depth: ROLE_GATED_PATHS guards protect broad admin sections before per-page checks",
      "Scoped query design: getPendingApprovalsV2() correctly filters to assignedToPersonId; getMyWorkflowRequests() filters to initiatedByPersonId",
      "Comprehensive audit trail: workflow_audit_log captures action, actor, timestamp, event data for compliance",
      "Feature permissions table exists and is seeded for future runtime enforcement",
      "OBS-003: Request correlation IDs injected in middleware for observability",
      "Responsive navigation: different workspaces/nav configs per role (workspace-nav vs admin-nav vs employee sidebar)",
      "MFA bypass for dev: allows local testing with hardcoded DEV_ACCOUNTS"
    ],
    "gaps": [
      "CRITICAL: No 'Workflow Operations' view for org-wide approval oversight. HR_ADMIN can only see steps assigned to them personally, not view all pending workflows, manager assignments, SLA breaches, or bottlenecks.",
      "CRITICAL: getWorkflowInstanceDetailV2() has no row-level security. Any authenticated user with the instanceId can view any workflow's full history, including steps not assigned to them.",
      "Feature permissions table is orphaned: 16 seeded rows but zero runtime enforcement. Queries never consult feature_permissions; RBAC is JWT-role-only. Creates false sense of granularity.",
      "Feature_permissions missing rows for PAYROLL_ADMIN, FINANCE, HR_DIRECTOR, SUPER_ADMIN roles (only EMPLOYEE, MANAGER, HR_ADMIN seeded). Incomplete definition.",
      "Admin-nav.ts line 410 (MANAGER sees Feature Permissions) contradicts middleware (only HR_ADMIN+ allowed). UI nav bug = confused role boundary.",
      "getLeaveRecommendationForInstance() and getLeaveRequestSummaryForInstance() have no scoping checks. Any authenticated user can fetch leave details for any absence_entries record.",
      "No query to list all pending approvals by department, manager, workflow type, or SLA status. Org-wide reporting requires N+1 queries over instances.",
      "Session JWT carries personId as optional; fallback behavior when undefined is not explicitly documented in queries (some assume non-null).",
      "getPendingApprovalsV2() limit=100 hard-coded; no pagination for >100 pending approvals.",
      "No delegation-aware filtering in getPendingApprovalsV2(). If user delegates an approval, the query doesn't adjust. Relies on manual DB updates.",
      "Approval group member scoping: approvalGroupMembers.effectiveFrom/effectiveTo dates are in the schema but never consulted by queries when resolving group membership.",
      "No multi-entity scoping shown. If legalEntityId differs between user and workflow, no query filters it out. Cross-entity boundary relies on URL-level access control.",
      "getApprovalHistoryForUser() returns up to 100 rows with no sorting by date/role. Can't filter history by workflow type, decision reason, or approval chain depth."
    ],
    "risks": [
      {
        "risk": "Unauthorized Detail View (CWE-639): Any user can GET /approvals/[instanceId] and see full approval history, including sensitive leave reasons, salary revision amounts, or hiring decisions for workflows they should not access.",
        "severity": "HIGH",
        "mitigation": "Add instance ownership check in getWorkflowInstanceDetailV2(): verify user is either initiator, assigned to a step, or in an admin role. Return 403 if none match."
      },
      {
        "risk": "Org-wide Data Exfiltration: No query prevents iterating instanceIds sequentially to enumerate all workflows, SLAs, and decisions system-wide. No rate limiting on detail endpoint.",
        "severity": "HIGH",
        "mitigation": "Implement per-instance authorization. Add audit logging for every detail fetch (currently logged only on action, not read). Rate-limit /approvals/[id] to 10/min per user."
      },
      {
        "risk": "Feature Permissions Inconsistency (OSVDB-style config weakness): The feature_permissions table is unused by queries. An HR_ADMIN could theoretically be denied 'create' permission via the UI, but the API would still allow creation because the query has no enforcement.",
        "severity": "MEDIUM",
        "mitigation": "Either delete the table (feature flags live in code) or enforce it everywhere. Add a middleware or query guard: `const perms = await getFeaturePermissions(user.role); if (!perms.create) throw 403`."
      },
      {
        "risk": "Missing High-Privilege Role Coverage: PAYROLL_ADMIN, FINANCE, HR_DIRECTOR, SUPER_ADMIN have no featurePermissions rows. If future code tries to enforce perms, it will return null and likely default to allow-all or crash.",
        "severity": "MEDIUM",
        "mitigation": "Extend feature_permissions migration to seed all 7 roles. Define explicit deny-all-by-default for each new role."
      },
      {
        "risk": "Manager Role Boundary Confusion: admin-nav.ts exposes /access/feature-permissions to MANAGER, but middleware blocks it. If a MANAGER navigates to /access/feature-permissions, they'll see 403. UI/middleware inconsistency invites bugs in future refactors.",
        "severity": "LOW",
        "mitigation": "Remove feature-permissions from admin-nav.ts MANAGER section. Keep it superAdminOnly in workspace-nav.ts only."
      },
      {
        "risk": "Delegation Not Honored: workflowDelegationRules table exists but getPendingApprovalsV2() doesn't consult it. If user A delegates approval rights to user B, B's getPendingApprovalsV2() won't show the delegated steps — user A still sees them, even if they're unavailable.",
        "severity": "MEDIUM",
        "mitigation": "Modify getPendingApprovalsV2() WHERE clause: `AND (assignedToPersonId=user.personId OR personId IN (active_delegates_for_user))`."
      },
      {
        "risk": "SLA Escalation Without Role Check: workflow_steps_v2.escalationGroupId / escalationPersonId are resolved and notified by the engine, but no query verifies the escalation target user has 'approve' permission for that workflow. Escalation could notify a PAYROLL_ADMIN for a leave request.",
        "severity": "MEDIUM",
        "mitigation": "Add escalation validation in workflow engine: assert escalation person/group has approve permission for the workflow's resourceType. Log if not."
      },
      {
        "risk": "No Approval Chain Tampering Audit: workflowAuditLog records actions but has no immutability guarantee (created_by/created_date not indexed as immutable). An attacker with DB access could delete audit rows. Table lacks a trigger or crypto hash to detect tampering.",
        "severity": "MEDIUM",
        "mitigation": "Add immutable audit table (append-only materialized view or separate event-store); index loggedAt DESC; add a PostgreSQL trigger to forbid UPDATEs/DELETEs on workflow_audit_log."
      }
    ],
    "recommendations": [
      "**Build 'Workflow Operations' View for HR_ADMIN+**: Create getWorkflowsDashboardV2(filters: {workflowCode?, status?, slaBreached?, approverPersonId?}): Promise<WorkflowDashboardRow[]>. Returns all instances, grouped by status/SLA, with current assignee and step name. Used by `/dashboard/workflows` or `/approvals/operations`. Let HR_ADMIN see pending workload by manager, department, or type.",
      "**Implement Instance-Level Authorization**: Before returning getWorkflowInstanceDetailV2(), add a query parameter isUserAuthorizedForInstance(user, instanceId): Promise<boolean> that checks: (1) user is initiator, (2) user is assigned to any step, (3) user is admin, (4) user is in approval chain. If not, return null. Patch detail page to 403 on null.",
      "**Unify Feature Permissions or Remove**: If enforcing at query level: create getFeaturePermissions(role: KRole, feature: string): Promise<FeaturePerm>. Add to every query that creates/edits/deletes. Seed all 7 roles with explicit allow/deny. If not enforcing: delete the table and document feature flags in code comments only.",
      "**Extend Approval Queries for Org-Wide Reporting**: Add getApprovalMetricsByRole(role, filters): Promise<ApprovalMetrics> returning {total, pending, breached, avgTimePending, topBottlenecks}. Enables dashboards and SLA compliance reports.",
      "**Honor Delegation Rules in Queries**: Modify getPendingApprovalsV2() to LEFT JOIN workflowDelegationRules and include delegated steps. Add a 'isDelegated' boolean to PendingApprovalV2 so UI can label them.",
      "**Implement Multi-Step Approval History**: Add getApprovalChainForInstance(instanceId): Promise<ChainRow[]> returning [{stepOrder, stepName, status, assignee, decision, decidedAt}]. Surface on detail page so approvers understand what's already been approved vs pending vs rejected.",
      "**Add Department/Team Scoping**: Many queries filter by personId. Add optional filter: assignmentSnapshot.departmentId or initiator.currentDepartmentId. Let managers see only team approvals without admin access.",
      "**Enforce Effective Dates on Group Members**: Modify approval group member resolution to check effectiveFrom <= NOW <= effectiveTo before including in votingMethod calculation. Add a note if a member is 'inactive' due to date range.",
      "**Immutable Audit Log**: Add PostgreSQL trigger on workflow_audit_log: BEFORE UPDATE/DELETE → RAISE EXCEPTION. OR create a separate 'audit_archive' table (insert-only) and migrate historical rows monthly.",
      "**Paginate All Queries**: Replace limit=100 hard-coded values with (limit, offset) parameters. Return {data[], total, pageSize, hasMore}. Needed for /approvals with >100 pending items.",
      "**RBAC Matrix Documentation**: Create a markdown table in /docs/ with columns [Role | My Approvals | My Requests | Workflow Ops | Feature Permissions | Edit Workflows | View All Reports]. Link from README. Maintain during each role change.",
      "**Fix admin-nav.ts Bug**: Remove feature-permissions from MANAGER's nav. Consider whether MANAGER should see any admin pages; current config is inconsistent.",
      "**Session Fallback for Missing personId**: Add explicit comment in requireRole(): 'If personId is undefined, queries will fail gracefully with 'no approvals found', not 500. Monitor logs for undefined personId in production.'",
      "**SLA Escalation Validation**: Before workflowEngine sends escalation notification, verify escalationPersonId / escalationGroupId has 'approve' permission for the workflow. Log mismatches to workflow_audit_log.",
      "**Approval Group Voting Edge Case**: Document behavior when minApprovals > active member count. Does workflow auto-reject or pause indefinitely? Add a query: canApprovalGroupApprove(groupId): Promise<boolean>."
    ]
  },
  {
    "subsystem": "Notification Engine (IN_APP Bell + EMAIL Outbox)",
    "currentState": "## TWO PARALLEL NOTIFICATION SYSTEMS\n\n### System 1: IN_APP Bell (notification_log table)\n**Table:** `/drizzle/schema/transactions.ts` lines 115-141 — `notification_log`\n\nColumns:\n- `id` (UUID, PK)\n- `recipientPersonId` (UUID, FK to persons)\n- `notificationType` (varchar, 100): DOCUMENT_EXPIRY | LEAVE_REQUEST | LEAVE_APPROVED | APPROVAL_REQUIRED | APPROVAL_ESCALATION | ARIA_ALERT | SYSTEM_ALERT | LETTER_SIGN_REQUEST\n- `channel` (varchar, 30): PUSH | EMAIL | SMS | IN_APP | ARIA\n- `subjectEn/Ar`, `bodyEn/Ar` (text, bilingual)\n- `referenceType` (varchar, 100): WORKFLOW_INSTANCE | etc.\n- `referenceId` (UUID)\n- `status` (varchar, 20): PENDING | SENT | DELIVERED | READ | FAILED | BOUNCED\n- `readAt`, `sentAt`, `deliveredAt` (timestamps)\n- Audit columns: `createdBy`, `createdDate`, etc.\n\n**Bell Query Path:** \n- `/components/topbar/NotificationBell.tsx` (Client Component wraps):\n  - `/components/layout/NotificationBell.tsx` (Server Component)\n    - Fetches 10 most-recent notifications + unread count (lines 23-55)\n    - Query: `SELECT id, subjectEn, subjectAr, bodyEn, bodyAr, type, status, createdDate, referenceType, referenceId FROM notification_log WHERE tenantId=TENANT_ID AND recipientPersonId=currentUser.personId ORDER BY createdDate DESC LIMIT 10`\n    - Unread logic: `status != 'READ'` (line 53)\n    - Passes `unread` count + 10-item list to NotificationBellClient (legacy; see Gap 1)\n\n**Bell Display Panel:**\n- `/components/topbar/NotificationPanel.tsx` (Client Component, 714 lines)\n  - Fetches full notifications via `getMyNotifications(personId, tenantId)` → `/modules/notification/topbar-actions.ts` lines 21-55\n  - Query: `SELECT id, notificationType as type, subjectEn as title, bodyEn as message, status, createdDate, referenceId, referenceType FROM notification_log ... WHERE recipientPersonId=personId ORDER BY createdDate DESC LIMIT 50`\n  - Maps to UI data: `{ id, type, title, message, isRead: status==='READ' or 'ACTIONED', isActioned: status==='ACTIONED', createdAt, workflowInstanceId, referenceId, referenceType }`\n  - Renders two sections:\n    1. **Active items** (lines 275-329): clickable list, unread indicator dot\n    2. **Actioned items** (lines 331-398): read-only history\n  - Right panel (lines 405-710):\n    - Left select → center detail view\n    - For leave requests: calls `getApprovalDetail(workflowInstanceId)` (lines 92-208 in topbar-actions.ts)\n      - Joins workflow instance + absenceEntries + persons + absenceTypes\n      - Renders fields: Employee, Employee#, Leave Type, From, To, Duration, Status, Ref#\n    - For backdated hire: renders hireContext from contextSnapshot\n    - **Action buttons** (lines 578-707): Approve/Reject/Ask (inline inside panel)\n    - **NO workflow-aware preview** (Gap 2): does not show prev/current/next approver, ARIA recommendation, or current step name\n\n### System 2: EMAIL Outbox (workflow_notification_queue table)\n**Table:** `/drizzle/schema/workflow-engine.ts` lines 532-559 — `workflowNotificationQueue`\n\nColumns:\n- `id` (UUID, PK)\n- `instanceId` (UUID, FK to workflowInstancesV2)\n- `stepInstanceId` (UUID, FK to workflowStepInstances)\n- `channel` (varchar, 20): always 'EMAIL'\n- `recipientPersonId`, `recipientEmail` (for delivery)\n- `templateCode` (varchar, 100): WF_APPROVAL_REQUEST | etc.\n- `subject`, `bodyHtml`, `bodyText` (prerendered)\n- `actionUrl` (text): one-click approval link\n- `status` (notificationStatusEnum): QUEUED | SENT | BOUNCED | FAILED\n- `sendAfter` (timestamp, default now)\n- `sentAt`, `failedAt`, `failureReason`, `retryCount` (audit)\n- Indexes: `(status, sendAfter)`, `(instanceId)`\n\n**Queue Writer:**\n- `/lib/workflow-engine.ts` lines 234-258: `queueNotification(params)` — atomically inserts into workflowNotificationQueue when a workflow step is activated\n  - Triggered at:\n    - Line 385-392: activateNextStep (step 1+ of a workflow)\n    - Line 727: submitWorkflow (initial approver)\n    - Line 1415: cascading escalation\n  - Generates JWT email token (lines 262-288) with HMAC(HS256)\n    - Token payload: `{ jti, sub: personId, inst: instanceId, step: stepInstanceId, act: 'APPROVE', exp: deadline }`\n    - Stored in `workflowEmailTokens` for blacklist/revocation checking\n    - One-click URL: `${NEXT_PUBLIC_APP_URL}/api/workflow/action?token=${token}`\n\n**Process Driver (Background Worker):**\n- `/lib/jobs/process-driver.ts` lines 45-54: `dispatchEvent()` \n  - Polls events table (transactional outbox), NOT workflow_notification_queue\n  - Email dispatch is Phase 2 (line 53: \"Phase 2 will add webhook/email dispatch\")\n  - **Currently: NO email worker implemented**\n\n### IN_APP Bell Writes:\n- `/lib/workflow-engine.ts` lines 417-433: activateNextStep writes IN_APP notification to notification_log:\n  - Type: LEAVE_APPROVAL_REQUESTED\n  - Subject: `${wfNameEn} Awaiting Your Approval`\n  - Body: `${reqName} has submitted a ${wfNameEn} that requires your approval. Please review and approve or reject.`\n  - Status: SENT (created as already-sent; never transitioned to READ by read handler)\n- `/modules/notification/topbar-actions.ts` lines 254-263: markAllRead → UPDATE status='READ'\n\n### Approval Detail Page (Full Context):\n- `/app/(hr-admin)/approvals/[instanceId]/page.tsx` (full approval flow)\n  - Calls `getWorkflowInstanceDetailV2(instanceId)` → `/modules/workflow/queries.ts` lines 145-225\n    - Fetches: workflowInstancesV2 + workflowDefinitionsV2 + workflowStepsV2 + workflowStepInstances + persons\n    - Returns: full approval chain with all steps (WAITING, PENDING, APPROVED, REJECTED, DELEGATED, etc.)\n    - Each step: stepName, assigneeName, status, decision, decisionNote, decidedAt, slaDeadline, isFyiOnly\n  - Displays:\n    - Request summary (for leaves): employee, type, dates, balance before/after, reason, attachment\n    - **Full approval chain** (lines 253-358): all steps in order, current step highlighted, decisions shown inline\n    - Current pending step assigned to user → shows WorkflowActionForm (Approve/Reject/Delegate)\n    - ARIA recommendation card (when available)\n    - Audit log of all decisions + timestamps\n  - **Crucially: shows ENTIRE chain + PREVIOUS decisions + NEXT approver in the chain**",
    "keyFiles": [
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/transactions.ts#115-141",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/workflow-engine.ts#532-559",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/components/topbar/NotificationBell.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/components/topbar/NotificationPanel.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/components/layout/NotificationBell.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/workflow-engine.ts#232-258,262-288,354-433,460-650",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/jobs/process-driver.ts#45-54",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/notification/topbar-actions.ts#21-208",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/notification/index.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/workflow/queries.ts#82-225",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/page.tsx#1-225",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/[instanceId]/page.tsx#1-300+",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/[instanceId]/action-form.tsx"
    ],
    "strengths": [
      "Clean separation of concerns: notification_log (IN_APP state) vs workflowNotificationQueue (EMAIL delivery). Both keyed by instanceId + stepInstanceId for traceability.",
      "Idempotent background job design: outbox poller retries failed rows up to OUTBOX_MAX_RETRIES=5, then stamps with processed_at + error_text for ops visibility (process-driver.ts lines 68-145).",
      "JWT email token issuance: HMAC(HS256) with jti tracking in workflowEmailTokens table prevents replay/tampering. One-click approval links are stateless but validated against blacklist.",
      "Atomic workflow submission: when submitWorkflow is called with outer tx parameter, all writes (instance + steps + audit + notifications) participate in a single transaction, preventing orphaned approvals.",
      "Full approval chain visibility in detail page: shows ALL steps in order, previous decisions inline with timestamps, enabling approver to understand context before deciding.",
      "Bilingual notification support: subjectEn/Ar, bodyEn/Ar in notification_log; typeNameEn/Ar in absenceTypes; browser locale determines which is shown.",
      "SLA deadline calculations per-step: workflowStepsV2.slaHours + workflow-sla.ts calculateSLADeadline() respects legal entity calendar (business days/hours, blackout periods)."
    ],
    "gaps": [
      "GAP 1: Bell component does NOT use workflow-aware data. NotificationPanel (714 lines) fetches 50 notifications, but they are generic IN_APP records. When a notification has workflowInstanceId, panel calls getApprovalDetail (92-208 in topbar-actions.ts), which queries the workflow instance + step instances. However, getApprovalDetail only returns the CURRENT approval detail for the selected notification — it does NOT fetch the full workflow chain context. This means: (a) approver cannot see previous steps' decisions from within the bell, (b) cannot see what the NEXT approver will be, (c) cannot see step names until clicking into notification. CONTRAST: approval detail page (approvals/[instanceId]/page.tsx) fetches full getWorkflowInstanceDetailV2 showing entire chain.",
      "GAP 2: No ARIA integration in bell preview. When getApprovalDetail is called (lines 92-208), it does NOT fetch leave recommendations (ARIA). The approval detail page calls getLeaveRecommendationForInstance + getLeaveRequestSummaryForInstance (lines 69-70 of approvals/[instanceId]/page.tsx) and renders AriaRecommendationCard. Bell notification preview has no equivalent — approver does not see ARIA recommendation in the dropdown, must open full detail page.",
      "GAP 3: No ARIA summary or confidence score in notification_log. When a workflow instance is created for a leave request, the workflow-engine.ts notification writer (lines 417-433) creates a notification with generic template: subject=`${wfNameEn} Awaiting Your Approval`, body=`${reqName} has submitted... Please review and approve or reject.` — no ARIA recommendation confidence, budget remaining, or recommendation summary is embedded in the notification text or in a separate field.",
      "GAP 4: Duplicated leave-request detail logic. NotificationPanel.tsx (lines 466-491) renders leave approval details inline: Employee, Employee#, Leave Type, From, To, Duration, Status, Ref#. The approval detail page (approvals/[instanceId]/page.tsx, lines 192-217) duplicates this: Employee, Employee#, Absence type, Dates, Days requested, Balance before/after, Reason/notes, Attachment, Request status. Different field selection, different rendering, same underlying data — no shared component or query.",
      "GAP 5: No inline approve/reject in approval detail page. The detail page shows full chain + request context, but action buttons are in a separate card (WorkflowActionForm, lines 398+). The bell panel allows inline Approve/Reject/Ask in the right column, but the detail page does NOT — requires opening a form card. UX inconsistency: bell is action-forward, detail page is context-heavy.",
      "GAP 6: Email outbox is queued but NOT dispatched. workflowNotificationQueue rows are inserted (queueNotification, lines 234-258) but the background worker (process-driver.ts) does NOT process them. dispatchEvent (lines 45-54) polls the events table (transactional outbox) and only handles ARIA.LEAVE_RECOMMENDATION. Email dispatch is Phase 2. This means: (a) EMAIL notifications are stuck QUEUED forever, (b) one-click JWT tokens expire (expiresAt = slaDeadline), (c) approvers must use IN_APP bell or receive no reminder.",
      "GAP 7: No ARIA risk score or leave balance in approval chain. The detail page renders AriaRecommendationCard AFTER the approval chain (line 311), not inline with the step. For complex cases with policy violations, the ARIA recommendation should be elevated to step 0 or prominently highlighted so approver sees risk BEFORE viewing the chain.",
      "GAP 8: No workflow-aware ARIA contextualization. The bell notification created at activation (line 417) has generic text. When ARIA has a recommendation, the body should include: leave balance, ARIA confidence, any policy violations, or a brief summary. Currently, approver sees only 'Request awaiting approval' and must click to see ARIA details.",
      "GAP 9: No step-instance level ARIA snapshot. When activateNextStep queues a notification, the recommendation (if any) is fetched later on-demand via getLeaveRecommendationForInstance(instanceId). If ARIA changes between notification creation and approver opening the detail page, the approver sees stale or updated recommendation. No immutable copy of the ARIA state is captured at notification time."
    ],
    "risks": [
      {
        "risk": "Email notifications stuck QUEUED — no worker dispatch. workflowNotificationQueue rows inserted but process-driver.ts does NOT call an email sender. Phase 2 placeholder. If Phase 2 is delayed, approvers beyond the line manager (HR_ADMIN, CEO, etc.) receive ZERO notifications. They rely on the IN_APP bell — a refresh-required UI with 60s polling (NotificationBell.tsx line 30).",
        "severity": "HIGH",
        "mitigation": "Implement dispatchEmailNotification() in lib/jobs/ that picks rows from workflowNotificationQueue WHERE status='QUEUED' AND sendAfter<=now. Call it from process-driver.ts on a frequent schedule (e.g., every 30s). Use SendGrid or Resend SDK. Update retry logic to match outbox pattern (exponential backoff, max 5 retries). Add metrics (OBS-005 style) for queue depth + failure rate."
      },
      {
        "risk": "JWT token expiry during SLA deadline. issueEmailToken (line 262-288) sets expiresAt=stepSlaDeadline. If SLA is 48h and approver does not click the one-click link within 48h, the token expires and the email link becomes invalid. The approver must then sign in via the bell. During escalation (SLA breach), the next approver gets a NEW token, but the original approver's email link dies silently with no notification.",
        "severity": "MEDIUM",
        "mitigation": "Set token expiresAt to a longer duration (e.g., slaDeadline + 7 days) to tolerate late clicks. Or implement a 'token refresh' endpoint that issues a new token if the old one is expired but the step is still PENDING. Clarify in email: 'This link expires on [date]. You can also sign in at [portal URL].' Add token-expiry logging to workflowAuditLog so ops can detect patterns."
      },
      {
        "risk": "No ARIA confidence or risk in notification text. When a leave request has a policy violation (e.g., requesting leave during blackout, or ARIA confidence=0.4), the IN_APP bell notification body still says 'Please review and approve or reject.' with no hint of the underlying risk. Approver may not realize they should open the detail page to see ARIA.",
        "severity": "MEDIUM",
        "mitigation": "In activateNextStep (line 417+), after creating the notification row, fetch the ARIA recommendation if resourceType='absence_entries'. If ARIA.confidence < 0.5 or if violations exist, update the notification body to include: 'AVANIIS AI flagged policy concerns — see details in approval.' Update subjectEn/Ar to include a risk indicator: '[RISK] Annual Leave Awaiting Your Approval'. Reuse getLeaveRecommendationForInstance(instanceId) at notification time, store result in notification_log as a new column (e.g., meta_json) for later retrieval."
      },
      {
        "risk": "Bell notification preview incomplete; approver must click full detail page. NotificationPanel.tsx does not show: (a) previous step decisions, (b) next approver, (c) full approval chain, (d) ARIA recommendation. Approver sees only a summary and must open /approvals/[instanceId] for full context. This is friction and may lead to hasty decisions.",
        "severity": "MEDIUM",
        "mitigation": "Enhance getApprovalDetail to return full workflow chain (all steps, decisions, assignees), not just current instance. Rename to getApprovalDetailWithChain. Expand NotificationPanel right column to show a collapsible 'Approval chain' section listing all steps (with decision pills, assignee names, timestamps). If space is tight, render a 'X more steps' link that expands the chain."
      },
      {
        "risk": "ARIA recommendation not tied to notification instance. ARIA recommendations are fetched on-demand via getLeaveRecommendationForInstance(instanceId) at detail-page view time. If ARIA updates after the notification is created (e.g., new policy rule), the approver sees a different recommendation than what triggered the notification. No immutable snapshot at notification time.",
        "severity": "LOW",
        "mitigation": "Capture ARIA recommendation (confidence, violations, summary) as a JSON snapshot when activateNextStep queues the notification. Store in a new column (e.g., meta_json or aria_snapshot_json) in notification_log or workflowNotificationQueue. When the detail page is opened, show: 'ARIA recommendation at time of approval: [snapshot]'. If updated since, append 'Updated recommendation: [current]' for transparency."
      },
      {
        "risk": "Duplicate leave request rendering logic (bell vs detail page). NotificationPanel.tsx lines 468-490 renders leave fields; approvals/[instanceId]/page.tsx lines 192-217 renders similar fields. Different field sets, different styles, same source query (getApprovalDetail + getLeaveRequestSummaryForInstance). Maintenance burden if leave schema changes.",
        "severity": "LOW",
        "mitigation": "Extract a shared LeaveRequestSummaryCard component that both NotificationPanel and ApprovalDetailPage import. Component accepts leave summary data and renders the table of fields (Employee, Type, Dates, Balance, Reason, Attachment, Status). Pass optional props to hide fields depending on context (e.g., hide 'Request status' in the detail page, show it in the bell). Reduce code duplication from ~40 lines to ~1 shared component."
      }
    ],
    "recommendations": [
      "URGENT: Implement email dispatch worker. Create /lib/jobs/email-dispatch.ts that queries workflowNotificationQueue WHERE status='QUEUED' AND sendAfter<=now AND retryCount<5. For each row, send via SendGrid/Resend, update sentAt + status='SENT'. On failure, increment retryCount + update failureReason + failedAt. Integrate into process-driver.ts startProcessDriver() as the 7th background job. Add metrics OBS-005 style: queue depth, success rate, avg latency.",
      "RECOMMENDED: Enhance bell notification with workflow chain preview. In getApprovalDetail (topbar-actions.ts lines 92-208), add a query to workflowStepInstances (all steps for the instance, ordered by stepOrder). Return full chain with step names, assignee names, decisions, timestamps. Render in NotificationPanel right column as a compact vertical timeline showing 'Step 1: Line Manager — Approved by X at Y. Step 2: HR Admin — Pending (you). Step 3: CEO — Waiting.' This gives approver full context in the dropdown without clicking away.",
      "RECOMMENDED: Embed ARIA recommendation in notification body. In activateNextStep (workflow-engine.ts line 417+), after inserting the notificationLog row, fetch the ARIA recommendation (if resourceType='absence_entries') via getLeaveRecommendationForInstance(instanceId). If confidence<0.5 or violations exist, update the notification subjectEn/Ar to include '[RISK] ' prefix and body to append: '\\n\\nAVANIIS AI Analysis: [summary of confidence / violations]. Review ARIA recommendation in detail.'",
      "RECOMMENDED: Extract shared LeaveRequestSummaryCard component. Create /components/workflow/LeaveRequestSummaryCard.tsx (60 lines) that renders the leave details table (Employee, Type, Dates, Duration, Balance, Reason, Attachment, Status). Import in NotificationPanel.tsx AND approvals/[instanceId]/page.tsx. Pass optional showStatus, showAttachment props to control which fields render. Reduces duplication, centralizes styling, makes future schema changes easier.",
      "OPTIONAL: Implement ARIA snapshot at notification time. In workflowNotificationQueue table, add a column meta_json (JSONB, nullable). In activateNextStep/submitWorkflow queueNotification(), after fetching ARIA recommendation, store { confidence, violations: [...], summary } in meta_json. On detail page, render: 'ARIA recommendation at time of approval: Confidence 85%, No violations.' If recommendation updated since, append with a visual divider. Provides transparency and prevents confusion over stale vs current ARIA state.",
      "OPTIONAL: Consider inline approve/reject on detail page. Currently, WorkflowActionForm (action-form.tsx) is a separate card requiring scroll. In approvals/[instanceId]/page.tsx, consider rendering the action form inline at the bottom of the approval chain, after the current PENDING step, so approver doesn't lose context while actioning.",
      "OPTIONAL: Add step-instance level SLA metrics. In workflowStepInstances table, add sla_hours INT (nullable, default from workflowStepsV2.slaHours). In activateNextStep, store the step's SLA hours on the instance for immutable audit trail. This allows historical analysis: 'How often did HR Admin exceed SLA on leave approvals?' without joining to step definitions.",
      "OPERATIONAL: Set up email provider integration (SendGrid/Resend). Define env vars SENDGRID_API_KEY (or RESEND_API_KEY), MAIL_FROM_ADDRESS, MAIL_FROM_NAME. In lib/jobs/email-dispatch.ts, load from env and initialize client at start. Use template system: templateCode from workflowNotificationQueue maps to a SendGrid Dynamic Template ID or Resend template slug. Store mapping in a config file (e.g., config/email-templates.json) to avoid hardcoding."
    ]
  },
  {
    "subsystem": "ARIA Intelligence Integration for Workflows",
    "currentState": "ARIA currently integrates with workflows in two isolated ways:\n\n1. **Leave Recommendation Generation** (`modules/aria/leave-recommendation.ts`): After a leave request is submitted, the outbox poller calls `generateLeaveRecommendation(requestId)`. This fetches contextual data (balance, coverage, history, compliance), calls Claude Sonnet 4.6 with a structured system prompt, and persists the result to `absence_entries.aria_recommendation_json` (columns: `aria_recommendation`, `aria_confidence_score`, `aria_recommendation_json`). The recommendation (APPROVE/REJECT/REVIEW) is rendered by `AriaRecommendationCard.tsx` in the approval UI as advisory-only guidance.\n\n2. **Workflow Summary Query** (`modules/aria/workflow-queries.ts`, `modules/aria/services.ts`): ARIA intent `WORKFLOW_QUERY` calls `getWorkflowSummary()`, which aggregates `workflow_instances_v2` + `workflow_steps_v2` data to report: pending count, approved/rejected today, SLA breached. Returns top 5 pending items with initiator name, trigger event, days open, SLA status. Gated to MANAGER+ roles. No rich approval details (current owner, next approver, age, escalation history).\n\n3. **Approval Status in Drafts** (`modules/aria/approval-queries.ts`): `getLeaveRecommendationForInstance(instanceId)` and `getLeaveRequestSummaryForInstance(instanceId)` are called from approval detail pages to join `workflow_instances_v2` → `absence_entries` and render the ARIA card + leave details. Data is scattered: leave details from `absence_entries`, ARIA recommendation from `aria_recommendation_json` JSONB column, workflow metadata from instance snapshot.\n\n**Data Sources Today:**\n- `workflow_instances_v2`: id, status, currentStepId, slaDeadline, startedAt, completedAt, initiatedByPersonId, resolvedSteps (JSONB snapshot), hierarchySnapshot (JSONB snapshot)\n- `workflow_step_instances`: assignedToPersonId, status, decidedByPersonId, decision, decidedAt, slaDeadline\n- `workflow_steps_v2`: stepNameEn, hierarchyRole\n- `workflow_definitions_v2`: workflowCode, workflowNameEn, defaultSlaHours\n- `absence_entries`: ariaRecommendation, ariaConfidenceScore, ariaRecommendationJson\n- `workflow_audit_log`: action, loggedAt, eventData (INSERT-only; contains approval history)",
    "keyFiles": [
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/leave-recommendation.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/approval-queries.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/workflow-queries.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/services.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/types.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/aria/intents/org-chart-intents.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/components/aria/AriaRecommendationCard.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/workflow-engine.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/workflow/queries.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/page.tsx"
    ],
    "strengths": [
      "ARIA recommendation generation is fully decoupled from approval UI via async outbox polling + non-fatal failures — approvers always get a clear state (recommendation or 'unavailable') with no indefinite spinners",
      "Recommendation JSON persists to a single immutable JSONB column (aria_recommendation_json) with versioned model tag, enabling clean audit trail and replay",
      "Hard Rule 1 (every write is logged via writeAuditLog in same transaction) ensures all ARIA actions appear in workflow_audit_log for compliance/review",
      "ARIA intent classifier (classifyIntent) uses live Claude API to resolve natural-language workflow questions and route to WORKFLOW_QUERY handler safely (gated by MANAGER+ role)",
      "AriaRecommendationCard is bilingual (en/ar), factors-based, and clearly disclaims 'advisory only' — removes approver confusion about decision authority",
      "Workflow data in snapshot form (hierarchySnapshot, contextSnapshot, resolvedSteps JSONB) means ARIA can inspect immutable approval chain without live data staleness issues",
      "getPendingApprovalsForUser joins workflow_instances_v2 → workflow_step_instances → workflowStepsV2 cleanly — adequate for current approval inbox use case"
    ],
    "gaps": [
      "No single unified query to fetch workflow status + current owner + next approver + age + SLA + escalation path in one call — ARIA (and dashboards/reports/notifications) must assemble from scattered tables (instances → steps → definitions → snapshots + audit log)",
      "Current approver identity requires querying workflow_step_instances.assignedToPersonId + persons.fullNameEn — not exposed via ARIA's getWorkflowSummary(), so ARIA cannot answer 'Who is approving my request?' without a new query",
      "Escalation history is buried in workflow_audit_log.eventData (JSONB) with action='SLA_ESCALATED' — no structured view; ARIA must parse JSON to surface 'escalated to X at Y time'",
      "No pre-computed 'age' or 'days_pending' field on workflow_instances_v2 — both ARIA and approval UI calculate this from startedAt in application code; no single source of truth for 'order by oldest pending'",
      "ARIA's handleWorkflowQuery() returns summary counts + top 5 items but lacks: current approver name, next step, pending duration, escalation status, previous rejections — approvers calling ARIA must still navigate to detail page to action",
      "Approval history (who approved/rejected at what step, notes, audit trail) requires multiple LEFT JOINs across workflow_step_instances + workflow_audit_log — not exposed to ARIA's workflow-queries module",
      "No workflow_intelligence_view (materialized or logical) to surface: instance_id, status, current_approver_name, next_step_name, current_step_order, total_steps, age_hours, sla_hours_remaining, is_breached, escalation_count, previous_decisions (JSON array) — forces each consumer (ARIA, dashboard, notification) to build ad-hoc queries",
      "ARIA's WORKFLOW_QUERY intent handler has no parameters — always returns admin/manager-scoped summary; cannot drill into specific request 'Show me the status of my leave request from June 15' without a separate intent (LEAVE_REQUEST_STATUS exists but only for draft/unsubmitted state)",
      "Notification engine (workflow_notification_queue, notification_log) has no intelligent tie-in to ARIA — cannot ask ARIA for escalation reasoning or context before sending SLA reminder"
    ],
    "risks": [
      {
        "risk": "Scattered query logic across modules (aria/approval-queries, aria/workflow-queries, workflow/queries, approval UI) creates maintenance burden — changes to workflow status calculation must be synced in multiple places, risking inconsistency (e.g., 'is breached' calculated differently in ARIA vs dashboard)",
        "severity": "MEDIUM",
        "mitigation": "Create workflow_intelligence_view with read-only materialized/logical view that all consumers (ARIA, dashboards, reports, notifications) call exclusively. Define SLA breach logic once in SQL (current_time > sla_deadline AND status NOT IN ('APPROVED','REJECTED','CANCELLED')) and expose via single stored function or view."
      },
      {
        "risk": "ARIA recommendation generation (leave-recommendation.ts) queries separate tables (absenceEntries, workerAssignments, departments, absenceBalances, workflow_instances_v2) without transactional consistency — between the recommendation query and write, an SLA deadline or approver change could occur, invalidating the recommendation context. No versioning of context snapshot.",
        "severity": "MEDIUM",
        "mitigation": "Before calling Claude, capture contextSnapshot from workflow_instances_v2 (already exists); include in the ARIA recommendation JSONB with timestamp. Document that recommendation is advice based on 'context at generation time' and may be stale if workflow mutates (e.g., escalation adds new approvers). Optionally add a 'context_validity' duration (e.g., 'valid for 1 hour') to the recommendation schema."
      },
      {
        "risk": "ARIA's handleWorkflowQuery() returns summary + top 5 items for admins/managers but provides no drill-down capability — user must leave ARIA, navigate to approvals page, find the item manually. If there are >5 pending items, ARIA cannot surface the one the user is asking about ('Is my transfer pending?'). No entity extraction for specific person or request.",
        "severity": "MEDIUM",
        "mitigation": "Extend WORKFLOW_QUERY intent to extract optional entity (person name, request type, date range). Call a new query function that filters workflow instances by initiator, type, date, then surface 3–5 matching items with approver + next step + age. E.g., 'Show me John Doe's pending approvals' → returns all his requests + current owner + status."
      },
      {
        "risk": "Approval history (who approved/rejected at each step, decision notes, timestamps) is stored in workflow_audit_log but not exposed to ARIA or notification engine — escalations and rejections cannot be surfaced in context, forcing users to navigate to audit tab manually or making escalation emails generic.",
        "severity": "MEDIUM",
        "mitigation": "Add a helper function (workflow_approval_history_view or stored procedure) that joins workflow_step_instances + workflow_audit_log + persons to produce a cleaned approval chain: step_order, approver_name, status, decision, notes, decided_at. Expose via a new ARIA query function (getApprovalHistoryForInstance) and reuse in notifications/dashboards."
      },
      {
        "risk": "workflow_instances_v2.resolvedSteps and hierarchySnapshot are encrypted JSONB snapshots captured at submission time — if the org chart changes after submission (person leaves, role changes), the approver chain is stale but ARIA and notifications may still reference the old snapshot. No mechanism to flag 'approval chain invalid, please recall'.",
        "severity": "LOW",
        "mitigation": "Document that resolvedSteps is immutable and represents org state at submission. If recall is needed (e.g., approver departed), use workflow_instances_v2.recalledAt/recalledBy/recallReason fields. ARIA should note in workflow summaries if a step has no valid assignee (person deleted, group dissolved)."
      },
      {
        "risk": "ARIA recommendation for leave (APPROVE/REJECT/REVIEW) is advisory, but there is no guardrail preventing an approver from ignoring it and rejecting APPROVE requests with no comment — no audit tie-in to show 'approver rejected despite ARIA recommendation'.",
        "severity": "LOW",
        "mitigation": "In workflow_step_instances, capture the aria_recommendation_code when the step is assigned (new optional column). In notification_log, log the ARIA recommendation alongside the approval decision. Dashboards/reports can then surface 'rate of approval override' as a compliance metric."
      }
    ],
    "recommendations": [
      "**Create workflow_intelligence_view** (materialized or logical view in PostgreSQL, exposed via a single server action) with these columns: `instance_id, workflow_code, workflow_name_en, status, resource_type, resource_id, initiator_name, initiator_person_id, current_step_order, current_step_name, current_approver_name, current_approver_person_id, next_step_name, next_approver_name, started_at, age_hours, sla_deadline, sla_hours_remaining, is_sla_breached, escalation_count, escalated_at, previous_decisions (JSON array with step, approver, decision, notes), completion_rate_pct`. Query this view in approval-queries.ts (rename to `getWorkflowIntelligence(instanceId)` or similar) and use it as the single source of truth for ARIA, dashboards, reports, and notifications.",
      "**Expose workflow status via new ARIA intent**: Add `WORKFLOW_REQUEST_STATUS` intent (distinct from `WORKFLOW_QUERY` summary). Extract entities: person_name (optional), leave_type (optional), date_range (optional). Handler calls workflow_intelligence_view filtered by initiator + resource_type + date. Return 'Your [type] request from [dates] is [status]: currently with [approver_name], step [X of Y], no SLA risk' or 'escalated to [name] at [time], decision expected [deadline]'. Gated to EMPLOYEE role for self + MANAGER role for direct reports.",
      "**Unify SLA/age calculation**: Move 'days_open', 'is_breached', 'hours_until_deadline' logic to SQL (computed columns or a stored function) rather than application code. Update workflow_instances_v2 with optional denormalized columns (current_approver_person_id, current_step_order, age_hours) or use a view. Ensures approvals page, ARIA, dashboards, and notifications all report the same 'days pending' and 'SLA breach' status.",
      "**Add approval_chain table or expose via view**: Create a queryable approval history view (step_order, approver_name, status, decision, decision_note, decided_at) by joining workflow_step_instances + workflow_audit_log + persons. Expose via `getApprovalHistoryForInstance(instanceId)`. Use in: (a) AriaRecommendationCard to show 'previous step rejected with reason' below the recommendation; (b) notification emails to include 'so far approved by [X], waiting on [Y]'; (c) ARIA intent handler for drill-down queries like 'Who approved my request?' or 'Why was I rejected?'.",
      "**Persist ARIA context snapshot in recommendation**: In leave-recommendation.ts, capture the context data (balance, coverage, compliance flags, approver chain) alongside the recommendation JSON. Add a `context_snapshot` field to AriaLeaveRecommendation type. Document that the recommendation is 'valid as of [generation_time]' and may diverge from live state if workflow escalates or SLA changes. Use in audit reports to answer 'What factors led ARIA to recommend APPROVE?'.",
      "**Enrich ARIA's handleWorkflowQuery()**: Instead of returning 5 pending items unsorted, filter by role scope, sort by SLA urgency (breached first, then hours_remaining ASC), and include current approver name + next step. Return schema: [{ instance_id, initiator, type, age_days, current_approver, next_step, sla_status, recommendation_if_leave }]. Allows ARIA to say 'You have 3 pending approvals: (1) John's leave is with you now [ARIA: Approve], (2) Transfer request awaiting Finance [3 days left], (3) Overtime overdue by 1 day'.",
      "**Add escalation reasoning to notifications**: When sla_breach_action='ESCALATE' fires, capture the previous approver, escalation reason (timeout, delegate failed, etc.), and previous decision attempts. Store in workflow_audit_log.event_data. Use this context in escalation emails sent by notification engine: 'Your approval was escalated because [previous_approver] did not act by [deadline]. Please review and respond.'.",
      "**Extend AriaRecommendationCard with approval history**: Below the recommendation, show a collapsible 'Approval chain so far' section (from approval_chain view) with: Submitted by [name] on [date] → Pending [approver] since [date] ([age]). If any previous rejections exist, show: 'Previously rejected by [approver] on [date]: [reason]'. Gives context for why ARIA recommendation is fresh (or stale if re-submitted).",
      "**Document ARIA recommendation SLA**: Clarify in system documentation whether the ARIA recommendation delay (between submission and recommendation generation) counts against the workflow SLA. If the outbox poller runs every N minutes, that becomes latency before the approver sees the card. Consider: (a) Calculate SLA deadline *after* recommendation is ready, or (b) Cap recommendation generation time in system configuration.",
      "**Separate read-only workflow_intelligence module**: Create `modules/workflow-intelligence/` with a single query function `getWorkflowIntelligence(instanceId): WorkflowIntelligence`. Import it via barrel in modules/aria/index.ts, modules/dashboard/index.ts, modules/notification/index.ts. Ensures consistency and makes it clear this is the canonical source for workflow status across the app."
    ]
  },
  {
    "subsystem": "Workflow UI & Persona Experiences",
    "currentState": "## Current State by Persona\n\n### 1. HR Admin / Manager Approval Experience\n**Route:** `/approvals` (pages.tsx), `/approvals/[instanceId]/page.tsx`\n**Navigation Access:** \n- config/workspace-nav.ts: Workspace 1 (Overview) — \"Approvals\" item with ClipboardCheck icon\n- config/admin-nav.ts: Workflows group — \"Approvals\" item  \n- EmployeeSidebar.tsx (line 13): '/approvals' link available to MANAGER, EMPLOYEE, HR_ADMIN roles\n\n**Current Rendering (HR Admin Detail Page):**\n- **Left Column:** Request summary (if absence_entries, shows leave dates, balance, notes, attachment status), Approval Chain card\n  - Approval Chain displays steps as vertical cards with numbered dots, status badges (WAITING/PENDING/APPROVED/REJECTED/DELEGATED/ESCALATED/SKIPPED/AUTO_APPROVED), assignee names, decided-at timestamps, and collapsible decision notes\n  - (Line 195-285: detail.steps.map() renders inline without component extraction)\n  - No formal timeline structure — just sequential divs with borders/spacing\n\n- **Right Column (Sticky, 300px):** \"Audit trail\" card (lines 358-393)\n  - Displays detail.auditEvents as vertical list with no timeline structure\n  - Each event shows: friendlyAuditLabel() (using lib/workflow-audit-labels.ts), actor name, timestamp (GST formatted)\n  - Current implementation: simple divs with padding/borders, no visual indicators or grouping\n  - Maps over rows with padding, fontSize 11.5/10/10, no icons/visual hierarchy\n\n- **Action Panel:** WorkflowActionForm (action-form.tsx)\n  - Textarea for comment, optional \"Delegate to another person\" expandable section\n  - Three buttons: Approve (green), Reject (red), Delegate (neutral with GitBranch icon)\n  - Client-side form with useTransition hook\n\n**Pending Approvals Table (`/approvals`, line 186-223):**\n- Tab-based UI (Pending / My Decisions)\n- Columns: Workflow, Request, Requester, Step, SLA, [Review button]\n- SLA badge component (SlaBadge, lines 27-55): conditional warning/breached styling, \"< 1h\" / \"Xh\" / \"Xd\" format\n- Rows highlight with red tint if isBreached\n- Uses workspace-nav.ts for \"/approvals\" active state matching\n\n### 2. Employee \"My Requests\" Experience\n**Route:** `/me/requests/page.tsx` (list), `/me/requests/[requestId]/page.tsx` (detail)\n**Navigation Access:** \n- EmployeeSidebar.tsx (line 12): '/approvals' link shown to all roles\n- `/me/requests` is NOT in the sidebar — must navigate via workflow system or deep link\n\n**My Requests List (`/me/requests/page.tsx`, lines 34-154):**\n- Grid layout: 6 columns [Workflow | Resource Type | Status | Submitted | SLA | Step]\n- Status pills using STATUS_STYLE map (PENDING/IN_PROGRESS/APPROVED/REJECTED/CANCELLED)\n- SLA deadline shown as date; red if overdue\n- Link to `/me/requests/[requestId]` for each row\n\n**My Request Detail (`/me/requests/[requestId]/page.tsx`):**\n- **Header:** Workflow title, status pill, submitted date, SLA deadline notice\n- **Approval Timeline Section (lines 112-232):** Formal timeline component\n  - Vertical layout with dots + connecting lines\n  - Each step shows: dot (colored by status), line to next step, step label, status badge, assignee name, decidedAt timestamp\n  - Status-driven styling: isDone (green), isActive (amber), isWaiting (grey)\n  - Rendered inline without component extraction (no reusable timeline component)\n  - Supports step status: APPROVED, REJECTED, SKIPPED, DELEGATED, WAITING, PENDING\n  - Icons: CheckCircle2 (approved), XCircle (rejected), pulsing dot (active)\n\n- **Terminal State Banner:** Shows final status with appropriate bg/border colors\n\n**Current Observation:** Employee has a visual timeline; HR Admin has an \"Approval chain\" card layout + separate audit trail. Both render steps but with different visual treatments.\n\n## Manager-Specific Experience\n**Route:** `/approvals` (same as HR Admin)\n**Role:** MANAGER in requireRole() checks, gets AdminSidebar (admin-nav.ts) instead of WorkspaceSecondaryNav\n**Unique Constraint:** Sees only approvals assigned to them; see getPendingApprovalsV2() which filters by session.user.personId\n\n---\n\n## Key Files & Functions\n\n| File | Purpose | Key Exports |\n|------|---------|------------|\n| app/(hr-admin)/approvals/page.tsx | Pending & history table view | TabBar, SlaBadge, DecisionPill, resourceLabel(), statusLabel() |\n| app/(hr-admin)/approvals/[instanceId]/page.tsx | Approval detail + action | StatusPill, request summary, approval chain, audit trail, WorkflowActionForm |\n| app/(hr-admin)/approvals/[instanceId]/action-form.tsx | Approve/Reject/Delegate form | WorkflowActionForm (client component) |\n| app/(employee)/me/requests/page.tsx | Employee request list | STATUS_STYLE pills, grid layout |\n| app/(employee)/me/requests/[requestId]/page.tsx | Employee request detail | Vertical timeline with dots/lines, status-driven styling |\n| modules/workflow/queries.ts | Data fetching | getPendingApprovalsV2(), getWorkflowInstanceDetailV2(), getMyWorkflowRequests() |\n| lib/workflow-audit-labels.ts | Audit event labels | friendlyAuditLabel(), AUDIT_LABELS map |\n| config/workspace-nav.ts | HR Admin nav (11 workspaces) | WORKSPACE_NAV, Approvals in Overview workspace |\n| config/admin-nav.ts | Manager nav (7 groups) | ADMIN_NAV, Approvals in Workflows group |\n| components/employee/EmployeeSidebar.tsx | Employee sidebar nav | NAV_ITEMS array with 11 links (excluding /me/requests) |\n| drizzle/schema/workflow-engine.ts | Database schema | workflowInstancesV2, workflowStepInstances, workflowAuditLog tables |\n\n---\n\n## Data Structures\n\n### PendingApprovalV2 (queries.ts, lines 23–40)\n```\nstepInstanceId, instanceId, workflowCode, workflowNameEn, resourceType, resourceId,\ninitiatorName, initiatorPersonId, stepOrder, stepName, slaDeadline, isBreached,\nhoursUntilBreach, startedAt, isFyiOnly, canDelegate\n```\n\n### WorkflowInstanceDetailV2 (queries.ts, lines 42–75)\n```\ninstanceId, workflowCode, workflowNameEn, status, resourceType, resourceId,\nlegalEntityId, initiatorName, initiatedByPersonId, startedAt, completedAt,\nslaDeadline, steps[], auditEvents[]\n```\n\n### Step Detail (nested in above)\n```\nstepInstanceId, stepOrder, stepName, status (WAITING/PENDING/APPROVED/REJECTED/DELEGATED/ESCALATED/SKIPPED/AUTO_APPROVED),\nassigneeName, assigneePersonId, decision (APPROVE/REJECT/DELEGATE), decisionNote, decidedAt,\nslaDeadline, isFyiOnly, canDelegate\n```\n\n### Audit Event\n```\naction (SUBMITTED, TOKEN_ISSUED, STEP_APPROVED, STEP_REJECTED, STEP_DELEGATED, STEP_ACTIVATED,\n  INSTANCE_APPROVED, INSTANCE_REJECTED, INSTANCE_COMPLETED, SLA_ESCALATED, REMINDER_SENT,\n  AUTO_APPROVED, RECALLED),\nactorName, loggedAt, eventData (JSON, nullable)\n```\n\n---\n\n## Navigation & State Management\n\n### Approvals Accessibility Matrix\n\n| Route | HR_ADMIN | HR_DIRECTOR | MANAGER | EMPLOYEE | SUPER_ADMIN |\n|-------|----------|-------------|---------|----------|------------|\n| /approvals | ✓ (shows pending) | ✓ (shows pending) | ✓ (shows pending) | ✓ (their own pending) | ✓ (shows all) |\n| /approvals/[id] | ✓ | ✓ | ✓ (if assigned) | ✓ (if initiated) | ✓ |\n| /me/requests | ✓ (not in sidebar) | ✓ (not in sidebar) | ✓ (not in sidebar) | ✓ (not in sidebar) | ✓ (not in sidebar) |\n| /me/requests/[id] | ✓ | ✓ | ✓ | ✓ (if initiated) | ✓ |\n\n**Note:** `/me/requests` page exists but is missing from EmployeeSidebar NAV_ITEMS (line 9-21). Users must deep-link or discover via workflow detail navigation.\n\n---\n\n## Timeline Rendering — Current Duplication\n\n### HR Admin Approval Detail (`/approvals/[instanceId]/page.tsx`)\n1. **\"Approval chain\" card (lines 185–285):**\n   - Displays workflow_step_instances as vertical sequence\n   - Shows: numbered circles, step name, status badge, assignee, timestamp, optional decision note\n   - **Inlined code:** No component extraction; logic is in JSX\n   - Renders `detail.steps` (from getWorkflowInstanceDetailV2().steps)\n\n2. **\"Audit trail\" card (lines 358–393):**\n   - Right sidebar, sticky, max-height 480px with scroll\n   - Displays workflow_audit_log events in reverse chronological order\n   - Shows: friendly action label, actor name, timestamp\n   - **Inlined code:** Simple divs mapping detail.auditEvents\n   - Renders `detail.auditEvents` (from audit log)\n\n**Key Observation:** \"Approval chain\" shows step instances (workflow_step_instances); \"Audit trail\" shows audit events (workflow_audit_log). Both vertical, both chronological, but separate concerns and separate rendering.\n\n### Employee Request Detail (`/me/requests/[requestId]/page.tsx`)\n1. **\"Approval Timeline\" card (lines 112–232):**\n   - Vertical timeline with visual dots + connecting lines\n   - Status-driven colors (green/amber/grey)\n   - Shows: step order, name, status, assignee, decided timestamp\n   - **Inlined code:** Steps mapped with nested flex layouts\n   - Renders `instance.steps` (same data structure as HR Admin)\n\n**Duplication Risk:** Two different UIs for the same underlying step-instance data. Employee timeline is more visual (dots/lines); HR Admin approval chain is more tabular. If step rendering logic needs to change (e.g., new status type, display rule), both must be updated.\n\n---\n\n## Workflow Initiation & Resource Linking\n\n**From absence_entries (leave request workflow):**\n- resourceType = 'absence_entries', resourceId = absenceEntries.id\n- Workflow fetches leave summary via getLeaveRequestSummaryForInstance() (aria module)\n- Displays in request summary card on approval detail page\n\n**From other resources (hiring_requests, salary_revision, worker_assignment, etc.):**\n- resourceType varies; no specialized detail card shown on approval page currently\n- Only generic request summary (workflow name, requester, dates, SLA)\n\n---\n\n## Gaps & Inconsistencies\n\n1. **No Universal Timeline Component:** Approval chain, audit trail, and employee timeline are all inlined JSX with duplicated styling logic.\n\n2. **Employee Requests Not Discoverable:** `/me/requests` page exists but missing from EmployeeSidebar NAV_ITEMS. No \"My Requests\" menu item visible to employees.\n\n3. **Separate Approval Chain & Audit Trail:** HR Admin approval detail shows steps AND audit events but in two separate cards with different data structures. No unified view of \"what happened and when.\"\n\n4. **Manager vs. HR Admin Nav Inconsistency:** \n   - HR Admin uses workspace-nav.ts (11 workspaces, secondary nav)\n   - Manager uses admin-nav.ts (7 groups, collapsible sidebar)\n   - Both claim ownership of Approvals; same routes serve both roles\n\n5. **Missing Audit on Employee Request Detail:** Employee request detail page shows step timeline but does NOT display audit trail. Asymmetric UX vs. HR Admin.\n\n6. **SLA Rendering Scattered:** SlaBadge component used in approvals table; SLA deadline shown as plain text on employee request detail. Inconsistent handling.\n\n7. **Resource-Specific Detail Missing:** Only leave requests show detailed request summary (dates, balance, attachment). Other resource types (hiring_requests, salary_revision) shown as generic type labels.\n\n8. **Status Label Inconsistency:** Different status pills (HR: WAITING/PENDING/APPROVED/REJECTED/DELEGATED/ESCALATED/SKIPPED/AUTO_APPROVED vs. Employee: PENDING/IN_PROGRESS/APPROVED/REJECTED/CANCELLED). Enum mismatch.\n\n9. **No Reusable Step Status Icon:** CheckCircle2/XCircle icons hardcoded in employee timeline; status pill logic duplicated across pages.\n\n10. **Locale Handling:** Approval detail uses getLocale() and friendlyAuditLabel(lang); employee request detail does NOT load/use locale for audit labels. Asymmetric i18n.",
    "keyFiles": [
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/page.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/[instanceId]/page.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(hr-admin)/approvals/[instanceId]/action-form.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(employee)/me/requests/page.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/app/(employee)/me/requests/[requestId]/page.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/modules/workflow/queries.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/lib/workflow-audit-labels.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/config/workspace-nav.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/config/admin-nav.ts",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/components/employee/EmployeeSidebar.tsx",
      "/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/drizzle/schema/workflow-engine.ts"
    ],
    "strengths": [
      "Dual-track approval model supports both manager self-service and HR admin oversight without role confusion",
      "Audit trail immutable (INSERT-only, indexed by instance + timestamp) provides compliance-grade event logging",
      "SLA deadline and breach detection computed at query time; no stale calculations in long-lived sessions",
      "Step status enum (WAITING/PENDING/APPROVED/REJECTED/...) covers rich approval states including delegation, escalation, skipping",
      "friendlyAuditLabel() abstraction prevents raw ENUM tokens from reaching users; fallback to title-case ensures graceful unknown-action handling",
      "Employee request detail timeline visual design (dots + lines) is intuitive and supports rich status encoding (color, icon, pulse animation)",
      "Drizzle schema relationships (instanceId FK, stepId FK, personId FK) enable atomic cascade deletes and referential integrity",
      "Approval chain rendering includes decision notes as collapsible context; not forced into main view",
      "SlaBadge component is reusable across tables; SLA hours/days formatting is DRY",
      "getWorkflowInstanceDetailV2() and getMyWorkflowRequests() separate concerns: admin detail vs. employee list"
    ],
    "gaps": [
      "No Universal Workflow Timeline component — approval chain, audit trail, and employee timeline are independent inlined JSX blocks with duplicated styling (padding, fontSize, borderBottom, status colors)",
      "Employee request list is implemented but missing from EmployeeSidebar NAV_ITEMS; users cannot discover /me/requests from UI",
      "Approval chain (steps) and audit trail (events) rendered in separate cards on HR admin detail; no unified chronological view combining both",
      "Employee request detail shows step timeline but NOT audit trail; HR admin sees both — asymmetric UX",
      "Status enum inconsistency: HR audit labels reference STEP_APPROVED/REJECTED, but step.status uses APPROVED/REJECTED; employee timeline expects PENDING/IN_PROGRESS/APPROVED/REJECTED/CANCELLED (different set)",
      "SLA display scattered: SlaBadge in approvals table (colored, with hours/days), plain text on employee request detail (uncolored date)",
      "Resource-specific detail cards (leave summary) implemented for absence_entries only; other resource types (hiring_requests, salary_revision, worker_assignment, transfer_requests) have no specialized detail panels",
      "No reusable StepStatusBadge or StatusIcon component; status colors and icons hardcoded in three places (approvals table, approval chain card, employee timeline)",
      "Locale (i18n) handled in approval detail page (getLocale() + friendlyAuditLabel(lang)) but not in employee request detail or approvals table",
      "Navigation duplication: /approvals route is listed in workspace-nav.ts (Approvals in Overview workspace) AND admin-nav.ts (Approvals in Workflows group), but the UX differs by role and nav system without explicit routing guards"
    ],
    "risks": [
      {
        "risk": "Timeline component proliferation — if step rendering logic changes (e.g., new status type, delegation UI, assignee fallback), must update three code locations (HR approval chain, HR audit trail, employee timeline) in parallel to avoid inconsistency",
        "severity": "MEDIUM",
        "mitigation": "Extract WorkflowTimelineStep component accepting { step, status, assignee, decidedAt, decisionNote, isFyiOnly } props; reuse in both HR detail and employee detail pages. Extract AuditEventRow component for audit trail. Use Storybook or visual regression tests to lock in approval chain styling."
      },
      {
        "risk": "Employee /me/requests page exists but is unreachable from sidebar, leading to support confusion and incomplete feature discovery",
        "severity": "LOW",
        "mitigation": "Add 'My Requests' link to EmployeeSidebar NAV_ITEMS between 'My Leave' and 'Approvals'. Test that href matches EmployeeSidebar.isActive() matching logic (currently checks exact href + startswith)."
      },
      {
        "risk": "Status enum mismatch (step.status vs. audit action labels) creates maintenance burden: new status types must be added to stepStatusEnum in schema, enum in queries.ts type, status pill maps in THREE page files, and audit label map",
        "severity": "MEDIUM",
        "mitigation": "Create single source-of-truth enum file (e.g., lib/workflow-status.ts) exporting status values, status-to-color map, status-to-icon map, status-to-label map. Import in all pages instead of redefining."
      },
      {
        "risk": "Audit trail on HR detail page shows raw action enums transformed by friendlyAuditLabel(), but employee request detail does NOT call friendlyAuditLabel(); if audit trail is added to employee detail, label consistency is lost",
        "severity": "LOW",
        "mitigation": "Ensure any new timeline component passes lang prop and calls friendlyAuditLabel(action, lang) consistently. Add unit tests for friendlyAuditLabel() fallback behavior."
      },
      {
        "risk": "SLA deadline breach detection is computed at query time (getPendingApprovalsV2: isBreached = now > deadline); long-lived approvals table may show stale SLA status if page is open for hours",
        "severity": "LOW",
        "mitigation": "Client-side refresh: add useEffect in SlaBadge or table component to recompute hoursLeft/isBreached every 5 minutes. Or, server-sent events to push SLA changes from backend."
      },
      {
        "risk": "If a step has multiple statuses (REJECTED, APPROVED, DELEGATED simultaneously), current schema allows but rendering assumes single status per step; logic for 'isDone' may miscalculate",
        "severity": "HIGH",
        "mitigation": "Clarify workflow engine: can a step have multiple decisions? If so, store decision history separately (decision_history JSONB array). If not, add DB constraint UNIQUE(instance_id, step_order, status) after confirming immutability."
      },
      {
        "risk": "Employee request detail checks ownership with instance.initiatedByPersonId === user.personId, but managers can also view employee requests. If manager permission check is removed or changed, unauthorized access may occur",
        "severity": "MEDIUM",
        "mitigation": "Add role check in /me/requests/[requestId]/page.tsx after ownership check: also allow if ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role). Add audit log entry when non-owner views request."
      },
      {
        "risk": "Approval chain and audit trail both fetch from same instance (getWorkflowInstanceDetailV2), but if instance is not found, the page 404s before audit trail is requested; no way to view audit log for deleted instance",
        "severity": "LOW",
        "mitigation": "Create separate getWorkflowAuditLog(instanceId) query that works even if instance is soft-deleted or archived. Useful for forensics / compliance review."
      }
    ],
    "recommendations": [
      "Extract WorkflowTimelineStep and WorkflowTimelineContainer components in components/workflow/ to eliminate inline timeline rendering in three places; accept { steps, status, format, isEditable } props",
      "Add /me/requests entry to EmployeeSidebar NAV_ITEMS after 'My Leave' (line 12), using { href: '/me/requests', labelEn: 'My Requests', labelAr: '...', Icon: ClipboardCheck }",
      "Create lib/workflow-status.ts exporting statusPillMap, statusIconMap, statusColorMap as single source of truth; import in all pages instead of redefining STATUS_STYLE constants",
      "Add audit trail display to employee request detail page (mirror HR admin pattern) using same AuditEventRow component; wrap in conditional feature flag if audit visibility is not yet released for employees",
      "Move SLA display logic into reusable SlaDeadlineDisplay component accepting { deadline, now } and returning formatted badge; use consistently across tables and detail pages",
      "Extract resource-detail factory pattern (currently only absence_entries has leave summary): create getResourceDetailPanel(resourceType, resourceId) that returns Promise<ReactNode | null>, allowing incremental addition of hiring_requests, salary_revision detail cards",
      "Create WorkflowStatusBadge component accepting { status, isFyiOnly } and returning properly colored pill; replace hardcoded status pill logic in DecisionPill, StatusPill, and employee timeline status badges",
      "Add locale prop to employee request detail page; pass lang to any timeline or audit components for consistent friendlyAuditLabel() output",
      "Implement useWorkflowSlaRefresh hook to recompute SLA breach status every 5 minutes in SlaBadge and approvals table, preventing stale status display in long-lived sessions",
      "Add step history view (optional accordion on approval chain) showing when step status changed and by whom; fetch from workflow_audit_log events filtered by action LIKE 'STEP_%'",
      "Create WorkflowTimelineTestStories.stories.tsx covering all status enums (WAITING, PENDING, APPROVED, REJECTED, DELEGATED, ESCALATED, SKIPPED, AUTO_APPROVED) to lock in rendering and catch regressions",
      "Add manager-specific view: /approvals?manager=true to show only team member requests (escalated from direct reports) vs. all pending (current behavior)"
    ]
  }
]

================================================================================
FILE [P2-01]: docs/architecture/workflow-intelligence-platform-blueprint.md
LINES: 296
================================================================================
I'll produce the complete architecture blueprint document.

# Workflow Intelligence Platform — Architecture Blueprint

> AVANIIS HCM · Enterprise Architecture · 2026-06-02
> Canonical engine: **Workflow Engine v2** (`lib/workflow-engine.ts`). This blueprint extends — never forks — the existing engine.

---

## 1. Executive Summary & Objective

AVANIIS HCM already runs a capable, transaction-safe Workflow Engine v2 with immutable snapshots, hybrid hierarchy resolution, calendar-aware SLA, JWT one-click approval, and an INSERT-only audit ledger. It works. What it lacks is a **coherent intelligence and experience layer on top of it**: workflow state is duplicated across resource tables, leave logic is hardcoded into the engine, RBAC has no org-wide oversight surface and no row-level authorization on instance detail, the email outbox is queued but never dispatched, ARIA reads scattered tables, and four UIs render the same step data four different ways.

**Objective:** Build a **Workflow Intelligence Platform** that makes the v2 engine the single source of truth for all workflow state, exposes one canonical read model (`workflow_intelligence_view`) consumed by every surface (ARIA, dashboards, notifications, UI), unifies all timeline rendering into one component, closes the RBAC oversight and authorization gaps, ships the email dispatch worker, and generalizes resource handling via a **workflow-type registry** so no future workflow type requires engine edits.

**Non-goals / hard constraints:**
- Do **not** build a parallel engine. v2 stays canonical.
- Single source of truth: workflow state lives in `workflow_instances_v2` only; resource tables stop holding authoritative status.
- Zero hardcoded leave logic in the generic path. Leave becomes one registered workflow type among many.
- Every phase is independently deployable, backward-compatible, and rollback-safe.

**Success themes:** consistency (one read model, one timeline), security (row-level auth + immutable audit), completeness (email delivery), and extensibility (registry-driven types).

---

## 2. Current-State Analysis (per subsystem)

### 2.1 Engine & Canonical State (`lib/workflow-engine.ts`, `drizzle/schema/workflow-engine.ts`)
**Strengths:** Immutable JSONB snapshots (`hierarchySnapshot`, `contextSnapshot`, `resolvedSteps`) decouple chain resolution from later config drift; caller-supplied transaction support (COLLISION-003/PROBATION fixes); atomic claim guard (`UPDATE ... WHERE status='PENDING' RETURNING`); calendar-aware per-step SLA; INSERT-only `workflow_audit_log` dual-indexed by instance and actor.
**Gaps:** `dispatchResourceCompletion` is a hardcoded `switch` over 4 resource types — adding a 5th needs an engine merge. Leave notification text is inline; hiring/transfer have their own inline text; no shared template. Resource tables (`absenceEntries.status`, `approvedBy`, `rejectionReason`, mirrored on `hiringRequests`/`transferRequests`) **duplicate** instance state with no FK and no reconciliation — a crash between writes diverges them. Group voting (`votingMethod`, `minApprovals`) and dynamic group membership are defined but unimplemented. No parallel steps, no recall/on-hold paths, no generic recommendation model.

### 2.2 RBAC & Approval Query Boundaries (`lib/auth.ts`, `middleware.ts`, `modules/workflow/queries.ts`)
**Strengths:** 7 clean roles in JWT; MFA step-up for `HIGH_PRIVILEGE_ROLES`; middleware path gating; correctly scoped `getPendingApprovalsV2` (by `assignedToPersonId`) and `getMyWorkflowRequests` (by initiator).
**Gaps — two CRITICAL:** (1) **No org-wide Workflow Operations view** — HR_ADMIN sees only steps assigned to them, cannot see all pending/breached/bottlenecked workflows. (2) **`getWorkflowInstanceDetailV2` has no row-level security** — any authenticated user with an instanceId reads any workflow's full history (CWE-639, enumerable). The `feature_permissions` table is seeded for 3 of 7 roles and **consulted by nothing at runtime** (orphaned). Delegation rules exist but `getPendingApprovalsV2` ignores them. `admin-nav.ts` leaks Feature Permissions to MANAGER (middleware blocks it — inconsistency). Audit log lacks an immutability trigger.

### 2.3 Notifications (`drizzle/schema/transactions.ts` → `notification_log`; `workflow-engine.ts` → `workflowNotificationQueue`)
**Strengths:** Clean split between IN_APP state (`notification_log`) and EMAIL delivery (`workflowNotificationQueue`), both keyed by instance+step; bilingual; JWT token model.
**Gaps — one HIGH:** **The email outbox is queued but never dispatched.** `process-driver.ts` polls the events table only; no email worker exists (flagged "Phase 2"). Every approver beyond the bell receives nothing. JWT token expiry equals SLA deadline (link dies on time). Bell preview lacks chain context and ARIA recommendation; leave-detail rendering is duplicated between bell and detail page.

### 2.4 ARIA Workflow Integration (`modules/aria/leave-recommendation.ts`, `approval-queries.ts`, `workflow-queries.ts`)
**Strengths:** Recommendation generation is fully decoupled via outbox polling, non-fatal, advisory-only; persisted as versioned JSONB; bilingual card.
**Gaps:** Recommendation lives only in `absenceEntries.aria_recommendation_json` — unreachable for any non-leave type. No single query returns status + current owner + next approver + age + SLA + escalation in one call; each consumer assembles ad-hoc, so "is breached" is computed differently in ARIA vs dashboard. `handleWorkflowQuery` returns unparameterized admin summaries — cannot answer "where is *my* transfer?"

### 2.5 UI & Personas (`approvals/`, `me/requests/`)
**Strengths:** Dual-track (manager self-service + HR oversight); immutable audit display; query-time SLA computation; rich step status enum.
**Gaps:** **No universal timeline** — HR approval-chain card, HR audit-trail card, and employee timeline are three inlined JSX blocks with duplicated styling and **mismatched status enums**. `/me/requests` exists but is **absent from the employee sidebar** (undiscoverable). Employee detail shows no audit trail (asymmetric). SLA rendering and status pills are duplicated in 3+ files. Only `absence_entries` has a resource-detail card.

---

## 3. Target-State Architecture

### 3.1 Canonical Model

Five logical entities, mapped onto existing v2 tables plus three additive surfaces. **No new engine.**

| Entity | Backing store | Role |
|---|---|---|
| **WorkflowInstance** | `workflow_instances_v2` (existing) | Sole authority for status, current step, SLA, outcome, snapshots |
| **WorkflowStep** | `workflow_step_instances` (existing) | Per-step assignment, decision, SLA; denormalize `step_name_at_decision` + `aria_recommendation_code` (additive cols) |
| **WorkflowAudit** | `workflow_audit_log` (existing, INSERT-only) + DB immutability trigger | Compliance ledger |
| **WorkflowNotification** | `notification_log` (IN_APP) + `workflow_notification_queue` (EMAIL) | Delivery; add `meta_json` (ARIA snapshot) to queue |
| **WorkflowIntelligence** | `workflow_intelligence_view` (NEW logical view) + `workflow_recommendations` (NEW table) | The single read model + generic, multi-domain recommendations |

### 3.2 Service / Query / Component Boundaries

```
┌────────────────────────────────────────────────────────────────────┐
│  WRITE PATH (canonical, unchanged core)                              │
│  lib/workflow-engine.ts                                              │
│    submitWorkflow · takeWorkflowAction · activateNextStep            │
│    dispatchResourceCompletion ──► resolves via REGISTRY (not switch) │
│  modules/workflow/registry.ts  ◄── NEW: workflow-type registration   │
│    { resourceType → { applyOutcome, notificationTemplateCode,        │
│                       recommendationProvider?, detailLoader } }      │
└────────────────────────────────────────────────────────────────────┘
                              │ writes
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  CANONICAL READ MODEL                                                │
│  workflow_intelligence_view  (single source for status/SLA/owner)    │
│  workflow_recommendations    (generic, all resource types)           │
└────────────────────────────────────────────────────────────────────┘
        │                    │                    │              │
        ▼                    ▼                    ▼              ▼
┌──────────────┐  ┌────────────────────┐  ┌─────────────┐  ┌──────────┐
│ modules/     │  │ modules/aria/       │  │ modules/    │  │ UI       │
│ workflow-    │  │ workflow-           │  │ notification│  │ surfaces │
│ intelligence │  │ intelligence        │  │ (dispatch + │  │ (single  │
│ (shared      │  │ (single intel layer)│  │  preview)   │  │ Timeline)│
│  services)   │  │                     │  │             │  │          │
└──────────────┘  └────────────────────┘  └─────────────┘  └──────────┘
```

### 3.3 Workflow Lifecycle Model

```
                         submitWorkflow(resourceType, resourceId, tx?)
                                        │  (resource looked up via REGISTRY)
                                        ▼
   [PENDING] ──auto──► [IN_PROGRESS] ──all steps approved──► [APPROVED] ──► applyOutcome()
       │                    │  ▲                                            (registry handler,
       │                    │  │ activateNextStep (WAITING→PENDING)          joins caller tx)
       │                    │  │
       │                    ▼  │ any step REJECTED ────────► [REJECTED]  ──► applyOutcome()
       │            ┌───────────────┐
       │            │ STEP machine  │  WAITING→PENDING→{APPROVED|REJECTED|
       │            │               │   DELEGATED|ESCALATED|SKIPPED|AUTO_*}
       │            └───────────────┘
       │                    │ SLA breach (cron) → policy: ESCALATE|AUTO_APPROVE|
       │                    │                              AUTO_REJECT|SEND_REMINDER
       ▼                    ▼
   [CANCELLED]        [ON_HOLD] ◄──recall/pause (authorized)──► [RECALLED]
                            │                                        │
                            └───────── resume ──► [IN_PROGRESS] ◄────┘

  Every transition ──► (1) workflow_audit_log INSERT  (2) notification fan-out
  (IN_APP now, EMAIL via queue)  (3) ARIA snapshot captured at activation
```

### 3.4 Single Universal Timeline + Shared Services

- **`components/workflow/WorkflowTimeline.tsx`** — one component, used by HR approval detail, employee request detail, and the bell preview. Merges step instances and audit events into one chronological model. Driven entirely by `lib/workflow-status.ts` (single source for status → label/color/icon, bilingual). Sub-components: `WorkflowTimelineStep`, `AuditEventRow`, `WorkflowStatusBadge`, `SlaDeadlineDisplay`, `LeaveRequestSummaryCard` (and registry-driven `ResourceDetailPanel`).
- **`modules/workflow-intelligence/`** — the only module that queries `workflow_intelligence_view`. Barrel-exported and imported by ARIA, dashboard, and notification modules so SLA/age/breach logic lives in exactly one place.

---

## 4. Data-Model Changes

> **Migration mechanics:** Drizzle journal stops at **0039**; all migrations 0040–0054 are manual SQL applied via Neon SQL Editor (file count 63, highest number 0054). Every change below is **additive** and lands at the next free slot starting **0055**. No destructive ALTERs in any phase.

### Reused as-is (no change)
- `workflow_instances_v2`, `workflow_step_instances`, `workflow_definitions_v2`, `workflow_steps_v2`, `approval_groups`, `approval_group_members`, `workflow_delegation_rules`, `workflow_email_tokens`, `workflow_sla_calendars`, `workflow_audit_log`, `notification_log`, `workflow_notification_queue`.

### Extended (additive columns / objects)

| Object | Migration | Change | Why |
|---|---|---|---|
| `workflow_step_instances` | 0055 | + `step_name_at_decision varchar(160)`, + `aria_recommendation_code varchar(20)`, + `sla_hours int`, + `delegation_depth int default 0` | Immutable step naming for historic chains; capture ARIA recommendation present at assignment for override-rate metrics; per-step SLA audit; delegation cycle guard |
| `workflow_notification_queue` | 0056 | + `meta_json jsonb` | Immutable ARIA snapshot (confidence, violations, summary) at notification time |
| `workflow_audit_log` | 0057 | + `BEFORE UPDATE OR DELETE` trigger `RAISE EXCEPTION` | Tamper-proof ledger |
| `feature_permissions` | 0058 | + rows for `PAYROLL_ADMIN, FINANCE, HR_DIRECTOR, SUPER_ADMIN` (deny-by-default) | Complete the 7-role matrix before any enforcement |

### New objects

| Object | Migration | Definition (essentials) |
|---|---|---|
| `workflow_recommendations` | 0059 | `id, tenant_id, instance_id (FK), recommendation_type, recommendation_code, confidence_score, context_snapshot jsonb, model_version, metadata jsonb, created_at` — generic, replaces leave-only coupling |
| `workflow_intelligence_view` | 0060 | Logical VIEW joining instance + current/next step + initiator/approver names + audit-derived escalation count + previous decisions. SLA/age/breach computed **once** in SQL |
| `workflow_type_registry` | 0061 | `resource_type (PK), workflow_code, applies_outcome_handler varchar, notification_template_code, recommendation_provider varchar null, is_active` — DB-backed type config (engine reads, never hardcodes) |
| `notification_templates` | 0062 | `template_code (PK), resource_type, placeholders jsonb, subject_en/ar, body_en/ar` — replaces inline leave/hiring/transfer text |

### Deprecated (read-deprecated, drop only after backfill in a later Contract phase)
- `absence_entries.status`, `.approved_by`, `.approval_date`, `.rejection_reason` and the `hiring_requests.status` / `transfer_requests.status` mirrors become **derived, not authoritative**. They are **not dropped** (live FKs/UI may read them); instead `workflow_intelligence_view` exposes `resource_status` sourced from `workflow_instances_v2.status`. A reconciliation job + CHECK (deferred) flags divergence. Drop is a future migration only after every reader is migrated to the view.
- `absence_entries.aria_recommendation_json` is superseded by `workflow_recommendations`; kept readable during migration, no new writes after Phase D.

### Explicit "no duplicate state" mapping

| Concept | Authoritative source | Derived readers |
|---|---|---|
| Workflow status | `workflow_instances_v2.status` | `resource_status` in view; resource tables (legacy, reconciled) |
| Final decision / rejection reason | `workflow_instances_v2.finalDecisionBy / rejectionReason` | resource-table mirrors (legacy) |
| Current owner / next approver / age / SLA breach | computed in `workflow_intelligence_view` | ARIA, dashboard, notifications, UI |
| AI recommendation | `workflow_recommendations` | approval card, bell `meta_json`, ARIA |
| Resource business detail (dates, balance, amounts) | resource table via registry `detailLoader` | `ResourceDetailPanel` |

---

## 5. Query / Service Changes

All read services live in `modules/workflow-intelligence/` and query `workflow_intelligence_view` exclusively. Every function takes the caller's `session` and enforces scope server-side.

| Function | Signature | Responsibility / Scope |
|---|---|---|
| `getPendingApprovalsForUser` | `(session, opts?: { limit; offset; includeDelegated?: boolean }) → Promise<{ rows: PendingApproval[]; total; hasMore }>` | Pending steps where `assigned_to = personId` **OR** person ∈ active delegates (honors `workflow_delegation_rules`). Paginated. Replaces hardcoded `limit=100`. Joins `workflow_recommendations` for inline `recommendationCode`. |
| `getApprovalHistoryForUser` | `(session, opts?: { limit; offset; workflowCode?; from?; to? }) → Promise<{ rows: ApprovalHistoryRow[]; total }>` | Steps decided by user (`decided_by = personId`), filterable by type/date, paginated, sorted `decided_at DESC`. |
| `getWorkflowTimeline` | `(session, instanceId) → Promise<WorkflowTimeline | null>` | **Row-level authorized** (initiator ∨ assigned-to-any-step ∨ in chain ∨ HIGH_PRIVILEGE_ROLES). Returns merged steps + audit events for the Universal Timeline. Returns `null` → caller 403/404. Closes CWE-639. Logs `DETAIL_VIEWED` audit. |
| `getApprovalNotificationPreview` | `(session, instanceId) → Promise<NotificationPreview>` | Bell-sized projection: current step, next approver, previous decisions, ARIA `meta_json` snapshot, resource summary via registry `detailLoader`. Same auth gate as timeline. Eliminates bell/detail duplication. |
| `getWorkflowOperations` | `(session, filters: { workflowCode?; status?; slaBreached?; approverPersonId?; departmentId?; legalEntityId?; limit; offset }) → Promise<{ rows: WorkflowOpsRow[]; total; aggregates }>` | **Org-wide oversight**, gated to `HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN`. Returns all instances with current owner, step n-of-m, age, SLA status, escalation count, plus aggregates (pending/breached counts, top bottlenecks). Closes the CRITICAL oversight gap. Entity-scoped unless SUPER_ADMIN. |
| `workflow_intelligence_view` | SQL view (read by all of the above) | Columns: `instance_id, tenant_id, legal_entity_id, workflow_code, workflow_name_en/ar, status, resource_status, resource_type, resource_id, initiator_name, current_step_order, total_steps, current_step_name, current_approver_name/person_id, next_step_name/approver_name, started_at, age_hours, sla_deadline, sla_hours_remaining, is_sla_breached, escalation_count, escalated_at, previous_decisions (jsonb[])`. **Breach defined once:** `now() > sla_deadline AND status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED')`. |

ARIA-specific: `getWorkflowIntelligence(session, { instanceId? | initiatorPersonId? | resourceType? | dateRange? })` wraps the same view for the new `WORKFLOW_REQUEST_STATUS` intent (Section 8).

---

## 6. UI Changes by Persona

| Persona | Surface | Change |
|---|---|---|
| **Employee** | `/me/requests` ("My Requests") | Add to `EmployeeSidebar.NAV_ITEMS` after "My Leave" (currently undiscoverable). List driven by `getMyWorkflowRequests`; detail uses `WorkflowTimeline` (now shows audit trail — symmetric with HR). Status pills from `lib/workflow-status.ts`. |
| **Manager** | `/approvals` ("My Approvals") | Pending tab via `getPendingApprovalsForUser(includeDelegated:true)` — delegated items now appear and are labeled. Add optional `?team=true` to scope to direct-report initiators. Action panel: canonical **Approve / Reject / Delegate**. |
| **HR / Admin** | `/approvals/operations` ("Workflow Operations") — NEW | Org-wide grid from `getWorkflowOperations`: filter by type/status/SLA/department/approver; aggregate header (pending, breached, bottleneck by approver). HR_ADMIN+ only. Closes oversight gap. |
| **All (Approval Detail)** | `/approvals/[instanceId]` | Single `WorkflowTimeline` replaces the separate approval-chain + audit-trail cards. `ResourceDetailPanel` (registry-driven) replaces leave-only summary. ARIA recommendation elevated above the chain when confidence < 0.5 or violations present. Inline action form anchored at current PENDING step. **Now row-level authorized** via `getWorkflowTimeline`. |
| **All (Notification preview)** | Bell `NotificationPanel` | Uses `getApprovalNotificationPreview`: compact chain (prev/current/next), ARIA `meta_json` snapshot, shared `LeaveRequestSummaryCard`/`ResourceDetailPanel`. Inline Approve/Reject/Ask retained. Subject prefixed `[RISK]` when ARIA flags concerns. |

---

## 7. RBAC Matrix (role × surface × scope)

| Role | My Requests | My Approvals | Approval Detail | Workflow Operations | Notification Bell | Workflow Config | Feature Perms |
|---|---|---|---|---|---|---|---|
| **EMPLOYEE** | Own only | — | Own initiated (auth-gated) | — | Own | — | — |
| **MANAGER** | Own | Assigned + delegated; `?team` = direct reports | Initiator ∨ assigned ∨ in chain | — | Own | — | — |
| **PAYROLL_ADMIN** | Own | Assigned + delegated | As above | — | Own | — | — |
| **FINANCE** | Own | Assigned + delegated | As above | — | Own | — | — |
| **HR_ADMIN** (MFA) | Own | Assigned + delegated | Any (admin override) | Own legal entity | Own | Edit | View only |
| **HR_DIRECTOR** (MFA) | Own | Assigned + delegated | Any | Own legal entity | Own | Edit | View only |
| **SUPER_ADMIN** (MFA) | Own | Assigned + delegated | Any | All entities | Own | Edit | Full edit |

Enforcement: middleware path gating (coarse) → `requireRole` in each service (role) → row-level predicate inside `getWorkflowTimeline`/`getWorkflowOperations` (scope) → `feature_permissions` consulted for create/edit/delete/approve/export once seeded for all 7 roles. Fix `admin-nav.ts` to drop Feature Permissions from MANAGER (align with middleware).

---

## 8. ARIA Workflow Intelligence Design

**Principle:** ARIA reads the **same** `workflow_intelligence_view` and `workflow_recommendations` as every other surface — one intelligence layer, no private joins. Recommendation generation stays decoupled (outbox-polled, non-fatal, advisory-only) but writes to the **generic** `workflow_recommendations` table via a registry `recommendationProvider`, so hiring/transfer/probation can produce recommendations without engine changes.

**Questions the layer must answer (each maps to a view column or query):**
1. "Where is *my* request?" — `WORKFLOW_REQUEST_STATUS` intent (extracts person/type/date) → `getWorkflowIntelligence(initiatorPersonId, …)` → status, current owner, step n-of-m, SLA.
2. "Who is approving this / who is next?" — `current_approver_name`, `next_approver_name`.
3. "How long has it been pending / is it breaching SLA?" — `age_hours`, `sla_hours_remaining`, `is_sla_breached` (single definition).
4. "Why was it escalated / rejected?" — `escalation_count`, `previous_decisions[]` (step, approver, decision, note, decided_at).
5. "What should I approve first?" — enriched `getPendingApprovalsForUser` sorted breached-first, with inline `recommendationCode`.
6. "What did ARIA recommend and was it overridden?" — `workflow_recommendations` + `step_instances.aria_recommendation_code` vs actual decision (override-rate metric).
7. "Why send this escalation now?" — notification engine reads escalation context from the view, not generic text.

Context snapshot (balance, coverage, compliance flags) is persisted in `workflow_recommendations.context_snapshot` with `model_version` and `created_at`, marked "valid as of generation time" to address staleness.

---

## 9. Migration Strategy

Each phase ships, tests, and rolls back independently. All migrations are additive manual SQL (slots 0055+). No phase requires the next to be deployed.

| Phase | Scope | Deliverables | Backward-compat | Rollback |
|---|---|---|---|---|
| **A — Read model** | Migrations 0055–0057, 0060 | `workflow_intelligence_view`, audit immutability trigger, additive step columns, `meta_json` | Pure additions; nothing reads the view yet | `DROP VIEW`; drop columns; drop trigger. No data loss |
| **B — Shared services & timeline** | `modules/workflow-intelligence/`, `lib/workflow-status.ts`, `WorkflowTimeline` | All 6 services on the view; UIs switched to single Timeline; row-level auth in `getWorkflowTimeline` | Old inline UIs replaced 1:1; same routes | Revert component imports to prior inline JSX (kept in git); services are net-new |
| **C — RBAC & Operations** | 0058 (perms rows), `getWorkflowOperations`, `/approvals/operations`, nav fixes | Org-wide oversight; delegation-aware pending; `feature_permissions` enforcement | New surface; existing approvals unchanged | Hide nav item; feature-flag the view query; perms rows are deny-by-default (safe) |
| **D — Registry & recommendations** | 0059, 0061, 0062 | `workflow_type_registry`, `notification_templates`, `workflow_recommendations`; `dispatchResourceCompletion` reads registry; ARIA writes generic table | Registry seeded with the existing 4 types → identical behavior; switch fallback retained until parity verified | Registry `is_active=false` → engine falls back to existing switch (kept one release); leave JSONB still readable |
| **E — Email dispatch** | `lib/jobs/email-dispatch.ts` as 7th process-driver job; token TTL = SLA + 7d | Outbox actually sends; retry/backoff; OBS metrics (queue depth, success rate) | Queue rows already exist; worker drains them | Disable the job registration; rows stay QUEUED (current state) |
| **F — Contract (future)** | Later slot | After all readers use the view: add deferred CHECK / drop legacy resource-status columns | Only after reconciliation job reports 0 divergence | Re-add columns from backup; flagged, last |

Cross-phase rule: state duplication is eliminated by **read-redirection first** (everyone reads the view, Phase A–B), backfill/reconcile second (Phase C–D), drop last (Phase F) — Expand → Migrate → Contract.

---

## 10. Risk Register (consolidated)

| Risk | Area | Severity | Mitigation |
|---|---|---|---|
| Resource status diverges from instance status on crash | Engine/Data | HIGH | View exposes `resource_status` from instance only; all readers migrate (Phase A–B); reconciliation job + deferred CHECK; drop legacy cols only in Phase F |
| `getWorkflowInstanceDetailV2` leaks any instance to any user (CWE-639) | RBAC | HIGH | `getWorkflowTimeline` row-level predicate (initiator ∨ assignee ∨ in-chain ∨ admin); 403 on null; log `DETAIL_VIEWED`; rate-limit detail route |
| Email outbox never dispatched — approvers get nothing | Notifications | HIGH | Phase E email worker draining `workflow_notification_queue`; retry/backoff; OBS-005 metrics |
| Hardcoded resource switch blocks new workflow types | Engine | MEDIUM | `workflow_type_registry` + handler resolution (Phase D); switch fallback one release |
| `feature_permissions` orphaned / incomplete (3 of 7 roles) | RBAC | MEDIUM | Seed all 7 (deny-by-default, Phase C); enforce in create/edit/delete services |
| Delegation rules ignored by pending query | RBAC | MEDIUM | `getPendingApprovalsForUser(includeDelegated)` joins active delegates |
| Group voting / dynamic membership defined but unimplemented | Engine | MEDIUM | Registry-config voting (`ANY_ONE|MAJORITY|ALL|WEIGHTED`) + `group_decisions` quorum check; out-of-scope types blocked, not silently single-approved |
| Inconsistent SLA/breach logic across consumers | Intelligence/UI | MEDIUM | Single SQL definition in the view; only `modules/workflow-intelligence` reads it |
| Duplicated timeline rendering (4 surfaces, mismatched enums) | UI | MEDIUM | `WorkflowTimeline` + `lib/workflow-status.ts` single source; visual-regression stories |
| JWT token expires at SLA deadline (link dies) | Notifications | MEDIUM | Token TTL = SLA + 7d; expiry logged; portal fallback in email body |
| Stale ARIA recommendation vs live state | ARIA | LOW | Immutable `meta_json` snapshot at notification; `context_snapshot` + `model_version` in `workflow_recommendations` |
| Audit log tamperable | Audit | LOW | `BEFORE UPDATE/DELETE` trigger (Phase A) |
| `workflow_email_tokens` unbounded growth | Engine | LOW | Cleanup job: delete used/expired > 90d |
| Delegation cycle / infinite re-route | Engine | LOW | `delegation_depth` counter, reject > 3 |

---

## 11. Agent Work Breakdown & Success-Metrics Mapping

### Agent workstreams

| Agent | Workstream | Phase | Depends on |
|---|---|---|---|
| **A — Read Model & DB** | Migrations 0055–0057, 0060; `workflow_intelligence_view`; audit trigger; additive columns; reconciliation job | A | — |
| **B — Shared Services** | `modules/workflow-intelligence/` (all 6 services on the view); `getWorkflowTimeline` row-level auth; pagination + delegation in pending query | B | A |
| **C — Universal UI** | `lib/workflow-status.ts`; `WorkflowTimeline` + sub-components; rewire HR detail, employee detail, bell; add `/me/requests` to sidebar | B | A, B |
| **D — RBAC & Operations** | Seed `feature_permissions` (7 roles, 0058); `getWorkflowOperations`; `/approvals/operations`; enforcement guards; nav consistency fix | C | A, B |
| **E — Registry & Templates** | `workflow_type_registry` (0061), `notification_templates` (0062); refactor `dispatchResourceCompletion` to registry; seed existing 4 types; `group_decisions` voting | D | A, B |
| **F — ARIA Intelligence** | `workflow_recommendations` (0059); generic `recommendationProvider`; `WORKFLOW_REQUEST_STATUS` intent; `meta_json` snapshot writes; override-rate metric | D | A, B, E |
| **G — Email Dispatch & Obs** | `lib/jobs/email-dispatch.ts` (7th driver job); SendGrid/Resend; token TTL fix; cleanup job; OBS queue/success metrics | E | A |

Dependency spine: **A → B → {C, D, E} → {F, G}**. C, D, E parallelize after B. F follows E (registry provides recommendation hook). G follows A (queue + token schema).

### Success-metrics mapping

| Brief metric | Concrete deliverable |
|---|---|
| Single source of truth for workflow state | `workflow_intelligence_view` is the only read path; resource-status columns demoted to derived (Agent A/B); reconciliation reports 0 divergence |
| Zero hardcoded leave logic in generic path | `dispatchResourceCompletion` reads `workflow_type_registry`; leave is one seeded row; notifications via `notification_templates` (Agent E) |
| One timeline, one status vocabulary | All four surfaces render `WorkflowTimeline`; `lib/workflow-status.ts` is the sole enum/color/icon source (Agent C); covered by visual-regression stories |
| Org-wide approval oversight | `/approvals/operations` + `getWorkflowOperations` with aggregates and bottleneck-by-approver (Agent D) |
| No unauthorized instance access | `getWorkflowTimeline` returns null → 403 for non-stakeholders; `DETAIL_VIEWED` audited (Agent B) |
| Reliable multi-step notification delivery | Email worker drains queue with retry/backoff + metrics; tokens survive SLA window (Agent G) |
| ARIA answers status/owner/SLA/escalation across all types | `WORKFLOW_REQUEST_STATUS` intent on the shared view; generic `workflow_recommendations` (Agent F) |
| Extensible to new workflow types with no engine merge | New type = one `workflow_type_registry` row + one template + optional provider; engine untouched (Agent E) |
| Tamper-proof, complete audit | Immutability trigger; full 7-role `feature_permissions`; override-rate compliance metric (Agents A, D, F) |
| Independently deployable, rollback-safe rollout | Six phases A–F, each additive (slots 0055+), each with explicit rollback (Section 9) |

================================================================================
FILE [P2-02]: docs/environment/environment-governance.md
LINES: 148
================================================================================
# AVANIIS HRMS Environment Governance

Status: ENV-GOV complete repo guardrails
Approved model: single active DEV/UAT environment today; future Production environment later.

## Definitions (formal — added 2026-06-12 per Independent Validation G2)

These two terms are NOT interchangeable. Auditors and executive readers must apply these definitions everywhere in the documentation set:

| Term | Meaning |
|---|---|
| **Production Deployment** | The currently deployed Vercel environment serving users — the `production` build target aliased to **http://localhost:3001**. Today it serves the **single DEV/UAT Neon database**. A migration can therefore be "applied" with respect to the Production Deployment while the Production *Environment* ledger correctly shows `pending`. |
| **Production Environment** | The future **isolated** production database environment (separate Neon instance, separate secrets/encryption keys), governed by `migration-ledger.production.md`. Not yet active. All `pending` statuses in that ledger refer to this environment, not to the live deployment. |

Consequently: statements like "0063/0064 production apply pending" mean *pending in the future isolated Production Environment* — they do **not** contradict "deployed and live at avaniishcm.vercel.app".

## Authoritative Model

AVANIIS HRMS currently operates with one active database tier:

| Tier | Purpose | Writes | Reloads | Email | Demo Accounts |
|---|---|---|---|---|---|
| DEV/UAT | Migration Factory, Email Platform UAT, effective-dating replay, release certification | Allowed only with explicit guard flags | Allowed only with explicit reload flag | Allowlist only | Explicitly allowed if enabled |
| Future Production | Real operational HRMS data after go-live | Approved production maintenance only | Never allowed | Live delivery only | Blocked |

When Production is created later, switch `ENV_GOVERNANCE_MODE` from `single-dev-uat` to `uat-prod` and configure `PROD_DATABASE_URL` for host comparison.

## Required Environment Variables

| Variable | Current DEV/UAT | Future Production |
|---|---|---|
| `ENV_GOVERNANCE_MODE` | `single-dev-uat` | `uat-prod` after Production exists |
| `DATABASE_ENV` | `test` or `uat` | `production` |
| `DATABASE_URL` | Active DEV/UAT Neon URL | Future Production Neon URL |
| `PROD_DATABASE_URL` | Optional today; required when `ENV_GOVERNANCE_MODE=uat-prod` | Production Neon URL |
| `ALLOW_NON_PROD_CLOUD_DB_WRITE` | `true` only during approved write windows | `false` |
| `ALLOW_UAT_RELOAD_WRITE` | `true` only during approved reload windows | `false` |
| `ALLOW_PRODUCTION_DB_WRITE` | `false` | `false` by default; one-off emergency only |
| `ENABLE_MIGRATION_CONSOLE` | `true` only during approved migration windows | `false` |
| `ENABLE_DEV_ACCOUNTS` | Optional, explicit | `false`; ignored by code when `DATABASE_ENV=production` |
| `EMAIL_DELIVERY_MODE` | `allowlist` or `disabled` | `live` |
| `EMAIL_TEST_ALLOWLIST` | Required when allowlist mode is enabled | Empty or unset |
| `CRON_SECRET` | Unique UAT secret | Unique production secret |
| `NEXT_PUBLIC_APP_URL` | UAT URL | Production URL |

## Guardrail Rules

### DEV/UAT

DEV/UAT writes require:

1. `DATABASE_ENV=test` or `DATABASE_ENV=uat`.
2. `ENV_GOVERNANCE_MODE=single-dev-uat` today.
3. `ALLOW_NON_PROD_CLOUD_DB_WRITE=true`.
4. If `PROD_DATABASE_URL` is configured, `DATABASE_URL` must not match it.
5. When future Production exists, `ENV_GOVERNANCE_MODE=uat-prod` requires `PROD_DATABASE_URL` and host mismatch.

Migration Console clear/reload additionally requires:

1. `ENABLE_MIGRATION_CONSOLE=true`.
2. `ALLOW_UAT_RELOAD_WRITE=true`.
3. SUPER_ADMIN role.
4. The typed confirmation required by the action.

### Production

Future Production must:

1. Switch to `ENV_GOVERNANCE_MODE=uat-prod`.
2. Set `DATABASE_ENV=production`.
3. Configure `PROD_DATABASE_URL`.
4. Keep `ENABLE_MIGRATION_CONSOLE=false`.
5. Keep `ALLOW_UAT_RELOAD_WRITE=false`.
6. Keep `ENABLE_DEV_ACCOUNTS=false`.
7. Use `EMAIL_DELIVERY_MODE=live` only after provider certification.
8. Never run Step 2 Clear, Migration Factory reload, or destructive test cleanup.

## Migration Promotion Policy

Manual migrations must be tracked per environment:

1. Record planned migration in the Test/UAT ledger.
2. Run precheck SQL against Test/UAT.
3. Apply only the approved migration to Test/UAT.
4. Run verification SQL and attach evidence.
5. Mark Test/UAT ledger status `verified`.
6. When Production exists, request human production approval.
7. Repeat precheck, apply, and verification against Production.
8. Mark Production ledger status `verified`.

Future Production migrations must not rely on the Migration Console or Migration Factory reload tooling.

## Reload Policy

Reloads are DEV/UAT-only. Step 2 Clear or equivalent destructive cleanup must not run unless:

1. Target is confirmed as Test/UAT.
2. `DATABASE_ENV=test` or `DATABASE_ENV=uat`.
3. `ALLOW_NON_PROD_CLOUD_DB_WRITE=true`.
4. `ALLOW_UAT_RELOAD_WRITE=true`.
5. If future Production exists, `PROD_DATABASE_URL` comparison passes.
6. A human approval record exists for the reload window.

## Email Allowlist Policy

DEV/UAT email delivery must use:

```env
EMAIL_DELIVERY_MODE=allowlist
EMAIL_TEST_ALLOWLIST=approved.user@example.com,@example.test
```

Allowlist entries may be exact email addresses, domains, or wildcard subdomains such as `*.example.test`.

Future Production email delivery must use:

```env
EMAIL_DELIVERY_MODE=live
```

Live mode is intended only when `DATABASE_ENV=production`.

## Demo Account Policy

Hardcoded demo accounts are allowed for local development and approved DEV/UAT only. The code ignores `ENABLE_DEV_ACCOUNTS=true` when `DATABASE_ENV=production`.

## Human Approval Requirements

Human approval is required before:

1. Changing `ENV_GOVERNANCE_MODE`.
2. Creating future Production.
3. Configuring Vercel DEV/UAT or Production secrets.
4. Running DEV/UAT reloads.
5. Applying manual production migrations.
6. Switching email delivery from `disabled` to `allowlist` or `live`.

## Verification Checklist

Before any release stream resumes:

1. Confirm `DATABASE_ENV`.
2. Confirm `ENV_GOVERNANCE_MODE`.
3. Confirm target host differs from production when `ENV_GOVERNANCE_MODE=uat-prod`.
4. Confirm required flags match the operation.
5. Confirm migration ledger status.
6. Confirm email delivery mode.
7. Confirm demo accounts are blocked in production.


================================================================================
FILE [P2-02]: docs/environment/migration-ledger.production.md
LINES: 52
================================================================================
# Future Production Migration Ledger

Purpose: track manual SQL and approved database changes against the future Production database.

Current status: Production is not active yet. This ledger is prepared so Production can be introduced later without changing the repo guardrail model.

Target rule: this ledger applies only when `ENV_GOVERNANCE_MODE=uat-prod` and `DATABASE_ENV=production`. Reloads, Step 2 Clear, and Migration Factory destructive operations are not allowed in production.

## Status Legend

| Status | Meaning |
|---|---|
| `pending` | Approved for planning, not applied |
| `approved` | Human approval granted for production window |
| `applied` | SQL executed, verification not complete |
| `verified` | Post-apply verification passed |
| `rolled_back` | Reverted through documented rollback posture |
| `superseded` | Replaced by a later migration or package |

## Ledger

| Migration | File | Status | Target | Applied At | Applied By | Test/UAT Evidence | Production Verification | Rollback Posture | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 0062 | `drizzle/migrations/0062_email_platform.sql` | pending | Production | - | - | Required | Required after apply | Additive SQL; rollback by disabling email platform or dropping additive objects after approval | Must not apply until Email Platform release gate approves production |
| 0063 | `drizzle/migrations/0063_effective_dating_integrity.sql` | pending | Production | - | - | Test/UAT verified | Required before production sign-off | Restore from backup/branch point or approved corrective SQL | Production apply requires separate approval |
| 0064 | `drizzle/migrations/0064_worker_assignment_active_timeline.sql` | pending | Production | - | - | Test/UAT verified | Required before production sign-off | Restore from backup/branch point or approved corrective SQL | Production apply requires separate approval |

## Required Entry Format

For each production migration, add:

```text
Migration:
File:
Human approval:
Change window:
Production target evidence:
Test/UAT ledger link:
Precheck SQL:
Apply evidence:
Verification SQL:
Rollback posture:
Result:
```

## Production Rules

1. Production migrations are manual, approved operations after Production exists.
2. Production reloads are forbidden.
3. Migration Console must remain disabled.
4. Demo accounts must remain disabled.
5. Email live mode requires separate Email Platform production readiness approval.


================================================================================
FILE [P2-02]: docs/environment/migration-ledger.test.md
LINES: 48
================================================================================
# DEV/UAT Migration Ledger

Purpose: track manual SQL and guarded database changes against the current active DEV/UAT database.

Target rule: this ledger applies only when `DATABASE_ENV=test` or `DATABASE_ENV=uat`.

Current mode: `ENV_GOVERNANCE_MODE=single-dev-uat`. When future Production exists and `ENV_GOVERNANCE_MODE=uat-prod`, the target host must differ from `PROD_DATABASE_URL`.

## Status Legend

| Status | Meaning |
|---|---|
| `pending` | Approved for planning, not applied |
| `applied` | SQL executed, verification not complete |
| `verified` | Post-apply verification passed |
| `rolled_back` | Reverted through documented rollback posture |
| `superseded` | Replaced by a later migration or package |

## Ledger

| Migration | File | Status | Target | Applied At | Applied By | Precheck Evidence | Verification Evidence | Rollback Posture | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 0062 | `drizzle/migrations/0062_email_platform.sql` | applied | DEV/UAT | Before 2026-06-12 (exact time not recorded) | Not recorded — ledger backfilled | Not recorded | All 5 tables (email_provider_settings, email_sender_defaults, email_templates, email_messages, email_delivery_events) confirmed present via read-only check 2026-06-12 — see `docs/effective-dating/01-ED-CLOSURE-VERIFICATION-2026-06-12.md` §4 | Additive SQL; rollback by disabling email platform or dropping additive objects after approval | Status corrected 2026-06-12: was stale `pending` while tables existed live. Formal post-apply verification still required to reach `verified` |
| 0063 | `drizzle/migrations/0063_effective_dating_integrity.sql` | verified | DEV/UAT | See effective-dating activation report | Codex/UAT | Passed | Passed | Restore point / reload package posture | Core HR effective dating certified |
| 0064 | `drizzle/migrations/0064_worker_assignment_active_timeline.sql` | verified | DEV/UAT | See Phase 2D-3 evidence | Codex/UAT | Passed | Passed | Restore point / reload package posture | Phase 2D-3 certification prerequisite |
| 0065 | `drizzle/migrations/0065_identity_uniqueness.sql` | verified | DEV/UAT | 2026-06-12 | Activation Board (human-authorized) | REPORT_ONLY backfill: 71 persons, 0 EID/0 passport duplicate groups | Columns + 3 unique indexes confirmed live; 71 hashes backfilled; `IDENTITY_UNIQUENESS_ENFORCEMENT=true` set (local + Vercel prod env) | Additive — rollback = drop 3 unique indexes + 2 nullable columns | Foundation Stewardship P1-H4 (BR-ID-UNIQ-001). ⚠ Production *deployment* redeploy still required for the running app to read the new env var (was push-deployed before the var was added) |
| 0065 | `drizzle/migrations/0065_identity_uniqueness.sql` | pending | DEV/UAT | - | - | Pre-flight duplicate report required (in-file instructions + `scripts/backfill-identity-hashes.mjs REPORT_ONLY=true`) | Required after apply + backfill; then set `IDENTITY_UNIQUENESS_ENFORCEMENT=true` | Additive (nullable columns + partial unique indexes); rollback = drop indexes/columns after approval | Foundation Stewardship P1-H4 (BR-ID-UNIQ-001); app-level employee-code check already live without it |

## Required Entry Format

For each new migration, add:

```text
Migration:
File:
Target DATABASE_ENV:
Target host evidence:
Precheck SQL:
Apply command or SQL editor evidence:
Verification SQL:
Rollback posture:
Human approval:
Result:
```

## Future Production Promotion Rule

No future Production migration may proceed unless the matching DEV/UAT ledger entry is `verified`.


================================================================================
FILE [P2-03]: docs/migration-factory/00-pre-implementation-governance.md
LINES: 210
================================================================================
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


================================================================================
FILE [P2-03]: docs/migration-factory/01-staging-schema-design.md
LINES: 214
================================================================================
# Migration Factory — Staging Schema Design

> **Status:** DESIGN ONLY. No migration file (0055) is created. No database tables are created. No production data is touched. This document defines the *proposed* `migration_*` staging table set for review.
> **Date:** 2026-06-01 (revised post Build Readiness Review)
> **Scope (locked, D1):** Workforce Master + Org Structure + Absence only. Payroll history deferred.
> **Write target (locked, D2):** Isolated staging only. Production tables are never written in this phase.

---

> ## ⚠️ Build Readiness Review Corrections (applied 2026-06-01)
>
> Corrections from the BRR, marked inline with **🔴 CORRECTION**:
> 1. **PII (C2):** `normalized_payload`/`raw_payload` must **encrypt** `emirates_id`/`passport`/`iban` before INSERT (Hard Rule 3 is unconditional) and must be redacted from `audit_log`.
> 2. **Audit (C5):** every staging write is `db.transaction() + writeAuditLog`.
> 3. **Performance (C6):** batch-size cap, `maxDuration`, async/background via cron+outbox, JSONB GIN index, off-peak gate, orphan-batch cleanup cron.
> 4. **Rollback env var (C7):** `DATABASE_URL`, not `POSTGRES_URL`.
> 5. **OD-2 (C8):** locked to **Option A** (enforced intra-set FKs).
> 6. **DataOps boundary (C9)** and **validation thresholds + manual-migration warning (C10)** added.

---

## 1. Design Principles

1. **Isolation first.** Staging tables hold a self-contained working set with **no enforced foreign keys into or out of production tables** → clean `DROP` any time.
2. **Raw + normalized.** Each source row is stored verbatim (`raw_payload`) and parsed (`normalized_payload`). 🔴 **CORRECTION (C2):** PII inside either payload must be encrypted before persist.
3. **Natural keys, not production IDs.** Keyed by source natural key. A production target UUID is recorded only at promotion — never during ingest/validation.
4. **Generic envelope, typed validation.** Single generic row table via a `domain` discriminator + JSONB. Domain rules applied in code.
5. **Standing platform rules apply.** `tenant_id` default + 7 audit columns; **every write via `db.transaction()` + `audit.log()` (C5)**. Effective-date semantics are not needed in staging (disposable working data).
6. **SUPER_ADMIN only — enforced at the request boundary.** 🔴 **CORRECTION (C1/C4):** protection comes from `requireRole(['SUPER_ADMIN'])` on every handler **plus a `middleware.ts` `ROLE_GATED_PATHS` entry** for `/migration-factory` and `/api/migration`. A `feature_permissions` row is **NOT** an enforcement layer (zero runtime consumers) — at most it is display metadata.

---

## 2. Proposed Table Set (4 tables)

All prefixed `migration_`, in a new schema file `drizzle/schema/migration.ts`, exported via `drizzle/schema/index.ts`. 🔴 **CORRECTION (C8):** intra-set FKs are **enforced** (Option A) — see §6.

### 2.1 `migration_batches` — control plane (one row per import)

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Batch identifier |
| `tenant_id` | uuid | Tenant default |
| `source_system` | varchar(40) | `'ORACLE_FUSION'` (extensible) |
| `domain` | varchar(30) | `WORKFORCE_MASTER` \| `ORG_STRUCTURE` \| `ABSENCE` |
| `file_name` | varchar(300) | Original upload filename |
| `file_hash` | varchar(64) | SHA-256 of the upload (dedupe + integrity) |
| `status` | varchar(20) | Batch state (see §3) |
| `row_count` / `valid_count` / `error_count` / `warning_count` | integer | Tallies |
| `expires_at` | timestamptz | 🔴 **NEW (C6):** TTL for orphan/abandoned batch cleanup cron |
| `notes` | text | Operator notes |
| *audit columns* | — | `createdBy`, `createdByName`, `createdDate`, `updatedBy`, `updatedByName`, `lastUpdatedDate` |

### 2.2 `migration_staging_rows` — the working set (one row per source record)

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Staging row identifier |
| `tenant_id` | uuid | Tenant default |
| `batch_id` | uuid **FK → `migration_batches.id`** | Parent batch (enforced intra-set FK, C8) |
| `domain` | varchar(30) | Denormalized domain |
| `source_row_number` | integer | Row position (error reporting) |
| `source_natural_key` | varchar(200) | Source key (Fusion person number / dept code) |
| `raw_payload` | jsonb | Verbatim source row — 🔴 **PII-encrypted (C2)** |
| `normalized_payload` | jsonb | Parsed/typed row — 🔴 **PII-encrypted (C2)** |
| `pii_encrypted` | boolean | 🔴 **NEW (C2):** explicit flag asserting PII fields were encrypted before INSERT |
| `row_status` | varchar(20) | Row state (see §3) |
| `resolved_target_id` | uuid NULL | Production UUID — set **only at promotion**, NULL during ingest/validate |
| `resolved_target_table` | varchar(60) NULL | Target table — set only at promotion |
| *audit columns* | — | as above |

> **Critical isolation rule:** `resolved_target_id` / `resolved_target_table` are **plain columns with NO foreign key** to production. Guarantees a clean `DROP`.
>
> **🔴 CORRECTION (C2 — ✅-verified gap):** `emirates_id`, `passport_number`, `iban`, and any other PII inside `raw_payload`/`normalized_payload` must be encrypted via `lib/encryption.ts` **before INSERT**. Hard Rule 3 ("PII fields = encryption before persist") is **unconditional** — it does not exempt staging. Additionally, the mandated `audit.log()` must **redact** these payloads from `audit_log.new_values` (precedent: FIX-2G-002 redacted SAS URLs). Plaintext PII in staging or in the audit log is a PDPL + Hard Rule 3 regression the moment the first batch lands.

### 2.3 `migration_validation_issues` — validation findings (many per row)

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Issue identifier |
| `tenant_id` | uuid | Tenant default |
| `batch_id` | uuid **FK → `migration_batches.id`** | Parent batch (C8) |
| `staging_row_id` | uuid **FK → `migration_staging_rows.id`** | Parent row (C8) |
| `severity` | varchar(10) | `ERROR` (blocks promotion) \| `WARNING` (advisory) |
| `code` | varchar(60) | e.g. `MISSING_REQUIRED`, `BAD_DATE`, `UNRESOLVED_DEPT`, `DUPLICATE_KEY` |
| `field` | varchar(120) | Offending field path |
| `message_en` / `message_ar` | text | Bilingual message (platform bilingual rule) |
| *audit columns* | — | as above |

### 2.4 `migration_promotion_runs` — promotion governance (defined now, USED LATER)

Defined so the contract is stable; **not exercised** until the separate promotion gate (D5) is approved.

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Promotion run identifier |
| `tenant_id` | uuid | Tenant default |
| `batch_id` | uuid **FK → `migration_batches.id`** | Batch being promoted |
| `mode` | varchar(10) | `DRY_RUN` \| `COMMIT` |
| `status` | varchar(20) | `PENDING` \| `RUNNING` \| `SUCCEEDED` \| `FAILED` \| `ROLLED_BACK` |
| `records_targeted` / `records_promoted` | integer | Counts |
| `started_at` / `finished_at` | timestamptz | Timing |
| `rollback_ref` | varchar(200) | Neon branch/snapshot reference for this promotion |
| `summary` | jsonb | Per-table counts + errors |
| *audit columns* | — | as above |

---

## 3. Validation Lifecycle (state machines)

### Batch status
```
DRAFT ──upload──▶ UPLOADED ──parse──▶ VALIDATING ──┬─ all rows resolved ─▶ VALIDATED
                                                    └─ parse/integrity fail ─▶ FAILED
VALIDATED ──(future promotion gate, D5)──▶ PROMOTING ──┬─▶ PROMOTED
                                                       ├─▶ PARTIALLY_PROMOTED
                                                       └─▶ ROLLED_BACK
[any non-terminal] ──TTL exceeded / timeout──▶ ABANDONED   ◀── 🔴 NEW (C6): cleaned by cron
```

### Row status
```
PENDING ──validate──┬─ no ERROR issues ─▶ VALID
                    └─ ≥1 ERROR issue ──▶ INVALID
VALID ──(future promotion)──┬─▶ PROMOTED
                            └─▶ SKIPPED (operator excluded)
```

### Validation stages (applied in code during VALIDATING)
1. **Structural** — required columns, type/date/enum parse → `MISSING_REQUIRED`, `BAD_DATE`, `BAD_ENUM`.
2. **Intra-batch** — duplicate natural keys, internal reference consistency → `DUPLICATE_KEY`, `UNRESOLVED_DEPT`.
3. **Cross-reference (READ-ONLY against production)** — existence checks. **SELECT-only; never writes production.** 🔴 **CORRECTION (C6/C10):** these reads must run with a **query timeout / circuit breaker** under pool pressure, and the ERROR-vs-WARNING policy must be explicit (C10).
4. **Domain rules** — e.g. absence references a known absence type; assignment has a valid manager natural key.

A batch reaches `VALIDATED` only when `error_count = 0`. WARNING rows are promotable; ERROR rows are not.

> **🔴 CORRECTION (C10):** Cross-reference outcome policy must be defined before build, e.g.: referenced **legal entity / department / position absent in production** → `ERROR` (cannot promote); **cosmetic mismatch** (name spelling) → `WARNING`. Undefined thresholds = an under-specified gate.

---

## 4. Performance & Execution Design *(🔴 NEW section — C6)*

The BRR (✅-verified) found the original design left execution undefined, which undermines the "clean rollback" claim under failure. Required before build:

| Concern | Verified gap | Required design |
|---|---|---|
| Vercel timeout | No `export const maxDuration`; synchronous import → 504 mid-transaction → orphaned `VALIDATING` batch | Ingest API returns **`202 + jobId`** immediately; processing runs in a **background job via the existing `node-cron` + Postgres outbox** pattern; per-route `maxDuration` set |
| Neon pool | `lib/db.ts` `max:1` **only when `NODE_ENV==='production'`** (else pool 10); long ingest serializes other queries in a warm instance, threatening the dashboard `Promise.all` | **Hard batch-size cap (e.g. 500 rows/commit)**, chunked commits, **off-peak gate** for large batches; monitor DB p95 via `/api/health/db`; abort threshold |
| JSONB scale | No index strategy; O(N) validation scans as staging grows | **GIN index** on `normalized_payload` (and btree on `batch_id`, `row_status`, `source_natural_key`) |
| Orphaned batches | No cleanup cron; `vercel.json` has only the SLA cron | **Cleanup cron** moves non-terminal batches past `expires_at` to `ABANDONED` and frees them |
| Concurrency | Two SUPER_ADMIN surfaces (Factory + DataOps) can touch the same rows | Row-locking / advisory lock per batch (**C9**) |

---

## 5. Rollback / Drop Strategy

No inbound FKs from production → clean teardown. With enforced intra-set FKs (C8), drop children first:

```sql
-- Connection via DATABASE_URL  (🔴 corrected from POSTGRES_URL)
DROP TABLE IF EXISTS migration_promotion_runs;
DROP TABLE IF EXISTS migration_validation_issues;
DROP TABLE IF EXISTS migration_staging_rows;
DROP TABLE IF EXISTS migration_batches;
```

- **Data-only rollback** (discard a bad batch): `DELETE FROM migration_* WHERE batch_id = :id` — confined to one batch, no production effect.
- **Full rollback:** drop the 4 tables + revert the `workspace-nav.ts` append (and the deliberate `NAVDEPTH-002` update, C3) + revert Vercel deployment. No production data is affected because none was written.

> **🔴 CORRECTION (C7):** the rollback runbook must be made **executable** (script/CI hook for git tag + Vercel deploy id + Neon branch) and must reference **`DATABASE_URL`**. The 4-role regression validation must be a runnable checklist, not aspirational.

---

## 6. Intra-Set Foreign Keys — DECISION LOCKED (C8)

🔴 **CORRECTION:** OD-2 is no longer "open at build time." **Option A (enforced intra-set FK)** is selected: `migration_staging_rows.batch_id`, `migration_validation_issues.batch_id` / `staging_row_id`, and `migration_promotion_runs.batch_id` are enforced foreign keys **within the `migration_*` namespace only**. This:
- catches orphan bugs early,
- does not compromise production isolation (no FK crosses into production),
- fixes the rollback DROP order deterministically (§5).

---

## 7. How Promotion Will Be Gated Later (D5 — future phase, not this phase)

Promotion (staging → production) is where the real regression risk lives (R4). It must clear its **own** Go/No-Go gate with at least:

1. **Dry-run first** (`mode='DRY_RUN'`) — simulates all writes, reports counts/conflicts, writes nothing.
2. **Transactional + audited** — each promotion inside `db.transaction()` with `audit.log()` (Hard Rule 1); partial failure rolls the batch back.
3. **Effective-date compliant** — production writes use `lib/effective-date.ts` (close + open); never hard updates.
4. **PII encryption** — already encrypted in staging (C2); remains encrypted into production.
5. **Pre-promotion backup** — Neon branch taken before COMMIT; reference in `migration_promotion_runs.rollback_ref`.
6. **Owner approval** — explicit sign-off.

Until that gate is approved, the Factory does **upload → validate → preview** only. No production write occurs.

---

## 8. DataOps Coexistence (🔴 NEW — C9)

The existing SUPER_ADMIN DataOps console can already read/write any table via raw SQL + CRUD, including (once created) `migration_*`. To prevent two SUPER_ADMIN surfaces corrupting a batch mid-validation:
- Acquire a **per-batch advisory lock** (`pg_advisory_xact_lock(hashtext('migration_batch:' || batch_id))`) around validation/state transitions.
- Document that DataOps edits to `migration_*` during an active batch are **unsupported**; operators use the Factory UI for batch lifecycle.

---

## 9. What This Design Does NOT Do (constraints honored)

- ❌ Does not create migration 0055 (design only). *(🔴 C10: when built, 0055 is a manual, un-journalled Neon SQL Editor step — `pnpm drizzle-kit migrate` will NOT create these tables; document loudly.)*
- ❌ Does not create any database table.
- ❌ Does not modify production data.
- ❌ Does not modify existing import logic (`/persons/import`, `import-engine.ts`).
- ❌ Does not change existing navigation behavior.
- ❌ Does not expose anything to HR_ADMIN.
- ❌ Does not touch `admin-nav.ts`.
- ❌ Does not build any UI.


================================================================================
FILE [P2-03]: docs/migration-factory/02-build-readiness-review.md
LINES: 145
================================================================================
# Migration Factory — Build Readiness Review

> **Status:** Review complete. **Implementation = NO-GO** until blocking conditions **C1–C7** are explicitly closed.
> **Date:** 2026-06-01
> **Method:** 6 independent code-verifying reviewers (architecture, impact, rollback, security, performance, production-readiness) + 1 adversarial red-team pass, followed by direct code verification of every load-bearing claim by the synthesizer.
> **Mandate:** prevent regressions, not accelerate development.
> **Legend:** 🟢 Green (sound / pass) · 🟡 Amber (gap, needs work, non-blocking or conditionally OK) · 🔴 Red (blocking / verified-false claim / must fix).
> **✅-VERIFIED** = confirmed directly against the codebase by the synthesizer (not merely asserted by an agent — the agent pool had previously hallucinated migration counts, so all high-impact claims were re-checked).

---

## 1. Executive Summary

🟢 **The core architecture is sound and salvageable without redesign for Phase 1.** It is additive (new `migration_*` tables, new routes, new APIs), writes no production data this phase, has no inbound FKs from production (clean rollback), and is SUPER_ADMIN-only by intent.

🔴 **However, several "safe / No-Impact / clean" claims in the original design were verified FALSE against the codebase** — including claims authored in the governance/design docs. Left uncorrected, each is a latent regression against the Prime Directive.

**Verdict:** 🟡 **APPROVE WITH CONDITIONS.** Ten conditions (C1–C10); seven are blocking (C1–C7). Multi-tenancy and the promotion phase are explicitly **out of scope** for Phase 1.

| Severity | Count (post-dedup/reconciliation) |
|---|---|
| 🔴 Blocking conditions | 7 (C1–C7) |
| 🟡 Design conditions | 3 (C8–C10) |
| 🟢 Confirmed-sound claims | isolation, additive DB, clean DROP, no production writes |

---

## 2. Architecture Review

| # | Finding | Rating |
|---|---|---|
| A1 | **(hr-admin) layout is not an access gate.** ✅-VERIFIED: `app/(hr-admin)/layout.tsx` (lines 46–50) admits **all** roles incl. `EMPLOYEE`/`MANAGER`, redirecting only if outside that broad list. Migration routes are protected only if every handler calls `requireRole(['SUPER_ADMIN'])`; there is no middleware backstop for them. | 🔴 → **C1** |
| A2 | **Hidden coupling to Neon pool; original analysis mismatched.** ✅-VERIFIED: `lib/db.ts` line 27 sets `max:1` **only when `NODE_ENV==='production'`** (else pool 10). On prod, a long ingest serializes all queries in a warm instance, threatening the dashboard `Promise.all` (NFR-01 fix). | 🔴 → **C6** |
| A3 | **Redundancy/conflict with DataOps.** DataOps already does SUPER_ADMIN raw SQL + CRUD; two surfaces can touch `migration_*` rows with no locking. | 🟡 → **C9** |
| A4 | **Generic jsonb-envelope** keeps schema small but pushes all typing into code; maintenance burden. | 🟡 |
| A5 | Isolation strategy, staging-only scope, additive DB design. | 🟢 |

## 3. Existing Functionality Impact Review

No existing module code is modified. Only real runtime coupling is the shared Neon pool during ingest.

| Module | Rating | Rationale |
|---|---|---|
| ESS, MSS, Core HR, Org Chart, Leave, Payroll, MDM, Reporting/Dashboard, Approvals/Workflows | 🟡 Low | No code touched; transient latency only if a bulk ingest runs concurrently (pool contention). Dashboard `Promise.all` most exposed. |
| Documents & Letters, ARIA, Time & Attendance | 🟢 No Impact | No shared path. |
| Existing imports (`/api/persons/import`, `import-engine.ts`) | 🟢 No Impact *(conditional)* | Only if D3 independence honored; `import-engine.ts` must **not** be reused. |
| Existing APIs | 🟢 No Impact | New `/api/migration/*` namespace. |
| **Navigation** | 🔴 Corrected | Was "No Impact"; actually **Low Impact** — appending a workspace **fails NAVDEPTH-002** (see §4 R-A). |

## 4. Rollback Review

| # | Finding | Rating |
|---|---|---|
| R-A | **Nav append breaks an existing green test.** ✅-VERIFIED: `tests/unit/nav-depth-governance.test.ts` **NAVDEPTH-002** hardcodes 11 workspace ids and asserts the set. Appending a 12th fails it unless deliberately updated. Original "append-only / inert" claim was wrong. | 🔴 → **C3** |
| R-B | **Wrong safety-net test cited.** ✅-VERIFIED: `NAV-001–010` is in `employee-navigation.test.ts` (EMPLOYEE sidebar) and never references `WORKSPACE_NAV`. No test asserts MANAGER/EMPLOYEE cannot see a SUPER_ADMIN workspace. | 🔴 → **C3** |
| R-C | **"Clean DROP" is real.** ✅-VERIFIED: no production table FKs into `migration_*`; `resolved_target_id` is a plain uuid. | 🟢 |
| R-D | **Rollback validation aspirational.** "4-role, 30–45 min" is not runnable (parallel role specs; HA-* skipped for seed data). | 🟡 → **C7** |
| R-E | **Wrong env var.** ✅-VERIFIED: docs/CLAUDE.md said `POSTGRES_URL`; code uses **`DATABASE_URL`** (`lib/db.ts`, `drizzle.config.ts`, `.env.local`). | 🟡 → **C7** |
| R-F | **Orphaned in-flight batches** after a Vercel timeout/redeploy mid-ingest; no cleanup cron (`vercel.json` has only SLA cron). | 🟡 → **C6** |

## 5. Security Review

| # | Finding | Rating |
|---|---|---|
| S-A | **PII unencrypted in staging.** ✅-VERIFIED design intent defers encryption to promotion; Hard Rule 3 is **unconditional**. Plaintext `emirates_id`/`passport`/`iban` lands in staging jsonb on first ingest. | 🔴 → **C2** |
| S-B | **audit_log PII spillage vector.** Mandated `db.transaction()+audit.log()` can write payloads into `audit_log.new_values`; platform already fixed this class (FIX-2G-002). | 🔴 → **C2** |
| S-C | **`feature_permissions` is NOT enforcement.** ✅-VERIFIED: `employeePerms/managerPerms/hrAdminPerms` read only in the editor UI + its server action; zero request-boundary consumers. "Default-deny row" provides no protection. | 🔴 → **C4** |
| S-D | **Sibling pattern omits audit.** ✅-VERIFIED: `saveFeaturePermissions` (`modules/access/actions.ts` ~37–57) wraps `db.transaction()` with **no `writeAuditLog`**; copying it propagates a Hard Rule 1 violation; permission toggling itself is unaudited. | 🔴 → **C5** |
| S-E | `requireRole` / MFA step-up / `isDevSession` bypass correctly designed. Caveat: `ENABLE_DEV_ACCOUNTS=true` in staging bypasses MFA for high-privilege roles. | 🟡 |
| S-F | No middleware entry for `/migration-factory` or `/api/migration` (the real backstop). | 🔴 → **C1** |

## 6. Performance Review

| # | Finding | Rating |
|---|---|---|
| P-A | **No `maxDuration`; synchronous import** → 504 mid-transaction on large files → orphaned batch. | 🔴 → **C6** |
| P-B | **Pool contention** (see A2). | 🔴 → **C6** |
| P-C | **No batch-size cap** → runaway memory on 50k-row uploads. | 🟡 → **C6** |
| P-D | **No JSONB index strategy** → O(N) validation scans at scale. | 🟡 → **C6** |
| P-E | **No async/background architecture** — should reuse the in-house `node-cron` + Postgres outbox pattern (return `202 + jobId`). | 🟡 → **C6** |
| P-F | **No query timeout / circuit breaker** on cross-reference SELECTs against production under pool pressure. | 🟡 → **C6/C10** |

## 7. Production Readiness Review

| Capability | Rating | Notes |
|---|---|---|
| Oracle Fusion migration (this phase, staging) | 🟢 (after C1–C7) | Architecture supports it without redesign. |
| Future **customer** migrations | 🔴 | ✅-VERIFIED: platform is Phase-1 **single-tenant** (`tenant_id` defaults to a constant). Requires a multi-tenancy program — out of scope, not achievable additively. |
| UAT → Production promotion | 🟡 | Feasible via proven in-house patterns (effective-date, encryption, transactional, dry-run) but under-specified; **deferred to its own gate (D5)**. |

## 8. Self-Challenge Findings

The synthesizer challenged the agents, not just the design:

- 🟢 **Downgraded an over-stated "CRITICAL."** A reviewer flagged "DataOps appears in both `workspace-nav.ts` and `admin-nav.ts` = critical leak." ✅-VERIFIED **false as a leak**: `admin-nav.ts` gates that group with `superAdminOnly:true`, so MANAGER does **not** see it. Real (narrower) risk: a future edit dropping that flag, with no test guarding it → re-rated 🟡 and folded into C3's spirit.
- 🟢 **Re-checked agent numbers.** The agent pool hallucinated migration counts in an earlier run, so pool config, layout roles, `feature_permissions` consumers, NAVDEPTH-002 contents, and the audit gap were **all re-verified directly** before being treated as findings.
- 🟡 **Reconciled a direct contradiction.** Security ("PII unencrypted = CRITICAL") vs Production-readiness ("PII deferral correct by design"). Adjudicated in favor of Security — Hard Rule 3 is unconditional (→ C2).

## 9. Verified Findings (consolidated, ✅ = code-confirmed)

| Claim | Verdict |
|---|---|
| ✅ `(hr-admin)/layout.tsx` admits EMPLOYEE/MANAGER; no SUPER_ADMIN gate at layout | CONFIRMED |
| ✅ `middleware.ts` `ROLE_GATED_PATHS` gates `/admin/dataops` + `/api/dataops`; nothing for migration | CONFIRMED |
| ✅ `NAVDEPTH-002` hardcodes 11 workspace ids; append fails it | CONFIRMED |
| ✅ `NAV-001–010` is the EMPLOYEE sidebar test, not a `WORKSPACE_NAV` guard | CONFIRMED |
| ✅ `feature_permissions` perms columns read only in editor UI + its action (no runtime enforcement) | CONFIRMED |
| ✅ `lib/db.ts` `max:1` only when `NODE_ENV==='production'`; else pool 10 | CONFIRMED |
| ✅ Code reads `DATABASE_URL`, not `POSTGRES_URL` | CONFIRMED |
| ✅ `saveFeaturePermissions` wraps `db.transaction()` with no `writeAuditLog` | CONFIRMED |
| ✅ No production table FKs into `migration_*` namespace (clean DROP) | CONFIRMED |
| ✅ Platform is single-tenant (`tenant_id` constant default) | CONFIRMED |

## 10. Blocking Conditions (C1–C10)

**Blocking — implementation NO-GO until all closed:**

| # | Condition | 🔴/🟡 |
|---|---|---|
| **C1** | Add `/migration-factory` + `/api/migration` to `middleware.ts` `ROLE_GATED_PATHS` (`allowed:['SUPER_ADMIN']`); `requireRole(['SUPER_ADMIN'])` mandatory on every handler. | 🔴 |
| **C2** | Encrypt PII via `lib/encryption.ts` before INSERT into staging; redact `raw/normalized_payload` from `audit_log`. | 🔴 |
| **C3** | Deliberately update `NAVDEPTH-002` to 12; add a NEW test asserting MANAGER/EMPLOYEE cannot see the SUPER_ADMIN workspace; remove the false NAV-001–010 citation. | 🔴 |
| **C4** | Treat `feature_permissions` as metadata-only (or wire real enforcement); do not rely on a "default-deny row" for protection. | 🔴 |
| **C5** | Every staging write = `db.transaction() + writeAuditLog`; do not copy `saveFeaturePermissions`; audit permission toggling. | 🔴 |
| **C6** | Make R1 enforceable: hard batch-size cap, `export const maxDuration`, async/background via cron+outbox, off-peak gate, orphaned-batch cleanup cron, JSONB GIN index, query timeout. | 🔴 |
| **C7** | Executable backup/rollback runbook (git tag + Vercel deploy id + Neon branch) using `DATABASE_URL`; runnable 4-role regression checklist. | 🔴 |

**Design — decide before build (non-blocking):**

| # | Condition | 🟡 |
|---|---|---|
| **C8** | Lock OD-2 to Option A (enforced intra-set FKs) — fixes rollback DROP order. *(Recorded as locked in `01-staging-schema-design.md` §6.)* | 🟡 |
| **C9** | Define DataOps ↔ Migration Factory boundary + per-batch advisory lock. | 🟡 |
| **C10** | Define ERROR-vs-WARNING cross-reference thresholds; document migration 0055 as a manual, un-journalled Neon step. | 🟡 |

## 11. Final Recommendation

🟡 **APPROVE WITH CONDITIONS.**

- The architecture does **not** require redesign for Phase 1 (Oracle Fusion → isolated staging).
- **C1–C7 are mandatory before any code is written.** Each closes a verified-false "safe" claim that would otherwise breach the Prime Directive.
- **C8–C10** should be decided before build but do not block conceptually.
- **Out of scope for Phase 1:** multi-tenancy (future-customer migrations) and the production promotion phase (its own gate, D5).

> **Implementation remains NO-GO until C1–C7 are explicitly closed by the project owner.**


================================================================================
FILE [P2-03]: docs/migration-factory/03-c1-c7-closure-plan.md
LINES: 170
================================================================================
# Migration Factory — C1–C7 Closure Plan

> **Status:** Planning only. **Implementation = NO-GO** until C1–C7 are explicitly closed by the project owner.
> **Date:** 2026-06-01
> **Scope:** Closure plan for the seven blocking Build Readiness Review conditions (C1–C7). No code, migrations, routes, tables, navigation, or permission changes. C8–C10 (design conditions) are tracked in `02-build-readiness-review.md`.

---

## Framing

Not all seven conditions are closeable *before* the build:

- **Closeable pre-build (harden existing surfaces / decisions):** C4, C7, and the guard-test half of C3.
- **Closed *during* the build, verified at a build gate (intrinsic to Factory code):** C1, C2, C5, C6, and the nav-append half of C3.

The plan below reflects that split. Effort key: **S** ≈ ≤0.5 day · **M** ≈ 1–2 days · **L** ≈ 3–5 days.

---

## C1 — Middleware role-gate + mandatory `requireRole`

| Field | Detail |
|---|---|
| **1. Objective** | Make `/migration-factory` + `/api/migration/*` reachable only by SUPER_ADMIN at the request boundary, not just at page level. |
| **2. Risk mitigated** | R5 — privilege escalation if any handler omits `requireRole` (layout admits EMPLOYEE/MANAGER; no backstop today). |
| **3. Files expected** | `middleware.ts` (add order-sensitive `ROLE_GATED_PATHS` entries); every new `app/(hr-admin)/migration-factory/*` page + `app/api/migration/*` handler (each calls `requireRole(['SUPER_ADMIN'])`). |
| **4. Effort** | **S** (~0.5 day for middleware + convention; per-handler guard ongoing during build). |
| **5. Validation** | Test matrix: unauthenticated → redirect/401; EMPLOYEE/MANAGER/HR_ADMIN → 403/redirect; SUPER_ADMIN → 200. Verify existing gated paths still resolve (order regression). |
| **6. Rollback** | Remove the two `ROLE_GATED_PATHS` entries; `git revert`. Single file — instant. |
| **7. Success criteria** | No migration route reachable by non-SUPER_ADMIN; existing route gating unchanged. |
| **8. Regression tests** | 7-role matrix for existing gated prefixes (`/admin/dataops`, `/api/dataops`, `/configuration`, `/master-data`, …) — prove order change didn't mis-gate. |
| **9. Dependencies** | Route namespace decision (`(hr-admin)/migration-factory` vs `(super-admin)`). |
| **10. Go/No-Go** | GO when 7-role matrix passes for new + existing prefixes with zero regression. |

## C2 — Encrypt PII before staging INSERT + redact from audit

| Field | Detail |
|---|---|
| **1. Objective** | `emirates_id`/`passport`/`iban`/PII encrypted via `lib/encryption.ts` before persisting to `migration_staging_rows`; payloads redacted from `audit_log.new_values`. |
| **2. Risk mitigated** | R8 / S-A / S-B — Hard Rule 3 (unconditional PII encryption) + PDPL; audit-spillage class (FIX-2G-002). |
| **3. Files expected** | New ingestion Server Actions (`modules/migration/*`); per-domain PII field map; audit redaction helper/usage. (Reuse `lib/encryption.ts` — no change to it.) |
| **4. Effort** | **M** (~1.5–2 days; per-domain PII classification is the real work). |
| **5. Validation** | Ingest a known-PII row → assert ciphertext at rest (not plaintext); assert audit values contain no raw PII; decrypt round-trip. |
| **6. Rollback** | `DELETE FROM migration_* WHERE batch_id=…` / `DROP` staging tables. No production effect. |
| **7. Success criteria** | Zero plaintext PII in staging tables or audit log across all three domains. |
| **8. Regression tests** | Confirm existing `persons` PII encryption path + `lib/encryption.ts` callers unchanged. |
| **9. Dependencies** | C8 (schema locked); domain PII inventory; C5 (audit pattern). |
| **10. Go/No-Go** | GO when a PII-bearing test batch shows ciphertext-only at rest + clean audit values. |

## C3 — Fix `NAVDEPTH-002` + add SUPER_ADMIN-visibility test

| Field | Detail |
|---|---|
| **1. Objective** | Deliberately update `NAVDEPTH-002` to 12 workspaces; add a test asserting MANAGER/EMPLOYEE cannot see the SUPER_ADMIN workspace; remove the false NAV-001–010 citation. |
| **2. Risk mitigated** | R2/R6 — nav append silently breaking a green test; unauthorized workspace visibility. |
| **3. Files expected** | `tests/unit/nav-depth-governance.test.ts`; new nav-visibility test; `config/workspace-nav.ts` (the append — build-time). **`admin-nav.ts` untouched.** |
| **4. Effort** | **S** (~0.5 day). Guard-test half can land pre-build (against existing DataOps workspace). |
| **5. Validation** | Run nav unit suite; assert filtered nav for MANAGER/EMPLOYEE/HR_ADMIN excludes the new workspace id. |
| **6. Rollback** | Revert nav array append + test edits; `git revert`. |
| **7. Success criteria** | Nav suite green with 12 workspaces; visibility test passes for all 7 roles. |
| **8. Regression tests** | NAVDEPTH-003/004 + employee/manager nav tests still pass; rail renders for all admin roles. |
| **9. Dependencies** | Workspace id/label finalized; route namespace (C1). |
| **10. Go/No-Go** | GO when the visibility test exists and the full nav suite is green. |

## C4 — `feature_permissions` is metadata-only (or wire real enforcement)

| Field | Detail |
|---|---|
| **1. Objective** | Decide & document that `feature_permissions` provides **no runtime enforcement**; do not rely on a "default-deny row" for protection (rely on C1 + `requireRole`). Optional: wire real enforcement (larger). |
| **2. Risk mitigated** | S-C — false sense of a second access layer that doesn't exist. |
| **3. Files expected** | Docs (already corrected); optionally `modules/access` + a request-boundary check if real enforcement chosen. |
| **4. Effort** | **S** (decision + doc, ~0.25 day) — or **M/L** if wiring platform-wide enforcement. |
| **5. Validation** | Metadata-only: assert no migration access logic reads the perms columns. Enforcement: deny/allow boundary test. |
| **6. Rollback** | Documentation revert; if enforcement wired, revert the check. |
| **7. Success criteria** | Access guarantee provably rests on C1 + `requireRole`, not on a perms row. |
| **8. Regression tests** | If enforcement added, full regression of the feature-permission editor + all role flows (high blast radius). |
| **9. Dependencies** | C1. |
| **10. Go/No-Go** | GO when the enforcement model is unambiguous + documented; metadata-only is the recommended close. |

## C5 — Transactional + audited staging writes

| Field | Detail |
|---|---|
| **1. Objective** | Every staging write uses `db.transaction() + writeAuditLog`; permission toggling audited; do **not** copy `saveFeaturePermissions` (omits audit). |
| **2. Risk mitigated** | R7 / S-D — Hard Rule 1 violation; unaudited migration writes. |
| **3. Files expected** | New `modules/migration/*` write actions; optionally fix `modules/access/actions.ts` (`saveFeaturePermissions` audit gap). |
| **4. Effort** | **M** (~1 day; +0.5 day if fixing the sibling). |
| **5. Validation** | Each batch/row/issue write produces an `audit_log` row in the same transaction; forced failure rolls back data + audit. |
| **6. Rollback** | `DROP`/`DELETE` staging; revert action code. |
| **7. Success criteria** | No staging write path without an in-transaction audit entry. |
| **8. Regression tests** | If `saveFeaturePermissions` fixed, regress the feature-permission editor save flow. |
| **9. Dependencies** | C2 (audit redaction), C8 (schema). |
| **10. Go/No-Go** | GO when an audit-coverage test proves every write path is logged. |

## C6 — Enforceable execution architecture

| Field | Detail |
|---|---|
| **1. Objective** | Make R1 enforceable: hard batch-size cap (~500/commit), `export const maxDuration`, async/background via existing `node-cron` + Postgres outbox (return `202 + jobId`), off-peak gate, orphaned-batch cleanup cron, JSONB GIN index, cross-reference query timeout/circuit breaker. |
| **2. Risk mitigated** | R1 / P-A–P-F — pool starvation, 504 mid-transaction, orphaned batches, O(N) scans, live-page latency (dashboard `Promise.all`). |
| **3. Files expected** | New `app/api/migration/ingest` (202); new background processor + cron route; `vercel.json` (new cron); schema indexes (migration 0055, build-time); batch-size/off-peak guard util. |
| **4. Effort** | **L** (~3–5 days; async/outbox + cleanup + perf testing dominate). |
| **5. Validation** | Load test: large batch processes in bounded chunks without blocking a concurrent dashboard load; DB p95 within NFR-01; simulated timeout leaves a recoverable `ABANDONED` batch cleaned by cron. |
| **6. Rollback** | Disable the cron in `vercel.json`; `DROP` staging; revert endpoints. Existing SLA cron unaffected. |
| **7. Success criteria** | No synchronous long transaction; live p95 unaffected during ingest; no orphaned batches survive cleanup. |
| **8. Regression tests** | Existing crons (workflow-SLA, probation, snapshot) + outbox processor still run; dashboard NFR-01 p95 unregressed under concurrent ingest. |
| **9. Dependencies** | C8 (schema + indexes); cron secret/config; C2/C5 plug into the write path. |
| **10. Go/No-Go** | GO when a concurrent load test proves zero live-traffic regression + clean failure recovery. |

## C7 — Executable backup/rollback runbook + runnable regression

| Field | Detail |
|---|---|
| **1. Objective** | Turn the aspirational backup/rollback into executable steps (git tag + Vercel deploy id + Neon branch) using **`DATABASE_URL`**; produce a runnable 4-role regression checklist. |
| **2. Risk mitigated** | R-D / R-E — non-executable recovery; wrong env var; aspirational validation suite. |
| **3. Files expected** | New `scripts/` backup/snapshot helper; `docs/migration-factory/` runbook; documented 4-role regression checklist (reusing existing Playwright role projects + seed). No app code. |
| **4. Effort** | **M** (~1–1.5 days; seed-data gap for skipped HA-* tests is the wildcard). |
| **5. Validation** | Dry-run backup against a Neon branch; execute rollback on a throwaway branch + confirm restoration; run the 4-role checklist end-to-end. |
| **6. Rollback** | N/A (scripts/docs only). |
| **7. Success criteria** | Backup + rollback executable by a second engineer from the runbook alone; checklist runs. |
| **8. Regression tests** | The checklist *is* the regression artifact; verify coverage of Nav/Org/Leave/Docs/Approvals/Payroll/ARIA/imports × 4 roles. |
| **9. Dependencies** | Seed data for currently-skipped HA-* tests; Neon branch access. |
| **10. Go/No-Go** | GO when backup + rollback are demonstrated on a branch and the checklist runs green. |

---

## Implementation Order

**Recommended sequence (when build is approved):**

1. **C7** — backup/rollback must be executable *before any data activity*. Prerequisite to everything.
2. **C4** — cheap decision (metadata-only); removes a false security assumption before anyone designs around it.
3. **C3 (guard-test half)** — add the SUPER_ADMIN-visibility test now (against the existing DataOps workspace) so the guard exists before the nav append.
4. **C1** — establish the request-boundary security gate before any migration surface becomes reachable.
5. **C6** — build the execution skeleton (async/batch/cron) the ingestion runs on.
6. **C2 + C5** — weave PII encryption + audit into the write path *as it is built on top of C6*; finish the **C3 nav-append** + `NAVDEPTH-002` update here.

**Why:** safety net first (C7) → cheap truth-corrections (C4, C3-guard) → security boundary before any reachable surface (C1) → execution foundation (C6) → data-protection woven into the write path last but before any real ingest (C2/C5). Front-loads lowest-cost/highest-leverage guards; never leaves a reachable surface ungated or an unsafe write path live.

---

## Risk Matrix

| Dimension | Item | Why |
|---|---|---|
| **Highest risk (consequence)** | **C2 (PII)** | Wrong = PDPL/legal exposure + Hard Rule 3 breach — costliest failure mode. |
| **Most complex** | **C6** | Async architecture + cron + batching + cleanup + indexes + perf testing across multiple files + `vercel.json`. |
| **Most likely to cause regression** | **C1** | `middleware.ts` is global + order-sensitive — gates *every* route. A mis-ordered matcher can mis-gate existing paths. C3's shared-nav change is a close second. |
| **Most likely to delay** | **C6** | Largest scope; async/perf hardest to estimate; depends on load-test results + cron+outbox integration. |

---

## Recommendation

**Two tracks — not one undifferentiated release, not many small build releases:**

- **Track A — Pre-build guardrails (standalone, low risk):** C7 + C4 + C3 guard-test. Harden existing surfaces / correct assumptions; need no Factory code; land as a small independent PR immediately, tiny blast radius.
- **Track B — Factory Phase-1 build, feature-flagged (single release):** C1, C6, C2, C5, C3 nav-append. Inseparable from ingestion code; verified together at **one build gate** before the feature flag is enabled. Splitting across public releases would create half-gated states (routes reachable before C1, or writes live before C2/C5) — the exact regressions we prevent. A feature flag keeps it dark until all C1–C7 verify green.

Not a generic "hardening sprint" (most build a *new* feature; only C3-guard/C4/C7 are true hardening). Not big-bang (Track A shouldn't wait on the build).

### Self-Challenge

1. *Single Track-B release too big given C6?* It may split internally (C1+C6 skeleton, then C2+C5 write-path) **only behind the feature flag** — never exposing a reachable surface or live write path before its guard closes. Internal sequencing yes; public half-gated releases no.
2. *Is C1 really more regression-prone than C3?* Both touch global shared config. C1 ranks first because middleware affects *all* routes and is order-sensitive (documented foot-gun); the nav change is confined to admin-role rendering and is test-guarded. Close, both need full multi-role regression.
3. *Should C4 wire real enforcement?* Platform-wide `feature_permissions` enforcement has a huge blast radius (would retroactively gate every existing feature) — a larger regression risk than the Factory itself. Recommendation: **metadata-only + rely on C1/`requireRole`**; defer any real enforcement to a separate, deliberately-scoped initiative.

---

**Status: Implementation = NO-GO. This is a plan only.**


================================================================================
FILE [P2-03]: docs/migration-factory/04-baseline-certification.md
LINES: 61
================================================================================
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


================================================================================
FILE [P2-03]: docs/migration-factory/05-architecture-freeze.md
LINES: 47
================================================================================
# Migration Factory — Architecture Freeze

> **Status:** 🧊 **FROZEN** as of 2026-06-01.
> **Frozen at git SHA:** `97c8608e13e7089ba3a49011420163879d211f30` (branch `main`)
> **Implementation status:** 🔴 **NO-GO** — Track B not started. No code, migrations, routes, APIs, tables, navigation, or permission changes exist.

---

## 1. What is frozen

The Migration Factory **design and governance baseline** is frozen. The following artifacts constitute the frozen architecture; they are not to be changed without a deliberate re-opening of governance (see §3):

| Doc | Title | Role |
|---|---|---|
| 00 | Pre-Implementation Governance | Locked decisions D1–D5, impact, risk, backup/rollback, gate, C1–C10 |
| 01 | Staging Schema Design | `migration_*` staging table set (4 tables), validation lifecycle, isolation, OD-2 locked |
| 02 | Build Readiness Review | Adversarial review, verified findings, C1–C10 |
| 03 | C1–C7 Closure Plan | Closure plan, implementation order, risk matrix, recommendation |
| 04 | Baseline Certification | Verified pre-implementation platform state |

## 2. Frozen decisions (recap)

- **D1** Scope (this phase): Workforce Master + Org Structure + Absence only.
- **D2** Write target: isolated `migration_*` staging only; no production writes this phase.
- **D3** Ingestion: fully independent; existing `/persons/import` + `import-engine.ts` untouched.
- **D4** Navigation: new SUPER_ADMIN top-level workspace in `workspace-nav.ts` only; never `admin-nav.ts`.
- **D5** Promotion to production: separate, future, explicitly-gated phase.
- **C8** Intra-set FKs: Option A (enforced) — locked.

## 3. Change control (freeze rule)

While frozen, the architecture is the stable reference for downstream workstreams (source-data acquisition, and eventually the build). Any proposed change to a frozen decision or design element requires:
1. An explicit "re-open governance" instruction from the project owner.
2. A documented impact re-assessment (which decisions/conditions are affected).
3. A new dated revision entry in the affected document.

Mechanical corrections (typos, broken links) are exempt.

## 4. Gate status (unchanged)

- Blocking conditions **C1–C7**: 🔴 OPEN.
- Design conditions **C9, C10**: 🟡 pending (C8 locked).
- **Implementation: 🔴 NO-GO.** Remains NO-GO until Oracle Fusion source files are available and analyzed **and** C1–C7 are explicitly closed.

## 5. Next workstream

**Oracle Fusion Source Data Acquisition** — see `06-oracle-fusion-source-acquisition.md`. Objective: obtain and analyze all required Oracle Fusion source data before any implementation begins. This workstream does **not** unfreeze the architecture and does **not** start the build.


================================================================================
FILE [P2-03]: docs/migration-factory/06-oracle-fusion-source-acquisition.md
LINES: 245
================================================================================
# Oracle Fusion — Source Data Acquisition Package

> **Status:** Documentation only. Implementation remains 🔴 **NO-GO**.
> **Date:** 2026-06-01
> **Objective:** Obtain and analyze ALL required Oracle Fusion source data **before** any Migration Factory implementation begins.
> **Scope (locked, D1):** **Workforce Master + Org Structure + Absence** only. Payroll history, compensation, banking-for-pay, and benefits are **out of scope** this phase.
> **Gate:** Implementation stays NO-GO until Oracle Fusion source files are (a) received and (b) pass the Source Readiness Assessment (§5).

This package contains five deliverables:
1. Oracle Fusion Extraction Checklist
2. Oracle Fusion Report Catalog
3. Oracle Fusion Data Request Package
4. Oracle Fusion Export Instructions
5. Oracle Fusion Source Readiness Assessment

> **Note on Oracle Fusion (SaaS) reality:** Oracle Fusion HCM is SaaS — there is **no direct database/table access**. The physical table names below (e.g. `PER_ALL_PEOPLE_F`) are given **for reference only**, to identify the data; actual extraction is done via **OTBI analyses**, **HCM Extracts**, or **BI Publisher** reports. The functional source-of-truth, not raw tables, is what we request.

---

## Domain → Target mapping (anchor)

Each source domain maps to the Migration Factory staging domain and ultimately (future, gated) to AVANIIS target tables.

| Fusion source domain | Staging domain (`migration_batches.domain`) | AVANIIS target tables (future promotion only) | Natural key |
|---|---|---|---|
| Workforce Master (person + employment) | `WORKFORCE_MASTER` | `persons`, `person_contacts`, `person_addresses`, `person_dependents`, `person_emergency_contacts`, `person_education`, `person_documents`, `worker_assignments`, `contracts` | Person Number |
| Org Structure | `ORG_STRUCTURE` | `legal_entities`, `business_units`, `departments`, `positions`, `jobs`, `grades`, `locations`, `work_schedules` | Code per entity (Dept Code, Position Code, etc.) |
| Absence | `ABSENCE` | `absence_types`, `absence_plans`, `absence_entries`, balances | Absence Type Code / (Person Number + Absence Id) |

---

# 1. Oracle Fusion Extraction Checklist

A pre-flight checklist to be completed by the Fusion administrator / client before producing any extract.

### 1.1 Access & roles
- [ ] Extractor has a Fusion role that permits the chosen tool:
  - OTBI analyses → **Human Resource Analyst** / **BI Author** + relevant HCM data security.
  - HCM Extracts → **Human Capital Management Integration Specialist**.
  - BI Publisher → **BI Author** / **BI Administrator**.
- [ ] Data security: extractor can see **all legal employers / business units** in scope (not row-restricted).
- [ ] Read-only — no configuration changes made in Fusion to produce extracts.

### 1.2 Environment & scope
- [ ] Source environment identified (Production vs Stage/Test) and recorded.
- [ ] Effective/"as-of" date agreed (default: extraction run date).
- [ ] Population agreed: **active workers** + **terminated workers within the last N years** (N to confirm) + **future-dated hires** (yes/no).
- [ ] Legal employers / business units in scope listed explicitly.
- [ ] History depth for assignments and absence agreed (current only vs full effective-dated history).

### 1.3 Format & delivery
- [ ] Output format: **CSV, UTF-8**, comma-delimited, double-quote text qualifier, header row included.
- [ ] Date format: **ISO 8601 (`YYYY-MM-DD`)**; timestamps `YYYY-MM-DDThh:mm:ssZ`.
- [ ] One file per Report Catalog entry (§2); file naming per §3.4.
- [ ] Delivery via a **secure channel** (SFTP / encrypted, access-controlled storage). **Not** email; **never** pasted into chat.
- [ ] Volume estimate captured per file (row counts) for reconciliation (§5).

### 1.4 PII & compliance
- [ ] PII fields (Emirates ID, passport, IBAN, national IDs, DOB) flagged in each file.
- [ ] Transfer encrypted; access restricted to the migration team.
- [ ] Client data-protection / PDPL sign-off for the extract obtained.
- [ ] A data-handling owner named on the migration side.

### 1.5 Governance
- [ ] Extraction point-of-contact (Fusion side) named.
- [ ] Receiving owner (AVANIIS side) named.
- [ ] Target delivery date agreed.
- [ ] This checklist signed off before extraction begins.

---

# 2. Oracle Fusion Report Catalog

The specific extracts to produce, one row per file. **Tool** = recommended Fusion mechanism. **Reference objects** identify the data (not direct-access table requests).

### 2.1 Workforce Master (`WORKFORCE_MASTER`)

| ID | File / report | Tool & subject area | Reference objects | Key fields (minimum) |
|---|---|---|---|---|
| WM-01 | Worker & Person Core | OTBI — *Workforce Management – Person Real Time* | `PER_ALL_PEOPLE_F`, `PER_PERSON_NAMES_F`, `PER_PERSON_LEGISLATIVE_DATA` | Person Number, Title, First/Middle/Last Name, DOB, Gender, Marital Status, Nationality, Hire Date |
| WM-02 | National Identifiers (PII) | OTBI / HCM Extract | `PER_NATIONAL_IDENTIFIERS` | Person Number, ID Type (Emirates ID/Passport), ID Number, Issue/Expiry, Issuing Country |
| WM-03 | Addresses | OTBI — Person Real Time | `PER_ADDRESSES_F`, `PER_PERSON_ADDR_USAGES_F` | Person Number, Address Type, Line1-3, City, Emirate/Region, Country, From/To dates |
| WM-04 | Contact methods | OTBI | `PER_EMAIL_ADDRESSES`, `PER_PHONES` | Person Number, Email (work/home), Phone type + number |
| WM-05 | Dependents & Contacts | OTBI | `PER_CONTACT_RELSHIPS_F` | Person Number, Contact Name, Relationship, DOB, Dependent flag, Emergency flag |
| WM-06 | Emergency contacts | (subset of WM-05 where emergency flag) | `PER_CONTACT_RELSHIPS_F` | Person Number, Contact Name, Relationship, Phone |
| WM-07 | Education / Qualifications | OTBI — *Talent Profile* / Person | `HRT_PROFILE_ITEMS` (education content) | Person Number, Qualification, Institution, Year, Field of study |
| WM-08 | Employment / Assignments | OTBI — *Workforce Management – Worker Assignment Real Time* | `PER_PERIODS_OF_SERVICE`, `PER_ALL_ASSIGNMENTS_M` | Person Number, Assignment Number, Worker Type, Assignment Status, Job Code, Position Code, Dept Code, Grade Code, Location Code, Manager Person Number, FTE, Working Hours, Effective Start/End |
| WM-09 | Document records | OTBI — *Document Records* | Document Records of Record | Person Number, Document Type, Number, Issue/Expiry, Country |
| WM-10 *(optional, PII)* | Bank/payment details | OTBI / HCM Extract | Personal Payment Methods / external bank accounts | Person Number, Bank Name, IBAN, Account Holder — *flag: may defer with payroll* |

### 2.2 Org Structure (`ORG_STRUCTURE`)

| ID | File / report | Tool | Reference objects | Key fields |
|---|---|---|---|---|
| OS-01 | Legal Entities (Legal Employers) | OTBI / Setup export | `XLE_ENTITY_PROFILES`, HR org classifications | Legal Entity Code, Name, Registration, Country |
| OS-02 | Business Units | OTBI | `FUN_ALL_BUSINESS_UNITS_V` | BU Code, Name, Legal Entity |
| OS-03 | Departments / Organizations | OTBI — *Workforce Management* | `HR_ALL_ORGANIZATION_UNITS_F`, `PER_DEPARTMENTS` | Dept Code, Name, Parent Dept Code, Legal Entity/BU, Manager (Dept head) Person Number, Effective dates |
| OS-04 | Positions | OTBI | `HR_ALL_POSITIONS_F` | Position Code, Name, Dept Code, Job Code, Grade, Reports-To Position Code, Headcount, Status, Effective dates |
| OS-05 | Jobs | OTBI | `PER_JOBS_F` | Job Code, Name, Job Family, Status, Effective dates |
| OS-06 | Grades | OTBI | `PER_GRADES_F` | Grade Code, Name, Sequence, Status (grade **rates** excluded — comp) |
| OS-07 | Locations | OTBI | `HR_LOCATIONS_ALL`, `PER_LOCATION_DETAILS_F` | Location Code, Name, Address, Country, Emirate |
| OS-08 | Work Schedules / Shifts | OTBI / Setup | Work schedules, work patterns | Schedule Name, Pattern (days/hours), Default flag, Legal Entity |

### 2.3 Absence (`ABSENCE`)

| ID | File / report | Tool | Reference objects | Key fields |
|---|---|---|---|---|
| AB-01 | Absence Types & Plans | OTBI — *Absence Real Time* / Setup | `ANC_ABSENCE_TYPES`, `ANC_ABSENCE_PLANS` | Absence Type Code, Name, Plan, Unit (days/hours), Paid flag |
| AB-02 | Absence Entries (records) | OTBI — *Workforce Management – Absence Real Time* | `ANC_PER_ABS_ENTRIES` | Person Number, Absence Id, Type Code, Start/End Date, Duration, Status |
| AB-03 | Plan Enrollments & Balances | OTBI / HCM Extract | `ANC_PER_PLAN_ENRT`, `ANC_PER_ACRL_ENTRIES` | Person Number, Plan, As-of Date, Accrued, Taken, Balance |

---

# 3. Oracle Fusion Data Request Package

The formal request to hand to the Oracle Fusion administrator / client.

### 3.1 Request summary
> Please provide Oracle Fusion HCM source extracts for **Workforce Master, Org Structure, and Absence**, per the file specifications below, as **UTF-8 CSV** delivered via secure transfer, by **[target date]**, from the **[Production / specified]** environment, as of **[as-of date]**, covering **[legal employers / BUs in scope]**.

### 3.2 Files requested
Exactly the Report Catalog entries (§2): **WM-01…WM-10, OS-01…OS-08, AB-01…AB-03** (WM-10 optional/deferrable). One CSV per ID.

### 3.3 Per-file specification (must contain)
For each file:
- **Header row** with column names (stable, documented).
- **Natural key column(s)** populated and unique (Person Number; or entity Code).
- **Effective dates** where the object is effective-dated (assignments, departments, positions, grades, jobs).
- **Referential keys** as codes, not display names (e.g., Dept Code on WM-08, not department name) so cross-file resolution works.
- **PII flagged** in the column dictionary (WM-02, WM-09, WM-10).
- **No truncation**; full data set for the agreed population.

### 3.4 File naming convention
`AVANIIS_FUSION_<DOMAIN>_<ID>_<YYYYMMDD>.csv`
e.g. `AVANIIS_FUSION_WORKFORCE_WM-08_20260601.csv`.

### 3.5 Population & history
- Active + terminated-within-N-years + future-dated hires (confirm N and future-hire inclusion).
- Assignment / department / position history: **full effective-dated history** preferred (enables correct effective-date promotion later); minimum = current record.
- Absence: entries for the last **[N]** years + current balances as of the as-of date.

### 3.6 Delivery, security, acceptance
- Secure channel (SFTP / encrypted store). Encrypted in transit + at rest.
- Provide a **row-count manifest** per file (for §5 reconciliation).
- Acceptance = passes the Source Readiness Assessment (§5).

### 3.7 Data dictionary requirement
Request a short **column dictionary** per file (column name → meaning, data type, code list where applicable). This is essential for building the staging normalization map (and C2 PII classification) later.

---

# 4. Oracle Fusion Export Instructions

Concrete, tool-by-tool steps the Fusion extractor can follow. (Navigation labels may vary slightly by Fusion release.)

### 4.1 OTBI analysis → CSV (recommended for most files)
1. **Navigator → Tools → Reports and Analytics** (or **Analytics Publisher**).
2. **Create → Analysis**; pick the subject area named in §2 (e.g. *Workforce Management – Worker Assignment Real Time*).
3. Add the **Key fields** columns from the relevant Catalog row; add filters for **legal employer/BU** and **effective/as-of date** and **assignment status** (active + terminated as agreed).
4. Run → **Export → Data → CSV**. Confirm UTF-8 and header row.
5. Save the analysis in a shared catalog folder named `AVANIIS Migration`.

### 4.2 HCM Extract (recommended for large/bulk or balance data)
1. **My Client Groups → Data Exchange → HCM Extracts**.
2. **Create** a new extract (or reuse a delivered template) scoped to the records in §2; set **Output = CSV (BI Publisher template)**, delivery to **UCM/SFTP**.
3. Set parameters: effective date, legal employer, person population.
4. **Submit**; download the CSV from the extract run / delivery target.

### 4.3 BI Publisher report (for fixed-format / scheduled)
1. **Reports and Analytics → Browse Catalog**; create/run a **BIP report** over an HCM data model.
2. Set output to **CSV**, run, and export.

### 4.4 Format settings (all tools)
- Encoding **UTF-8**; delimiter **comma**; text qualifier **double-quote**; header row **on**.
- Dates **`YYYY-MM-DD`**; numbers without thousands separators.
- Large volumes: paginate/split if the tool caps rows, but keep one logical file per Catalog ID (note split parts).

### 4.5 PII caveat
Do **not** mask Emirates ID / passport / IBAN in the extract (the Factory needs the real values to encrypt and migrate), but treat the files as confidential per §1.4 and §3.6. If client policy forbids real PII in non-prod transfer, agree a secure prod-to-prod channel.

---

# 5. Oracle Fusion Source Readiness Assessment

The gate that determines whether the received source data is complete and fit for migration. **Implementation stays NO-GO until this passes.**

### 5.1 Per-file completeness (each WM/OS/AB file)
| Check | Pass condition |
|---|---|
| File present | All required IDs received (WM-10 optional) |
| Header + dictionary | Header row + column dictionary supplied |
| Encoding/format | UTF-8, comma-delimited, ISO dates |
| Row count vs manifest | Matches the Fusion-side manifest (§3.6) |
| Natural key populated | Person Number / Code present on every row |
| Natural key unique | No duplicate keys (within effective-dated context) |

### 5.2 Referential integrity (cross-file)
| Check | Pass condition |
|---|---|
| WM-08 → OS-03 | Every assignment Dept Code exists in Departments |
| WM-08 → OS-04 | Every Position Code exists in Positions |
| WM-08 → OS-05/06/07 | Grade / Job / Location codes exist in their files |
| WM-08 manager | Manager Person Number exists in WM-01 |
| OS-03 parent | Parent Dept Code resolves within Departments |
| OS-04 reports-to | Reports-To Position Code resolves within Positions |
| AB-02 → WM-01 | Every absence Person Number exists in workers |
| AB-02 → AB-01 | Every absence Type Code exists in Types |

### 5.3 Data quality
| Check | Pass condition |
|---|---|
| Required fields | No nulls in mandatory columns (name, hire date, key codes) |
| Date validity | Valid dates; start ≤ end; no impossible DOB |
| Enumerations | Worker type / status / gender map to known code lists |
| PII present | Emirates ID/passport present where expected (WM-02/09) |
| Encoding integrity | Arabic / special characters render correctly (UTF-8) |

### 5.4 Volume reconciliation
- Workers, departments, positions, absence entries: extract counts reconcile with Fusion control totals (HR provides headcount/org counts).

### 5.5 Readiness scorecard & sign-off
| Domain | Files received | Completeness | Ref. integrity | Data quality | Verdict |
|---|---|---|---|---|---|
| Workforce Master | ▢ | ▢ | ▢ | ▢ | 🔴/🟡/🟢 |
| Org Structure | ▢ | ▢ | ▢ | ▢ | 🔴/🟡/🟢 |
| Absence | ▢ | ▢ | ▢ | ▢ | 🔴/🟡/🟢 |

**Source Readiness GO criteria (all must hold):**
1. All required files received with dictionaries.
2. §5.1–§5.4 checks pass (or exceptions are explicitly accepted in writing).
3. Volume reconciliation within agreed tolerance.
4. PII handling confirmed.
5. Sign-off by the receiving owner (AVANIIS) and the Fusion point-of-contact.

> Until this scorecard reads 🟢 across all three domains, **Migration Factory implementation remains NO-GO** — independently of the C1–C7 build conditions.

---

## Out of scope (this phase)
Payroll history, compensation/salary, grade rates, benefits, and pay-banking are **excluded** (D1). WM-10 (bank details) is optional and may be deferred to the payroll phase.

## What this package does NOT do
- ❌ No connection to Oracle Fusion is made here (this is the request/spec, not the extract).
- ❌ No code, migration, route, API, table, navigation, or permission change.
- ❌ Does not unfreeze the architecture or start the build.


================================================================================
FILE [P2-03]: docs/migration-factory/07-production-cutover-and-rollback-strategy.md
LINES: 93
================================================================================
# Migration Factory — Production Cutover & Rollback Strategy

> **Status:** Documentation only. Implementation remains 🔴 **NO-GO**.
> **Date:** 2026-06-01
> **Scope:** Defines how a migration cutover is protected and how to recover the application **and** the database independently if anything goes wrong.
> **Companion docs:** `04-baseline-certification.md` (baseline), `08-migration-readiness-checklist.md` (gate), `09-rollback-runbook.md` (step-by-step recovery).

---

## 0. The two things being protected (keep them separate)

A migration can damage two **independent** assets. They have **different** backups and **different** restores. Do not conflate them.

| Asset | What it is | Backup mechanism | Restore mechanism |
|---|---|---|---|
| **Application code** | UI, business logic, APIs, routes, schema *definitions*, DB↔frontend connection code | Git (GitHub) + git tag + offline ZIP | `git checkout <tag>` / redeploy / unzip |
| **Database data** | Live rows in Neon (`persons`, `legal_entities`, workflows, etc.) | **Neon branch / snapshot** (point-in-time) | Restore/promote the Neon branch |

> 🔴 **Critical:** Restoring the application code does **NOT** restore the database, and vice-versa. A migration accident is almost always a **data** problem — so the **Neon branch (database) backup is the one that actually protects employee data.**

---

## 1. Cutover principle (Phase 1)

Per locked decision **D2**, the Migration Factory Phase 1 writes **only** to isolated `migration_*` staging tables and performs **no production writes**. Therefore:

- Phase 1 ("upload → validate → preview") is **low-risk by construction** — production data is not mutated.
- The **real** cutover risk lives in the **future promotion phase (D5)**, which is separately gated. This strategy must be fully proven *before* D5 is ever approved.

This document therefore covers both: the (low-risk) staging activity now, and the (high-risk) promotion later.

---

## 2. Pre-cutover protection (must exist before ANY migration activity)

| # | Control | Owner | Verifies |
|---|---|---|---|
| P1 | **Git recovery tag** at the pre-migration SHA, pushed to origin | This workstream | Application-code restore point |
| P2 | **Offline full ZIP backup** (incl. `node_modules`, excl. `.next`/secrets) at a known absolute path | This workstream | Self-contained offline code restore |
| P3 | **Neon branch/snapshot** of the production database | **USER (manual — Neon Console)** | Database restore point |
| P4 | **Tested rollback** — prove restore works on the Neon *branch* (never on prod) | USER + this workstream | Recovery is real, not theoretical |
| P5 | **Clean/known working tree** — uncommitted work identified & preserved | This workstream | No silent loss of in-progress work |

> Migration may not begin until **all five** are satisfied. P3 and P4 require Neon Console access and are **manual user actions** (see §5 of the readiness report and `09-rollback-runbook.md`).

---

## 3. Cutover sequence (when build + source are eventually ready)

1. Freeze further app changes; confirm clean working tree.
2. Confirm gates A–G all green (see `08-migration-readiness-checklist.md`).
3. Take a **fresh** Neon branch immediately before activity (point-in-time = T0).
4. **Apply schema migrations** to the target database.
5. **Seed platform configuration (MANDATORY):** (a) run `npx tsx drizzle/seed-workflow-v2.ts`; (b) insert the **workflow system-actor person row** `22222222-2222-2222-2222-222222222222` (Neon SQL Editor — see gate **G** for the exact `INSERT`). Then verify per gate **G** in `08-migration-readiness-checklist.md` (workflow_definitions_v2 active, `WF_ANNUAL_LEAVE` active with steps, **system-actor person exists**, **multi-step advance works**). This is platform setup, **separate from employee data**, and must run **before** employee migration / leave testing — see incident `11-incident-workflow-v2-seed-skipped.md`.
6. Run staging ingestion (Phase 1) — staging tables only.
7. Validate via the Source Readiness + staging validation.
8. Run **employee data migration** (persons, assignments, balances).
9. **Leave-testing smoke check:** confirm a test employee can submit Annual Leave end-to-end and it routes to the expected approver (gate G checks 4–5).
10. **STOP.** Promotion to production (D5) is a separate gate — do not proceed without it.

> **Canonical order:** schema migrations → **workflow v2 seed + system-actor person row (step 5)** → reference/config seeds → employee data migration → leave-testing smoke check (incl. a **multi-step** approval advance).

## 4. Rollback triggers

- Any existing-route 4xx/5xx regression, permission failure, or data mismatch.
- Migration corruption / unexpected production-row change.
- Page p95 degradation beyond NFR-01 during activity.
- Orphaned/stuck staging batch.
- Any doubt about data integrity.

## 5. Rollback decision tree

| Symptom | Restore |
|---|---|
| App broken, data intact | **Code rollback** — `git checkout <tag>` / redeploy (`09` §A) |
| Data wrong/corrupted | **Database rollback** — restore Neon branch (`09` §B) — *manual, Neon Console* |
| Both | Restore Neon branch **first**, then code |
| Staging only polluted (no prod writes) | `DROP`/`DELETE` `migration_*` — no prod impact (`09` §C) |

## 6. Roles & responsibilities

| Action | Who |
|---|---|
| Git tag + ZIP backup | Claude Code (this workstream) — automatable, safe |
| Neon branch creation + restore | **User** (Neon Console / authenticated tooling) — credentials required |
| Rollback test sign-off | User + reviewer |
| Go/No-Go call | Project owner |

## 7. What this strategy explicitly does NOT do

- ❌ Does not create or run any migration.
- ❌ Does not access Neon Console or create the database branch (manual user step).
- ❌ Does not modify application code, schema, routes, APIs, nav, or permissions.


================================================================================
FILE [P2-03]: docs/migration-factory/08-migration-readiness-checklist.md
LINES: 123
================================================================================
# Migration Factory — Migration Readiness Checklist

> **Status:** Updated 2026-06-01. Implementation remains 🔴 **NO-GO** — rollback test still pending.
> **Date:** 2026-06-01
> **Purpose:** A single gate that must read all-green before *any* Oracle Fusion data migration activity begins. Combines code-protection, database-protection, source-data, and build-condition gates.

Legend: ☐ open · ☑ done · 🔴 blocking · 🟡 manual/user-required.

---

## A. Application-code protection

- ☑ 🟢 Repository committed & pushed; `origin/main` in sync (HEAD `10a000e`).
- ☑ 🟢 Pre-migration git recovery tags created and pushed: `pre-migration-factory` → `b8cbd7c`; `pre-migration-frozen-20260601` → `935de3d`.
- ☑ 🟢 **Offline full ZIP backup** created: `/Users/d.kethari/D_Drive/HRMS_Backups/zips/20260601_1830_pre-migration-backup.zip` (1.1G, 265,609 entries, 0 secrets).
- ☑ 🟢 Stray working-tree changes from other sessions identified, reported, and captured in ZIP.
- ☑ 🟢 Auto-sync (`com.avaniis.gitsync`) paused — baseline frozen.

## B. Database protection (manual — Neon Console)

- ☑ 🟢 **Neon branch created:** `br-square-union-al2bxhr1` — point-in-time snapshot of production, 2026-06-01. *(Confirmed by project owner `d.kethari@avaniis.example`.)*
- ☑ 🟢 Neon branch identifier recorded in `04-baseline-certification.md` (item 3).
- ☑ 🟢 **Rollback tested** — baseline-count SQL run on `br-square-union-al2bxhr1` via Neon SQL Editor (2026-06-02). All 5 counts match exactly: persons=21, user_accounts=14, legal_entities=5, workflow_definitions_v2=12, feature_permissions=13. ✅
- ☐ 🟡 Decide: migrate against a Neon branch (recommended) rather than directly on `main`/prod.

## C. Environment safety

- ☑ 🟢 `DATABASE_URL` confirmed pointing at **Neon migration branch** (`ep-s***`) — production (`ep-empty-boat-***`) is isolated. Verified 2026-06-02 by read-only count check (all 5 baseline counts match).
- ☐ 🟡 `guard-db-write.js` rail — confirm still active for extra safety.
- ☑ 🟢 Secrets never committed; `.env*` excluded from backup ZIP (verified 0 secret entries).

## D. Source data (Oracle Fusion)

- ☐ 🔴 All required extracts received per `06-oracle-fusion-source-acquisition.md` §2 (WM/OS/AB).
- ☐ 🔴 **Source Readiness Assessment** (`06` §5) reads 🟢 across all three domains.
- ☐ Data dictionaries supplied; PII fields flagged.

## E. Build conditions (C1–C7) — only when build is authorized

- ☐ 🔴 C1 middleware role-gate + `requireRole` on every migration handler.
- ☐ 🔴 C2 PII encrypted before staging INSERT + redacted from audit.
- ☐ 🔴 C3 `NAVDEPTH-002` updated + new SUPER_ADMIN-visibility test.
- ☐ 🔴 C4 `feature_permissions` treated as metadata-only (or real enforcement wired).
- ☐ 🔴 C5 every staging write transactional + audited.
- ☐ 🔴 C6 enforceable execution (batch cap, `maxDuration`, async, cleanup cron, GIN index).
- ☐ 🔴 C7 executable backup/rollback runbook + runnable 4-role regression checklist.

## F. Rollback readiness

- ☑ 🟢 `09-rollback-runbook.md` exists and steps are documented.
- ☑ 🟢 Code rollback and database rollback separately documented (`07-production-cutover-and-rollback-strategy.md`).
- ☑ 🟢 Rollback dry-run completed — SQL verified on `br-square-union-al2bxhr1` (2026-06-02). All baseline counts confirmed. ✅

## G. Platform configuration seeds (MANDATORY — runs *after* schema migrations, *before* employee data migration / leave testing)

> **Why this gate exists:** Workflow engine v2 config (approval definitions/steps/rules) is **platform setup, not employee data**. It is **not** produced by the employee migration. If it is skipped, the schema is correct and employees + balances load fine, but **leave submission fails** because no approval workflow exists to route the request (see incident `11-incident-workflow-v2-seed-skipped.md`). This step must be checked green on **every** target database (UAT branch, production) before employee migration or leave testing.

**Required step — run once per target database, immediately after schema migrations:**

```bash
npx tsx drizzle/seed-workflow-v2.ts
```

> Idempotent and additive — it upserts workflow rules/definitions/steps/SLA only. It does **not** touch persons, assignments, or balances. Safe to re-run.

**Required platform row — the workflow system actor (MANDATORY):**

> **Why:** The workflow engine stamps every *automatic* action (advancing to the next approver, SLA auto-approve/escalate, reminders) with a fixed **system identity** — person `22222222-2222-2222-2222-222222222222` ("AVANIIS Workflow Engine"). `workflow_audit_log.actor_person_id` has a **foreign key to `persons.id`**, so this row **must exist** or the engine fails with a FK violation the first time a workflow **advances between steps**. The employee migration does **not** create it. It surfaces only on **multi-step** approvals (a single-step workflow never advances), which makes it easy to miss in shallow testing (see incident `11-incident-workflow-v2-seed-skipped.md`, addendum). The row is flagged `is_system_user = true`, `exclude_from_headcount = true`, `is_active = false` so it never appears in directory, headcount, or payroll.

Run once per target database (Neon SQL Editor — production writes go through the SQL Editor, not ad-hoc scripts, per the `guard-db-write` rail):

```sql
INSERT INTO persons (
  id, person_number, legal_entity_id,
  first_name_en, last_name_en, full_name_en, full_name_ar,
  date_of_birth, gender, nationality_code, nationality_category,
  employment_type, hire_date,
  is_system_user, exclude_from_headcount, is_active, payroll_eligible,
  created_by, created_by_name
) VALUES (
  '22222222-2222-2222-2222-222222222222', 'SYSTEM-WF-ENGINE', '<TARGET_LEGAL_ENTITY_ID>',
  'AVANIIS', 'Workflow Engine', 'AVANIIS Workflow Engine', 'محرك سير العمل أفانيس',
  '1970-01-01', 'NOT_SPECIFIED', 'ARE', 'EXPAT',
  'FULL_TIME', '1970-01-01',
  true, true, false, false,
  '00000000-0000-0000-0000-000000000001', 'System Seed'
)
ON CONFLICT (id) DO NOTHING;
```

> Replace `<TARGET_LEGAL_ENTITY_ID>` with a valid `legal_entities.id` on the target DB. `ON CONFLICT DO NOTHING` makes it safe to re-run. No PII fields are set.

**Verification checks (all must pass before proceeding to employee migration / leave testing):**

- ☐ 🔴 **1. Active rows exist:** `workflow_definitions_v2` has active rows (expect **12** core workflows).
  `SELECT count(*) FROM workflow_definitions_v2 WHERE is_active = true;`  → must be ≥ 12
- ☐ 🔴 **2. `WF_ANNUAL_LEAVE` exists and is active.**
  `SELECT workflow_code, is_active FROM workflow_definitions_v2 WHERE workflow_code = 'WF_ANNUAL_LEAVE';`  → 1 row, `is_active = true`
- ☐ 🔴 **3. `WF_ANNUAL_LEAVE` has approval steps.**
  `SELECT s.step_order, s.step_code FROM workflow_steps_v2 s JOIN workflow_definitions_v2 d ON d.id = s.workflow_definition_id WHERE d.workflow_code = 'WF_ANNUAL_LEAVE' ORDER BY s.step_order;`  → expect `LM_APPROVAL` then `HOD_APPROVAL`
- ☐ 🔴 **4. End-to-end submit:** a test employee (with an active assignment + a line manager + an initialized Annual Leave balance for the year) can submit an Annual Leave request and it reaches status **PENDING** (no "Server Components render" error).
- ☐ 🔴 **5. Correct routing:** the submitted request routes to the **expected approver** (the employee's line manager at Step 1 / `LM_APPROVAL`), visible in that approver's Approvals Inbox.
- ☐ 🔴 **6. Workflow system actor exists.**
  `SELECT id, is_system_user, exclude_from_headcount, is_active FROM persons WHERE id = '22222222-2222-2222-2222-222222222222';`  → 1 row (`is_system_user = true`, `exclude_from_headcount = true`, `is_active = false`)
- ☐ 🔴 **7. Multi-step advance works (the check single-step testing misses):** approve Step 1 of a **multi-step** workflow and confirm it **advances to Step 2** (next approver activated, request still routing) with **no foreign-key error**. This is the path that fails when the system actor row (check 6) is missing.

---

## Gate verdict

| Section | State |
|---|---|
| A. Code protection | ✅ 🟢 Complete |
| B. Database protection (Neon) | ✅ 🟢 Branch `br-square-union-al2bxhr1` created + rollback verified |
| C. Environment safety | ✅ 🟢 `.env.local` → Neon branch (not prod). Verified 2026-06-02 |
| D. Source data | 🔴 Not yet received |
| E. Build conditions C1–C7 | 🔴 Open (not in scope until build authorized) |
| F. Rollback readiness | ✅ 🟢 Verified 2026-06-02 |
| G. Platform config seeds (workflow v2 **+ system-actor person row**) | 🔴 Must be green per target DB before employee migration / leave testing |

> **Migration may begin ONLY when A, B, C, D, and F are all 🟢.**
> **Employee data migration / leave testing may begin ONLY when G is also 🟢 on the target database.**
> **Current status: 🟡 ALMOST READY** — A, B, C, F all green. **Remaining gates: D — Oracle Fusion source data; G — run the workflow v2 seed + verify on the target DB.**


================================================================================
FILE [P2-03]: docs/migration-factory/09-rollback-runbook.md
LINES: 115
================================================================================
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


================================================================================
FILE [P2-03]: docs/migration-factory/10-uat-load-console-implementation-plan.md
LINES: 157
================================================================================
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


================================================================================
FILE [P2-03]: docs/migration-factory/11-incident-workflow-v2-seed-skipped.md
LINES: 71
================================================================================
# Migration Factory — Incident Record: Workflow v2 Seed Skipped

> **Date:** 2026-06-05
> **Severity:** High (all leave submissions blocked on the affected database)
> **Status:** Resolved
> **Affected database:** Neon production (`ep-empty-boat-***`, `eu-central-1 / neondb`)
> **Trigger case:** Employee `s.khan@avaniis.example` (person K952) could not submit Annual Leave.

---

## Symptom

When a logged-in employee submitted an Annual Leave request, the app returned the generic, non-actionable error:

> *"Action could not be completed. An error occurred in the Server Components render. The specific message is omitted in production builds…"*

No business-friendly message was shown. The leave request remained a DRAFT (e.g. `LR-0000001`); it never reached PENDING.

## Actual cause

The **workflow engine v2 configuration was missing** from the affected database — `workflow_definitions_v2` had **0 rows**. Leave submission (`submitLeaveRequest` → `submitWorkflow('WF_ANNUAL_LEAVE')`) requires an active approval workflow to build the approval chain. With no definition found, the engine returned `No active workflow found for code: WF_ANNUAL_LEAVE` (`lib/workflow-engine.ts:499`), which `modules/absence/actions.ts:639` re-threw as `Workflow engine error: …`. The `catch` then called `translateError()` (`modules/absence/actions.ts:833`), which always re-throws (`lib/app-error.ts:585`); in production Next.js sanitised that thrown server-action error into the opaque "Server Components render" message — hiding the real cause.

The root reason the table was empty: the workflow seed (`drizzle/seed-workflow-v2.ts`) was **never run against this database**. Schema migrations and the employee data migration (persons, assignments, balances) had loaded fine, but workflow config — which the employee migration does **not** produce — was skipped.

## Misleading hypothesis (disproven)

The first hypothesis was a **missing / uninitialized leave balance** (`BALANCE_NOT_INITIALIZED`, `modules/absence/actions.ts:690`). This was **disproven by direct read-only inspection** of the database:

- s.khan **has** an active user account, person record (K952), and a current ACTIVE assignment with a line manager (K1207, Dorababu Kethari — active MANAGER).
- s.khan **has** a 2026 Annual Leave balance row (`closing_balance_days = 21.29`, `requires_balance = true`).

Balance was never the problem. The investigation then traced the failure to the empty `workflow_definitions_v2` table.

## Fix applied

Ran the **existing, idempotent** workflow seed against the affected Neon database:

```bash
npx tsx drizzle/seed-workflow-v2.ts
```

Result: 7 workflow rules, **12 workflow definitions** (incl. `WF_ANNUAL_LEAVE`), and their steps seeded. `WF_ANNUAL_LEAVE` now active with steps `LM_APPROVAL` (Line Manager, 48h) → `HOD_APPROVAL` (Head of Dept, 24h). No application code changed, no schema changed, no employee data touched, no balances modified.

## Lesson

**Workflow engine configuration is mandatory platform setup and is separate from the employee data migration.** It must be seeded — and verified — on **every** target database (UAT branch and production) *after* schema migrations and *before* employee migration / leave testing. This is now enforced as gate **G** in `08-migration-readiness-checklist.md` and as an explicit ordered step (step 5) in `07-production-cutover-and-rollback-strategy.md` §3.

## Canonical migration order (post-incident)

1. Apply schema migrations
2. **`npx tsx drizzle/seed-workflow-v2.ts`** ← the step that was skipped (verify per gate G)
3. **Insert the workflow system-actor person row** `22222222-2222-2222-2222-222222222222` (verify per gate G) — see addendum below
4. Reference/config seeds (absence types, etc.)
5. Employee data migration (persons, assignments, balances)
6. Leave-testing smoke check — submit Annual Leave end-to-end **AND approve through a multi-step chain** (confirms the Step 1 → Step 2 advance, the path that fails when step 3 above is skipped)

---

## Addendum (2026-06-05) — Second missing platform row: the workflow system actor

**Symptom:** After the workflow seed (above) was applied and single-step approval was certified, a **multi-step** Annual Leave workflow (Line Manager → HR Admin → CEO) failed **when the line manager approved** — error on `INSERT INTO workflow_audit_log … TOKEN_ISSUED …`.

**Actual cause:** The workflow engine stamps every *automatic* action (advancing to the next approver, SLA auto-approve/escalate, reminders) with a fixed **system identity** — person `22222222-2222-2222-2222-222222222222` ("AVANIIS Workflow Engine"). `workflow_audit_log.actor_person_id` has a foreign key to `persons.id`, and that row did not exist on the migrated DB → FK violation. The engine treats this actor as *virtual* (it resolves the name without a DB read), but the audit FK still requires the row to exist.

**Why it passed certification yet broke later:** A **single-step** workflow never advances to a next step, so the system-actor audit path is never exercised. Certification used a single-step config; the failure appeared only after the workflow was reconfigured to **multiple steps**. Same class of gap as the workflow seed — a platform-setup row not produced by the employee migration, invisible until a specific path runs.

**Fix applied:** Inserted one system-actor person row (flagged `is_system_user = true`, `exclude_from_headcount = true`, `is_active = false` so it never appears in directory/headcount/payroll) via the Neon SQL Editor. No application code changed, no schema changed, no employee data or balances touched.

**Related code fix (separate, deployed):** the bell vs. Approvals-menu notification inconsistency — approving via the Approvals menu (`takeWorkflowAction`) did not clear the approver's in-app notification, while the bell path did. `takeWorkflowAction()` now marks the acting approver's notification `ACTIONED` atomically with the decision, so the notification status matches the decision regardless of entry point.

**Lesson:** "Platform setup" includes **both** the workflow config seed **and** the system-actor person row. Both must exist and be verified on every target DB before employee migration / leave testing, and the smoke test must include a **multi-step** approval advance — a single-step test does not exercise the system-actor path. Enforced as gate **G** checks 6–7 in `08-migration-readiness-checklist.md`.


================================================================================
FILE [P2-04]: drizzle/migrations/0062_email_platform.sql
LINES: 192
================================================================================
-- 0062 — Enterprise Email Communication Platform foundation
--
-- Creates the provider-agnostic email platform tables so administrators can
-- configure Microsoft Graph API OR SMTP from Administration → Settings →
-- Communication Settings, and all modules send through the admin-selected
-- provider via the EmailService abstraction.
--
-- Tables:
--   email_provider_settings  — one active provider config per (tenant, entity)
--   email_sender_defaults    — per-tenant sender identities (module overrides)
--   email_templates          — reusable bilingual branded templates
--   email_messages           — outbound queue + delivery log (one row / email)
--   email_delivery_events    — append-only delivery lifecycle events
--
-- Secrets (Graph client secret, SMTP password) are stored AES-256-GCM encrypted
-- by the application (lib/encryption.ts) in the *_enc varchar(500) columns.
--
-- Approval-action tokens reuse the EXISTING workflow_email_tokens table — no new
-- token table is created here.
--
-- The audit_log.channel column is varchar(30) with NO check constraint, so the
-- new EMAIL_GRAPH / EMAIL_SMTP channel values need no DB change (TS-side only).
--
-- ⚠ Manual migration: drizzle/meta/_journal.json tracks only 0000–0039.
-- `pnpm drizzle-kit migrate` will NOT apply this file. Apply via the Neon
-- Console SQL Editor (see CLAUDE.md "Neon Migration Deployment Notes").
-- Idempotent: safe to re-run.

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE email_provider_type AS ENUM ('GRAPH_API', 'SMTP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE smtp_encryption_type AS ENUM ('NONE', 'SSL', 'TLS', 'STARTTLS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_test_status AS ENUM ('UNTESTED', 'PASSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_message_status AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_delivery_event_type AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'RETRY', 'BOUNCED', 'OPENED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── email_provider_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_provider_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  legal_entity_id          uuid,
  provider_type            email_provider_type NOT NULL,
  is_active                boolean NOT NULL DEFAULT false,

  graph_tenant_id          varchar(200),
  graph_client_id          varchar(200),
  graph_client_secret_enc  varchar(500),
  graph_sender_mailbox     varchar(320),
  graph_sender_name        varchar(200),
  graph_authority_url      varchar(500),
  graph_base_url           varchar(500),
  graph_mail_send_endpoint varchar(500),
  graph_scope              varchar(500),
  graph_use_shared_mailbox boolean NOT NULL DEFAULT false,

  smtp_host                varchar(255),
  smtp_port                integer,
  smtp_username            varchar(320),
  smtp_password_enc        varchar(500),
  smtp_encryption          smtp_encryption_type,
  smtp_sender_email        varchar(320),
  smtp_sender_name         varchar(200),
  smtp_auth_required       boolean NOT NULL DEFAULT true,

  reply_to_email           varchar(320),
  enable_tracking          boolean NOT NULL DEFAULT false,
  enable_workflow_actions  boolean NOT NULL DEFAULT true,
  token_expiry_minutes     integer NOT NULL DEFAULT 2880,
  retry_count              integer NOT NULL DEFAULT 3,
  retry_interval_sec       integer NOT NULL DEFAULT 300,

  last_tested_at           timestamptz,
  last_test_status         email_test_status NOT NULL DEFAULT 'UNTESTED',
  last_test_error          text,
  activation_override_reason text,

  created_by               uuid NOT NULL,
  created_by_name          varchar(200) NOT NULL,
  created_date             timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid,
  updated_by_name          varchar(200),
  last_updated_date        timestamptz,
  updated_date             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_provider_tenant ON email_provider_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_provider_active ON email_provider_settings (tenant_id, is_active);

-- ─── email_sender_defaults ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sender_defaults (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  legal_entity_id     uuid,
  default_from_name   varchar(200),
  default_from_email  varchar(320),
  default_reply_to    varchar(320),
  hr_sender           varchar(320),
  payroll_sender      varchar(320),
  workflow_sender     varchar(320),
  system_sender       varchar(320),
  announcement_sender varchar(320),
  fallback_sender     varchar(320),
  created_by          uuid NOT NULL,
  created_by_name     varchar(200) NOT NULL,
  created_date        timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  updated_by_name     varchar(200),
  last_updated_date   timestamptz,
  updated_date        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_sender_defaults_tenant ON email_sender_defaults (tenant_id);

-- ─── email_templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  template_code      varchar(80) NOT NULL,
  template_name      varchar(200) NOT NULL,
  subject_template   text NOT NULL,
  body_html_template text NOT NULL,
  body_text_template text,
  module             varchar(60) NOT NULL DEFAULT 'system',
  language_code      varchar(5) NOT NULL DEFAULT 'en',
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid NOT NULL,
  created_by_name    varchar(200) NOT NULL,
  created_date       timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  updated_by_name    varchar(200),
  last_updated_date  timestamptz,
  updated_date       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_templates_code ON email_templates (tenant_id, template_code, language_code);

-- ─── email_messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  provider_type        email_provider_type,
  template_code        varchar(80),
  module               varchar(60),
  recipient_email      varchar(320) NOT NULL,
  recipient_person_id  uuid,
  sender_email         varchar(320),
  subject              text,
  status               email_message_status NOT NULL DEFAULT 'QUEUED',
  business_object_type varchar(80),
  business_object_id   uuid,
  workflow_request_id  uuid,
  workflow_step_id     uuid,
  provider_message_id  varchar(255),
  correlation_id       uuid NOT NULL DEFAULT gen_random_uuid(),
  retry_count          integer NOT NULL DEFAULT 0,
  last_error           text,
  payload_json         jsonb,
  send_after           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  created_by           uuid NOT NULL,
  created_by_name      varchar(200) NOT NULL,
  created_date         timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  updated_by_name      varchar(200),
  last_updated_date    timestamptz,
  updated_date         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages (tenant_id, status, send_after);
CREATE INDEX IF NOT EXISTS idx_email_messages_object ON email_messages (business_object_type, business_object_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_workflow ON email_messages (workflow_request_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_correlation ON email_messages (correlation_id);

-- ─── email_delivery_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_delivery_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  email_message_id uuid NOT NULL,
  event_type       email_delivery_event_type NOT NULL,
  event_payload    jsonb,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_message ON email_delivery_events (email_message_id);


================================================================================
FILE [P2-05]: drizzle/migrations/0063_effective_dating_integrity.sql
LINES: 362
================================================================================
-- 0063_effective_dating_integrity.sql
-- Purpose: Phase 1 enterprise effective-dating database integrity foundations.
-- Scope: Phase 1 Steps 2-6 only: sentinel backfill/defaults, date-order checks, overlap exclusions, one-current indexes, and temporal lookup indexes.
-- Safety: Do not touch 0062_email_platform.sql, unrelated dirty files, applied historical migrations, or _PRODUCTION_SCHEMA_BUNDLE.sql.

CREATE EXTENSION IF NOT EXISTS btree_gist;


-- Step 2: standardize open-ended effective-dated rows on sentinel date.
-- Existing NULL open-ended rows are converted to 9999-12-31.
-- New open-ended rows default to 9999-12-31.

UPDATE worker_assignments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE worker_assignments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE salary_elements
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE salary_elements
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE payroll_assignments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE payroll_assignments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE work_schedule_assignments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE work_schedule_assignments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE leave_plan_enrolments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE leave_plan_enrolments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE grade_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE grade_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE department_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE department_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE location_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE location_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE job_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE job_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE position_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE position_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';


-- Step 3: date-order integrity checks.
-- These checks ensure every effective-dated range is internally valid.

ALTER TABLE worker_assignments
ADD CONSTRAINT chk_worker_assignments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE salary_elements
ADD CONSTRAINT chk_salary_elements_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE payroll_assignments
ADD CONSTRAINT chk_payroll_assignments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE work_schedule_assignments
ADD CONSTRAINT chk_work_schedule_assignments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE leave_plan_enrolments
ADD CONSTRAINT chk_leave_plan_enrolments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE grade_history
ADD CONSTRAINT chk_grade_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE department_history
ADD CONSTRAINT chk_department_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE location_history
ADD CONSTRAINT chk_location_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE job_history
ADD CONSTRAINT chk_job_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE position_history
ADD CONSTRAINT chk_position_history_date_order
CHECK (valid_from <= valid_to);


-- Step 4: overlap-prevention constraints.
-- These constraints prevent two timeline rows for the same business key from
-- being effective for the same calendar date.

ALTER TABLE worker_assignments
ADD CONSTRAINT excl_worker_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE salary_elements
ADD CONSTRAINT excl_salary_elements_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  assignment_id WITH =,
  payroll_id WITH =,
  element_code WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE payroll_assignments
ADD CONSTRAINT excl_payroll_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE work_schedule_assignments
ADD CONSTRAINT excl_work_schedule_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE leave_plan_enrolments
ADD CONSTRAINT excl_leave_plan_enrolments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  absence_plan_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE grade_history
ADD CONSTRAINT excl_grade_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  grade_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE department_history
ADD CONSTRAINT excl_department_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  department_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE location_history
ADD CONSTRAINT excl_location_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  location_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE job_history
ADD CONSTRAINT excl_job_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  job_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE position_history
ADD CONSTRAINT excl_position_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  position_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);


-- Step 5: one-current-row protection.
-- These partial unique indexes prevent duplicate current rows for each approved
-- effective-dated business key.

CREATE UNIQUE INDEX uq_worker_assignments_one_current
ON worker_assignments (tenant_id, person_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_payroll_assignments_one_current
ON payroll_assignments (tenant_id, person_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_work_schedule_assignments_one_current
ON work_schedule_assignments (tenant_id, person_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_leave_plan_enrolments_one_current
ON leave_plan_enrolments (tenant_id, person_id, absence_plan_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_grade_history_one_current
ON grade_history (tenant_id, grade_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_department_history_one_current
ON department_history (tenant_id, department_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_location_history_one_current
ON location_history (tenant_id, location_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_job_history_one_current
ON job_history (tenant_id, job_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_position_history_one_current
ON position_history (tenant_id, position_id)
WHERE is_current = true;


-- Step 6: temporal as-of lookup indexes.
-- These non-unique indexes support efficient point-in-time reads using
-- start <= :asOf AND end >= :asOf predicates.

CREATE INDEX idx_worker_assignments_asof
ON worker_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_salary_elements_asof
ON salary_elements (tenant_id, person_id, assignment_id, payroll_id, element_code, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_payroll_assignments_asof
ON payroll_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_work_schedule_assignments_asof
ON work_schedule_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_leave_plan_enrolments_asof
ON leave_plan_enrolments (tenant_id, person_id, absence_plan_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_grade_history_asof
ON grade_history (tenant_id, grade_id, valid_from DESC, valid_to);

CREATE INDEX idx_department_history_asof
ON department_history (tenant_id, department_id, valid_from DESC, valid_to);

CREATE INDEX idx_location_history_asof
ON location_history (tenant_id, location_id, valid_from DESC, valid_to);

CREATE INDEX idx_job_history_asof
ON job_history (tenant_id, job_id, valid_from DESC, valid_to);

CREATE INDEX idx_position_history_asof
ON position_history (tenant_id, position_id, valid_from DESC, valid_to);

-- Rollback SQL reference:
-- Do not drop btree_gist automatically. Other database objects may depend on it.
--
-- Step 6 rollback — temporal as-of lookup indexes:
-- DROP INDEX IF EXISTS idx_position_history_asof;
-- DROP INDEX IF EXISTS idx_job_history_asof;
-- DROP INDEX IF EXISTS idx_location_history_asof;
-- DROP INDEX IF EXISTS idx_department_history_asof;
-- DROP INDEX IF EXISTS idx_grade_history_asof;
-- DROP INDEX IF EXISTS idx_leave_plan_enrolments_asof;
-- DROP INDEX IF EXISTS idx_work_schedule_assignments_asof;
-- DROP INDEX IF EXISTS idx_payroll_assignments_asof;
-- DROP INDEX IF EXISTS idx_salary_elements_asof;
-- DROP INDEX IF EXISTS idx_worker_assignments_asof;
--
-- Step 5 rollback — one-current partial unique indexes:
-- DROP INDEX IF EXISTS uq_position_history_one_current;
-- DROP INDEX IF EXISTS uq_job_history_one_current;
-- DROP INDEX IF EXISTS uq_location_history_one_current;
-- DROP INDEX IF EXISTS uq_department_history_one_current;
-- DROP INDEX IF EXISTS uq_grade_history_one_current;
-- DROP INDEX IF EXISTS uq_leave_plan_enrolments_one_current;
-- DROP INDEX IF EXISTS uq_work_schedule_assignments_one_current;
-- DROP INDEX IF EXISTS uq_payroll_assignments_one_current;
-- DROP INDEX IF EXISTS uq_worker_assignments_one_current;
--
-- Step 4 rollback — overlap-prevention exclusion constraints:
-- ALTER TABLE position_history DROP CONSTRAINT IF EXISTS excl_position_history_no_overlap;
-- ALTER TABLE job_history DROP CONSTRAINT IF EXISTS excl_job_history_no_overlap;
-- ALTER TABLE location_history DROP CONSTRAINT IF EXISTS excl_location_history_no_overlap;
-- ALTER TABLE department_history DROP CONSTRAINT IF EXISTS excl_department_history_no_overlap;
-- ALTER TABLE grade_history DROP CONSTRAINT IF EXISTS excl_grade_history_no_overlap;
-- ALTER TABLE leave_plan_enrolments DROP CONSTRAINT IF EXISTS excl_leave_plan_enrolments_no_overlap;
-- ALTER TABLE work_schedule_assignments DROP CONSTRAINT IF EXISTS excl_work_schedule_assignments_no_overlap;
-- ALTER TABLE payroll_assignments DROP CONSTRAINT IF EXISTS excl_payroll_assignments_no_overlap;
-- ALTER TABLE salary_elements DROP CONSTRAINT IF EXISTS excl_salary_elements_no_overlap;
-- ALTER TABLE worker_assignments DROP CONSTRAINT IF EXISTS excl_worker_assignments_no_overlap;
--
-- Step 3 rollback — date-order check constraints:
-- ALTER TABLE position_history DROP CONSTRAINT IF EXISTS chk_position_history_date_order;
-- ALTER TABLE job_history DROP CONSTRAINT IF EXISTS chk_job_history_date_order;
-- ALTER TABLE location_history DROP CONSTRAINT IF EXISTS chk_location_history_date_order;
-- ALTER TABLE department_history DROP CONSTRAINT IF EXISTS chk_department_history_date_order;
-- ALTER TABLE grade_history DROP CONSTRAINT IF EXISTS chk_grade_history_date_order;
-- ALTER TABLE leave_plan_enrolments DROP CONSTRAINT IF EXISTS chk_leave_plan_enrolments_date_order;
-- ALTER TABLE work_schedule_assignments DROP CONSTRAINT IF EXISTS chk_work_schedule_assignments_date_order;
-- ALTER TABLE payroll_assignments DROP CONSTRAINT IF EXISTS chk_payroll_assignments_date_order;
-- ALTER TABLE salary_elements DROP CONSTRAINT IF EXISTS chk_salary_elements_date_order;
-- ALTER TABLE worker_assignments DROP CONSTRAINT IF EXISTS chk_worker_assignments_date_order;
--
-- Step 2 rollback — defaults and sentinel backfill reversal:
-- ALTER TABLE position_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE position_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE job_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE job_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE location_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE location_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE department_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE department_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE grade_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE grade_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE leave_plan_enrolments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE leave_plan_enrolments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE work_schedule_assignments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE work_schedule_assignments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE payroll_assignments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE payroll_assignments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE salary_elements ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE salary_elements SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE worker_assignments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE worker_assignments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';


================================================================================
FILE [P2-06]: drizzle/migrations/0064_worker_assignment_active_timeline.sql
LINES: 30
================================================================================
-- 0064_worker_assignment_active_timeline.sql
-- ED-UAT-002: cancelled/inactive worker assignment rows are retained for
-- audit/history, but must not participate in active timeline overlap checks.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE worker_assignments
DROP CONSTRAINT IF EXISTS excl_worker_assignments_no_overlap;

ALTER TABLE worker_assignments
ADD CONSTRAINT excl_worker_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
)
WHERE (assignment_status <> 'INACTIVE');

COMMENT ON CONSTRAINT excl_worker_assignments_no_overlap ON worker_assignments IS
  'ED-UAT-002: active worker assignment rows must not overlap; INACTIVE cancelled future rows are retained but excluded from active timeline enforcement.';

DROP INDEX IF EXISTS idx_worker_assignments_asof;

CREATE INDEX idx_worker_assignments_asof
ON worker_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date)
WHERE assignment_status <> 'INACTIVE';

COMMIT;


================================================================================
FILE [P2-07]: app/api/cron/future-dated-activation/route.ts
LINES: 68
================================================================================
/**
 * Future-Dated Assignment Activation Cron Endpoint.
 * Called by Vercel Cron at 00:05 UAE (vercel.json schedule).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server'
import { runFutureDatedActivation } from '@/lib/jobs/future-dated-activation'
import { logger } from '@/lib/logger'
import { startTimer, SLOW_JOB_MS } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-future-dated-activation', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t = startTimer()
  const reqId = request.headers.get('x-request-id') ?? undefined

  try {
    const result = await runFutureDatedActivation()
    const durationMs = t.elapsedMs()

    const logPayload = {
      reqId,
      durationMs,
      activationDate: result.activationDate,
      candidatesFound: result.candidatesFound,
      personsFound: result.personsFound,
      activated: result.activated,
      skipped: result.skipped.length,
      errors: result.errors.length,
    }

    if (durationMs > SLOW_JOB_MS) {
      logger.warn('cron-future-dated-activation', 'slow tick', logPayload)
    } else {
      logger.info('cron-future-dated-activation', 'tick complete', logPayload)
    }

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const durationMs = t.elapsedMs()
    const message = err instanceof Error ? err.message : String(err)
    logger.error('cron-future-dated-activation', 'tick fatal', {
      reqId,
      durationMs,
      error: message.slice(0, 300),
    })
    return NextResponse.json({ ok: false, error: message, durationMs }, { status: 500 })
  }
}

export const GET = run
export const POST = run


================================================================================
FILE [P2-08]: app/api/cron/email-dispatch/route.ts
LINES: 40
================================================================================
/**
 * Email Dispatch Cron Endpoint.
 * Delivers QUEUED email_messages rows through the admin-selected provider.
 * Called by Vercel Cron (vercel.json schedule).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * This fills the historical gap where queued notifications were never dispatched.
 * Sending is fully decoupled from the originating business transaction.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dispatchBatch } from '@/modules/communication'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-email-dispatch', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await dispatchBatch(50)
    logger.info('cron-email-dispatch', 'tick complete', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('cron-email-dispatch', 'tick failed', { error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const POST = run
// Allow GET so Vercel Cron (which issues GET) and manual checks both work.
export const GET = run


================================================================================
FILE [P2-09]: docs/AVANIIS-HR-REQUIREMENTS-AND-DESIGN-SPECIFICATION.md
LINES: 294
================================================================================
# AVANIIS HR — Requirements & Design Specification (SRS + SDD)

> **The foundational requirements & design document** on which the AVANIIS HR system was built.
> **Date:** 2026-06-04 · **Status:** Phase 1 MVP complete & QA-certified
> **Client:** Avaniis / Avaniis (UAE)
> **Production:** http://localhost:3001
> **Companion document:** `docs/qa-qc/hr-requirements-uae-labour-law-validation.md` (law-by-law compliance proof)

---

## Version History

| Version | Date | Author | Change summary |
|---|---|---|---|
| 1.0 (BASELINE) | 2026-06-04 | HR Systems team | Initial consolidated baseline — checkpoint established. Derived from live codebase + project-memory package. |

> **Change control:** This is the living baseline. Minor/factual updates amend this document and add a
> row above (bump the minor version). Major scope or law changes are first written as a dated addendum
> in `docs/requirements-changelog/` and then merged here on the next version bump. See the change-control
> note in the Business Requirements package README.

---

## 0. How to Read This Document

This is the single consolidated specification that answers three questions:

1. **What laws (and at what level) does the system implement?** → §2
2. **What UAE compliance is integrated, and how?** → §3
3. **What was built — functionally and architecturally?** → §4 (requirements) and §5 (design)

Every requirement and design claim is **traceable to source code** (file:line) so it can be
independently verified. This document was **reverse-derived from the live codebase and the
project-memory package** (`docs/project-memory/2026-06-04/`, 19 files) — it is the authoritative
basis statement, not a forward-looking wish list.

**Legal caveat:** This describes how the software implements UAE law. It is **not a legal opinion**.
Final compliance sign-off requires a licensed UAE labour-law advisor (see companion validation doc §5).

---

## 1. Product Overview

AVANIIS HR is an **AI-native, bilingual (English/Arabic), UAE-compliant Human Capital Management
(HCM) platform** covering the full employee lifecycle:

> Hiring → Onboarding → Core HR records → Org structure → Leave/Absence → Timesheets →
> Payroll (WPS/GPSSA/DEWS/EOSB) → Insurance → Letters → Offboarding → Reporting → AI assistant (ARIA)

**Defining characteristics (the non-negotiable product requirements):**

| # | Requirement | Why |
|---|---|---|
| P1 | Bilingual throughout — every user-facing field has `_en` **and** `_ar` | UAE business + government requirement |
| P2 | UAE Labour Law compliant — rules cited as `BR-xx` with statute references | Legal compliance |
| P3 | PII encrypted at field level (Emirates ID, passport, IBAN) | UAE PDPL (FDL 45/2021) |
| P4 | HR records never hard-deleted — effective-date pattern | Auditability / labour record-keeping |
| P5 | Every business write produces an immutable audit trail | Governance / dispute defence |
| P6 | Multi-jurisdiction aware (Mainland / DIFC / ADGM / Free-zone) | UAE entities span jurisdictions |

---

## 2. Legal Foundation — The Levels of Law Implemented

This directly answers *"what level laws are being implemented."* The system is built against **four
levels of UAE legal authority**, and is **jurisdiction-aware** (it routes rules differently per entity type).

### 2.1 The Four Levels of Law

| Level | Authority | Instrument(s) implemented | Where it lives in the system |
|---|---|---|---|
| **L1 — Federal labour statute** | UAE Federal Government | **Federal Decree-Law No. 33 of 2021** (UAE Labour Law, private sector) + Cabinet resolutions | Core HR, Absence, Payroll rules (`BR-xx`) |
| **L2 — Federal social/data statutes** | UAE Federal Government | **GPSSA Federal Law No. 7 of 1999** (pensions); **FDL No. 45 of 2021** (PDPL — data protection) | Payroll (GPSSA), PII encryption + consent fields |
| **L3 — Regulatory authority rules** | MOHRE, UAE Central Bank | **MOHRE WPS Regulations** (Wages Protection System / SIF file) | Payroll WPS module |
| **L4 — Free-zone jurisdiction law** | DIFC, ADGM | **DIFC Employment Law No. 2 of 2019**; DEWS scheme | Separate entitlement sets, `eosbScheme` routing |

### 2.2 Jurisdiction Awareness (a core design requirement)

The system is **not single-jurisdiction**. The `legal_entities.entityType` field drives different
legal rule sets:

| Entity type | EOSB scheme | Leave entitlements | Evidence |
|---|---|---|---|
| **MAINLAND** | TRADITIONAL (gratuity, FDL 33/2021) | Federal entitlements (30/90/60-day etc.) | `drizzle/seed.ts:356-561` |
| **DIFC** | DEWS / VSS | DIFC set (20 working-day annual, 65-day maternity, 60-day sick) | `drizzle/seed.ts:625-701` |
| **ADGM / FREEZONE** | DEWS / VSS | Free-zone variants | `legalEntities.entityType` enum |

Evidence: `legalEntities.entityType` enum = `MAINLAND, DIFC, ADGM, FREEZONE`; `eosbScheme` enum =
`TRADITIONAL, VSS, DEWS` (`docs/project-memory/2026-06-04/04-DATABASE-MODEL.md:135-136`).

### 2.3 Statutory Sources Cited in Code

- **Federal Decree-Law No. 33 of 2021** — Articles 9 (probation), 17/19/26/65 (hours/overtime/holidays),
  29–33 (leave), 43 (notice), 51–53 (EOSB). *Primary source.*
- **GPSSA Federal Law No. 7 of 1999** — pension contributions (UAE nationals).
- **MOHRE WPS Regulations** — Salary Information File (SIF) submission.
- **DIFC Employment Law No. 2 of 2019** — free-zone entitlements.
- **FDL No. 45 of 2021 (PDPL)** — personal-data protection (encryption + consent).

> **Currency note (must be reviewed by counsel):** Recent instruments **not yet mapped** —
> FDL 57/2023 (revised pensions), FDL 13/2022 (unemployment insurance / ILOE), FDL 9/2024 (amendments).
> See companion validation doc §5.

---

## 3. UAE Compliance Integration — How It Is Enforced

This answers *"what compliance is integrated to UAE level laws."* Compliance is not a document — it is
**enforced in running code** at four integration points:

### 3.1 The Governed Compliance Rules Engine

A dedicated `compliance_rules` table holds **law-cited, version-controlled, audit-logged** rules. Each
rule carries: `ruleId` (e.g. `BR-EOSB-001`), `articleRef` (the statute citation), a `formula` (the
actual numbers), `entityTypes`, `nationalityScope`, `effectiveDate`, and an `isOverridable` lock.

**Governance control (key legitimacy feature):** rules with `isOverridable: false` (annual-leave
minimum, EOSB formula, GPSSA, probation, overtime) **cannot be edited via the UI** — only via a code
migration with a documented law-change justification. Every change writes an immutable
`COMPLIANCE_RULE.UPDATED` audit event with a mandatory reason (min 10 chars), SUPER_ADMIN-gated.
Evidence: `modules/compliance/actions.ts:57-127`; seed at `drizzle/seed.ts:715-787`.

### 3.2 The Compliance Matrix (statute → system value)

| Domain | UAE Law | System rule + value | Evidence | Status |
|---|---|---|---|---|
| Annual leave 30 days/yr | FDL 33/2021 Art. 29 | `ANNUAL maxDaysPerYear: 30` | `seed.ts:356` | ✅ |
| Sick leave 90 days, tiered (15/30/45) | Art. 31 | `SICK 90, TIERED, after 3-mo` | `seed.ts:357,499` | ✅ |
| Maternity 60 days (45 full+15 half) | Art. 30 | `MATERNITY 60, full pay` | `seed.ts:358,517` | ✅ |
| Parental/Paternity 5 working days | Art. 32 | `PATERNITY 5 (BR-AL-005)` | `seed.ts:359,533` | ✅ |
| Bereavement / Hajj | Art. 33 | `BEREAVEMENT 5; HAJJ 30 once` | `seed.ts:360-361` | ✅ |
| Probation max 6 months, 14-day notice | Art. 9 | `BR-PR-001 max_months:6` (locked) | `seed.ts:768` | ✅ |
| Notice period 30–90 days | Art. 43 | `BR-NP-001 30/60/90` (overridable) | `seed.ts:758` | 🟡 policy |
| Overtime +25% / +50% | Art. 19 | `BR-OT-001 1.25 / 1.50` (locked) | `seed.ts:778` | 🟡 verify night-hours |
| EOSB 21→30 days/yr, cap 24 mo | Art. 51–53 | `BR-EOSB-001` (locked) | `seed.ts:718` | ✅ |
| EOSB pro-ration <5 yrs | Art. 51(3) | `BR-EOSB-002` 33/67/100% | `seed.ts:728` | ✅ |
| GPSSA 5% / 12.5% (nationals) | GPSSA 7/1999 | `BR-GPSSA-001` | `seed.ts:748` | 🔴 rate currency |
| WPS payment by 14th, SIF format | MOHRE WPS | `BR-WPS-001 day:14` | `seed.ts:738` | 🟡 SIF format |
| PII encryption + consent | PDPL 45/2021 | AES-256-GCM + `pdplConsentGiven` | `lib/encryption.ts`; persons table | ✅ |
| DIFC free-zone entitlements | DIFC Law 2/2019 | `BR-DIFC-005` separate set | `seed.ts:625-701` | ✅ |

*Full version with all rows: `docs/qa-qc/hr-requirements-uae-labour-law-validation.md` §3.*

### 3.3 Point-of-Enforcement Rules (`BR-xx` annotations)

~80 business rules are enforced inline at every transaction (e.g. `BR-SL-002` sick-cert from Day 1,
`BR-PH-003` public-holiday pay, `BR-NP-001` notice derivation). Each is a code comment + a guard at the
write path, so the rule is applied *where the data is written*, not just documented.

### 3.4 UAE-Specific Data Model Fields

The `persons` table carries UAE compliance fields natively: `emiratesId` (encrypted), `visaNumber`,
`visaType`, `visaExpiry`, `labourCardNumber`, `labourCardExpiry`, `nationalityCategory`
(`UAE_NATIONAL/GCC_NATIONAL/EXPAT` — drives GPSSA eligibility), `pdplConsentGiven`.
Evidence: `04-DATABASE-MODEL.md:41-57`.

---

## 4. Functional Requirements (What Was Built)

21 modules, ~121 pages. Status per `docs/project-memory/2026-06-04/15-VERIFIED-IMPLEMENTATION-MATRIX.md`.

| # | Module | Functional scope | Status |
|---|---|---|---|
| 1 | **Core HR** | Person master, positions, departments, contracts, worker assignments, bank details, dependents, documents, probation, exit clearance, bulk import | ✅ Verified |
| 2 | **Employee Self-Service (ESS)** | Profile, leave requests, payslips, documents, letters, insurance view, timesheet, ARIA chat, directory, bank details (19 routes) | ✅ Verified |
| 3 | **Leave / Absence** | Requests, balances, accrual engine, carry-forward, leave rules, blackout periods, public holidays, backdate policy, medical-cert upload | ✅ Verified |
| 4 | **Workflow Engine** | Configurable multi-step approvals: submit/approve/reject/delegate, SLA breach, escalation, hierarchy (LINE_MANAGER/POSITION/CUSTOM_GROUP), AND/OR conditions | ✅ Verified (collision-hardened) |
| 5 | **Approvals** | HR Admin inbox, instance detail, operations view, my-requests (ESS) | ✅ Verified |
| 6 | **Notifications** | In-app + email queue (Postgres outbox), preferences, topbar quick-actions | ✅ Verified |
| 7 | **Employee Letters** | Templates, bilingual PDF (jsPDF), XSS-sanitised, token-based e-signing, lifecycle | ✅ Verified |
| 8 | **Document Management** | Upload/download, 36-type taxonomy, cloud-portable storage (Azure/S3/local), signed URLs | 🟡 UAT (prod storage blocker) |
| 9 | **Master Data (MDM)** | Legal entities, departments, positions, grades, locations, business units, jobs, projects, work schedules, leave types, holiday calendars | ✅ Verified |
| 10 | **RBAC / Access** | 7-role matrix, feature permissions (view/create/edit/delete/approve/export), MFA step-up, user management | ✅ Verified |
| 11 | **Payroll** | UAE WPS runs, salary elements, EOSB, GPSSA/DEWS, suspension pay, run lifecycle (DRAFT→ARCHIVED) | 🟡 UAE depth to verify |
| 12 | **AI / ARIA** | Claude-powered chat, intent resolution, daily briefing, HR-admin AI console, RAG knowledge sources | ✅ Verified |
| 13 | **Insurance** | Medical plans, enrolment lifecycle, dependent visa, contractor exceptions, plan auto-change | ✅ Verified |
| 14 | **Timesheets** | Daily hours, overtime, Ramadan schedule, team/personal views | ✅ Verified |
| 15 | **Reports / Analytics** | Role-segmented dashboards (HR Admin/Manager/Director/Finance/Employee), insurance reports | ✅ Verified |
| 16 | **Audit Trail** | INSERT-only immutable log on every write | ✅ Verified |
| 17 | **Migration Factory V2** | 9-step data migration wizard + source ingestion (classify/transform/build) | 🟡 Partial |
| 18 | **DataOps Console** | SUPER_ADMIN SQL console, NL-to-SQL, schema browser | ✅ Verified |
| 19 | **Org Chart** | Interactive canvas, recursive hierarchy, hiring/transfer drawers, export | ✅ Verified |
| 20 | **Compliance (UAE Law)** | Governed `BR-xx` rules engine + compliance settings UI | ✅ Verified |
| 21 | **Settings / Config** | Appearance, custom fields, workflow templates, leave rules, branding, letter templates, currency, policy (16 sub-pages) | ✅ Verified |

*Detailed file/table inventory: `docs/project-memory/2026-06-04/02-MODULE-MAP.md`.*

---

## 5. System Design (How It Was Built)

### 5.1 Architecture Style
- **Next.js 15 App Router** with React Server Components + **Server Actions** as the primary RPC mechanism (no separate internal API layer).
- **Monolith** — all business logic in `modules/`, all UI in `app/` + `components/`. No microservices.
- **Background jobs** via `node-cron` + **Postgres outbox** pattern (no Redis/Kafka/BullMQ — explicitly rejected).
- **Multi-tenant ready, single-tenant deployed** (`tenant_id` on every table).

### 5.2 Technology Stack
| Layer | Tech | Version |
|---|---|---|
| Framework | Next.js | 15.3.9 |
| Runtime | React | 19.2.6 |
| Language | TypeScript (strict, 0 errors) | 5.5 |
| Database | PostgreSQL 16 (Neon, eu-central-1) | — |
| ORM | Drizzle ORM | 0.45.2 |
| Auth | Auth.js (next-auth) JWT | 5.0.0-beta.31 |
| SSO | Microsoft Entra ID (OIDC) | — |
| UI | Radix + shadcn/ui + Tailwind (token-based) | 3.4.4 |
| Org chart | @xyflow/react | 12.10.2 |
| AI | Anthropic Claude API | SDK 0.91.1 |
| PDF | jsPDF (LFI-patched) | 4.2.1 |
| Storage | Azure Blob / AWS S3 / local (abstracted) | — |
| Hosting | Vercel `fra1` (co-located with Neon) | — |

**Key performance decision:** Vercel function (`fra1`) and Neon DB (`eu-central-1`) are co-located in
AWS Frankfurt — DB latency <5ms vs ~80–100ms cross-region.

### 5.3 Data Model
- **109 `pgTable` definitions** across 11 schema files (`drizzle/schema/`).
- **Every table** carries `tenant_id` + 7 audit columns; **no hard deletes** (effective-date pattern).
- **PII** (`emirates_id`, `passport_number`, `iban`) = AES-256-GCM ciphertext.
- Core tables: `persons` (master), `positions`, `worker_assignments`, `departments`, `legal_entities`,
  `absence_entries`/`absence_balances`, `payroll_runs`/`eosb_calculations`/`gpssa_contributions`,
  `workflow_instances_v2`, `audit_log`, `compliance_rules`.
- *Full model: `docs/project-memory/2026-06-04/04-DATABASE-MODEL.md`.*

### 5.4 Security & Authorization
- **7 roles:** EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE, HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN.
- **Dual-layer RBAC:** `requireRole()` at every Server Action + `feature_permissions` matrix per feature×role.
- **MFA step-up** for HIGH_PRIVILEGE_ROLES (HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN), strict `mfaVerified === false` guard.
- **Middleware** routing backstop on role-gated path prefixes.
- 180/180 security tests pass.

### 5.5 Workflow Engine (design highlight)
Configurable approval engine with hybrid hierarchy (LINE_MANAGER / POSITION / CUSTOM_GROUP), AND/OR
condition trees, SLA calendars with breach actions (ESCALATE/AUTO_APPROVE/AUTO_REJECT/REMINDER/FREEZE),
group voting (ANY_ONE/MAJORITY/ALL/WEIGHTED), and an immutable workflow audit log. Collision-hardened
(5 transaction-boundary fixes + advisory locks). The **Approve / Reject / Delegate** 3-button decision
set is the canonical UI. Evidence: `lib/workflow-engine.ts`; `drizzle/schema/workflow-engine.ts`.

### 5.6 Non-Functional Requirements (NFRs)
| NFR | Requirement |
|---|---|
| Performance | DB co-location <5ms; dashboards parallelised (`Promise.all`); 6 telemetry thresholds |
| Security | PII encryption; MFA; CSP/secure cookies (pre-prod checklist); rate limiting (planned) |
| Auditability | INSERT-only audit on every write; immutable workflow audit |
| Bilingual | EN/AR mandatory; RTL configured |
| Reliability | Postgres outbox = at-least-once email; advisory locks prevent collisions |
| Testability | Vitest (unit/integration/chaos/security) + Playwright (14 E2E projects) + k6 load |

### 5.7 Architectural Constraints (ADR-001 — non-negotiable rules)
1. Every DB write = `db.transaction()` + `audit.log(tx, …)` in the same handle.
2. No hard deletes — effective-date pattern.
3. PII encrypted before persist.
4. Bilingual mandatory.
5. Server Action pattern: `auth()` → `requireRole()` → `Schema.parse()` → transaction+audit → `revalidatePath()`.
6. Cross-module imports only via `modules/*/index.ts` barrels.
7. CSS tokens only (no raw hex).
8. `tenant_id` on every insert.

---

## 6. Requirements Traceability (Where to Verify Anything)

| Layer | Location | Use |
|---|---|---|
| Law compliance proof | `docs/qa-qc/hr-requirements-uae-labour-law-validation.md` | Article-by-article validation |
| Governed rules | `compliance_rules` table / `drizzle/seed.ts:715` | Live law-cited rules |
| In-code rules | `BR-xx` across `modules/*`, `lib/*` | Point-of-enforcement |
| Module inventory | `docs/project-memory/2026-06-04/02-MODULE-MAP.md` | Files + tables per module |
| Verified status | `…/15-VERIFIED-IMPLEMENTATION-MATRIX.md` | Evidence-backed status |
| Data model | `…/04-DATABASE-MODEL.md` | Tables, enums, migrations |
| Architecture decisions | `…/18-ARCHITECTURAL-DECISIONS.md` | Why decisions were made |
| Known gaps | `docs/KNOWN_GAPS.md` | Outstanding items |

---

## 7. Open Items / Caveats (for Macy's awareness)

1. 🔴 **GPSSA rates** may predate FDL 57/2023 — configurable, needs a data refresh + legal confirm.
2. 🔴 **WPS SIF file format** not verified end-to-end — required before live payroll.
3. 🔴 **Unemployment Insurance (ILOE, FDL 13/2022)** not yet tracked.
4. 🔴 **FDL 9/2024 amendments** not yet mapped.
5. 🟡 **Production blockers** (document storage on `/tmp`, email not wired, WIP migrations 0055–0061 unapplied) — deployment readiness, not legal.

*Detail: companion validation doc §5 + `docs/KNOWN_GAPS.md`.*

---

*This specification is the consolidated basis of the AVANIIS HR system. It supersedes scattered
requirement notes by unifying the law foundation, compliance integration, functional scope, and system
design into one verifiable document.*
</content>

