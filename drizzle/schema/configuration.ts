/**
 * AVANIIS HR — Configuration Schema
 * Configurable tables managed by HR Admins via the Config module.
 *
 * Updated: April 2026 — aligned to ERD_PHASE1_DATA_MODEL.md v3
 *   • work_schedules      — added per-day time cols + Ramadan cols (ERD 7.1)
 *   • public_holidays     — aligned column names + added missing cols (ERD 7.10)
 *   • compliance_rules    — aligned to ERD 10.1 structure
 *   • grade_salary_ranges — added housing/transport allowance cols (ERD 10.6)
 *   • medical_insurance_plans — added full ERD 9.1 columns
 *
 * BR-AUDIT-001: All tables carry 7 audit columns.
 * BR-TENANT-001: All tables carry tenant_id.
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
} from 'drizzle-orm/pg-core'
import { legalEntities, grades, absenceTypes } from './foundation'
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
// 1 — DYNAMIC SCHEMA BUILDER
// Replaces the old hardcoded department_extra_fields table.
// Values stored as JSONB in entities.extra_data column.
// ══════════════════════════════════════════════════════════════════════════════

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  // persons | worker_assignments | positions | departments
  objectType:    varchar('object_type', { length: 50 }).notNull(),
  // Unique API identifier — used as JSONB key in extra_data
  apiName:       varchar('api_name', { length: 100 }).notNull(),
  labelEn:       varchar('label_en', { length: 200 }).notNull(),
  labelAr:       varchar('label_ar', { length: 200 }),
  // TEXT | NUMBER | DATE | CURRENCY | CHECKBOX | PICKLIST | MULTI_PICKLIST | LONG_TEXT | URL
  dataType:      varchar('data_type', { length: 30 }).notNull(),
  // Optional: validates against a lookup_type for PICKLIST fields
  picklistLookupType: varchar('picklist_lookup_type', { length: 100 }),
  isRequired:    boolean('is_required').notNull().default(false),
  isSearchable:  boolean('is_searchable').notNull().default(false),
  isEncrypted:   boolean('is_encrypted').notNull().default(false),
  // Which department types see this field (NULL = all)
  visibleToDepartmentTypes: text('visible_to_department_types').array(),
  // Validation rules JSON: { min, max, regex, ... }
  validationRules: jsonb('validation_rules'),
  defaultValue:  text('default_value'),
  helpTextEn:    text('help_text_en'),
  helpTextAr:    text('help_text_ar'),
  displayOrder:  integer('display_order').notNull().default(0),
  sectionCode:   varchar('section_code', { length: 50 }),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 2 — WORKFLOW ENGINE (ERD §7.2–7.4)
// Configurable multi-step approval workflows.
// workflow_instances lives in transactions.ts (operational, not config).
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDefinitions = pgTable('workflow_definitions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:  uuid('legal_entity_id').references(() => legalEntities.id),
  workflowCode:   varchar('workflow_code', { length: 50 }).notNull(),
  workflowNameEn: varchar('workflow_name_en', { length: 200 }).notNull(),
  workflowNameAr: varchar('workflow_name_ar', { length: 200 }),
  // HIRE | TRANSFER | LEAVE | SALARY_REVISION | TERMINATION |
  // DEPENDENT_ADD | DOCUMENT_VERIFY | OVERTIME | EXIT_CLEARANCE
  triggerEvent:   varchar('trigger_event', { length: 50 }).notNull(),
  conditionRules: jsonb('condition_rules'),
  // SEQUENTIAL | PARALLEL
  approvalMode:   varchar('approval_mode', { length: 20 }).notNull().default('SEQUENTIAL'),
  slaHours:        integer('sla_hours').notNull().default(48),
  escalationHours: integer('escalation_hours').notNull().default(72),
  isActive:       boolean('is_active').notNull().default(true),
  version:        integer('version').notNull().default(1),
  ...audit(),
})

export const workflowStages = pgTable('workflow_stages', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  stageOrder:           integer('stage_order').notNull(),
  stageNameEn:          varchar('stage_name_en', { length: 200 }).notNull(),
  stageNameAr:          varchar('stage_name_ar', { length: 200 }),
  // ROLE | PERSON | POSITION | DYNAMIC
  approverType:         varchar('approver_type', { length: 20 }).notNull(),
  // DIRECT_MANAGER | HR_MANAGER | FINANCE_HEAD | LEGAL_ENTITY_HEAD | SYSTEM | CUSTOM
  approverRoleCode:     varchar('approver_role_code', { length: 50 }),
  approverPersonId:     uuid('approver_person_id'),
  dynamicApproverExpr:  varchar('dynamic_approver_expr', { length: 200 }),
  canDelegate:          boolean('can_delegate').notNull().default(true),
  isOptional:           boolean('is_optional').notNull().default(false),
  stageSlaHours:        integer('stage_sla_hours').notNull().default(24),
  // S9-01 — per-stage escalation role; must outrank approverRoleCode
  // (assertEscalationRoleHigher). NULL = use the workflow-level escalationHours
  // window with no role-targeted escalation.
  escalationRoleCode:   varchar('escalation_role_code', { length: 50 }),
  // APPROVE_REJECT | ACKNOWLEDGE | INFO_ONLY
  actionType:           varchar('action_type', { length: 30 }).notNull().default('APPROVE_REJECT'),
  ...audit(),
})

export const workflowRoutingRules = pgTable('workflow_routing_rules', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  priority:          integer('priority').notNull(),
  conditionField:    varchar('condition_field', { length: 100 }).notNull(),
  // = | != | > | < | >= | <= | IN | NOT_IN | IS_NULL | IS_NOT_NULL
  conditionOperator: varchar('condition_operator', { length: 20 }).notNull(),
  conditionValue:    text('condition_value').notNull(),
  // AND | OR
  logicalOperator:   varchar('logical_operator', { length: 5 }).notNull().default('AND'),
  isActive:          boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 3 — WORK SCHEDULES (ERD §7.1)
// Added per-day time columns + Ramadan columns to match ERD.
// work_schedule_patterns kept for detailed day-pattern support.
// ══════════════════════════════════════════════════════════════════════════════

export const workSchedules = pgTable('work_schedules', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:       uuid('legal_entity_id').references(() => legalEntities.id),
  scheduleCode:        varchar('schedule_code', { length: 30 }).notNull(),
  scheduleNameEn:      varchar('schedule_name_en', { length: 200 }).notNull(),
  scheduleNameAr:      varchar('schedule_name_ar', { length: 200 }),
  // STANDARD | RAMADAN | SHIFT | FLEXIBLE | PART_TIME
  scheduleType:        varchar('schedule_type', { length: 30 }).notNull().default('STANDARD'),
  // Per-day start/end times (HH:MM; NULL = non-working day) — ERD 7.1
  mondayStart:         varchar('monday_start', { length: 5 }),
  mondayEnd:           varchar('monday_end', { length: 5 }),
  tuesdayStart:        varchar('tuesday_start', { length: 5 }),
  tuesdayEnd:          varchar('tuesday_end', { length: 5 }),
  wednesdayStart:      varchar('wednesday_start', { length: 5 }),
  wednesdayEnd:        varchar('wednesday_end', { length: 5 }),
  thursdayStart:       varchar('thursday_start', { length: 5 }),
  thursdayEnd:         varchar('thursday_end', { length: 5 }),
  fridayStart:         varchar('friday_start', { length: 5 }),
  fridayEnd:           varchar('friday_end', { length: 5 }),
  saturdayStart:       varchar('saturday_start', { length: 5 }),
  saturdayEnd:         varchar('saturday_end', { length: 5 }),
  sundayStart:         varchar('sunday_start', { length: 5 }),
  sundayEnd:           varchar('sunday_end', { length: 5 }),
  totalHoursPerWeek:   numeric('total_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // Weekend days as array: [5,6] = Friday+Saturday (UAE standard)
  weekendDays:         integer('weekend_days').array().notNull().default([5, 6]),
  breakMinutes:        integer('break_minutes').notNull().default(60),
  isRamadanSchedule:   boolean('is_ramadan_schedule').notNull().default(false),
  ramadanHoursPerDay:  numeric('ramadan_hours_per_day', { precision: 4, scale: 2 }).default('6.00'),
  isActive:            boolean('is_active').notNull().default(true),
  isDefault:           boolean('is_default').notNull().default(false),
  ...audit(),
})

export const workSchedulePatterns = pgTable('work_schedule_patterns', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workScheduleId: uuid('work_schedule_id').notNull().references(() => workSchedules.id),
  // 0=Sunday, 1=Monday, … 6=Saturday
  dayOfWeek:      integer('day_of_week').notNull(),
  isWorkingDay:   boolean('is_working_day').notNull().default(true),
  startTime:      varchar('start_time', { length: 5 }),
  endTime:        varchar('end_time', { length: 5 }),
  breakMinutes:   integer('break_minutes').notNull().default(60),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 4 — PUBLIC HOLIDAYS (ERD §7.10)
// Aligned column names and added: holidayCode, holidayNameEn/Ar, holidayYear,
// endDate, durationDays, isFloating, announcedDate, appliesTo.
// ══════════════════════════════════════════════════════════════════════════════

export const publicHolidays = pgTable('public_holidays', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  holidayYear:   integer('holiday_year').notNull(),
  holidayCode:   varchar('holiday_code', { length: 30 }).notNull(),
  holidayNameEn: varchar('holiday_name_en', { length: 200 }).notNull(),
  holidayNameAr: varchar('holiday_name_ar', { length: 200 }).notNull(),
  holidayDate:   date('holiday_date').notNull(),
  // Multi-day holidays (Eid = 3 days)
  endDate:       date('end_date'),
  durationDays:  integer('duration_days').notNull().default(1),
  // Hijri calendar-based holidays (float each year)
  isFloating:    boolean('is_floating').notNull().default(false),
  announcedDate: date('announced_date'),
  isConfirmed:   boolean('is_confirmed').notNull().default(false),
  // ALL | MUSLIMS_ONLY | PUBLIC_SECTOR_ONLY
  appliesTo:     varchar('applies_to', { length: 20 }).notNull().default('ALL'),
  emirate:       varchar('emirate', { length: 50 }),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 5 — LEAVE RULE SETS (ERD §4 config tables)
// ══════════════════════════════════════════════════════════════════════════════

export const leaveRuleSets = pgTable('leave_rule_sets', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:   uuid('legal_entity_id').references(() => legalEntities.id),
  ruleSetCode:     varchar('rule_set_code', { length: 50 }).notNull(),
  ruleSetNameEn:   varchar('rule_set_name_en', { length: 200 }).notNull(),
  ruleSetNameAr:   varchar('rule_set_name_ar', { length: 200 }),
  // MAINLAND | DIFC | ADGM | FREEZONE
  entityTypeScope:    varchar('entity_type_scope', { length: 20 }),
  // UAE_NATIONAL | GCC_NATIONAL | EXPAT | ALL
  nationalityScope:   varchar('nationality_scope', { length: 20 }).default('ALL'),
  // FULL_TIME | PART_TIME | ALL
  employmentTypeScope: varchar('employment_type_scope', { length: 30 }).default('ALL'),
  effectiveFrom:   date('effective_from').notNull(),
  effectiveTo:     date('effective_to'),
  isActive:        boolean('is_active').notNull().default(true),
  isDefault:       boolean('is_default').notNull().default(false),
  ...audit(),
})

export const leaveRuleLines = pgTable('leave_rule_lines', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  leaveRuleSetId:       uuid('leave_rule_set_id').notNull().references(() => leaveRuleSets.id),
  absenceTypeCode:      varchar('absence_type_code', { length: 30 }).notNull(),
  // [{ minServiceMonths: 0, maxServiceMonths: 12, daysEntitled: 22 }, ...]
  entitlementTiersJson: jsonb('entitlement_tiers_json').notNull(),
  maxCarryForwardDays:  numeric('max_carry_forward_days', { precision: 5, scale: 1 }).notNull().default('0'),
  carryForwardExpiryMonths: integer('carry_forward_expiry_months').notNull().default(0),
  isProRated:           boolean('is_pro_rated').notNull().default(true),
  // MONTHLY | DAILY | ANNUALLY
  accrualFrequency:     varchar('accrual_frequency', { length: 20 }).notNull().default('MONTHLY'),
  minServiceMonths:     integer('min_service_months').notNull().default(0),
  maxDaysPerYear:       numeric('max_days_per_year', { precision: 6, scale: 2 }),
  encashmentAllowed:    boolean('encashment_allowed').notNull().default(false),
  encashmentMaxDays:    numeric('encashment_max_days', { precision: 5, scale: 1 }),
  isActive:             boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 6 — NOTIFICATION TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

export const notificationTemplates = pgTable('notification_templates', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:   uuid('legal_entity_id').references(() => legalEntities.id),
  templateCode:    varchar('template_code', { length: 100 }).notNull(),
  templateNameEn:  varchar('template_name_en', { length: 200 }).notNull(),
  // LEAVE_APPROVED | DOCUMENT_EXPIRING | SALARY_PROCESSED | WORKFLOW_PENDING | etc.
  eventType:       varchar('event_type', { length: 100 }).notNull(),
  // EMAIL | PUSH | IN_APP | SMS | WHATSAPP
  channel:         varchar('channel', { length: 20 }).notNull(),
  language:        varchar('language', { length: 10 }).notNull().default('en'),
  subjectEn:       varchar('subject_en', { length: 500 }),
  subjectAr:       varchar('subject_ar', { length: 500 }),
  bodyEn:          text('body_en').notNull(),
  bodyAr:          text('body_ar'),
  availableVarsJson: jsonb('available_vars_json'),
  // EMPLOYEE | MANAGER | HR_ADMIN | PAYROLL_ADMIN | FINANCE
  recipientRoles:  text('recipient_roles').array().notNull().default(['EMPLOYEE']),
  advanceNoticeDays: integer('advance_notice_days').array(),
  isActive:        boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 7 — POLICY SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export const policySettings = pgTable('policy_settings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  settingKey:    varchar('setting_key', { length: 200 }).notNull(),
  settingNameEn: varchar('setting_name_en', { length: 300 }).notNull(),
  settingNameAr: varchar('setting_name_ar', { length: 300 }),
  // STRING | NUMBER | BOOLEAN | JSON | DATE
  valueType:     varchar('value_type', { length: 20 }).notNull().default('STRING'),
  settingValue:  text('setting_value').notNull(),
  moduleCode:    varchar('module_code', { length: 50 }).notNull(),
  isOverridable: boolean('is_overridable').notNull().default(false),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:   date('effective_to'),
  notes:         text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 8 — COMPLIANCE RULES (ERD §10.1)
// Aligned to ERD 10.1: rule_id, module, entity_types[], article_ref,
// rule_type, formula JSONB, effective_date, sunset_date, priority.
// ══════════════════════════════════════════════════════════════════════════════

export const complianceRules = pgTable('compliance_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // Per-entity override support (NULL = system-wide rule)
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  // e.g., BR-EOSB-001 | BR-AL-001 | BR-WPS-001 | BR-GPSSA-001
  ruleId:        varchar('rule_id', { length: 30 }).notNull(),
  // CORE_HR | ABSENCE | PAYROLL | INSURANCE | WORKFLOW | ALL
  module:        varchar('module', { length: 30 }).notNull(),
  // ARRAY['MAINLAND'] | ARRAY['MAINLAND','FREEZONE'] | ARRAY['DIFC']
  entityTypes:   varchar('entity_types', { length: 20 }).array().notNull().default(['MAINLAND']),
  // e.g., 'Article 51, FDL 33/2021'
  articleRef:    text('article_ref').notNull(),
  // CALCULATION | VALIDATION | ALERT | ROUTING
  ruleType:      varchar('rule_type', { length: 20 }).notNull(),
  descriptionEn: text('description_en').notNull(),
  descriptionAr: text('description_ar'),
  // Formula JSON: { "type": "EOSB_BAND", "rate_yr1_5": 21, "rate_yr5_plus": 30, "cap_months": 24 }
  formula:       jsonb('formula'),
  effectiveDate: date('effective_date').notNull(),
  sunsetDate:    date('sunset_date'),
  isActive:      boolean('is_active').notNull().default(true),
  isOverridable: boolean('is_overridable').notNull().default(false),
  priority:      integer('priority').notNull().default(0),
  // Keeps backward-compat column for entity-specific scope
  nationalityScope: varchar('nationality_scope', { length: 20 }).default('ALL'),
  notes:         text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 9 — GRADE SALARY RANGES (ERD §10.6)
// Added: basic_min/mid/max (renamed from min/mid/max_salary),
// housing_type, housing_value, transport_type, transport_value,
// phone_allowance, car_allowance.
// ══════════════════════════════════════════════════════════════════════════════

export const gradeSalaryRanges = pgTable('grade_salary_ranges', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  gradeId:           uuid('grade_id').notNull().references(() => grades.id),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  effectiveStartDate: date('effective_start_date').notNull(),
  effectiveEndDate:   date('effective_end_date'),
  // Basic salary range (AED/month)
  basicMin:        numeric('basic_min', { precision: 12, scale: 2 }).notNull(),
  basicMid:        numeric('basic_mid', { precision: 12, scale: 2 }).notNull(),
  basicMax:        numeric('basic_max', { precision: 12, scale: 2 }).notNull(),
  // Housing allowance config — PERCENTAGE of basic OR FIXED_AMOUNT
  housingType:     varchar('housing_type', { length: 20 }).notNull().default('PERCENTAGE'),
  // 0.25 = 25% of basic, OR fixed AED amount
  housingValue:    numeric('housing_value', { precision: 10, scale: 4 }).notNull().default('0.25'),
  // Transport allowance config
  transportType:   varchar('transport_type', { length: 20 }).notNull().default('FIXED_AMOUNT'),
  transportValue:  numeric('transport_value', { precision: 10, scale: 4 }).notNull().default('1500'),
  phoneAllowance:  numeric('phone_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  carAllowance:    numeric('car_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  currency:        char('currency', { length: 3 }).notNull().default('AED'),
  // Optional per-step ranges (array of { step: 1, amount: 15000 })
  stepsJson:       jsonb('steps_json'),
  approvedBy:      uuid('approved_by'),
  notes:           text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 10 — MEDICAL INSURANCE PLANS (ERD §9.1)
// Fully aligned to ERD 9.1: added tpaName, policyNumber, coverage details,
// per-role premiums, policy dates, gradeIds[], employmentTypes[], isDefaultPlan.
// ══════════════════════════════════════════════════════════════════════════════

export const medicalInsurancePlans = pgTable('medical_insurance_plans', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:    uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  planCode:         varchar('plan_code', { length: 50 }).notNull(),
  planNameEn:       varchar('plan_name_en', { length: 200 }).notNull(),
  planNameAr:       varchar('plan_name_ar', { length: 200 }),
  // Provider details
  providerName:     varchar('provider_name', { length: 200 }).notNull(),
  tpaName:          varchar('tpa_name', { length: 200 }),
  policyNumber:     varchar('policy_number', { length: 100 }).notNull(),
  networkName:      varchar('network_name', { length: 100 }),
  // ESSENTIAL_BENEFITS | BASIC | ENHANCED | PREMIUM | EXECUTIVE | CUSTOM
  planCategory:     varchar('plan_category', { length: 30 }).notNull(),
  // Coverage limits
  inpatientLimitAed:   numeric('inpatient_limit_aed', { precision: 12, scale: 2 }),
  outpatientLimitAed:  numeric('outpatient_limit_aed', { precision: 12, scale: 2 }),
  dentalCovered:       boolean('dental_covered').notNull().default(false),
  opticalCovered:      boolean('optical_covered').notNull().default(false),
  maternityCovered:    boolean('maternity_covered').notNull().default(true),
  preExistingCovered:  boolean('pre_existing_covered').notNull().default(false),
  repatriationCovered: boolean('repatriation_covered').notNull().default(false),
  // Eligibility
  gradeIds:            uuid('grade_ids').array(),           // NULL = all grades
  employmentTypes:     text('employment_types').array(),    // NULL = all types
  minServiceMonths:    integer('min_service_months').notNull().default(0),
  dependentsCovered:   boolean('dependents_covered').notNull().default(true),
  maxDependents:       integer('max_dependents').notNull().default(9),
  // Annual premiums per person type
  employeePremiumAed:  numeric('employee_premium_aed', { precision: 10, scale: 2 }).notNull(),
  spousePremiumAed:    numeric('spouse_premium_aed', { precision: 10, scale: 2 }),
  childPremiumAed:     numeric('child_premium_aed', { precision: 10, scale: 2 }),
  parentPremiumAed:    numeric('parent_premium_aed', { precision: 10, scale: 2 }),
  // Policy dates
  policyStartDate:     date('policy_start_date').notNull(),
  policyEndDate:       date('policy_end_date').notNull(),
  renewalDate:         date('renewal_date'),
  isActive:            boolean('is_active').notNull().default(true),
  isDefaultPlan:       boolean('is_default_plan').notNull().default(false),
  // Legacy fields kept for backward compat
  regulatoryScheme:    varchar('regulatory_scheme', { length: 20 }),
  employerContributionPct: numeric('employer_contribution_pct', { precision: 5, scale: 2 }).notNull().default('100'),
  eligibleGradeLevelMin: integer('eligible_grade_level_min'),
  eligibleGradeLevelMax: integer('eligible_grade_level_max'),
  coverageDetailsJson:   jsonb('coverage_details_json'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 11 — DOCUMENT TYPE CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

export const documentTypeConfigs = pgTable('document_type_configs', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:        uuid('legal_entity_id').references(() => legalEntities.id),
  // EMIRATES_ID | PASSPORT | VISA | LABOUR_CARD | CONTRACT | DEGREE | etc.
  documentType:         varchar('document_type', { length: 50 }).notNull(),
  nameEn:               varchar('name_en', { length: 200 }).notNull(),
  nameAr:               varchar('name_ar', { length: 200 }),
  isMandatory:          boolean('is_mandatory').notNull().default(false),
  // UAE_NATIONAL | GCC_NATIONAL | EXPAT | ALL
  nationalityScope:     varchar('nationality_scope', { length: 20 }).default('ALL'),
  alertDaysBeforeExpiry: integer('alert_days_before_expiry').array().notNull().default([90, 60, 30, 14]),
  alertRecipients:      text('alert_recipients').array().notNull().default(['HR_ADMIN']),
  maxFileSizeMb:        integer('max_file_size_mb').notNull().default(10),
  allowedMimeTypes:     text('allowed_mime_types').array().notNull().default(['application/pdf', 'image/jpeg', 'image/png']),
  isActive:             boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 12 — FORM CONFIGURATIONS (D-08 / S2-07)
// Per-entity form layouts that drive `resolveFormConfig` in lib/config-resolver.
// The `config` JSONB stores `{ sections: FormSection[] }` so the runtime can
// reorder, hide, or extend sections without a schema change.
// UNIQUE (tenant_id, entity_type, role) — at most one active layout per scope.
// ══════════════════════════════════════════════════════════════════════════════

export const formConfigurations = pgTable('form_configurations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  // PERSON | CONTRACT | LEAVE_REQUEST (extend as new entity types ship)
  entityType:    varchar('entity_type', { length: 50 }).notNull(),
  // HR_ADMIN | EMPLOYEE | MANAGER | ALL — ALL is the fallback layout
  role:          varchar('role', { length: 50 }).notNull().default('ALL'),
  // { sections: [{ sectionCode, labelEn, labelAr, fields: [...] }, ...] }
  config:        jsonb('config').$type<{ sections: unknown[] }>().notNull(),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
}, (t) => ({
  scopeUniq: uniqueIndex('form_configurations_scope_uniq').on(
    t.tenantId, t.entityType, t.role,
  ),
}))

// ══════════════════════════════════════════════════════════════════════════════
// PAGE PERSONALIZATION
// Controls the sign-in page appearance and content per legal entity.
// ══════════════════════════════════════════════════════════════════════════════

export const pagePersonalization = pgTable('page_personalization', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  entityId:            uuid('entity_id').references(() => legalEntities.id, { onDelete: 'cascade' }),

  // Top banner
  topBannerText:       text('top_banner_text').notNull().default('AI Driven HR System'),
  topBannerVisible:    boolean('top_banner_visible').notNull().default(true),

  // Scrolling ticker
  tickerText:          text('ticker_text').notNull().default('AVANIIS Stock Price 100$ · Founder — Visionary Leader — Mr. Talal Al Gaddah'),
  tickerVisible:       boolean('ticker_visible').notNull().default(true),
  tickerSpeed:         integer('ticker_speed').notNull().default(30),

  // Carousel images: [{ id, url, alt, order, uploadedAt, fileSize? }]
  carouselImages:      jsonb('carousel_images').notNull().default([]),

  // Custom logo (null = use default)
  logoUrl:             text('logo_url'),

  // Carousel area height as percentage of left column (40–85)
  carouselHeightPct:   integer('carousel_height_pct').notNull().default(70),

  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:           uuid('updated_by'),
}, table => ({
  entityUnique: uniqueIndex('page_personalization_entity_unique').on(table.entityId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 13 — FEATURE PERMISSIONS (Step 4 — Admin Panel)
// Per-feature, per-role permission matrix managed via the admin UI.
// Rows with is_system_locked = true are display-only — UI cannot toggle them.
// ══════════════════════════════════════════════════════════════════════════════

export const featurePermissions = pgTable('feature_permissions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  featureKey:     varchar('feature_key', { length: 80 }).notNull(),
  featureLabel:   varchar('feature_label', { length: 200 }).notNull(),
  featureGroup:   varchar('feature_group', { length: 80 }).notNull(),
  // { view, create, edit, delete, approve, export } booleans
  employeePerms:  jsonb('employee_perms').$type<PermSet>().notNull(),
  managerPerms:   jsonb('manager_perms').$type<PermSet>().notNull(),
  hrAdminPerms:   jsonb('hr_admin_perms').$type<PermSet>().notNull(),
  isSystemLocked: boolean('is_system_locked').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Permission type shared between schema and application layer ──────────────

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export'
export type PermSet    = Record<PermAction, boolean>

export type FeaturePermission    = typeof featurePermissions.$inferSelect
export type NewFeaturePermission = typeof featurePermissions.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// 15 — COMPANY CURRENCY SETTINGS
// Effective-dated, auditable currency configuration per legal entity.
// Separate table (not extending legal_entities) because:
//   • decimal_places, rounding_method, effective dates need full audit trail
//   • multiple historical configs per entity must co-exist (effective dating)
//   • legalEntities.defaultCurrency is char(3) only — cannot carry precision
// BR-CCY-001: Only one ACTIVE config may overlap a given effective date range
//             per legal entity.
// BR-CCY-002: Default AED / 2 dp / HALF_UP is applied when no config exists.
// ══════════════════════════════════════════════════════════════════════════════

export const companyCurrencySettings = pgTable('company_currency_settings', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:   uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // ISO 4217 three-letter currency code
  currencyCode:    char('currency_code', { length: 3 }).notNull(),
  currencyNameEn:  varchar('currency_name_en', { length: 100 }).notNull(),
  currencyNameAr:  varchar('currency_name_ar', { length: 100 }).notNull(),
  currencySymbol:  varchar('currency_symbol', { length: 10 }).notNull(),
  // 0–6 inclusive; most currencies use 2, KWD/BHD/OMR use 3, JPY uses 0
  decimalPlaces:   integer('decimal_places').notNull().default(2),
  // HALF_UP | HALF_EVEN | FLOOR | CEIL | TRUNCATE
  roundingMethod:  varchar('rounding_method', { length: 20 }).notNull().default('HALF_UP'),
  effectiveFrom:   date('effective_from').notNull(),
  effectiveTo:     date('effective_to'),
  isActive:        boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// INFERRED TYPESCRIPT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type CustomFieldDefinition  = typeof customFieldDefinitions.$inferSelect
export type WorkflowDefinition     = typeof workflowDefinitions.$inferSelect
export type WorkflowStage          = typeof workflowStages.$inferSelect
export type WorkflowRoutingRule    = typeof workflowRoutingRules.$inferSelect
export type WorkSchedule           = typeof workSchedules.$inferSelect
export type WorkSchedulePattern    = typeof workSchedulePatterns.$inferSelect
export type PublicHoliday          = typeof publicHolidays.$inferSelect
export type LeaveRuleSet           = typeof leaveRuleSets.$inferSelect
export type LeaveRuleLine          = typeof leaveRuleLines.$inferSelect
export type NotificationTemplate   = typeof notificationTemplates.$inferSelect
export type PolicySetting          = typeof policySettings.$inferSelect
export type ComplianceRule         = typeof complianceRules.$inferSelect
export type GradeSalaryRange       = typeof gradeSalaryRanges.$inferSelect
export type MedicalInsurancePlan   = typeof medicalInsurancePlans.$inferSelect
export type DocumentTypeConfig     = typeof documentTypeConfigs.$inferSelect
export type FormConfiguration      = typeof formConfigurations.$inferSelect

export type NewFormConfiguration   = typeof formConfigurations.$inferInsert
export type NewWorkflowDefinition  = typeof workflowDefinitions.$inferInsert
export type NewWorkflowInstance_deprecated = never  // moved to transactions.ts
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert
export type NewComplianceRule      = typeof complianceRules.$inferInsert
export type NewGradeSalaryRange    = typeof gradeSalaryRanges.$inferInsert
export type PagePersonalization    = typeof pagePersonalization.$inferSelect
export type NewPagePersonalization = typeof pagePersonalization.$inferInsert
export type CompanyCurrencySetting    = typeof companyCurrencySettings.$inferSelect
export type NewCompanyCurrencySetting = typeof companyCurrencySettings.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// 14 — ARIA AI AGENT CONFIGURATION
// Four tables that drive the ARIA AI agent: identity, model/provider settings,
// behaviour tuning, and knowledge sources for RAG.
// ══════════════════════════════════════════════════════════════════════════════

export const ariaAgentConfig = pgTable('aria_agent_config', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  agentName:    varchar('agent_name', { length: 100 }).notNull().default('ARIA'),
  agentNameAr:  varchar('agent_name_ar', { length: 100 }),
  agentRole:    varchar('agent_role', { length: 100 }).notNull().default('HR Intelligence Assistant'),
  // 'professional' | 'friendly' | 'analytical' | 'executive' | 'strict'
  agentTone:    varchar('agent_tone', { length: 50 }).notNull().default('professional'),
  avatarUrl:    varchar('avatar_url', { length: 500 }),
  // Branding — Migration 0040
  welcomeText:    text('welcome_text'),
  welcomeTextAr:  text('welcome_text_ar'),
  footerLabel:    varchar('footer_label', { length: 200 }),
  footerLabelAr:  varchar('footer_label_ar', { length: 200 }),
  accentColor:    varchar('accent_color', { length: 20 }),
  isActive:     boolean('is_active').notNull().default(true),
  ...audit(),
})

export const ariaModelConfig = pgTable('aria_model_config', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // 'anthropic' | 'openai' | 'azure_openai' | 'google'
  provider:                varchar('provider', { length: 50 }).notNull().default('anthropic'),
  modelId:                 varchar('model_id', { length: 100 }).notNull().default('claude-sonnet-4-6'),
  // AES-256-GCM via lib/encryption.ts — NEVER store plaintext
  apiKeyEncrypted:         varchar('api_key_encrypted', { length: 1000 }),
  // null = use SDK default; used for Azure OpenAI
  apiEndpoint:             varchar('api_endpoint', { length: 500 }),
  temperature:             numeric('temperature', { precision: 3, scale: 2 }).notNull().default('0.3'),
  maxTokens:               integer('max_tokens').notNull().default(1000),
  fallbackProvider:        varchar('fallback_provider', { length: 50 }),
  fallbackModelId:         varchar('fallback_model_id', { length: 100 }),
  fallbackApiKeyEncrypted: varchar('fallback_api_key_encrypted', { length: 1000 }),
  isActive:                boolean('is_active').notNull().default(true),
  ...audit(),
})

export const ariaBehaviourConfig = pgTable('aria_behaviour_config', {
  id:                        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // null = use default; if set, applied per promptMode
  systemPromptOverride:      text('system_prompt_override'),
  // 'prepend' | 'replace' | 'append'
  promptMode:                varchar('prompt_mode', { length: 20 }).notNull().default('prepend'),
  // 'advisory' | 'recommend_approve' | 'full_execution'
  authorityLevel:            varchar('authority_level', { length: 30 }).notNull().default('advisory'),
  enabledDataSources:        jsonb('enabled_data_sources').notNull().default(['hr', 'absence', 'compliance']),
  ragEnabled:                boolean('rag_enabled').notNull().default(true),
  ragMaxChunks:              integer('rag_max_chunks').notNull().default(5),
  anomalyDetection:          boolean('anomaly_detection').notNull().default(true),
  predictiveInsights:        boolean('predictive_insights').notNull().default(false),
  slaMonitoring:             boolean('sla_monitoring').notNull().default(true),
  conversationRetentionDays: integer('conversation_retention_days').notNull().default(90),
  contextDepthMessages:      integer('context_depth_messages').notNull().default(20),
  personalizationEnabled:    boolean('personalization_enabled').notNull().default(true),
  isActive:                  boolean('is_active').notNull().default(true),
  ...audit(),
})

export const ariaKnowledgeSources = pgTable('aria_knowledge_sources', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  sourceName:    varchar('source_name', { length: 200 }).notNull(),
  // 'pdf' | 'docx' | 'url' | 'text'
  sourceType:    varchar('source_type', { length: 30 }).notNull(),
  storageKey:    varchar('storage_key', { length: 500 }),
  fileSizeBytes: integer('file_size_bytes'),
  mimeType:      varchar('mime_type', { length: 100 }),
  // 'pending' | 'processing' | 'indexed' | 'failed'
  vectorStatus:  varchar('vector_status', { length: 30 }).notNull().default('pending'),
  chunkCount:    integer('chunk_count'),
  lastIndexedAt: timestamp('last_indexed_at', { withTimezone: true }),
  tags:          jsonb('tags').default([]),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
})

// ── ARIA inferred TypeScript types ───────────────────────────────────────────

export type AriaAgentConfig       = typeof ariaAgentConfig.$inferSelect
export type NewAriaAgentConfig    = typeof ariaAgentConfig.$inferInsert
export type AriaModelConfig       = typeof ariaModelConfig.$inferSelect
export type NewAriaModelConfig    = typeof ariaModelConfig.$inferInsert
export type AriaBehaviourConfig   = typeof ariaBehaviourConfig.$inferSelect
export type NewAriaBehaviourConfig = typeof ariaBehaviourConfig.$inferInsert
export type AriaKnowledgeSource   = typeof ariaKnowledgeSources.$inferSelect
export type NewAriaKnowledgeSource = typeof ariaKnowledgeSources.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// 16 — LEAVE BACKDATE POLICIES
// Per-entity per-leave-type backdating rules.
// No row for a (entity, type) combination = no restriction (any past date allowed).
// BR-LV-BDP-001: Only HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN may configure.
// BR-LV-BDP-002: One policy row per (tenant, legal_entity, absence_type) — enforced by UNIQUE constraint.
// ══════════════════════════════════════════════════════════════════════════════

export const leaveBackdatePolicies = pgTable('leave_backdate_policies', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  absenceTypeId:     uuid('absence_type_id').notNull().references(() => absenceTypes.id),
  backdatingEnabled: boolean('backdating_enabled').notNull().default(true),
  backdateLimitDays: integer('backdate_limit_days'),  // null = no day limit when enabled; 0 = same-day only
  ...audit(),
})

export type LeaveBackdatePolicy    = typeof leaveBackdatePolicies.$inferSelect
export type NewLeaveBackdatePolicy = typeof leaveBackdatePolicies.$inferInsert
