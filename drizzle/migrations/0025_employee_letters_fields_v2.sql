ALTER TABLE "employee_letters" ALTER COLUMN "language" SET DATA TYPE varchar(4);--> statement-breakpoint
ALTER TABLE "letter_templates" ALTER COLUMN "name_ar" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_templates" ALTER COLUMN "body_ar" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_field_registry" ADD COLUMN "source_table" varchar(100);--> statement-breakpoint
ALTER TABLE "letter_field_registry" ADD COLUMN "source_column" varchar(100);--> statement-breakpoint
ALTER TABLE "letter_field_registry" ADD COLUMN "is_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_field_registry" ADD COLUMN "resolver_key" varchar(100);