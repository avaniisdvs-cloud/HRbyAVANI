# AVANIIS HR — Workflow Engine Design
## Dynamic Approval Hierarchy Engine v2.0

**Status:** Design Complete — Awaiting Implementation Approval  
**Date:** 2026-05-01  
**Author:** Principal Engineer / HR Systems Architect  
**Version:** 2.0 (replaces Sprint 2 skeleton)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Benchmark Research & Comparison Matrix](#2-benchmark-research--comparison-matrix)
3. [Core Design Decisions](#3-core-design-decisions)
4. [Hybrid Hierarchy Model](#4-hybrid-hierarchy-model)
5. [Rule Engine Design](#5-rule-engine-design)
6. [Core Algorithms](#6-core-algorithms)
7. [Integration Patterns for All 12 Workflow Types](#7-integration-patterns-for-all-12-workflow-types)
8. [SLA & Calendar Engine](#8-sla--calendar-engine)
9. [UAE Compliance Constraints](#9-uae-compliance-constraints)
10. [Gaps Closed vs Current System](#10-gaps-closed-vs-current-system)

---

## 1. Executive Summary

The AVANIIS HR Workflow Engine v2.0 is a **configuration-driven, hybrid-hierarchy dynamic approval system** modelled on the best architectural patterns from Oracle HCM AME, Workday BPF, and SAP SuccessFactors EC Workflow.

### Design Philosophy

**Adding a new workflow type requires ONLY configuration — never code changes.**

The engine separates three concerns that current HR platforms often conflate:

| Concern | Where it lives | Who configures |
|---------|---------------|----------------|
| WHO approves | Hierarchy resolution algorithm | Fixed code |
| WHEN a step runs | Rule engine (condition trees) | HR Admin (UI) |
| WHAT chain to follow | Workflow definition + step config | HR Admin (UI) |

### Key Design Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hierarchy model | Hybrid (3 switchable types) | Mirrors Oracle AME + Workday BPF — handles both standard and position-based orgs |
| Rule evaluation | AND/OR condition trees, 40+ field paths | Matches SAP Business Rules richness; avoids single-field limitation of current schema |
| Approver resolution | Runtime (at submission) with immutable snapshot | Oracle AME approach — protects against mid-approval org changes |
| Vacancy handling | ESCALATE_UP → fallback → HR_ADMIN → block | Workday escalation policy model |
| SLA calculation | UAE working hours (Sun–Thu 09:00–18:00 GST) | FDL 33/2021 compliance + Ramadan override |
| Audit log | INSERT-ONLY, 7-year retention, RLS-protected | NFR-22, PDPL, SOX alignment |
| Delegation | Scope-limited (module/hierarchy), HR-approved | SAP substitution model + ServiceNow delegation |
| Step effects | ADD / REPLACE / INJECT / SKIP | Oracle AME List Modification Rules pattern |

---

## 2. Benchmark Research & Comparison Matrix

### 2.1 Oracle HCM Cloud — AME (Approval Management Engine)

**Architecture:** Transaction-driven rule composition. For each triggering event, AME evaluates a prioritized rule set and assembles an ordered approver list dynamically at runtime — no stored chains.

**Key patterns adopted for AVANIIS:**
- **Runtime list composition** — approver list built fresh at submission from live org data, then snapshotted immutably
- **Four rule types:** List Creation (generates approvers), Voting (resolution logic), Chain of Authority (traverse N levels until stopping condition), Substitution/Exception (override after list built)
- **Mixed hierarchy per transaction** — different rules can fire different hierarchy action types; results are merged. This is our "RULE_RESOLVED" hierarchy type.
- **FYI vs APPROVAL steps** — our NOTIFY step type maps directly to Oracle's FYI pattern
- **Parallel + serial within a single stage** — our `parallel_voting` enum on `workflow_steps`
- **Transaction Design Studio (TDS)** — our Workflow Builder admin UI is inspired by TDS's stage-based visual configuration

**Enterprise differentiators:** Full SOA interoperability, attribute-driven conditions with custom fast formulas, `Repeated Approver Rule` deduplication, complete BPM audit trail.

### 2.2 SAP SuccessFactors — EC Workflow + Business Rules

**Architecture:** MDF-native workflow objects attached to EC entities. Approval chain built from ordered steps referencing dynamic role tokens resolved at step execution (lazy — each step re-queries live data).

**Key patterns adopted for AVANIIS:**
- **Dynamic role tokens** — our `hierarchy_type` enum maps to SF role tokens: LINE_MANAGER = "Manager", POSITION = "Position Manager", ROLE_IN_ORG = "Custom Role"
- **Business Rules engine** — our condition tree JSON structure is inspired by SF's IF-THEN compound rule model with AND/OR operators
- **Simultaneous approval (parallel groups)** — our `parallel_voting: ANY_ONE | ALL_MUST | MAJORITY`
- **Substitution management** — our `workflow_delegations` table with scope + date range
- **Country-variant routing** — our `entity_id` scoping on workflow definitions enables per-legal-entity configuration

**Key difference from AVANIIS:** SF resolves approvers lazily (each step re-queries at execution). We resolve upfront at submission and snapshot — better auditability, less sensitive to org changes mid-approval.

### 2.3 Workday — Business Process Framework (BPF)

**Architecture:** Six step types (Action, Approval, Checklist, Review, Notify, Integration) with routing restrictions that narrow the eligible approver pool before role resolution.

**Key patterns adopted for AVANIIS:**
- **Step types** — our `step_type` enum (APPROVAL, REVIEW, NOTIFY, AUTO, PARALLEL_GROUP) maps directly
- **Routing restrictions** — our `activation_condition_id` FK to a rule that must be true for the step to activate
- **Condition rule library** — compound + nested conditions, same concept as Workday's reusable condition rules
- **Delegation vs proxy** — our delegation is scope-limited (not full proxy), matching Workday's distinction
- **Atomic commit** — our final AUTO step only commits downstream effects after final approval
- **Matrix org** — our ROLE_IN_DEPT hierarchy type handles cross-functional routing that bypasses supervisory hierarchy

**Key improvement over Workday:** We support per-step hierarchy type switching in a single workflow definition (Workday requires separate step config per relationship type).

### 2.4 ServiceNow — Flow Designer

**Architecture:** Trigger-Action-Subflow model. Approvals via "Ask for Approval" action with three policy types.

**Key patterns adopted for AVANIIS:**
- **Three approval policies** — ANY_ONE, ALL_MUST, MAJORITY maps to our `parallel_voting` and `approval_groups.voting_method`
- **Schedule-based SLA** — our `workflow_sla_calendars` table + `calculateSLADeadline()` function mirrors ServiceNow's `GlideSchedule.duration()` approach
- **Condition builder UI pattern** — our admin UI condition builder (Section 6.3 in WORKFLOW_ADMIN_UI_SPEC.md) directly references ServiceNow's row-based AND/OR grouping visual design
- **Dynamic approver tables** — our dynamic `approval_groups` with `dynamic_condition` JSONB mirrors ServiceNow's scripted lookup pattern

### 2.5 Additional Reference Patterns

**Camunda DMN tables:** Inspired our rule conditions being stored as structured JSONB (field + operator + value arrays) rather than hardcoded. A future export to DMN format is possible without schema changes.

**Appian BPMN 2.0:** XOR/AND/OR gateway patterns inspired our `step_effect` enum (NORMAL = sequential, PARALLEL_ADD = AND gateway, ADD_IF_MATCHES = XOR gateway with condition).

**UAE FDL 33/2021 compliance patterns (Bayzat model):**
- Leave type workflow branching per Article 29/30/32/28
- Medical certificate upload as mandatory pre-submit gate (Art. 30 sick leave)
- Hajj eligibility check (Art. 28 once-per-employment)
- Dual-language notifications (Arabic + English)
- WPS integration lock on payroll workflows

**Qiwa (Saudi) integration pattern:** Webhook-based status synchronization model — applies when AVANIIS is deployed in Saudi entities.

---

### 2.6 Comparison Matrix

| Feature | Oracle HCM AME | SAP SF EC | Workday BPF | ServiceNow | **AVANIIS v2.0** |
|---------|---------------|-----------|-------------|------------|-----------------|
| **Hierarchy types** | Supervisory + Position + Group | Manager + Position + Custom Role | Mgmt Chain + Position + Matrix | Dynamic query | **3 types: Line Manager + Position + Custom Group** |
| **Rule engine** | Attribute conditions, custom fast formulas | IF-THEN compound rules, AND/OR | Compound + nested conditions | Condition builder, scripted | **AND/OR trees, 40+ field paths, nested groups** |
| **Delegation** | BPM Worklist, rule-based | Proxy Management, admin override | Delegation Rules (scoped) | Date-bounded, scope | **Scope: ALL / BY_MODULE / BY_HIERARCHY, HR-approved** |
| **SLA enforcement** | Task-level timers, escalate/auto-approve | Step due dates + escalation | Due date offset + escalation action | Schedule-based + breach flow | **UAE working hours calendar, Ramadan override** |
| **Admin configurability** | Transaction Design Studio (TDS) | Admin Center, MDF | Workday UI (certified configurator) | Flow Designer (no-code) | **Workflow Builder + Condition Builder + Preview Tool** |
| **Parallel approval** | Parallel within stage (consensus/first) | simultaneousApproval step type | Any-one or all-must per step | Anyone/everyone/percent | **ANY_ONE / ALL_MUST / MAJORITY per step** |
| **Mobile approval** | Fusion mobile app | SF Mobile (iOS/Android) | Workday mobile | Teams/email adaptive cards | **One-click email links (signed JWT) + in-app** |
| **Hybrid hierarchy** | Mixed via multi-rule action types | Single hierarchy per step | Separate step per relationship | Not native | **Per-step hierarchy_type, switchable mid-workflow** |
| **Vacancy handling** | Escalate to supervisor or auto-approve | Admin override / auto-escalate | Escalation policy | Reassign via breach flow | **ESCALATE_UP → USE_FALLBACK → HR_ADMIN → BLOCK** |
| **Audit trail** | FND_MONITOR_INSTANCE + BPM audit | AuditLog entity (OData queryable) | Business Process History | sys_flow_context | **INSERT-ONLY 7-year RLS-protected audit_log** |
| **Immutable snapshot** | No — lazy re-evaluation | No — lazy per step | Pending transaction object | No | **YES — hierarchy_snapshot + context_snapshot at submit** |

---

## 3. Core Design Decisions

### Decision 1: Immutable Snapshot at Submission (vs Lazy Resolution)

**Choice:** Capture org hierarchy and request context at submission time. Store in `workflow_instances.hierarchy_snapshot` and `context_snapshot` (encrypted JSONB).

**Rationale:**
- Protects against mid-approval org changes (manager leaves, employee transfers)
- Enables HR Admin to see the full approval chain upfront before any step activates
- Provides deterministic audit trail — rules evaluated against known-good data
- Matches Oracle AME's "transaction attributes" model, not SAP's lazy per-step resolution

**Trade-off:** If the "right" approver changes mid-flight (e.g., new manager appointed), the workflow continues with the original resolved approver. HR Admin has a `switchHierarchyType()` escape hatch for exceptional cases.

### Decision 2: Three Hierarchy Types, Per-Step Switchable

**Choice:** Each step in a workflow can independently specify `hierarchy_type` from the seven supported types.

**Rationale:**
- A salary increment workflow legitimately needs Line Manager approval at Step 1, Position Hierarchy at Step 2 (formal org chart sign-off), and a Custom Group (Finance Committee) at Step 3
- Oracle AME achieves this via multi-rule action types; we make it explicit and per-step
- Avoids the Workday limitation of needing separate step definitions per relationship type

### Decision 3: Rule Engine as Condition Trees, Not Code

**Choice:** All routing logic expressed as JSONB condition arrays evaluated by a pure TypeScript evaluator. No hardcoded `if/else` in workflow code.

**Rationale:**
- Matches Camunda DMN philosophy — business rule changes = configuration change, not deployment
- HR Admin can modify leave approval thresholds without engineering involvement
- Conditions testable via the Hierarchy Preview Tool before going live

### Decision 4: Step Effects for Dynamic Chain Modification

**Choice:** Steps can have `step_effect` values: ADD_IF_MATCHES, REPLACE, SKIP_PREVIOUS, INJECT_BEFORE, INJECT_AFTER.

**Rationale:**
- Oracle AME's "List Modification Rules" (substitution/exception rules) are the most powerful pattern from the benchmark research
- Allows "insurance" rules: a base chain handles 80% of cases; edge-case rules inject/skip steps without rewriting the base chain

---

## 4. Hybrid Hierarchy Model

### 4.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3 — WORKFLOW-LEVEL OVERRIDES                         │
│  HR Admin sets: min/max levels, force hierarchy type,       │
│  per-step hierarchy override, on_vacancy policy             │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2 — RULE-BASED DYNAMIC EXTENSION                     │
│  Conditions ADD, REPLACE, INJECT, SKIP steps                │
│  Evaluated against immutable context snapshot               │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1 — BASE HIERARCHY (structural backbone)             │
│  LINE_MANAGER  │  POSITION  │  CUSTOM_GROUP                 │
│  (default)     │  (formal)  │  (cross-functional)           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Hierarchy Type Descriptions

#### Type A — LINE_MANAGER Hierarchy (Default)

Traverses `worker_assignments.line_manager_id` chain upward.

```
Employee
  └─► line_manager (N+1)
        └─► line_manager.line_manager (N+2)
              └─► ... 
                    └─► department_head (HOD, level -1)
                          └─► entity_head (level -2)
```

Level notation:
- `level: 1` = direct line manager (N+1)
- `level: 2` = N+2
- `level: 3` = N+3  
- `level: -1` = HOD (traverse until `departments.department_head_id` matches someone in the chain)
- `level: -2` = entity head (top of entity hierarchy)

**Used for:** Standard operations — leave, attendance correction, expense claims, most employee self-service.

**Vacancy handling:** If `line_manager_id` is null or the person is inactive → ESCALATE_UP (try `level + 1`).

**Self-approval prevention:** If resolved approver == initiator → automatically escalate to next level.

#### Type B — POSITION Hierarchy

Traverses `positions.reports_to_position_id` chain upward.

```
Employee's Position
  └─► reports_to_position (level 1)
        └─► reports_to_position.reports_to_position (level 2)
              └─► ...
```

At each position node: find the person currently holding that position via `worker_assignments WHERE position_id = X AND is_primary = true AND is_active = true`.

**Vacancy handling (position is empty):**
1. Check for acting role assignment (`worker_assignments.acting_for_position_id`)
2. If none → apply `on_approver_not_found` policy (default: ESCALATE_UP to next position)

**Used for:** Formal procurement approvals, policy-governed processes, cases where "CFO must approve" (the role) matters more than "John Smith must approve" (the person).

**Key difference from Line Manager:** Survives personnel changes — if the Finance Director changes, the workflow still routes to whoever holds that position.

#### Type C — CUSTOM_GROUP

Named groups defined by HR Admin in `approval_groups` table.

```
Group Types:
  STATIC  — fixed list of named persons
  DYNAMIC — evaluated at runtime from a condition expression
  HYBRID  — static members UNION dynamic expression results
```

Group voting methods: `ANY_ONE | ALL_MUST | MAJORITY | UNANIMOUS`

**Used for:** Cross-functional approvals, committee-style decisions, any case not derivable from org structure.

### 4.3 Extended Hierarchy Types (per-step)

| Type | Resolution |
|------|-----------|
| `LINE_MANAGER` | Traverse `line_manager_id` chain |
| `POSITION` | Traverse `positions.reports_to_position_id` chain |
| `CUSTOM_GROUP` | Load named `approval_groups` |
| `ROLE_IN_ORG` | All persons with `role = X` in same `entity_id` |
| `ROLE_IN_DEPT` | Person with `role = X` in same `department_id` |
| `NAMED_PERSON` | Specific `person_id` — escape hatch |
| `INITIATOR_SELF` | The initiating employee confirms (e.g., acknowledgement steps) |
| `RULE_RESOLVED` | Evaluate a rule that returns `{ hierarchyType, level, groupId }` |

### 4.4 Hybrid Routing Algorithm

At submission time, for each step in the workflow:

```
FUNCTION resolveStep(step, context, orgSnapshot):

  1. CHECK activation condition
     IF step.activationConditionId:
       result = evaluateRule(step.activationConditionId, context)
       IF !result.pass: mark step SKIPPED, record skip reason → CONTINUE

  2. CHECK step effects (SKIP_PREVIOUS, REPLACE)
     IF step.stepEffect == SKIP_PREVIOUS:
       find step at effect_target_step_order → mark it SKIPPED
     IF step.stepEffect == REPLACE:
       find step at effect_target_step_order → override its approver

  3. RESOLVE base approver from hierarchy_type
     approvers = resolveHierarchy(step.hierarchyType, step.level, context, orgSnapshot)

  4. CHECK delegation
     FOR each approver:
       delegation = findActiveDelegation(approver.id, step.module, today)
       IF delegation: swap approver with delegation.delegateId, log DELEGATION_APPLIED

  5. VALIDATE
     Remove any approver == initiator (never self-approve)
     IF no approvers remain: apply on_approver_not_found policy
     IF circular chain detected: escalate to HR_ADMIN

  RETURN resolved step with approver list, hierarchy type used, vacancy notes
```

#### Line Manager Resolution Detail

```
FUNCTION resolveLineManager(initiatorId, level, orgSnapshot):
  chain = orgSnapshot.lineManagerChain  // [N+1, N+2, N+3, ...]

  IF level >= 1:
    approver = chain[level - 1]
    IF !approver: HANDLE_VACANCY()
    IF approver.id == initiatorId: RETURN resolveLineManager(initiatorId, level+1)
    RETURN [approver]

  IF level == -1 (HOD):
    dept = getDepartment(initiator.departmentId)
    IF dept.departmentHeadId != null: RETURN [dept.departmentHeadId]
    // No explicit dept head — find first person in chain who heads any dept
    FOR each person in chain:
      IF person.isDepartmentHead: RETURN [person]
    // Still none: escalate
    RETURN getHRAdmin(entityId)

  IF level == -2 (Entity Head):
    RETURN orgSnapshot.entityHead
```

#### Position Hierarchy Resolution Detail

```
FUNCTION resolvePosition(initiatorId, level, orgSnapshot):
  position = orgSnapshot.initiatorPosition
  
  FOR i in 1..level:
    position = position.reportsToPosition
    IF !position:
      LOG POSITION_VACANT_ESCALATED
      APPLY on_approver_not_found policy
      BREAK

  holder = findPersonByPosition(position.id, today)
  IF !holder:
    LOG POSITION_VACANT_ENCOUNTERED { positionId, positionTitle }
    CASE on_approver_not_found:
      ESCALATE_UP  → resolvePosition(initiatorId, level+1, orgSnapshot)
      USE_FALLBACK → resolveLineManager(initiatorId, level, orgSnapshot)
      ASSIGN_HR_ADMIN → getHRAdmin(entityId)
      BLOCK_WITH_ERROR → throw WorkflowVacancyError(position.id)
  RETURN [holder]
```

---

## 5. Rule Engine Design

### 5.1 Condition Tree Structure

Rules are stored as JSONB arrays. The evaluator handles flat and nested condition groups.

```typescript
type Condition = SimpleCondition | GroupCondition

interface SimpleCondition {
  id: string
  field: string           // dot-path: 'leave.days', 'employee.grade_level'
  operator: Operator
  value: string | number | boolean | string[]
  dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ARRAY_STRING'
  group?: null            // top-level
}

interface GroupCondition {
  id: string
  type: 'GROUP'
  operator: 'AND' | 'OR'  // how conditions within this group combine
  conditions: Condition[]
}

type Operator =
  | 'EQUALS' | 'NOT_EQUALS'
  | 'GREATER_THAN' | 'LESS_THAN'
  | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL'
  | 'IN' | 'NOT_IN'
  | 'CONTAINS' | 'NOT_CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  | 'IS_NULL' | 'IS_NOT_NULL'
  | 'IS_TRUE' | 'IS_FALSE'
  | 'BETWEEN'     // value = [min, max]
  | 'REGEX_MATCH' // value = regex string
```

Top-level conditions are combined by `rule.logic_operator` (AND or OR).

### 5.2 Field Path Registry (40+ paths)

**Employee fields:**

| Path | Type | Example |
|------|------|---------|
| `employee.grade_code` | STRING | "G5", "M3" |
| `employee.grade_level` | NUMBER | 5, 7, 10 |
| `employee.department_id` | STRING | uuid |
| `employee.department.name` | STRING | "Architecture & Design" |
| `employee.entity_id` | STRING | uuid |
| `employee.nationality_iso3` | STRING | "ARE", "IND" |
| `employee.nationality_category` | STRING | UAE_NATIONAL / GCC / EXPAT |
| `employee.employment_type` | STRING | FULL_TIME / PART_TIME / TEMPORARY |
| `employee.service_months` | NUMBER | 24 |
| `employee.service_years` | NUMBER | 2.0 |
| `employee.probation_status` | STRING | ON_PROBATION / CONFIRMED |
| `employee.is_uae_national` | BOOLEAN | true / false |
| `employee.manager_levels_count` | NUMBER | 4 |

**Leave / absence fields:**

| Path | Type | Example |
|------|------|---------|
| `leave.type` | STRING | ANNUAL / SICK / MATERNITY / HAJJ |
| `leave.days` | NUMBER | 8 |
| `leave.working_days` | NUMBER | 6 |
| `leave.is_backdated` | BOOLEAN | false |
| `leave.backdated_days` | NUMBER | 0 |
| `leave.balance_remaining` | NUMBER | 14.5 |
| `leave.balance_pct_used` | NUMBER | 36.0 |
| `leave.start_month` | NUMBER | 6 (June) |
| `leave.spans_ramadan` | BOOLEAN | false |

**Salary fields:**

| Path | Type | Example |
|------|------|---------|
| `salary.increment_pct` | NUMBER | 8.5 |
| `salary.new_basic` | NUMBER | 25000 |
| `salary.current_basic` | NUMBER | 23000 |
| `salary.increment_aed` | NUMBER | 2000 |

**Travel fields:**

| Path | Type | Example |
|------|------|---------|
| `travel.destination_country` | STRING | "GBR" |
| `travel.is_international` | BOOLEAN | true |
| `travel.duration_days` | NUMBER | 7 |
| `travel.estimated_cost_aed` | NUMBER | 12000 |
| `travel.is_gcc_country` | BOOLEAN | false |

**Other fields:**

| Path | Type | Example |
|------|------|---------|
| `attendance.correction_type` | STRING | PUNCH_IN / PUNCH_OUT / BOTH |
| `attendance.missed_days` | NUMBER | 1 |
| `attendance.is_repeated` | BOOLEAN | true |
| `employment_action.type` | STRING | PROMOTE / TRANSFER / GRADE_CHANGE |
| `employment_action.salary_impact_pct` | NUMBER | 12.0 |
| `document.type` | STRING | "EMIRATES_ID" |
| `document.requires_notarization` | BOOLEAN | false |
| `request.is_first_of_type` | BOOLEAN | true |
| `request.submitted_day_of_week` | NUMBER | 0 (Sunday) |

### 5.3 Rule Evaluator Algorithm

```typescript
function evaluateRule(rule: WorkflowRule, context: WorkflowContext): RuleResult {
  const conditions = rule.conditions as Condition[]
  const passes = evaluateConditions(conditions, rule.logicOperator, context)
  
  return {
    result: passes,
    evaluatedConditions: conditions.map(c => ({
      conditionId: c.id,
      field: 'field' in c ? c.field : 'GROUP',
      passed: evaluateSingle(c, context),
      actualValue: 'field' in c ? getFieldValue(context, c.field) : undefined,
    }))
  }
}

function evaluateConditions(
  conditions: Condition[],
  logicOp: 'AND' | 'OR',
  context: WorkflowContext
): boolean {
  const results = conditions.map(c => evaluateSingle(c, context))
  return logicOp === 'AND' 
    ? results.every(Boolean)
    : results.some(Boolean)
}

function evaluateSingle(condition: Condition, context: WorkflowContext): boolean {
  if ('type' in condition && condition.type === 'GROUP') {
    return evaluateConditions(condition.conditions, condition.operator, context)
  }
  const actual = getFieldValue(context, condition.field)
  return applyOperator(actual, condition.operator, condition.value, condition.dataType)
}
```

---

## 6. Core Algorithms

### 6.1 Submit Workflow

```
FUNCTION submit(workflowCode, entityType, entityId, initiatorId, context):

  1. LOAD workflow definition by (workflowCode, entity) — must be isActive = true

  2. VALIDATE
     - Initiator has permission to submit this type
     - Run pre-submit guards (leave balance, hajj eligibility, medical cert, etc.)
     - If any guard fails: throw WorkflowPreSubmitError(guard, message)

  3. CAPTURE SNAPSHOTS (immutable, AES-256-GCM encrypted):
     hierarchySnapshot = {
       lineManager:     getPersonWithGrade(initiator.lineManagerId),
       lineManagerL2:   getPersonWithGrade(initiator.lineManagerId?.lineManagerId),
       lineManagerL3:   ... up to 5 levels,
       hod:             getDeptHead(initiator.departmentId),
       positionChain:   getPositionChain(initiator.positionId, 3 levels),
       entityHead:      getEntityHead(initiator.entityId),
       hrAdmins:        getPersonsWithRole('HR_ADMIN', initiator.entityId),
     }
     contextSnapshot = {
       employee: fullPersonProfile(initiatorId),
       request:  fullRequestDetails(entityType, entityId),
     }

  4. BUILD RESOLVED STEP CHAIN:
     steps = getStepDefinitions(workflowDefId) // ordered by step_order
     resolvedChain = []

     FOR each step (step_order ASC):
       a. Evaluate activation_condition_id (if set)
          → SKIPPED with reason if condition fails

       b. Apply step effects (ADD_IF_MATCHES, REPLACE, INJECT, SKIP_PREVIOUS)

       c. Resolve approver via resolveHierarchy(
            step.hierarchyType, step.level,
            { groupId, role, personId, ruleId },
            initiatorId, entityId, context, orgSnapshot
          )

       d. Check delegation for each resolved approver
          → swap with active delegate if found

       e. Push to resolvedChain with status:
          first non-skipped step → ACTIVE
          remaining non-skipped  → PENDING
          skipped steps          → SKIPPED

  5. CREATE RECORDS (single transaction):
     instance = INSERT workflow_instances {
       status: IN_PROGRESS,
       hierarchySnapshot, contextSnapshot,
       resolvedSteps: resolvedChain (JSONB preview),
       slaDeadline: calculateSLADeadline(now(), firstStep.slaHours, calendar)
     }
     FOR each step in resolvedChain:
       INSERT workflow_instance_steps { status, assignedTo, slaDeadline, ... }

  6. ACTIVATE FIRST STEP:
     SET first_step.status = ACTIVE
     SET first_step.activated_at = now()
     SET first_step.sla_deadline = calculateSLADeadline(now(), step.slaHours, calendar)

  7. NOTIFY:
     FOR each approver in first step:
       generateSignedEmailActionLinks(stepId, approverId, step.slaDeadline)
       sendNotification(approver, template, { actionLinks, ... })

  8. AUDIT:
     INSERT audit: SUBMITTED { full context }
     INSERT audit: STEP_ACTIVATED { stepId, approverId, hierarchyType }
     INSERT audit: HIERARCHY_RESOLVED { type, level, resolvedPerson, vacanciesEncountered }

  9. RETURN instance + resolvedChain preview
```

### 6.2 Take Action

```
FUNCTION takeAction(instanceStepId, actorId, action, comments, delegateToId):

  1. LOAD step — must be ACTIVE, actor must be assigned_to OR group member

  2. VALIDATE:
     - Actor is authorized (assigned_to_id OR resolved_approver_ids contains actorId)
     - Action is in step.actions_available
     - IF action requires comment (step.requires_comment_on contains action):
       comments must not be empty
     - IF action == DELEGATE: delegateToId must be set and not == actorId

  3. RECORD DECISION:
     UPDATE step: { action, action_taken_at, action_taken_by_id, comments }

  4. ROUTE:
     CASE action:
       APPROVE:
         SET step.status = APPROVED, step.completed_at = now()
         nextStep = findNextActiveStep(instance)
         IF nextStep:
           ACTIVATE nextStep (set status ACTIVE, sla_deadline, notify)
         ELSE:
           ALL steps complete → SET instance.status = APPROVED
           EXECUTE downstream effects (deduct balance, send confirmation, etc.)
         AUDIT: APPROVED + STEP_ACTIVATED (if next step)

       REJECT:
         SET step.status = REJECTED
         SET instance.status = REJECTED, rejected_at, rejection_reason
         NOTIFY initiator (rejection notification with approver comments)
         AUDIT: REJECTED

       SEND_BACK:
         SET step.status = SEND_BACK
         REACTIVATE step at target (step_order = 1 or specified)
         NOTIFY targeted approver "Sent back for review"
         AUDIT: SEND_BACK

       REQUEST_INFO:
         SET instance.status = PENDING_INFO
         NOTIFY initiator "Additional information requested"
         AUDIT: REQUEST_INFO_SENT

       DELEGATE:
         SET step.is_delegated = true
         SET step.original_approver_id = actorId
         SET step.delegated_to_id = delegateToId
         NOTIFY delegateToId "Delegated approval task"
         AUDIT: DELEGATED

  5. RETURN updated step
```

### 6.3 SLA Breach Processing (Cron)

```
FUNCTION processSLABreaches():
  now = new Date()

  // Find all active steps past SLA deadline
  breachedSteps = query: workflow_instance_steps
    WHERE status = ACTIVE
    AND sla_breached = false
    AND sla_deadline < now

  FOR each step:
    SET step.sla_breached = true, step.sla_breached_at = now
    AUDIT: SLA_BREACHED

    CASE step.on_sla_breach:
      ESCALATE:
        escalationApprover = resolveHierarchy(
          step.escalation_hierarchy_type,
          step.escalation_level,
          context
        )
        SET step.status = ESCALATED
        ACTIVATE new step (cloned from current, assigned to escalationApprover)
        AUDIT: ESCALATED { originalApprover, escalatedTo, reason: 'SLA_BREACH' }

      AUTO_APPROVE:
        takeAction(step.id, SYSTEM_ACTOR, APPROVE, 'Auto-approved: SLA breach')
        AUDIT: AUTO_APPROVED { reason: 'SLA_BREACH' }

      AUTO_REJECT:
        takeAction(step.id, SYSTEM_ACTOR, REJECT, 'Auto-rejected: SLA breach')
        AUDIT: AUTO_REJECTED { reason: 'SLA_BREACH' }

      NOTIFY_ONLY:
        sendNotification(step.assignedToId, 'SLA_BREACHED', { stepDetails })
        sendNotification(stepManagerId, 'APPROVER_OVERDUE', { stepDetails })

  RETURN { processed: breachedSteps.length, escalated, autoApproved, autoRejected }
```

---

## 7. Integration Patterns for All 12 Workflow Types

### WF-001 — Annual Leave
- **Trigger:** `absence_entries.submitted WHERE leave.type = 'ANNUAL'`
- **Pre-submit guards:** balance check, probation check, overlap check
- **Steps:** Line Manager (N+1) → HOD if `leave.days > 7 OR grade >= 7 OR backdated OR balance_pct > 80` → HR Admin if `leave.days > 14 OR type IN [MATERNITY, PATERNITY, HAJJ, STUDY]` → Auto (deduct balance, calendar block)

### WF-002 — Backdated Hire
- **Trigger:** `persons.created WHERE hire_date < today - 30`
- **Initiator note:** Initiator = HR Admin who created the record (not the new employee)
- **Steps:** HR Admin's Line Manager → HR_HOD (always)
- **On Approve:** employee status PENDING_APPROVAL → ACTIVE

### WF-003 — Salary Increment
- **Trigger:** compensation change event
- **Steps:** Line Manager → HOD if `increment_pct > 5 OR new_basic > 20000` → HR Admin (always) → Finance if `new_basic > 30000 OR increment_pct > 15` → Executive if `new_basic > 50000 OR increment_pct > 20`

### WF-004 — Document of Record
- **Trigger:** document upload requiring verification
- **Steps:** HR Admin (verify + approve) → Legal if `document.requires_notarization`

### WF-005 — Attendance Correction
- **Trigger:** attendance correction request
- **Auto-approve SLA:** cannot block time-sensitive corrections
- **Steps:** Line Manager (24h, auto-approve on breach) → HR Admin if `correction_type = BOTH OR missed_days > 3 OR is_repeated`

### WF-006 — Business Travel / Meeting
- **Trigger:** travel request submitted
- **Steps:** Line Manager → Finance if `cost > 5000 OR is_international` → HOD if `duration > 5 OR (international AND NOT gcc)` → Executive if `cost > 20000 OR duration > 14`

### WF-007 — Employment Action (Promote / Transfer / Grade Change)
- **Trigger:** employment action event
- **Hierarchy switch at Step 2:** POSITION hierarchy for formal org chart approval of grade/title changes
- **Steps:** Line Manager → Position N+2 if `type IN [PROMOTE, GRADE_CHANGE]` → HR Admin (always) → Finance if `salary_impact_pct > 10`

### WF-008 — Probation Confirmation
- **Trigger:** employee.probation_end_date approaching (30 days before)
- **Steps:** Line Manager (confirm/extend/terminate recommendation) → HR Admin (process)

### WF-009 — Resignation / Offboarding
- **Trigger:** resignation submitted
- **Steps:** HR Admin acknowledgement → Department clearance checklist (PARALLEL_GROUP) → Finance (EOSG calculation sign-off) → IT (access revocation AUTO step)

### WF-010 — Overtime Pre-Approval
- **Trigger:** overtime request
- **Pre-submit guard:** check annual_ot_hours_used < 144 (BR-OT-003)
- **Steps:** Line Manager (48h) → HR Admin if `ot_hours_this_month > 20`

### WF-011 — Bank Details Change (PII)
- **Pre-submit:** step-up authentication (re-authenticate before workflow starts)
- **Steps:** HR Admin (always — PII change) → Finance/Payroll Manager (always)
- **On Approve:** effective after NEXT payroll run (not immediately). Warning shown.

### WF-012 — System Access Request
- **Trigger:** role assignment request
- **Steps:** Line Manager → HR Admin if `role IN [HR_ADMIN, PAYROLL_MANAGER, EXECUTIVE]` → IT/System Admin (always)

### Additional Workflows Required

| Code | Name | Module | Trigger |
|------|------|--------|---------|
| WF-013 | Sick Leave | LEAVE | absence type = SICK |
| WF-014 | Emergency Leave | LEAVE | absence type = EMERGENCY |
| WF-015 | Maternity Leave | LEAVE | absence type = MATERNITY |
| WF-016 | Paternity Leave | LEAVE | absence type = PATERNITY |
| WF-017 | Hajj Leave | LEAVE | absence type = HAJJ |
| WF-018 | Study Leave | LEAVE | absence type = STUDY |
| WF-019 | Unpaid Leave | LEAVE | absence type = UNPAID |
| WF-020 | Medical Certificate Verification | LEAVE | sick leave > 2 days |
| WF-021 | End-of-Service Gratuity | OFFBOARDING | termination approved |
| WF-022 | Contract Amendment | CORE_HR | contract change |
| WF-023 | Nursing Break Registration | CORE_HR | nursing break request |

---

## 8. SLA & Calendar Engine

### 8.1 UAE Working Hours Calendar

```
Default calendar (workflow_sla_calendars):
  work_days:       [SUN, MON, TUE, WED, THU]
  work_start_hour: 9   (09:00 GST)
  work_end_hour:   18  (18:00 GST)
  timezone:        Asia/Dubai (UTC+4)
  
  Ramadan override:
  ramadan_enabled:  true
  ramadan_end_hour: 14  (14:00 GST during Ramadan)
```

UAE public holidays are stored in `public_holidays` table (already implemented). SLA calculation skips public holidays in addition to weekends.

### 8.2 calculateSLADeadline Algorithm

```
FUNCTION calculateSLADeadline(startTime, slaWorkingHours, calendar):
  remaining = slaWorkingHours
  current   = startTime  // timestamptz in Asia/Dubai

  WHILE remaining > 0:
    IF NOT isWorkingDay(current, calendar):
      current = nextWorkingDayStart(current, calendar)
      CONTINUE

    dayStart = setTime(current, calendar.workStartHour)
    dayEnd   = getEffectiveDayEnd(current, calendar)  // Ramadan-aware
    
    IF current < dayStart: current = dayStart
    IF current >= dayEnd:
      current = nextWorkingDayStart(current, calendar)
      CONTINUE

    hoursRemaining = hoursBetween(current, dayEnd)
    
    IF remaining <= hoursRemaining:
      RETURN addHours(current, remaining)  // Lands within this working day
    ELSE:
      remaining -= hoursRemaining
      current = nextWorkingDayStart(current, calendar)

  RETURN current

FUNCTION getEffectiveDayEnd(date, calendar):
  IF calendar.ramadanEnabled AND isRamadanDate(date):
    RETURN setTime(date, calendar.ramadanEndHour)  // 14:00
  RETURN setTime(date, calendar.workEndHour)  // 18:00

FUNCTION nextWorkingDayStart(current, calendar):
  next = addDays(current, 1)
  WHILE NOT isWorkingDay(next, calendar) OR isPublicHoliday(next):
    next = addDays(next, 1)
  RETURN setTime(next, calendar.workStartHour)
```

**Example:** Leave request submitted Thursday 2026-05-28 at 17:30 GST. SLA = 48 working hours.
- Thursday 17:30 → 18:00 = 0.5h working time consumed
- Friday/Saturday = non-working days, skipped
- Sunday 09:00 → 18:00 = 9h working time
- Monday 09:00 → 18:00 = 9h working time
- Tuesday 09:00 → 09:30 = 0.5h → **SLA deadline: Tuesday 09:30 GST**

### 8.3 Cron Jobs

| Cron | Frequency | Function |
|------|-----------|---------|
| SLA breach processor | Every 15 min | `processSLABreaches()` — escalate/auto-approve/notify |
| SLA reminder sender | Every hour | `sendSLAReminders()` — 24h before deadline |
| Daily digest | 06:00 GST daily | `generateApproverDigest()` — "You have N pending" |
| Delegation expiry | 00:00 GST daily | `checkDelegationExpiry()` — deactivate expired records |
| Ramadan detector | Annual (pre-scheduled) | Update SLA calendar end hours for Ramadan period |

---

## 9. UAE Compliance Constraints

### 9.1 Pre-Submit Guards (Hard Blocks — run before workflow creation)

| Guard | Rule | Error Code |
|-------|------|------------|
| Annual leave balance | balance_remaining - requested_days >= 0 (unless HR override) | BR-AL-001 |
| Probation annual leave | employee.probation_status == CONFIRMED | BR-AL-002 |
| Sick leave certificate | if leave.days > 2: medical certificate must be uploaded | BR-SL-002 |
| Hajj eligibility | !employee.hajjTakenAtThisEmployer | BR-HJ-002 |
| Paternity window | birth_date + 6 months >= today | BR-PL-002 |
| Overtime annual cap | ot_hours_this_year + requested_hours <= 144 | BR-OT-003 |
| Self-approval | initiator != any resolved approver | SYSTEM |
| Maternity termination | if leave.type = MATERNITY: BLOCK termination workflows | BR-ML-003 |
| Sick leave termination | if leave.days < 90: BLOCK termination workflows | BR-SL-004 |

### 9.2 Audit Requirements (NFR-22)

```sql
-- PostgreSQL RLS policy on workflow_audit_log:
CREATE POLICY audit_log_insert_only ON workflow_audit_log
  FOR ALL
  USING (false)
  WITH CHECK (true);

-- Separate insert-only policy:
CREATE POLICY audit_log_can_insert ON workflow_audit_log
  FOR INSERT WITH CHECK (true);

-- Result: DELETE and UPDATE are denied for ALL users including superuser
-- (unless RLS is bypassed — monitor for pg_bypass_rls privilege grants)
```

7-year retention enforced via `pg_partman` monthly partitions with automated archival.

### 9.3 Data Privacy (PDPL)

- `workflow_instances.hierarchy_snapshot` — encrypted at rest (AES-256-GCM, same key as Emirates ID fields)
- `workflow_instances.context_snapshot` — encrypted at rest
- Access guard: only `HR_ADMIN` and `SUPER_ADMIN` roles may read snapshot fields via server actions
- PII fields stripped from notification templates (no Emirates ID numbers in email bodies)

---

## 10. Gaps Closed vs Current System

| Gap | Current State | v2.0 Solution |
|-----|--------------|---------------|
| Hierarchy types | ROLE only | 3 types: LINE_MANAGER + POSITION + CUSTOM_GROUP |
| Condition engine | Single-field flat | AND/OR trees, 40+ field paths, nested groups |
| Step activation | Not implemented | Rule-based per-step activation conditions |
| SLA calculation | Wall-clock `now() + 48h` | UAE working hours calendar (Sun–Thu 09:00–18:00) |
| Hierarchy snapshot | None | Immutable encrypted snapshot at submission |
| Context snapshot | None | Full employee + request context at submission |
| Vacancy handling | None | ESCALATE_UP → fallback → HR_ADMIN → BLOCK |
| Approval groups | None | Static / Dynamic / Hybrid with voting methods |
| Delegation scope | Basic (scopeTypes array) | BY_MODULE / BY_HIERARCHY_TYPE, HR-approved |
| Workflow types | 1 partial (WF-002) | 12 core + 11 additional configured as seed data |
| Audit log | General audit_log | Workflow-specific INSERT-ONLY, 7-year retention |
| Admin UI | None | Workflow Builder + Condition Builder + Preview Tool |
| Approval inbox | None | Unified pending approvals page with SLA indicators |
| Pre-submit guards | Some in absence module | Centralized guard registry, all 12 types covered |
| Parallel approval | Not supported | PARALLEL_GROUP step type with voting methods |
| Step effects | Not supported | ADD / REPLACE / INJECT / SKIP patterns |
| Rejection transparency | N/A | Full resolved chain shown to employee with skip reasons |
