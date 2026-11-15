-- ============================================================================
-- Migration 0028 — Add reference_path to notification_log
--
-- Allows in-app notification bell to deep-link directly to the relevant
-- page (e.g. /persons/{id}/insurance) without requiring the UI to
-- reconstruct the path from referenceType + referenceId.
-- ============================================================================

ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS reference_path VARCHAR(500);
