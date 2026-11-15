-- Migration 0053: Add pdf_data and failure_reason to employee_letters
--
-- Context: letter PDF generation succeeds (renderToBuffer produces a valid
-- buffer) but the subsequent uploadDocument() call throws on Vercel because
-- DOCUMENT_STORAGE_PROVIDER is not configured ("Document storage is not
-- configured"). The catch block sets status=FAILED but had nowhere to store the
-- real reason, so employees saw a generic "Contact HR to reissue".
--
-- Fix (mirrors migration 0052 for photos):
--   pdf_data TEXT       — base64 data URL (data:application/pdf;base64,...) of the
--                         generated PDF. Durable in Neon across Vercel container
--                         restarts. Always populated on successful generation, so
--                         letters work on UAT without cloud storage.
--   failure_reason TEXT — the real error message when generation genuinely fails
--                         (e.g. PDF rendering error). Surfaced to the employee and
--                         HR instead of a generic message.
--
-- Download priority (application layer): signed_pdf_url || pdf_url || pdf_data
--   - Cloud configured: pdf_url has a real URL → used (fast CDN delivery)
--   - No cloud (UAT):   pdf_url = '' → pdf_data base64 → works

ALTER TABLE employee_letters
  ADD COLUMN IF NOT EXISTS pdf_data       TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

COMMENT ON COLUMN employee_letters.pdf_data IS
  'Base64 data URL of the generated PDF — durable fallback when cloud storage '
  'is not configured. Download priority: signed_pdf_url || pdf_url || pdf_data.';

COMMENT ON COLUMN employee_letters.failure_reason IS
  'Real error message captured when PDF generation fails. Surfaced to employee/HR '
  'instead of a generic message. Cleared on successful regeneration.';
