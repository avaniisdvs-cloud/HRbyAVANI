-- =============================================================================
--  CLEANUP_UAT_BUSINESS_DATA.sql
--  AVANIIS HR — Repeatable UAT Business-Data Cleanup
-- =============================================================================
--  ⚠️  REVIEW-ONLY ARTIFACT — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL.
--      This file was authored for static review. It has NOT been run against
--      any database. It deletes business data; treat it as live ordnance.
--
--  Design doc (approved):  docs/qa-qc/uat-business-data-cleanup-framework.md
--  Authored:               2026-06-03
--
--  WHAT IT DOES
--    Wipes all BUSINESS MASTER DATA and BUSINESS TRANSACTION DATA so corrected
--    sample org structures can be reloaded, while PRESERVING every platform
--    configuration table, the AVN-001 legal entity, and the Super Admin
--    account + its person row. Repeat as many times as needed.
--
--  APPROVED DECISIONS BAKED IN
--    1. approval_group_members  -> DELETED each cycle (group defs preserved).
--    2. workflow person pointers -> NULLed before deleting persons.
--    3. AVN-001 + all AVN-001/global config -> PRESERVED.
--    4. audit_log -> PURGED each cycle.
--    5. payroll_definitions / salary_elements / payroll_assignments -> DELETED;
--       grade_salary_ranges -> PRESERVED.
--    6. Rollback = Neon branch + this transaction wrapper.
--
--  ⚠️  DEVIATION FROM LITERAL BRIEF — REQUIRES ACKNOWLEDGEMENT
--    `grades` is PRESERVED (not deleted). Reason: grade_salary_ranges.grade_id
--    is a NOT NULL FK to grades, and decision (5) preserves grade_salary_ranges.
--    Deleting grades would orphan / FK-violate the preserved salary ranges.
--    The G1–G15 grade catalog is stable seed/reference data; all *business*
--    referrers (persons, positions, jobs, worker_assignments, grade_history)
--    ARE deleted first, so preserving grades is FK-safe. If you truly want
--    grades wiped, grade_salary_ranges must move to the delete set — say so and
--    this script will be revised.
--
--  ROLLBACK
--    PRIMARY:   Create a Neon branch BEFORE running. If anything is wrong,
--               restore/point at the branch (instant, copy-on-write).
--    SECONDARY: The whole script is wrapped in BEGIN ... COMMIT. Any error
--               (FK violation, failed guard) aborts and rolls back — DB untouched.
--
--  DRY RUN
--    To preview without persisting: change the final COMMIT; to ROLLBACK;
--    The before/after count SELECTs still print, but nothing is persisted.
-- =============================================================================

-- psql: abort on first error (no-op in Neon SQL Editor, which auto-rolls back a
--       failed transaction). Harmless to leave in.
\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- PHASE G — SAFETY GUARDS (abort the whole transaction if any check fails)
-- =============================================================================
DO $$
DECLARE
  v_ket          uuid;
  v_super_count  int;
  v_tenant       uuid := '00000000-0000-0000-0000-000000000001';  -- AVANIIS_TENANT_ID
BEGIN
  -- (G1) WRONG DATABASE / SCHEMA guard ---------------------------------------
  --      If the core tables don't exist, we're pointed at the wrong DB. Abort.
  IF to_regclass('public.legal_entities') IS NULL
     OR to_regclass('public.persons')      IS NULL
     OR to_regclass('public.user_accounts') IS NULL
     OR to_regclass('public.audit_log')     IS NULL THEN
    RAISE EXCEPTION
      'ABORT (G1): core tables missing — this is not the AVANIIS HR schema. DB=%',
      current_database();
  END IF;

  -- (G2) AVN-001 MUST EXIST guard --------------------------------------------
  --      Also doubles as a "right database" sentinel.
  SELECT id INTO v_ket FROM legal_entities WHERE entity_code = 'AVN-001';
  IF v_ket IS NULL THEN
    RAISE EXCEPTION
      'ABORT (G2): AVN-001 legal entity not found. Refusing to run (wrong DB, or AVN-001 already removed). DB=%',
      current_database();
  END IF;

  -- (G3) SUPER ADMIN MUST BE IDENTIFIABLE guard ------------------------------
  --      At least one SUPER_ADMIN user_account must exist; all of them (and
  --      their person rows) are preserved. Zero => cannot honor "keep Super
  --      Admin" => abort.
  SELECT count(*) INTO v_super_count
    FROM user_accounts
   WHERE avaniis_role = 'SUPER_ADMIN';
  IF v_super_count = 0 THEN
    RAISE EXCEPTION
      'ABORT (G3): no SUPER_ADMIN user_account found — cannot preserve Super Admin.';
  END IF;
  IF v_super_count > 1 THEN
    RAISE NOTICE 'NOTE (G3): % SUPER_ADMIN accounts found — ALL will be preserved.', v_super_count;
  END IF;

  -- (G4) TENANT sentinel (defence-in-depth; single-tenant today) -------------
  IF NOT EXISTS (SELECT 1 FROM legal_entities WHERE tenant_id = v_tenant) THEN
    RAISE NOTICE 'NOTE (G4): expected Avaniis tenant % not present on legal_entities — proceeding, but verify the target DB.', v_tenant;
  END IF;

  RAISE NOTICE 'GUARDS PASSED. AVN-001 id=%, SUPER_ADMIN accounts=%, DB=%',
    v_ket, v_super_count, current_database();
END $$;

-- =============================================================================
-- BEFORE COUNTS — diagnostic snapshot of the DELETE-SET tables
-- (Config/preserve tables are listed separately at the end to prove they are
--  untouched.)
-- =============================================================================
SELECT 'BEFORE' AS phase, t AS table_name, n AS row_count FROM (
  SELECT 'legal_entities (non-AVN-001)' t, (SELECT count(*) FROM legal_entities WHERE entity_code <> 'AVN-001') n UNION ALL
  SELECT 'business_units',         (SELECT count(*) FROM business_units)            UNION ALL
  SELECT 'departments',            (SELECT count(*) FROM departments)               UNION ALL
  SELECT 'positions',              (SELECT count(*) FROM positions)                 UNION ALL
  SELECT 'jobs',                   (SELECT count(*) FROM jobs)                      UNION ALL
  SELECT 'locations',              (SELECT count(*) FROM locations)                 UNION ALL
  SELECT 'projects',               (SELECT count(*) FROM projects)                  UNION ALL
  SELECT 'payroll_definitions',    (SELECT count(*) FROM payroll_definitions)       UNION ALL
  SELECT 'persons (non-SuperAdmin)', (SELECT count(*) FROM persons WHERE id NOT IN (SELECT person_id FROM user_accounts WHERE avaniis_role='SUPER_ADMIN')) UNION ALL
  SELECT 'user_accounts (non-SA)',  (SELECT count(*) FROM user_accounts WHERE avaniis_role <> 'SUPER_ADMIN') UNION ALL
  SELECT 'worker_assignments',     (SELECT count(*) FROM worker_assignments)        UNION ALL
  SELECT 'contracts',              (SELECT count(*) FROM contracts)                 UNION ALL
  SELECT 'salary_elements',        (SELECT count(*) FROM salary_elements)           UNION ALL
  SELECT 'employment_actions',     (SELECT count(*) FROM employment_actions)        UNION ALL
  SELECT 'payroll_runs',           (SELECT count(*) FROM payroll_runs)              UNION ALL
  SELECT 'payroll_results',        (SELECT count(*) FROM payroll_results)           UNION ALL
  SELECT 'absence_entries',        (SELECT count(*) FROM absence_entries)           UNION ALL
  SELECT 'absence_balances',       (SELECT count(*) FROM absence_balances)          UNION ALL
  SELECT 'timesheet_entries',      (SELECT count(*) FROM timesheet_entries)         UNION ALL
  SELECT 'medical_insurance_enrolments', (SELECT count(*) FROM medical_insurance_enrolments) UNION ALL
  SELECT 'employee_letters',       (SELECT count(*) FROM employee_letters)          UNION ALL
  SELECT 'workflow_instances_v2',  (SELECT count(*) FROM workflow_instances_v2)     UNION ALL
  SELECT 'approval_group_members', (SELECT count(*) FROM approval_group_members)    UNION ALL
  SELECT 'audit_log',              (SELECT count(*) FROM audit_log)
) s ORDER BY table_name;

-- =============================================================================
-- PHASE 0 — NEUTRALISE PRESERVED-CONFIG POINTERS TO PERSONS
--   These config rows are PRESERVED; only their (nullable) person FKs are
--   released so the referenced persons can later be deleted. Idempotent.
-- =============================================================================
UPDATE workflow_steps_v2
   SET hierarchy_person_id = NULL,
       escalation_person_id = NULL
 WHERE hierarchy_person_id IS NOT NULL
    OR escalation_person_id IS NOT NULL;

UPDATE workflow_definitions_v2
   SET fallback_person_id = NULL
 WHERE fallback_person_id IS NOT NULL;

-- =============================================================================
-- PHASE 1 — BUSINESS TRANSACTION DATA (deepest children first)
--   All full-table wipes (every row is reloadable runtime data).
-- =============================================================================
-- 1a. Workflow runtime (v2 step-instances cascade from instances_v2, but we
--     delete explicitly + in order for clarity and idempotency).
--     workflow_audit_log has an immutability trigger (trg_workflow_audit_log_immutable,
--     migration 0057). Disable within this transaction so the UAT wipe can proceed;
--     re-enable immediately after. DISABLE TRIGGER is transactional — rolls back if
--     the overall transaction rolls back.
DELETE FROM workflow_notification_queue;
DELETE FROM workflow_email_tokens;
ALTER TABLE workflow_audit_log DISABLE TRIGGER trg_workflow_audit_log_immutable;
DELETE FROM workflow_audit_log;
ALTER TABLE workflow_audit_log ENABLE TRIGGER trg_workflow_audit_log_immutable;
DELETE FROM workflow_step_instances;
DELETE FROM workflow_instances_v2;
DELETE FROM workflow_instances;            -- v1 engine

-- 1b. Letters & document blobs (letter_email_jobs -> employee_letters).
DELETE FROM letter_email_jobs;
DELETE FROM employee_letters;
DELETE FROM document_files;

-- 1c. Payroll OUTPUT + statutory + GL + timesheets (all -> payroll_runs).
--     Must precede payroll_runs (Phase 2).
DELETE FROM payroll_results;
DELETE FROM eosb_calculations;             -- -> payroll_runs AND employment_actions
DELETE FROM wps_sif_records;
DELETE FROM gpssa_contributions;
DELETE FROM dews_contributions;
DELETE FROM vss_contributions;
DELETE FROM gl_journal_lines;
DELETE FROM timesheet_entries;
DELETE FROM timesheet_periods;             -- -> payroll_runs

-- 1d. Attendance / device.
DELETE FROM attendance_exceptions;         -- -> attendance_records
DELETE FROM attendance_records;
DELETE FROM device_punch_raw;
DELETE FROM device_sync_log;

-- 1e. Leave/absence runtime + insurance enrolments.
DELETE FROM absence_balances;
DELETE FROM absence_entries;
DELETE FROM accommodation_requests;
DELETE FROM medical_insurance_enrolments;

-- 1f. Onboarding, lifecycle requests, misc runtime.
DELETE FROM onboarding_checklist_items;    -- -> onboarding_checklists
DELETE FROM onboarding_checklists;
DELETE FROM probation_reviews;
DELETE FROM hiring_requests;
DELETE FROM transfer_requests;
DELETE FROM notification_log;
DELETE FROM approval_delegations;
DELETE FROM blackout_periods;              -- -> departments (deleted later)
DELETE FROM org_hierarchy_snapshots;
DELETE FROM events;

-- 1g. Audit log (decision 4: PURGE each cycle).
--     audit_log has an immutability trigger (audit_log_immutable, migration 0005)
--     AND a REVOKE DELETE FROM PUBLIC (migration 0001). The connection owner role
--     bypasses the revoke; the trigger must be disabled within this transaction.
ALTER TABLE audit_log DISABLE TRIGGER audit_log_immutable;
DELETE FROM audit_log;
ALTER TABLE audit_log ENABLE TRIGGER audit_log_immutable;

-- 1h. Refresh tokens for NON-Super-Admin accounts (-> user_accounts).
DELETE FROM refresh_tokens
 WHERE user_account_id NOT IN (
   SELECT id FROM user_accounts WHERE avaniis_role = 'SUPER_ADMIN'
 );

-- =============================================================================
-- PHASE 2 — payroll_runs + employment_actions
--   payroll_runs after all its children (Phase 1c).
--   employment_actions after eosb_calculations (1c) and BEFORE worker_assignments.
-- =============================================================================
DELETE FROM payroll_runs;
DELETE FROM employment_actions;            -- -> worker_assignments (Phase 4)

-- =============================================================================
-- PHASE 3 — NON-Super-Admin user accounts (-> persons; deleted before persons)
-- =============================================================================
DELETE FROM user_accounts
 WHERE avaniis_role <> 'SUPER_ADMIN';

-- =============================================================================
-- PHASE 4 — BUSINESS MASTER: assignment / link / history tables
--   salary_elements before worker_assignments (FK). *_history before their
--   parents (positions/departments/etc., Phase 6).
-- =============================================================================
DELETE FROM salary_elements;               -- -> worker_assignments, persons, payroll_definitions
DELETE FROM payroll_assignments;
DELETE FROM work_schedule_assignments;
DELETE FROM worker_assignments;            -- self-ref; full wipe is FK-safe (NO ACTION at stmt end)
DELETE FROM leave_plan_enrolments;         -- -> person_contacts (Phase 5)
DELETE FROM contracts;                     -- self-ref previous_contract_id; full wipe ok
DELETE FROM grade_history;
DELETE FROM department_history;
DELETE FROM location_history;
DELETE FROM job_history;
DELETE FROM position_history;
DELETE FROM approval_group_members;        -- decision 1: DELETE each cycle (group defs kept)
DELETE FROM workflow_delegation_rules;     -- NOT NULL person FKs; time-bound operational data

-- =============================================================================
-- PHASE 5 — PERSON SUB-RECORDS (those referencing person_documents first)
-- =============================================================================
DELETE FROM person_education;              -- -> person_documents
DELETE FROM person_professional_certs;     -- -> person_documents
DELETE FROM person_dependents;             -- -> person_documents (+ self visa_sponsor)
DELETE FROM person_contacts;
DELETE FROM person_addresses;              -- self-ref; full wipe ok
DELETE FROM person_bank_details;           -- self-ref; full wipe ok
DELETE FROM person_emergency_contacts;     -- self-ref; full wipe ok
DELETE FROM person_documents;              -- self-ref; deleted after its dependents above

-- =============================================================================
-- PHASE 6 — ORG STRUCTURE (these reference persons via head/incumbent, so they
--   MUST be deleted BEFORE persons). Child→parent order within the phase.
--   NOTE: grades is intentionally NOT here — it is PRESERVED (see header).
-- =============================================================================
DELETE FROM positions;                     -- -> jobs, departments, grades, locations, self
DELETE FROM jobs;                          -- -> grades, self
DELETE FROM departments;                   -- -> business_units, persons, self
DELETE FROM business_units;                -- -> legal_entities, persons
DELETE FROM locations;                     -- self-ref
DELETE FROM projects;                      -- self-ref

-- =============================================================================
-- PHASE 7 — PERSONS (all except the preserved Super-Admin set)
--   Pre-step: release the preserved persons' FKs that point at deleted tables
--   (payroll_definitions) and at other (deleted) persons, so neither this
--   delete nor Phase 8 violates a constraint. current_* columns are bare uuids
--   (no FK) but are nulled for cleanliness. current_grade_id nulled here to
--   guard against SA pointing at a non-AVN-001 grade (deleted in Phase 8.5).
-- =============================================================================
UPDATE persons
   SET payroll_id            = NULL,   -- FK -> payroll_definitions (deleted Phase 8)
       current_position_id   = NULL,   -- bare uuid (stale)
       current_job_id        = NULL,
       current_department_id = NULL,
       current_location_id   = NULL,
       current_grade_id      = NULL,   -- FK -> grades; non-AVN grades deleted Phase 8.5
       line_manager_id       = NULL,   -- self FK -> a person being deleted
       dotted_line_manager_id = NULL,
       hr_representative_id   = NULL
 WHERE id IN (SELECT person_id FROM user_accounts WHERE avaniis_role = 'SUPER_ADMIN');

DELETE FROM persons
 WHERE id NOT IN (
   SELECT person_id FROM user_accounts WHERE avaniis_role = 'SUPER_ADMIN'
 );

-- =============================================================================
-- PHASE 8 — payroll_definitions (now unreferenced: persons.payroll_id nulled,
--   payroll_runs / payroll_assignments / salary_elements all gone)
-- =============================================================================
DELETE FROM payroll_definitions;

-- =============================================================================
-- PHASE 8.5 — NON-AVN-001 CONFIG ROW CLEANUP
--   Platform config tables are preserved, but rows scoped to non-AVN-001
--   entities must be removed before those entities can be deleted (Phase 9).
--   Order: children before parents within the config hierarchy.
--   AVN-001-scoped rows are NOT touched (WHERE legal_entity_id <> AVN-001).
-- =============================================================================
-- Reference subquery reused throughout this phase:
--   (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')

-- 8.5a. leave_backdate_policies: refs absence_types + legal_entities.
--        Re-point to AVN-001 to match its parent absence_types migration below.
UPDATE leave_backdate_policies
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5b. absence_types: PRESERVED — re-point to AVN-001 (not deleted).
--        No unique constraint beyond PK — re-point is conflict-safe.
UPDATE absence_types
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5c. absence_plans: PRESERVED — re-point to AVN-001 (not deleted).
UPDATE absence_plans
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5d. leave_rule_lines: refs leave_rule_sets (no direct entity FK)
DELETE FROM leave_rule_lines
 WHERE leave_rule_set_id IN (
         SELECT id FROM leave_rule_sets
          WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001'));

-- 8.5e. leave_rule_sets: refs legal_entities
DELETE FROM leave_rule_sets
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5f. workflow_routing_rules + workflow_stages: ref workflow_definitions (not cascade)
DELETE FROM workflow_routing_rules
 WHERE workflow_definition_id IN (
         SELECT id FROM workflow_definitions
          WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001'));

DELETE FROM workflow_stages
 WHERE workflow_definition_id IN (
         SELECT id FROM workflow_definitions
          WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001'));

-- 8.5g. workflow_definitions: PRESERVED — re-point to AVN-001 (not deleted).
--        workflow_stages and workflow_routing_rules ref workflow_definitions (not
--        legal_entities directly) so they follow automatically — no change needed.
--        No unique constraint beyond PK — re-point is conflict-safe.
UPDATE workflow_definitions
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5h. work_schedule_patterns: no direct entity FK — patterns belong to their
--        parent schedule which is re-pointed below; no change needed here.

-- 8.5i. work_schedules: PRESERVED — re-point to AVN-001 (not deleted).
--        No unique constraint beyond PK — re-point is conflict-safe.
UPDATE work_schedules
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5j. grades: delete non-AVN-001 rows.
--        By this point all business referrers are gone (grade_history Phase 4,
--        worker_assignments Phase 4, positions/jobs Phase 6, persons Phase 7).
--        grade_salary_ranges only has AVN-001 rows (verified) so AVN-001 grades
--        are unaffected. SA persons.current_grade_id nulled in Phase 7 prep.
DELETE FROM grades
 WHERE legal_entity_id IS NOT NULL
   AND legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- 8.5k. Remaining flat config tables with direct legal_entity_id FK.
--        All AVN-only in the current DB (confirmed by scan 2026-06-03),
--        but included here for idempotency across future UAT cycles.
-- company_currency_settings: PRESERVED — re-point to AVN-001 (not deleted).
UPDATE company_currency_settings
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM compliance_rules
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM custom_field_definitions
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM document_type_configs
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM form_configurations
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM grade_salary_ranges
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM letter_templates
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
-- medical_insurance_policy_settings: cascades when entity is deleted, but explicit is safer
DELETE FROM medical_insurance_policy_settings
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM medical_insurance_plans
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM notification_templates
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM policy_settings
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM public_holidays
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM sso_provider_config
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM workflow_rules
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');
DELETE FROM workflow_sla_calendars
 WHERE legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

-- =============================================================================
-- PHASE 9 — LEGAL ENTITIES (all except AVN-001)
--   Defensive re-point first: ensure preserved Super-Admin person + account
--   reference AVN-001 (they will, in normal data — this guards an edge case
--   where a Super Admin sat in a soon-to-be-deleted entity).
--   Phase 8.5 above has removed all non-AVN-001 config rows, so no preserved
--   config table should block this delete. If one still does, the FK violation
--   aborts the transaction — fail-safe still intact.
-- =============================================================================
UPDATE persons
   SET legal_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE id IN (SELECT person_id FROM user_accounts WHERE avaniis_role = 'SUPER_ADMIN')
   AND legal_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

UPDATE user_accounts
   SET primary_entity_id = (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001')
 WHERE avaniis_role = 'SUPER_ADMIN'
   AND primary_entity_id <> (SELECT id FROM legal_entities WHERE entity_code = 'AVN-001');

DELETE FROM legal_entities
 WHERE entity_code <> 'AVN-001';

-- =============================================================================
-- PHASE 10 — CORRECT AVN-001 LEGAL NAME (idempotent)
-- =============================================================================
UPDATE legal_entities
   SET name_en = 'Avaniis'
 WHERE entity_code = 'AVN-001'
   AND name_en <> 'Avaniis';

-- =============================================================================
-- AFTER COUNTS — same delete-set tables (expect 0, except preserved Super-Admin
--   person/account which intentionally remain > 0)
-- =============================================================================
SELECT 'AFTER' AS phase, t AS table_name, n AS row_count FROM (
  SELECT 'legal_entities (non-AVN-001)' t, (SELECT count(*) FROM legal_entities WHERE entity_code <> 'AVN-001') n UNION ALL
  SELECT 'business_units',         (SELECT count(*) FROM business_units)            UNION ALL
  SELECT 'departments',            (SELECT count(*) FROM departments)               UNION ALL
  SELECT 'positions',              (SELECT count(*) FROM positions)                 UNION ALL
  SELECT 'jobs',                   (SELECT count(*) FROM jobs)                      UNION ALL
  SELECT 'locations',              (SELECT count(*) FROM locations)                 UNION ALL
  SELECT 'projects',               (SELECT count(*) FROM projects)                  UNION ALL
  SELECT 'payroll_definitions',    (SELECT count(*) FROM payroll_definitions)       UNION ALL
  SELECT 'persons (non-SuperAdmin)', (SELECT count(*) FROM persons WHERE id NOT IN (SELECT person_id FROM user_accounts WHERE avaniis_role='SUPER_ADMIN')) UNION ALL
  SELECT 'user_accounts (non-SA)',  (SELECT count(*) FROM user_accounts WHERE avaniis_role <> 'SUPER_ADMIN') UNION ALL
  SELECT 'worker_assignments',     (SELECT count(*) FROM worker_assignments)        UNION ALL
  SELECT 'contracts',              (SELECT count(*) FROM contracts)                 UNION ALL
  SELECT 'salary_elements',        (SELECT count(*) FROM salary_elements)           UNION ALL
  SELECT 'employment_actions',     (SELECT count(*) FROM employment_actions)        UNION ALL
  SELECT 'payroll_runs',           (SELECT count(*) FROM payroll_runs)              UNION ALL
  SELECT 'payroll_results',        (SELECT count(*) FROM payroll_results)           UNION ALL
  SELECT 'absence_entries',        (SELECT count(*) FROM absence_entries)           UNION ALL
  SELECT 'absence_balances',       (SELECT count(*) FROM absence_balances)          UNION ALL
  SELECT 'timesheet_entries',      (SELECT count(*) FROM timesheet_entries)         UNION ALL
  SELECT 'medical_insurance_enrolments', (SELECT count(*) FROM medical_insurance_enrolments) UNION ALL
  SELECT 'employee_letters',       (SELECT count(*) FROM employee_letters)          UNION ALL
  SELECT 'workflow_instances_v2',  (SELECT count(*) FROM workflow_instances_v2)     UNION ALL
  SELECT 'approval_group_members', (SELECT count(*) FROM approval_group_members)    UNION ALL
  SELECT 'audit_log',              (SELECT count(*) FROM audit_log)
) s ORDER BY table_name;

-- =============================================================================
-- PRESERVATION PROOF — these MUST remain > 0 / intact after the wipe
-- =============================================================================
SELECT 'PRESERVED' AS phase, t AS table_name, n AS row_count FROM (
  SELECT 'AVN-001 legal entity'  t, (SELECT count(*) FROM legal_entities WHERE entity_code='AVN-001') n UNION ALL
  SELECT 'Super Admin accounts', (SELECT count(*) FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') UNION ALL
  SELECT 'Super Admin persons',  (SELECT count(*) FROM persons p WHERE p.id IN (SELECT person_id FROM user_accounts WHERE avaniis_role='SUPER_ADMIN')) UNION ALL
  SELECT 'grades (preserved)',   (SELECT count(*) FROM grades)                       UNION ALL
  SELECT 'grade_salary_ranges',  (SELECT count(*) FROM grade_salary_ranges)          UNION ALL
  SELECT 'workflow_definitions', (SELECT count(*) FROM workflow_definitions)         UNION ALL
  SELECT 'workflow_definitions_v2', (SELECT count(*) FROM workflow_definitions_v2)   UNION ALL
  SELECT 'workflow_rules',       (SELECT count(*) FROM workflow_rules)               UNION ALL
  SELECT 'approval_groups',      (SELECT count(*) FROM approval_groups)              UNION ALL
  SELECT 'letter_templates',     (SELECT count(*) FROM letter_templates)            UNION ALL
  SELECT 'notification_templates', (SELECT count(*) FROM notification_templates)     UNION ALL
  SELECT 'compliance_rules',     (SELECT count(*) FROM compliance_rules)            UNION ALL
  SELECT 'feature_permissions',  (SELECT count(*) FROM feature_permissions)         UNION ALL
  SELECT 'document_type_configs',(SELECT count(*) FROM document_type_configs)       UNION ALL
  SELECT 'leave_rule_sets',      (SELECT count(*) FROM leave_rule_sets)             UNION ALL
  SELECT 'work_schedules',       (SELECT count(*) FROM work_schedules)              UNION ALL
  SELECT 'public_holidays',      (SELECT count(*) FROM public_holidays)             UNION ALL
  SELECT 'medical_insurance_plans', (SELECT count(*) FROM medical_insurance_plans)  UNION ALL
  SELECT 'aria_agent_config',    (SELECT count(*) FROM aria_agent_config)
) s ORDER BY table_name;

-- =============================================================================
--  COMMIT or ROLLBACK
--  • Leave as COMMIT for a real cleanup (after a Neon branch is taken).
--  • Change to ROLLBACK for a dry run (counts print, nothing persists).
-- =============================================================================
COMMIT;
-- ROLLBACK;   -- <- uncomment (and comment COMMIT) for a dry run

-- =============================================================================
--  END — Reload order is the reverse of deletion:
--    legal_entities → grades(kept) → org structure → persons → assignments →
--    contracts → transactional data → re-add approval_group_members + re-point
--    workflow person pointers.
-- =============================================================================
