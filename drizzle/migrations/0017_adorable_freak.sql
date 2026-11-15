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
ALTER TABLE "persons" ADD COLUMN "profile_photo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "is_confidential" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "is_frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_assignments" ADD COLUMN "is_acting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_assignments" ADD COLUMN "acting_end_date" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
