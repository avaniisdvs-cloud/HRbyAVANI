-- ============================================================================
-- Migration 0041 — Hiring request pending-approval uniqueness constraint
-- (COLLISION-004 fix, Phase 3 Priority 6A)
--
-- Prevents two concurrent PENDING_APPROVAL hiring requests for the same
-- position at the database level, independently of application-layer guards.
--
-- A partial unique index is used so that approved, rejected, cancelled, and
-- fulfilled records are unrestricted — this allows the full hiring lifecycle:
--   vacancy opens → request raised → approved/rejected →
--   position filled/re-vacated → new request raised for the same position.
--
-- The index includes tenant_id as the first column for defence-in-depth in
-- multi-tenant deployments (each position UUID is already tenant-scoped via
-- positions.tenant_id, but explicit inclusion here is consistent with the
-- insurance uniqueness pattern in migration 0027).
-- ============================================================================

-- One position can only have one PENDING_APPROVAL hiring request at a time.
-- Non-PENDING_APPROVAL history rows (APPROVED, REJECTED, CANCELLED, FULFILLED)
-- are excluded from the uniqueness constraint — re-hiring is unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hiring_request_pending
  ON hiring_requests (tenant_id, position_id)
  WHERE status = 'PENDING_APPROVAL';
