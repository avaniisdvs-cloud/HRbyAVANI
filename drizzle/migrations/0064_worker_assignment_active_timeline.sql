-- 0064_worker_assignment_active_timeline.sql
-- ED-UAT-002: cancelled/inactive worker assignment rows are retained for
-- audit/history, but must not participate in active timeline overlap checks.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE worker_assignments
DROP CONSTRAINT IF EXISTS excl_worker_assignments_no_overlap;

ALTER TABLE worker_assignments
ADD CONSTRAINT excl_worker_assignments_no_overlap
EXCLUDE USING gist (
  tenant_id WITH =,
  person_id WITH =,
  daterange(effective_start_date, effective_end_date, '[]') WITH &&
)
WHERE (assignment_status <> 'INACTIVE');

COMMENT ON CONSTRAINT excl_worker_assignments_no_overlap ON worker_assignments IS
  'ED-UAT-002: active worker assignment rows must not overlap; INACTIVE cancelled future rows are retained but excluded from active timeline enforcement.';

DROP INDEX IF EXISTS idx_worker_assignments_asof;

CREATE INDEX idx_worker_assignments_asof
ON worker_assignments (tenant_id, person_id, effective_start_date DESC, effective_end_date)
WHERE assignment_status <> 'INACTIVE';

COMMIT;
