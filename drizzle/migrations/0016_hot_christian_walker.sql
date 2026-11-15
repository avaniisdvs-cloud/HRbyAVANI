DO $$ BEGIN
 CREATE TYPE "public"."approver_not_found_action_enum" AS ENUM('ESCALATE_UP', 'USE_FALLBACK', 'ASSIGN_HR_ADMIN', 'BLOCK_WITH_ERROR');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."audit_action_enum" AS ENUM('SUBMITTED', 'STEP_APPROVED', 'STEP_REJECTED', 'STEP_DELEGATED', 'STEP_ESCALATED', 'STEP_SKIPPED', 'INSTANCE_APPROVED', 'INSTANCE_REJECTED', 'INSTANCE_CANCELLED', 'INSTANCE_RECALLED', 'SLA_REMINDER_SENT', 'SLA_ESCALATED', 'TOKEN_ISSUED', 'TOKEN_USED', 'TOKEN_EXPIRED', 'RULE_EVALUATED', 'HIERARCHY_RESOLVED', 'SNAPSHOT_CREATED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."group_member_type_enum" AS ENUM('STATIC', 'DYNAMIC', 'HYBRID');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."group_voting_method_enum" AS ENUM('ANY_ONE', 'MAJORITY', 'ALL', 'WEIGHTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."hierarchy_type_enum" AS ENUM('LINE_MANAGER', 'POSITION', 'CUSTOM_GROUP');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."instance_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED', 'ESCALATED', 'ON_HOLD', 'RECALLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_status_enum" AS ENUM('QUEUED', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sla_breach_action_enum" AS ENUM('ESCALATE', 'AUTO_APPROVE', 'AUTO_REJECT', 'SEND_REMINDER', 'BLOCK_FREEZE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."step_effect_enum" AS ENUM('NORMAL', 'ADD_IF_MATCHES', 'REPLACE', 'SKIP_PREVIOUS', 'INJECT_BEFORE', 'INJECT_AFTER', 'PARALLEL_ADD');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."step_status_enum" AS ENUM('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'DELEGATED', 'ESCALATED', 'SKIPPED', 'AUTO_APPROVED', 'RECALLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"vote_weight" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"group_code" varchar(80) NOT NULL,
	"group_name_en" varchar(200) NOT NULL,
	"group_name_ar" varchar(200),
	"member_type" "group_member_type_enum" DEFAULT 'STATIC' NOT NULL,
	"dynamic_condition" jsonb,
	"voting_method" "group_voting_method_enum" DEFAULT 'ANY_ONE' NOT NULL,
	"min_approvals" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_instance_id" uuid,
	"action" "audit_action_enum" NOT NULL,
	"actor_person_id" uuid,
	"actor_name" varchar(200),
	"ip_address" "inet",
	"user_agent" text,
	"event_data" jsonb,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_definitions_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"workflow_code" varchar(50) NOT NULL,
	"workflow_name_en" varchar(200) NOT NULL,
	"workflow_name_ar" varchar(200),
	"description" text,
	"trigger_event" varchar(50) NOT NULL,
	"selector_rule_id" uuid,
	"default_hierarchy_type" "hierarchy_type_enum" DEFAULT 'LINE_MANAGER' NOT NULL,
	"on_approver_not_found" "approver_not_found_action_enum" DEFAULT 'ESCALATE_UP' NOT NULL,
	"fallback_person_id" uuid,
	"default_sla_hours" integer DEFAULT 48 NOT NULL,
	"default_escalation_hours" integer DEFAULT 72 NOT NULL,
	"requires_medical_cert" boolean DEFAULT false NOT NULL,
	"requires_manager_comment" boolean DEFAULT false NOT NULL,
	"encrypt_snapshot" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_delegation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"delegator_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"workflow_codes" varchar(50)[],
	"delegation_from" date NOT NULL,
	"delegation_to" date NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"delegation_reason" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_email_tokens" (
	"jti" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_instance_id" uuid NOT NULL,
	"intended_action" varchar(20) NOT NULL,
	"issued_to_person_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_instances_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" uuid NOT NULL,
	"initiated_by_person_id" uuid NOT NULL,
	"status" "instance_status_enum" DEFAULT 'PENDING' NOT NULL,
	"current_step_id" uuid,
	"current_step_order" integer DEFAULT 1 NOT NULL,
	"hierarchy_snapshot" jsonb NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"resolved_steps" jsonb NOT NULL,
	"sla_calendar_id" uuid,
	"sla_deadline" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"final_decision_by" uuid,
	"final_decision_note" text,
	"rejection_reason" text,
	"recalled_at" timestamp with time zone,
	"recalled_by" uuid,
	"recall_reason" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_notification_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_instance_id" uuid,
	"channel" varchar(20) DEFAULT 'EMAIL' NOT NULL,
	"recipient_person_id" uuid NOT NULL,
	"recipient_email" varchar(300),
	"template_code" varchar(100) NOT NULL,
	"subject" varchar(500),
	"body_html" text,
	"body_text" text,
	"action_url" text,
	"status" "notification_status_enum" DEFAULT 'QUEUED' NOT NULL,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"rule_code" varchar(80) NOT NULL,
	"rule_name_en" varchar(200) NOT NULL,
	"rule_name_ar" varchar(200),
	"description" text,
	"condition_tree" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_sla_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"calendar_code" varchar(50) NOT NULL,
	"calendar_name_en" varchar(200) NOT NULL,
	"working_days" integer[] DEFAULT '{0,1,2,3,4}' NOT NULL,
	"timezone" varchar(50) DEFAULT 'Asia/Dubai' NOT NULL,
	"day_start_time" varchar(5) DEFAULT '09:00' NOT NULL,
	"day_end_time" varchar(5) DEFAULT '18:00' NOT NULL,
	"ramadan_start_time" varchar(5),
	"ramadan_end_time" varchar(5),
	"ramadan_start_date" date,
	"ramadan_end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_step_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"status" "step_status_enum" DEFAULT 'WAITING' NOT NULL,
	"assigned_to_person_id" uuid,
	"assigned_to_group_id" uuid,
	"delegated_from_person_id" uuid,
	"delegated_to_person_id" uuid,
	"delegated_at" timestamp with time zone,
	"decided_by_person_id" uuid,
	"decision" varchar(20),
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"sla_deadline" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"email_token_jti" varchar(64),
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_steps_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"step_code" varchar(80),
	"step_name_en" varchar(200) NOT NULL,
	"step_name_ar" varchar(200),
	"hierarchy_type" "hierarchy_type_enum" NOT NULL,
	"hierarchy_level" integer,
	"hierarchy_group_id" uuid,
	"hierarchy_role" varchar(100),
	"hierarchy_person_id" uuid,
	"activation_condition_id" uuid,
	"step_effect" "step_effect_enum" DEFAULT 'NORMAL' NOT NULL,
	"effect_target_step_code" varchar(80),
	"sla_hours" integer DEFAULT 48 NOT NULL,
	"on_sla_breach" "sla_breach_action_enum" DEFAULT 'ESCALATE' NOT NULL,
	"escalation_person_id" uuid,
	"escalation_group_id" uuid,
	"on_approver_not_found" "approver_not_found_action_enum",
	"is_fyi_only" boolean DEFAULT false NOT NULL,
	"can_delegate" boolean DEFAULT true NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"skip_if_already_approved" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_entities" ADD COLUMN "emp_number_prefix" varchar(10);
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_entities" ADD COLUMN "emp_number_digits" integer DEFAULT 4 NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legal_entities" ADD COLUMN "emp_number_seed" integer DEFAULT 0 NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_accounts" ADD COLUMN "password_hash" varchar(72);
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_accounts" ADD COLUMN "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_group_members" ADD CONSTRAINT "approval_group_members_group_id_approval_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."approval_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_group_members" ADD CONSTRAINT "approval_group_members_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_groups" ADD CONSTRAINT "approval_groups_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_audit_log" ADD CONSTRAINT "workflow_audit_log_instance_id_workflow_instances_v2_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_audit_log" ADD CONSTRAINT "workflow_audit_log_step_instance_id_workflow_step_instances_id_fk" FOREIGN KEY ("step_instance_id") REFERENCES "public"."workflow_step_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_audit_log" ADD CONSTRAINT "workflow_audit_log_actor_person_id_persons_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_definitions_v2" ADD CONSTRAINT "workflow_definitions_v2_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_definitions_v2" ADD CONSTRAINT "workflow_definitions_v2_selector_rule_id_workflow_rules_id_fk" FOREIGN KEY ("selector_rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_definitions_v2" ADD CONSTRAINT "workflow_definitions_v2_fallback_person_id_persons_id_fk" FOREIGN KEY ("fallback_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_delegation_rules" ADD CONSTRAINT "workflow_delegation_rules_delegator_id_persons_id_fk" FOREIGN KEY ("delegator_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_delegation_rules" ADD CONSTRAINT "workflow_delegation_rules_delegate_id_persons_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_delegation_rules" ADD CONSTRAINT "workflow_delegation_rules_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_email_tokens" ADD CONSTRAINT "workflow_email_tokens_instance_id_workflow_instances_v2_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_email_tokens" ADD CONSTRAINT "workflow_email_tokens_step_instance_id_workflow_step_instances_id_fk" FOREIGN KEY ("step_instance_id") REFERENCES "public"."workflow_step_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_email_tokens" ADD CONSTRAINT "workflow_email_tokens_issued_to_person_id_persons_id_fk" FOREIGN KEY ("issued_to_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_workflow_definition_id_workflow_definitions_v2_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_initiated_by_person_id_persons_id_fk" FOREIGN KEY ("initiated_by_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_current_step_id_workflow_steps_v2_id_fk" FOREIGN KEY ("current_step_id") REFERENCES "public"."workflow_steps_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_sla_calendar_id_workflow_sla_calendars_id_fk" FOREIGN KEY ("sla_calendar_id") REFERENCES "public"."workflow_sla_calendars"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_final_decision_by_persons_id_fk" FOREIGN KEY ("final_decision_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances_v2" ADD CONSTRAINT "workflow_instances_v2_recalled_by_persons_id_fk" FOREIGN KEY ("recalled_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_notification_queue" ADD CONSTRAINT "workflow_notification_queue_instance_id_workflow_instances_v2_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_notification_queue" ADD CONSTRAINT "workflow_notification_queue_step_instance_id_workflow_step_instances_id_fk" FOREIGN KEY ("step_instance_id") REFERENCES "public"."workflow_step_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_notification_queue" ADD CONSTRAINT "workflow_notification_queue_recipient_person_id_persons_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_sla_calendars" ADD CONSTRAINT "workflow_sla_calendars_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_instance_id_workflow_instances_v2_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_step_id_workflow_steps_v2_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps_v2"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_assigned_to_person_id_persons_id_fk" FOREIGN KEY ("assigned_to_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_assigned_to_group_id_approval_groups_id_fk" FOREIGN KEY ("assigned_to_group_id") REFERENCES "public"."approval_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_delegated_from_person_id_persons_id_fk" FOREIGN KEY ("delegated_from_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_delegated_to_person_id_persons_id_fk" FOREIGN KEY ("delegated_to_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_decided_by_person_id_persons_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps_v2" ADD CONSTRAINT "workflow_steps_v2_workflow_definition_id_workflow_definitions_v2_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps_v2" ADD CONSTRAINT "workflow_steps_v2_hierarchy_group_id_approval_groups_id_fk" FOREIGN KEY ("hierarchy_group_id") REFERENCES "public"."approval_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps_v2" ADD CONSTRAINT "workflow_steps_v2_hierarchy_person_id_persons_id_fk" FOREIGN KEY ("hierarchy_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps_v2" ADD CONSTRAINT "workflow_steps_v2_activation_condition_id_workflow_rules_id_fk" FOREIGN KEY ("activation_condition_id") REFERENCES "public"."workflow_rules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps_v2" ADD CONSTRAINT "workflow_steps_v2_escalation_person_id_persons_id_fk" FOREIGN KEY ("escalation_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_steps_v2" ADD CONSTRAINT "workflow_steps_v2_escalation_group_id_approval_groups_id_fk" FOREIGN KEY ("escalation_group_id") REFERENCES "public"."approval_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_group_members_group_idx" ON "approval_group_members" ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_group_members_person_idx" ON "approval_group_members" ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approval_groups_code_tenant_uniq" ON "approval_groups" ("tenant_id","group_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_audit_log_instance_idx" ON "workflow_audit_log" ("instance_id","logged_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_audit_log_actor_idx" ON "workflow_audit_log" ("actor_person_id","logged_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_defs_v2_code_tenant_uniq" ON "workflow_definitions_v2" ("tenant_id","workflow_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_delegation_rules_delegator_idx" ON "workflow_delegation_rules" ("delegator_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_email_tokens_instance_idx" ON "workflow_email_tokens" ("instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_email_tokens_expires_idx" ON "workflow_email_tokens" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instances_v2_resource_idx" ON "workflow_instances_v2" ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instances_v2_initiator_idx" ON "workflow_instances_v2" ("initiated_by_person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instances_v2_status_idx" ON "workflow_instances_v2" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_notification_queue_status_idx" ON "workflow_notification_queue" ("status","send_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_notification_queue_instance_idx" ON "workflow_notification_queue" ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_rules_code_tenant_uniq" ON "workflow_rules" ("tenant_id","rule_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_sla_calendars_code_tenant_uniq" ON "workflow_sla_calendars" ("tenant_id","calendar_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_instances_instance_idx" ON "workflow_step_instances" ("instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_step_instances_assignee_idx" ON "workflow_step_instances" ("assigned_to_person_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_steps_v2_def_order_idx" ON "workflow_steps_v2" ("workflow_definition_id","step_order");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"employee_number" varchar(50),
	"attendance_date" date NOT NULL,
	"time_in" timestamp with time zone,
	"time_out" timestamp with time zone,
	"worked_hours" numeric(5, 2) DEFAULT '0',
	"shift_start" time,
	"shift_end" time,
	"contracted_hours" numeric(4, 2) DEFAULT '8',
	"status" varchar(30) NOT NULL,
	"is_late" boolean DEFAULT false,
	"late_minutes" integer DEFAULT 0,
	"is_early_leave" boolean DEFAULT false,
	"early_leave_minutes" integer DEFAULT 0,
	"is_miss_punch" boolean DEFAULT false,
	"overtime_hours" numeric(4, 2) DEFAULT '0',
	"source" varchar(20) DEFAULT 'DEVICE',
	"device_id" varchar(100),
	"approval_status" varchar(20) DEFAULT 'AUTO',
	"approved_by_id" uuid,
	"approved_by_name" varchar(200),
	"approved_date" timestamp with time zone,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"attendance_record_id" uuid,
	"exception_date" date NOT NULL,
	"exception_type" varchar(30) NOT NULL,
	"reason" text NOT NULL,
	"requested_time_in" timestamp with time zone,
	"requested_time_out" timestamp with time zone,
	"status" varchar(20) DEFAULT 'PENDING',
	"manager_comment" text,
	"reviewed_by_id" uuid,
	"reviewed_by_name" varchar(200),
	"reviewed_date" timestamp with time zone,
	"workflow_instance_id" uuid,
	"is_active" boolean DEFAULT true,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"device_name" varchar(200),
	"sync_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"records_received" integer DEFAULT 0,
	"records_processed" integer DEFAULT 0,
	"records_rejected" integer DEFAULT 0,
	"records_failed" integer DEFAULT 0,
	"status" varchar(20),
	"error_summary" text,
	"created_date" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_punch_raw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"device_id" varchar(100),
	"employee_id_raw" varchar(100),
	"employee_email" varchar(255),
	"punch_timestamp" timestamp with time zone NOT NULL,
	"punch_type" varchar(10),
	"processed" boolean DEFAULT false,
	"rejected" boolean DEFAULT false,
	"reject_reason" varchar(200),
	"created_date" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_attendance_record_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
