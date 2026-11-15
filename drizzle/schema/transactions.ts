/**
 * AVANIIS HR — Transactions Schema
 * Operational tables that are created/updated at runtime (not config-time).
 * ERD Parts 7 (missing tables), 9 (insurance enrolments), 10 (contributions).
 *
 * Import chain: foundation → configuration → transactions
 * (No circular imports)
 */
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  pgTable,
  uuid,
  varchar,
  char,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  jsonb,
  inet,
} from 'drizzle-orm/pg-core'
import {
  legalEntities,
  persons,
  departments,
  workerAssignments,
  payrollRuns,
  personDocuments,
  personDependents,
} from './foundation'
import {
  workflowDefinitions,
  workflowStages,
  medicalInsurancePlans,
} from './configuration'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers ────────────────────────────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.5 — WORKFLOW INSTANCES (operational, moved from configuration)
// Live approval transactions in-flight.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowInstances = pgTable('workflow_instances', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  // The record this workflow is approving (e.g., absence_entry.id)
  resourceType:         varchar('resource_type', { length: 50 }).notNull(),
  resourceId:           uuid('resource_id').notNull(),
  initiatedByPersonId:  uuid('initiated_by_person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  currentStageId:       uuid('current_stage_id').references(() => workflowStages.id),
  currentStageOrder:    integer('current_stage_order').notNull().default(1),
  // PENDING | IN_PROGRESS | APPROVED | REJECTED | CANCELLED | ESCALATED
  status:               varchar('status', { length: 30 }).notNull().default('PENDING'),
  startedAt:            timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt:          timestamp('completed_at', { withTimezone: true }),
  slaDeadline:          timestamp('sla_deadline', { withTimezone: true }),
  escalatedAt:          timestamp('escalated_at', { withTimezone: true }),
  finalDecisionBy:      uuid('final_decision_by').references(() => persons.id),
  finalDecisionNote:    text('final_decision_note'),
  rejectionReason:      text('rejection_reason'),
  approvalChainJson:    jsonb('approval_chain_json'),
  // S9-03: per-instance one-shot delegation. When set, overrides the
  // current stage's role-based assignment for this single instance — the
  // delegate, not the role, is the authoritative approver. Cleared (set to
  // null) by the next decision so subsequent stages route normally.
  currentDelegateePersonId: uuid('current_delegatee_person_id').references(() => persons.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.6 — APPROVAL DELEGATIONS
// Temporary approval authority transfer (e.g., while on leave).
// ══════════════════════════════════════════════════════════════════════════════

export const approvalDelegations = pgTable('approval_delegations', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  delegatorId:    uuid('delegator_id').notNull().references(() => persons.id),
  delegateId:     uuid('delegate_id').notNull().references(() => persons.id),
  legalEntityId:  uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  delegationFrom: date('delegation_from').notNull(),
  delegationTo:   date('delegation_to').notNull(),
  // NULL = all transaction types; or array of specific types
  scopeTypes:     text('scope_types').array(),
  reason:         text('reason'),
  isActive:       boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.7 — NOTIFICATION LOG
// Tracks all system notifications sent across channels.
// ══════════════════════════════════════════════════════════════════════════════

export const notificationLog = pgTable('notification_log', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:     uuid('legal_entity_id').references(() => legalEntities.id),
  recipientPersonId: uuid('recipient_person_id').notNull().references(() => persons.id),
  // DOCUMENT_EXPIRY | LEAVE_REQUEST | LEAVE_APPROVED | LEAVE_REJECTED |
  // PAYROLL_DEADLINE | WPS_CONFIRMATION | CONTRACT_EXPIRY |
  // APPROVAL_REQUIRED | APPROVAL_ESCALATION | ARIA_ALERT | SYSTEM_ALERT
  notificationType:  varchar('notification_type', { length: 100 }).notNull(),
  // PUSH | EMAIL | SMS | IN_APP | ARIA
  channel:           varchar('channel', { length: 30 }).notNull(),
  subjectEn:         varchar('subject_en', { length: 500 }),
  subjectAr:         varchar('subject_ar', { length: 500 }),
  bodyEn:            text('body_en'),
  bodyAr:            text('body_ar'),
  referenceType:     varchar('reference_type', { length: 100 }),
  referenceId:       uuid('reference_id'),
  referencePath:     varchar('reference_path', { length: 500 }),
  sentAt:            timestamp('sent_at', { withTimezone: true }),
  deliveredAt:       timestamp('delivered_at', { withTimezone: true }),
  readAt:            timestamp('read_at', { withTimezone: true }),
  // PENDING | SENT | DELIVERED | READ | FAILED | BOUNCED
  status:            varchar('status', { length: 20 }).notNull().default('PENDING'),
  failureReason:     text('failure_reason'),
  retryCount:        integer('retry_count').notNull().default(0),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.8 — ONBOARDING / OFFBOARDING CHECKLISTS
// ══════════════════════════════════════════════════════════════════════════════

export const onboardingChecklists = pgTable('onboarding_checklists', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:  uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // ONBOARDING | OFFBOARDING
  checklistType:  varchar('checklist_type', { length: 20 }).notNull().default('ONBOARDING'),
  initiatedDate:  date('initiated_date').notNull(),
  targetDate:     date('target_date'),
  // NOT_STARTED | IN_PROGRESS | COMPLETED | OVERDUE
  status:         varchar('status', { length: 30 }).notNull().default('IN_PROGRESS'),
  completionDate: date('completion_date'),
  completionPct:  integer('completion_pct').notNull().default(0),
  notes:          text('notes'),
  ...audit(),
})

export const onboardingChecklistItems = pgTable('onboarding_checklist_items', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  checklistId:      uuid('checklist_id').notNull().references(() => onboardingChecklists.id),
  itemCode:         varchar('item_code', { length: 50 }).notNull(),
  itemNameEn:       varchar('item_name_en', { length: 300 }).notNull(),
  itemNameAr:       varchar('item_name_ar', { length: 300 }),
  // DOCUMENT | IT | HR | PAYROLL | MANAGER | TRAINING
  category:         varchar('category', { length: 50 }),
  isMandatory:      boolean('is_mandatory').notNull().default(true),
  dueDaysFromStart: integer('due_days_from_start'),
  // EMPLOYEE | HR_ADMIN | IT | MANAGER | PAYROLL_ADMIN
  assignedToRole:   varchar('assigned_to_role', { length: 50 }),
  assignedPersonId: uuid('assigned_person_id').references(() => persons.id),
  // PENDING | IN_PROGRESS | COMPLETED | WAIVED | OVERDUE
  status:           varchar('status', { length: 30 }).notNull().default('PENDING'),
  completedBy:      uuid('completed_by').references(() => persons.id),
  completedDate:    date('completed_date'),
  notes:            text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.9 — BLACKOUT PERIODS
// Periods when leave requests are blocked (e.g., year-end close, Expo events).
// ══════════════════════════════════════════════════════════════════════════════

export const blackoutPeriods = pgTable('blackout_periods', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:    uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  departmentId:     uuid('department_id').references(() => departments.id),
  nameEn:           varchar('name_en', { length: 200 }).notNull(),
  nameAr:           varchar('name_ar', { length: 200 }),
  startDate:        date('start_date').notNull(),
  endDate:          date('end_date').notNull(),
  // NULL = all leave types; or specific type codes
  absenceTypeCodes: text('absence_type_codes').array(),
  // % of team that must be present (100 = full blackout)
  minCoveragePct:   integer('min_coverage_pct').notNull().default(100),
  reason:           text('reason'),
  isActive:         boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.11 — WPS SIF RECORDS
// Individual employee records within a MoHRE WPS SIF file.
// ══════════════════════════════════════════════════════════════════════════════

export const wpsSifRecords = pgTable('wps_sif_records', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollRunId:         uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  personId:             uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  employerLabourCode:   varchar('employer_labour_code', { length: 50 }).notNull(),
  employeeLabourCard:   varchar('employee_labour_card', { length: 50 }),
  routingCode:          varchar('routing_code', { length: 20 }).notNull(),
  iban:                 varchar('iban', { length: 23 }).notNull(),
  netPayAed:            numeric('net_pay_aed', { precision: 12, scale: 2 }).notNull(),
  currency:             char('currency', { length: 3 }).notNull().default('AED'),
  paymentMonth:         integer('payment_month').notNull(),
  paymentYear:          integer('payment_year').notNull(),
  sifLineNumber:        integer('sif_line_number').notNull(),
  // INCLUDED | EXCLUDED | ON_HOLD | FAILED | PAID
  sifStatus:            varchar('sif_status', { length: 30 }).notNull().default('INCLUDED'),
  exclusionReason:      text('exclusion_reason'),
  bankConfirmationRef:  varchar('bank_confirmation_ref', { length: 100 }),
  bankConfirmationDate: date('bank_confirmation_date'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.12 — GL JOURNAL LINES
// Oracle ERP GL journal entries generated per payroll run.
// ══════════════════════════════════════════════════════════════════════════════

export const glJournalLines = pgTable('gl_journal_lines', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollRunId:      uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  journalHeaderRef:  varchar('journal_header_ref', { length: 100 }),
  lineNumber:        integer('line_number').notNull(),
  accountCode:       varchar('account_code', { length: 50 }).notNull(),
  costCentreCode:    varchar('cost_centre_code', { length: 50 }),
  departmentId:      uuid('department_id').references(() => departments.id),
  elementCode:       varchar('element_code', { length: 50 }),
  debitAmount:       numeric('debit_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  creditAmount:      numeric('credit_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  descriptionEn:     varchar('description_en', { length: 300 }),
  descriptionAr:     varchar('description_ar', { length: 300 }),
  currency:          char('currency', { length: 3 }).notNull().default('AED'),
  postingDate:       date('posting_date').notNull(),
  oracleBatchId:     varchar('oracle_batch_id', { length: 100 }),
  oracleJournalId:   varchar('oracle_journal_id', { length: 100 }),
  // PENDING | POSTED | ERROR | REVERSED
  postingStatus:     varchar('posting_status', { length: 20 }).notNull().default('PENDING'),
  errorMessage:      text('error_message'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.13 — USER ACCOUNTS (SSO identity linking)
// Oracle IDCS + Microsoft AD identity → AVANIIS user.
// ══════════════════════════════════════════════════════════════════════════════

export const userAccounts = pgTable('user_accounts', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  // Oracle IDCS identity
  oracleIdcsUserId:    varchar('oracle_idcs_user_id', { length: 200 }).unique(),
  oracleEmployeeNumber: varchar('oracle_employee_number', { length: 50 }),
  // Microsoft AD identity
  msAdObjectId:        varchar('ms_ad_object_id', { length: 200 }).unique(),
  msUpn:               varchar('ms_upn', { length: 200 }),
  // Primary identity
  primaryEmail:        varchar('primary_email', { length: 200 }).notNull().unique(),
  // Bcrypt hash for LOCAL password auth. null = SSO-only account.
  passwordHash:        varchar('password_hash', { length: 72 }),
  // ORACLE_IDCS | MICROSOFT_AD | LOCAL
  primarySsoProvider:  varchar('primary_sso_provider', { length: 20 }).notNull().default('ORACLE_IDCS'),
  // AVANIIS access control
  avaniisRole:         varchar('avaniis_role', { length: 50 }).notNull(),
  allowedEntityIds:    uuid('allowed_entity_ids').array().notNull().default([]),
  primaryEntityId:     uuid('primary_entity_id').notNull().references(() => legalEntities.id),
  // MFA
  mfaEnrolled:         boolean('mfa_enrolled').notNull().default(false),
  // TOTP | SMS | EMAIL | IDCS_MFA | MS_AUTHENTICATOR
  mfaMethod:           varchar('mfa_method', { length: 30 }),
  mfaLastVerified:     timestamp('mfa_last_verified', { withTimezone: true }),
  // Login tracking
  lastLoginAt:         timestamp('last_login_at', { withTimezone: true }),
  lastLoginProvider:   varchar('last_login_provider', { length: 20 }),
  lastLoginIp:         inet('last_login_ip'),
  loginCount:          integer('login_count').notNull().default(0),
  failedLoginCount:    integer('failed_login_count').notNull().default(0),
  lockedUntil:         timestamp('locked_until', { withTimezone: true }),
  activeRefreshTokens: integer('active_refresh_tokens').notNull().default(0),
  // Status
  isActive:            boolean('is_active').notNull().default(true),
  deactivatedAt:       timestamp('deactivated_at', { withTimezone: true }),
  deactivatedReason:   varchar('deactivated_reason', { length: 200 }),
  // UI preferences — language, theme, density, date format
  preferences:         jsonb('preferences').$type<Record<string, string>>().notNull().default({}),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.14 — REFRESH TOKENS
// Issued after SSO; rotated on every use (token rotation pattern).
// ══════════════════════════════════════════════════════════════════════════════

export const refreshTokens = pgTable('refresh_tokens', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  userAccountId: uuid('user_account_id').notNull().references(() => userAccounts.id),
  // SHA-256 of actual token — raw token never stored
  tokenHash:     varchar('token_hash', { length: 64 }).notNull().unique(),
  issuedAt:      timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt:     timestamp('expires_at', { withTimezone: true }).notNull(),
  lastUsedAt:    timestamp('last_used_at', { withTimezone: true }),
  deviceInfo:    varchar('device_info', { length: 300 }),
  ipAddress:     inet('ip_address'),
  // ORACLE_IDCS | MICROSOFT_AD | LOCAL
  ssoProvider:   varchar('sso_provider', { length: 20 }),
  // Oracle IDCS / Microsoft AD session reference for Single Logout
  ssoSessionId:  varchar('sso_session_id', { length: 500 }),
  isRevoked:     boolean('is_revoked').notNull().default(false),
  revokedAt:     timestamp('revoked_at', { withTimezone: true }),
  // LOGOUT | SLO | EXPIRED | SUSPICIOUS | ADMIN | ROTATION
  revokedReason: varchar('revoked_reason', { length: 50 }),
  // No audit fields — this IS the auth audit trail
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.15 — SSO PROVIDER CONFIG
// Per-entity Oracle IDCS and Microsoft AD configuration.
// ══════════════════════════════════════════════════════════════════════════════

export const ssoProviderConfig = pgTable('sso_provider_config', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:         uuid('legal_entity_id').references(() => legalEntities.id),
  // ORACLE_IDCS | MICROSOFT_AD
  providerType:          varchar('provider_type', { length: 20 }).notNull(),
  isPrimary:             boolean('is_primary').notNull().default(false),
  isActive:              boolean('is_active').notNull().default(true),
  // Oracle IDCS specific
  oracleIdcsTenantUrl:   varchar('oracle_idcs_tenant_url', { length: 500 }),
  oracleSpEntityId:      varchar('oracle_sp_entity_id', { length: 500 }),
  oracleIdpMetadataUrl:  varchar('oracle_idp_metadata_url', { length: 500 }),
  oracleIdpCertExpiry:   date('oracle_idp_cert_expiry'),
  // Microsoft AD specific
  msTenantId:            varchar('ms_tenant_id', { length: 100 }),
  msClientId:            varchar('ms_client_id', { length: 100 }),
  msAuthorityUrl:        varchar('ms_authority_url', { length: 500 }),
  // Common
  metadataLastRefreshed: timestamp('metadata_last_refreshed', { withTimezone: true }),
  emailDomainHints:      text('email_domain_hints').array(),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §9.2 — MEDICAL INSURANCE ENROLMENTS
// Source of truth for who is enrolled in which plan.
// One row per employee/dependent per plan per policy year.
// ══════════════════════════════════════════════════════════════════════════════

export const medicalInsuranceEnrolments = pgTable('medical_insurance_enrolments', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:   uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  planId:          uuid('plan_id').notNull().references(() => medicalInsurancePlans.id),
  // EMPLOYEE | DEPENDENT
  enrolmentType:   varchar('enrolment_type', { length: 20 }).notNull().default('EMPLOYEE'),
  dependentId:     uuid('dependent_id').references(() => personDependents.id),
  // Card details
  insuranceCardNumber: varchar('insurance_card_number', { length: 100 }),
  insuranceMemberId:   varchar('insurance_member_id', { length: 100 }).notNull(),
  // Coverage period
  effectiveDate:   date('effective_date').notNull(),
  expiryDate:      date('expiry_date').notNull(),
  // Premium
  annualPremiumAed:   numeric('annual_premium_aed', { precision: 10, scale: 2 }).notNull(),
  employerPremiumAed: numeric('employer_premium_aed', { precision: 10, scale: 2 }).notNull(),
  employeePremiumAed: numeric('employee_premium_aed', { precision: 10, scale: 2 }).notNull().default('0'),
  // PENDING | ACTIVE | RENEWAL_DUE | EXPIRED | CANCELLED | SUSPENDED
  enrolmentStatus: varchar('enrolment_status', { length: 30 }).notNull().default('PENDING'),
  cardDocumentId:  uuid('card_document_id').references(() => personDocuments.id),
  submittedToInsurerDate: date('submitted_to_insurer_date'),
  insurerReference:       varchar('insurer_reference', { length: 100 }),
  cancellationDate:       date('cancellation_date'),
  cancellationReason:     varchar('cancellation_reason', { length: 200 }),
  // BR-INS-006: expiry may be extended beyond notice period end (exception)
  insuranceExpiryExtensionDate:   date('insurance_expiry_extension_date'),
  insuranceExpiryExtensionReason: varchar('insurance_expiry_extension_reason', { length: 200 }),
  notes:           text('notes'),
  // History-versioning (Correction Mode infrastructure)
  actionMode:      varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:   uuid('corrects_row_id').references((): AnyPgColumn => medicalInsuranceEnrolments.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §9.3 — MEDICAL INSURANCE POLICY SETTINGS
// Entity-level insurance rules (max dependents, who pays, enrolment grace, etc.)
// ══════════════════════════════════════════════════════════════════════════════

export const medicalInsurancePolicySettings = pgTable('medical_insurance_policy_settings', {
  id:                        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:             uuid('legal_entity_id').notNull().unique().references(() => legalEntities.id),
  maxDependentsPerEmployee:  integer('max_dependents_per_employee').notNull().default(9),
  maxSpouses:                integer('max_spouses').notNull().default(1),
  maxChildren:               integer('max_children').notNull().default(9),
  parentsCovered:            boolean('parents_covered').notNull().default(false),
  parentsInLawCovered:       boolean('parents_in_law_covered').notNull().default(false),
  // Age limits
  childMaxAge:               integer('child_max_age').notNull().default(18),
  childStudentExtensionAge:  integer('child_student_extension_age').notNull().default(25),
  // Who pays for dependents?
  employerPaysSpouse:        boolean('employer_pays_spouse').notNull().default(true),
  employerPaysChildren:      boolean('employer_pays_children').notNull().default(true),
  employerPaysParents:       boolean('employer_pays_parents').notNull().default(false),
  employeeDependentCostPct:  numeric('employee_dependent_cost_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  // Enrolment rules
  autoEnrolOnHire:           boolean('auto_enrol_on_hire').notNull().default(true),
  enrolmentGraceDays:        integer('enrolment_grace_days').notNull().default(30),
  dependentAddGraceDays:     integer('dependent_add_grace_days').notNull().default(30),
  // Alert schedule
  renewalAlertDays:          integer('renewal_alert_days').array().notNull().default([90, 60, 30, 14]),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.2 — DEWS CONTRIBUTIONS
// DIFC employees: Workplace Savings Scheme (replaces EOSB for DIFC entities).
// Applies when legal_entity.entity_type = 'DIFC'. BR-DIFC-003.
// ══════════════════════════════════════════════════════════════════════════════

export const dewsContributions = pgTable('dews_contributions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollRunId:       uuid('payroll_run_id').references(() => payrollRuns.id),
  periodYear:         integer('period_year').notNull(),
  periodMonth:        integer('period_month').notNull(),
  // UNDER_5_YEARS | 5_YEARS_PLUS
  serviceBand:        varchar('service_band', { length: 20 }).notNull(),
  // BR-DIFC-003: under 5 yrs = 5.83%, 5+ yrs = 8.33%
  contributionRate:   numeric('contribution_rate', { precision: 6, scale: 4 }).notNull(),
  basicSalary:        numeric('basic_salary', { precision: 14, scale: 2 }).notNull(),
  // basic_salary × contribution_rate
  contributionAmount: numeric('contribution_amount', { precision: 14, scale: 2 }).notNull(),
  fundManager:        varchar('fund_manager', { length: 200 }).notNull().default('Zurich International Life'),
  fundReference:      varchar('fund_reference', { length: 100 }),
  submissionDate:     date('submission_date'),
  // PENDING | SUBMITTED | CONFIRMED | FAILED
  submissionStatus:   varchar('submission_status', { length: 20 }).notNull().default('PENDING'),
  submissionRef:      varchar('submission_ref', { length: 100 }),
  // Must submit within 15 days of month start (BR-DIFC-003)
  dueDate:            date('due_date').notNull(),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.3 — GPSSA CONTRIBUTIONS
// UAE National private-sector pension. Applies when nationality_category = 'UAE_NATIONAL'.
// Employer 15% + Employee 5% of basic salary. BR-GPSSA-001.
// ══════════════════════════════════════════════════════════════════════════════

export const gpssaContributions = pgTable('gpssa_contributions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollRunId:       uuid('payroll_run_id').references(() => payrollRuns.id),
  periodYear:         integer('period_year').notNull(),
  periodMonth:        integer('period_month').notNull(),
  basicSalary:        numeric('basic_salary', { precision: 14, scale: 2 }).notNull(),
  // BR-GPSSA-001: Employer = 15%, Employee = 5%
  employerRate:       numeric('employer_rate', { precision: 6, scale: 4 }).notNull().default('0.1500'),
  employeeRate:       numeric('employee_rate', { precision: 6, scale: 4 }).notNull().default('0.0500'),
  employerAmount:     numeric('employer_amount', { precision: 14, scale: 2 }).notNull(),
  employeeAmount:     numeric('employee_amount', { precision: 14, scale: 2 }).notNull(),
  // totalContribution = employerAmount + employeeAmount (computed by application)
  totalContribution:  numeric('total_contribution', { precision: 14, scale: 2 }).notNull(),
  gpssaMemberId:      varchar('gpssa_member_id', { length: 50 }),
  // 15th of each month (BR-GPSSA-002)
  dueDate:            date('due_date').notNull(),
  submissionDate:     date('submission_date'),
  // PENDING | SUBMITTED | CONFIRMED | FAILED
  submissionStatus:   varchar('submission_status', { length: 20 }).notNull().default('PENDING'),
  submissionRef:      varchar('submission_ref', { length: 100 }),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.4 — TIMESHEET PERIODS
// Defines the submission windows for timesheets.
// ══════════════════════════════════════════════════════════════════════════════

export const timesheetPeriods = pgTable('timesheet_periods', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // WEEKLY | BIWEEKLY | MONTHLY
  periodType:    varchar('period_type', { length: 20 }).notNull(),
  periodStart:   date('period_start').notNull(),
  periodEnd:     date('period_end').notNull(),
  // OPEN | SUBMISSION_CLOSED | LOCKED | PROCESSED
  status:        varchar('status', { length: 20 }).notNull().default('OPEN'),
  payrollRunId:  uuid('payroll_run_id').references(() => payrollRuns.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.5 — TIMESHEET ENTRIES
// Daily hours per employee per timesheet period.
// ══════════════════════════════════════════════════════════════════════════════

export const timesheetEntries = pgTable('timesheet_entries', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  periodId:       uuid('period_id').notNull().references(() => timesheetPeriods.id),
  legalEntityId:  uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // Daily hours array: index 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  dailyHours:     numeric('daily_hours', { precision: 4, scale: 2 }).array().notNull().default(['0', '0', '0', '0', '0', '0', '0']),
  totalHours:     numeric('total_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  regularHours:   numeric('regular_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  overtimeHours:  numeric('overtime_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  // DRAFT | SUBMITTED | APPROVED | REJECTED | PROCESSED
  status:         varchar('status', { length: 20 }).notNull().default('DRAFT'),
  submittedAt:    timestamp('submitted_at', { withTimezone: true }),
  reviewerId:     uuid('reviewer_id').references(() => persons.id),
  reviewerName:   varchar('reviewer_name', { length: 200 }),
  reviewNote:     text('review_note'),
  reviewedAt:     timestamp('reviewed_at', { withTimezone: true }),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.7 — VSS CONTRIBUTIONS
// Voluntary Savings Scheme (Cabinet Resolution 96/2023).
// Applies to mainland entities that opt in via entity.eosb_scheme = 'VSS'.
// ══════════════════════════════════════════════════════════════════════════════

export const vssContributions = pgTable('vss_contributions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollRunId:       uuid('payroll_run_id').references(() => payrollRuns.id),
  periodYear:         integer('period_year').notNull(),
  periodMonth:        integer('period_month').notNull(),
  basicSalary:        numeric('basic_salary', { precision: 14, scale: 2 }).notNull(),
  // Employer rate set by entity (minimum = EOSB-equivalent)
  employerRate:       numeric('employer_rate', { precision: 6, scale: 4 }).notNull(),
  // Optional employee top-up
  employeeRate:       numeric('employee_rate', { precision: 6, scale: 4 }).notNull().default('0'),
  employerAmount:     numeric('employer_amount', { precision: 14, scale: 2 }).notNull(),
  employeeAmount:     numeric('employee_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  totalContribution:  numeric('total_contribution', { precision: 14, scale: 2 }).notNull(),
  fundManager:        varchar('fund_manager', { length: 200 }),
  fundMemberId:       varchar('fund_member_id', { length: 100 }),
  dueDate:            date('due_date').notNull(),
  // PENDING | SUBMITTED | CONFIRMED | FAILED
  submissionStatus:   varchar('submission_status', { length: 20 }).notNull().default('PENDING'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// EVENTS OUTBOX
// Transactional outbox pattern — Server Actions insert here inside their
// db.transaction() so domain events ship atomically with the state change.
// A background worker (node-cron — TD-09) polls for processed_at IS NULL,
// dispatches, and stamps processed_at. retry_count + error_text record failures.
// ══════════════════════════════════════════════════════════════════════════════

export const events = pgTable('events', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().default(TENANT_ID),
  // Domain event name — e.g., workflow.initiated | leave.approved | payroll.locked
  eventType:    varchar('event_type', { length: 100 }).notNull(),
  payload:      jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt:  timestamp('processed_at', { withTimezone: true }),
  retryCount:   integer('retry_count').notNull().default(0),
  errorText:    text('error_text'),
})

// ══════════════════════════════════════════════════════════════════════════════
// INFERRED TYPESCRIPT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type WorkflowInstance            = typeof workflowInstances.$inferSelect
export type ApprovalDelegation          = typeof approvalDelegations.$inferSelect
export type NotificationLogEntry        = typeof notificationLog.$inferSelect
export type OnboardingChecklist         = typeof onboardingChecklists.$inferSelect
export type OnboardingChecklistItem     = typeof onboardingChecklistItems.$inferSelect
export type BlackoutPeriod              = typeof blackoutPeriods.$inferSelect
export type WpsSifRecord                = typeof wpsSifRecords.$inferSelect
export type GlJournalLine               = typeof glJournalLines.$inferSelect
export type UserAccount                 = typeof userAccounts.$inferSelect
export type RefreshToken                = typeof refreshTokens.$inferSelect
export type SsoProviderConfig           = typeof ssoProviderConfig.$inferSelect
export type MedicalInsuranceEnrolment   = typeof medicalInsuranceEnrolments.$inferSelect
export type MedicalInsurancePolicySetting = typeof medicalInsurancePolicySettings.$inferSelect
export type DewsContribution            = typeof dewsContributions.$inferSelect
export type GpssaContribution           = typeof gpssaContributions.$inferSelect
export type TimesheetPeriod             = typeof timesheetPeriods.$inferSelect
export type TimesheetEntry              = typeof timesheetEntries.$inferSelect
export type VssContribution             = typeof vssContributions.$inferSelect

export type NewWorkflowInstance         = typeof workflowInstances.$inferInsert
export type NewUserAccount              = typeof userAccounts.$inferInsert
export type NewNotificationLogEntry     = typeof notificationLog.$inferInsert
export type NewWpsSifRecord             = typeof wpsSifRecords.$inferInsert
export type NewGlJournalLine            = typeof glJournalLines.$inferInsert
export type NewDewsContribution         = typeof dewsContributions.$inferInsert
export type NewGpssaContribution        = typeof gpssaContributions.$inferInsert
export type NewTimesheetEntry           = typeof timesheetEntries.$inferInsert
export type NewVssContribution          = typeof vssContributions.$inferInsert
export type EventOutbox                 = typeof events.$inferSelect
export type NewEventOutbox              = typeof events.$inferInsert
