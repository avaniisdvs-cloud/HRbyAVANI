-- ============================================================================
-- 0055 — Workflow Intelligence Platform · Phase A
-- Additive columns on workflow_step_instances.
--
-- Purpose:
--   step_name_at_decision   — immutable step label captured at decision time,
--                             so historic chains read correctly even if the
--                             step definition is later renamed.
--   aria_recommendation_code— the ARIA recommendation present when the step was
--                             activated (for override-rate analytics).
--   sla_hours               — per-step SLA snapshot (audit; complements sla_deadline).
--   delegation_depth        — guard against delegation cycles / infinite re-route.
--
-- 100% additive. No existing column changed. No data backfilled. The Drizzle
-- ORM schema is intentionally NOT modified in Phase A, so existing `select()`
-- calls (which project only Drizzle-known columns) are unaffected whether or
-- not this migration is applied.
--
-- Rollback:
--   ALTER TABLE workflow_step_instances
--     DROP COLUMN IF EXISTS step_name_at_decision,
--     DROP COLUMN IF EXISTS aria_recommendation_code,
--     DROP COLUMN IF EXISTS sla_hours,
--     DROP COLUMN IF EXISTS delegation_depth;
-- ============================================================================

ALTER TABLE workflow_step_instances
  ADD COLUMN IF NOT EXISTS step_name_at_decision   varchar(160),
  ADD COLUMN IF NOT EXISTS aria_recommendation_code varchar(20),
  ADD COLUMN IF NOT EXISTS sla_hours               integer,
  ADD COLUMN IF NOT EXISTS delegation_depth        integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN workflow_step_instances.step_name_at_decision    IS 'WIP Phase A: immutable step label at decision time (historic chains).';
COMMENT ON COLUMN workflow_step_instances.aria_recommendation_code IS 'WIP Phase A: ARIA recommendation code present at step activation (override-rate metric).';
COMMENT ON COLUMN workflow_step_instances.sla_hours                IS 'WIP Phase A: per-step SLA hours snapshot (audit).';
COMMENT ON COLUMN workflow_step_instances.delegation_depth         IS 'WIP Phase A: delegation cycle guard; reject re-route beyond a safe depth.';
