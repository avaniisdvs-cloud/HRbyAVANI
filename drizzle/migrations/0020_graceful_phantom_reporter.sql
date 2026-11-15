CREATE TABLE IF NOT EXISTS "employee_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"letter_type" text NOT NULL,
	"letter_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pdf_url" text,
	"signed_pdf_url" text,
	"signing_token" text,
	"signing_token_expires_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_by_name" text,
	"signed_ip" text,
	"signed_device" text,
	"email_sent_at" timestamp with time zone,
	"generated_by" uuid,
	"generated_at" timestamp with time zone,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "primary_logo_url" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "secondary_logo_url" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "header_image_url" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "footer_image_url" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "signatory_name" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "signatory_title" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "signatory_signature_url" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "letter_email_footer" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "probation_status" varchar(20) DEFAULT 'active';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
