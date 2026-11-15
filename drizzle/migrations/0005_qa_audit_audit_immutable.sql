-- ════════════════════════════════════════════════════════════════════════════
-- QA-Audit-M5 — Make audit_log truly INSERT-only at the database layer.
--
-- Migration 0001 ran `REVOKE UPDATE, DELETE ON TABLE audit_log FROM PUBLIC`,
-- but the application connects as a privileged role (not PUBLIC), so the
-- REVOKE has no effect on writes from the app. A trigger gives us a hard
-- backstop that fires regardless of who issues the UPDATE/DELETE.
--
-- BR-AUDIT-001 / Hard Rule 1.
-- Applied: Sprint 4 (post QA/QC audit 2026-04-28).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is INSERT-only (BR-AUDIT-001); UPDATE / DELETE attempted'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_immutable ON "audit_log";--> statement-breakpoint
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();--> statement-breakpoint

COMMENT ON TRIGGER audit_log_immutable ON "audit_log" IS
  'QA-Audit-M5: prevents any UPDATE or DELETE on audit_log. BR-AUDIT-001 / Hard Rule 1.';
