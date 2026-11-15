ALTER TABLE "persons" ADD COLUMN "pdpl_consent_given" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "pdpl_consent_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "pdpl_consent_version" varchar(20);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "sensitive_data_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "sensitive_data_consent_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "nursing_break_end_date" date;