-- ── Session 3: Reporting Manager Hierarchy Engine — Performance Indexes ──────
--
-- These indexes are required for the reporting engine's recursive CTE to
-- perform efficiently on large employee tables (10,000+ persons).
--
-- idx_persons_line_manager: the CTE anchors on persons.line_manager_id in
--   both the base case (IS NULL check) and the recursive join.
--
-- idx_persons_active_tenant: the CTE filters by tenant_id + is_active +
--   assignment_status on every level. Without this index each recursion
--   does a full table scan.
--
-- idx_wa_is_current: worker_assignments LEFT JOIN in the CTE is joined on
--   is_current = true + person_id. A partial index dramatically reduces
--   the number of rows scanned per join.
--
-- idx_wa_line_manager_id: used for span-of-control queries and the
--   future my-team engine (direct reports lookup).

-- Persons: index on line_manager_id for the recursive CTE traversal
CREATE INDEX IF NOT EXISTS idx_persons_line_manager
  ON persons (line_manager_id)
  WHERE is_active = true;

-- Persons: composite index for the CTE WHERE clause
CREATE INDEX IF NOT EXISTS idx_persons_active_tenant
  ON persons (tenant_id, is_active, assignment_status);

-- Persons: current position lookup (used in reporting node enrichment)
CREATE INDEX IF NOT EXISTS idx_persons_current_position
  ON persons (current_position_id)
  WHERE current_position_id IS NOT NULL;

-- Worker assignments: partial index on current assignments (most queries filter is_current = true)
CREATE INDEX IF NOT EXISTS idx_wa_is_current
  ON worker_assignments (person_id, is_current)
  WHERE is_current = true;

-- Worker assignments: line_manager_id index for span-of-control and my-team engine
CREATE INDEX IF NOT EXISTS idx_wa_line_manager_id
  ON worker_assignments (line_manager_id)
  WHERE is_current = true;

-- Positions: existing index verification — the position engine CTE anchor
-- (Should already exist from Tasks A–G; CREATE IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS idx_positions_reports_to
  ON positions (tenant_id, reports_to_position_id)
  WHERE is_active = true;
