-- ============================================================================
-- 0056 — Workflow Intelligence Platform · Phase A
-- Additive column on workflow_notification_queue.
--
-- Purpose:
--   meta_json — immutable snapshot of the ARIA recommendation (confidence,
--               violations, summary) and approver context at notification time,
--               so the bell preview can render rich workflow detail without a
--               live re-query (and without coupling to leave-only fields).
--
-- 100% additive. Drizzle ORM schema NOT modified in Phase A.
--
-- Rollback:
--   ALTER TABLE workflow_notification_queue DROP COLUMN IF EXISTS meta_json;
-- ============================================================================

ALTER TABLE workflow_notification_queue
  ADD COLUMN IF NOT EXISTS meta_json jsonb;

COMMENT ON COLUMN workflow_notification_queue.meta_json IS 'WIP Phase A: immutable workflow/ARIA snapshot for rich notification previews.';
