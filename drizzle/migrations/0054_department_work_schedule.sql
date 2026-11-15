-- 0054 — Department Work Schedule foundation (Expand phase)
--
-- Adds departments.work_schedule_id (NULLABLE FK -> work_schedules) so a
-- department can own a default work schedule, forming the inheritance tier
-- between an employee-level override and the entity/system default:
--   employee override > DEPARTMENT > (future BU) > (future legal entity) > system default
--
-- Note: departments.head_person_id ALREADY EXISTS (migration 0000) and is
-- already indexed (idx_departments_head_person, migration 0021). The Department
-- Head feature only wires that existing column into the app — no DB change here.
--
-- Expand -> Migrate -> Contract: work_schedule_id stays NULLABLE; a NOT NULL
-- constraint is deferred to the Contract phase, after every existing department
-- has been backfilled. Existing departments keep working with a NULL value.
--
-- ⚠ Manual migration: drizzle/meta/_journal.json tracks only 0000–0039.
-- `pnpm drizzle-kit migrate` will NOT apply this file. Apply via the Neon
-- Console SQL Editor (see CLAUDE.md "Neon Migration Deployment Notes").

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS work_schedule_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'departments_work_schedule_id_work_schedules_id_fk'
      AND table_name      = 'departments'
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_work_schedule_id_work_schedules_id_fk
      FOREIGN KEY (work_schedule_id) REFERENCES work_schedules(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_departments_work_schedule
  ON departments (work_schedule_id)
  WHERE work_schedule_id IS NOT NULL AND is_active = true;
