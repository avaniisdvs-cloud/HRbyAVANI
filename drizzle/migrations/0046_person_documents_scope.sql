-- Migration 0046: add scope_type + context_id to person_documents
-- Separates employee identity documents (passport, visa, etc.) from
-- transaction-level attachments (leave medical certificates, etc.).
-- Existing rows are backfilled to 'EMPLOYEE' scope so the profile query
-- filter immediately excludes all future LEAVE_REQUEST rows.

ALTER TABLE person_documents
  ADD COLUMN IF NOT EXISTS scope_type  varchar(30) NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN IF NOT EXISTS context_id  uuid;

-- Index for the profile query hot path (filter to EMPLOYEE scope per person)
CREATE INDEX IF NOT EXISTS idx_person_documents_person_scope
  ON person_documents (tenant_id, person_id, scope_type)
  WHERE scope_type = 'EMPLOYEE';
