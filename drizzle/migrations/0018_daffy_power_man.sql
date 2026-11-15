CREATE TABLE IF NOT EXISTS "hiring_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"position_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"request_type" varchar(30) NOT NULL,
	"replacement_for" varchar(200),
	"required_by_date" date,
	"budget_approved" boolean DEFAULT false,
	"budget_amount" numeric(12, 2),
	"justification" text NOT NULL,
	"urgency" varchar(20) DEFAULT 'STANDARD',
	"status" varchar(30) DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_by_name" varchar(200) NOT NULL,
	"requested_date" date DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"current_position_id" uuid NOT NULL,
	"target_position_id" uuid,
	"target_department_id" uuid,
	"request_type" varchar(20) NOT NULL,
	"effective_date" date NOT NULL,
	"reason" varchar(50) NOT NULL,
	"notes" text,
	"status" varchar(30) DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_by_name" varchar(200) NOT NULL,
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
 ALTER TABLE "hiring_requests" ADD CONSTRAINT "hiring_requests_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
