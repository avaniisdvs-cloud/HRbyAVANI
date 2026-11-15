-- Priority A: Date-effective versioning columns
-- Adds actionMode, effectiveSequence, correctsRowId, sourceTransactionId
-- across the five already-date-effective tables.
--
-- All columns are nullable or carry defaults — zero downtime, backwards compatible.
-- Hard Rule 1: no UPDATE or DELETE of existing rows; these are pure ADD COLUMN statements.

-- ── worker_assignments ────────────────────────────────────────────────────────
ALTER TABLE worker_assignments
  ADD COLUMN IF NOT EXISTS action_mode         VARCHAR(15)  NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS effective_sequence  INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS corrects_row_id     UUID         REFERENCES worker_assignments(id),
  ADD COLUMN IF NOT EXISTS source_transaction_id UUID;

-- Speeds up "find all corrections to a given row" lookups.
CREATE INDEX IF NOT EXISTS idx_worker_assignments_corrects_row
  ON worker_assignments(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

-- Speeds up same-day sequence resolution (effectiveOnLatest queries).
CREATE INDEX IF NOT EXISTS idx_worker_assignments_person_start_seq
  ON worker_assignments(person_id, effective_start_date DESC, effective_sequence DESC);

-- ── salary_elements ───────────────────────────────────────────────────────────
ALTER TABLE salary_elements
  ADD COLUMN IF NOT EXISTS action_mode        VARCHAR(15)  NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS effective_sequence INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS corrects_row_id    UUID         REFERENCES salary_elements(id);

CREATE INDEX IF NOT EXISTS idx_salary_elements_corrects_row
  ON salary_elements(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salary_elements_person_start_seq
  ON salary_elements(person_id, effective_start_date DESC, effective_sequence DESC);

-- ── person_addresses ──────────────────────────────────────────────────────────
ALTER TABLE person_addresses
  ADD COLUMN IF NOT EXISTS action_mode    VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID       REFERENCES person_addresses(id);

-- ── person_bank_details ───────────────────────────────────────────────────────
ALTER TABLE person_bank_details
  ADD COLUMN IF NOT EXISTS action_mode    VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID       REFERENCES person_bank_details(id);

-- ── person_dependents ─────────────────────────────────────────────────────────
ALTER TABLE person_dependents
  ADD COLUMN IF NOT EXISTS action_mode    VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID       REFERENCES person_dependents(id);
