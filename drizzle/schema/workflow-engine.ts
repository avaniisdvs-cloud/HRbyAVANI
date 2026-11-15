/**
 * AVANIIS HR — Workflow Engine v2 Schema
 * Hybrid hierarchy (LINE_MANAGER / POSITION / CUSTOM_GROUP) + AND/OR condition trees
 * Immutable snapshots, UAE working-hours SLA, INSERT-only audit log.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  jsonb,
  inet,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { legalEntities, persons } from './foundation'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers ────────────────────────────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ─── Enums ──────────────────────────────────────────────────────────────────

export const hierarchyTypeEnum = pgEnum('hierarchy_type_enum', [
  'LINE_MANAGER',
  'POSITION',
  'CUSTOM_GROUP',
])

export const stepEffectEnum = pgEnum('step_effect_enum', [
  'NORMAL',
  'ADD_IF_MATCHES',
  'REPLACE',
  'SKIP_PREVIOUS',
  'INJECT_BEFORE',
  'INJECT_AFTER',
  'PARALLEL_ADD',
])

export const slaBreachActionEnum = pgEnum('sla_breach_action_enum', [
  'ESCALATE',
  'AUTO_APPROVE',
  'AUTO_REJECT',
  'SEND_REMINDER',
  'BLOCK_FREEZE',
])

export const approverNotFoundActionEnum = pgEnum('approver_not_found_action_enum', [
  'ESCALATE_UP',
  'USE_FALLBACK',
  'ASSIGN_HR_ADMIN',
  'BLOCK_WITH_ERROR',
])

export const groupMemberTypeEnum = pgEnum('group_member_type_enum', [
  'STATIC',
  'DYNAMIC',
  'HYBRID',
])

export const groupVotingMethodEnum = pgEnum('group_voting_method_enum', [
  'ANY_ONE',
  'MAJORITY',
  'ALL',
  'WEIGHTED',
])

export const instanceStatusEnum = pgEnum('instance_status_enum', [
  'PENDING',
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ESCALATED',
  'ON_HOLD',
  'RECALLED',
])

export const stepStatusEnum = pgEnum('step_status_enum', [
  'WAITING',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DELEGATED',
  'ESCALATED',
  'SKIPPED',
  'AUTO_APPROVED',
  'RECALLED',
])

export const auditActionEnum = pgEnum('audit_action_enum', [
  'SUBMITTED',
  'STEP_APPROVED',
  'STEP_REJECTED',
  'STEP_DELEGATED',
  'STEP_ESCALATED',
  'STEP_SKIPPED',
  'INSTANCE_APPROVED',
  'INSTANCE_REJECTED',
  'INSTANCE_CANCELLED',
  'INSTANCE_RECALLED',
  'SLA_REMINDER_SENT',
  'SLA_ESCALATED',
  'TOKEN_ISSUED',
  'TOKEN_USED',
  'TOKEN_EXPIRED',
  'RULE_EVALUATED',
  'HIERARCHY_RESOLVED',
  'SNAPSHOT_CREATED',
])

export const notificationStatusEnum = pgEnum('notification_status_enum', [
  'QUEUED',
  'SENT',
  'FAILED',
  'SKIPPED',
])

// ─── Condition tree TypeScript types ────────────────────────────────────────

export type ConditionOperator =
  | 'EQUALS' | 'NOT_EQUALS'
  | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL'
  | 'IN' | 'NOT_IN'
  | 'IS_TRUE' | 'IS_FALSE'
  | 'IS_NULL' | 'IS_NOT_NULL'
  | 'CONTAINS' | 'STARTS_WITH'

export type ConditionDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ARRAY'

export interface SimpleCondition {
  id: string
  field: string           // e.g. 'leave.days', 'employee.grade_level', 'employee.nationality_category'
  operator: ConditionOperator
  value?: unknown
  dataType: ConditionDataType
  labelEn?: string
}

export interface GroupCondition {
  id: string
  operator: 'AND' | 'OR'
  conditions: ConditionNode[]
}

export type ConditionNode = SimpleCondition | GroupCondition

// ─── Snapshot types ──────────────────────────────────────────────────────────

export interface ResolvedApprover {
  personId: string
  personName: string
  stepOrder: number
  stepCode: string
  hierarchyType: string
  hierarchyLevel?: number
  resolvedAt: string   // ISO timestamp
}

export interface HierarchySnapshot {
  encryptedAt: string
  resolvedSteps: ResolvedApprover[]
  resolvedBy: string   // system version
}

export interface ContextSnapshot {
  encryptedAt: string
  resourceType: string
  resourceId: string
  fields: Record<string, unknown>
}

// ══════════════════════════════════════════════════════════════════════════════
// 1 — WORKFLOW_RULES
// ══════════════════════════════════════════════════════════════════════════════

export const workflowRules = pgTable('workflow_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  ruleCode:    varchar('rule_code', { length: 80 }).notNull(),
  ruleNameEn:  varchar('rule_name_en', { length: 200 }).notNull(),
  ruleNameAr:  varchar('rule_name_ar', { length: 200 }),
  description: text('description'),

  conditionTree: jsonb('condition_tree').$type<ConditionNode>().notNull(),

  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('workflow_rules_code_tenant_uniq').on(t.tenantId, t.ruleCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 2 — WORKFLOW_DEFINITIONS_V2
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDefinitionsV2 = pgTable('workflow_definitions_v2', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  workflowCode:   varchar('workflow_code', { length: 50 }).notNull(),
  workflowNameEn: varchar('workflow_name_en', { length: 200 }).notNull(),
  workflowNameAr: varchar('workflow_name_ar', { length: 200 }),
  description:    text('description'),

  triggerEvent: varchar('trigger_event', { length: 50 }).notNull(),

  selectorRuleId: uuid('selector_rule_id').references(() => workflowRules.id),

  defaultHierarchyType:    hierarchyTypeEnum('default_hierarchy_type').notNull().default('LINE_MANAGER'),
  onApproverNotFound:      approverNotFoundActionEnum('on_approver_not_found').notNull().default('ESCALATE_UP'),
  fallbackPersonId:        uuid('fallback_person_id').references(() => persons.id),

  defaultSlaHours:       integer('default_sla_hours').notNull().default(48),
  defaultEscalationHours: integer('default_escalation_hours').notNull().default(72),

  requiresMedicalCert:    boolean('requires_medical_cert').notNull().default(false),
  requiresManagerComment: boolean('requires_manager_comment').notNull().default(false),
  encryptSnapshot:        boolean('encrypt_snapshot').notNull().default(true),

  isActive: boolean('is_active').notNull().default(true),
  version:  integer('version').notNull().default(1),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('workflow_defs_v2_code_tenant_uniq').on(t.tenantId, t.workflowCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 3 — APPROVAL_GROUPS
// ══════════════════════════════════════════════════════════════════════════════

export const approvalGroups = pgTable('approval_groups', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  groupCode:   varchar('group_code', { length: 80 }).notNull(),
  groupNameEn: varchar('group_name_en', { length: 200 }).notNull(),
  groupNameAr: varchar('group_name_ar', { length: 200 }),

  memberType:       groupMemberTypeEnum('member_type').notNull().default('STATIC'),
  dynamicCondition: jsonb('dynamic_condition').$type<ConditionNode>(),
  votingMethod:     groupVotingMethodEnum('voting_method').notNull().default('ANY_ONE'),
  minApprovals:     integer('min_approvals').notNull().default(1),

  isActive: boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('approval_groups_code_tenant_uniq').on(t.tenantId, t.groupCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 4 — APPROVAL_GROUP_MEMBERS
// ══════════════════════════════════════════════════════════════════════════════

export const approvalGroupMembers = pgTable('approval_group_members', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  groupId:   uuid('group_id').notNull().references(() => approvalGroups.id, { onDelete: 'cascade' }),
  personId:  uuid('person_id').notNull().references(() => persons.id),

  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:   date('effective_to'),
  isPrimary:     boolean('is_primary').notNull().default(false),
  voteWeight:    integer('vote_weight').notNull().default(1),

  ...audit(),
}, (t) => ({
  groupIdx:  index('approval_group_members_group_idx').on(t.groupId),
  personIdx: index('approval_group_members_person_idx').on(t.personId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 5 — WORKFLOW_STEPS_V2
// ══════════════════════════════════════════════════════════════════════════════

export const workflowStepsV2 = pgTable('workflow_steps_v2', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull()
    .references(() => workflowDefinitionsV2.id, { onDelete: 'cascade' }),

  stepOrder:   integer('step_order').notNull(),
  stepCode:    varchar('step_code', { length: 80 }),
  stepNameEn:  varchar('step_name_en', { length: 200 }).notNull(),
  stepNameAr:  varchar('step_name_ar', { length: 200 }),

  hierarchyType:     hierarchyTypeEnum('hierarchy_type').notNull(),
  hierarchyLevel:    integer('hierarchy_level'),
  hierarchyGroupId:  uuid('hierarchy_group_id').references(() => approvalGroups.id),
  hierarchyRole:     varchar('hierarchy_role', { length: 100 }),
  hierarchyPersonId: uuid('hierarchy_person_id').references(() => persons.id),

  activationConditionId: uuid('activation_condition_id').references(() => workflowRules.id),

  stepEffect:           stepEffectEnum('step_effect').notNull().default('NORMAL'),
  effectTargetStepCode: varchar('effect_target_step_code', { length: 80 }),

  slaHours:            integer('sla_hours').notNull().default(48),
  onSlaBreach:         slaBreachActionEnum('on_sla_breach').notNull().default('ESCALATE'),
  escalationPersonId:  uuid('escalation_person_id').references(() => persons.id),
  escalationGroupId:   uuid('escalation_group_id').references(() => approvalGroups.id),

  onApproverNotFound: approverNotFoundActionEnum('on_approver_not_found'),

  isFyiOnly:            boolean('is_fyi_only').notNull().default(false),
  canDelegate:          boolean('can_delegate').notNull().default(true),
  isOptional:           boolean('is_optional').notNull().default(false),
  skipIfAlreadyApproved: boolean('skip_if_already_approved').notNull().default(true),

  isActive: boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  defOrderIdx: index('workflow_steps_v2_def_order_idx').on(t.workflowDefinitionId, t.stepOrder),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 6 — WORKFLOW_SLA_CALENDARS
// ══════════════════════════════════════════════════════════════════════════════

export const workflowSlaCalendars = pgTable('workflow_sla_calendars', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  calendarCode:   varchar('calendar_code', { length: 50 }).notNull(),
  calendarNameEn: varchar('calendar_name_en', { length: 200 }).notNull(),

  // ISO weekday numbers: 0=Sun, 1=Mon, ..., 6=Sat. UAE: [0,1,2,3,4]
  workingDays: integer('working_days').array().notNull().default([0, 1, 2, 3, 4]),

  timezone:     varchar('timezone', { length: 50 }).notNull().default('Asia/Dubai'),
  dayStartTime: varchar('day_start_time', { length: 5 }).notNull().default('09:00'),
  dayEndTime:   varchar('day_end_time', { length: 5 }).notNull().default('18:00'),

  ramadanStartTime: varchar('ramadan_start_time', { length: 5 }),
  ramadanEndTime:   varchar('ramadan_end_time', { length: 5 }),
  ramadanStartDate: date('ramadan_start_date'),
  ramadanEndDate:   date('ramadan_end_date'),

  isActive:  boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('workflow_sla_calendars_code_tenant_uniq').on(t.tenantId, t.calendarCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 7 — WORKFLOW_INSTANCES_V2
// ══════════════════════════════════════════════════════════════════════════════

export const workflowInstancesV2 = pgTable('workflow_instances_v2', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull()
    .references(() => workflowDefinitionsV2.id),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),

  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId:   uuid('resource_id').notNull(),

  initiatedByPersonId: uuid('initiated_by_person_id').notNull().references(() => persons.id),

  status:           instanceStatusEnum('status').notNull().default('PENDING'),
  currentStepId:    uuid('current_step_id').references(() => workflowStepsV2.id),
  currentStepOrder: integer('current_step_order').notNull().default(1),

  hierarchySnapshot: jsonb('hierarchy_snapshot').$type<HierarchySnapshot>().notNull(),
  contextSnapshot:   jsonb('context_snapshot').$type<ContextSnapshot>().notNull(),
  resolvedSteps:     jsonb('resolved_steps').$type<ResolvedApprover[]>().notNull(),

  slaCalendarId:  uuid('sla_calendar_id').references(() => workflowSlaCalendars.id),
  slaDeadline:    timestamp('sla_deadline', { withTimezone: true }),
  escalatedAt:    timestamp('escalated_at', { withTimezone: true }),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),

  startedAt:         timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt:       timestamp('completed_at', { withTimezone: true }),
  finalDecisionBy:   uuid('final_decision_by').references(() => persons.id),
  finalDecisionNote: text('final_decision_note'),
  rejectionReason:   text('rejection_reason'),

  recalledAt:    timestamp('recalled_at', { withTimezone: true }),
  recalledBy:    uuid('recalled_by').references(() => persons.id),
  recallReason:  text('recall_reason'),

  ...audit(),
}, (t) => ({
  resourceIdx:  index('workflow_instances_v2_resource_idx').on(t.resourceType, t.resourceId),
  initiatorIdx: index('workflow_instances_v2_initiator_idx').on(t.initiatedByPersonId),
  statusIdx:    index('workflow_instances_v2_status_idx').on(t.status),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 8 — WORKFLOW_STEP_INSTANCES
// ══════════════════════════════════════════════════════════════════════════════

export const workflowStepInstances = pgTable('workflow_step_instances', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId: uuid('instance_id').notNull()
    .references(() => workflowInstancesV2.id, { onDelete: 'cascade' }),
  stepId:     uuid('step_id').notNull().references(() => workflowStepsV2.id),

  stepOrder: integer('step_order').notNull(),
  status:    stepStatusEnum('status').notNull().default('WAITING'),

  assignedToPersonId: uuid('assigned_to_person_id').references(() => persons.id),
  assignedToGroupId:  uuid('assigned_to_group_id').references(() => approvalGroups.id),

  delegatedFromPersonId: uuid('delegated_from_person_id').references(() => persons.id),
  delegatedToPersonId:   uuid('delegated_to_person_id').references(() => persons.id),
  delegatedAt:           timestamp('delegated_at', { withTimezone: true }),

  decidedByPersonId: uuid('decided_by_person_id').references(() => persons.id),
  // APPROVE | REJECT | DELEGATE
  decision:          varchar('decision', { length: 20 }),
  decisionNote:      text('decision_note'),
  decidedAt:         timestamp('decided_at', { withTimezone: true }),

  slaDeadline: timestamp('sla_deadline', { withTimezone: true }),
  remindedAt:  timestamp('reminded_at', { withTimezone: true }),

  emailTokenJti: varchar('email_token_jti', { length: 64 }),

  ...audit(),
}, (t) => ({
  instanceIdx: index('workflow_step_instances_instance_idx').on(t.instanceId),
  assigneeIdx: index('workflow_step_instances_assignee_idx').on(t.assignedToPersonId, t.status),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 9 — WORKFLOW_AUDIT_LOG (INSERT-ONLY)
// ══════════════════════════════════════════════════════════════════════════════

export const workflowAuditLog = pgTable('workflow_audit_log', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull().references(() => workflowInstancesV2.id),
  stepInstanceId: uuid('step_instance_id').references(() => workflowStepInstances.id),

  action:        auditActionEnum('action').notNull(),
  actorPersonId: uuid('actor_person_id').references(() => persons.id),
  actorName:     varchar('actor_name', { length: 200 }),

  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  eventData: jsonb('event_data'),

  loggedAt: timestamp('logged_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  instanceIdx: index('workflow_audit_log_instance_idx').on(t.instanceId, t.loggedAt),
  actorIdx:    index('workflow_audit_log_actor_idx').on(t.actorPersonId, t.loggedAt),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 10 — WORKFLOW_EMAIL_TOKENS
// ══════════════════════════════════════════════════════════════════════════════

export const workflowEmailTokens = pgTable('workflow_email_tokens', {
  jti:        varchar('jti', { length: 64 }).primaryKey(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull().references(() => workflowInstancesV2.id),
  stepInstanceId: uuid('step_instance_id').notNull().references(() => workflowStepInstances.id),

  intendedAction:    varchar('intended_action', { length: 20 }).notNull(),
  issuedToPersonId:  uuid('issued_to_person_id').notNull().references(() => persons.id),
  expiresAt:         timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt:            timestamp('used_at', { withTimezone: true }),
  ipAddress:         inet('ip_address'),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  instanceIdx: index('workflow_email_tokens_instance_idx').on(t.instanceId),
  expiresIdx:  index('workflow_email_tokens_expires_idx').on(t.expiresAt),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 11 — WORKFLOW_DELEGATION_RULES
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDelegationRules = pgTable('workflow_delegation_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  delegatorId:   uuid('delegator_id').notNull().references(() => persons.id),
  delegateId:    uuid('delegate_id').notNull().references(() => persons.id),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),

  workflowCodes:   varchar('workflow_codes', { length: 50 }).array(),
  delegationFrom:  date('delegation_from').notNull(),
  delegationTo:    date('delegation_to').notNull(),
  status:          varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  delegationReason: text('delegation_reason'),

  ...audit(),
}, (t) => ({
  delegatorIdx: index('workflow_delegation_rules_delegator_idx').on(t.delegatorId, t.status),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 12 — WORKFLOW_NOTIFICATION_QUEUE
// ══════════════════════════════════════════════════════════════════════════════

export const workflowNotificationQueue = pgTable('workflow_notification_queue', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull().references(() => workflowInstancesV2.id),
  stepInstanceId: uuid('step_instance_id').references(() => workflowStepInstances.id),

  channel:           varchar('channel', { length: 20 }).notNull().default('EMAIL'),
  recipientPersonId: uuid('recipient_person_id').notNull().references(() => persons.id),
  recipientEmail:    varchar('recipient_email', { length: 300 }),

  templateCode: varchar('template_code', { length: 100 }).notNull(),
  subject:      varchar('subject', { length: 500 }),
  bodyHtml:     text('body_html'),
  bodyText:     text('body_text'),
  actionUrl:    text('action_url'),

  status:        notificationStatusEnum('status').notNull().default('QUEUED'),
  sendAfter:     timestamp('send_after', { withTimezone: true }).defaultNow().notNull(),
  sentAt:        timestamp('sent_at', { withTimezone: true }),
  failedAt:      timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  retryCount:    integer('retry_count').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx:   index('workflow_notification_queue_status_idx').on(t.status, t.sendAfter),
  instanceIdx: index('workflow_notification_queue_instance_idx').on(t.instanceId),
}))

// ─── Relations ──────────────────────────────────────────────────────────────

export const workflowDefinitionsV2Relations = relations(workflowDefinitionsV2, ({ many, one }) => ({
  steps: many(workflowStepsV2),
  instances: many(workflowInstancesV2),
  selectorRule: one(workflowRules, {
    fields: [workflowDefinitionsV2.selectorRuleId],
    references: [workflowRules.id],
  }),
}))

export const workflowStepsV2Relations = relations(workflowStepsV2, ({ one }) => ({
  definition: one(workflowDefinitionsV2, {
    fields: [workflowStepsV2.workflowDefinitionId],
    references: [workflowDefinitionsV2.id],
  }),
  activationCondition: one(workflowRules, {
    fields: [workflowStepsV2.activationConditionId],
    references: [workflowRules.id],
  }),
  group: one(approvalGroups, {
    fields: [workflowStepsV2.hierarchyGroupId],
    references: [approvalGroups.id],
  }),
}))

export const workflowInstancesV2Relations = relations(workflowInstancesV2, ({ one, many }) => ({
  definition: one(workflowDefinitionsV2, {
    fields: [workflowInstancesV2.workflowDefinitionId],
    references: [workflowDefinitionsV2.id],
  }),
  stepInstances: many(workflowStepInstances),
  auditLog: many(workflowAuditLog),
}))

export const workflowStepInstancesRelations = relations(workflowStepInstances, ({ one }) => ({
  instance: one(workflowInstancesV2, {
    fields: [workflowStepInstances.instanceId],
    references: [workflowInstancesV2.id],
  }),
  step: one(workflowStepsV2, {
    fields: [workflowStepInstances.stepId],
    references: [workflowStepsV2.id],
  }),
}))

export const approvalGroupsRelations = relations(approvalGroups, ({ many }) => ({
  members: many(approvalGroupMembers),
}))

export const approvalGroupMembersRelations = relations(approvalGroupMembers, ({ one }) => ({
  group: one(approvalGroups, {
    fields: [approvalGroupMembers.groupId],
    references: [approvalGroups.id],
  }),
}))

// ─── Inferred TypeScript types ───────────────────────────────────────────────

export type WorkflowRule              = typeof workflowRules.$inferSelect
export type NewWorkflowRule           = typeof workflowRules.$inferInsert
export type WorkflowDefinitionV2      = typeof workflowDefinitionsV2.$inferSelect
export type NewWorkflowDefinitionV2   = typeof workflowDefinitionsV2.$inferInsert
export type ApprovalGroup             = typeof approvalGroups.$inferSelect
export type NewApprovalGroup          = typeof approvalGroups.$inferInsert
export type ApprovalGroupMember       = typeof approvalGroupMembers.$inferSelect
export type WorkflowStepV2            = typeof workflowStepsV2.$inferSelect
export type NewWorkflowStepV2         = typeof workflowStepsV2.$inferInsert
export type WorkflowSlaCalendar       = typeof workflowSlaCalendars.$inferSelect
export type WorkflowInstanceV2        = typeof workflowInstancesV2.$inferSelect
export type NewWorkflowInstanceV2     = typeof workflowInstancesV2.$inferInsert
export type WorkflowStepInstance      = typeof workflowStepInstances.$inferSelect
export type NewWorkflowStepInstance   = typeof workflowStepInstances.$inferInsert
export type WorkflowAuditLogEntry     = typeof workflowAuditLog.$inferSelect
export type WorkflowEmailToken        = typeof workflowEmailTokens.$inferSelect
export type WorkflowDelegationRule    = typeof workflowDelegationRules.$inferSelect
export type WorkflowNotificationQueue = typeof workflowNotificationQueue.$inferSelect
