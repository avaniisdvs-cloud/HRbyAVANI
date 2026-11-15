-- ════════════════════════════════════════════════════════════════════════════
-- 0006_sprint5_check_and_unique.sql
-- QA-Audit-S5-Q2 / S5-Q3 — defence-in-depth at the DB level for the absence
-- domain tables introduced/relied-upon by Sprint 5.
--
-- Mirrors the H6 remediation pattern from migration 0003 (which covered
-- persons / contracts / worker_assignments / employment_actions / dependents
-- / documents / bank_details). Sprint 5 added or re-used four absence tables
-- without DB-level enum gates; this migration closes that gap.
--
-- Plus: UNIQUE on absence_balances scope so concurrent accrual cannot
-- double-INSERT (Sprint 5 audit S5-Q3).
-- ════════════════════════════════════════════════════════════════════════════

-- ── absence_entries ────────────────────────────────────────────────────────

ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_status_check"
  CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'TAKEN', 'RECALLED'));--> statement-breakpoint

ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_half_day_period_check"
  CHECK (half_day_period IS NULL OR half_day_period IN ('AM', 'PM'));--> statement-breakpoint

ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_submitted_via_check"
  CHECK (submitted_via IN ('PORTAL', 'MOBILE', 'ARIA_TEXT', 'ARIA_VOICE', 'HR_ADMIN'));--> statement-breakpoint

-- BR-AL-002 — calendar-day duration must be positive.
ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_duration_days_check"
  CHECK (duration_days > 0);--> statement-breakpoint

-- BR-AL-002 — start ≤ end (range invariant).
ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_date_range_check"
  CHECK (start_date <= end_date);--> statement-breakpoint

-- Half-day requests must have start = end (matches the Zod cross-field refine).
ALTER TABLE "absence_entries" ADD CONSTRAINT "absence_entries_half_day_same_day_check"
  CHECK (is_half_day = false OR start_date = end_date);--> statement-breakpoint

-- ── absence_balances ──────────────────────────────────────────────────────

-- Sanity bounds on balance_year so a stray INSERT with year=0 or year=99999
-- can't pollute the report.
ALTER TABLE "absence_balances" ADD CONSTRAINT "absence_balances_year_range_check"
  CHECK (balance_year BETWEEN 2000 AND 3000);--> statement-breakpoint

-- All ledger columns are non-negative except `closing_balance_days` (which is
-- the computed result and CAN go negative when allowNegativeBalance is set).
ALTER TABLE "absence_balances" ADD CONSTRAINT "absence_balances_nonneg_check"
  CHECK (
        opening_balance_days  >= 0
    AND accrued_days          >= 0
    AND taken_days            >= 0
    AND pending_days          >= 0
    AND carried_forward_days  >= 0
    AND forfeited_days        >= 0
  );--> statement-breakpoint

-- S5-Q3 — UNIQUE on the natural key. Concurrent `accrueMonthlyBalance` calls
-- now collapse cleanly: one INSERT wins, the other rolls back via
-- unique_violation (caller surfaces the rollback through the existing tx).
CREATE UNIQUE INDEX IF NOT EXISTS "absence_balances_scope_uniq"
  ON "absence_balances" ("tenant_id", "person_id", "absence_type_id", "balance_year");--> statement-breakpoint

-- ── absence_types ─────────────────────────────────────────────────────────

ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_is_paid_check"
  CHECK (is_paid IN ('FULL_PAY', 'HALF_PAY', 'NO_PAY', 'TIERED'));--> statement-breakpoint

ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_gender_restriction_check"
  CHECK (gender_restriction IS NULL OR gender_restriction IN ('MALE', 'FEMALE'));--> statement-breakpoint

-- ── absence_plans ─────────────────────────────────────────────────────────

ALTER TABLE "absence_plans" ADD CONSTRAINT "absence_plans_accrual_method_check"
  CHECK (accrual_method IN ('CALENDAR_YEAR', 'ANNIVERSARY_YEAR', 'HIRE_DATE', 'NONE'));--> statement-breakpoint

-- ── leave_rule_sets ───────────────────────────────────────────────────────

ALTER TABLE "leave_rule_sets" ADD CONSTRAINT "leave_rule_sets_entity_type_scope_check"
  CHECK (entity_type_scope IS NULL OR entity_type_scope IN ('MAINLAND', 'DIFC', 'ADGM', 'FREEZONE'));--> statement-breakpoint

ALTER TABLE "leave_rule_sets" ADD CONSTRAINT "leave_rule_sets_nationality_scope_check"
  CHECK (nationality_scope IS NULL OR nationality_scope IN ('UAE_NATIONAL', 'GCC_NATIONAL', 'EXPAT', 'ALL'));--> statement-breakpoint

ALTER TABLE "leave_rule_sets" ADD CONSTRAINT "leave_rule_sets_employment_type_scope_check"
  CHECK (employment_type_scope IS NULL OR employment_type_scope IN ('FULL_TIME', 'PART_TIME', 'ALL'));--> statement-breakpoint

ALTER TABLE "leave_rule_sets" ADD CONSTRAINT "leave_rule_sets_effective_range_check"
  CHECK (effective_to IS NULL OR effective_to >= effective_from);--> statement-breakpoint

-- ── leave_rule_lines ──────────────────────────────────────────────────────

ALTER TABLE "leave_rule_lines" ADD CONSTRAINT "leave_rule_lines_accrual_frequency_check"
  CHECK (accrual_frequency IN ('MONTHLY', 'DAILY', 'ANNUALLY'));--> statement-breakpoint

ALTER TABLE "leave_rule_lines" ADD CONSTRAINT "leave_rule_lines_carry_forward_check"
  CHECK (max_carry_forward_days >= 0 AND carry_forward_expiry_months >= 0);--> statement-breakpoint

-- ── blackout_periods ──────────────────────────────────────────────────────

ALTER TABLE "blackout_periods" ADD CONSTRAINT "blackout_periods_date_range_check"
  CHECK (start_date <= end_date);--> statement-breakpoint

ALTER TABLE "blackout_periods" ADD CONSTRAINT "blackout_periods_min_coverage_pct_check"
  CHECK (min_coverage_pct BETWEEN 0 AND 100);--> statement-breakpoint

-- ── public_holidays ───────────────────────────────────────────────────────

ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_applies_to_check"
  CHECK (applies_to IN ('ALL', 'MUSLIMS_ONLY', 'PUBLIC_SECTOR_ONLY'));--> statement-breakpoint

ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_year_range_check"
  CHECK (holiday_year BETWEEN 2000 AND 3000);
