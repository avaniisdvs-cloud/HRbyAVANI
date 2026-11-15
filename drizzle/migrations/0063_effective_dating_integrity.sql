-- 0063_effective_dating_integrity.sql
-- Purpose: Phase 1 enterprise effective-dating database integrity foundations.
-- Scope: Phase 1 Steps 2-6 only: sentinel backfill/defaults, date-order checks, overlap exclusions, one-current indexes, and temporal lookup indexes.
-- Safety: Do not touch 0062_email_platform.sql, unrelated dirty files, applied historical migrations, or _PRODUCTION_SCHEMA_BUNDLE.sql.

CREATE EXTENSION IF NOT EXISTS btree_gist;


-- Step 2: standardize open-ended effective-dated rows on sentinel date.
-- Existing NULL open-ended rows are converted to 9999-12-31.
-- New open-ended rows default to 9999-12-31.

UPDATE worker_assignments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE worker_assignments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE salary_elements
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE salary_elements
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE payroll_assignments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE payroll_assignments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE work_schedule_assignments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE work_schedule_assignments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE leave_plan_enrolments
SET effective_end_date = DATE '9999-12-31'
WHERE effective_end_date IS NULL;

ALTER TABLE leave_plan_enrolments
ALTER COLUMN effective_end_date SET DEFAULT DATE '9999-12-31';

UPDATE grade_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE grade_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE department_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE department_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE location_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE location_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE job_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE job_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';

UPDATE position_history
SET valid_to = DATE '9999-12-31'
WHERE valid_to IS NULL;

ALTER TABLE position_history
ALTER COLUMN valid_to SET DEFAULT DATE '9999-12-31';


-- Step 3: date-order integrity checks.
-- These checks ensure every effective-dated range is internally valid.

ALTER TABLE worker_assignments
ADD CONSTRAINT chk_worker_assignments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE salary_elements
ADD CONSTRAINT chk_salary_elements_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE payroll_assignments
ADD CONSTRAINT chk_payroll_assignments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE work_schedule_assignments
ADD CONSTRAINT chk_work_schedule_assignments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE leave_plan_enrolments
ADD CONSTRAINT chk_leave_plan_enrolments_date_order
CHECK (effective_start_date <= effective_end_date);

ALTER TABLE grade_history
ADD CONSTRAINT chk_grade_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE department_history
ADD CONSTRAINT chk_department_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE location_history
ADD CONSTRAINT chk_location_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE job_history
ADD CONSTRAINT chk_job_history_date_order
CHECK (valid_from <= valid_to);

ALTER TABLE position_history
ADD CONSTRAINT chk_position_history_date_order
CHECK (valid_from <= valid_to);


-- Step 4: overlap-prevention constraints.
-- These constraints prevent two timeline rows for the same business key from
-- being effective for the same calendar date.

ALTER TABLE worker_assignments
ADD CONSTRAINT excl_worker_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE salary_elements
ADD CONSTRAINT excl_salary_elements_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  assignment_id WITH =,
  payroll_id WITH =,
  element_code WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE payroll_assignments
ADD CONSTRAINT excl_payroll_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE work_schedule_assignments
ADD CONSTRAINT excl_work_schedule_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE leave_plan_enrolments
ADD CONSTRAINT excl_leave_plan_enrolments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  absence_plan_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
);

ALTER TABLE grade_history
ADD CONSTRAINT excl_grade_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  grade_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE department_history
ADD CONSTRAINT excl_department_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  department_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE location_history
ADD CONSTRAINT excl_location_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  location_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE job_history
ADD CONSTRAINT excl_job_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  job_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);

ALTER TABLE position_history
ADD CONSTRAINT excl_position_history_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  position_id WITH =,
  daterange(valid_from, valid_to, '[]') WITH &&
);


-- Step 5: one-current-row protection.
-- These partial unique indexes prevent duplicate current rows for each approved
-- effective-dated business key.

CREATE UNIQUE INDEX uq_worker_assignments_one_current
ON worker_assignments (tenant_id, person_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_payroll_assignments_one_current
ON payroll_assignments (tenant_id, person_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_work_schedule_assignments_one_current
ON work_schedule_assignments (tenant_id, person_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_leave_plan_enrolments_one_current
ON leave_plan_enrolments (tenant_id, person_id, absence_plan_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_grade_history_one_current
ON grade_history (tenant_id, grade_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_department_history_one_current
ON department_history (tenant_id, department_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_location_history_one_current
ON location_history (tenant_id, location_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_job_history_one_current
ON job_history (tenant_id, job_id)
WHERE is_current = true;

CREATE UNIQUE INDEX uq_position_history_one_current
ON position_history (tenant_id, position_id)
WHERE is_current = true;


-- Step 6: temporal as-of lookup indexes.
-- These non-unique indexes support efficient point-in-time reads using
-- start <= :asOf AND end >= :asOf predicates.

CREATE INDEX idx_worker_assignments_asof
ON worker_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_salary_elements_asof
ON salary_elements (tenant_id, person_id, assignment_id, payroll_id, element_code, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_payroll_assignments_asof
ON payroll_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_work_schedule_assignments_asof
ON work_schedule_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_leave_plan_enrolments_asof
ON leave_plan_enrolments (tenant_id, person_id, absence_plan_id, effective_start_date DESC, effective_end_date);

CREATE INDEX idx_grade_history_asof
ON grade_history (tenant_id, grade_id, valid_from DESC, valid_to);

CREATE INDEX idx_department_history_asof
ON department_history (tenant_id, department_id, valid_from DESC, valid_to);

CREATE INDEX idx_location_history_asof
ON location_history (tenant_id, location_id, valid_from DESC, valid_to);

CREATE INDEX idx_job_history_asof
ON job_history (tenant_id, job_id, valid_from DESC, valid_to);

CREATE INDEX idx_position_history_asof
ON position_history (tenant_id, position_id, valid_from DESC, valid_to);

-- Rollback SQL reference:
-- Do not drop btree_gist automatically. Other database objects may depend on it.
--
-- Step 6 rollback — temporal as-of lookup indexes:
-- DROP INDEX IF EXISTS idx_position_history_asof;
-- DROP INDEX IF EXISTS idx_job_history_asof;
-- DROP INDEX IF EXISTS idx_location_history_asof;
-- DROP INDEX IF EXISTS idx_department_history_asof;
-- DROP INDEX IF EXISTS idx_grade_history_asof;
-- DROP INDEX IF EXISTS idx_leave_plan_enrolments_asof;
-- DROP INDEX IF EXISTS idx_work_schedule_assignments_asof;
-- DROP INDEX IF EXISTS idx_payroll_assignments_asof;
-- DROP INDEX IF EXISTS idx_salary_elements_asof;
-- DROP INDEX IF EXISTS idx_worker_assignments_asof;
--
-- Step 5 rollback — one-current partial unique indexes:
-- DROP INDEX IF EXISTS uq_position_history_one_current;
-- DROP INDEX IF EXISTS uq_job_history_one_current;
-- DROP INDEX IF EXISTS uq_location_history_one_current;
-- DROP INDEX IF EXISTS uq_department_history_one_current;
-- DROP INDEX IF EXISTS uq_grade_history_one_current;
-- DROP INDEX IF EXISTS uq_leave_plan_enrolments_one_current;
-- DROP INDEX IF EXISTS uq_work_schedule_assignments_one_current;
-- DROP INDEX IF EXISTS uq_payroll_assignments_one_current;
-- DROP INDEX IF EXISTS uq_worker_assignments_one_current;
--
-- Step 4 rollback — overlap-prevention exclusion constraints:
-- ALTER TABLE position_history DROP CONSTRAINT IF EXISTS excl_position_history_no_overlap;
-- ALTER TABLE job_history DROP CONSTRAINT IF EXISTS excl_job_history_no_overlap;
-- ALTER TABLE location_history DROP CONSTRAINT IF EXISTS excl_location_history_no_overlap;
-- ALTER TABLE department_history DROP CONSTRAINT IF EXISTS excl_department_history_no_overlap;
-- ALTER TABLE grade_history DROP CONSTRAINT IF EXISTS excl_grade_history_no_overlap;
-- ALTER TABLE leave_plan_enrolments DROP CONSTRAINT IF EXISTS excl_leave_plan_enrolments_no_overlap;
-- ALTER TABLE work_schedule_assignments DROP CONSTRAINT IF EXISTS excl_work_schedule_assignments_no_overlap;
-- ALTER TABLE payroll_assignments DROP CONSTRAINT IF EXISTS excl_payroll_assignments_no_overlap;
-- ALTER TABLE salary_elements DROP CONSTRAINT IF EXISTS excl_salary_elements_no_overlap;
-- ALTER TABLE worker_assignments DROP CONSTRAINT IF EXISTS excl_worker_assignments_no_overlap;
--
-- Step 3 rollback — date-order check constraints:
-- ALTER TABLE position_history DROP CONSTRAINT IF EXISTS chk_position_history_date_order;
-- ALTER TABLE job_history DROP CONSTRAINT IF EXISTS chk_job_history_date_order;
-- ALTER TABLE location_history DROP CONSTRAINT IF EXISTS chk_location_history_date_order;
-- ALTER TABLE department_history DROP CONSTRAINT IF EXISTS chk_department_history_date_order;
-- ALTER TABLE grade_history DROP CONSTRAINT IF EXISTS chk_grade_history_date_order;
-- ALTER TABLE leave_plan_enrolments DROP CONSTRAINT IF EXISTS chk_leave_plan_enrolments_date_order;
-- ALTER TABLE work_schedule_assignments DROP CONSTRAINT IF EXISTS chk_work_schedule_assignments_date_order;
-- ALTER TABLE payroll_assignments DROP CONSTRAINT IF EXISTS chk_payroll_assignments_date_order;
-- ALTER TABLE salary_elements DROP CONSTRAINT IF EXISTS chk_salary_elements_date_order;
-- ALTER TABLE worker_assignments DROP CONSTRAINT IF EXISTS chk_worker_assignments_date_order;
--
-- Step 2 rollback — defaults and sentinel backfill reversal:
-- ALTER TABLE position_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE position_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE job_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE job_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE location_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE location_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE department_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE department_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE grade_history ALTER COLUMN valid_to DROP DEFAULT;
-- UPDATE grade_history SET valid_to = NULL WHERE valid_to = DATE '9999-12-31';
-- ALTER TABLE leave_plan_enrolments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE leave_plan_enrolments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE work_schedule_assignments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE work_schedule_assignments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE payroll_assignments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE payroll_assignments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE salary_elements ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE salary_elements SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
-- ALTER TABLE worker_assignments ALTER COLUMN effective_end_date DROP DEFAULT;
-- UPDATE worker_assignments SET effective_end_date = NULL WHERE effective_end_date = DATE '9999-12-31';
