# AVANIIS HR — Workflow Engine Data Model
## Drizzle ORM TypeScript Schema Definitions

**Status:** Design — Not yet migrated  
**Date:** 2026-05-01  
**Dependencies:** foundation.ts (persons, positions, departments, legal_entities, worker_assignments)

---

## Overview

This document defines all 12 new tables for the Workflow Engine v2.0.  
These replace and extend the existing Sprint 2 skeleton tables:
- `workflow_definitions` — extended (new columns added)
- `workflow_stages` — replaced by `workflow_steps` (richer hierarchy config)
- `workflow_routing_rules` — replaced by `workflow_rules` (condition trees)
- `workflow_instances` — extended (snapshots, resolved steps)
- `approval_delegations` — extended (scope enum, circular chain validation)

New tables:
- `approval_hierarchy_configs`
- `approval_groups`
- `approval_group_members`
- `workflow_instance_steps`
- `workflow_sla_calendars`
- `workflow_audit_log`
- `notification_templates`

---

## Schema Definitions

```typescript
/**
 * AVANIIS HR — Workflow Engine v2.0 Data Model
 * Drizzle ORM TypeScript schema definitions
 * 
 * Import after: foundation.ts, configuration.ts
 * 
 * Tables (12):
 *   1.  approval_hierarchy_configs
 *   2.  approval_groups
 *   3.  approval_group_members
 *   4.  workflow_definitions_v2    (replaces workflow_definitions)
 *   5.  workflow_steps             (replaces workflow_stages)
 *   6.  workflow_rules             (replaces workflow_routing_rules)
 *   7.  workflow_instances_v2      (replaces workflow_instances)
 *   8.  workflow_instance_steps    (new — replaces approvalChainJson)
 *   9.  workflow_delegations       (replaces approval_delegations)
 *   10. workflow_sla_calendars
 *   11. workflow_audit_log
 *   12. notification_templates
 */

import {
  pgTable, pgEnum,
  uuid, varchar, text, boolean, integer,
  timestamp, date, jsonb, inet,
  uniqueIndex, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { legalEntities, persons, departments } from './foundation'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers ────────────────────────────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const auditFull = () => ({
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }),
  createdBy:   uuid('created_by').notNull(),
  updatedBy:   uuid('updated_by'),
})

// ─── Enums ─────────────────────────────────────────────────────────────────

export const workflowModuleEnum = pgEnum('workflow_module', [
  'LEAVE', 'CORE_HR', 'ATTENDANCE', 'TRAVEL', 'PAYROLL', 'ACCESS', 'OTHER',
])

export const hierarchyTypeEnum = pgEnum('hierarchy_type', [
  'LINE_MANAGER',    // traverse line_manager_id chain
  'POSITION',        // traverse positions.reports_to_position_id chain
  'CUSTOM_GROUP',    // use a named approval_group
  'ROLE_IN_ORG',     // any person with role X in same entity
  'ROLE_IN_DEPT',    // person with role X in same department
  'NAMED_PERSON',    // specific person_id — escape hatch
  'INITIATOR_SELF',  // initiating employee confirms/acknowledges
  'RULE_RESOLVED',   // evaluate a rule to determine type + target
])

export const stepTypeEnum = pgEnum('step_type', [
  'APPROVAL',        // requires human approve/reject action
  'REVIEW',          // read-only acknowledgement
  'NOTIFY',          // FYI — non-blocking notification
  'AUTO',            // system-executed action (deduct balance, etc.)
  'PARALLEL_GROUP',  // fan-out to multiple approvers simultaneously
])

export const stepEffectEnum = pgEnum('step_effect', [
  'NORMAL',          // standard sequential step
  'ADD_IF_MATCHES',  // inject this step if its activation condition matches
  'REPLACE',         // replace approver of target step
  'SKIP_PREVIOUS',   // skip the step at effect_target_step_order
  'INJECT_BEFORE',   // insert this step before target step order
  'INJECT_AFTER',    // insert this step after target step order
  'PARALLEL_ADD',    // add to an existing parallel group
])

export const slaBreach​ActionEnum = pgEnum('sla_breach_action', [
  'ESCALATE',        // reassign to escalation_hierarchy_type + escalation_level
  'AUTO_APPROVE',    // system approves without human action
  'AUTO_REJECT',     // system rejects
  'NOTIFY_ONLY',     // send notification, no state change
])

export const onApproverNotFoundEnum = pgEnum('on_approver_not_found', [
  'ESCALATE_UP',     // try next level up in same hierarchy
  'USE_FALLBACK',    // switch to fallback_hierarchy
  'ASSIGN_HR_ADMIN', // default to HR Admin for entity
  'BLOCK_WITH_ERROR',// throw error, do not create instance
])

export const workflowStatusEnum = pgEnum('workflow_status', [
  'DRAFT',
  'IN_PROGRESS',
  'PENDING_INFO',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'WITHDRAWN',
  'AUTO_APPROVED',
  'ESCALATED',
])

export const stepStatusEnum = pgEnum('step_status', [
  'PENDING',    // not yet active
  'ACTIVE',     // awaiting action
  'APPROVED',
  'REJECTED',
  'SKIPPED',    // activation condition not met
  'DELEGATED',  // reassigned to delegate
  'ESCALATED',  // SLA breach escalation
  'CANCELLED',
])

export const stepActionEnum = pgEnum('step_action', [
  'APPROVE',
  'REJECT',
  'SEND_BACK',
  'REQUEST_INFO',
  'DELEGATE',
])

export const votingMethodEnum = pgEnum('voting_method', [
  'ANY_ONE',    // first approval advances
  'ALL_MUST',   // all must approve
  'MAJORITY',   // >50% must approve
  'UNANIMOUS',  // 100% must approve
])

export const groupTypeEnum = pgEnum('group_type', [
  'STATIC',   // fixed named members
  'DYNAMIC',  // resolved at runtime from condition
  'HYBRID',   // static members UNION dynamic results
])

export const rulePurposeEnum = pgEnum('rule_purpose', [
  'STEP_ACTIVATION',     // does this step run?
  'APPROVER_RESOLUTION', // who is the approver?
  'HIERARCHY_SELECTION', // which hierarchy type?
  'GROUP_MEMBERSHIP',    // who is in this group?
  'ESCALATION_TRIGGER',  // when to escalate?
  'SLA_OVERRIDE',        // custom SLA for condition?
])

export const delegationScopeEnum = pgEnum('delegation_scope', [
  'ALL_WORKFLOWS',
  'BY_MODULE',
  'BY_HIERARCHY_TYPE',
])

export const auditEventTypeEnum = pgEnum('audit_event_type', [
  'SUBMITTED', 'STEP_ACTIVATED', 'STEP_SKIPPED',
  'APPROVED', 'REJECTED', 'DELEGATED', 'ESCALATED',
  'HIERARCHY_RESOLVED', 'VACANCY_ENCOUNTERED',
  'VACANCY_RESOLVED', 'RULE_EVALUATED',
  'CANCELLED', 'WITHDRAWN', 'REMINDED',
  'SLA_BREACHED', 'AUTO_APPROVED', 'AUTO_REJECTED',
  'COMMENT_ADDED', 'REQUEST_INFO_SENT',
  'INFO_PROVIDED', 'SEND_BACK',
  'DELEGATION_APPLIED', 'GROUP_RESOLVED',
  'HIERARCHY_SWITCHED', 'POSITION_VACANT_ESCALATED',
])

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 1 — approval_hierarchy_configs
// Default hierarchy type per workflow module per entity.
// HR Admin configures once; individual steps can override.
// ══════════════════════════════════════════════════════════════════════════════

export const approvalHierarchyConfigs = pgTable('approval_hierarchy_configs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  entityId:     uuid('entity_id').notNull().references(() => legalEntities.id),
  
  workflowModule: workflowModuleEnum('workflow_module').notNull(),
  
  // Default hierarchy when no step-level override is set
  defaultHierarchy: hierarchyTypeEnum('default_hierarchy')
    .notNull()
    .default('LINE_MANAGER'),
  
  // Can individual steps use a different hierarchy_type?
  allowHierarchyOverride: boolean('allow_hierarchy_override').notNull().default(true),
  
  // If primary hierarchy resolution fails (vacant position, no line manager):
  fallbackHierarchy: hierarchyTypeEnum('fallback_hierarchy'),
  
  ...auditFull(),
},
(t) => ({
  entityModuleUniq: uniqueIndex('ahc_entity_module_uniq').on(t.tenantId, t.entityId, t.workflowModule),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 2 — approval_groups
// Named approver pools: static (named persons) or dynamic (by rule).
// ══════════════════════════════════════════════════════════════════════════════

export const approvalGroups = pgTable('approval_groups', {
  id:          uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  entityId:    uuid('entity_id').notNull().references(() => legalEntities.id),
  
  name:        varchar('name', { length: 200 }).notNull(),
  nameAr:      varchar('name_ar', { length: 200 }),
  code:        varchar('code', { length: 50 }).notNull(),
  description: text('description'),
  
  groupType:   groupTypeEnum('group_type').notNull(),
  
  votingMethod: votingMethodEnum('voting_method').notNull().default('ANY_ONE'),
  
  // STATIC: explicit person IDs (see approval_group_members table)
  // Stored here as denormalized cache for quick resolution
  memberIds: uuid('member_ids').array(),
  
  // DYNAMIC: evaluated at runtime against org data
  // Same condition structure as workflow_rules.conditions
  dynamicCondition: jsonb('dynamic_condition'),
  
  // Minimum members required — if fewer resolved, escalate to HR_ADMIN
  minMembersRequired: integer('min_members_required').notNull().default(1),
  
  isActive: boolean('is_active').notNull().default(true),
  ...auditFull(),
},
(t) => ({
  codeUniq: uniqueIndex('ag_code_tenant_uniq').on(t.tenantId, t.code),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 3 — approval_group_members
// Explicit membership records for STATIC and HYBRID approval groups.
// ══════════════════════════════════════════════════════════════════════════════

export const approvalGroupMembers = pgTable('approval_group_members', {
  id:          uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  groupId:     uuid('group_id').notNull().references(() => approvalGroups.id),
  personId:    uuid('person_id').notNull().references(() => persons.id),
  
  roleInGroup: varchar('role_in_group', { length: 100 }),
  // e.g., 'LEAD', 'MEMBER', 'ALTERNATE'
  
  isActive:  boolean('is_active').notNull().default(true),
  validFrom: date('valid_from').notNull(),
  validTo:   date('valid_to'),
  
  addedBy:   uuid('added_by').notNull().references(() => persons.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 4 — workflow_definitions (v2 — replaces existing)
// Template defining an entire workflow type. One row = one workflow type.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDefinitionsV2 = pgTable('workflow_definitions_v2', {
  id:   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  
  code: varchar('code', { length: 50 }).notNull(),
  // e.g., 'WF-LEAVE-ANNUAL', 'WF-SALARY-INCREMENT'
  
  name:        varchar('name', { length: 200 }).notNull(),
  nameAr:      varchar('name_ar', { length: 200 }),
  description: text('description'),
  
  entityId: uuid('entity_id').references(() => legalEntities.id),
  // NULL = applies to all entities; entity-specific overrides NULL definition
  
  module: workflowModuleEnum('module').notNull(),
  
  triggerEvent: varchar('trigger_event', { length: 100 }).notNull(),
  // e.g., 'LEAVE_SUBMITTED', 'HIRE_BACKDATED', 'SALARY_CHANGE_SUBMITTED'
  
  // Hierarchy configuration
  defaultHierarchyType: hierarchyTypeEnum('default_hierarchy_type')
    .notNull()
    .default('LINE_MANAGER'),
  
  hierarchyConfigId: uuid('hierarchy_config_id')
    .references(() => approvalHierarchyConfigs.id),
  
  // Behaviour
  isActive:             boolean('is_active').notNull().default(true),
  allowSelfApproval:    boolean('allow_self_approval').notNull().default(false),
  autoApproveAfterSla:  boolean('auto_approve_after_sla').notNull().default(false),
  requiresAllLevels:    boolean('requires_all_levels').notNull().default(true),
  minApprovalLevels:    integer('min_approval_levels').notNull().default(1),
  maxApprovalLevels:    integer('max_approval_levels').notNull().default(10),
  
  onApproverNotFound: onApproverNotFoundEnum('on_approver_not_found')
    .notNull()
    .default('ESCALATE_UP'),
  
  version:    integer('version').notNull().default(1),
  ...auditFull(),
},
(t) => ({
  codeEntityUniq: uniqueIndex('wdv2_code_entity_uniq').on(t.tenantId, t.code, t.entityId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 5 — workflow_steps
// Each approval level/step within a workflow definition.
// This is the core of the hybrid hierarchy model — each step has its own
// hierarchy_type, hierarchy_level, and activation conditions.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowStepsV2 = pgTable('workflow_steps_v2', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefId:    uuid('workflow_def_id').notNull()
    .references(() => workflowDefinitionsV2.id),
  
  stepOrder:  integer('step_order').notNull(),
  stepName:   varchar('step_name', { length: 200 }).notNull(),
  stepNameAr: varchar('step_name_ar', { length: 200 }),
  stepType:   stepTypeEnum('step_type').notNull().default('APPROVAL'),
  
  // ── HIERARCHY CONFIGURATION ───────────────────────────────────────────────
  hierarchyType: hierarchyTypeEnum('hierarchy_type').notNull(),
  
  // For LINE_MANAGER and POSITION:
  //   1 = N+1 (direct), 2 = N+2, 3 = N+3
  //  -1 = HOD (dept head, however many levels), -2 = entity head
  hierarchyLevel: integer('hierarchy_level'),
  
  // For CUSTOM_GROUP
  hierarchyGroupId: uuid('hierarchy_group_id').references(() => approvalGroups.id),
  
  // For ROLE_IN_ORG / ROLE_IN_DEPT
  hierarchyRole: varchar('hierarchy_role', { length: 100 }),
  
  // For NAMED_PERSON — escape hatch
  hierarchyPersonId: uuid('hierarchy_person_id').references(() => persons.id),
  
  // For RULE_RESOLVED — rule returns { hierarchyType, level, groupId }
  hierarchyRuleId: uuid('hierarchy_rule_id'),
  // FK set after workflow_rules table exists (circular avoided via deferred FK)
  
  // ── ACTIVATION CONDITION ─────────────────────────────────────────────────
  // NULL = step always activates
  // Set = step activates only if rule returns true
  activationConditionId: uuid('activation_condition_id'),
  // FK set after workflow_rules (deferred)
  
  // ── STEP EFFECT ──────────────────────────────────────────────────────────
  stepEffect: stepEffectEnum('step_effect').notNull().default('NORMAL'),
  
  // For INJECT_BEFORE/AFTER and SKIP_PREVIOUS: which step_order to target
  effectTargetStepOrder: integer('effect_target_step_order'),
  
  // ── PARALLEL SETTINGS ────────────────────────────────────────────────────
  parallelVoting: votingMethodEnum('parallel_voting'),
  
  // ── SLA ──────────────────────────────────────────────────────────────────
  // Hours are WORKING HOURS (UAE calendar: Sun-Thu 09:00-18:00 GST)
  slaHours:        integer('sla_hours').notNull().default(48),
  slaReminderHours: integer('sla_reminder_hours').notNull().default(24),
  
  onSlaBreach: slaBreach​ActionEnum('on_sla_breach').notNull().default('ESCALATE'),
  
  // On breach: which hierarchy type and level to escalate to
  escalationHierarchyType: hierarchyTypeEnum('escalation_hierarchy_type'),
  escalationLevel:         integer('escalation_level'),
  escalationRole:          varchar('escalation_role', { length: 100 }),
  
  // Override workflow-level vacancy handling for this step
  onApproverNotFound: onApproverNotFoundEnum('on_approver_not_found'),
  
  // ── ACTIONS ──────────────────────────────────────────────────────────────
  // Array of allowed actions for this step
  actionsAvailable: text('actions_available').array()
    .notNull()
    .default(['APPROVE', 'REJECT']),
  
  // Actions that require a comment to be entered
  requiresCommentOn: text('requires_comment_on').array()
    .notNull()
    .default(['REJECT']),
  
  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  notifyOnReach:   boolean('notify_on_reach').notNull().default(true),
  notifyChannels:  text('notify_channels').array()
    .notNull()
    .default(['IN_APP', 'EMAIL']),
  
  isActive: boolean('is_active').notNull().default(true),
  ...auditFull(),
},
(t) => ({
  defStepOrderUniq: uniqueIndex('ws_def_order_uniq').on(t.workflowDefId, t.stepOrder),
  defIdIdx:         index('ws_def_id_idx').on(t.workflowDefId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 6 — workflow_rules
// Condition trees used for step activation, routing, and hierarchy resolution.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowRules = pgTable('workflow_rules', {
  id:   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  
  // NULL = global rule reusable across all workflow definitions
  workflowDefId: uuid('workflow_def_id').references(() => workflowDefinitionsV2.id),
  
  ruleCode: varchar('rule_code', { length: 100 }).notNull(),
  ruleName: varchar('rule_name', { length: 200 }).notNull(),
  
  rulePurpose: rulePurposeEnum('rule_purpose').notNull(),
  
  // How top-level conditions in the array are combined
  logicOperator: varchar('logic_operator', { length: 3 }).notNull().default('AND'),
  // 'AND' | 'OR'
  
  // ── CONDITION TREE (JSON) ─────────────────────────────────────────────────
  // Array of SimpleCondition | GroupCondition
  // See WORKFLOW_ENGINE_DESIGN.md §5.1 for full type definitions
  //
  // SimpleCondition: { id, field, operator, value, dataType }
  //   field paths: employee.grade_level, leave.days, salary.increment_pct, ...
  //   operators:   EQUALS, GREATER_THAN, IN, BETWEEN, IS_TRUE, REGEX_MATCH, ...
  //
  // GroupCondition: { id, type: 'GROUP', operator: 'AND'|'OR', conditions: [...] }
  //
  // Example — "Leave > 7 days AND (grade >= 7 OR backdated)":
  // [
  //   { "id":"c1", "field":"leave.days", "operator":"GREATER_THAN", "value":7, "dataType":"NUMBER" },
  //   { "id":"c2", "type":"GROUP", "operator":"OR", "conditions":[
  //     { "id":"c2a", "field":"employee.grade_level", "operator":"GREATER_THAN_OR_EQUAL", "value":7, "dataType":"NUMBER" },
  //     { "id":"c2b", "field":"leave.is_backdated", "operator":"IS_TRUE", "dataType":"BOOLEAN" }
  //   ]}
  // ]
  conditions: jsonb('conditions').notNull(),
  
  // For APPROVER_RESOLUTION and HIERARCHY_SELECTION rules:
  // The result returned when conditions evaluate to true
  // e.g., 'LINE_MANAGER' (a hierarchy type) or a role name or person_id
  resultType: varchar('result_type', { length: 100 }),
  
  description: text('description'),
  isActive:    boolean('is_active').notNull().default(true),
  ...auditFull(),
},
(t) => ({
  codeUniq: uniqueIndex('wr_code_tenant_uniq').on(t.tenantId, t.ruleCode),
  defIdx:   index('wr_def_id_idx').on(t.workflowDefId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 7 — workflow_instances_v2
// One row per submitted request entering the workflow.
// Contains immutable snapshots captured at submission time.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowInstancesV2 = pgTable('workflow_instances_v2', {
  id:   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  
  workflowDefId:      uuid('workflow_def_id').notNull()
    .references(() => workflowDefinitionsV2.id),
  workflowDefVersion: integer('workflow_def_version').notNull().default(1),
  
  // The record being approved (polymorphic)
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  // e.g., 'absence_entries', 'persons', 'worker_assignments'
  entityId:   uuid('entity_id').notNull(),
  
  initiatorId:       uuid('initiator_id').notNull().references(() => persons.id),
  initiatorEntityId: uuid('initiator_entity_id').references(() => legalEntities.id),
  
  status: workflowStatusEnum('status').notNull().default('IN_PROGRESS'),
  
  // FK to the currently active step
  currentStepId: uuid('current_step_id'),
  // FK set as deferred reference to workflow_instance_steps (defined below)
  
  // ── IMMUTABLE SNAPSHOTS (captured once at submission, encrypted at rest) ──
  //
  // hierarchy_snapshot — org structure at submission time:
  // {
  //   lineManager:   { id, name, nameAr, grade, gradeLevel },
  //   lineManagerL2: { id, name, ... },
  //   lineManagerL3: { ... },
  //   hod:           { id, name, ... },
  //   positionChain: [{ positionId, title, heldBy: { id, name } }, ...],
  //   entityHead:    { id, name, ... },
  //   hrAdmins:      [{ id, name }, ...],
  // }
  hierarchySnapshot: jsonb('hierarchy_snapshot').notNull(),
  
  // context_snapshot — full request + employee data at submission:
  // {
  //   employee: { id, grade, gradeLevel, departmentId, entityId, employmentType,
  //               nationalityIso3, nationalityCategory, serviceMonths, probationStatus, ... },
  //   request:  { type, days, startDate, endDate, isBackdated, backdatedDays,
  //               balanceRemaining, balancePctUsed, ... }
  // }
  contextSnapshot: jsonb('context_snapshot').notNull(),
  
  // ── RESOLVED STEP CHAIN (calculated once at submission, stored as JSONB) ─
  // Array of resolved step objects showing the full chain upfront:
  // [
  //   { stepOrder: 1, stepName: "Line Manager", status: "ACTIVE",
  //     resolvedApprover: { id, name, nameAr }, hierarchyUsed: "LINE_MANAGER" },
  //   { stepOrder: 2, stepName: "HOD", status: "PENDING",
  //     resolvedApprover: { id, name }, hierarchyUsed: "LINE_MANAGER" },
  //   { stepOrder: 3, stepName: "HR Admin", status: "SKIPPED",
  //     skipReason: "leave.type ANNUAL not in [MATERNITY, PATERNITY, HAJJ]" }
  // ]
  resolvedSteps: jsonb('resolved_steps').notNull(),
  
  submittedAt:     timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  slaDeadline:     timestamp('sla_deadline', { withTimezone: true }),
  approvedAt:      timestamp('approved_at', { withTimezone: true }),
  rejectedAt:      timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  finalActionBy:   uuid('final_action_by').references(() => persons.id),
  comments:        text('comments'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
},
(t) => ({
  statusIdx:       index('wiv2_status_idx').on(t.status),
  initiatorIdx:    index('wiv2_initiator_idx').on(t.initiatorId),
  entityTypeIdx:   index('wiv2_entity_idx').on(t.entityType, t.entityId),
  submittedAtIdx:  index('wiv2_submitted_idx').on(t.submittedAt),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 8 — workflow_instance_steps
// One row per approval step per instance.
// This replaces the single approvalChainJson JSONB blob — each step is
// queryable, filterable, and joinable individually.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowInstanceSteps = pgTable('workflow_instance_steps', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId: uuid('instance_id').notNull()
    .references(() => workflowInstancesV2.id),
  stepDefId:  uuid('step_def_id').notNull()
    .references(() => workflowStepsV2.id),
  
  stepOrder: integer('step_order').notNull(),
  stepName:  varchar('step_name', { length: 200 }).notNull(),
  
  // Which hierarchy type was actually used to resolve this approver
  hierarchyTypeUsed: hierarchyTypeEnum('hierarchy_type_used'),
  
  // ── RESOLVED APPROVER ─────────────────────────────────────────────────────
  // For single-approver steps: direct person assignment
  assignedToId:      uuid('assigned_to_id').references(() => persons.id),
  // For role/group steps: the group
  assignedToGroupId: uuid('assigned_to_group_id').references(() => approvalGroups.id),
  assignedRole:      varchar('assigned_role', { length: 100 }),
  // For parallel steps: all resolved approver IDs
  resolvedApproverIds: uuid('resolved_approver_ids').array(),
  
  // ── DELEGATION ────────────────────────────────────────────────────────────
  isDelegated:         boolean('is_delegated').notNull().default(false),
  originalApproverId:  uuid('original_approver_id').references(() => persons.id),
  delegatedToId:       uuid('delegated_to_id').references(() => persons.id),
  delegationReason:    text('delegation_reason'),
  
  // ── VACANCY HANDLING ──────────────────────────────────────────────────────
  vacancyEncountered: boolean('vacancy_encountered').notNull().default(false),
  vacancyResolution:  varchar('vacancy_resolution', { length: 300 }),
  
  status:     stepStatusEnum('status').notNull().default('PENDING'),
  skipReason: text('skip_reason'),
  
  // ── SLA (in working hours) ────────────────────────────────────────────────
  slaDeadline:    timestamp('sla_deadline', { withTimezone: true }).notNull(),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  slaBreached:    boolean('sla_breached').notNull().default(false),
  slaBreachedAt:  timestamp('sla_breached_at', { withTimezone: true }),
  
  // If this step was created as an escalation from another step
  escalatedFromStepId: uuid('escalated_from_step_id'),
  // FK: self-reference (deferred)
  
  // ── ACTION TAKEN ──────────────────────────────────────────────────────────
  action:           stepActionEnum('action'),
  actionTakenAt:    timestamp('action_taken_at', { withTimezone: true }),
  actionTakenById:  uuid('action_taken_by_id').references(() => persons.id),
  comments:         text('comments'),
  
  notifiedAt:   timestamp('notified_at', { withTimezone: true }),
  activatedAt:  timestamp('activated_at', { withTimezone: true }),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
},
(t) => ({
  instanceIdx:  index('wis_instance_idx').on(t.instanceId),
  assignedToIdx: index('wis_assigned_to_idx').on(t.assignedToId),
  statusIdx:    index('wis_status_idx').on(t.status),
  slaIdx:       index('wis_sla_idx').on(t.slaDeadline, t.slaBreached),
  // Critical index for "get all my pending approvals"
  pendingByApprover: index('wis_pending_approver_idx')
    .on(t.assignedToId, t.status)
    .where('status = \'ACTIVE\''),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 9 — workflow_delegations
// Out-of-office delegation rules. Replaces approval_delegations.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDelegations = pgTable('workflow_delegations', {
  id:          uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  delegatorId: uuid('delegator_id').notNull().references(() => persons.id),
  delegateId:  uuid('delegate_id').notNull().references(() => persons.id),
  
  delegationScope: delegationScopeEnum('delegation_scope').notNull(),
  
  // Only populated if scope = BY_MODULE
  scopeModules: workflowModuleEnum('scope_modules').array(),
  
  // Only populated if scope = BY_HIERARCHY_TYPE
  scopeHierarchyTypes: hierarchyTypeEnum('scope_hierarchy_types').array(),
  
  startDate: date('start_date').notNull(),
  endDate:   date('end_date').notNull(),
  
  isActive: boolean('is_active').notNull().default(true),
  reason:   text('reason'),
  
  // HR Admin must approve delegations (for PII/privileged workflows)
  approvedBy: uuid('approved_by').references(() => persons.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  
  createdBy: uuid('created_by').notNull().references(() => persons.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
},
(t) => ({
  // Constraint: cannot delegate to yourself
  // Enforced in application layer (Drizzle has no column-level check for cross-column)
  delegatorIdx: index('wd_delegator_idx').on(t.delegatorId, t.isActive),
  delegateIdx:  index('wd_delegate_idx').on(t.delegateId, t.isActive),
  activePeriod: index('wd_period_idx').on(t.startDate, t.endDate, t.isActive),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 10 — workflow_sla_calendars
// UAE working hours calendar for SLA deadline calculation.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowSlaCalendars = pgTable('workflow_sla_calendars', {
  id:       uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  // NULL = global default for tenant; entity-specific overrides global
  
  name: varchar('name', { length: 200 }).notNull(),
  
  // Working days as day names
  workDays: text('work_days').array()
    .notNull()
    .default(['SUN', 'MON', 'TUE', 'WED', 'THU']),
  // UAE: Sunday through Thursday
  
  workStartHour: integer('work_start_hour').notNull().default(9),   // 09:00
  workEndHour:   integer('work_end_hour').notNull().default(18),    // 18:00
  timezone:      varchar('timezone', { length: 50 }).notNull().default('Asia/Dubai'),
  
  // Ramadan override
  ramadanEnabled: boolean('ramadan_enabled').notNull().default(true),
  ramadanEndHour: integer('ramadan_end_hour').notNull().default(14), // 14:00
  
  isActive:  boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 11 — workflow_audit_log
// IMMUTABLE event log. INSERT-ONLY. 7-year retention.
// Protected by PostgreSQL RLS: UPDATE and DELETE are denied for all roles.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowAuditLog = pgTable('workflow_audit_log', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull()
    .references(() => workflowInstancesV2.id),
  instanceStepId: uuid('instance_step_id')
    .references(() => workflowInstanceSteps.id),
  
  eventType: auditEventTypeEnum('event_type').notNull(),
  
  // NULL = system actor (cron, auto-action)
  actorId:   uuid('actor_id').references(() => persons.id),
  actorRole: varchar('actor_role', { length: 100 }),
  
  // Full context of every event — structured for querying
  // {
  //   hierarchyType: "LINE_MANAGER",
  //   resolvedApprover: { id, name, grade },
  //   ruleEvaluated: { ruleCode, result, conditions: [...] },
  //   previousApprover: { ... },      // for delegation/escalation
  //   vacancyDetails: { ... },         // if position was vacant
  //   comment: "...",
  //   actionData: { ... },
  //   skipReason: "...",               // for STEP_SKIPPED events
  // }
  eventData: jsonb('event_data').notNull(),
  
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  
  // INSERT-ONLY: no updatedAt column (immutable by design)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
(t) => ({
  instanceIdx:   index('wal_instance_idx').on(t.instanceId),
  eventTypeIdx:  index('wal_event_type_idx').on(t.eventType),
  actorIdx:      index('wal_actor_idx').on(t.actorId),
  createdAtIdx:  index('wal_created_at_idx').on(t.createdAt),
}))

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 12 — notification_templates
// Multi-channel, bilingual notification templates.
// ══════════════════════════════════════════════════════════════════════════════

export const notificationTemplatesV2 = pgTable('notification_templates_v2', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefId: uuid('workflow_def_id').references(() => workflowDefinitionsV2.id),
  // NULL = applies to all workflow types
  
  eventType: varchar('event_type', { length: 100 }).notNull(),
  // e.g., 'STEP_ACTIVATED', 'APPROVED', 'REJECTED', 'SLA_REMINDER'
  
  channel:  varchar('channel', { length: 20 }).notNull(),
  // 'EMAIL' | 'IN_APP' | 'SMS' | 'PUSH'
  
  language: varchar('language', { length: 5 }).notNull().default('EN'),
  // 'EN' | 'AR'
  
  subjectTemplate: text('subject_template'),
  bodyTemplate:    text('body_template').notNull(),
  
  // Template variables available:
  //   {{employee.name}}, {{employee.name_ar}}
  //   {{request.type}}, {{request.days}}, {{request.dates}}
  //   {{approver.name}}, {{step.name}}
  //   {{sla_deadline}}, {{sla_hours_remaining}}
  //   {{hierarchy_type}}  (human-readable: "your Line Manager" / "HOD" etc.)
  //   {{approve_link}}, {{reject_link}}, {{view_link}}
  //   {{delegation.original}}, {{delegation.delegate}}
  //   {{escalation.reason}}, {{vacancy.position}}
  //   {{comment}}, {{rejection_reason}}
  
  // One-click email approval links (signed JWT, single-use, expires at SLA deadline)
  // { "approve": true, "reject": true }
  // Link: /api/workflow/action?token=<JWT>
  // Token encodes: step_id, action, actor_id, expires_at
  actionLinks: jsonb('action_links'),
  
  isActive: boolean('is_active').notNull().default(true),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
},
(t) => ({
  eventChannelLangUniq: uniqueIndex('ntv2_event_channel_lang_uniq')
    .on(t.tenantId, t.workflowDefId, t.eventType, t.channel, t.language),
}))
```

---

## Drizzle Relations

```typescript
export const workflowDefinitionsV2Relations = relations(workflowDefinitionsV2, ({ many, one }) => ({
  steps:    many(workflowStepsV2),
  rules:    many(workflowRules),
  instances: many(workflowInstancesV2),
  hierarchyConfig: one(approvalHierarchyConfigs, {
    fields: [workflowDefinitionsV2.hierarchyConfigId],
    references: [approvalHierarchyConfigs.id],
  }),
}))

export const workflowStepsV2Relations = relations(workflowStepsV2, ({ one }) => ({
  workflowDef: one(workflowDefinitionsV2, {
    fields: [workflowStepsV2.workflowDefId],
    references: [workflowDefinitionsV2.id],
  }),
  group: one(approvalGroups, {
    fields: [workflowStepsV2.hierarchyGroupId],
    references: [approvalGroups.id],
  }),
  namedPerson: one(persons, {
    fields: [workflowStepsV2.hierarchyPersonId],
    references: [persons.id],
  }),
}))

export const workflowInstancesV2Relations = relations(workflowInstancesV2, ({ many, one }) => ({
  steps:     many(workflowInstanceSteps),
  auditLog:  many(workflowAuditLog),
  initiator: one(persons, {
    fields: [workflowInstancesV2.initiatorId],
    references: [persons.id],
  }),
  workflowDef: one(workflowDefinitionsV2, {
    fields: [workflowInstancesV2.workflowDefId],
    references: [workflowDefinitionsV2.id],
  }),
}))

export const workflowInstanceStepsRelations = relations(workflowInstanceSteps, ({ one }) => ({
  instance: one(workflowInstancesV2, {
    fields: [workflowInstanceSteps.instanceId],
    references: [workflowInstancesV2.id],
  }),
  stepDef: one(workflowStepsV2, {
    fields: [workflowInstanceSteps.stepDefId],
    references: [workflowStepsV2.id],
  }),
  assignedTo: one(persons, {
    fields: [workflowInstanceSteps.assignedToId],
    references: [persons.id],
  }),
  group: one(approvalGroups, {
    fields: [workflowInstanceSteps.assignedToGroupId],
    references: [approvalGroups.id],
  }),
}))

export const approvalGroupsRelations = relations(approvalGroups, ({ many }) => ({
  members: many(approvalGroupMembers),
}))
```

---

## Seed Data Requirements

### workflow_sla_calendars
```typescript
// UAE default calendar (insert on migration)
{
  tenantId: TENANT_ID,
  name: 'UAE Standard (Sun–Thu, 09:00–18:00 GST)',
  workDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
  workStartHour: 9,
  workEndHour: 18,
  timezone: 'Asia/Dubai',
  ramadanEnabled: true,
  ramadanEndHour: 14,
  isDefault: true,
  isActive: true,
  createdBy: SYSTEM_ACTOR_ID,
}
```

### notification_templates
- EN + AR templates for all `auditEventTypeEnum` values
- Channels: EMAIL + IN_APP for all events; SMS for urgent approvals only
- See `WORKFLOW_TEMPLATES.md` for full template content per workflow type

### workflow_definitions + steps + rules
- All 12 core workflow types + 11 additional types
- See `WORKFLOW_TEMPLATES.md` for complete seed objects

---

## Migration Strategy

The new v2 tables coexist with the existing Sprint 2 skeleton tables during transition:

```
Phase 1: Add all new tables (migration 0013_workflow_engine_v2.sql)
Phase 2: Migrate existing workflow_instances to workflow_instances_v2
         (data migration script with hierarchy snapshot backfill)
Phase 3: Cut over application code to use v2 tables
Phase 4: Drop legacy tables (migration 0014_drop_workflow_v1.sql)
         after verification in production
```

---

## PostgreSQL RLS for Audit Log

```sql
-- In migration file:
ALTER TABLE workflow_audit_log ENABLE ROW LEVEL SECURITY;

-- Deny all UPDATE and DELETE
CREATE POLICY wal_deny_update ON workflow_audit_log
  FOR UPDATE USING (false);

CREATE POLICY wal_deny_delete ON workflow_audit_log
  FOR DELETE USING (false);

-- Allow INSERT only
CREATE POLICY wal_allow_insert ON workflow_audit_log
  FOR INSERT WITH CHECK (true);

-- Allow SELECT for authorized roles
CREATE POLICY wal_allow_select ON workflow_audit_log
  FOR SELECT USING (true);
```
