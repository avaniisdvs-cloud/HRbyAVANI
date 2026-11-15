-- ============================================================================
-- 0057 — Workflow Intelligence Platform · Phase A
-- Tamper-proof audit ledger: block UPDATE and DELETE on workflow_audit_log.
--
-- The application writes workflow_audit_log INSERT-only (verified: no UPDATE/
-- DELETE statements exist against this table anywhere in lib/ modules/ app/).
-- This trigger enforces that invariant at the database level so the compliance
-- ledger cannot be altered after the fact — by the app, a DBA mistake, or an
-- attacker with a connection.
--
-- Behaviour-safe: because the app never updates/deletes audit rows, no existing
-- flow is affected. Only out-of-contract mutations are rejected.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_workflow_audit_log_immutable ON workflow_audit_log;
--   DROP FUNCTION IF EXISTS workflow_audit_log_immutable();
-- ============================================================================

CREATE OR REPLACE FUNCTION workflow_audit_log_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'workflow_audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_audit_log_immutable ON workflow_audit_log;

CREATE TRIGGER trg_workflow_audit_log_immutable
  BEFORE UPDATE OR DELETE ON workflow_audit_log
  FOR EACH ROW EXECUTE FUNCTION workflow_audit_log_immutable();
