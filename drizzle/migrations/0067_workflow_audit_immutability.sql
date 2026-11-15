-- 0067 — Audit-trail integrity: make workflow_audit_log append-only (DB level).
-- Status: LEDGER-CONTROLLED — apply via the migration-ledger process only.
--         DEV/UAT status: see docs/environment/migration-ledger.test.md.
--         Future Production status: see docs/environment/migration-ledger.production.md.
--
-- Core HR hardening (B3). The main audit_log is already append-only at the DB
-- level (trigger from migration 0005). workflow_audit_log carries workflow
-- approval/delegation/escalation decisions but had NO equivalent DB-level guard
-- — the only such trigger lived in the never-applied 0057_wip_audit_immutability.
-- This promotes that guard to a proper, applyable migration so workflow audit
-- decisions cannot be altered after the fact.
--
-- Behaviour-safe & idempotent: the application writes workflow_audit_log
-- INSERT-only (no UPDATE/DELETE statements exist anywhere in lib/ modules/ app/),
-- so no existing flow is affected. CREATE OR REPLACE / DROP IF EXISTS make
-- re-application safe. Supersedes 0057_wip_audit_immutability.sql for this
-- object (the WIP file is left in place; do not rename/rewrite history).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_workflow_audit_log_immutable ON workflow_audit_log;
--   DROP FUNCTION IF EXISTS workflow_audit_log_immutable();

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
