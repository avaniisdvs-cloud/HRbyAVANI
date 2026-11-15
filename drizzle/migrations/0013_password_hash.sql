-- Migration 0013: Add password_hash column to user_accounts
-- Supports LOCAL provider password-based login managed by SUPER_ADMIN.
-- bcrypt hash, max 72 chars (bcrypt input limit). null = SSO-only account.

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(72);

COMMENT ON COLUMN user_accounts.password_hash
  IS 'bcrypt hash for LOCAL password auth. NULL = SSO-only account (Microsoft Entra / Oracle IDCS).';
