-- Employee Letters v2: Dynamic Template Engine
-- Drops session-1 employee_letters table, creates 5 new tables,
-- adds 2 new columns to legal_entities

-- ── Add new columns to legal_entities ────────────────────────────────────────
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "signatory_title_ar" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN IF NOT EXISTS "air_ticket_entitlement" text;--> statement-breakpoint

-- ── Drop session-1 table ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS "employee_letters";--> statement-breakpoint

-- ── 1. Token registry ─────────────────────────────────────────────────────────
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
);--> statement-breakpoint

-- ── 2. Letter template types ──────────────────────────────────────────────────
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
);--> statement-breakpoint

-- ── 3. Letter templates ───────────────────────────────────────────────────────
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
);--> statement-breakpoint

-- ── 4. Employee letter instances ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "employee_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"template_id" uuid,
	"type_code" varchar(10) NOT NULL,
	"letter_number" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"resolved_body_en" text,
	"resolved_body_ar" text,
	"token_snapshot" jsonb,
	"pdf_url" varchar(500),
	"signed_pdf_url" varchar(500),
	"signing_token" varchar(200),
	"signing_token_expires_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_by_name" varchar(200),
	"signed_ip" varchar(45),
	"signed_device" varchar(500),
	"email_sent_at" timestamp with time zone,
	"email_recipient" varchar(500),
	"email_status" varchar(30),
	"workflow_instance_id" uuid,
	"requested_by_employee" boolean DEFAULT false NOT NULL,
	"requested_at" timestamp with time zone,
	"generated_by" uuid,
	"generated_at" timestamp with time zone,
	"effective_date" date,
	"language" char(2) DEFAULT 'en' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone,
	CONSTRAINT "employee_letters_letter_number_unique" UNIQUE("letter_number")
);--> statement-breakpoint

-- ── 5. Bulk email job tracking ────────────────────────────────────────────────
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
);--> statement-breakpoint

-- ── Foreign keys ──────────────────────────────────────────────────────────────
DO $$ BEGIN
 ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_type_id_fk"
   FOREIGN KEY ("type_id") REFERENCES "letter_template_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_legal_entity_id_fk"
   FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_person_id_fk"
   FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_legal_entity_id_fk"
   FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_template_id_fk"
   FOREIGN KEY ("template_id") REFERENCES "letter_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "letter_email_jobs" ADD CONSTRAINT "letter_email_jobs_letter_id_fk"
   FOREIGN KEY ("letter_id") REFERENCES "employee_letters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
