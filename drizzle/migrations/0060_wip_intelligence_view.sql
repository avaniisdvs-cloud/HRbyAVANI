-- ============================================================================
-- 0060 — Workflow Intelligence Platform · Phase A
-- workflow_intelligence_view — the single canonical read model.
--
-- The ONE place status / current owner / next approver / age / SLA-breach /
-- escalation / previous-decisions are computed. Every downstream consumer
-- (ARIA, dashboards, notifications, all persona UIs) reads this view in later
-- phases, so SLA/breach logic lives in exactly one definition.
--
-- Depends only on EXISTING tables + the additive columns from 0055. Does NOT
-- reference workflow_recommendations (Phase D / 0059) — recommendations are
-- joined at query time, keeping this view independently deployable now.
--
-- Read-only object. Creating it changes NO production behaviour (nothing reads
-- it until Phase B). Apply order within Phase A: 0055 → 0056 → 0057 → 0060.
--
-- Breach is defined ONCE here:
--   sla_deadline IS NOT NULL AND now() > sla_deadline
--   AND status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED')
--
-- Rollback:
--   DROP VIEW IF EXISTS workflow_intelligence_view;
-- ============================================================================

CREATE OR REPLACE VIEW workflow_intelligence_view AS
SELECT
  i.id                              AS instance_id,
  i.tenant_id,
  i.legal_entity_id,
  d.workflow_code,
  d.workflow_name_en,
  d.workflow_name_ar,
  i.status,
  i.status                          AS resource_status,   -- canonical source = instance status
  i.resource_type,
  i.resource_id,
  i.initiated_by_person_id,
  init.full_name_en                 AS initiator_name,
  i.current_step_order,
  (SELECT count(*)::int FROM workflow_step_instances s WHERE s.instance_id = i.id) AS total_steps,
  cur.step_name                     AS current_step_name,
  cur.approver_person_id            AS current_approver_person_id,
  cur.approver_name                 AS current_approver_name,
  nxt.step_name                     AS next_step_name,
  nxt.approver_name                 AS next_approver_name,
  i.started_at,
  (EXTRACT(EPOCH FROM (now() - i.started_at)) / 3600.0)::numeric(12,2) AS age_hours,
  i.sla_deadline,
  CASE
    WHEN i.sla_deadline IS NULL THEN NULL
    ELSE (EXTRACT(EPOCH FROM (i.sla_deadline - now())) / 3600.0)::numeric(12,2)
  END                               AS sla_hours_remaining,
  (
    i.sla_deadline IS NOT NULL
    AND now() > i.sla_deadline
    AND i.status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED')
  )                                 AS is_sla_breached,
  i.escalated_at,
  (SELECT count(*)::int
     FROM workflow_audit_log a
    WHERE a.instance_id = i.id
      AND a.action = 'SLA_ESCALATED')                                  AS escalation_count,
  COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'stepOrder',    s.step_order,
               'stepName',     COALESCE(s.step_name_at_decision, st.step_name_en),
               'approver',     p.full_name_en,
               'decision',     s.decision,
               'decisionNote', s.decision_note,
               'decidedAt',    s.decided_at
             )
             ORDER BY s.step_order
           )
      FROM workflow_step_instances s
      JOIN workflow_steps_v2 st ON st.id = s.step_id
      LEFT JOIN persons p ON p.id = s.decided_by_person_id
     WHERE s.instance_id = i.id
       AND s.decision IS NOT NULL
  ), '[]'::jsonb)                                                      AS previous_decisions
FROM workflow_instances_v2 i
JOIN workflow_definitions_v2 d ON d.id = i.workflow_definition_id
LEFT JOIN persons init ON init.id = i.initiated_by_person_id
-- current pending step = lowest-order step still PENDING
LEFT JOIN LATERAL (
  SELECT st.step_name_en          AS step_name,
         s.assigned_to_person_id  AS approver_person_id,
         p.full_name_en           AS approver_name
    FROM workflow_step_instances s
    JOIN workflow_steps_v2 st ON st.id = s.step_id
    LEFT JOIN persons p ON p.id = s.assigned_to_person_id
   WHERE s.instance_id = i.id
     AND s.status = 'PENDING'
   ORDER BY s.step_order ASC
   LIMIT 1
) cur ON true
-- next step = lowest-order step still WAITING
LEFT JOIN LATERAL (
  SELECT st.step_name_en  AS step_name,
         p.full_name_en   AS approver_name
    FROM workflow_step_instances s
    JOIN workflow_steps_v2 st ON st.id = s.step_id
    LEFT JOIN persons p ON p.id = s.assigned_to_person_id
   WHERE s.instance_id = i.id
     AND s.status = 'WAITING'
   ORDER BY s.step_order ASC
   LIMIT 1
) nxt ON true;

COMMENT ON VIEW workflow_intelligence_view IS 'WIP Phase A: single canonical read model for workflow status/owner/SLA/escalation/history. Sole source of SLA-breach logic.';
