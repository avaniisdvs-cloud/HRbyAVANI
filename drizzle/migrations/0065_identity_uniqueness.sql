-- 0065 — Foundation Stewardship P1-H4: identity uniqueness (BR-ID-UNIQ-001)
-- Status: LEDGER-CONTROLLED — apply via the migration-ledger process only.
--         DEV/UAT status: see docs/environment/migration-ledger.test.md.
--         Future Production status: see docs/environment/migration-ledger.production.md.
-- Additive only: new nullable hash columns + partial UNIQUE indexes. No data change.
--
-- ── PRE-FLIGHT (run read-only BEFORE applying; all three must return 0 rows) ──
-- 1) employee_code duplicates (case-insensitive):
--    SELECT lower(employee_code), count(*) FROM persons
--      WHERE employee_code IS NOT NULL
--      GROUP BY tenant_id, lower(employee_code) HAVING count(*) > 1;
-- 2/3) Emirates-ID / passport duplicates cannot be detected in SQL (encrypted,
--    non-deterministic). Run scripts/backfill-identity-hashes.mjs with
--    REPORT_ONLY=true — it decrypts in-process, hashes, and reports duplicate
--    COUNTS only (never identifiers). Resolve any duplicates before Step 3.
--
-- ── STEP 1: hash columns (idempotent) ─────────────────────────────────────────
ALTER TABLE persons ADD COLUMN IF NOT EXISTS emirates_id_hash      varchar(64);
ALTER TABLE persons ADD COLUMN IF NOT EXISTS passport_number_hash  varchar(64);

-- ── STEP 2: employee_code uniqueness (live immediately — column already plain) ─
CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_employee_code
  ON persons (tenant_id, lower(employee_code))
  WHERE employee_code IS NOT NULL;

-- ── STEP 3: identity-hash uniqueness ──────────────────────────────────────────
-- Apply AFTER scripts/backfill-identity-hashes.mjs has populated the hashes
-- and the duplicate report is clean.
CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_emirates_id_hash
  ON persons (tenant_id, emirates_id_hash)
  WHERE emirates_id_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_passport_number_hash
  ON persons (tenant_id, passport_number_hash)
  WHERE passport_number_hash IS NOT NULL;

-- ── POST-APPLY ────────────────────────────────────────────────────────────────
-- Set IDENTITY_UNIQUENESS_ENFORCEMENT=true in the environment so the
-- application writes hashes on every create/update and pre-checks duplicates
-- in-transaction (lib/identity-uniqueness.ts). Record verification in ledger.
