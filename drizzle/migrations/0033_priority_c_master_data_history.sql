-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0033 — Priority C: Master data history infrastructure
--
-- Adds date-effective history versioning to the five master data tables:
--   grades         → actionMode, correctsRowId
--   departments    → actionMode, correctsRowId
--   locations      → actionMode, correctsRowId
--   jobs           → actionMode, correctsRowId
--   positions      → actionMode, correctsRowId,
--                    effectiveStartDate, effectiveEndDate, isCurrent
--
-- All new columns use safe IF NOT EXISTS / DO $$ guards so the migration
-- is idempotent and can be re-run without error.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── grades ────────────────────────────────────────────────────────────────────

ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS action_mode     VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID REFERENCES grades(id);

-- ── departments ───────────────────────────────────────────────────────────────

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS action_mode     VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID REFERENCES departments(id);

-- ── locations ─────────────────────────────────────────────────────────────────

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS action_mode     VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID REFERENCES locations(id);

-- ── jobs ──────────────────────────────────────────────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS action_mode     VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID REFERENCES jobs(id);

-- ── positions ─────────────────────────────────────────────────────────────────

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS action_mode          VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id      UUID REFERENCES positions(id),
  ADD COLUMN IF NOT EXISTS effective_start_date DATE,
  ADD COLUMN IF NOT EXISTS effective_end_date   DATE,
  ADD COLUMN IF NOT EXISTS is_current           BOOLEAN NOT NULL DEFAULT TRUE;

-- Back-fill: all existing position rows are "current" with an open start date
UPDATE positions SET is_current = TRUE WHERE is_current IS NULL OR is_current = FALSE;

-- ── Sparse indexes (NULL-filtered for minimal overhead) ───────────────────────

CREATE INDEX IF NOT EXISTS idx_grades_corrects_row
  ON grades(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_corrects_row
  ON departments(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_corrects_row
  ON locations(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_corrects_row
  ON jobs(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_positions_corrects_row
  ON positions(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

-- Covering index for active-position queries used by org chart + assignment pickers
CREATE INDEX IF NOT EXISTS idx_positions_current_entity
  ON positions(tenant_id, legal_entity_id, is_current)
  WHERE is_current = TRUE;
