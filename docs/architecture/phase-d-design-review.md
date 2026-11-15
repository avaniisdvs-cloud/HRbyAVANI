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
