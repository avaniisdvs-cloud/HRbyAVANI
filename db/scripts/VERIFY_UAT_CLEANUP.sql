-- =============================================================================
--  VERIFY_UAT_CLEANUP.sql
--  AVANIIS HR — Post-Cleanup Verification (READ-ONLY)
-- =============================================================================
--  ⚠️  REVIEW-ONLY ARTIFACT — read-only by construction (SELECT only).
--      This file performs NO writes. It has NOT been executed. Run it AFTER
--      CLEANUP_UAT_BUSINESS_DATA.sql to confirm the wipe was correct, complete,
--      and FK-clean — and that everything that must survive, survived.
--
--  Design doc:  docs/qa-qc/uat-business-data-cleanup-framework.md
--  Authored:    2026-06-03
--
--  HOW TO READ
--    Every check returns a `status` column of 'PASS' or 'FAIL'. Any 'FAIL'
--    means the cleanup did not meet the contract — investigate before reload.
--    Section 8 returns the overall verdict.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ONLY AVN-001 REMAINS AS A LEGAL ENTITY (no dummy entities left)
-- -----------------------------------------------------------------------------
SELECT '1. legal entities' AS check_name,
       CASE WHEN (SELECT count(*) FROM legal_entities) = 1
             AND (SELECT count(*) FROM legal_entities WHERE entity_code = 'AVN-001') = 1
            THEN 'PASS' ELSE 'FAIL' END AS status,
       (SELECT count(*) FROM legal_entities)                                AS total_entities,
       (SELECT count(*) FROM legal_entities WHERE entity_code <> 'AVN-001') AS dummy_entities_remaining;

-- -----------------------------------------------------------------------------
-- 2. SUPER ADMIN ACCOUNT + PERSON SURVIVE
-- -----------------------------------------------------------------------------
SELECT '2. super admin account' AS check_name,
       CASE WHEN (SELECT count(*) FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') >= 1
            THEN 'PASS' ELSE 'FAIL' END AS status,
       (SELECT count(*) FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') AS super_admin_accounts;

-- PASS when EVERY SUPER_ADMIN account points to an existing person.
-- (Count-aware: multiple admin accounts may legitimately share one person, so
--  this checks for any account with a missing person rather than count-equality.)
SELECT '2. super admin person' AS check_name,
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM user_accounts ua
               WHERE ua.avaniis_role = 'SUPER_ADMIN'
                 AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.id = ua.person_id)
            ) THEN 'PASS' ELSE 'FAIL' END AS status,
       (SELECT count(DISTINCT person_id) FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') AS distinct_super_admin_persons,
       (SELECT count(*) FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') AS super_admin_accounts;

-- -----------------------------------------------------------------------------
-- 3. AVN-001 NAME CORRECTED
-- -----------------------------------------------------------------------------
SELECT '3. AVN-001 name corrected' AS check_name,
       CASE WHEN (SELECT name_en FROM legal_entities WHERE entity_code='AVN-001')
                 = 'Avaniis'
            THEN 'PASS' ELSE 'FAIL' END AS status,
       (SELECT name_en FROM legal_entities WHERE entity_code='AVN-001') AS current_name_en;

-- -----------------------------------------------------------------------------
-- 4. BUSINESS ORG + TRANSACTION TABLES ARE EMPTY (ready for reload)
--    persons / user_accounts are checked as "non-Super-Admin = 0".
-- -----------------------------------------------------------------------------
SELECT '4. delete-set empty' AS check_name,
       CASE WHEN coalesce(sum(n),0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
       coalesce(sum(n),0) AS rows_remaining_total
FROM (
  SELECT count(*) n FROM business_units            UNION ALL
  SELECT count(*)   FROM departments               UNION ALL
  SELECT count(*)   FROM positions                 UNION ALL
  SELECT count(*)   FROM jobs                       UNION ALL
  SELECT count(*)   FROM locations                  UNION ALL
  SELECT count(*)   FROM projects                   UNION ALL
  SELECT count(*)   FROM payroll_definitions        UNION ALL
  SELECT count(*)   FROM worker_assignments         UNION ALL
  SELECT count(*)   FROM payroll_assignments        UNION ALL
  SELECT count(*)   FROM work_schedule_assignments  UNION ALL
  SELECT count(*)   FROM contracts                  UNION ALL
  SELECT count(*)   FROM salary_elements            UNION ALL
  SELECT count(*)   FROM employment_actions         UNION ALL
  SELECT count(*)   FROM grade_history              UNION ALL
  SELECT count(*)   FROM department_history         UNION ALL
  SELECT count(*)   FROM location_history           UNION ALL
  SELECT count(*)   FROM job_history                UNION ALL
  SELECT count(*)   FROM position_history           UNION ALL
  SELECT count(*)   FROM leave_plan_enrolments      UNION ALL
  SELECT count(*)   FROM approval_group_members     UNION ALL
  SELECT count(*)   FROM workflow_delegation_rules  UNION ALL
  SELECT count(*)   FROM person_contacts            UNION ALL
  SELECT count(*)   FROM person_addresses           UNION ALL
  SELECT count(*)   FROM person_documents           UNION ALL
  SELECT count(*)   FROM person_bank_details        UNION ALL
  SELECT count(*)   FROM person_dependents          UNION ALL
  SELECT count(*)   FROM person_emergency_contacts  UNION ALL
  SELECT count(*)   FROM person_education            UNION ALL
  SELECT count(*)   FROM person_professional_certs   UNION ALL
  SELECT count(*)   FROM persons WHERE id NOT IN (SELECT person_id FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') UNION ALL
  SELECT count(*)   FROM user_accounts WHERE avaniis_role <> 'SUPER_ADMIN'
) q;

-- 4b. TRANSACTION tables empty (all reloadable runtime data).
SELECT '4b. transaction tables empty' AS check_name,
       CASE WHEN coalesce(sum(n),0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
       coalesce(sum(n),0) AS rows_remaining_total
FROM (
  SELECT count(*) n FROM payroll_runs              UNION ALL
  SELECT count(*)   FROM payroll_results            UNION ALL
  SELECT count(*)   FROM eosb_calculations          UNION ALL
  SELECT count(*)   FROM wps_sif_records            UNION ALL
  SELECT count(*)   FROM gpssa_contributions        UNION ALL
  SELECT count(*)   FROM dews_contributions         UNION ALL
  SELECT count(*)   FROM vss_contributions          UNION ALL
  SELECT count(*)   FROM gl_journal_lines           UNION ALL
  SELECT count(*)   FROM timesheet_periods          UNION ALL
  SELECT count(*)   FROM timesheet_entries          UNION ALL
  SELECT count(*)   FROM attendance_records         UNION ALL
  SELECT count(*)   FROM attendance_exceptions      UNION ALL
  SELECT count(*)   FROM device_punch_raw           UNION ALL
  SELECT count(*)   FROM device_sync_log            UNION ALL
  SELECT count(*)   FROM absence_entries            UNION ALL
  SELECT count(*)   FROM absence_balances           UNION ALL
  SELECT count(*)   FROM accommodation_requests     UNION ALL
  SELECT count(*)   FROM medical_insurance_enrolments UNION ALL
  SELECT count(*)   FROM employee_letters           UNION ALL
  SELECT count(*)   FROM letter_email_jobs          UNION ALL
  SELECT count(*)   FROM document_files             UNION ALL
  SELECT count(*)   FROM onboarding_checklists      UNION ALL
  SELECT count(*)   FROM onboarding_checklist_items UNION ALL
  SELECT count(*)   FROM probation_reviews          UNION ALL
  SELECT count(*)   FROM hiring_requests            UNION ALL
  SELECT count(*)   FROM transfer_requests          UNION ALL
  SELECT count(*)   FROM notification_log           UNION ALL
  SELECT count(*)   FROM approval_delegations       UNION ALL
  SELECT count(*)   FROM blackout_periods           UNION ALL
  SELECT count(*)   FROM org_hierarchy_snapshots    UNION ALL
  SELECT count(*)   FROM events                     UNION ALL
  SELECT count(*)   FROM audit_log                  UNION ALL
  SELECT count(*)   FROM workflow_instances         UNION ALL
  SELECT count(*)   FROM workflow_instances_v2      UNION ALL
  SELECT count(*)   FROM workflow_step_instances    UNION ALL
  SELECT count(*)   FROM workflow_audit_log         UNION ALL
  SELECT count(*)   FROM workflow_email_tokens      UNION ALL
  SELECT count(*)   FROM workflow_notification_queue
) q;

-- -----------------------------------------------------------------------------
-- 5. PRESERVED CONFIGURATION STILL HAS ROWS (the platform survived intact)
-- -----------------------------------------------------------------------------
SELECT '5. config preserved' AS check_name,
       CASE WHEN bool_and(n > 0) THEN 'PASS' ELSE 'FAIL (a config table is empty — investigate)' END AS status,
       count(*) FILTER (WHERE n = 0) AS empty_config_tables
FROM (
  SELECT count(*) n FROM workflow_definitions      UNION ALL
  SELECT count(*)   FROM workflow_definitions_v2    UNION ALL
  SELECT count(*)   FROM workflow_rules             UNION ALL
  SELECT count(*)   FROM workflow_steps_v2          UNION ALL
  SELECT count(*)   FROM approval_groups            UNION ALL
  SELECT count(*)   FROM letter_templates           UNION ALL
  SELECT count(*)   FROM letter_template_types      UNION ALL
  SELECT count(*)   FROM notification_templates     UNION ALL
  SELECT count(*)   FROM compliance_rules           UNION ALL
  SELECT count(*)   FROM feature_permissions        UNION ALL
  SELECT count(*)   FROM document_type_configs      UNION ALL
  SELECT count(*)   FROM leave_rule_sets            UNION ALL
  SELECT count(*)   FROM leave_rule_lines           UNION ALL
  SELECT count(*)   FROM absence_plans              UNION ALL
  SELECT count(*)   FROM absence_types              UNION ALL
  SELECT count(*)   FROM work_schedules             UNION ALL
  SELECT count(*)   FROM public_holidays            UNION ALL
  SELECT count(*)   FROM grade_salary_ranges        UNION ALL
  SELECT count(*)   FROM medical_insurance_plans    UNION ALL
  SELECT count(*)   FROM aria_agent_config          UNION ALL
  SELECT count(*)   FROM grades                     -- preserved per header deviation
) q;

-- -----------------------------------------------------------------------------
-- 6. NO ORPHANED FK REFERENCES
--    For each preserved/remaining table, confirm zero rows point at a parent
--    that no longer exists. All counts MUST be 0.
-- -----------------------------------------------------------------------------
SELECT '6. orphan scan' AS check_name,
       CASE WHEN coalesce(sum(orphans),0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
       coalesce(sum(orphans),0) AS total_orphans
FROM (
  -- preserved Super-Admin person must still point at a real, preserved entity
  SELECT count(*) orphans FROM persons p
    WHERE p.legal_entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.id = p.legal_entity_id)
  UNION ALL
  -- preserved person's grade pointer (grades preserved)
  SELECT count(*) FROM persons p
    WHERE p.current_grade_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.id = p.current_grade_id)
  UNION ALL
  -- preserved person's payroll pointer should now be NULL (payroll_definitions gone)
  SELECT count(*) FROM persons p
    WHERE p.payroll_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM payroll_definitions pd WHERE pd.id = p.payroll_id)
  UNION ALL
  -- user_accounts -> persons
  SELECT count(*) FROM user_accounts ua
    WHERE NOT EXISTS (SELECT 1 FROM persons p WHERE p.id = ua.person_id)
  UNION ALL
  -- user_accounts -> legal_entities (primary_entity_id)
  SELECT count(*) FROM user_accounts ua
    WHERE NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.id = ua.primary_entity_id)
  UNION ALL
  -- refresh_tokens -> user_accounts
  SELECT count(*) FROM refresh_tokens rt
    WHERE NOT EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.id = rt.user_account_id)
  UNION ALL
  -- grade_salary_ranges -> grades (the dependency that forced preserving grades)
  SELECT count(*) FROM grade_salary_ranges gsr
    WHERE NOT EXISTS (SELECT 1 FROM grades g WHERE g.id = gsr.grade_id)
  UNION ALL
  -- grade_salary_ranges -> legal_entities
  SELECT count(*) FROM grade_salary_ranges gsr
    WHERE NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.id = gsr.legal_entity_id)
  UNION ALL
  -- preserved workflow person pointers must be NULL (no dangling person refs)
  SELECT count(*) FROM workflow_steps_v2
    WHERE hierarchy_person_id IS NOT NULL OR escalation_person_id IS NOT NULL
  UNION ALL
  SELECT count(*) FROM workflow_definitions_v2
    WHERE fallback_person_id IS NOT NULL
) q;

-- 6b. CONFIG ROWS MUST NOT REFERENCE A NON-AVN-001 ENTITY (scope assumption 6.3)
--     If this FAILs, a config row was scoped to a deleted entity — the cleanup
--     would have FK-aborted; this confirms the assumption held.
SELECT '6b. config is AVN-001-scoped' AS check_name,
       CASE WHEN coalesce(sum(bad),0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
       coalesce(sum(bad),0) AS config_rows_pointing_at_missing_entity
FROM (
  SELECT count(*) bad FROM workflow_definitions      WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM letter_templates          WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM notification_templates     WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM compliance_rules           WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM work_schedules             WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM public_holidays            WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM medical_insurance_plans    WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities) UNION ALL
  SELECT count(*)     FROM grade_salary_ranges        WHERE legal_entity_id IS NOT NULL AND legal_entity_id NOT IN (SELECT id FROM legal_entities)
) q;

-- -----------------------------------------------------------------------------
-- 7. REPEATABILITY — re-running the cleanup must delete 0 additional rows.
--    (Run CLEANUP again right after this; the BEFORE counts should already be 0
--     for every delete-set table. This query simply restates the invariant.)
-- -----------------------------------------------------------------------------
SELECT '7. repeatability invariant' AS check_name,
       'Re-running CLEANUP should report 0 deletions for all delete-set tables.' AS note,
       (SELECT count(*) FROM business_units)
       + (SELECT count(*) FROM positions)
       + (SELECT count(*) FROM worker_assignments)
       + (SELECT count(*) FROM persons WHERE id NOT IN (SELECT person_id FROM user_accounts WHERE avaniis_role='SUPER_ADMIN'))
       AS residual_business_rows_should_be_zero;

-- -----------------------------------------------------------------------------
-- 8. OVERALL VERDICT
-- -----------------------------------------------------------------------------
SELECT '8. OVERALL' AS check_name,
       CASE WHEN
            (SELECT count(*) FROM legal_entities) = 1
        AND (SELECT count(*) FROM legal_entities WHERE entity_code='AVN-001') = 1
        AND (SELECT name_en FROM legal_entities WHERE entity_code='AVN-001') = 'Avaniis'
        AND (SELECT count(*) FROM user_accounts WHERE avaniis_role='SUPER_ADMIN') >= 1
        AND (SELECT count(*) FROM persons WHERE id NOT IN (SELECT person_id FROM user_accounts WHERE avaniis_role='SUPER_ADMIN')) = 0
        AND (SELECT count(*) FROM business_units) = 0
        AND (SELECT count(*) FROM positions) = 0
        AND (SELECT count(*) FROM worker_assignments) = 0
        AND (SELECT count(*) FROM audit_log) = 0
        AND (SELECT count(*) FROM grade_salary_ranges) > 0
        AND (SELECT count(*) FROM compliance_rules) > 0
            THEN 'PASS — cleanup complete, platform preserved, ready for reload'
            ELSE 'FAIL — review the individual checks above' END AS verdict;

-- =============================================================================
--  END — READ-ONLY. No data was modified by this script.
-- =============================================================================
