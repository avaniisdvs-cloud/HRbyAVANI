-- 0061 — Absence type balance-control flag (BR-LV-BAL-001)
--
-- Adds absence_types.requires_balance. A balance-CONTROLLED leave type draws
-- down an initialized leave balance; submission is BLOCKED (fail-closed) when no
-- absence_balances row exists for the request year. A NON-controlled type
-- (e.g. unpaid leave) submits freely with a not-applicable balance.
--
-- Why a flag and not "does a balance row exist?":
--   The old submit gate used `if (balanceRow) { enforce } ` — so a missing
--   balance row silently ALLOWED a balance-controlled request with a blank
--   snapshot. That conflated "this type isn't balance-controlled" with
--   "balance data is missing for a controlled type". This column makes the
--   intent explicit and admin-controllable.
--
-- Backfill rule (backward-compatible):
--   requires_balance = (absence_plan_id IS NOT NULL)
--   Today, absence_balances rows are only created (via accrual) for plan-linked
--   types. Plan-less types have never had balances and have always been
--   free-submit, so this backfill preserves existing behavior exactly while
--   closing the gap for plan-linked (balance-controlled) types.
--
-- Default for NEW rows = TRUE (fail-closed): a newly configured type is treated
-- as balance-controlled until an admin explicitly marks it otherwise.
--
-- ⚠ Manual migration: drizzle/meta/_journal.json tracks only 0000–0039.
-- `pnpm drizzle-kit migrate` will NOT apply this file. Apply via the Neon
-- Console SQL Editor (see CLAUDE.md "Neon Migration Deployment Notes").

ALTER TABLE absence_types
  ADD COLUMN IF NOT EXISTS requires_balance boolean NOT NULL DEFAULT true;

-- Backward-compatible backfill: only plan-linked types are balance-controlled.
UPDATE absence_types
  SET requires_balance = (absence_plan_id IS NOT NULL)
  WHERE requires_balance IS DISTINCT FROM (absence_plan_id IS NOT NULL);

COMMENT ON COLUMN absence_types.requires_balance IS
  'BR-LV-BAL-001. TRUE = balance-controlled: submission blocked (fail-closed) when no absence_balances row exists for the request year. FALSE = no balance control (e.g. unpaid leave); balance shown as not applicable.';
