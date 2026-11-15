-- ── Session 4: Department Hierarchy Engine — Performance Indexes ──────────────
--
-- idx_departments_parent: the recursive CTE joins on parent_department_id
--   on every level — without this index each recursion scans the full table.
--
-- idx_departments_active: the CTE WHERE clause filters by tenant_id + is_active
--   on every row; a composite index dramatically reduces scanned rows.
--
-- Note: head_person_id and parent_department_id already exist in the
-- departments table (foundation.ts V007). No column additions required.

-- Departments: composite index for the recursive CTE join
CREATE INDEX IF NOT EXISTS idx_departments_parent
  ON departments (tenant_id, parent_department_id)
  WHERE is_active = true;

-- Departments: composite index for the CTE anchor WHERE clause
CREATE INDEX IF NOT EXISTS idx_departments_active
  ON departments (tenant_id, is_active);

-- Departments: head_person_id index (LEFT JOIN in aggregate query)
CREATE INDEX IF NOT EXISTS idx_departments_head_person
  ON departments (head_person_id)
  WHERE head_person_id IS NOT NULL AND is_active = true;

-- Worker assignments: department_id index for headcount aggregation
-- (Should already exist from Tasks A–G — CREATE IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS idx_wa_department_id
  ON worker_assignments (department_id, tenant_id)
  WHERE is_current = true AND assignment_status = 'ACTIVE';

-- Positions: department_id index for vacancy aggregation
CREATE INDEX IF NOT EXISTS idx_positions_department_id
  ON positions (department_id, tenant_id)
  WHERE is_active = true AND NOT is_occupied;
