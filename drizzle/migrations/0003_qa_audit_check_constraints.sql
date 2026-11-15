-- ════════════════════════════════════════════════════════════════════════════
-- QA-Audit-H6 — CHECK constraints + dependent_number cap
--
-- The Drizzle schema relies on application-layer Zod validation for enum-
-- like columns. A direct DB write (psql, future module bypassing the action
-- layer, or a one-off admin script) can persist invalid values. This
-- migration adds belt-and-braces CHECK constraints for the most safety-
-- critical columns and the BR-INS-004 max-9-dependents cap that the ERD
-- spec said would exist but was missing.
--
-- Applied: Sprint 4 (post QA/QC audit 2026-04-28).
-- ════════════════════════════════════════════════════════════════════════════

-- ── persons.gender ─────────────────────────────────────────────────────────
ALTER TABLE "persons" ADD CONSTRAINT "persons_gender_check"
  CHECK (gender IN ('MALE', 'FEMALE', 'NOT_SPECIFIED'));--> statement-breakpoint

-- ── persons.marital_status ─────────────────────────────────────────────────
ALTER TABLE "persons" ADD CONSTRAINT "persons_marital_status_check"
  CHECK (marital_status IS NULL OR marital_status IN
    ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED'));--> statement-breakpoint

-- ── persons.nationality_category (FR-CH-16; drives EOSB vs GPSSA) ─────────
ALTER TABLE "persons" ADD CONSTRAINT "persons_nationality_category_check"
  CHECK (nationality_category IN ('UAE_NATIONAL', 'GCC_NATIONAL', 'EXPAT'));--> statement-breakpoint

-- ── persons.employment_type (BR-CT-003) ────────────────────────────────────
ALTER TABLE "persons" ADD CONSTRAINT "persons_employment_type_check"
  CHECK (employment_type IN
    ('FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED'));--> statement-breakpoint

-- ── persons.assignment_status ─────────────────────────────────────────────
ALTER TABLE "persons" ADD CONSTRAINT "persons_assignment_status_check"
  CHECK (assignment_status IN
    ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RETIRED', 'DECEASED', 'PENDING_HIRE'));--> statement-breakpoint

-- ── contracts.contract_type (BR-CT-001 — only fixed-term in UAE post-2022) ─
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contract_type_check"
  CHECK (contract_type IN ('FIXED_TERM'));--> statement-breakpoint

-- ── contracts term must not exceed 3 years (BR-CT-002 belt+braces) ────────
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_term_max_3y_check"
  CHECK (end_date <= start_date + INTERVAL '3 years');--> statement-breakpoint

-- ── contracts probation must not exceed 6 months (BR-PR-001) ──────────────
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_probation_max_6mo_check"
  CHECK (probation_end IS NULL OR probation_end <= start_date + INTERVAL '6 months');--> statement-breakpoint

-- ── contracts.status ──────────────────────────────────────────────────────
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_status_check"
  CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED'));--> statement-breakpoint

-- ── worker_assignments.assignment_status ──────────────────────────────────
ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_status_check"
  CHECK (assignment_status IN
    ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'));--> statement-breakpoint

-- ── worker_assignments.action_type ────────────────────────────────────────
ALTER TABLE "worker_assignments" ADD CONSTRAINT "worker_assignments_action_type_check"
  CHECK (action_type IN
    ('HIRE', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'SALARY_REVISION',
     'CONTRACT_EXTEND', 'SUSPEND', 'REINSTATE', 'TERMINATE', 'RETIRE',
     'SECONDMENT', 'RETURN_FROM_SECONDMENT'));--> statement-breakpoint

-- ── employment_actions.action_type (same enum) ─────────────────────────────
ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_action_type_check"
  CHECK (action_type IN
    ('HIRE', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'SALARY_REVISION',
     'CONTRACT_EXTEND', 'SUSPEND', 'REINSTATE', 'TERMINATE', 'RETIRE',
     'SECONDMENT', 'RETURN_FROM_SECONDMENT'));--> statement-breakpoint

ALTER TABLE "employment_actions" ADD CONSTRAINT "employment_actions_status_check"
  CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'));--> statement-breakpoint

-- ── person_dependents.dependent_number (BR-INS-004 — max 9) ───────────────
ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_number_range_check"
  CHECK (dependent_number BETWEEN 1 AND 9);--> statement-breakpoint

-- ── person_dependents.relationship ────────────────────────────────────────
ALTER TABLE "person_dependents" ADD CONSTRAINT "person_dependents_relationship_check"
  CHECK (relationship IN
    ('SPOUSE', 'CHILD', 'PARENT', 'PARENT_IN_LAW', 'SIBLING', 'OTHER'));--> statement-breakpoint

-- ── person_documents.document_type ────────────────────────────────────────
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_type_check"
  CHECK (document_type IN
    ('EMIRATES_ID', 'PASSPORT', 'VISA', 'LABOUR_CARD', 'CONTRACT',
     'DEGREE', 'PROFESSIONAL_CERT', 'OTHER'));--> statement-breakpoint

ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_status_check"
  CHECK (document_status IN
    ('VALID', 'EXPIRING', 'EXPIRED', 'UNDER_RENEWAL', 'CANCELLED'));--> statement-breakpoint

-- ── person_bank_details.account_type ──────────────────────────────────────
ALTER TABLE "person_bank_details" ADD CONSTRAINT "person_bank_details_account_type_check"
  CHECK (account_type IN ('CURRENT', 'SAVINGS', 'SALARY'));
