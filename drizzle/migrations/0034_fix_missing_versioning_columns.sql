-- Migration 0034: add action_mode + corrects_row_id to person_documents and person_emergency_contacts
-- These two tables were omitted from migration 0031 (Priority A).

-- person_documents
ALTER TABLE person_documents
  ADD COLUMN IF NOT EXISTS action_mode     VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID        REFERENCES person_documents(id);

-- person_emergency_contacts
ALTER TABLE person_emergency_contacts
  ADD COLUMN IF NOT EXISTS action_mode     VARCHAR(15) NOT NULL DEFAULT 'UPDATE',
  ADD COLUMN IF NOT EXISTS corrects_row_id UUID        REFERENCES person_emergency_contacts(id);

-- Sparse indexes (only non-null corrects_row_id rows are ever queried by FK)
CREATE INDEX IF NOT EXISTS idx_person_documents_corrects_row_id
  ON person_documents(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_emergency_contacts_corrects_row_id
  ON person_emergency_contacts(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;
