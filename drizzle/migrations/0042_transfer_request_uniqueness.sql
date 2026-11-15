-- ============================================================================
-- Migration 0042 — Transfer request pending-approval uniqueness constraint
-- (COLLISION-004B fix, Phase 3 Priority 6B)
--
-- Prevents two concurrent PENDING_APPROVAL transfer/promotion requests for the
-- same person at the database level, independently of application-layer guards.
--
-- A partial unique index is used so that approved, rejected, and cancelled
-- records are unrestricted — a person can be re-transferred after their prior
-- request is resolved:
--   raise request → approved/rejected → resolved →
--   new request can be raised for the same person.
--
-- The index is scoped to (tenant_id, person_id) because:
--   • A person can only undergo one pending transfer/promotion at a time.
--   • target_position_id and target_department_id are both nullable — using
--     either as a key column would allow bypassing the constraint by leaving
--     the target null.
--   • Concurrent TRANSFER + PROMOTION for the same person would be blocked —
--     this is the correct business behaviour; resolve one before raising the other.
--
-- Follows the exact pattern of migration 0041 (hiring_requests) and migration
-- 0027 (insurance active-enrolment uniqueness).
-- ============================================================================

-- One person can only have one PENDING_APPROVAL transfer/promotion request at a time.
-- Non-PENDING_APPROVAL rows (APPROVED, REJECTED, CANCELLED) are excluded — history is unbounded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_request_pending
  ON transfer_requests (tenant_id, person_id)
  WHERE status = 'PENDING_APPROVAL';
