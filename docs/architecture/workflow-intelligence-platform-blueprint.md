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