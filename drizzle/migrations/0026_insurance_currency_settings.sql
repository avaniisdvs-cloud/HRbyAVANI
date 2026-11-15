CREATE TABLE IF NOT EXISTS "company_currency_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"currency_code" char(3) NOT NULL,
	"currency_name_en" varchar(100) NOT NULL,
	"currency_name_ar" varchar(100) NOT NULL,
	"currency_symbol" varchar(10) NOT NULL,
	"decimal_places" integer DEFAULT 2 NOT NULL,
	"rounding_method" varchar(20) DEFAULT 'HALF_UP' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
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
ALTER TABLE "worker_assignments" ADD COLUMN "insurance_exception_granted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "medical_insurance_enrolments" ADD COLUMN "insurance_expiry_extension_date" date;--> statement-breakpoint
ALTER TABLE "medical_insurance_enrolments" ADD COLUMN "insurance_expiry_extension_reason" varchar(200);--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "reference_path" varchar(500);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_currency_settings" ADD CONSTRAINT "company_currency_settings_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
