-- Migration 0050: Enterprise Document Management v2
-- Adds document category, source type, visibility controls, usage tracking,
-- and indexes for the new document management architecture.
-- Safe additive migration — no existing columns removed.
-- Apply manually via Neon SQL Editor (outside drizzle journal 0040+).

-- ── New columns on person_documents ──────────────────────────────────────────

ALTER TABLE person_documents
  ADD COLUMN IF NOT EXISTS document_category   varchar(50),
  ADD COLUMN IF NOT EXISTS source_type         varchar(20)  NOT NULL DEFAULT 'HR',
  ADD COLUMN IF NOT EXISTS employee_can_replace boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_only_visibility  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS download_count      integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_downloaded_at  timestamptz;

-- ── Backfill document_category from existing document_type values ─────────────

UPDATE person_documents
SET document_category = CASE
  WHEN document_type IN ('EMIRATES_ID', 'PASSPORT', 'VISA', 'LABOUR_CARD', 'DRIVING_LICENSE')
    THEN 'IDENTITY'
  WHEN document_type IN (
    'CONTRACT', 'CONTRACT_AMENDMENT', 'OFFER_LETTER', 'PROMOTION_LETTER',
    'TRANSFER_LETTER', 'SALARY_REVISION_LETTER', 'WARNING_LETTER',
    'DISCIPLINARY_ACTION', 'TERMINATION_LETTER', 'END_OF_SERVICE_LETTER',
    'SIGNED_LETTER'
  ) THEN 'EMPLOYMENT'
  WHEN document_type IN ('PAYSLIP', 'WPS_STATEMENT', 'PAYROLL_LETTER')
    THEN 'PAYROLL'
  WHEN document_type IN ('MEDICAL_CERTIFICATE', 'FITNESS_CERTIFICATE')
    THEN 'MEDICAL'
  WHEN document_type IN ('DEGREE', 'PROFESSIONAL_CERT', 'TRAINING_CERT')
    THEN 'EDUCATION'
  WHEN document_type IN ('MARRIAGE_CERTIFICATE', 'BIRTH_CERTIFICATE', 'DEPENDENT_DOCUMENTS')
    THEN 'PERSONAL'
  WHEN document_type IN ('BANK_IBAN_LETTER', 'SALARY_TRANSFER_LETTER')
    THEN 'BANKING'
  WHEN document_type IN (
    'HEALTH_INSURANCE_CARD', 'INSURANCE_POLICY', 'LABOR_CONTRACT', 'COMPANY_VISA_COPY'
  ) THEN 'HR_COMPLIANCE'
  ELSE 'SUPPORTING'
END
WHERE document_category IS NULL;

-- ── Backfill source_type for existing records ─────────────────────────────────
-- All historical records were HR-uploaded (default 'HR' already applied above).
-- Employee-typical types: mark as EMPLOYEE source. These were historically
-- uploaded by HR on behalf of employees.
UPDATE person_documents
SET source_type = 'EMPLOYEE'
WHERE document_type IN (
  'PASSPORT', 'EMIRATES_ID', 'VISA', 'DRIVING_LICENSE',
  'DEGREE', 'PROFESSIONAL_CERT', 'TRAINING_CERT',
  'MARRIAGE_CERTIFICATE', 'BIRTH_CERTIFICATE', 'DEPENDENT_DOCUMENTS',
  'BANK_IBAN_LETTER', 'SALARY_TRANSFER_LETTER',
  'MEDICAL_CERTIFICATE', 'FITNESS_CERTIFICATE',
  'SUPPORTING_ATTACHMENT', 'MISCELLANEOUS_ATTACHMENT'
)
AND source_type = 'HR';  -- only touch rows not already corrected

-- Payslips are always PAYROLL source
UPDATE person_documents
SET source_type = 'PAYROLL'
WHERE document_type IN ('PAYSLIP', 'WPS_STATEMENT')
  AND source_type = 'HR';

-- ── Employee replace flag for employee-type docs ──────────────────────────────
UPDATE person_documents
SET employee_can_replace = true
WHERE document_type IN (
  'PASSPORT', 'EMIRATES_ID', 'VISA', 'DRIVING_LICENSE',
  'DEGREE', 'PROFESSIONAL_CERT', 'TRAINING_CERT',
  'MARRIAGE_CERTIFICATE', 'BIRTH_CERTIFICATE', 'DEPENDENT_DOCUMENTS',
  'BANK_IBAN_LETTER', 'SALARY_TRANSFER_LETTER',
  'MEDICAL_CERTIFICATE', 'FITNESS_CERTIFICATE',
  'SUPPORTING_ATTACHMENT', 'MISCELLANEOUS_ATTACHMENT'
)
AND employee_can_replace = false;

-- ── HR-only visibility for sensitive types ────────────────────────────────────
UPDATE person_documents
SET hr_only_visibility = true
WHERE document_type IN ('WARNING_LETTER', 'DISCIPLINARY_ACTION')
  AND hr_only_visibility = false;

-- ── Performance indexes ───────────────────────────────────────────────────────

-- Expiry monitoring: scans per tenant/status for expiry alerts cron
CREATE INDEX IF NOT EXISTS idx_person_docs_expiry
  ON person_documents (expiry_date)
  WHERE expiry_date IS NOT NULL;

-- Category grouping: used by the documents page to show grouped sections
CREATE INDEX IF NOT EXISTS idx_person_docs_category
  ON person_documents (person_id, document_category);

-- Status filter: quick status-based filtering on person doc views
CREATE INDEX IF NOT EXISTS idx_person_docs_status
  ON person_documents (person_id, document_status);

-- Source type: used to separate employee vs HR uploaded docs
CREATE INDEX IF NOT EXISTS idx_person_docs_source
  ON person_documents (source_type);

-- ── Column comments ───────────────────────────────────────────────────────────

COMMENT ON COLUMN person_documents.document_category IS
  'Structured category: IDENTITY | EMPLOYMENT | PAYROLL | MEDICAL | EDUCATION | PERSONAL | BANKING | HR_COMPLIANCE | SUPPORTING';

COMMENT ON COLUMN person_documents.source_type IS
  'Who produced this document: EMPLOYEE (self-upload) | HR (HR team) | PAYROLL (auto-generated) | SYSTEM';

COMMENT ON COLUMN person_documents.employee_can_replace IS
  'True if the employee may replace this document via ESS upload';

COMMENT ON COLUMN person_documents.hr_only_visibility IS
  'True if this document is restricted to HR/Admin view only (e.g. warning letters, disciplinary)';

COMMENT ON COLUMN person_documents.download_count IS
  'Cumulative download counter — incremented on each SAS URL issue for audit analytics';

COMMENT ON COLUMN person_documents.last_viewed_at IS
  'Timestamp of most recent view (SAS URL issue with mode=view)';

COMMENT ON COLUMN person_documents.last_downloaded_at IS
  'Timestamp of most recent download (SAS URL issue with mode=download)';
