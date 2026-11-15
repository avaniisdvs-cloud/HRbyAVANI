-- CF-01: Made idempotent (ADD COLUMN IF NOT EXISTS) because this was applied
-- directly via psql during Sprint 9 before drizzle-kit migrate was repaired.
ALTER TABLE "workflow_stages" ADD COLUMN IF NOT EXISTS "escalation_role_code" varchar(50);
