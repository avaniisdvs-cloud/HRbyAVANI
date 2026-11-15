-- Migration 0052: Durable in-database document storage (PostgreSQL bytea)
--
-- Adds the `document_files` table so file bytes can be stored directly in
-- PostgreSQL (Neon for UAT, Azure PostgreSQL for production fallback) instead of
-- the ephemeral /tmp local provider.  This makes uploads survive Vercel container
-- recycles and redeployments with zero external cloud credentials.
--
-- Provider selection (no code change between UAT and production):
--   DOCUMENT_STORAGE_PROVIDER=azure  + AZURE_STORAGE_CONNECTION_STRING → Azure Blob
--   DOCUMENT_STORAGE_PROVIDER=postgres | db                            → this table
--   DOCUMENT_STORAGE_PROVIDER unset  + DATABASE_URL present            → this table (durable fallback)
--
-- storage_key is the join key to person_documents.storage_key (and any other
-- table that stores a storage key, e.g. profile photos).  The 10 MB app-level
-- upload limit is far below PostgreSQL's 1 GB per-bytea-value ceiling.
--
-- Safe operation: additive only — creates a new table, touches nothing existing.
-- Apply manually via Neon SQL Editor (outside drizzle journal 0040+).

CREATE TABLE IF NOT EXISTS document_files (
  storage_key      TEXT        PRIMARY KEY,
  tenant_id        UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  file_data        BYTEA       NOT NULL,
  mime_type        TEXT        NOT NULL,
  file_size_bytes  INTEGER     NOT NULL,
  checksum_sha256  TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-scoped lookup support (defence-in-depth for Phase 3 multi-tenant).
CREATE INDEX IF NOT EXISTS idx_document_files_tenant
  ON document_files (tenant_id);

COMMENT ON TABLE  document_files IS
  'Durable in-DB file storage (bytea). Active when DOCUMENT_STORAGE_PROVIDER=postgres|db or unset with DATABASE_URL present. storage_key joins to person_documents.storage_key.';
COMMENT ON COLUMN document_files.file_data IS
  'Raw file bytes. App-level limit is 10 MB; PostgreSQL bytea ceiling is 1 GB.';
