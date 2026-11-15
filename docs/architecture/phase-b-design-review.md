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
