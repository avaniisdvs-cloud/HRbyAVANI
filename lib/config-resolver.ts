/**
 * Config Resolver — resolves policy settings and compliance rule parameters
 * at runtime without hard-coding business rules in application logic.
 *
 * Caches results per process (LRU-style map, max 200 entries) to avoid
 * repeated DB reads for frequently-used settings.
 */
import { db, type DbOrTx } from './db'
import {
  policySettings,
  complianceRules,
  customFieldDefinitions,
  workflowDefinitions,
  workflowStages,
  workflowRoutingRules,
  leaveRuleSets,
  leaveRuleLines,
  formConfigurations,
} from '@/drizzle/schema'
import { eq, and, lte, or, isNull } from 'drizzle-orm'
import { todayUae } from './effective-date'
import { TENANT_ID } from './constants'

const CACHE_MAX = 200

const policyCache  = new Map<string, unknown>()
const ruleCache    = new Map<string, Record<string, unknown>>()

// ── Policy Settings ────────────────────────────────────────────────────────

/**
 * Returns the current value of a policy setting as a string.
 * Returns undefined if no setting found for key.
 */
export async function getPolicy(
  key:           string,
  legalEntityId: string,
  asOf:          string = todayUae(),
  // DEADLOCK-FIX: when called from inside a db.transaction(), the caller MUST pass
  // the transaction (tx) here. The production pool is max:1 (lib/db.ts); issuing this
  // read on the global `db` pool while a transaction holds the only connection
  // deadlocks the request forever. Defaults to `db` for the common non-transactional
  // path (cached, so most calls never hit the DB anyway).
  executor:      DbOrTx = db,
): Promise<string | undefined> {
  const cacheKey = `${legalEntityId}:${key}:${asOf}`
  if (policyCache.has(cacheKey)) return policyCache.get(cacheKey) as string

  const rows = await executor
    .select({ value: policySettings.settingValue })
    .from(policySettings)
    .where(
      and(
        eq(policySettings.tenantId, TENANT_ID),
        eq(policySettings.legalEntityId, legalEntityId),
        eq(policySettings.settingKey, key),
        lte(policySettings.effectiveFrom, asOf),
        or(isNull(policySettings.effectiveTo), lte(policySettings.effectiveTo!, asOf)),
      )
    )
    .orderBy(policySettings.effectiveFrom)
    .limit(1)

  const value = rows[0]?.value
  if (value !== undefined) {
    if (policyCache.size >= CACHE_MAX) policyCache.delete(policyCache.keys().next().value!)
    policyCache.set(cacheKey, value)
  }
  return value
}

/** Returns policy as number. Throws if not found or not numeric. */
export async function getPolicyNumber(key: string, legalEntityId: string): Promise<number> {
  const v = await getPolicy(key, legalEntityId)
  if (v === undefined) throw new Error(`Policy not found: ${key}`)
  const n = Number(v)
  if (isNaN(n)) throw new Error(`Policy ${key} is not numeric: ${v}`)
  return n
}

/** Returns policy as boolean ('true'/'false'). Throws if not found. */
export async function getPolicyBool(key: string, legalEntityId: string): Promise<boolean> {
  const v = await getPolicy(key, legalEntityId)
  if (v === undefined) throw new Error(`Policy not found: ${key}`)
  return v.toLowerCase() === 'true'
}

/** Returns policy as parsed JSON. Throws if not found or not valid JSON. */
export async function getPolicyJson<T>(key: string, legalEntityId: string): Promise<T> {
  const v = await getPolicy(key, legalEntityId)
  if (v === undefined) throw new Error(`Policy not found: ${key}`)
  try {
    return JSON.parse(v) as T
  } catch {
    throw new Error(`Policy "${key}" contains invalid JSON`)
  }
}

// ── Compliance Rules ───────────────────────────────────────────────────────

/**
 * Returns the formula JSON for a compliance rule.
 * Matches by ruleId, entityTypes, nationalityScope, and effective date.
 */
export async function getComplianceRule(
  ruleId:          string,
  legalEntityId:   string,
  _entityTypeScope: string = 'MAINLAND',
  nationalityScope: string = 'ALL',
  asOf:            string = todayUae(),
): Promise<Record<string, unknown> | undefined> {
  const cacheKey = `${ruleId}:${legalEntityId}:${_entityTypeScope}:${nationalityScope}:${asOf}`
  if (ruleCache.has(cacheKey)) return ruleCache.get(cacheKey)

  const rows = await db
    .select({ params: complianceRules.formula })
    .from(complianceRules)
    .where(
      and(
        eq(complianceRules.tenantId, TENANT_ID),
        eq(complianceRules.legalEntityId, legalEntityId),
        eq(complianceRules.ruleId, ruleId),
        eq(complianceRules.isActive, true),
        lte(complianceRules.effectiveDate, asOf),
        or(isNull(complianceRules.sunsetDate), lte(complianceRules.sunsetDate!, asOf)),
      )
    )
    .limit(1)

  const params = rows[0]?.params as Record<string, unknown> | undefined
  if (params !== undefined) {
    if (ruleCache.size >= CACHE_MAX) ruleCache.delete(ruleCache.keys().next().value!)
    ruleCache.set(cacheKey, params)
  }
  return params
}

// ── EOSB helpers (BR-EOSB-001, BR-EOSB-002) ─────────────────────────────

export interface EosbParams {
  rateYear1To5:          number  // days per year (default 21)
  rateBeyond5:           number  // days per year (default 30)
  capMonths:             number  // cap in months' salary (default 24)
  dailyRateDivisor:      number  // divisor for daily rate (default 30)
}

export async function getEosbParams(legalEntityId: string): Promise<EosbParams> {
  const p = await getComplianceRule('BR-EOSB-001', legalEntityId)
  return {
    rateYear1To5:     Number(p?.rate_year_1_to_5     ?? 21),
    rateBeyond5:      Number(p?.rate_beyond_5         ?? 30),
    capMonths:        Number(p?.cap_months             ?? 24),
    dailyRateDivisor: Number(p?.daily_rate_divisor     ?? 30),
  }
}

export interface NoticePeriodParams {
  defaultDays:        number
  serviceLt3yrDays:   number
  service3to5yrDays:  number
  serviceGte5yrDays:  number
  maxDays:            number
}

export async function getNoticePeriodParams(legalEntityId: string): Promise<NoticePeriodParams> {
  const p = await getComplianceRule('BR-NP-001', legalEntityId)
  return {
    defaultDays:       Number(p?.default_days        ?? 30),
    serviceLt3yrDays:  Number(p?.service_lt_3yr_days  ?? 30),
    service3to5yrDays: Number(p?.service_3_to_5yr_days ?? 60),
    serviceGte5yrDays: Number(p?.service_gte_5yr_days   ?? 90),
    maxDays:           Number(p?.max_days               ?? 90),
  }
}

/** Invalidates the policy and rule caches (call after admin saves new settings). */
export function invalidateConfigCache(): void {
  policyCache.clear()
  ruleCache.clear()
}

// ── resolveCustomFields ────────────────────────────────────────────────────

export interface FieldDefinition {
  id:              string
  apiName:         string
  labelEn:         string
  labelAr:         string | null
  dataType:        string
  isRequired:      boolean
  isSearchable:    boolean
  isEncrypted:     boolean
  displayOrder:    number
  sectionCode:     string | null
  validationRules: Record<string, unknown> | null
  helpTextEn:      string | null
  helpTextAr:      string | null
}

/**
 * Returns active custom field definitions for an entity type, ordered by
 * displayOrder. Results are not cached (config changes must be immediate).
 */
export async function resolveCustomFields(
  entityType: string,
  tenantId:   string,
): Promise<FieldDefinition[]> {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.tenantId, tenantId),
        eq(customFieldDefinitions.objectType, entityType),
        eq(customFieldDefinitions.isActive, true),
      ),
    )
    .orderBy(customFieldDefinitions.displayOrder)

  return rows.map(r => ({
    id:              r.id,
    apiName:         r.apiName,
    labelEn:         r.labelEn,
    labelAr:         r.labelAr ?? null,
    dataType:        r.dataType,
    isRequired:      r.isRequired,
    isSearchable:    r.isSearchable,
    isEncrypted:     r.isEncrypted,
    displayOrder:    r.displayOrder,
    sectionCode:     r.sectionCode ?? null,
    validationRules: r.validationRules as Record<string, unknown> | null,
    helpTextEn:      r.helpTextEn ?? null,
    helpTextAr:      r.helpTextAr ?? null,
  }))
}

// ── resolveWorkflowTemplate ────────────────────────────────────────────────

export interface ResolvedStage {
  stageOrder:       number
  stageNameEn:      string
  approverType:     string
  approverRoleCode: string | null
  stageSlaHours:    number
}

export interface ResolvedSteps {
  workflowDefinitionId: string
  workflowCode:         string
  triggerEvent:         string
  stages:               ResolvedStage[]
}

/**
 * Fetches the active workflow template for a trigger event and applies any
 * routing rules to the stage list (SKIP_STEP based on context values).
 * Returns null when no active template exists for the event.
 */
export async function resolveWorkflowTemplate(
  triggerEvent: string,
  context:      Record<string, unknown>,
  tenantId:     string,
): Promise<ResolvedSteps | null> {
  const [wf] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.tenantId, tenantId),
        eq(workflowDefinitions.triggerEvent, triggerEvent),
        eq(workflowDefinitions.isActive, true),
      ),
    )
    .orderBy(workflowDefinitions.version)
    .limit(1)

  if (!wf) return null

  const stages = await db
    .select()
    .from(workflowStages)
    .where(eq(workflowStages.workflowDefinitionId, wf.id))
    .orderBy(workflowStages.stageOrder)

  const rules = await db
    .select()
    .from(workflowRoutingRules)
    .where(
      and(
        eq(workflowRoutingRules.workflowDefinitionId, wf.id),
        eq(workflowRoutingRules.isActive, true),
      ),
    )
    .orderBy(workflowRoutingRules.priority)

  // Apply routing rules: SKIP_STEP removes stages whose approverRoleCode matches
  let resolvedStages = [...stages]
  for (const rule of rules) {
    const ctxValue = String(context[rule.conditionField] ?? '')
    let matches = false
    switch (rule.conditionOperator) {
      case '=':       matches = ctxValue === rule.conditionValue; break
      case '!=':      matches = ctxValue !== rule.conditionValue; break
      case 'IN':      matches = rule.conditionValue.split(',').map(v => v.trim()).includes(ctxValue); break
      case 'NOT_IN':  matches = !rule.conditionValue.split(',').map(v => v.trim()).includes(ctxValue); break
      case 'IS_NULL': matches = ctxValue === '' || ctxValue === 'null'; break
    }
    if (matches) {
      resolvedStages = resolvedStages.filter(
        s => s.approverRoleCode !== rule.conditionValue,
      )
    }
  }

  return {
    workflowDefinitionId: wf.id,
    workflowCode:         wf.workflowCode,
    triggerEvent:         wf.triggerEvent,
    stages: resolvedStages.map(s => ({
      stageOrder:       s.stageOrder,
      stageNameEn:      s.stageNameEn,
      approverType:     s.approverType,
      approverRoleCode: s.approverRoleCode ?? null,
      stageSlaHours:    s.stageSlaHours,
    })),
  }
}

// ── resolveLeaveRuleSet ────────────────────────────────────────────────────

export interface ResolvedLeaveRule {
  id:                   string
  ruleSetCode:          string
  ruleSetNameEn:        string
  absenceTypeCode:      string
  entitlementTiersJson: unknown
  maxCarryForwardDays:  string
  isProRated:           boolean
  accrualFrequency:     string
  minServiceMonths:     number
  maxDaysPerYear:       string | null
  encashmentAllowed:    boolean
}

/**
 * Finds the highest-priority active leave rule set that contains a line for
 * the requested leaveTypeCode. Priority: most-specific scope wins
 * (nationalityScope/entityTypeScope rows before ALL-scope rows).
 *
 * BR-AL-001: returned rule must have been validated against UAE minimum
 *            before being stored (assertLeaveRuleNotBelowMinimum).
 */
export async function resolveLeaveRuleSet(
  _employeeId:   string,   // reserved for future nationality/entity-type scoping
  leaveTypeCode: string,
  tenantId:      string,
): Promise<ResolvedLeaveRule | null> {
  const sets = await db
    .select()
    .from(leaveRuleSets)
    .where(
      and(
        eq(leaveRuleSets.tenantId, tenantId),
        eq(leaveRuleSets.isActive, true),
      ),
    )
    .orderBy(leaveRuleSets.effectiveFrom)

  for (const set of sets) {
    const [line] = await db
      .select()
      .from(leaveRuleLines)
      .where(
        and(
          eq(leaveRuleLines.leaveRuleSetId, set.id),
          eq(leaveRuleLines.absenceTypeCode, leaveTypeCode),
          eq(leaveRuleLines.isActive, true),
        ),
      )
      .limit(1)

    if (line) {
      return {
        id:                   set.id,
        ruleSetCode:          set.ruleSetCode,
        ruleSetNameEn:        set.ruleSetNameEn,
        absenceTypeCode:      line.absenceTypeCode,
        entitlementTiersJson: line.entitlementTiersJson,
        maxCarryForwardDays:  line.maxCarryForwardDays,
        isProRated:           line.isProRated,
        accrualFrequency:     line.accrualFrequency,
        minServiceMonths:     line.minServiceMonths,
        maxDaysPerYear:       line.maxDaysPerYear ?? null,
        encashmentAllowed:    line.encashmentAllowed,
      }
    }
  }

  return null
}

// ── resolveFormConfig ──────────────────────────────────────────────────────

export interface FormSection {
  sectionCode: string
  labelEn:     string
  labelAr:     string
  fields:      string[]
}

export interface FormConfig {
  entityType: string
  role:       string
  sections:   FormSection[]
}

// Default layouts — used as a fallback when no row exists in form_configurations.
// BR-FORM-001: sections follow CONFIGURATION_FRAMEWORK.md §5 field-section spec.
// These are also the seed values inserted by `drizzle/seed.ts`, so the fallback
// only kicks in for entity types added before their seed row lands.
const DEFAULT_SECTIONS: Record<string, FormSection[]> = {
  PERSON: [
    { sectionCode: 'PERSONAL_INFO',   labelEn: 'Personal Information', labelAr: 'المعلومات الشخصية',   fields: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'nationality'] },
    { sectionCode: 'EMPLOYMENT_INFO', labelEn: 'Employment Information', labelAr: 'معلومات الوظيفة', fields: ['jobTitle', 'department', 'grade', 'manager'] },
    { sectionCode: 'CONTACT',         labelEn: 'Contact Details',      labelAr: 'بيانات الاتصال',      fields: ['workEmail', 'mobileNumber', 'address'] },
    { sectionCode: 'DOCUMENTS',       labelEn: 'Documents',            labelAr: 'الوثائق',             fields: ['emiratesId', 'passport', 'visa'] },
    { sectionCode: 'CUSTOM',          labelEn: 'Custom Fields',        labelAr: 'الحقول المخصصة',     fields: [] },
  ],
  CONTRACT: [
    { sectionCode: 'CONTRACT_TERMS',  labelEn: 'Contract Terms',       labelAr: 'شروط العقد',         fields: ['contractType', 'startDate', 'endDate', 'noticePeriod'] },
    { sectionCode: 'COMPENSATION',    labelEn: 'Compensation',         labelAr: 'الراتب والمزايا',    fields: ['basicSalary', 'housingAllowance', 'transportAllowance'] },
    { sectionCode: 'BENEFITS',        labelEn: 'Benefits',             labelAr: 'المزايا',            fields: ['medicalPlan', 'annualLeave'] },
  ],
  LEAVE_REQUEST: [
    { sectionCode: 'REQUEST_DETAILS', labelEn: 'Request Details',      labelAr: 'تفاصيل الطلب',      fields: ['leaveType', 'startDate', 'endDate', 'reason'] },
    { sectionCode: 'CUSTOM',          labelEn: 'Custom Fields',        labelAr: 'الحقول المخصصة',     fields: [] },
  ],
}

export const _DEFAULT_FORM_SECTIONS = DEFAULT_SECTIONS

/**
 * Returns the form section configuration for an entity type + role combination.
 *
 * Resolution order (most specific wins):
 *   1. (tenant, entityType, role)   — exact role match
 *   2. (tenant, entityType, 'ALL')  — fallback role
 *   3. DEFAULT_SECTIONS[entityType] — code-level baseline
 */
export async function resolveFormConfig(
  entityType: string,
  role:       string,
  tenantId:   string,
): Promise<FormConfig> {
  const rows = await db
    .select({ role: formConfigurations.role, config: formConfigurations.config })
    .from(formConfigurations)
    .where(
      and(
        eq(formConfigurations.tenantId, tenantId),
        eq(formConfigurations.entityType, entityType),
        eq(formConfigurations.isActive, true),
      ),
    )

  const exact = rows.find(r => r.role === role)
  const fallback = rows.find(r => r.role === 'ALL')
  const dbSections = (exact ?? fallback)?.config?.sections as FormSection[] | undefined

  const sections = dbSections ?? DEFAULT_SECTIONS[entityType] ?? []
  return { entityType, role, sections }
}
