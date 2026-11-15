-- 0055 — Payroll run number: per-entity uniqueness (P2-P4)
--
-- PROBLEM: payroll_runs.run_number had a GLOBAL unique constraint
--   (payroll_runs_run_number_unique), but nextRunNumber() computes MAX(run_number)
--   scoped to legal_entity_id and the advisory lock key is per-entity. So entity A
--   and entity B both legitimately mint "PR-000001" → the second INSERT throws
--   23505 on the global unique. Run numbers are intended to be a PER-ENTITY
--   sequence, so the uniqueness must be composite.
--
-- FIX: drop the global unique, add a composite unique on (tenant_id,
--   legal_entity_id, run_number).
--
-- SAFETY: the previous global unique guaranteed every run_number was distinct,
--   so no two existing rows can share (tenant_id, legal_entity_id, run_number) —
--   the new index builds without conflict. No data migration required.
--
-- ⚠ MANUAL MIGRATION: the drizzle journal stops at 0039; apply this via the Neon
--   SQL Editor (see CLAUDE.md → Neon Migration Deployment Notes). Next slot: 0056.
--
-- Rollback:
--   DROP INDEX IF EXISTS uq_payroll_run_number_per_entity;
--   ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_run_number_unique UNIQUE (run_number);

ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_run_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_run_number_per_entity
  ON payroll_runs (tenant_id, legal_entity_id, run_number);
