-- ============================================================================
-- Migration 0026 — Medical Insurance Module schema additions
--
-- Adds three columns required by the confirmed business rules:
--   1. worker_assignments.insurance_exception_granted
--      BR-INS-007: contractors excluded by default; HR Admin may grant exception
--   2. medical_insurance_enrolments.insurance_expiry_extension_date
--   3. medical_insurance_enrolments.insurance_expiry_extension_reason
--      BR-INS-006: insurance may be extended beyond the notice period end
-- ============================================================================

ALTER TABLE worker_assignments
  ADD COLUMN IF NOT EXISTS insurance_exception_granted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE medical_insurance_enrolments
  ADD COLUMN IF NOT EXISTS insurance_expiry_extension_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry_extension_reason VARCHAR(200);

-- Index for quick lookup of enrolments by person + status (used by renewal cron)
CREATE INDEX IF NOT EXISTS idx_ins_enrolments_person_status
  ON medical_insurance_enrolments (tenant_id, person_id, enrolment_status);

-- Index for expiry date range scans (used by renewal alert cron)
CREATE INDEX IF NOT EXISTS idx_ins_enrolments_expiry
  ON medical_insurance_enrolments (tenant_id, enrolment_status, expiry_date);

-- Index for active plans per entity (eligibility resolution)
CREATE INDEX IF NOT EXISTS idx_ins_plans_entity_active
  ON medical_insurance_plans (tenant_id, legal_entity_id, is_active);
