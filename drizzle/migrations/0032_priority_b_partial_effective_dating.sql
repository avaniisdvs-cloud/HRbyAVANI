-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0032 — Priority B: complete partial date-effective tables
--
-- Three tables had incomplete date-effective history infrastructure:
--   1. medical_insurance_enrolments — add actionMode + correctsRowId
--   2. contracts                    — add actionMode + correctsRowId
--   3. grade_salary_ranges          — rename effective_date → effective_start_date
--                                     (already has effective_end_date)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. medical_insurance_enrolments ──────────────────────────────────────────

ALTER TABLE medical_insurance_enrolments
  ADD COLUMN IF NOT EXISTS action_mode    VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID
    REFERENCES medical_insurance_enrolments(id);

-- ── 2. contracts ─────────────────────────────────────────────────────────────

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS action_mode    VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID
    REFERENCES contracts(id);

-- ── 3. grade_salary_ranges — rename column ───────────────────────────────────
-- Safe rename: no FK references this column in any other table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'grade_salary_ranges'
       AND column_name = 'effective_date'
  ) THEN
    ALTER TABLE grade_salary_ranges
      RENAME COLUMN effective_date TO effective_start_date;
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_insurance_enrolments_corrects_row
  ON medical_insurance_enrolments(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_corrects_row
  ON contracts(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;
