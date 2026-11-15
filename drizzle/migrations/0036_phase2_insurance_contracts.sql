-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0036 — Phase 2: Insurance close-open + Contract standardisation
--
-- Adds effective-dating versioning columns to:
--   medical_insurance_enrolments → effectiveEndDate, isCurrent, effectiveSequence
--   contracts                    → isCurrent, effectiveSequence
--
-- Backfills isCurrent = TRUE and effectiveSequence = 1 for all existing rows.
-- All DDL uses IF NOT EXISTS / safe guards for idempotency.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── medical_insurance_enrolments ─────────────────────────────────────────────

ALTER TABLE medical_insurance_enrolments
  ADD COLUMN IF NOT EXISTS effective_end_date  DATE,
  ADD COLUMN IF NOT EXISTS is_current          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS effective_sequence  INTEGER NOT NULL DEFAULT 1;

-- Backfill: all existing rows are "current" with sequence 1
UPDATE medical_insurance_enrolments
   SET is_current         = TRUE,
       effective_sequence = 1
 WHERE is_current IS DISTINCT FROM TRUE;

-- Fast lookup: who has a current enrolment?
CREATE INDEX IF NOT EXISTS idx_ins_enrol_current
  ON medical_insurance_enrolments(tenant_id, person_id, enrolment_type)
  WHERE is_current = TRUE;

-- History range queries: enrolments for a person ordered by sequence
CREATE INDEX IF NOT EXISTS idx_ins_enrol_history
  ON medical_insurance_enrolments(tenant_id, person_id, effective_sequence DESC);

-- Sparse: only rows that were superseded (effective_end_date IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_ins_enrol_closed
  ON medical_insurance_enrolments(tenant_id, person_id, effective_end_date)
  WHERE effective_end_date IS NOT NULL;

-- ── contracts ────────────────────────────────────────────────────────────────

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS is_current         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS effective_sequence INTEGER NOT NULL DEFAULT 1;

-- Backfill: active contracts are current; renewed/expired/terminated are not
UPDATE contracts
   SET is_current         = CASE WHEN status = 'ACTIVE' THEN TRUE ELSE FALSE END,
       effective_sequence = 1
 WHERE is_current IS DISTINCT FROM (status = 'ACTIVE');

-- Fast lookup: current contract per person
CREATE INDEX IF NOT EXISTS idx_contracts_current
  ON contracts(tenant_id, person_id)
  WHERE is_current = TRUE;

-- History ordered by sequence
CREATE INDEX IF NOT EXISTS idx_contracts_history
  ON contracts(tenant_id, person_id, effective_sequence DESC);
