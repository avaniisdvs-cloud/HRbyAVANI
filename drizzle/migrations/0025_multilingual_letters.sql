-- Multilingual letter support:
--   1. Widen employee_letters.language from char(2) to varchar(4) to support 'both'
--   2. Make letter_templates.name_ar and body_ar nullable (Arabic is optional at template save time)

ALTER TABLE "employee_letters"
  ALTER COLUMN "language" TYPE varchar(4);--> statement-breakpoint

ALTER TABLE "letter_templates"
  ALTER COLUMN "name_ar" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "letter_templates"
  ALTER COLUMN "body_ar" DROP NOT NULL;--> statement-breakpoint
