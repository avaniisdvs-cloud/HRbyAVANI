CREATE TABLE IF NOT EXISTS "compliance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"rule_id" varchar(30) NOT NULL,
	"module" varchar(30) NOT NULL,
	"entity_types" varchar(20)[] DEFAULT ARRAY['MAINLAND'] NOT NULL,
	"article_ref" text NOT NULL,
	"rule_type" varchar(20) NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text,
	"formula" jsonb,
	"effective_date" date NOT NULL,
	"sunset_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_overridable" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"nationality_scope" varchar(20) DEFAULT 'ALL',
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"object_type" varchar(50) NOT NULL,
	"api_name" varchar(100) NOT NULL,
	"label_en" varchar(200) NOT NULL,
	"label_ar" varchar(200),
	"data_type" varchar(30) NOT NULL,
	"picklist_lookup_type" varchar(100),
	"is_required" boolean DEFAULT false NOT NULL,
	"is_searchable" boolean DEFAULT false NOT NULL,
	"is_encrypted" boolean DEFAULT false NOT NULL,
	"visible_to_department_types" text[],
	"validation_rules" jsonb,
	"default_value" text,
	"help_text_en" text,
	"help_text_ar" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"section_code" varchar(50),
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
CREATE TABLE IF NOT EXISTS "document_type_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"document_type" varchar(50) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"nationality_scope" varchar(20) DEFAULT 'ALL',
	"alert_days_before_expiry" integer[] DEFAULT ARRAY[90,60,30,14] NOT NULL,
	"alert_recipients" text[] DEFAULT ARRAY['HR_ADMIN'] NOT NULL,
	"max_file_size_mb" integer DEFAULT 10 NOT NULL,
	"allowed_mime_types" text[] DEFAULT ARRAY['application/pdf','image/jpeg','image/png'] NOT NULL,
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
CREATE TABLE IF NOT EXISTS "grade_salary_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"grade_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"effective_end_date" date,
	"basic_min" numeric(12, 2) NOT NULL,
	"basic_mid" numeric(12, 2) NOT NULL,
	"basic_max" numeric(12, 2) NOT NULL,
	"housing_type" varchar(20) DEFAULT 'PERCENTAGE' NOT NULL,
	"housing_value" numeric(10, 4) DEFAULT '0.25' NOT NULL,
	"transport_type" varchar(20) DEFAULT 'FIXED_AMOUNT' NOT NULL,
	"transport_value" numeric(10, 4) DEFAULT '1500' NOT NULL,
	"phone_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"car_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" char(3) DEFAULT 'AED' NOT NULL,
	"steps_json" jsonb,
	"approved_by" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_rule_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"leave_rule_set_id" uuid NOT NULL,
	"absence_type_code" varchar(30) NOT NULL,
	"entitlement_tiers_json" jsonb NOT NULL,
	"max_carry_forward_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carry_forward_expiry_months" integer DEFAULT 0 NOT NULL,
	"is_pro_rated" boolean DEFAULT true NOT NULL,
	"accrual_frequency" varchar(20) DEFAULT 'MONTHLY' NOT NULL,
	"min_service_months" integer DEFAULT 0 NOT NULL,
	"max_days_per_year" numeric(6, 2),
	"encashment_allowed" boolean DEFAULT false NOT NULL,
	"encashment_max_days" numeric(5, 1),
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
CREATE TABLE IF NOT EXISTS "leave_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"rule_set_code" varchar(50) NOT NULL,
	"rule_set_name_en" varchar(200) NOT NULL,
	"rule_set_name_ar" varchar(200),
	"entity_type_scope" varchar(20),
	"nationality_scope" varchar(20) DEFAULT 'ALL',
	"employment_type_scope" varchar(30) DEFAULT 'ALL',
	"effective_from" date NOT NULL,
	"effective_to" date,
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
CREATE TABLE IF NOT EXISTS "medical_insurance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"plan_code" varchar(50) NOT NULL,
	"plan_name_en" varchar(200) NOT NULL,
	"plan_name_ar" varchar(200),
	"provider_name" varchar(200) NOT NULL,
	"tpa_name" varchar(200),
	"policy_number" varchar(100) NOT NULL,
	"network_name" varchar(100),
	"plan_category" varchar(30) NOT NULL,
	"inpatient_limit_aed" numeric(12, 2),
	"outpatient_limit_aed" numeric(12, 2),
	"dental_covered" boolean DEFAULT false NOT NULL,
	"optical_covered" boolean DEFAULT false NOT NULL,
	"maternity_covered" boolean DEFAULT true NOT NULL,
	"pre_existing_covered" boolean DEFAULT false NOT NULL,
	"repatriation_covered" boolean DEFAULT false NOT NULL,
	"grade_ids" uuid[],
	"employment_types" text[],
	"min_service_months" integer DEFAULT 0 NOT NULL,
	"dependents_covered" boolean DEFAULT true NOT NULL,
	"max_dependents" integer DEFAULT 9 NOT NULL,
	"employee_premium_aed" numeric(10, 2) NOT NULL,
	"spouse_premium_aed" numeric(10, 2),
	"child_premium_aed" numeric(10, 2),
	"parent_premium_aed" numeric(10, 2),
	"policy_start_date" date NOT NULL,
	"policy_end_date" date NOT NULL,
	"renewal_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default_plan" boolean DEFAULT false NOT NULL,
	"regulatory_scheme" varchar(20),
	"employer_contribution_pct" numeric(5, 2) DEFAULT '100' NOT NULL,
	"eligible_grade_level_min" integer,
	"eligible_grade_level_max" integer,
	"coverage_details_json" jsonb,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"template_code" varchar(100) NOT NULL,
	"template_name_en" varchar(200) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"subject_en" varchar(500),
	"subject_ar" varchar(500),
	"body_en" text NOT NULL,
	"body_ar" text,
	"available_vars_json" jsonb,
	"recipient_roles" text[] DEFAULT ARRAY['EMPLOYEE'] NOT NULL,
	"advance_notice_days" integer[],
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
CREATE TABLE IF NOT EXISTS "policy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"setting_key" varchar(200) NOT NULL,
	"setting_name_en" varchar(300) NOT NULL,
	"setting_name_ar" varchar(300),
	"value_type" varchar(20) DEFAULT 'STRING' NOT NULL,
	"setting_value" text NOT NULL,
	"module_code" varchar(50) NOT NULL,
	"is_overridable" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"holiday_year" integer NOT NULL,
	"holiday_code" varchar(30) NOT NULL,
	"holiday_name_en" varchar(200) NOT NULL,
	"holiday_name_ar" varchar(200) NOT NULL,
	"holiday_date" date NOT NULL,
	"end_date" date,
	"duration_days" integer DEFAULT 1 NOT NULL,
	"is_floating" boolean DEFAULT false NOT NULL,
	"announced_date" date,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"applies_to" varchar(20) DEFAULT 'ALL' NOT NULL,
	"emirate" varchar(50),
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_schedule_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"work_schedule_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"is_working_day" boolean DEFAULT true NOT NULL,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"break_minutes" integer DEFAULT 60 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"schedule_code" varchar(30) NOT NULL,
	"schedule_name_en" varchar(200) NOT NULL,
	"schedule_name_ar" varchar(200),
	"schedule_type" varchar(30) DEFAULT 'STANDARD' NOT NULL,
	"monday_start" varchar(5),
	"monday_end" varchar(5),
	"tuesday_start" varchar(5),
	"tuesday_end" varchar(5),
	"wednesday_start" varchar(5),
	"wednesday_end" varchar(5),
	"thursday_start" varchar(5),
	"thursday_end" varchar(5),
	"friday_start" varchar(5),
	"friday_end" varchar(5),
	"saturday_start" varchar(5),
	"saturday_end" varchar(5),
	"sunday_start" varchar(5),
	"sunday_end" varchar(5),
	"total_hours_per_week" numeric(5, 2) DEFAULT '48.00' NOT NULL,
	"weekend_days" integer[] DEFAULT ARRAY[5,6] NOT NULL,
	"break_minutes" integer DEFAULT 60 NOT NULL,
	"is_ramadan_schedule" boolean DEFAULT false NOT NULL,
	"ramadan_hours_per_day" numeric(4, 2) DEFAULT '6.00',
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
CREATE TABLE IF NOT EXISTS "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"workflow_code" varchar(50) NOT NULL,
	"workflow_name_en" varchar(200) NOT NULL,
	"workflow_name_ar" varchar(200),
	"trigger_event" varchar(50) NOT NULL,
	"condition_rules" jsonb,
	"approval_mode" varchar(20) DEFAULT 'SEQUENTIAL' NOT NULL,
	"sla_hours" integer DEFAULT 48 NOT NULL,
	"escalation_hours" integer DEFAULT 72 NOT NULL,
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
CREATE TABLE IF NOT EXISTS "workflow_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"condition_field" varchar(100) NOT NULL,
	"condition_operator" varchar(20) NOT NULL,
	"condition_value" text NOT NULL,
	"logical_operator" varchar(5) DEFAULT 'AND' NOT NULL,
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
CREATE TABLE IF NOT EXISTS "workflow_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"stage_order" integer NOT NULL,
	"stage_name_en" varchar(200) NOT NULL,
	"stage_name_ar" varchar(200),
	"approver_type" varchar(20) NOT NULL,
	"approver_role_code" varchar(50),
	"approver_person_id" uuid,
	"dynamic_approver_expr" varchar(200),
	"can_delegate" boolean DEFAULT true NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"stage_sla_hours" integer DEFAULT 24 NOT NULL,
	"action_type" varchar(30) DEFAULT 'APPROVE_REJECT' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "absence_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"absence_type_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"balance_year" integer NOT NULL,
	"opening_balance_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"accrued_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"taken_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"pending_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"adjusted_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"carried_forward_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"forfeited_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"closing_balance_days" numeric(6, 2),
	"last_accrual_date" date,
	"next_accrual_date" date,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "absence_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"absence_type_id" uuid NOT NULL,
	"request_number" varchar(30) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"duration_days" numeric(6, 2) NOT NULL,
	"duration_hours" numeric(6, 2),
	"is_half_day" boolean DEFAULT false NOT NULL,
	"half_day_period" varchar(10),
	"return_date" date,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"submitted_via" varchar(20) DEFAULT 'PORTAL' NOT NULL,
	"submitted_by" uuid NOT NULL,
	"approved_by" uuid,
	"approval_date" timestamp with time zone,
	"rejection_reason" text,
	"workflow_instance_id" uuid,
	"aria_recommendation" varchar(20),
	"aria_confidence_score" numeric(5, 4),
	"aria_recommendation_json" jsonb,
	"payroll_element_code" varchar(50),
	"payroll_run_id" uuid,
	"pay_deduction_amount" numeric(12, 2),
	"medical_cert_required" boolean DEFAULT false NOT NULL,
	"medical_cert_uploaded" boolean DEFAULT false NOT NULL,
	"medical_cert_document_id" uuid,
	"medical_cert_deadline" date,
	"balance_before_days" numeric(6, 2),
	"balance_after_days" numeric(6, 2),
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "absence_entries_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "absence_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"plan_code" varchar(50) NOT NULL,
	"plan_name_en" varchar(200) NOT NULL,
	"plan_name_ar" varchar(200),
	"accrual_method" varchar(30) NOT NULL,
	"carry_forward_max_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"carry_forward_expiry_months" integer DEFAULT 0 NOT NULL,
	"allow_negative_balance" boolean DEFAULT false NOT NULL,
	"accrual_ceiling_days" numeric(6, 2),
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
CREATE TABLE IF NOT EXISTS "absence_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"absence_plan_id" uuid,
	"type_code" varchar(30) NOT NULL,
	"type_name_en" varchar(200) NOT NULL,
	"type_name_ar" varchar(200),
	"is_statutory" boolean DEFAULT true NOT NULL,
	"is_paid" varchar(20) NOT NULL,
	"requires_medical_cert" boolean DEFAULT false NOT NULL,
	"cert_required_after_days" integer DEFAULT 1,
	"gender_restriction" varchar(10),
	"religion_restriction" varchar(30),
	"max_days_per_year" numeric(6, 2),
	"max_consecutive_days" numeric(6, 2),
	"min_service_months" integer DEFAULT 0 NOT NULL,
	"min_notice_days" integer DEFAULT 0 NOT NULL,
	"payroll_element_code" varchar(50),
	"approval_required" boolean DEFAULT true NOT NULL,
	"is_one_time_per_employment" boolean DEFAULT false NOT NULL,
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
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"event_time" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_name" varchar(200) NOT NULL,
	"actor_role" varchar(50) NOT NULL,
	"actor_entity_id" uuid,
	"channel" varchar(30) NOT NULL,
	"ip_address" text,
	"device_info" varchar(300),
	"session_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" uuid,
	"entity_id" uuid,
	"old_values" jsonb,
	"new_values" jsonb,
	"changed_fields" text[],
	"metadata" jsonb,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"gl_segment_code" varchar(50),
	"head_person_id" uuid,
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
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"contract_number" varchar(50) NOT NULL,
	"contract_type" varchar(30) DEFAULT 'FIXED_TERM' NOT NULL,
	"employment_type" varchar(30) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"probation_start" date,
	"probation_end" date,
	"notice_period_days" integer NOT NULL,
	"working_hours_per_week" numeric(5, 2) DEFAULT '48.00' NOT NULL,
	"work_location" varchar(30) DEFAULT 'OFFICE' NOT NULL,
	"signed_by_employee" boolean DEFAULT false NOT NULL,
	"signed_date" date,
	"contract_document_id" uuid,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"previous_contract_id" uuid,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"termination_date" date,
	"termination_reason" varchar(200),
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"department_type" varchar(50),
	"cost_centre_code" varchar(50),
	"gl_account_code" varchar(50),
	"approved_headcount" integer DEFAULT 0 NOT NULL,
	"head_person_id" uuid,
	"parent_department_id" uuid,
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
CREATE TABLE IF NOT EXISTS "employment_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"assignment_id" uuid,
	"action_type" varchar(50) NOT NULL,
	"action_date" date NOT NULL,
	"effective_date" date NOT NULL,
	"reason_code" varchar(50),
	"reason_text" varchar(500),
	"before_department_id" uuid,
	"before_position_id" uuid,
	"before_grade_id" uuid,
	"before_location_id" uuid,
	"before_manager_id" uuid,
	"before_basic_salary" numeric(12, 2),
	"before_employment_type" varchar(30),
	"before_status" varchar(30),
	"after_department_id" uuid,
	"after_position_id" uuid,
	"after_grade_id" uuid,
	"after_location_id" uuid,
	"after_manager_id" uuid,
	"after_basic_salary" numeric(12, 2),
	"after_employment_type" varchar(30),
	"after_status" varchar(30),
	"workflow_instance_id" uuid,
	"initiated_by" uuid NOT NULL,
	"approved_by" uuid,
	"approval_date" date,
	"approval_notes" text,
	"rejection_reason" text,
	"status" varchar(30) DEFAULT 'APPROVED' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eosb_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"calculation_type" varchar(30) NOT NULL,
	"calculation_date" date NOT NULL,
	"hire_date" date NOT NULL,
	"termination_date" date,
	"basic_salary_at_calc" numeric(12, 2) NOT NULL,
	"total_unpaid_leave_days" integer DEFAULT 0 NOT NULL,
	"total_calendar_days" integer NOT NULL,
	"net_service_days" integer NOT NULL,
	"service_years" numeric(8, 4) NOT NULL,
	"daily_rate" numeric(12, 4) NOT NULL,
	"days_rate_years_1_to_5" integer DEFAULT 21 NOT NULL,
	"days_rate_years_beyond_5" integer DEFAULT 30 NOT NULL,
	"eosb_first_5_years" numeric(14, 2) DEFAULT '0' NOT NULL,
	"eosb_beyond_5_years" numeric(14, 2) DEFAULT '0' NOT NULL,
	"eosb_before_cap" numeric(14, 2) NOT NULL,
	"cap_amount" numeric(14, 2),
	"is_capped" boolean DEFAULT false NOT NULL,
	"eosb_final_amount" numeric(14, 2) NOT NULL,
	"part_time_ratio" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"eosb_after_ratio" numeric(14, 2) NOT NULL,
	"payroll_run_id" uuid,
	"employment_action_id" uuid,
	"calculation_formula_json" jsonb,
	"triggered_by_user" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"grade_code" varchar(20) NOT NULL,
	"grade_name_en" varchar(100) NOT NULL,
	"grade_name_ar" varchar(100),
	"grade_level" integer NOT NULL,
	"min_salary" numeric(12, 2),
	"max_salary" numeric(12, 2),
	"mid_salary" numeric(12, 2),
	"notice_period_days" integer DEFAULT 30 NOT NULL,
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
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"job_code" varchar(30) NOT NULL,
	"job_title_en" varchar(200) NOT NULL,
	"job_title_ar" varchar(200),
	"job_family" varchar(100),
	"job_function" varchar(100),
	"min_grade_id" uuid,
	"max_grade_id" uuid,
	"is_emiratisation_target" boolean DEFAULT false NOT NULL,
	"is_management_role" boolean DEFAULT false NOT NULL,
	"is_exempt_from_overtime" boolean DEFAULT false NOT NULL,
	"job_description_en" text,
	"job_description_ar" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "jobs_job_code_unique" UNIQUE("job_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"entity_code" varchar(20) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"trade_licence_number" varchar(100),
	"trade_licence_expiry" date,
	"registration_number" varchar(100),
	"entity_type" varchar(20) DEFAULT 'MAINLAND' NOT NULL,
	"jurisdiction" varchar(100) DEFAULT 'Dubai' NOT NULL,
	"eosb_scheme" varchar(20) DEFAULT 'TRADITIONAL' NOT NULL,
	"wps_employer_code" varchar(50),
	"mohre_establishment_id" varchar(50),
	"default_currency" char(3) DEFAULT 'AED' NOT NULL,
	"default_language" varchar(10) DEFAULT 'en' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "legal_entities_entity_code_unique" UNIQUE("entity_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"address_line1" varchar(300),
	"address_line2" varchar(300),
	"city" varchar(100),
	"emirate" varchar(50),
	"country" char(3) DEFAULT 'ARE' NOT NULL,
	"po_box" varchar(20),
	"phone" varchar(30),
	"timezone" varchar(50) DEFAULT 'Asia/Dubai' NOT NULL,
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
CREATE TABLE IF NOT EXISTS "lookup_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"lookup_type" varchar(100) NOT NULL,
	"lookup_code" varchar(50) NOT NULL,
	"value_en" varchar(200) NOT NULL,
	"value_ar" varchar(200),
	"sort_order" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE IF NOT EXISTS "payroll_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"payroll_code" varchar(30) NOT NULL,
	"payroll_name_en" varchar(200) NOT NULL,
	"payroll_name_ar" varchar(200),
	"pay_frequency" varchar(20) DEFAULT 'MONTHLY' NOT NULL,
	"payment_day_of_month" integer DEFAULT 25 NOT NULL,
	"currency" char(3) DEFAULT 'AED' NOT NULL,
	"legislative_data_group" varchar(50) DEFAULT 'UAE' NOT NULL,
	"oracle_ledger_id" varchar(50),
	"wps_bank_code" varchar(20),
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
CREATE TABLE IF NOT EXISTS "payroll_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"assignment_id" uuid,
	"basic_salary" numeric(12, 2) DEFAULT '0' NOT NULL,
	"housing_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"transport_allowance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_allowances" numeric(12, 2) DEFAULT '0' NOT NULL,
	"overtime_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bonus" numeric(12, 2) DEFAULT '0' NOT NULL,
	"commission" numeric(12, 2) DEFAULT '0' NOT NULL,
	"retro_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_gross_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sick_leave_deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unpaid_leave_deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"salary_advance_deduct" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gpssa_employee_deduct" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medical_insurance_deduct" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gpssa_employer_contrib" numeric(12, 2) DEFAULT '0' NOT NULL,
	"eosb_provision" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medical_insurance_er" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_employer_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"iban" varchar(23),
	"bank_code" varchar(20),
	"payment_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"payment_reference" varchar(100),
	"prior_month_net_pay" numeric(12, 2),
	"variance_pct" numeric(8, 4),
	"is_variance_flagged" boolean DEFAULT false NOT NULL,
	"variance_reason" text,
	"ytd_gross_pay" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ytd_net_pay" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ytd_eosb_provision" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ytd_gpssa" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"payroll_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"run_number" varchar(30) NOT NULL,
	"pay_period_start" date NOT NULL,
	"pay_period_end" date NOT NULL,
	"payment_date" date NOT NULL,
	"run_type" varchar(20) DEFAULT 'REGULAR' NOT NULL,
	"status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"employee_count" integer,
	"total_gross_pay" numeric(14, 2),
	"total_deductions" numeric(14, 2),
	"total_net_pay" numeric(14, 2),
	"total_employer_cost" numeric(14, 2),
	"total_eosb_provision" numeric(14, 2),
	"total_gpssa_employer" numeric(14, 2),
	"sif_file_reference" varchar(300),
	"sif_generated_at" timestamp with time zone,
	"wps_submission_date" timestamp with time zone,
	"wps_confirmation_ref" varchar(100),
	"wps_confirmation_date" timestamp with time zone,
	"wps_deadline" date,
	"gl_journal_reference" varchar(100),
	"gl_posted_date" timestamp with time zone,
	"gl_posted_by" uuid,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"lock_reason" text,
	"finance_approved_by" uuid,
	"finance_approval_date" timestamp with time zone,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "payroll_runs_run_number_unique" UNIQUE("run_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"address_type" varchar(30) NOT NULL,
	"address_line1" varchar(300) NOT NULL,
	"address_line2" varchar(300),
	"city" varchar(100) NOT NULL,
	"state_emirate" varchar(100),
	"postal_code" varchar(20),
	"country" char(3) NOT NULL,
	"po_box" varchar(20),
	"is_primary" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"bank_name" varchar(200) NOT NULL,
	"bank_code" varchar(20) NOT NULL,
	"iban" varchar(500) NOT NULL,
	"account_name" varchar(200) NOT NULL,
	"account_type" varchar(30) DEFAULT 'CURRENT' NOT NULL,
	"currency" char(3) DEFAULT 'AED' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"is_wps_account" boolean DEFAULT true NOT NULL,
	"verified_by" uuid,
	"verified_date" date,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"contact_type" varchar(30) NOT NULL,
	"contact_value" varchar(200) NOT NULL,
	"country_code" varchar(10),
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_date" date,
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
CREATE TABLE IF NOT EXISTS "person_dependents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"dependent_number" integer NOT NULL,
	"relationship" varchar(30) NOT NULL,
	"first_name_en" varchar(100) NOT NULL,
	"middle_name_en" varchar(100),
	"last_name_en" varchar(100) NOT NULL,
	"full_name_ar" varchar(300) NOT NULL,
	"date_of_birth" date NOT NULL,
	"gender" varchar(20) NOT NULL,
	"nationality_code" char(3) NOT NULL,
	"passport_number" varchar(500),
	"passport_country" char(3),
	"passport_issue_date" date,
	"passport_expiry" date,
	"passport_document_id" uuid,
	"emirates_id" varchar(500),
	"emirates_id_expiry" date,
	"emirates_id_document_id" uuid,
	"visa_number" varchar(30),
	"visa_type" varchar(50),
	"visa_issue_date" date,
	"visa_expiry" date,
	"visa_status" varchar(30) DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"visa_document_id" uuid,
	"visa_sponsored_by_company" boolean DEFAULT false NOT NULL,
	"visa_sponsor_person_id" uuid,
	"is_on_company_insurance" boolean DEFAULT false NOT NULL,
	"insurance_plan_id" uuid,
	"insurance_card_number" varchar(100),
	"insurance_member_id" varchar(100),
	"insurance_provider_name" varchar(200),
	"insurance_network" varchar(100),
	"insurance_category" varchar(50),
	"insurance_effective_date" date,
	"insurance_expiry_date" date,
	"insurance_status" varchar(30) DEFAULT 'NOT_ENROLLED' NOT NULL,
	"insurance_document_id" uuid,
	"annual_premium_aed" numeric(10, 2),
	"employer_premium_aed" numeric(10, 2),
	"employee_premium_aed" numeric(10, 2),
	"has_disability" boolean DEFAULT false NOT NULL,
	"disability_type" varchar(200),
	"disability_certificate_id" uuid,
	"approval_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"approval_date" date,
	"rejection_reason" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"removal_reason" varchar(200),
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"document_title" varchar(200) NOT NULL,
	"document_number" varchar(100),
	"issuing_authority" varchar(200),
	"issuing_country" char(3),
	"issue_date" date,
	"expiry_date" date,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"alert_days_before_expiry" integer[] DEFAULT ARRAY[90,60,30,14] NOT NULL,
	"storage_key" varchar(500),
	"file_name" varchar(300),
	"file_size_bytes" integer,
	"mime_type" varchar(100),
	"checksum_sha256" varchar(64),
	"document_status" varchar(30) DEFAULT 'VALID' NOT NULL,
	"verified_by" uuid,
	"verified_date" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"institution_name" varchar(300) NOT NULL,
	"degree_type" varchar(100),
	"field_of_study" varchar(200),
	"country" char(3),
	"start_year" integer,
	"graduation_year" integer,
	"is_highest_degree" boolean DEFAULT false NOT NULL,
	"document_id" uuid,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"contact_name_en" varchar(200) NOT NULL,
	"contact_name_ar" varchar(200),
	"relationship" varchar(50) NOT NULL,
	"phone_primary" varchar(30) NOT NULL,
	"phone_secondary" varchar(30),
	"email" varchar(200),
	"address" text,
	"country" char(3),
	"priority_order" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_professional_certs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"cert_name" varchar(300) NOT NULL,
	"cert_number" varchar(100),
	"issuing_body" varchar(200),
	"issue_date" date,
	"expiry_date" date,
	"is_mandatory_for_role" boolean DEFAULT false NOT NULL,
	"document_id" uuid,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_number" varchar(30) NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"first_name_en" varchar(100) NOT NULL,
	"middle_name_en" varchar(100),
	"last_name_en" varchar(100) NOT NULL,
	"full_name_en" text,
	"full_name_ar" varchar(300) NOT NULL,
	"preferred_name" varchar(100),
	"salutation" varchar(20),
	"date_of_birth" date NOT NULL,
	"gender" varchar(20) NOT NULL,
	"marital_status" varchar(30),
	"number_of_dependents" integer DEFAULT 0 NOT NULL,
	"nationality_code" char(3) NOT NULL,
	"nationality_category" varchar(20) NOT NULL,
	"religion" varchar(50),
	"religion_consent_given" boolean DEFAULT false NOT NULL,
	"emirates_id" varchar(500),
	"emirates_id_expiry" date,
	"passport_number" varchar(500),
	"passport_country" char(3),
	"passport_issue_date" date,
	"passport_expiry" date,
	"visa_number" varchar(30),
	"visa_type" varchar(50),
	"visa_issue_date" date,
	"visa_expiry" date,
	"visa_status" varchar(30),
	"labour_card_number" varchar(50),
	"labour_card_expiry" date,
	"mohre_labour_permit_number" varchar(50),
	"family_book_number" varchar(50),
	"nafis_registration_number" varchar(50),
	"employment_type" varchar(30) NOT NULL,
	"contracted_hours_per_week" numeric(5, 2) DEFAULT '48.00' NOT NULL,
	"assignment_status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"hire_date" date NOT NULL,
	"seniority_date" date,
	"original_hire_date" date,
	"probation_end_date" date,
	"notice_period_days" integer DEFAULT 30 NOT NULL,
	"separation_date" date,
	"separation_reason" varchar(100),
	"current_position_id" uuid,
	"current_job_id" uuid,
	"current_department_id" uuid,
	"current_location_id" uuid,
	"current_grade_id" uuid,
	"line_manager_id" uuid,
	"dotted_line_manager_id" uuid,
	"hr_representative_id" uuid,
	"payroll_id" uuid,
	"pay_frequency" varchar(20) DEFAULT 'MONTHLY' NOT NULL,
	"basic_salary" numeric(12, 2),
	"total_package" numeric(12, 2),
	"insurance_plan_id" uuid,
	"insurance_card_number" varchar(100),
	"insurance_member_id" varchar(100),
	"insurance_provider_name" varchar(200),
	"insurance_network" varchar(100),
	"insurance_category" varchar(50),
	"insurance_effective_date" date,
	"insurance_expiry_date" date,
	"insurance_status" varchar(30) DEFAULT 'NOT_ENROLLED' NOT NULL,
	"insurance_document_id" uuid,
	"annual_premium_aed" numeric(10, 2),
	"employer_premium_aed" numeric(10, 2),
	"employee_premium_aed" numeric(10, 2),
	"dependent_count_insured" integer DEFAULT 0 NOT NULL,
	"preferred_language" varchar(10) DEFAULT 'en' NOT NULL,
	"notification_channel" varchar(30) DEFAULT 'PUSH_AND_EMAIL' NOT NULL,
	"is_system_user" boolean DEFAULT false NOT NULL,
	"user_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"data_quality_score" numeric(5, 2),
	"profile_completion_date" date,
	"extra_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "persons_person_number_unique" UNIQUE("person_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"department_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"position_code" varchar(30) NOT NULL,
	"position_title_en" varchar(200) NOT NULL,
	"position_title_ar" varchar(200),
	"grade_id" uuid,
	"location_id" uuid,
	"fte_count" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"is_occupied" boolean DEFAULT false NOT NULL,
	"occupied_by_person_id" uuid,
	"reports_to_position_id" uuid,
	"budget_amount" numeric(14, 2),
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
CREATE TABLE IF NOT EXISTS "salary_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"payroll_id" uuid NOT NULL,
	"element_code" varchar(50) NOT NULL,
	"element_name_en" varchar(200) NOT NULL,
	"element_name_ar" varchar(200),
	"element_classification" varchar(30) NOT NULL,
	"amount" numeric(14, 2),
	"percentage_basis" varchar(30),
	"percentage_value" numeric(6, 4),
	"currency" char(3) DEFAULT 'AED' NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"effective_start_date" date NOT NULL,
	"effective_end_date" date,
	"processing_order" integer DEFAULT 100 NOT NULL,
	"is_subject_to_eosb" boolean DEFAULT false NOT NULL,
	"is_subject_to_gpssa" boolean DEFAULT false NOT NULL,
	"is_wps_reportable" boolean DEFAULT true NOT NULL,
	"gl_account_code" varchar(50),
	"oracle_element_id" varchar(50),
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"assignment_number" varchar(30) NOT NULL,
	"effective_start_date" date NOT NULL,
	"effective_end_date" date,
	"assignment_status" varchar(30) NOT NULL,
	"position_id" uuid,
	"job_id" uuid,
	"department_id" uuid NOT NULL,
	"location_id" uuid,
	"grade_id" uuid,
	"business_unit_id" uuid,
	"line_manager_id" uuid,
	"dotted_line_manager_id" uuid,
	"employment_type" varchar(30) NOT NULL,
	"contracted_hours_per_week" numeric(5, 2) DEFAULT '48.00' NOT NULL,
	"work_schedule_id" uuid,
	"action_type" varchar(50) NOT NULL,
	"action_reason" varchar(200),
	"action_initiated_by" uuid NOT NULL,
	"action_approved_by" uuid,
	"action_approval_date" date,
	"primary_cost_centre_code" varchar(50),
	"secondary_cost_centre_code" varchar(50),
	"cost_split_percentage" numeric(5, 2),
	"is_current" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"delegator_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"delegation_from" date NOT NULL,
	"delegation_to" date NOT NULL,
	"scope_types" text[],
	"reason" text,
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
CREATE TABLE IF NOT EXISTS "blackout_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"department_id" uuid,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"absence_type_codes" text[],
	"min_coverage_pct" integer DEFAULT 100 NOT NULL,
	"reason" text,
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
CREATE TABLE IF NOT EXISTS "dews_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"payroll_run_id" uuid,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"service_band" varchar(20) NOT NULL,
	"contribution_rate" numeric(6, 4) NOT NULL,
	"basic_salary" numeric(14, 2) NOT NULL,
	"contribution_amount" numeric(14, 2) NOT NULL,
	"fund_manager" varchar(200) DEFAULT 'Zurich International Life' NOT NULL,
	"fund_reference" varchar(100),
	"submission_date" date,
	"submission_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"submission_ref" varchar(100),
	"due_date" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gl_journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"journal_header_ref" varchar(100),
	"line_number" integer NOT NULL,
	"account_code" varchar(50) NOT NULL,
	"cost_centre_code" varchar(50),
	"department_id" uuid,
	"element_code" varchar(50),
	"debit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description_en" varchar(300),
	"description_ar" varchar(300),
	"currency" char(3) DEFAULT 'AED' NOT NULL,
	"posting_date" date NOT NULL,
	"oracle_batch_id" varchar(100),
	"oracle_journal_id" varchar(100),
	"posting_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gpssa_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"payroll_run_id" uuid,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"basic_salary" numeric(14, 2) NOT NULL,
	"employer_rate" numeric(6, 4) DEFAULT '0.1500' NOT NULL,
	"employee_rate" numeric(6, 4) DEFAULT '0.0500' NOT NULL,
	"employer_amount" numeric(14, 2) NOT NULL,
	"employee_amount" numeric(14, 2) NOT NULL,
	"total_contribution" numeric(14, 2) NOT NULL,
	"gpssa_member_id" varchar(50),
	"due_date" date NOT NULL,
	"submission_date" date,
	"submission_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"submission_ref" varchar(100),
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medical_insurance_enrolments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"enrolment_type" varchar(20) DEFAULT 'EMPLOYEE' NOT NULL,
	"dependent_id" uuid,
	"insurance_card_number" varchar(100),
	"insurance_member_id" varchar(100) NOT NULL,
	"effective_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"annual_premium_aed" numeric(10, 2) NOT NULL,
	"employer_premium_aed" numeric(10, 2) NOT NULL,
	"employee_premium_aed" numeric(10, 2) DEFAULT '0' NOT NULL,
	"enrolment_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"card_document_id" uuid,
	"submitted_to_insurer_date" date,
	"insurer_reference" varchar(100),
	"cancellation_date" date,
	"cancellation_reason" varchar(200),
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medical_insurance_policy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"max_dependents_per_employee" integer DEFAULT 9 NOT NULL,
	"max_spouses" integer DEFAULT 1 NOT NULL,
	"max_children" integer DEFAULT 9 NOT NULL,
	"parents_covered" boolean DEFAULT false NOT NULL,
	"parents_in_law_covered" boolean DEFAULT false NOT NULL,
	"child_max_age" integer DEFAULT 18 NOT NULL,
	"child_student_extension_age" integer DEFAULT 25 NOT NULL,
	"employer_pays_spouse" boolean DEFAULT true NOT NULL,
	"employer_pays_children" boolean DEFAULT true NOT NULL,
	"employer_pays_parents" boolean DEFAULT false NOT NULL,
	"employee_dependent_cost_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"auto_enrol_on_hire" boolean DEFAULT true NOT NULL,
	"enrolment_grace_days" integer DEFAULT 30 NOT NULL,
	"dependent_add_grace_days" integer DEFAULT 30 NOT NULL,
	"renewal_alert_days" integer[] DEFAULT ARRAY[90,60,30,14] NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "medical_insurance_policy_settings_legal_entity_id_unique" UNIQUE("legal_entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"recipient_person_id" uuid NOT NULL,
	"notification_type" varchar(100) NOT NULL,
	"channel" varchar(30) NOT NULL,
	"subject_en" varchar(500),
	"subject_ar" varchar(500),
	"body_en" text,
	"body_ar" text,
	"reference_type" varchar(100),
	"reference_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"checklist_id" uuid NOT NULL,
	"item_code" varchar(50) NOT NULL,
	"item_name_en" varchar(300) NOT NULL,
	"item_name_ar" varchar(300),
	"category" varchar(50),
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"due_days_from_start" integer,
	"assigned_to_role" varchar(50),
	"assigned_person_id" uuid,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"completed_by" uuid,
	"completed_date" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"checklist_type" varchar(20) DEFAULT 'ONBOARDING' NOT NULL,
	"initiated_date" date NOT NULL,
	"target_date" date,
	"status" varchar(30) DEFAULT 'IN_PROGRESS' NOT NULL,
	"completion_date" date,
	"completion_pct" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"user_account_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"device_info" varchar(300),
	"ip_address" "inet",
	"sso_provider" varchar(20),
	"sso_session_id" varchar(500),
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(50),
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sso_provider_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"provider_type" varchar(20) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"oracle_idcs_tenant_url" varchar(500),
	"oracle_sp_entity_id" varchar(500),
	"oracle_idp_metadata_url" varchar(500),
	"oracle_idp_cert_expiry" date,
	"ms_tenant_id" varchar(100),
	"ms_client_id" varchar(100),
	"ms_authority_url" varchar(500),
	"metadata_last_refreshed" timestamp with time zone,
	"email_domain_hints" text[],
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"daily_hours" numeric(4,2)[] DEFAULT ARRAY[0,0,0,0,0,0,0]::numeric[] NOT NULL,
	"total_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"regular_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"overtime_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewer_id" uuid,
	"reviewer_name" varchar(200),
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timesheet_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"period_type" varchar(20) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"payroll_run_id" uuid,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"oracle_idcs_user_id" varchar(200),
	"oracle_employee_number" varchar(50),
	"ms_ad_object_id" varchar(200),
	"ms_upn" varchar(200),
	"primary_email" varchar(200) NOT NULL,
	"primary_sso_provider" varchar(20) DEFAULT 'ORACLE_IDCS' NOT NULL,
	"avaniis_role" varchar(50) NOT NULL,
	"allowed_entity_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"primary_entity_id" uuid NOT NULL,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"mfa_method" varchar(30),
	"mfa_last_verified" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_provider" varchar(20),
	"last_login_ip" "inet",
	"login_count" integer DEFAULT 0 NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"active_refresh_tokens" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_reason" varchar(200),
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "user_accounts_oracle_idcs_user_id_unique" UNIQUE("oracle_idcs_user_id"),
	CONSTRAINT "user_accounts_ms_ad_object_id_unique" UNIQUE("ms_ad_object_id"),
	CONSTRAINT "user_accounts_primary_email_unique" UNIQUE("primary_email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vss_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"payroll_run_id" uuid,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"basic_salary" numeric(14, 2) NOT NULL,
	"employer_rate" numeric(6, 4) NOT NULL,
	"employee_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"employer_amount" numeric(14, 2) NOT NULL,
	"employee_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_contribution" numeric(14, 2) NOT NULL,
	"fund_manager" varchar(200),
	"fund_member_id" varchar(100),
	"due_date" date NOT NULL,
	"submission_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" uuid NOT NULL,
	"initiated_by_person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"current_stage_id" uuid,
	"current_stage_order" integer DEFAULT 1 NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"sla_deadline" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"final_decision_by" uuid,
	"final_decision_note" text,
	"rejection_reason" text,
	"approval_chain_json" jsonb,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wps_sif_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"employer_labour_code" varchar(50) NOT NULL,
	"employee_labour_card" varchar(50),
	"routing_code" varchar(20) NOT NULL,
	"iban" varchar(23) NOT NULL,
	"net_pay_aed" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'AED' NOT NULL,
	"payment_month" integer NOT NULL,
	"payment_year" integer NOT NULL,
	"sif_line_number" integer NOT NULL,
	"sif_status" varchar(30) DEFAULT 'INCLUDED' NOT NULL,
	"exclusion_reason" text,
	"bank_confirmation_ref" varchar(100),
	"bank_confirmation_date" date,
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
 ALTER TABLE "compliance_rules" ADD CONSTRAINT "compliance_rules_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_type_configs" ADD CONSTRAINT "document_type_configs_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_salary_ranges" ADD CONSTRAINT "grade_salary_ranges_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grade_salary_ranges" ADD CONSTRAINT "grade_salary_ranges_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_rule_lines" ADD CONSTRAINT "leave_rule_lines_leave_rule_set_id_leave_rule_sets_id_fk" FOREIGN KEY ("leave_rule_set_id") REFERENCES "public"."leave_rule_sets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_rule_sets" ADD CONSTRAINT "leave_rule_sets_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_plans" ADD CONSTRAINT "medical_insurance_plans_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_schedule_patterns" ADD CONSTRAINT "work_schedule_patterns_work_schedule_id_work_schedules_id_fk" FOREIGN KEY ("work_schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_routing_rules" ADD CONSTRAINT "workflow_routing_rules_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_balances" ADD CONSTRAINT "absence_balances_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_balances" ADD CONSTRAINT "absence_balances_absence_type_id_absence_types_id_fk" FOREIGN KEY ("absence_type_id") REFERENCES "public"."absence_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_balances" ADD CONSTRAINT "absence_balances_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_absence_type_id_absence_types_id_fk" FOREIGN KEY ("absence_type_id") REFERENCES "public"."absence_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_submitted_by_persons_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_approved_by_persons_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_medical_cert_document_id_person_documents_id_fk" FOREIGN KEY ("medical_cert_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_plans" ADD CONSTRAINT "absence_plans_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_absence_plan_id_absence_plans_id_fk" FOREIGN KEY ("absence_plan_id") REFERENCES "public"."absence_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "business_units" ADD CONSTRAINT "business_units_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "business_units" ADD CONSTRAINT "business_units_head_person_id_persons_id_fk" FOREIGN KEY ("head_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contract_document_id_person_documents_id_fk" FOREIGN KEY ("contract_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_previous_contract_id_contracts_id_fk" FOREIGN KEY ("previous_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_head_person_id_persons_id_fk" FOREIGN KEY ("head_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_department_id_departments_id_fk" FOREIGN KEY ("parent_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_assignment_id_worker_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."worker_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_initiated_by_persons_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_approved_by_persons_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eosb_calculations" ADD CONSTRAINT "eosb_calculations_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eosb_calculations" ADD CONSTRAINT "eosb_calculations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eosb_calculations" ADD CONSTRAINT "eosb_calculations_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eosb_calculations" ADD CONSTRAINT "eosb_calculations_employment_action_id_employment_actions_id_fk" FOREIGN KEY ("employment_action_id") REFERENCES "public"."employment_actions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eosb_calculations" ADD CONSTRAINT "eosb_calculations_triggered_by_user_persons_id_fk" FOREIGN KEY ("triggered_by_user") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grades" ADD CONSTRAINT "grades_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_min_grade_id_grades_id_fk" FOREIGN KEY ("min_grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_max_grade_id_grades_id_fk" FOREIGN KEY ("max_grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locations" ADD CONSTRAINT "locations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_definitions" ADD CONSTRAINT "payroll_definitions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_results" ADD CONSTRAINT "payroll_results_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_results" ADD CONSTRAINT "payroll_results_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_results" ADD CONSTRAINT "payroll_results_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_results" ADD CONSTRAINT "payroll_results_assignment_id_worker_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."worker_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_payroll_id_payroll_definitions_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."payroll_definitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finance_approved_by_persons_id_fk" FOREIGN KEY ("finance_approved_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_bank_details" ADD CONSTRAINT "person_bank_details_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_bank_details" ADD CONSTRAINT "person_bank_details_verified_by_persons_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_passport_document_id_person_documents_id_fk" FOREIGN KEY ("passport_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_emirates_id_document_id_person_documents_id_fk" FOREIGN KEY ("emirates_id_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_visa_document_id_person_documents_id_fk" FOREIGN KEY ("visa_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_visa_sponsor_person_id_persons_id_fk" FOREIGN KEY ("visa_sponsor_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_insurance_document_id_person_documents_id_fk" FOREIGN KEY ("insurance_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_disability_certificate_id_person_documents_id_fk" FOREIGN KEY ("disability_certificate_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_approved_by_persons_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_verified_by_persons_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_education" ADD CONSTRAINT "person_education_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_education" ADD CONSTRAINT "person_education_document_id_person_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_emergency_contacts" ADD CONSTRAINT "person_emergency_contacts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_professional_certs" ADD CONSTRAINT "person_professional_certs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "person_professional_certs" ADD CONSTRAINT "person_professional_certs_document_id_person_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_current_grade_id_grades_id_fk" FOREIGN KEY ("current_grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_line_manager_id_persons_id_fk" FOREIGN KEY ("line_manager_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_dotted_line_manager_id_persons_id_fk" FOREIGN KEY ("dotted_line_manager_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_hr_representative_id_persons_id_fk" FOREIGN KEY ("hr_representative_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "persons" ADD CONSTRAINT "persons_payroll_id_payroll_definitions_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."payroll_definitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_occupied_by_person_id_persons_id_fk" FOREIGN KEY ("occupied_by_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_reports_to_position_id_positions_id_fk" FOREIGN KEY ("reports_to_position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_elements" ADD CONSTRAINT "salary_elements_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_elements" ADD CONSTRAINT "salary_elements_assignment_id_worker_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."worker_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_elements" ADD CONSTRAINT "salary_elements_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salary_elements" ADD CONSTRAINT "salary_elements_payroll_id_payroll_definitions_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."payroll_definitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_line_manager_id_persons_id_fk" FOREIGN KEY ("line_manager_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_dotted_line_manager_id_persons_id_fk" FOREIGN KEY ("dotted_line_manager_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_action_initiated_by_persons_id_fk" FOREIGN KEY ("action_initiated_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_action_approved_by_persons_id_fk" FOREIGN KEY ("action_approved_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegator_id_persons_id_fk" FOREIGN KEY ("delegator_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegate_id_persons_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blackout_periods" ADD CONSTRAINT "blackout_periods_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blackout_periods" ADD CONSTRAINT "blackout_periods_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dews_contributions" ADD CONSTRAINT "dews_contributions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dews_contributions" ADD CONSTRAINT "dews_contributions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dews_contributions" ADD CONSTRAINT "dews_contributions_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gpssa_contributions" ADD CONSTRAINT "gpssa_contributions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gpssa_contributions" ADD CONSTRAINT "gpssa_contributions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gpssa_contributions" ADD CONSTRAINT "gpssa_contributions_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_enrolments" ADD CONSTRAINT "medical_insurance_enrolments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_enrolments" ADD CONSTRAINT "medical_insurance_enrolments_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_enrolments" ADD CONSTRAINT "medical_insurance_enrolments_plan_id_medical_insurance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."medical_insurance_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_enrolments" ADD CONSTRAINT "medical_insurance_enrolments_dependent_id_person_dependents_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."person_dependents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_enrolments" ADD CONSTRAINT "medical_insurance_enrolments_card_document_id_person_documents_id_fk" FOREIGN KEY ("card_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "medical_insurance_policy_settings" ADD CONSTRAINT "medical_insurance_policy_settings_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_recipient_person_id_persons_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_checklist_id_onboarding_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."onboarding_checklists"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_assigned_person_id_persons_id_fk" FOREIGN KEY ("assigned_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_completed_by_persons_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sso_provider_config" ADD CONSTRAINT "sso_provider_config_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_period_id_timesheet_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."timesheet_periods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_reviewer_id_persons_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_primary_entity_id_legal_entities_id_fk" FOREIGN KEY ("primary_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vss_contributions" ADD CONSTRAINT "vss_contributions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vss_contributions" ADD CONSTRAINT "vss_contributions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vss_contributions" ADD CONSTRAINT "vss_contributions_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_initiated_by_person_id_persons_id_fk" FOREIGN KEY ("initiated_by_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_current_stage_id_workflow_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_final_decision_by_persons_id_fk" FOREIGN KEY ("final_decision_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wps_sif_records" ADD CONSTRAINT "wps_sif_records_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wps_sif_records" ADD CONSTRAINT "wps_sif_records_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wps_sif_records" ADD CONSTRAINT "wps_sif_records_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
