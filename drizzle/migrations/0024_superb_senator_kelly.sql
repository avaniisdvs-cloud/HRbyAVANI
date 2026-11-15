CREATE TABLE IF NOT EXISTS "letter_email_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"job_ref" varchar(100) NOT NULL,
	"letter_id" uuid NOT NULL,
	"recipient_email" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"attempted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_field_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"token_key" varchar(100) NOT NULL,
	"label_en" varchar(200) NOT NULL,
	"label_ar" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"data_type" varchar(20) DEFAULT 'string' NOT NULL,
	"is_system_token" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "letter_field_registry_token_key_unique" UNIQUE("token_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_template_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"type_code" varchar(10) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"number_prefix" varchar(10) NOT NULL,
	"number_seed" integer DEFAULT 0 NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"allow_ess_self_request" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "letter_template_types_type_code_unique" UNIQUE("type_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"type_id" uuid NOT NULL,
	"legal_entity_id" uuid,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"body_en" text NOT NULL,
	"body_ar" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_hierarchy_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"engine" varchar(50) NOT NULL,
	"scope_key" varchar(200) DEFAULT 'full' NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recompute_started_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "letter_number" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "pdf_url" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "signed_pdf_url" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "signing_token" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "signed_by_name" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "signed_ip" SET DATA TYPE varchar(45);--> statement-breakpoint
ALTER TABLE "employee_letters" ALTER COLUMN "signed_device" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "probation_status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "template_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "type_code" varchar(10);--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "resolved_body_en" text;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "resolved_body_ar" text;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "token_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "email_recipient" varchar(500);--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "email_status" varchar(30);--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "workflow_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "requested_by_employee" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "effective_date" date;--> statement-breakpoint
ALTER TABLE "employee_letters" ADD COLUMN IF NOT EXISTS "language" char(2) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "signatory_title_ar" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "air_ticket_entitlement" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "letter_logo_choice" varchar(10) DEFAULT 'primary';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letter_email_jobs" ADD CONSTRAINT "letter_email_jobs_letter_id_employee_letters_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."employee_letters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_type_id_letter_template_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."letter_template_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_template_id_letter_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."letter_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "employee_letters" DROP COLUMN IF EXISTS "letter_type";--> statement-breakpoint
ALTER TABLE "employee_letters" DROP COLUMN IF EXISTS "effective_from";--> statement-breakpoint
ALTER TABLE "employee_letters" DROP COLUMN IF EXISTS "effective_to";--> statement-breakpoint
-- Constraint "employee_letters_letter_number_unique" already created in 0023_employee_letters_v2.sql CREATE TABLE; no-op here.