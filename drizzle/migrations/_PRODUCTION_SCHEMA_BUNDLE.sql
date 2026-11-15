-- ============================================================================
-- AVANIIS HR — PRODUCTION SCHEMA BUNDLE  (single source for manual migrations)
-- ============================================================================
-- WHY THIS FILE EXISTS
--   The Drizzle journal (drizzle/meta/_journal.json) stops at 0039. Every
--   migration 0040+ is MANUAL SQL applied via the Neon SQL Editor — `drizzle-kit
--   migrate` will NOT apply them. This file is the ONE ordered, idempotent,
--   verifiable script to bring any database (esp. PRODUCTION) up to the current
--   branch schema. It is updated on every new branch schema change.
--
-- HOW TO RUN (production cutover)
--   1. Open the Neon SQL Editor connected to the PRODUCTION database (a stable
--      branch/project — NOT the ephemeral UAT branch).
--   2. SECTION 1 (Baseline 0040–0055-payroll): apply the repo files in order
--      ONLY if the target DB is below them. Most are guarded (IF NOT EXISTS /
--      OR REPLACE) and safe to re-run; the two exceptions are flagged below.
--   3. SECTION 2 (Workflow Intelligence Platform): paste the blocks below. They
--      are fully idempotent. Run each `$$`-quoted function body as its OWN
--      statement (Neon's editor splits on `;` and mangles dollar-quoted bodies).
--   4. Run SECTION 3 (verification) — every check must pass.
--
-- ⚠️ DATA, NOT SCHEMA, STAYS IN UAT
--   This bundle contains SCHEMA only. The UAT *.uat@avaniis.dev accounts, the
--   HRADMIN/CEO approval groups + members, the Annual/Sick Leave step rows, and
--   the sample leave instances (Shakeel/Dorababu) are TEST DATA and must NEVER be
--   copied to production. Production HR seeds its own real approval groups +
--   workflow steps via the builder after this schema is applied.
--
-- ⚠️ NUMBERING NOTE
--   0052 and 0055 each have two files (a prior migration + a new one). They are
--   applied by content and touch different objects, so there is no conflict. The
--   WIP files (0055/0056/0057/0060_wip_*) are this platform effort; a future
--   cleanup may renumber them, but DO NOT renumber an already-applied migration.
-- ============================================================================
-- CHANGELOG (newest first)
--   2026-06-xx  Phase D (R1–R4: requester visibility, ESS My Requests, timeline
--               reuse, review-perf hotfix): NO schema change — all read the view.
--               (Registry/templates/generic-recommendations decoupling — 0061-0063 —
--               is DEFERRED; not part of the R1–R4 acceptance gate.)
--   2026-06-xx  Phase C (RBAC & Workflow Operations): NO schema change — read-only
--               /approvals/operations enforced in code (middleware + getWorkflowOperations).
--   2026-06-xx  Phase B (Shared services & timeline): NO schema change (reads the view).
--   2026-06-xx  Phase A (Workflow Intelligence Platform): 0055_wip step columns,
--               0056_wip notification meta_json, 0057_wip audit immutability
--               trigger, 0060_wip workflow_intelligence_view.  [SECTION 2]
--   (baseline)  0040–0054 + 0055_payroll: prior-session manual migrations.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — BASELINE (0040 → 0055_payroll)  [apply repo files in order]
-- ============================================================================
-- These are prior-session migrations already living as individual files in
-- drizzle/migrations/. If the production DB is fresh or below 0054, apply each
-- file's contents in this exact order via the SQL Editor, THEN do SECTION 2:
--
--   0040_aria_branding_config.sql
--   0041_hiring_request_uniqueness.sql
--   0042_transfer_request_uniqueness.sql
--   0043_personal_profile_fields.sql
--   0044_employment_fields.sql
--   0045_persons_is_active_backfill.sql
--   0046_person_documents_scope.sql
--   0047_leave_backdate_policy.sql
--   0048_backdate_policy_comment_fix.sql        -- COMMENT-only (idempotent)
--   0049_letter_types_ess_expansion.sql         -- ⚠ NOT guarded: re-run may error if already applied
--   0050_document_management_v2.sql
--   0051_document_type_check_expansion.sql
--   0052_document_file_data.sql
--   0052_person_profile_photo_data.sql
--   0053_letter_pdf_data_failure_reason.sql
--   0054_department_work_schedule.sql
--   0055_payroll_run_number_per_entity.sql
--
-- (If the DB is already at this baseline — the usual case once UAT and prod are
--  in sync — skip SECTION 1 and apply only SECTION 2.)


-- ============================================================================
-- SECTION 2 — WORKFLOW INTELLIGENCE PLATFORM  (LIVING — updated each phase)
-- ============================================================================
-- Fully idempotent. Safe to re-run.

-- ── Phase A · 0055_wip — additive step-instance columns ─────────────────────
ALTER TABLE workflow_step_instances
  ADD COLUMN IF NOT EXISTS step_name_at_decision    varchar(160),
  ADD COLUMN IF NOT EXISTS aria_recommendation_code varchar(20),
  ADD COLUMN IF NOT EXISTS sla_hours                integer,
  ADD COLUMN IF NOT EXISTS delegation_depth         integer NOT NULL DEFAULT 0;

-- ── Phase A · 0056_wip — notification queue snapshot column ─────────────────
ALTER TABLE workflow_notification_queue
  ADD COLUMN IF NOT EXISTS meta_json jsonb;

-- ── Phase A · 0057_wip — append-only audit ledger ──────────────────────────
-- NOTE: run this CREATE FUNCTION as its OWN statement in the Neon editor.
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

-- ── Phase A · 0060_wip — canonical read model ──────────────────────────────
CREATE OR REPLACE VIEW workflow_intelligence_view AS
SELECT
  i.id AS instance_id, i.tenant_id, i.legal_entity_id,
  d.workflow_code, d.workflow_name_en, d.workflow_name_ar,
  i.status, i.status AS resource_status, i.resource_type, i.resource_id,
  i.initiated_by_person_id, init.full_name_en AS initiator_name,
  i.current_step_order,
  (SELECT count(*)::int FROM workflow_step_instances s WHERE s.instance_id = i.id) AS total_steps,
  cur.step_name AS current_step_name, cur.approver_person_id AS current_approver_person_id,
  cur.approver_name AS current_approver_name,
  nxt.step_name AS next_step_name, nxt.approver_name AS next_approver_name,
  i.started_at,
  (EXTRACT(EPOCH FROM (now() - i.started_at))/3600.0)::numeric(12,2) AS age_hours,
  i.sla_deadline,
  CASE WHEN i.sla_deadline IS NULL THEN NULL
       ELSE (EXTRACT(EPOCH FROM (i.sla_deadline - now()))/3600.0)::numeric(12,2) END AS sla_hours_remaining,
  (i.sla_deadline IS NOT NULL AND now() > i.sla_deadline
     AND i.status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED')) AS is_sla_breached,
  i.escalated_at,
  (SELECT count(*)::int FROM workflow_audit_log a WHERE a.instance_id = i.id AND a.action = 'SLA_ESCALATED') AS escalation_count,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'stepOrder', s.step_order, 'stepName', COALESCE(s.step_name_at_decision, st.step_name_en),
      'approver', p.full_name_en, 'decision', s.decision,
      'decisionNote', s.decision_note, 'decidedAt', s.decided_at) ORDER BY s.step_order)
    FROM workflow_step_instances s
    JOIN workflow_steps_v2 st ON st.id = s.step_id
    LEFT JOIN persons p ON p.id = s.decided_by_person_id
    WHERE s.instance_id = i.id AND s.decision IS NOT NULL), '[]'::jsonb) AS previous_decisions
FROM workflow_instances_v2 i
JOIN workflow_definitions_v2 d ON d.id = i.workflow_definition_id
LEFT JOIN persons init ON init.id = i.initiated_by_person_id
LEFT JOIN LATERAL (
  SELECT st.step_name_en AS step_name, s.assigned_to_person_id AS approver_person_id, p.full_name_en AS approver_name
  FROM workflow_step_instances s JOIN workflow_steps_v2 st ON st.id = s.step_id
  LEFT JOIN persons p ON p.id = s.assigned_to_person_id
  WHERE s.instance_id = i.id AND s.status = 'PENDING' ORDER BY s.step_order ASC LIMIT 1) cur ON true
LEFT JOIN LATERAL (
  SELECT st.step_name_en AS step_name, p.full_name_en AS approver_name
  FROM workflow_step_instances s JOIN workflow_steps_v2 st ON st.id = s.step_id
  LEFT JOIN persons p ON p.id = s.assigned_to_person_id
  WHERE s.instance_id = i.id AND s.status = 'WAITING' ORDER BY s.step_order ASC LIMIT 1) nxt ON true;

-- ── Phase B — NO schema changes (read-only services over the view above) ────
-- (placeholder; future phases append their idempotent DDL here)


-- ============================================================================
-- SECTION 3 — VERIFICATION  (every check must pass after applying SECTION 2)
-- ============================================================================
-- 1. Phase A additive columns present → expect 4
SELECT count(*) AS step_cols_present FROM information_schema.columns
 WHERE table_name='workflow_step_instances'
   AND column_name IN ('step_name_at_decision','aria_recommendation_code','sla_hours','delegation_depth');

-- 2. notification queue meta_json present → expect 1
SELECT count(*) AS meta_present FROM information_schema.columns
 WHERE table_name='workflow_notification_queue' AND column_name='meta_json';

-- 3. intelligence view exists + returns (use any in-progress instance) → expect a row
SELECT current_step_name, current_approver_name, next_approver_name, is_sla_breached
  FROM workflow_intelligence_view WHERE status='IN_PROGRESS' LIMIT 1;

-- 4. audit ledger is tamper-proof → expect ERROR (append-only)
--    UPDATE workflow_audit_log SET action='STEP_APPROVED' WHERE id=(SELECT id FROM workflow_audit_log LIMIT 1);
-- ============================================================================
