/**
 * AVANIIS HR — Foundation Schema
 * Mirrors: ERD_PHASE1_DATA_MODEL.md Parts 1–6
 *
 * BR-AUDIT-001: Every table carries 7 mandatory audit columns.
 * BR-TENANT-001: Every table carries tenant_id (Phase 1 single-tenant).
 * BR-NO-DELETE:  Records are NEVER hard-deleted; use effective dates / is_active.
 * Encrypted fields (emirates_id, passport_number, iban) are stored as ciphertext —
 * encryption/decryption happens in lib/encryption.ts before DB writes.
 */
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
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// ─── Shared helpers ────────────────────────────────────────────────────────

// Single source of truth for the Phase 1 single-tenant default. Phase 3
// multi-tenant rollout drops the column-level default and resolves tenant
// from the request context instead.
import { TENANT_ID } from '../../lib/constants'

/** Returns fresh column instances for tenant_id (call per table). */
const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

/** Returns fresh column instances for the 7 mandatory audit columns. */
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
// PART 1 — FOUNDATION / REFERENCE TABLES
// ══════════════════════════════════════════════════════════════════════════════

// V001 — Centralised picklist (nationality codes, document types, etc.)
export const lookupValues = pgTable('lookup_values', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  lookupType: varchar('lookup_type', { length: 100 }).notNull(),
  lookupCode: varchar('lookup_code', { length: 50 }).notNull(),
  valueEn:    varchar('value_en', { length: 200 }).notNull(),
  valueAr:    varchar('value_ar', { length: 200 }),
  sortOrder:  integer('sort_order').notNull().default(0),
  isActive:   boolean('is_active').notNull().default(true),
  ...audit(),
})

// V002 — Legal entities (AVANIIS subsidiaries under Avaniis)
export const legalEntities = pgTable('legal_entities', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  entityCode:           varchar('entity_code', { length: 20 }).notNull().unique(),
  nameEn:               varchar('name_en', { length: 200 }).notNull(),
  nameAr:               varchar('name_ar', { length: 200 }).notNull(),
  tradeLicenceNumber:   varchar('trade_licence_number', { length: 100 }),
  tradeLicenceExpiry:   date('trade_licence_expiry'),
  registrationNumber:   varchar('registration_number', { length: 100 }),
  // MAINLAND | DIFC | ADGM | FREEZONE — drives EOSB/DEWS routing
  entityType:           varchar('entity_type', { length: 20 }).notNull().default('MAINLAND'),
  jurisdiction:         varchar('jurisdiction', { length: 100 }).notNull().default('Dubai'),
  // TRADITIONAL | VSS | DEWS — BR-EOSB-001
  eosbScheme:           varchar('eosb_scheme', { length: 20 }).notNull().default('TRADITIONAL'),
  wpsEmployerCode:      varchar('wps_employer_code', { length: 50 }),
  mohreEstablishmentId: varchar('mohre_establishment_id', { length: 50 }),
  defaultCurrency:      char('default_currency', { length: 3 }).notNull().default('AED'),
  defaultLanguage:      varchar('default_language', { length: 10 }).notNull().default('en'),
  // ── Employee number configuration (Settings → Employee Numbers) ───────────
  // Format: `{empNumberPrefix}{padStart(empNumberDigits, '0')}` e.g. AVN0001
  // empNumberPrefix  — short prefix chosen by SUPER_ADMIN, e.g. AVN, Avaniis, KT
  // empNumberDigits  — how many digits to pad (3-8, default 4 → 0001)
  // empNumberSeed    — SUPER_ADMIN override: next = MAX(seed, currentMax) + 1
  empNumberPrefix:      varchar('emp_number_prefix', { length: 10 }),
  empNumberDigits:      integer('emp_number_digits').notNull().default(4),
  empNumberSeed:        integer('emp_number_seed').notNull().default(0),
  isActive:             boolean('is_active').notNull().default(true),
  // ── Document branding (Settings → Document Branding) ──────────────────
  primaryLogoUrl:        text('primary_logo_url'),
  secondaryLogoUrl:      text('secondary_logo_url'),
  headerImageUrl:        text('header_image_url'),
  footerImageUrl:        text('footer_image_url'),
  signatoryName:         text('signatory_name'),
  signatoryTitle:        text('signatory_title'),
  signatoryTitleAr:      text('signatory_title_ar'),
  signatorySignatureUrl: text('signatory_signature_url'),
  letterEmailFooter:     text('letter_email_footer'),
  airTicketEntitlement:  text('air_ticket_entitlement'),
  letterLogoChoice:      varchar('letter_logo_choice', { length: 10 }).notNull().default('primary'),
  ...audit(),
})

// V003 — Grade bands (salary levels 1–15, configurable per entity)
export const grades = pgTable('grades', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:    uuid('legal_entity_id').references(() => legalEntities.id),
  gradeCode:        varchar('grade_code', { length: 20 }).notNull(),
  gradeNameEn:      varchar('grade_name_en', { length: 100 }).notNull(),
  gradeNameAr:      varchar('grade_name_ar', { length: 100 }),
  gradeLevel:       integer('grade_level').notNull(),
  minSalary:        numeric('min_salary', { precision: 12, scale: 2 }),
  maxSalary:        numeric('max_salary', { precision: 12, scale: 2 }),
  midSalary:        numeric('mid_salary', { precision: 12, scale: 2 }),
  noticePeriodDays: integer('notice_period_days').notNull().default(30), // BR-NP-001
  isActive:         boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:       varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:    uuid('corrects_row_id').references((): AnyPgColumn => grades.id),
  ...audit(),
})

// V004 — Payroll definitions (defined before persons — persons.payroll_id refs this)
export const payrollDefinitions = pgTable('payroll_definitions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollCode:          varchar('payroll_code', { length: 30 }).notNull(),
  payrollNameEn:        varchar('payroll_name_en', { length: 200 }).notNull(),
  payrollNameAr:        varchar('payroll_name_ar', { length: 200 }),
  payFrequency:         varchar('pay_frequency', { length: 20 }).notNull().default('MONTHLY'),
  paymentDayOfMonth:    integer('payment_day_of_month').notNull().default(25),
  currency:             char('currency', { length: 3 }).notNull().default('AED'),
  legislativeDataGroup: varchar('legislative_data_group', { length: 50 }).notNull().default('UAE'),
  oracleLedgerId:       varchar('oracle_ledger_id', { length: 50 }),
  wpsBankCode:          varchar('wps_bank_code', { length: 20 }),
  isActive:             boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 2 — CORE HR: PERSON RECORD
// Defined early (before positions/departments) to resolve circular FK cycles.
// Forward refs (currentPositionId etc.) stored as plain uuid — FK enforced by DB.
// ══════════════════════════════════════════════════════════════════════════════

// V005 — Master person record
export const persons = pgTable('persons', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personNumber: varchar('person_number', { length: 30 }).notNull().unique(), // AVN-000123
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),

  // ── Identity ──────────────────────────────────────────────────────────────
  firstNameEn:  varchar('first_name_en', { length: 100 }).notNull(),
  middleNameEn: varchar('middle_name_en', { length: 100 }),
  lastNameEn:   varchar('last_name_en', { length: 100 }).notNull(),
  // Computed by application before every insert/update (lib/persons.ts)
  fullNameEn:   text('full_name_en'),
  fullNameAr:   varchar('full_name_ar', { length: 300 }).notNull(),
  preferredName: varchar('preferred_name', { length: 100 }),
  salutation:   varchar('salutation', { length: 20 }),
  dateOfBirth:  date('date_of_birth').notNull(),
  // MALE | FEMALE | NOT_SPECIFIED
  gender:       varchar('gender', { length: 20 }).notNull(),
  // SINGLE | MARRIED | DIVORCED | WIDOWED | NOT_SPECIFIED
  maritalStatus:      varchar('marital_status', { length: 30 }),
  numberOfDependents: integer('number_of_dependents').notNull().default(0),

  // ── Nationality ──────────────────────────────────────────────────────────
  nationalityCode:     char('nationality_code', { length: 3 }).notNull(),
  // UAE_NATIONAL | GCC_NATIONAL | EXPAT — drives EOSB vs GPSSA routing
  nationalityCategory: varchar('nationality_category', { length: 20 }).notNull(),
  religion:            varchar('religion', { length: 50 }),
  religionConsentGiven: boolean('religion_consent_given').notNull().default(false),
  // A+ | A- | B+ | B- | AB+ | AB- | O+ | O- — PDPL-sensitive; gate behind sensitiveDataConsent
  bloodType:           varchar('blood_type', { length: 10 }),

  // ── Emirates ID (AES-256-GCM encrypted ciphertext — PDPL compliance) ─────
  emiratesId:       varchar('emirates_id', { length: 500 }),
  emiratesIdExpiry: date('emirates_id_expiry'),
  // P1-H4: deterministic HMAC-SHA256 of the normalised identifier — carries the
  // UNIQUE index (migration 0065) the encrypted column can't. Written only when
  // IDENTITY_UNIQUENESS_ENFORCEMENT=true (post-0065). See lib/identity-hash.ts.
  emiratesIdHash:   varchar('emirates_id_hash', { length: 64 }),

  // ── Passport (AES-256-GCM encrypted ciphertext) ──────────────────────────
  passportNumber:   varchar('passport_number', { length: 500 }),
  passportNumberHash: varchar('passport_number_hash', { length: 64 }),
  passportCountry:  char('passport_country', { length: 3 }),
  passportIssueDate: date('passport_issue_date'),
  passportExpiry:   date('passport_expiry'),

  // ── UAE Residency Visa ───────────────────────────────────────────────────
  visaNumber:    varchar('visa_number', { length: 30 }),
  visaType:      varchar('visa_type', { length: 50 }),
  visaIssueDate: date('visa_issue_date'),
  visaExpiry:    date('visa_expiry'),
  // VALID | EXPIRING | EXPIRED | CANCELLED
  visaStatus:    varchar('visa_status', { length: 30 }),

  // ── Labour Card / Work Permit ────────────────────────────────────────────
  labourCardNumber:        varchar('labour_card_number', { length: 50 }),
  labourCardExpiry:        date('labour_card_expiry'),
  mohreLabourPermitNumber: varchar('mohre_labour_permit_number', { length: 50 }),

  // ── UAE National specific ────────────────────────────────────────────────
  familyBookNumber:        varchar('family_book_number', { length: 50 }),
  nafisRegistrationNumber: varchar('nafis_registration_number', { length: 50 }),

  // ── Employment ──────────────────────────────────────────────────────────
  // FULL_TIME | PART_TIME | TEMPORARY | TASK_BASED | FLEXIBLE | REMOTE | SHARED
  employmentType:         varchar('employment_type', { length: 30 }).notNull(),
  contractedHoursPerWeek: numeric('contracted_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // ACTIVE | ON_LEAVE | SUSPENDED | TERMINATED | RETIRED | DECEASED | PENDING_HIRE
  assignmentStatus:    varchar('assignment_status', { length: 30 }).notNull().default('ACTIVE'),
  hireDate:            date('hire_date').notNull(),
  seniorityDate:       date('seniority_date'),
  originalHireDate:    date('original_hire_date'),
  probationEndDate:    date('probation_end_date'),
  // ACTIVE | CONFIRMED | EXTENDED | FAILED — BR-37
  probationStatus:     varchar('probation_status', { length: 20 }).default('ACTIVE'),
  noticePeriodDays:    integer('notice_period_days').notNull().default(30),
  // FTE | CONTINGENT | CONTRACTOR — worker classification (separate from employmentType work arrangement)
  workerCategory:          varchar('worker_category', { length: 20 }),
  // HR-assigned business code (NOT the auto-generated person_number)
  employeeCode:            varchar('employee_code', { length: 50 }),
  // Stores the approved probation duration in months (survives after probation_end_date passes)
  probationMonthsGranted:  integer('probation_months_granted'),
  separationDate:      date('separation_date'),
  separationReason:    varchar('separation_reason', { length: 100 }),

  // ── Current Assignment (forward refs — positions/departments defined below) ─
  currentPositionId:  uuid('current_position_id'),
  currentJobId:       uuid('current_job_id'),
  currentDepartmentId: uuid('current_department_id'),
  currentLocationId:  uuid('current_location_id'),
  currentGradeId:     uuid('current_grade_id').references(() => grades.id),
  // Self-referential — AnyPgColumn annotation breaks circular type inference
  lineManagerId:       uuid('line_manager_id').references((): AnyPgColumn => persons.id),
  dottedLineManagerId: uuid('dotted_line_manager_id').references((): AnyPgColumn => persons.id),
  hrRepresentativeId:  uuid('hr_representative_id').references((): AnyPgColumn => persons.id),

  // ── Payroll ──────────────────────────────────────────────────────────────
  payrollId:    uuid('payroll_id').references(() => payrollDefinitions.id),
  payFrequency: varchar('pay_frequency', { length: 20 }).notNull().default('MONTHLY'),
  // C1 (approved Option A): salary_elements is the SOURCE OF TRUTH for
  // compensation. This denormalised column is LEGACY / display fallback only and
  // MUST NOT be treated as authoritative comp. Do not remove it now; no sync is
  // built (decision: docs/core-hr/CORE-HR-DECISIONS-B1-C1-C2.md).
  basicSalary:  numeric('basic_salary', { precision: 12, scale: 2 }),
  totalPackage: numeric('total_package', { precision: 12, scale: 2 }),

  // ── Medical Insurance ────────────────────────────────────────────────────
  // insurancePlanId FK to medical_insurance_plans (configuration — Task 4)
  insurancePlanId:       uuid('insurance_plan_id'),
  insuranceCardNumber:   varchar('insurance_card_number', { length: 100 }),
  insuranceMemberId:     varchar('insurance_member_id', { length: 100 }),
  insuranceProviderName: varchar('insurance_provider_name', { length: 200 }),
  insuranceNetwork:      varchar('insurance_network', { length: 100 }),
  // BASIC | ENHANCED | PREMIUM | EXECUTIVE
  insuranceCategory:     varchar('insurance_category', { length: 50 }),
  insuranceEffectiveDate: date('insurance_effective_date'),
  insuranceExpiryDate:   date('insurance_expiry_date'),
  // ENROLLED | PENDING_ENROLMENT | RENEWAL_DUE | EXPIRED | CANCELLED | NOT_ENROLLED
  insuranceStatus:       varchar('insurance_status', { length: 30 }).notNull().default('NOT_ENROLLED'),
  insuranceDocumentId:   uuid('insurance_document_id'),
  annualPremiumAed:      numeric('annual_premium_aed', { precision: 10, scale: 2 }),
  employerPremiumAed:    numeric('employer_premium_aed', { precision: 10, scale: 2 }),
  employeePremiumAed:    numeric('employee_premium_aed', { precision: 10, scale: 2 }),
  dependentCountInsured: integer('dependent_count_insured').notNull().default(0),

  // ── UAE PDPL Consent (GAP-C04 FIX) ──────────────────────────────────────
  // UAE Personal Data Protection Law 2021 — consent recorded at data collection
  // Article 11: employment contract provides legal basis; sensitive data needs explicit consent
  pdplConsentGiven:    boolean('pdpl_consent_given').notNull().default(false),
  pdplConsentDate:     timestamp('pdpl_consent_date', { withTimezone: true }),
  pdplConsentVersion:  varchar('pdpl_consent_version', { length: 20 }),
  // Sensitive data consent (religion, health — optional fields)
  sensitiveDataConsent: boolean('sensitive_data_consent').notNull().default(false),
  sensitiveConsentDate: timestamp('sensitive_data_consent_date', { withTimezone: true }),

  // ── Nursing Break Entitlement (GAP-C09 FIX) ─────────────────────────────
  // BR-ML-004: 2 × 30-min daily breaks for 6 months post-delivery (FDL 33/2021 2024 amendment)
  // Set when maternity leave approved; cleared nightly after end date passes
  nursingBreakEndDate: date('nursing_break_end_date'),

  // ── Preferences ──────────────────────────────────────────────────────────
  preferredLanguage:   varchar('preferred_language', { length: 10 }).notNull().default('en'),
  notificationChannel: varchar('notification_channel', { length: 30 }).notNull().default('PUSH_AND_EMAIL'),

  // ── System ───────────────────────────────────────────────────────────────
  isSystemUser:          boolean('is_system_user').notNull().default(false),
  userAccountId:         uuid('user_account_id'),
  // B1 (approved Option A): RECORD-ACTIVE / soft-delete flag (BR-NO-DELETE) —
  // NOT employment status. Terminated/retired/deceased employees keep
  // isActive=true so they stay queryable for history/audit/EOSB/rehire.
  // Employment state = assignmentStatus + separationDate; login/ESS access for
  // separated workers is blocked via isSeparated() in lib/auth.ts. Do NOT set
  // this false on termination. (docs/core-hr/CORE-HR-DECISIONS-B1-C1-C2.md)
  isActive:              boolean('is_active').notNull().default(true),
  dataQualityScore:      numeric('data_quality_score', { precision: 5, scale: 2 }),
  profileCompletionDate: date('profile_completion_date'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  // Org Chart — Azure Blob SAS URL for employee photo (cloud storage)
  profilePhotoUrl: varchar('profile_photo_url', { length: 500 }),
  // Base64 data URL fallback — populated alongside profilePhotoUrl.
  // Durable in Neon even when cloud storage is not configured (UAT/local).
  // Display priority: profilePhotoUrl || profilePhotoData
  profilePhotoData: text('profile_photo_data'),
  ...audit(),
})

// ── Org structure (defined after persons — head_person_id refs persons) ────

// V006 — Business units
export const businessUnits = pgTable('business_units', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  code:          varchar('code', { length: 30 }).notNull(),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }).notNull(),
  glSegmentCode: varchar('gl_segment_code', { length: 50 }),
  headPersonId:  uuid('head_person_id').references(() => persons.id),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
})

// V007 — Departments (self-referential via parentDepartmentId)
export const departments = pgTable('departments', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  businessUnitId:     uuid('business_unit_id').notNull().references(() => businessUnits.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  code:               varchar('code', { length: 30 }).notNull(),
  nameEn:             varchar('name_en', { length: 200 }).notNull(),
  nameAr:             varchar('name_ar', { length: 200 }).notNull(),
  // Sales | Finance | HR | IT | Legal | Operations | Executive | PRO
  departmentType:     varchar('department_type', { length: 50 }),
  costCentreCode:     varchar('cost_centre_code', { length: 50 }),
  glAccountCode:      varchar('gl_account_code', { length: 50 }),
  approvedHeadcount:  integer('approved_headcount').notNull().default(0),
  headPersonId:       uuid('head_person_id').references(() => persons.id),
  // Department-level default work schedule — inheritance tier between an
  // employee override and the entity/system default. The FK to work_schedules
  // is enforced in SQL (migration 0054); kept as a bare uuid here to avoid a
  // foundation↔configuration circular import. NULLABLE during Expand→Migrate→Contract.
  workScheduleId:     uuid('work_schedule_id'),
  // Self-ref for nested departments
  parentDepartmentId: uuid('parent_department_id').references((): AnyPgColumn => departments.id),
  isActive:           boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:         varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:      uuid('corrects_row_id').references((): AnyPgColumn => departments.id),
  ...audit(),
})

// V008 — Locations (offices, sites)
export const locations = pgTable('locations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  code:          varchar('code', { length: 30 }).notNull(),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }),
  addressLine1:  varchar('address_line1', { length: 300 }),
  addressLine2:  varchar('address_line2', { length: 300 }),
  city:          varchar('city', { length: 100 }),
  emirate:       varchar('emirate', { length: 50 }),
  country:       char('country', { length: 3 }).notNull().default('ARE'),
  poBox:         varchar('po_box', { length: 20 }),
  phone:         varchar('phone', { length: 30 }),
  timezone:      varchar('timezone', { length: 50 }).notNull().default('Asia/Dubai'),
  isActive:      boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:    varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => locations.id),
  ...audit(),
})

// V009 — Jobs (generic role templates — e.g., "Property Consultant")
export const jobs = pgTable('jobs', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:        uuid('legal_entity_id').references(() => legalEntities.id),
  jobCode:              varchar('job_code', { length: 30 }).notNull().unique(),
  jobTitleEn:           varchar('job_title_en', { length: 200 }).notNull(),
  jobTitleAr:           varchar('job_title_ar', { length: 200 }),
  // Technology | Finance | HR | Sales | Operations
  jobFamily:            varchar('job_family', { length: 100 }),
  jobFunction:          varchar('job_function', { length: 100 }),
  minGradeId:           uuid('min_grade_id').references(() => grades.id),
  maxGradeId:           uuid('max_grade_id').references(() => grades.id),
  isEmiratisationTarget: boolean('is_emiratisation_target').notNull().default(false),
  isManagementRole:     boolean('is_management_role').notNull().default(false),
  isExemptFromOvertime: boolean('is_exempt_from_overtime').notNull().default(false),
  jobDescriptionEn:     text('job_description_en'),
  jobDescriptionAr:     text('job_description_ar'),
  isActive:             boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:           varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:        uuid('corrects_row_id').references((): AnyPgColumn => jobs.id),
  ...audit(),
})

// V010 — Positions (specific budgeted slots — "Property Consultant - Sales - G7")
export const positions = pgTable('positions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  departmentId:        uuid('department_id').notNull().references(() => departments.id),
  jobId:               uuid('job_id').notNull().references(() => jobs.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  positionCode:        varchar('position_code', { length: 30 }).notNull(),
  positionTitleEn:     varchar('position_title_en', { length: 200 }).notNull(),
  positionTitleAr:     varchar('position_title_ar', { length: 200 }),
  gradeId:             uuid('grade_id').references(() => grades.id),
  locationId:          uuid('location_id').references(() => locations.id),
  fteCount:            numeric('fte_count', { precision: 4, scale: 2 }).notNull().default('1.00'),
  isOccupied:          boolean('is_occupied').notNull().default(false),
  occupiedByPersonId:  uuid('occupied_by_person_id').references(() => persons.id),
  // Self-ref for position reporting hierarchy
  reportsToPositionId: uuid('reports_to_position_id').references((): AnyPgColumn => positions.id),
  budgetAmount:        numeric('budget_amount', { precision: 14, scale: 2 }),
  isActive:            boolean('is_active').notNull().default(true),
  // Org Chart visibility flags
  isConfidential:      boolean('is_confidential').notNull().default(false),
  // confidential = hidden from EMPLOYEE role, visible to HR+EXECUTIVE
  isFrozen:            boolean('is_frozen').notNull().default(false),
  // frozen = vacant but hiring suspended (budget freeze)
  // Set when is_occupied flips true → false; cleared when position becomes occupied
  vacancyStartDate:    date('vacancy_start_date'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  // Date-effective history infrastructure (Priority C)
  // isCurrent=true means this row is the live definition of the position
  effectiveStartDate:  date('effective_start_date'),
  effectiveEndDate:    date('effective_end_date'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => positions.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 2 (continued) — PERSON DETAIL TABLES
// ══════════════════════════════════════════════════════════════════════════════

export const personContacts = pgTable('person_contacts', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  // MOBILE_PRIMARY | MOBILE_SECONDARY | PERSONAL_EMAIL | WORK_EMAIL | HOME_PHONE | WORK_PHONE | WHATSAPP
  contactType:  varchar('contact_type', { length: 30 }).notNull(),
  contactValue: varchar('contact_value', { length: 200 }).notNull(),
  countryCode:  varchar('country_code', { length: 10 }),
  isPrimary:    boolean('is_primary').notNull().default(false),
  isVerified:   boolean('is_verified').notNull().default(false),
  verifiedDate: date('verified_date'),
  isActive:     boolean('is_active').notNull().default(true),
  ...audit(),
})

export const personAddresses = pgTable('person_addresses', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  // UAE_CURRENT | UAE_PERMANENT | HOME_COUNTRY | MAILING
  addressType:  varchar('address_type', { length: 30 }).notNull(),
  addressLine1: varchar('address_line1', { length: 300 }).notNull(),
  addressLine2: varchar('address_line2', { length: 300 }),
  city:         varchar('city', { length: 100 }).notNull(),
  stateEmirate: varchar('state_emirate', { length: 100 }),
  postalCode:   varchar('postal_code', { length: 20 }),
  country:      char('country', { length: 3 }).notNull(),
  poBox:        varchar('po_box', { length: 20 }),
  isPrimary:    boolean('is_primary').notNull().default(false),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:  date('effective_to'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:   varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => personAddresses.id),
  ...audit(),
})

export const personDocuments = pgTable('person_documents', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:              uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:         uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // Full taxonomy in lib/documents/document-types.ts — do not hardcode here
  documentType:          varchar('document_type', { length: 50 }).notNull(),
  // IDENTITY | EMPLOYMENT | PAYROLL | MEDICAL | EDUCATION | PERSONAL | BANKING | HR_COMPLIANCE | SUPPORTING
  documentCategory:      varchar('document_category', { length: 50 }),
  documentTitle:         varchar('document_title', { length: 200 }).notNull(),
  documentNumber:        varchar('document_number', { length: 100 }),
  issuingAuthority:      varchar('issuing_authority', { length: 200 }),
  issuingCountry:        char('issuing_country', { length: 3 }),
  issueDate:             date('issue_date'),
  expiryDate:            date('expiry_date'),
  isMandatory:           boolean('is_mandatory').notNull().default(false),
  // Default: alert at 90/60/30/14 days before expiry
  alertDaysBeforeExpiry: integer('alert_days_before_expiry').array().notNull().default([90, 60, 30, 14]),
  // Encrypted path in Azure Blob Storage UAE North
  storageKey:            varchar('storage_key', { length: 500 }),
  fileName:              varchar('file_name', { length: 300 }),
  fileSizeBytes:         integer('file_size_bytes'),
  mimeType:              varchar('mime_type', { length: 100 }),
  checksumSha256:        varchar('checksum_sha256', { length: 64 }),
  // VALID | EXPIRING_SOON | EXPIRED | UNDER_RENEWAL | CANCELLED
  documentStatus:        varchar('document_status', { length: 30 }).notNull().default('VALID'),
  // EMPLOYEE (self-upload) | HR (hr team) | PAYROLL (auto-generated) | SYSTEM
  sourceType:            varchar('source_type', { length: 20 }).notNull().default('HR'),
  // True: employee may replace via ESS upload
  employeeCanReplace:    boolean('employee_can_replace').notNull().default(false),
  // True: restricted to HR/Admin view only (warning letters, disciplinary)
  hrOnlyVisibility:      boolean('hr_only_visibility').notNull().default(false),
  // Cumulative download counter
  downloadCount:         integer('download_count').notNull().default(0),
  lastViewedAt:          timestamp('last_viewed_at', { withTimezone: true }),
  lastDownloadedAt:      timestamp('last_downloaded_at', { withTimezone: true }),
  // EMPLOYEE (identity docs: passport, visa, etc.) | LEAVE_REQUEST (medical cert) | OTHER_TX
  scopeType:             varchar('scope_type', { length: 30 }).notNull().default('EMPLOYEE'),
  // For LEAVE_REQUEST scope: the absence_entries.id this cert belongs to
  contextId:             uuid('context_id'),
  verifiedBy:            uuid('verified_by').references(() => persons.id),
  verifiedDate:          date('verified_date'),
  notes:                 text('notes'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:            varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:         uuid('corrects_row_id').references((): AnyPgColumn => personDocuments.id),
  ...audit(),
})

export const personBankDetails = pgTable('person_bank_details', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  bankName:     varchar('bank_name', { length: 200 }).notNull(),
  bankCode:     varchar('bank_code', { length: 20 }).notNull(),
  // AES-256-GCM encrypted ciphertext — AE + 21 digits in cleartext
  iban:         varchar('iban', { length: 500 }).notNull(),
  accountName:  varchar('account_name', { length: 200 }).notNull(),
  accountType:  varchar('account_type', { length: 30 }).notNull().default('CURRENT'),
  currency:     char('currency', { length: 3 }).notNull().default('AED'),
  isPrimary:    boolean('is_primary').notNull().default(true),
  isWpsAccount: boolean('is_wps_account').notNull().default(true),
  verifiedBy:   uuid('verified_by').references(() => persons.id),
  verifiedDate: date('verified_date'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:  date('effective_to'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:   varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => personBankDetails.id),
  ...audit(),
})

export const personDependents = pgTable('person_dependents', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  // 1–9; system-assigned sequential (CONSTRAINT max_9_dependents in migration)
  dependentNumber: integer('dependent_number').notNull(),
  // SPOUSE | CHILD | PARENT | PARENT_IN_LAW | SIBLING | OTHER
  relationship:    varchar('relationship', { length: 30 }).notNull(),
  firstNameEn:     varchar('first_name_en', { length: 100 }).notNull(),
  middleNameEn:    varchar('middle_name_en', { length: 100 }),
  lastNameEn:      varchar('last_name_en', { length: 100 }).notNull(),
  fullNameAr:      varchar('full_name_ar', { length: 300 }).notNull(),
  dateOfBirth:     date('date_of_birth').notNull(),
  gender:          varchar('gender', { length: 20 }).notNull(),
  nationalityCode: char('nationality_code', { length: 3 }).notNull(),
  // Passport (encrypted)
  passportNumber:         varchar('passport_number', { length: 500 }),
  passportCountry:        char('passport_country', { length: 3 }),
  passportIssueDate:      date('passport_issue_date'),
  passportExpiry:         date('passport_expiry'),
  passportDocumentId:     uuid('passport_document_id').references(() => personDocuments.id),
  // Emirates ID (encrypted)
  emiratesId:             varchar('emirates_id', { length: 500 }),
  emiratesIdExpiry:       date('emirates_id_expiry'),
  emiratesIdDocumentId:   uuid('emirates_id_document_id').references(() => personDocuments.id),
  // Visa
  visaNumber:             varchar('visa_number', { length: 30 }),
  // RESIDENCE_VISA | VISIT_VISA | TOURIST_VISA | STUDENT_VISA | NOT_APPLICABLE
  visaType:               varchar('visa_type', { length: 50 }),
  visaIssueDate:          date('visa_issue_date'),
  visaExpiry:             date('visa_expiry'),
  // VALID | EXPIRING | EXPIRED | CANCELLED | PENDING | NOT_APPLICABLE
  visaStatus:             varchar('visa_status', { length: 30 }).notNull().default('NOT_APPLICABLE'),
  visaDocumentId:         uuid('visa_document_id').references(() => personDocuments.id),
  visaSponsoredByCompany: boolean('visa_sponsored_by_company').notNull().default(false),
  visaSponsorPersonId:    uuid('visa_sponsor_person_id').references(() => persons.id),
  // Medical insurance
  isOnCompanyInsurance:   boolean('is_on_company_insurance').notNull().default(false),
  insurancePlanId:        uuid('insurance_plan_id'),
  insuranceCardNumber:    varchar('insurance_card_number', { length: 100 }),
  insuranceMemberId:      varchar('insurance_member_id', { length: 100 }),
  insuranceProviderName:  varchar('insurance_provider_name', { length: 200 }),
  insuranceNetwork:       varchar('insurance_network', { length: 100 }),
  insuranceCategory:      varchar('insurance_category', { length: 50 }),
  insuranceEffectiveDate: date('insurance_effective_date'),
  insuranceExpiryDate:    date('insurance_expiry_date'),
  insuranceStatus:        varchar('insurance_status', { length: 30 }).notNull().default('NOT_ENROLLED'),
  insuranceDocumentId:    uuid('insurance_document_id').references(() => personDocuments.id),
  annualPremiumAed:       numeric('annual_premium_aed', { precision: 10, scale: 2 }),
  employerPremiumAed:     numeric('employer_premium_aed', { precision: 10, scale: 2 }),
  employeePremiumAed:     numeric('employee_premium_aed', { precision: 10, scale: 2 }),
  // Disability — BR-SP-001 (nursing break entitlement)
  hasDisability:            boolean('has_disability').notNull().default(false),
  disabilityType:           varchar('disability_type', { length: 200 }),
  disabilityCertificateId:  uuid('disability_certificate_id').references(() => personDocuments.id),
  // Approval workflow (ESS submit → HR Admin approve)
  approvalStatus:   varchar('approval_status', { length: 30 }).notNull().default('PENDING'),
  approvedBy:       uuid('approved_by').references(() => persons.id),
  approvalDate:     date('approval_date'),
  rejectionReason:  text('rejection_reason'),
  // Effective dating
  effectiveFrom:  date('effective_from').notNull(),
  effectiveTo:    date('effective_to'),
  removalReason:  varchar('removal_reason', { length: 200 }),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:    varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => personDependents.id),
  ...audit(),
})

export const personEmergencyContacts = pgTable('person_emergency_contacts', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  contactNameEn:  varchar('contact_name_en', { length: 200 }).notNull(),
  contactNameAr:  varchar('contact_name_ar', { length: 200 }),
  relationship:   varchar('relationship', { length: 50 }).notNull(),
  phonePrimary:   varchar('phone_primary', { length: 30 }).notNull(),
  phoneSecondary: varchar('phone_secondary', { length: 30 }),
  email:          varchar('email', { length: 200 }),
  address:        text('address'),
  country:        char('country', { length: 3 }),
  priorityOrder:  integer('priority_order').notNull().default(1),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:     varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:  uuid('corrects_row_id').references((): AnyPgColumn => personEmergencyContacts.id),
  ...audit(),
})

export const personEducation = pgTable('person_education', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  institutionName: varchar('institution_name', { length: 300 }).notNull(),
  // Bachelor | Master | PhD | Diploma | Certificate
  degreeType:      varchar('degree_type', { length: 100 }),
  fieldOfStudy:    varchar('field_of_study', { length: 200 }),
  country:         char('country', { length: 3 }),
  startYear:       integer('start_year'),
  graduationYear:  integer('graduation_year'),
  isHighestDegree: boolean('is_highest_degree').notNull().default(false),
  documentId:      uuid('document_id').references(() => personDocuments.id),
  ...audit(),
})

export const personProfessionalCerts = pgTable('person_professional_certs', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  // CPA | CFA | RERA | PMP | CISA | etc.
  certName:           varchar('cert_name', { length: 300 }).notNull(),
  certNumber:         varchar('cert_number', { length: 100 }),
  issuingBody:        varchar('issuing_body', { length: 200 }),
  issueDate:          date('issue_date'),
  expiryDate:         date('expiry_date'),
  isMandatoryForRole: boolean('is_mandatory_for_role').notNull().default(false),
  documentId:         uuid('document_id').references(() => personDocuments.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 3 — EMPLOYMENT TABLES
// ══════════════════════════════════════════════════════════════════════════════

export const contracts = pgTable('contracts', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  contractNumber:      varchar('contract_number', { length: 50 }).notNull().unique(),
  contractType:        varchar('contract_type', { length: 30 }).notNull().default('FIXED_TERM'),
  employmentType:      varchar('employment_type', { length: 30 }).notNull(),
  startDate:           date('start_date').notNull(),
  // Mandatory — UAE Labour Law prohibits unlimited-term contracts
  endDate:             date('end_date').notNull(),
  probationStart:      date('probation_start'),
  // Max 6 months from start — BR-PR-001
  probationEnd:        date('probation_end'),
  // 30 / 60 / 90 days depending on service length — BR-NP-001
  noticePeriodDays:    integer('notice_period_days').notNull(),
  workingHoursPerWeek: numeric('working_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // OFFICE | REMOTE | HYBRID | FIELD
  workLocation:        varchar('work_location', { length: 30 }).notNull().default('OFFICE'),
  signedByEmployee:    boolean('signed_by_employee').notNull().default(false),
  signedDate:          date('signed_date'),
  contractDocumentId:  uuid('contract_document_id').references(() => personDocuments.id),
  renewalCount:        integer('renewal_count').notNull().default(0),
  previousContractId:  uuid('previous_contract_id').references((): AnyPgColumn => contracts.id),
  // DRAFT | ACTIVE | EXPIRED | TERMINATED | RENEWED
  status:              varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  terminationDate:     date('termination_date'),
  terminationReason:   varchar('termination_reason', { length: 200 }),
  notes:               text('notes'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  // History-versioning (Correction Mode infrastructure)
  actionMode:        varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:     uuid('corrects_row_id').references((): AnyPgColumn => contracts.id),
  isCurrent:         boolean('is_current').notNull().default(true),
  effectiveSequence: integer('effective_sequence').notNull().default(1),
  ...audit(),
})

export const workerAssignments = pgTable('worker_assignments', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:               uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:          uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  assignmentNumber:       varchar('assignment_number', { length: 30 }).notNull(),
  effectiveStartDate:     date('effective_start_date').notNull(),
  effectiveEndDate:       date('effective_end_date').default('9999-12-31'),
  // ACTIVE | INACTIVE | ON_LEAVE | SUSPENDED | TERMINATED
  assignmentStatus:       varchar('assignment_status', { length: 30 }).notNull(),
  // Position & role
  positionId:             uuid('position_id').references(() => positions.id),
  jobId:                  uuid('job_id').references(() => jobs.id),
  departmentId:           uuid('department_id').notNull().references(() => departments.id),
  locationId:             uuid('location_id').references(() => locations.id),
  gradeId:                uuid('grade_id').references(() => grades.id),
  businessUnitId:         uuid('business_unit_id').references(() => businessUnits.id),
  // Reporting
  lineManagerId:          uuid('line_manager_id').references(() => persons.id),
  dottedLineManagerId:    uuid('dotted_line_manager_id').references(() => persons.id),
  // Work details
  employmentType:         varchar('employment_type', { length: 30 }).notNull(),
  contractedHoursPerWeek: numeric('contracted_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // workScheduleId FK to work_schedules (configuration.ts — Task 4)
  workScheduleId:         uuid('work_schedule_id'),
  // HIRE | TRANSFER | PROMOTION | DEMOTION | SALARY_REVISION |
  // CONTRACT_EXTEND | SUSPEND | REINSTATE | TERMINATE | RETIRE |
  // SECONDMENT | RETURN_FROM_SECONDMENT
  actionType:             varchar('action_type', { length: 50 }).notNull(),
  actionReason:           varchar('action_reason', { length: 200 }),
  actionInitiatedBy:      uuid('action_initiated_by').notNull().references(() => persons.id),
  actionApprovedBy:       uuid('action_approved_by').references(() => persons.id),
  actionApprovalDate:     date('action_approval_date'),
  // Cost allocation
  primaryCostCentreCode:   varchar('primary_cost_centre_code', { length: 50 }),
  secondaryCostCentreCode: varchar('secondary_cost_centre_code', { length: 50 }),
  costSplitPercentage:     numeric('cost_split_percentage', { precision: 5, scale: 2 }),
  isCurrent:               boolean('is_current').notNull().default(true),
  // Acting assignment support (Org Chart Task A)
  isActing:                boolean('is_acting').notNull().default(false),
  actingEndDate:           date('acting_end_date'),
  // Project assignment (optional — BR-PROJ-001)
  projectId:               uuid('project_id').references(() => projects.id),
  projectAllocationPct:    numeric('project_allocation_pct', { precision: 5, scale: 2 }),
  // BR-INS-007: contractors excluded by default; HR Admin may grant exception
  insuranceExceptionGranted: boolean('insurance_exception_granted').notNull().default(false),
  notes:                   text('notes'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  // UPDATE = new business event (close+open); CORRECTION = in-place fix (no new row);
  // FUTURE_DATED = pre-loaded change, isCurrent=false until effectiveStartDate arrives.
  actionMode:             varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  // Ordering when two changes share the same effectiveStartDate (Oracle-style).
  effectiveSequence:      integer('effective_sequence').notNull().default(1),
  // FK to the row being corrected — populated only when actionMode = CORRECTION.
  correctsRowId:          uuid('corrects_row_id').references((): AnyPgColumn => workerAssignments.id),
  // Links back to the employment_actions or workflow_instances record that triggered this row.
  sourceTransactionId:    uuid('source_transaction_id'),
  ...audit(),
})

export const employmentActions = pgTable('employment_actions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:             uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  assignmentId:         uuid('assignment_id').references(() => workerAssignments.id),
  actionType:           varchar('action_type', { length: 50 }).notNull(),
  actionDate:           date('action_date').notNull(),
  effectiveDate:        date('effective_date').notNull(),
  reasonCode:           varchar('reason_code', { length: 50 }),
  reasonText:           varchar('reason_text', { length: 500 }),
  // Before-state snapshot
  beforeDepartmentId:   uuid('before_department_id'),
  beforePositionId:     uuid('before_position_id'),
  beforeGradeId:        uuid('before_grade_id'),
  beforeLocationId:     uuid('before_location_id'),
  beforeManagerId:      uuid('before_manager_id'),
  beforeBasicSalary:    numeric('before_basic_salary', { precision: 12, scale: 2 }),
  beforeEmploymentType: varchar('before_employment_type', { length: 30 }),
  beforeStatus:         varchar('before_status', { length: 30 }),
  // After-state snapshot
  afterDepartmentId:    uuid('after_department_id'),
  afterPositionId:      uuid('after_position_id'),
  afterGradeId:         uuid('after_grade_id'),
  afterLocationId:      uuid('after_location_id'),
  afterManagerId:       uuid('after_manager_id'),
  afterBasicSalary:     numeric('after_basic_salary', { precision: 12, scale: 2 }),
  afterEmploymentType:  varchar('after_employment_type', { length: 30 }),
  afterStatus:          varchar('after_status', { length: 30 }),
  // Workflow
  workflowInstanceId: uuid('workflow_instance_id'),
  initiatedBy:        uuid('initiated_by').notNull().references(() => persons.id),
  approvedBy:         uuid('approved_by').references(() => persons.id),
  approvalDate:       date('approval_date'),
  approvalNotes:      text('approval_notes'),
  rejectionReason:    text('rejection_reason'),
  // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED
  status: varchar('status', { length: 30 }).notNull().default('APPROVED'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4 — ABSENCE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

export const absencePlans = pgTable('absence_plans', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:            uuid('legal_entity_id').references(() => legalEntities.id),
  planCode:                 varchar('plan_code', { length: 50 }).notNull(),
  planNameEn:               varchar('plan_name_en', { length: 200 }).notNull(),
  planNameAr:               varchar('plan_name_ar', { length: 200 }),
  // CALENDAR_YEAR | ANNIVERSARY_YEAR | HIRE_DATE | NONE
  accrualMethod:            varchar('accrual_method', { length: 30 }).notNull(),
  carryForwardMaxDays:      numeric('carry_forward_max_days', { precision: 6, scale: 2 }).notNull().default('0'),
  carryForwardExpiryMonths: integer('carry_forward_expiry_months').notNull().default(0),
  allowNegativeBalance:     boolean('allow_negative_balance').notNull().default(false),
  accrualCeilingDays:       numeric('accrual_ceiling_days', { precision: 6, scale: 2 }),
  isActive:                 boolean('is_active').notNull().default(true),
  ...audit(),
})

export const absenceTypes = pgTable('absence_types', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:          uuid('legal_entity_id').references(() => legalEntities.id),
  absencePlanId:          uuid('absence_plan_id').references(() => absencePlans.id),
  typeCode:               varchar('type_code', { length: 30 }).notNull(),
  typeNameEn:             varchar('type_name_en', { length: 200 }).notNull(),
  typeNameAr:             varchar('type_name_ar', { length: 200 }),
  isStatutory:            boolean('is_statutory').notNull().default(true),
  // FULL_PAY | HALF_PAY | NO_PAY | TIERED
  isPaid:                 varchar('is_paid', { length: 20 }).notNull(),
  requiresMedicalCert:    boolean('requires_medical_cert').notNull().default(false),
  certRequiredAfterDays:  integer('cert_required_after_days').default(1),
  // MALE | FEMALE — maternity/paternity restrictions
  genderRestriction:      varchar('gender_restriction', { length: 10 }),
  religionRestriction:    varchar('religion_restriction', { length: 30 }),
  maxDaysPerYear:         numeric('max_days_per_year', { precision: 6, scale: 2 }),
  maxConsecutiveDays:     numeric('max_consecutive_days', { precision: 6, scale: 2 }),
  minServiceMonths:       integer('min_service_months').notNull().default(0),
  minNoticeDays:          integer('min_notice_days').notNull().default(0),
  payrollElementCode:     varchar('payroll_element_code', { length: 50 }),
  approvalRequired:       boolean('approval_required').notNull().default(true),
  // Balance-control gate (BR-LV-BAL-001). TRUE = this type draws down an
  // initialized leave balance; submission is BLOCKED when no absence_balances
  // row exists for the request year (fail-closed). FALSE = no balance control
  // (e.g. unpaid leave) — submission allowed, balance shown as not applicable.
  requiresBalance:        boolean('requires_balance').notNull().default(true),
  // Hajj leave — once per employment
  isOneTimePerEmployment: boolean('is_one_time_per_employment').notNull().default(false),
  isActive:               boolean('is_active').notNull().default(true),
  ...audit(),
})

export const absenceEntries = pgTable('absence_entries', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:   uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  absenceTypeId:   uuid('absence_type_id').notNull().references(() => absenceTypes.id),
  requestNumber:   varchar('request_number', { length: 30 }).notNull().unique(),
  startDate:       date('start_date').notNull(),
  endDate:         date('end_date').notNull(),
  durationDays:    numeric('duration_days', { precision: 6, scale: 2 }).notNull(),
  durationHours:   numeric('duration_hours', { precision: 6, scale: 2 }),
  isHalfDay:       boolean('is_half_day').notNull().default(false),
  // AM | PM
  halfDayPeriod:   varchar('half_day_period', { length: 10 }),
  returnDate:      date('return_date'),
  // PENDING | APPROVED | REJECTED | CANCELLED | TAKEN | RECALLED
  status:          varchar('status', { length: 30 }).notNull().default('PENDING'),
  // PORTAL | MOBILE | ARIA_TEXT | ARIA_VOICE | HR_ADMIN
  submittedVia:    varchar('submitted_via', { length: 20 }).notNull().default('PORTAL'),
  submittedBy:     uuid('submitted_by').notNull().references(() => persons.id),
  approvedBy:      uuid('approved_by').references(() => persons.id),
  approvalDate:    timestamp('approval_date', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  workflowInstanceId: uuid('workflow_instance_id'),
  // ARIA recommendation card
  ariaRecommendation:     varchar('aria_recommendation', { length: 20 }),
  ariaConfidenceScore:    numeric('aria_confidence_score', { precision: 5, scale: 4 }),
  ariaRecommendationJson: jsonb('aria_recommendation_json'),
  // Payroll linkage
  payrollElementCode:  varchar('payroll_element_code', { length: 50 }),
  payrollRunId:        uuid('payroll_run_id'),
  payDeductionAmount:  numeric('pay_deduction_amount', { precision: 12, scale: 2 }),
  // Medical certificate
  medicalCertRequired:   boolean('medical_cert_required').notNull().default(false),
  medicalCertUploaded:   boolean('medical_cert_uploaded').notNull().default(false),
  medicalCertDocumentId: uuid('medical_cert_document_id').references(() => personDocuments.id),
  medicalCertDeadline:   date('medical_cert_deadline'),
  // Balance snapshot at request time
  balanceBeforeDays: numeric('balance_before_days', { precision: 6, scale: 2 }),
  balanceAfterDays:  numeric('balance_after_days', { precision: 6, scale: 2 }),
  notes:             text('notes'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  ...audit(),
})

export const absenceBalances = pgTable('absence_balances', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  absenceTypeId:      uuid('absence_type_id').notNull().references(() => absenceTypes.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  balanceYear:        integer('balance_year').notNull(),
  openingBalanceDays: numeric('opening_balance_days', { precision: 6, scale: 2 }).notNull().default('0'),
  accruedDays:        numeric('accrued_days', { precision: 6, scale: 2 }).notNull().default('0'),
  takenDays:          numeric('taken_days', { precision: 6, scale: 2 }).notNull().default('0'),
  pendingDays:        numeric('pending_days', { precision: 6, scale: 2 }).notNull().default('0'),
  adjustedDays:       numeric('adjusted_days', { precision: 6, scale: 2 }).notNull().default('0'),
  carriedForwardDays: numeric('carried_forward_days', { precision: 6, scale: 2 }).notNull().default('0'),
  forfeitedDays:      numeric('forfeited_days', { precision: 6, scale: 2 }).notNull().default('0'),
  // GENERATED ALWAYS AS stored column
  // Computed by application: opening + accrued + carriedForward + adjusted - taken - pending - forfeited
  closingBalanceDays: numeric('closing_balance_days', { precision: 6, scale: 2 }),
  lastAccrualDate: date('last_accrual_date'),
  nextAccrualDate: date('next_accrual_date'),
  ...audit(),
})

// GAP-C07: Disability / Parental Accommodation Requests (UAE FDL 33/2021 Art 30)
export const accommodationRequests = pgTable('accommodation_requests', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // DISABILITY | PARENTAL | NURSING_BREAK
  requestType:  varchar('request_type', { length: 30 }).notNull(),
  descriptionEn: text('description_en').notNull(),
  descriptionAr: text('description_ar').notNull(),
  requestedAdjustments: text('requested_adjustments'),
  effectiveDate: date('effective_date').notNull(),
  endDate:       date('end_date'),
  // PENDING | APPROVED | REJECTED | CANCELLED
  status:        varchar('status', { length: 20 }).notNull().default('PENDING'),
  workflowInstanceId: uuid('workflow_instance_id'),
  supportingDocumentId: uuid('supporting_document_id').references(() => personDocuments.id),
  resolutionNotes: text('resolution_notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4B — ENROLLMENT & ASSIGNMENT HISTORY (Priority D)
// Date-effective tracking: close current row + open new row on each change.
// Pattern mirrors worker_assignments (effectiveStartDate/End, isCurrent, actionMode).
// ══════════════════════════════════════════════════════════════════════════════

export const leavePlanEnrolments = pgTable('leave_plan_enrolments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  absencePlanId:       uuid('absence_plan_id').notNull().references(() => absencePlans.id),
  enrollmentReason:    varchar('enrollment_reason', { length: 200 }),
  effectiveStartDate:  date('effective_start_date').notNull(),
  effectiveEndDate:    date('effective_end_date').default('9999-12-31'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:   integer('effective_sequence').notNull().default(1),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => leavePlanEnrolments.id),
  sourceTransactionId: uuid('source_transaction_id'),
  enrolledBy:          uuid('enrolled_by').references(() => persons.id),
  notes:               text('notes'),
  ...audit(),
})

export const workScheduleAssignments = pgTable('work_schedule_assignments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // FK to configuration.work_schedules — enforced by migration, not Drizzle (cross-file)
  workScheduleId:      uuid('work_schedule_id').notNull(),
  assignmentReason:    varchar('assignment_reason', { length: 200 }),
  effectiveStartDate:  date('effective_start_date').notNull(),
  effectiveEndDate:    date('effective_end_date').default('9999-12-31'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:   integer('effective_sequence').notNull().default(1),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => workScheduleAssignments.id),
  sourceTransactionId: uuid('source_transaction_id'),
  assignedBy:          uuid('assigned_by').references(() => persons.id),
  notes:               text('notes'),
  ...audit(),
})

export const payrollAssignments = pgTable('payroll_assignments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollId:           uuid('payroll_id').notNull().references(() => payrollDefinitions.id),
  // STANDARD | EXECUTIVE | HOURLY | DAILY — sub-group within a payroll run
  payrollGroup:        varchar('payroll_group', { length: 50 }).notNull().default('STANDARD'),
  changeReason:        varchar('change_reason', { length: 200 }),
  effectiveStartDate:  date('effective_start_date').notNull(),
  effectiveEndDate:    date('effective_end_date').default('9999-12-31'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:   integer('effective_sequence').notNull().default(1),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => payrollAssignments.id),
  sourceTransactionId: uuid('source_transaction_id'),
  changedBy:           uuid('changed_by').references(() => persons.id),
  notes:               text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4C — MDM HISTORY TABLES (Phase 3)
//
// Append-only snapshot tables — written once per attribute change.
// FKs remain on the main tables (grades, departments, etc.); history rows
// answer "what did this object look like on date X?".
// validTo = NULL means the snapshot is still current.
// ══════════════════════════════════════════════════════════════════════════════

export const gradeHistory = pgTable('grade_history', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  gradeId:          uuid('grade_id').notNull().references(() => grades.id),
  // Snapshot of grade attributes at this point in time
  gradeCode:        varchar('grade_code', { length: 20 }).notNull(),
  gradeNameEn:      varchar('grade_name_en', { length: 100 }).notNull(),
  gradeNameAr:      varchar('grade_name_ar', { length: 100 }),
  gradeLevel:       integer('grade_level'),
  minSalary:        numeric('min_salary', { precision: 12, scale: 2 }),
  maxSalary:        numeric('max_salary', { precision: 12, scale: 2 }),
  midSalary:        numeric('mid_salary', { precision: 12, scale: 2 }),
  noticePeriodDays: integer('notice_period_days'),
  // Validity window
  validFrom:        date('valid_from').notNull(),
  validTo:          date('valid_to').default('9999-12-31'), // 9999-12-31 = still current
  isCurrent:        boolean('is_current').notNull().default(true),
  changeReason:     varchar('change_reason', { length: 300 }),
  changedBy:        uuid('changed_by').references(() => persons.id),
  changedAt:        timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const departmentHistory = pgTable('department_history', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  departmentId:       uuid('department_id').notNull().references(() => departments.id),
  // Snapshot
  code:               varchar('code', { length: 20 }).notNull(),
  nameEn:             varchar('name_en', { length: 150 }).notNull(),
  nameAr:             varchar('name_ar', { length: 150 }),
  departmentType:     varchar('department_type', { length: 50 }),
  approvedHeadcount:  integer('approved_headcount'),
  costCentreCode:     varchar('cost_centre_code', { length: 30 }),
  glAccountCode:      varchar('gl_account_code', { length: 30 }),
  parentDepartmentId: uuid('parent_department_id'),
  // Validity window
  validFrom:          date('valid_from').notNull(),
  validTo:            date('valid_to').default('9999-12-31'),
  isCurrent:          boolean('is_current').notNull().default(true),
  changeReason:       varchar('change_reason', { length: 300 }),
  changedBy:          uuid('changed_by').references(() => persons.id),
  changedAt:          timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const locationHistory = pgTable('location_history', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  locationId:   uuid('location_id').notNull().references(() => locations.id),
  // Snapshot
  code:         varchar('code', { length: 20 }).notNull(),
  nameEn:       varchar('name_en', { length: 150 }).notNull(),
  nameAr:       varchar('name_ar', { length: 150 }),
  addressLine1: varchar('address_line1', { length: 200 }),
  city:         varchar('city', { length: 100 }),
  emirate:      varchar('emirate', { length: 100 }),
  country:      varchar('country', { length: 3 }),
  timezone:     varchar('timezone', { length: 60 }),
  // Validity window
  validFrom:    date('valid_from').notNull(),
  validTo:      date('valid_to').default('9999-12-31'),
  isCurrent:    boolean('is_current').notNull().default(true),
  changeReason: varchar('change_reason', { length: 300 }),
  changedBy:    uuid('changed_by').references(() => persons.id),
  changedAt:    timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const jobHistory = pgTable('job_history', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  jobId:                 uuid('job_id').notNull().references(() => jobs.id),
  // Snapshot
  jobCode:               varchar('job_code', { length: 30 }).notNull(),
  jobTitleEn:            varchar('job_title_en', { length: 200 }).notNull(),
  jobTitleAr:            varchar('job_title_ar', { length: 200 }),
  jobFamily:             varchar('job_family', { length: 100 }),
  jobFunction:           varchar('job_function', { length: 100 }),
  isEmiratisationTarget: boolean('is_emiratisation_target'),
  isManagementRole:      boolean('is_management_role'),
  minGradeId:            uuid('min_grade_id'),
  maxGradeId:            uuid('max_grade_id'),
  // Validity window
  validFrom:             date('valid_from').notNull(),
  validTo:               date('valid_to').default('9999-12-31'),
  isCurrent:             boolean('is_current').notNull().default(true),
  changeReason:          varchar('change_reason', { length: 300 }),
  changedBy:             uuid('changed_by').references(() => persons.id),
  changedAt:             timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const positionHistory = pgTable('position_history', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  positionId:       uuid('position_id').notNull().references(() => positions.id),
  // Snapshot
  positionCode:     varchar('position_code', { length: 30 }).notNull(),
  positionTitleEn:  varchar('position_title_en', { length: 200 }).notNull(),
  positionTitleAr:  varchar('position_title_ar', { length: 200 }),
  departmentId:     uuid('department_id'),
  jobId:            uuid('job_id'),
  gradeId:          uuid('grade_id'),
  locationId:       uuid('location_id'),
  fteCount:         numeric('fte_count', { precision: 5, scale: 2 }),
  reportsToPositionId: uuid('reports_to_position_id'),
  budgetAmount:     numeric('budget_amount', { precision: 14, scale: 2 }),
  // Validity window
  validFrom:        date('valid_from').notNull(),
  validTo:          date('valid_to').default('9999-12-31'),
  isCurrent:        boolean('is_current').notNull().default(true),
  changeReason:     varchar('change_reason', { length: 300 }),
  changedBy:        uuid('changed_by').references(() => persons.id),
  changedAt:        timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4b — PROJECT MDM
// ══════════════════════════════════════════════════════════════════════════════

// V-PROJ — Projects master data (BR-PROJ-001: code unique per legal entity)
export const projects = pgTable('projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  code:          varchar('code', { length: 30 }).notNull(),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }),
  // INTERNAL | EXTERNAL | CAPITAL | MAINTENANCE | RESEARCH | OTHER
  projectType:   varchar('project_type', { length: 50 }),
  glMappingCode: varchar('gl_mapping_code', { length: 50 }),
  description:   text('description'),
  startDate:     date('start_date'),
  endDate:       date('end_date'),
  isActive:      boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure)
  actionMode:    varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => projects.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 5 — PAYROLL TABLES
// ══════════════════════════════════════════════════════════════════════════════

export const salaryElements = pgTable('salary_elements', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:              uuid('person_id').notNull().references(() => persons.id),
  assignmentId:          uuid('assignment_id').notNull().references(() => workerAssignments.id),
  legalEntityId:         uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollId:             uuid('payroll_id').notNull().references(() => payrollDefinitions.id),
  elementCode:           varchar('element_code', { length: 50 }).notNull(),
  elementNameEn:         varchar('element_name_en', { length: 200 }).notNull(),
  elementNameAr:         varchar('element_name_ar', { length: 200 }),
  // EARNINGS | DEDUCTION | EMPLOYER_COST | EMPLOYER_LIABILITY | INFO
  elementClassification: varchar('element_classification', { length: 30 }).notNull(),
  amount:                numeric('amount', { precision: 14, scale: 2 }),
  percentageBasis:       varchar('percentage_basis', { length: 30 }),
  percentageValue:       numeric('percentage_value', { precision: 6, scale: 4 }),
  currency:              char('currency', { length: 3 }).notNull().default('AED'),
  isRecurring:           boolean('is_recurring').notNull().default(true),
  effectiveStartDate:    date('effective_start_date').notNull(),
  effectiveEndDate:      date('effective_end_date').default('9999-12-31'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:            varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:     integer('effective_sequence').notNull().default(1),
  correctsRowId:         uuid('corrects_row_id').references((): AnyPgColumn => salaryElements.id),
  processingOrder:       integer('processing_order').notNull().default(100),
  // Only basic salary is subject to EOSB — BR-EOSB-001
  isSubjectToEosb:       boolean('is_subject_to_eosb').notNull().default(false),
  isSubjectToGpssa:      boolean('is_subject_to_gpssa').notNull().default(false),
  isWpsReportable:       boolean('is_wps_reportable').notNull().default(true),
  glAccountCode:         varchar('gl_account_code', { length: 50 }),
  oracleElementId:       varchar('oracle_element_id', { length: 50 }),
  notes:                 text('notes'),
  ...audit(),
})

export const payrollRuns = pgTable('payroll_runs', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollId:               uuid('payroll_id').notNull().references(() => payrollDefinitions.id),
  legalEntityId:           uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // P2-P4 — run numbers are a PER-ENTITY sequence (nextRunNumber computes MAX
  // scoped to legal_entity_id). The uniqueness MUST therefore be composite, not
  // global: a global UNIQUE(run_number) made entity A and entity B collide on
  // PR-000001. See migration 0055 and the uniqueIndex below.
  runNumber:               varchar('run_number', { length: 30 }).notNull(),
  payPeriodStart:          date('pay_period_start').notNull(),
  payPeriodEnd:            date('pay_period_end').notNull(),
  paymentDate:             date('payment_date').notNull(),
  // REGULAR | OFF_CYCLE | CORRECTION | FINAL_SETTLEMENT
  runType:                 varchar('run_type', { length: 20 }).notNull().default('REGULAR'),
  // DRAFT | PRE_CHECKS_PASSED | CALCULATED | UNDER_REVIEW | LOCKED |
  // SIF_GENERATED | SUBMITTED_TO_BANK | CONFIRMED | ARCHIVED
  status:                  varchar('status', { length: 30 }).notNull().default('DRAFT'),
  // Totals (populated after calculation)
  employeeCount:           integer('employee_count'),
  totalGrossPay:           numeric('total_gross_pay', { precision: 14, scale: 2 }),
  totalDeductions:         numeric('total_deductions', { precision: 14, scale: 2 }),
  totalNetPay:             numeric('total_net_pay', { precision: 14, scale: 2 }),
  totalEmployerCost:       numeric('total_employer_cost', { precision: 14, scale: 2 }),
  totalEosbProvision:      numeric('total_eosb_provision', { precision: 14, scale: 2 }),
  totalGpssaEmployer:      numeric('total_gpssa_employer', { precision: 14, scale: 2 }),
  // WPS (BR-WPS-001 through BR-WPS-005)
  sifFileReference:        varchar('sif_file_reference', { length: 300 }),
  sifGeneratedAt:          timestamp('sif_generated_at', { withTimezone: true }),
  wpsSubmissionDate:       timestamp('wps_submission_date', { withTimezone: true }),
  wpsConfirmationRef:      varchar('wps_confirmation_ref', { length: 100 }),
  wpsConfirmationDate:     timestamp('wps_confirmation_date', { withTimezone: true }),
  wpsDeadline:             date('wps_deadline'),
  // Oracle GL integration
  glJournalReference:      varchar('gl_journal_reference', { length: 100 }),
  glPostedDate:            timestamp('gl_posted_date', { withTimezone: true }),
  glPostedBy:              uuid('gl_posted_by'),
  // Locking
  lockedAt:                timestamp('locked_at', { withTimezone: true }),
  lockedBy:                uuid('locked_by'),
  lockReason:              text('lock_reason'),
  // Finance approval
  financeApprovedBy:       uuid('finance_approved_by').references(() => persons.id),
  financeApprovalDate:     timestamp('finance_approval_date', { withTimezone: true }),
  notes:                   text('notes'),
  ...audit(),
}, (t) => ({
  // P2-P4 — per-entity run-number uniqueness (replaces the global UNIQUE).
  runNumberPerEntity: uniqueIndex('uq_payroll_run_number_per_entity')
    .on(t.tenantId, t.legalEntityId, t.runNumber),
}))

export const payrollResults = pgTable('payroll_results', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollRunId:          uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  personId:              uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:         uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  assignmentId:          uuid('assignment_id').references(() => workerAssignments.id),
  // Earnings
  basicSalary:           numeric('basic_salary', { precision: 12, scale: 2 }).notNull().default('0'),
  housingAllowance:      numeric('housing_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  transportAllowance:    numeric('transport_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  otherAllowances:       numeric('other_allowances', { precision: 12, scale: 2 }).notNull().default('0'),
  overtimePay:           numeric('overtime_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  bonus:                 numeric('bonus', { precision: 12, scale: 2 }).notNull().default('0'),
  commission:            numeric('commission', { precision: 12, scale: 2 }).notNull().default('0'),
  retroPay:              numeric('retro_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  totalGrossPay:         numeric('total_gross_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  // Deductions
  sickLeaveDeduction:     numeric('sick_leave_deduction', { precision: 12, scale: 2 }).notNull().default('0'),
  unpaidLeaveDeduction:   numeric('unpaid_leave_deduction', { precision: 12, scale: 2 }).notNull().default('0'),
  salaryAdvanceDeduct:    numeric('salary_advance_deduct', { precision: 12, scale: 2 }).notNull().default('0'),
  gpssaEmployeeDeduct:    numeric('gpssa_employee_deduct', { precision: 12, scale: 2 }).notNull().default('0'),
  medicalInsuranceDeduct: numeric('medical_insurance_deduct', { precision: 12, scale: 2 }).notNull().default('0'),
  otherDeductions:        numeric('other_deductions', { precision: 12, scale: 2 }).notNull().default('0'),
  totalDeductions:        numeric('total_deductions', { precision: 12, scale: 2 }).notNull().default('0'),
  netPay:                 numeric('net_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  // Employer costs
  gpssaEmployerContrib:  numeric('gpssa_employer_contrib', { precision: 12, scale: 2 }).notNull().default('0'),
  eosbProvision:         numeric('eosb_provision', { precision: 12, scale: 2 }).notNull().default('0'),
  medicalInsuranceEr:    numeric('medical_insurance_er', { precision: 12, scale: 2 }).notNull().default('0'),
  totalEmployerCost:     numeric('total_employer_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  // WPS payment
  iban:             varchar('iban', { length: 23 }),
  bankCode:         varchar('bank_code', { length: 20 }),
  // PENDING | INCLUDED_IN_SIF | PAID | FAILED | ON_HOLD
  paymentStatus:    varchar('payment_status', { length: 30 }).notNull().default('PENDING'),
  paymentReference: varchar('payment_reference', { length: 100 }),
  // Variance monitoring
  priorMonthNetPay:  numeric('prior_month_net_pay', { precision: 12, scale: 2 }),
  variancePct:       numeric('variance_pct', { precision: 8, scale: 4 }),
  isVarianceFlagged: boolean('is_variance_flagged').notNull().default(false),
  varianceReason:    text('variance_reason'),
  // YTD accumulators
  ytdGrossPay:      numeric('ytd_gross_pay', { precision: 14, scale: 2 }).notNull().default('0'),
  ytdNetPay:        numeric('ytd_net_pay', { precision: 14, scale: 2 }).notNull().default('0'),
  ytdEosbProvision: numeric('ytd_eosb_provision', { precision: 14, scale: 2 }).notNull().default('0'),
  ytdGpssa:         numeric('ytd_gpssa', { precision: 14, scale: 2 }).notNull().default('0'),
  ...audit(),
})

export const eosbCalculations = pgTable('eosb_calculations', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:             uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // MONTHLY_PROVISION | ON_DEMAND_ESTIMATE | FINAL_SETTLEMENT
  calculationType:      varchar('calculation_type', { length: 30 }).notNull(),
  calculationDate:      date('calculation_date').notNull(),
  // Inputs
  hireDate:             date('hire_date').notNull(),
  terminationDate:      date('termination_date'),
  basicSalaryAtCalc:    numeric('basic_salary_at_calc', { precision: 12, scale: 2 }).notNull(),
  totalUnpaidLeaveDays: integer('total_unpaid_leave_days').notNull().default(0),
  // Service calculation
  totalCalendarDays:    integer('total_calendar_days').notNull(),
  netServiceDays:       integer('net_service_days').notNull(),
  serviceYears:         numeric('service_years', { precision: 8, scale: 4 }).notNull(),
  // Calculation breakdown — BR-EOSB-001 through BR-EOSB-007
  dailyRate:            numeric('daily_rate', { precision: 12, scale: 4 }).notNull(),
  daysRateYears1To5:    integer('days_rate_years_1_to_5').notNull().default(21),
  daysRateYearsBeyond5: integer('days_rate_years_beyond_5').notNull().default(30),
  eosbFirst5Years:      numeric('eosb_first_5_years', { precision: 14, scale: 2 }).notNull().default('0'),
  eosbBeyond5Years:     numeric('eosb_beyond_5_years', { precision: 14, scale: 2 }).notNull().default('0'),
  eosbBeforeCap:        numeric('eosb_before_cap', { precision: 14, scale: 2 }).notNull(),
  // Cap = 24 months basic salary
  capAmount:            numeric('cap_amount', { precision: 14, scale: 2 }),
  isCapped:             boolean('is_capped').notNull().default(false),
  eosbFinalAmount:      numeric('eosb_final_amount', { precision: 14, scale: 2 }).notNull(),
  partTimeRatio:        numeric('part_time_ratio', { precision: 6, scale: 4 }).notNull().default('1.0000'),
  eosbAfterRatio:       numeric('eosb_after_ratio', { precision: 14, scale: 2 }).notNull(),
  // Linked records
  payrollRunId:            uuid('payroll_run_id').references(() => payrollRuns.id),
  employmentActionId:      uuid('employment_action_id').references(() => employmentActions.id),
  // Full step-by-step calculation JSON for auditability
  calculationFormulaJson:  jsonb('calculation_formula_json'),
  triggeredByUser:         uuid('triggered_by_user').references(() => persons.id),
  notes:                   text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 6 — CROSS-MODULE: IMMUTABLE AUDIT LOG
// INSERT-ONLY — no UPDATE or DELETE ever (enforced at application layer)
// ══════════════════════════════════════════════════════════════════════════════

export const auditLog = pgTable('audit_log', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  eventTime: timestamp('event_time', { withTimezone: true }).defaultNow().notNull(),
  // Who
  actorId:       uuid('actor_id').notNull(),
  actorName:     varchar('actor_name', { length: 200 }).notNull(),
  actorRole:     varchar('actor_role', { length: 50 }).notNull(),
  actorEntityId: uuid('actor_entity_id'),
  // How
  // WEB | MOBILE | ARIA_TEXT | ARIA_VOICE | API | SYSTEM | BATCH
  channel:    varchar('channel', { length: 30 }).notNull(),
  ipAddress:  text('ip_address'),
  deviceInfo: varchar('device_info', { length: 300 }),
  sessionId:  uuid('session_id'),
  // What — e.g., EMPLOYEE.SALARY.VIEW | LEAVE.REQUEST.APPROVE
  eventType:    varchar('event_type', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId:   uuid('resource_id'),
  entityId:     uuid('entity_id'),
  // Change delta
  oldValues:     jsonb('old_values'),
  newValues:     jsonb('new_values'),
  changedFields: text('changed_fields').array(),
  // Context
  metadata:    jsonb('metadata'),
  description: text('description'),
  // audit_log intentionally has NO audit() spread — it is its own audit record
})

// ══════════════════════════════════════════════════════════════════════════════
// INFERRED TYPESCRIPT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type LegalEntity         = typeof legalEntities.$inferSelect
export type Grade               = typeof grades.$inferSelect
export type PayrollDefinition   = typeof payrollDefinitions.$inferSelect
export type Person              = typeof persons.$inferSelect
export type BusinessUnit        = typeof businessUnits.$inferSelect
export type Department          = typeof departments.$inferSelect
export type Location            = typeof locations.$inferSelect
export type Job                 = typeof jobs.$inferSelect
export type Position            = typeof positions.$inferSelect
export type PersonContact       = typeof personContacts.$inferSelect
export type PersonAddress       = typeof personAddresses.$inferSelect
export type PersonDocument      = typeof personDocuments.$inferSelect
export type PersonBankDetail    = typeof personBankDetails.$inferSelect
export type PersonDependent     = typeof personDependents.$inferSelect
export type PersonEmergency     = typeof personEmergencyContacts.$inferSelect
export type PersonEducation     = typeof personEducation.$inferSelect
export type PersonCert          = typeof personProfessionalCerts.$inferSelect
export type Contract            = typeof contracts.$inferSelect
export type WorkerAssignment    = typeof workerAssignments.$inferSelect
export type EmploymentAction    = typeof employmentActions.$inferSelect
export type AbsencePlan              = typeof absencePlans.$inferSelect
export type AbsenceType              = typeof absenceTypes.$inferSelect
export type AbsenceEntry             = typeof absenceEntries.$inferSelect
export type AbsenceBalance           = typeof absenceBalances.$inferSelect
export type LeavePlanEnrolment       = typeof leavePlanEnrolments.$inferSelect
export type WorkScheduleAssignment   = typeof workScheduleAssignments.$inferSelect
export type PayrollAssignment        = typeof payrollAssignments.$inferSelect
export type GradeHistory             = typeof gradeHistory.$inferSelect
export type DepartmentHistory        = typeof departmentHistory.$inferSelect
export type LocationHistory          = typeof locationHistory.$inferSelect
export type JobHistory               = typeof jobHistory.$inferSelect
export type PositionHistory          = typeof positionHistory.$inferSelect
export type SalaryElement       = typeof salaryElements.$inferSelect
export type PayrollRun          = typeof payrollRuns.$inferSelect
export type PayrollResult       = typeof payrollResults.$inferSelect
export type EosbCalculation     = typeof eosbCalculations.$inferSelect
export type AuditLogEntry       = typeof auditLog.$inferSelect
export type LookupValue         = typeof lookupValues.$inferSelect
export type Project             = typeof projects.$inferSelect

export type NewLegalEntity      = typeof legalEntities.$inferInsert
export type NewPerson           = typeof persons.$inferInsert
export type NewWorkerAssignment = typeof workerAssignments.$inferInsert
export type NewAbsenceEntry     = typeof absenceEntries.$inferInsert
export type NewEosbCalculation  = typeof eosbCalculations.$inferInsert
export type NewAuditLogEntry    = typeof auditLog.$inferInsert
export type NewProject          = typeof projects.$inferInsert
