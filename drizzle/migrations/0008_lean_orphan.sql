-- CF-01: Made idempotent (ADD COLUMN IF NOT EXISTS) because this was applied
-- directly via psql during Sprint 9 before drizzle-kit migrate was repaired.
ALTER TABLE "workflow_instances" ADD COLUMN IF NOT EXISTS "current_delegatee_person_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_current_delegatee_person_id_persons_id_fk" FOREIGN KEY ("current_delegatee_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
