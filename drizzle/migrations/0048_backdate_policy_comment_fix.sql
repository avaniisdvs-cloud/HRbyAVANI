-- Migration 0048: Correct leave_backdate_policies table comment.
--
-- Migration 0047 contained an incorrect COMMENT ON TABLE:
--   "No row = no restriction."
-- The application layer (createLeaveRequest) treats no row as a BLOCK, not
-- an open permission. This migration corrects the DB documentation to match
-- the runtime contract enforced in modules/absence/actions.ts.

COMMENT ON TABLE leave_backdate_policies IS
  'Per-entity per-leave-type backdating rules. '
  'No row = backdating BLOCKED by default (enforced at application layer in createLeaveRequest). '
  'HR must explicitly configure a row with backdating_enabled = true to allow past-date leave entries for a given leave type. '
  'backdating_enabled = false → all past dates rejected for this type/entity. '
  'backdating_enabled = true, backdate_limit_days = NULL → any past date allowed. '
  'backdating_enabled = true, backdate_limit_days = N → max N calendar days in the past. '
  'backdating_enabled = true, backdate_limit_days = 0 → today is the earliest valid start date.';

COMMENT ON COLUMN leave_backdate_policies.backdating_enabled IS
  'false = no backdated leave permitted for this type/entity. '
  'true = backdating allowed (subject to backdate_limit_days). '
  'When no row exists for a (tenant, entity, type) pair, the application treats this as backdating BLOCKED.';

COMMENT ON COLUMN leave_backdate_policies.backdate_limit_days IS
  'Max calendar days in the past relative to today (UAE time UTC+4). '
  'NULL = unlimited window (any past date allowed when backdating_enabled=true). '
  '0 = today is the only valid start date (same-day only). '
  'N > 0 = requests must start within the last N calendar days. '
  'Ignored when backdating_enabled = false. '
  'Enforced by CHECK (backdate_limit_days IS NULL OR backdate_limit_days >= 0).';
