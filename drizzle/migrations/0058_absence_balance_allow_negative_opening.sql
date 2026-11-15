-- 0058 — Allow negative opening_balance_days on absence_balances.
--
-- Business rule: some employees can carry a negative leave balance (over-taken
-- leave). The original absence_balances_nonneg_check (migration 0006) forbade a
-- negative opening_balance_days, which blocked Phase 4 of the V2 data migration
-- for employees imported with a negative opening balance (e.g. -0.6 days).
--
-- This migration drops the old constraint and re-creates it WITHOUT the
-- opening_balance_days >= 0 clause. All other ledger columns remain non-negative.
-- (closing_balance_days was already allowed to be negative.)
--
-- Manual apply: run in Neon SQL Editor (migration journal covers 0000-0039 only).

ALTER TABLE "absence_balances" DROP CONSTRAINT IF EXISTS "absence_balances_nonneg_check";--> statement-breakpoint

ALTER TABLE "absence_balances" ADD CONSTRAINT "absence_balances_nonneg_check"
  CHECK (
        accrued_days          >= 0
    AND taken_days            >= 0
    AND pending_days          >= 0
    AND carried_forward_days  >= 0
    AND forfeited_days        >= 0
  );
