-- ============================================================================
-- Migration 0027 — Insurance active-enrolment uniqueness constraints
--
-- Prevents duplicate ACTIVE/PENDING/RENEWAL_DUE EMPLOYEE enrolments for the
-- same person at the DB level, independently of application-layer guards.
-- A partial unique index is used so expired/cancelled history is unrestricted.
-- ============================================================================

-- Partial unique index: one person can only have one non-terminal EMPLOYEE enrolment.
-- Terminal statuses (CANCELLED, EXPIRED) are excluded — history is unbounded.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ins_active_employee_enrolment
  ON medical_insurance_enrolments (tenant_id, person_id)
  WHERE enrolment_type  = 'EMPLOYEE'
    AND enrolment_status IN ('ACTIVE', 'PENDING', 'RENEWAL_DUE');

-- Partial unique index: one person+dependent pair can only have one non-terminal DEPENDENT enrolment.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ins_active_dependent_enrolment
  ON medical_insurance_enrolments (tenant_id, person_id, dependent_id)
  WHERE enrolment_type  = 'DEPENDENT'
    AND enrolment_status IN ('ACTIVE', 'PENDING', 'RENEWAL_DUE')
    AND dependent_id IS NOT NULL;
