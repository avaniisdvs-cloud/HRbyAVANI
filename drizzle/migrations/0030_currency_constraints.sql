-- Migration 0030: Currency setup constraints
--
-- 1. Partial unique index enforcing BR-CCY-001 at the DB level:
--    At most one open-ended (effectiveTo IS NULL) active config per legal entity.
--    This prevents the race condition where two concurrent inserts both pass
--    the application-level assertNoOverlap check.
--
-- 2. Drop the unused `updated_date` column from company_currency_settings.
--    The audit() helper writes `last_updated_date`; `updated_date` was a
--    copy-paste remnant that is never read or written.

CREATE UNIQUE INDEX IF NOT EXISTS idx_currency_settings_one_open_ended
  ON company_currency_settings (tenant_id, legal_entity_id)
  WHERE is_active = true AND effective_to IS NULL;
