-- 0059_backfill_closing_balance.sql
-- One-time data backfill (manual — run in Neon SQL Editor).
--
-- Context:
--   The V2 migration importer (modules/migration/v2-executor.ts → insertLeaveBalances)
--   inserted leave-balance rows WITHOUT setting closing_balance_days, leaving it NULL.
--   The Leave Balance report reads that column and showed Balance = 0.0 even when
--   Opening was non-zero (e.g. K1073 opening 25.5 → balance 0.0).
--
-- Fix (BR-AL-002 closing-balance formula):
--   closing = opening + accrued + carried_forward + adjusted − taken − pending − forfeited
--
-- Idempotent: only touches rows where closing_balance_days IS NULL, so re-running is safe
-- and it never overwrites a value already maintained by the accrual engine.

BEGIN;

UPDATE absence_balances
SET    closing_balance_days = ROUND(
           COALESCE(opening_balance_days,   0)
         + COALESCE(accrued_days,           0)
         + COALESCE(carried_forward_days,   0)
         + COALESCE(adjusted_days,          0)
         - COALESCE(taken_days,             0)
         - COALESCE(pending_days,           0)
         - COALESCE(forfeited_days,         0)
       , 2)
WHERE  closing_balance_days IS NULL
  AND  tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Verify before COMMIT — expect 0 remaining NULLs:
--   SELECT count(*) AS remaining_nulls FROM absence_balances
--   WHERE closing_balance_days IS NULL
--     AND tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

COMMIT;
