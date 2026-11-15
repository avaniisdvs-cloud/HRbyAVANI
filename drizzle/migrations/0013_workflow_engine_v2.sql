-- Migration: 0013_workflow_engine_v2
-- AVANIIS HR Dynamic Approval Workflow Engine v2.0
-- Hybrid hierarchy (LINE_MANAGER / POSITION / CUSTOM_GROUP) + AND/OR condition trees
-- Immutable snapshots, UAE working-hours SLA, INSERT-only audit log with RLS.

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE hierarchy_type_enum AS ENUM (
    'LINE_MANAGER',   -- traverse worker_assignments.line_manager_id chain
    'POSITION',       -- traverse positions.reports_to_position_id chain
    'CUSTOM_GROUP'    -- named pool of persons (static / dynamic / hybrid)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE step_effect_enum AS ENUM (
    'NORMAL',          -- standard sequential step
    'ADD_IF_MATCHES',  -- Oracle AME-style: insert extra approver when rule fires
    'REPLACE',         -- swap the default approver with this one
    'SKIP_PREVIOUS',   -- remove the previous step from chain
    'INJECT_BEFORE',   -- insert before a named step
    'INJECT_AFTER',    -- insert after a named step
    'PARALLEL_ADD'     -- add a concurrent approver (AND-gate with parallel steps)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sla_breach_action_enum AS ENUM (
    'ESCALATE',         -- route to escalation_person_id or next hierarchy level
    'AUTO_APPROVE',     -- Workday-style silent approval on breach
    'AUTO_REJECT',      -- hard reject on SLA miss
    'SEND_REMINDER',    -- just remind, do not escalate
    'BLOCK_FREEZE'      -- freeze instance, require manual admin intervention
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approver_not_found_action_enum AS ENUM (
    'ESCALATE_UP',       -- traverse hierarchy one more level
    'USE_FALLBACK',      -- use fallback_person_id from workflow definition
    'ASSIGN_HR_ADMIN',   -- route to HR admin group
    'BLOCK_WITH_ERROR'   -- hard block: submission fails until vacancy is filled
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE group_member_type_enum AS ENUM (
    'STATIC',   -- fixed list of person UUIDs
    'DYNAMIC',  -- runtime condition resolves membership
    'HYBRID'    -- static seed + dynamic additions
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE group_voting_method_enum AS ENUM (
    'ANY_ONE',     -- first response wins
    'MAJORITY',    -- >50% must agree
    'ALL',         -- unanimous (AND-gate)
    'WEIGHTED'     -- weighted votes by grade level
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE instance_status_enum AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'ESCALATED',
    'ON_HOLD',
    'RECALLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE step_status_enum AS ENUM (
    'WAITING',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'DELEGATED',
    'ESCALATED',
    'SKIPPED',
    'AUTO_APPROVED',
    'RECALLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action_enum AS ENUM (
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
    'SNAPSHOT_CREATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_status_enum AS ENUM (
    'QUEUED',
    'SENT',
    'FAILED',
    'SKIPPED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 1. WORKFLOW_RULES ────────────────────────────────────────────────────────
-- AND/OR condition trees. Each row is a named rule that can be referenced by
-- multiple workflow definitions or steps (activation_condition_id FK).

CREATE TABLE IF NOT EXISTS "workflow_rules" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "legal_entity_id" uuid        REFERENCES "legal_entities"("id"),

  "rule_code"       varchar(80) NOT NULL,
  "rule_name_en"    varchar(200) NOT NULL,
  "rule_name_ar"    varchar(200),
  "description"     text,

  -- Root condition tree. Schema:
  -- ConditionNode = SimpleCondition | GroupCondition
  -- SimpleCondition: { id, field, operator, value, dataType, labelEn }
  -- GroupCondition:  { id, operator: 'AND'|'OR', conditions: ConditionNode[] }
  "condition_tree"  jsonb       NOT NULL,

  -- Soft priority for rule engine ordering (lower = evaluated first)
  "priority"        integer     NOT NULL DEFAULT 0,
  "is_active"       boolean     NOT NULL DEFAULT true,

  -- Audit
  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_rules_code_tenant_uniq"
  ON "workflow_rules" ("tenant_id", "rule_code");

-- ─── 2. WORKFLOW_DEFINITIONS_V2 ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workflow_definitions_v2" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "legal_entity_id" uuid        REFERENCES "legal_entities"("id"),

  "workflow_code"       varchar(50)  NOT NULL,
  "workflow_name_en"    varchar(200) NOT NULL,
  "workflow_name_ar"    varchar(200),
  "description"         text,

  -- Trigger: LEAVE | HIRE | TRANSFER | SALARY_REVISION | TERMINATION |
  --          OVERTIME | EXIT_CLEARANCE | DEPENDENT_ADD | DOCUMENT_VERIFY |
  --          PROBATION_CONFIRM | VISA_RENEWAL | LOAN_REQUEST
  "trigger_event"       varchar(50)  NOT NULL,

  -- Selector rule (evaluates which definition wins for a given context)
  "selector_rule_id"    uuid         REFERENCES "workflow_rules"("id"),

  -- Default hierarchy settings (overridden per-step if needed)
  "default_hierarchy_type" hierarchy_type_enum NOT NULL DEFAULT 'LINE_MANAGER',

  -- Policy when approver not found (step-level can override)
  "on_approver_not_found" approver_not_found_action_enum NOT NULL DEFAULT 'ESCALATE_UP',
  "fallback_person_id"    uuid         REFERENCES "persons"("id"),

  -- SLA defaults (step-level can override)
  "default_sla_hours"      integer      NOT NULL DEFAULT 48,
  "default_escalation_hours" integer    NOT NULL DEFAULT 72,

  -- UAE FDL compliance gates
  "requires_medical_cert"     boolean  NOT NULL DEFAULT false,
  "requires_manager_comment"  boolean  NOT NULL DEFAULT false,

  -- Immutable snapshot encryption flag
  "encrypt_snapshot"      boolean      NOT NULL DEFAULT true,

  "is_active"         boolean      NOT NULL DEFAULT true,
  "version"           integer      NOT NULL DEFAULT 1,

  -- Audit
  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_defs_v2_code_tenant_uniq"
  ON "workflow_definitions_v2" ("tenant_id", "workflow_code");

-- ─── 3. APPROVAL_GROUPS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "approval_groups" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "legal_entity_id" uuid        REFERENCES "legal_entities"("id"),

  "group_code"      varchar(80) NOT NULL,
  "group_name_en"   varchar(200) NOT NULL,
  "group_name_ar"   varchar(200),

  "member_type"     group_member_type_enum NOT NULL DEFAULT 'STATIC',

  -- For DYNAMIC/HYBRID: condition tree that resolves members at runtime
  "dynamic_condition" jsonb,

  "voting_method"   group_voting_method_enum NOT NULL DEFAULT 'ANY_ONE',
  -- Minimum approvals needed (for MAJORITY / WEIGHTED)
  "min_approvals"   integer     NOT NULL DEFAULT 1,

  "is_active"       boolean     NOT NULL DEFAULT true,

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_groups_code_tenant_uniq"
  ON "approval_groups" ("tenant_id", "group_code");

-- ─── 4. APPROVAL_GROUP_MEMBERS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "approval_group_members" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "group_id"        uuid        NOT NULL REFERENCES "approval_groups"("id") ON DELETE CASCADE,
  "person_id"       uuid        NOT NULL REFERENCES "persons"("id"),
  "effective_from"  date        NOT NULL,
  "effective_to"    date,
  "is_primary"      boolean     NOT NULL DEFAULT false,
  -- Relative weight for WEIGHTED voting method
  "vote_weight"     integer     NOT NULL DEFAULT 1,

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE INDEX IF NOT EXISTS "approval_group_members_group_idx"
  ON "approval_group_members" ("group_id");
CREATE INDEX IF NOT EXISTS "approval_group_members_person_idx"
  ON "approval_group_members" ("person_id");

-- ─── 5. WORKFLOW_STEPS_V2 ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workflow_steps_v2" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "workflow_definition_id" uuid NOT NULL REFERENCES "workflow_definitions_v2"("id") ON DELETE CASCADE,

  "step_order"      integer     NOT NULL,
  "step_code"       varchar(80),   -- used by INJECT_BEFORE / INJECT_AFTER effects
  "step_name_en"    varchar(200) NOT NULL,
  "step_name_ar"    varchar(200),

  -- Hierarchy resolution
  "hierarchy_type"  hierarchy_type_enum NOT NULL,
  -- For LINE_MANAGER: 1=N+1, 2=N+2, -1=HOD, -2=EntityHead
  "hierarchy_level" integer,
  -- For CUSTOM_GROUP:
  "hierarchy_group_id" uuid     REFERENCES "approval_groups"("id"),
  -- For specific role-based routing:
  "hierarchy_role"  varchar(100),
  -- For named-person routing:
  "hierarchy_person_id" uuid    REFERENCES "persons"("id"),

  -- Oracle AME-style activation: only add this step if rule fires
  "activation_condition_id" uuid REFERENCES "workflow_rules"("id"),

  -- Step effect (how this step modifies the chain)
  "step_effect"     step_effect_enum NOT NULL DEFAULT 'NORMAL',
  -- For INJECT_BEFORE/INJECT_AFTER: the target step_code
  "effect_target_step_code" varchar(80),

  -- SLA (overrides workflow-level default)
  "sla_hours"       integer     NOT NULL DEFAULT 48,
  "on_sla_breach"   sla_breach_action_enum NOT NULL DEFAULT 'ESCALATE',
  -- Escalation target (overrides default_hierarchy escalation)
  "escalation_person_id"  uuid REFERENCES "persons"("id"),
  "escalation_group_id"   uuid REFERENCES "approval_groups"("id"),

  -- Per-step vacancy policy override
  "on_approver_not_found" approver_not_found_action_enum,

  -- FYI-only steps (no reject button, just acknowledge)
  "is_fyi_only"     boolean     NOT NULL DEFAULT false,
  "can_delegate"    boolean     NOT NULL DEFAULT true,
  "is_optional"     boolean     NOT NULL DEFAULT false,

  -- Repeated Approver Rule (Oracle AME): skip if same person already approved earlier
  "skip_if_already_approved" boolean NOT NULL DEFAULT true,

  "is_active"       boolean     NOT NULL DEFAULT true,

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE INDEX IF NOT EXISTS "workflow_steps_v2_def_order_idx"
  ON "workflow_steps_v2" ("workflow_definition_id", "step_order");

-- ─── 6. WORKFLOW_SLA_CALENDARS ───────────────────────────────────────────────
-- UAE working-hours calendar: Sun–Thu 09:00–18:00 GST, Ramadan reduced hours.
-- Shared across all workflow instances; public holidays from public_holidays table.

CREATE TABLE IF NOT EXISTS "workflow_sla_calendars" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "legal_entity_id" uuid        REFERENCES "legal_entities"("id"),

  "calendar_code"   varchar(50) NOT NULL,
  "calendar_name_en" varchar(200) NOT NULL,

  -- Working days bitmask: array of ISO weekday numbers (1=Mon, 7=Sun)
  -- UAE standard: [0,1,2,3,4] = Sun(0)..Thu(4)
  "working_days"    integer[]   NOT NULL DEFAULT '{0,1,2,3,4}',

  -- GST = UTC+4
  "timezone"        varchar(50) NOT NULL DEFAULT 'Asia/Dubai',

  -- Standard day hours (HH:MM 24h)
  "day_start_time"  varchar(5)  NOT NULL DEFAULT '09:00',
  "day_end_time"    varchar(5)  NOT NULL DEFAULT '18:00',

  -- Ramadan reduced hours (null = no Ramadan override)
  "ramadan_start_time" varchar(5),
  "ramadan_end_time"   varchar(5),

  -- Ramadan dates this year (set annually via admin)
  "ramadan_start_date" date,
  "ramadan_end_date"   date,

  "is_active"       boolean     NOT NULL DEFAULT true,
  "is_default"      boolean     NOT NULL DEFAULT false,

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_sla_calendars_code_tenant_uniq"
  ON "workflow_sla_calendars" ("tenant_id", "calendar_code");

-- ─── 7. WORKFLOW_INSTANCES_V2 ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workflow_instances_v2" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "workflow_definition_id" uuid NOT NULL REFERENCES "workflow_definitions_v2"("id"),
  "legal_entity_id" uuid        NOT NULL REFERENCES "legal_entities"("id"),

  "resource_type"   varchar(50) NOT NULL,  -- e.g., 'absence_entry', 'worker_assignment'
  "resource_id"     uuid        NOT NULL,

  "initiated_by_person_id" uuid NOT NULL REFERENCES "persons"("id"),

  "status"          instance_status_enum NOT NULL DEFAULT 'PENDING',
  "current_step_id" uuid        REFERENCES "workflow_steps_v2"("id"),
  "current_step_order" integer  NOT NULL DEFAULT 1,

  -- Immutable snapshot captured at submission (AES-256-GCM encrypted JSONB)
  -- Contains: hierarchy chain resolved at submission time
  "hierarchy_snapshot" jsonb   NOT NULL,
  -- Contains: full request context (leave dates, amount, etc.) at submission
  "context_snapshot"   jsonb   NOT NULL,
  -- Computed chain at submission — all steps with resolved approvers
  "resolved_steps"     jsonb   NOT NULL,

  -- SLA
  "sla_calendar_id"   uuid     REFERENCES "workflow_sla_calendars"("id"),
  "sla_deadline"      timestamptz,
  "escalated_at"      timestamptz,
  "reminder_sent_at"  timestamptz,

  -- Completion
  "started_at"        timestamptz NOT NULL DEFAULT now(),
  "completed_at"      timestamptz,
  "final_decision_by" uuid        REFERENCES "persons"("id"),
  "final_decision_note" text,
  "rejection_reason"  text,

  -- Recall tracking
  "recalled_at"       timestamptz,
  "recalled_by"       uuid        REFERENCES "persons"("id"),
  "recall_reason"     text,

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE INDEX IF NOT EXISTS "workflow_instances_v2_resource_idx"
  ON "workflow_instances_v2" ("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "workflow_instances_v2_initiator_idx"
  ON "workflow_instances_v2" ("initiated_by_person_id");
CREATE INDEX IF NOT EXISTS "workflow_instances_v2_status_idx"
  ON "workflow_instances_v2" ("status");

-- ─── 8. WORKFLOW_STEP_INSTANCES ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workflow_step_instances" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "instance_id"     uuid        NOT NULL REFERENCES "workflow_instances_v2"("id") ON DELETE CASCADE,
  "step_id"         uuid        NOT NULL REFERENCES "workflow_steps_v2"("id"),

  "step_order"      integer     NOT NULL,
  "status"          step_status_enum NOT NULL DEFAULT 'WAITING',

  -- Resolved approver (from hierarchy resolution at submission)
  "assigned_to_person_id"  uuid REFERENCES "persons"("id"),
  "assigned_to_group_id"   uuid REFERENCES "approval_groups"("id"),

  -- Delegation: if this step was delegated
  "delegated_from_person_id" uuid REFERENCES "persons"("id"),
  "delegated_to_person_id"   uuid REFERENCES "persons"("id"),
  "delegated_at"             timestamptz,

  -- Decision
  "decided_by_person_id" uuid   REFERENCES "persons"("id"),
  -- APPROVE | REJECT | DELEGATE | ESCALATE (canonical 3-button + system actions)
  "decision"             varchar(20),
  "decision_note"        text,
  "decided_at"           timestamptz,

  -- SLA tracking for this step
  "sla_deadline"         timestamptz,
  "reminded_at"          timestamptz,

  -- One-click email token (jti of the issued JWT, for blacklisting after use)
  "email_token_jti"      varchar(64),

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE INDEX IF NOT EXISTS "workflow_step_instances_instance_idx"
  ON "workflow_step_instances" ("instance_id");
CREATE INDEX IF NOT EXISTS "workflow_step_instances_assignee_idx"
  ON "workflow_step_instances" ("assigned_to_person_id", "status");

-- ─── 9. WORKFLOW_AUDIT_LOG (INSERT-ONLY via RLS) ─────────────────────────────

CREATE TABLE IF NOT EXISTS "workflow_audit_log" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "instance_id"     uuid        NOT NULL REFERENCES "workflow_instances_v2"("id"),
  "step_instance_id" uuid       REFERENCES "workflow_step_instances"("id"),

  "action"          audit_action_enum NOT NULL,
  "actor_person_id" uuid        REFERENCES "persons"("id"),
  "actor_name"      varchar(200),

  -- IP address + user agent for email token actions
  "ip_address"      inet,
  "user_agent"      text,

  -- Diff or details (encrypted if sensitive)
  "event_data"      jsonb,

  -- Immutable timestamp (no updated_at)
  "logged_at"       timestamptz NOT NULL DEFAULT now()
);

-- 7-year retention index
CREATE INDEX IF NOT EXISTS "workflow_audit_log_instance_idx"
  ON "workflow_audit_log" ("instance_id", "logged_at");
CREATE INDEX IF NOT EXISTS "workflow_audit_log_actor_idx"
  ON "workflow_audit_log" ("actor_person_id", "logged_at");

-- RLS: only INSERT is allowed — no UPDATE, no DELETE
ALTER TABLE "workflow_audit_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_audit_insert_only"
  ON "workflow_audit_log"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "workflow_audit_select_all"
  ON "workflow_audit_log"
  FOR SELECT
  USING (true);

-- Block UPDATE and DELETE at RLS level (no policies defined = deny)

-- ─── 10. WORKFLOW_EMAIL_TOKENS ────────────────────────────────────────────────
-- Single-use JWT blacklist. jti stored after first use; cron purges expired rows.

CREATE TABLE IF NOT EXISTS "workflow_email_tokens" (
  "jti"             varchar(64)  PRIMARY KEY,  -- JWT ID claim
  "tenant_id"       uuid         NOT NULL,
  "instance_id"     uuid         NOT NULL REFERENCES "workflow_instances_v2"("id"),
  "step_instance_id" uuid        NOT NULL REFERENCES "workflow_step_instances"("id"),
  "intended_action" varchar(20)  NOT NULL,     -- APPROVE | REJECT | DELEGATE
  "issued_to_person_id" uuid     NOT NULL REFERENCES "persons"("id"),
  "expires_at"      timestamptz  NOT NULL,
  "used_at"         timestamptz,               -- set on first use; NULL = not yet used
  "ip_address"      inet,
  "created_at"      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_email_tokens_instance_idx"
  ON "workflow_email_tokens" ("instance_id");
CREATE INDEX IF NOT EXISTS "workflow_email_tokens_expires_idx"
  ON "workflow_email_tokens" ("expires_at");

-- ─── 11. WORKFLOW_DELEGATION_RULES ───────────────────────────────────────────
-- Extends the existing approval_delegations table with workflow-type scoping.
-- This is a supplementary rule table; the main delegation lives in transactions.ts.

CREATE TABLE IF NOT EXISTS "workflow_delegation_rules" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "delegator_id"    uuid        NOT NULL REFERENCES "persons"("id"),
  "delegate_id"     uuid        NOT NULL REFERENCES "persons"("id"),
  "legal_entity_id" uuid        NOT NULL REFERENCES "legal_entities"("id"),

  -- Scope: NULL = all workflow types; populated = specific types only
  "workflow_codes"  varchar(50)[],

  "delegation_from" date        NOT NULL,
  "delegation_to"   date        NOT NULL,

  -- Status: ACTIVE | EXPIRED | REVOKED
  "status"          varchar(20) NOT NULL DEFAULT 'ACTIVE',

  "delegation_reason" text,

  "created_by"           uuid        NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz NOT NULL DEFAULT now(),
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

CREATE INDEX IF NOT EXISTS "workflow_delegation_rules_delegator_idx"
  ON "workflow_delegation_rules" ("delegator_id", "status");

-- ─── 12. WORKFLOW_NOTIFICATION_QUEUE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "workflow_notification_queue" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid        NOT NULL,
  "instance_id"     uuid        NOT NULL REFERENCES "workflow_instances_v2"("id"),
  "step_instance_id" uuid       REFERENCES "workflow_step_instances"("id"),

  -- EMAIL | IN_APP | PUSH | WHATSAPP
  "channel"         varchar(20) NOT NULL DEFAULT 'EMAIL',
  "recipient_person_id" uuid    NOT NULL REFERENCES "persons"("id"),
  "recipient_email" varchar(300),

  "template_code"   varchar(100) NOT NULL,
  "subject"         varchar(500),
  "body_html"       text,
  "body_text"       text,

  -- One-click action URL (contains JWT token for email approvals)
  "action_url"      text,

  "status"          notification_status_enum NOT NULL DEFAULT 'QUEUED',
  "send_after"      timestamptz NOT NULL DEFAULT now(),
  "sent_at"         timestamptz,
  "failed_at"       timestamptz,
  "failure_reason"  text,
  "retry_count"     integer NOT NULL DEFAULT 0,

  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_notification_queue_status_idx"
  ON "workflow_notification_queue" ("status", "send_after");
CREATE INDEX IF NOT EXISTS "workflow_notification_queue_instance_idx"
  ON "workflow_notification_queue" ("instance_id");
