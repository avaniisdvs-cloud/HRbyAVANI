-- Migration 0051: Expand person_documents_type_check constraint
-- The original constraint (migration 0003) only allowed 8 document types.
-- Document Management v2 (migration 0050) introduced 36 types in code but
-- forgot to update the DB-level CHECK constraint, causing constraint violations
-- for any new type outside the original 8.
--
-- Safe operation: DROP + ADD CONSTRAINT. Zero downtime (constraint change
-- on existing data is validated, but all existing rows were inserted with
-- old valid types so they pass the new constraint too).
-- Apply manually via Neon SQL Editor (outside drizzle journal 0040+).

-- ── Drop old constraint (8 types) ────────────────────────────────────────────

ALTER TABLE person_documents
  DROP CONSTRAINT IF EXISTS person_documents_type_check;

-- ── Add expanded constraint (36 types — all types in DOCUMENT_TYPES registry) ─

ALTER TABLE person_documents
  ADD CONSTRAINT person_documents_type_check
  CHECK (document_type IN (
    -- Identity
    'PASSPORT', 'EMIRATES_ID', 'VISA', 'LABOUR_CARD', 'DRIVING_LICENSE',
    -- Education
    'DEGREE', 'PROFESSIONAL_CERT', 'TRAINING_CERT',
    -- Personal
    'MARRIAGE_CERTIFICATE', 'BIRTH_CERTIFICATE', 'DEPENDENT_DOCUMENTS',
    -- Banking
    'BANK_IBAN_LETTER', 'SALARY_TRANSFER_LETTER',
    -- Medical
    'MEDICAL_CERTIFICATE', 'FITNESS_CERTIFICATE',
    -- Supporting / general
    'SUPPORTING_ATTACHMENT', 'MISCELLANEOUS_ATTACHMENT',
    -- Employment letters
    'OFFER_LETTER', 'CONTRACT', 'CONTRACT_AMENDMENT',
    'PROMOTION_LETTER', 'TRANSFER_LETTER', 'SALARY_REVISION_LETTER',
    'WARNING_LETTER', 'DISCIPLINARY_ACTION',
    'TERMINATION_LETTER', 'END_OF_SERVICE_LETTER',
    -- HR Compliance / Insurance
    'HEALTH_INSURANCE_CARD', 'INSURANCE_POLICY', 'LABOR_CONTRACT', 'COMPANY_VISA_COPY',
    -- Payroll (auto-generated)
    'PAYSLIP', 'WPS_STATEMENT', 'PAYROLL_LETTER',
    -- Signed letter (employee letters module)
    'SIGNED_LETTER',
    -- Legacy / catch-all
    'OTHER'
  ));
