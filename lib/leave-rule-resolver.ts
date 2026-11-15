/**
 * S5-04 / S5-07 — Leave-rule resolver.
 *
 * Resolves the most-specific active leave rule line for
 *   (person, absenceTypeCode, asOf)
 * using the precedence:
 *
 *    nationality_category match  (UAE_NATIONAL > GCC_NATIONAL > EXPAT)
 *      ↳ entity_type match       (legalEntities.entityType)
 *           ↳ employment_type match (FULL_TIME / PART_TIME)
 *                ↳ ALL fallback
 *                     ↳ DEFAULT (code-level baseline below)
 *
 * The resolver assumes every persisted leave rule was validated against the
 * UAE statutory minimum at write time (Hard Rule 11 — `assertLeaveRuleNotBelowMinimum`).
 *
 * BR-AL-001  — Annual leave ≥ 22 days minimum (CONFIGURATION_FRAMEWORK.md §5).
 * BR-AL-002  — Leave is in calendar days, calendar month = 30 days.
 * BR-SL-001  — Sick leave: 15 full-pay / 30 half-pay / 45 unpaid (90 total).
 * BR-ML-001  — Maternity leave: 60 days (45 full + 15 half) + 45 unpaid extension.
 * BR-ML-003  — Maternity: termination prohibited during leave (caller enforced).
 * BR-PL-001  — Paternity leave: 5 working days, 6-month window from birth.
 * BR-HJ-001  — Hajj leave: 30 unpaid days, once per employment.
 * BR-BL-001  — Bereavement: 5 days (spouse/child) / 3 days (other immediate family).
 * BR-STL-001 — Study leave: ≤ 10 days/year at employer's discretion.
 */
import { and, eq, lte, gte, isNull, or } from 'drizzle-orm'
import { db } from './db'
import { leaveRuleSets, leaveRuleLines, persons, legalEntities } from '@/drizzle/schema'
import { TENANT_ID } from './constants'
import { todayUae } from './effective-date'

// ─── Statutory baselines (BR-AL-001 / BR-SL-001 / BR-ML-001 / BR-STL-001) ───
// These are the *non-negotiable floors* the system applies when no
// configured rule line is found. They mirror UAE FDL 33/2021 Articles 27–33.

export interface EntitlementTier {
  minServiceMonths: number
  maxServiceMonths: number | null
  daysEntitled:     number
}

export interface ResolvedLeaveRule {
  ruleSetId:            string | null  // null = served from DEFAULT_LINES
  ruleSetCode:          string
  absenceTypeCode:      string
  entitlementTiers:     EntitlementTier[]
  maxCarryForwardDays:  number
  carryForwardExpiryMonths: number
  isProRated:           boolean
  accrualFrequency:     'MONTHLY' | 'DAILY' | 'ANNUALLY'
  minServiceMonths:     number
  maxDaysPerYear:       number | null
  encashmentAllowed:    boolean
  encashmentMaxDays:    number | null
  source:               'DB' | 'DEFAULT'
}

const DEFAULT_LINES: Record<string, Omit<ResolvedLeaveRule, 'ruleSetId' | 'source'>> = {
  // BR-AL-001 — annual leave: 22-day floor for the system, 30 days at ≥1y service.
  ANNUAL: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'ANNUAL',
    entitlementTiers: [
      { minServiceMonths: 0,  maxServiceMonths: 6,  daysEntitled: 0 },   // probation
      { minServiceMonths: 6,  maxServiceMonths: 12, daysEntitled: 24 },  // 2 days/month × 12
      { minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 30 },
    ],
    maxCarryForwardDays:      22,
    carryForwardExpiryMonths: 24,  // BR-AL-003 — 2-year postponement window
    isProRated:               true,
    accrualFrequency:         'MONTHLY',
    minServiceMonths:         0,
    maxDaysPerYear:           30,
    encashmentAllowed:        true,  // BR-AL-004
    encashmentMaxDays:        30,
  },
  // BR-SL-001 — 15 full / 30 half / 45 unpaid → total 90 days.
  SICK: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'SICK',
    entitlementTiers: [
      { minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 90 },
    ],
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         6,    // post-probation only (BR-SL-001)
    maxDaysPerYear:           90,
    encashmentAllowed:        false,
    encashmentMaxDays:        null,
  },
  // BR-ML-001 — maternity: 60 days (45 full + 15 half), + optional 45 unpaid.
  MATERNITY: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'MATERNITY',
    entitlementTiers: [
      { minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 60 },
    ],
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         0,
    maxDaysPerYear:           60,
    encashmentAllowed:        false,
    encashmentMaxDays:        null,
  },
  // BR-PL-001 — paternity: 5 working days within 6 months of birth.
  PATERNITY: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'PATERNITY',
    entitlementTiers: [
      { minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 5 },
    ],
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         0,
    maxDaysPerYear:           5,
    encashmentAllowed:        false,
    encashmentMaxDays:        null,
  },
  // BR-STL-001 — study leave: 10 days/year, employer discretion.
  STUDY: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'STUDY',
    entitlementTiers: [
      { minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 10 },
    ],
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         12,
    maxDaysPerYear:           10,
    encashmentAllowed:        false,
    encashmentMaxDays:        null,
  },
  // BR-HJ-001 — Hajj leave: 30 unpaid days, once per employment.
  HAJJ: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'HAJJ',
    entitlementTiers: [
      { minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 30 },
    ],
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         0,
    maxDaysPerYear:           30,
    encashmentAllowed:        false,
    encashmentMaxDays:        null,
  },
  // BR-BL-001 — bereavement: spouse/child = 5; parent/sibling = 3. Pessimistic
  // floor (5) at the resolver — calling code differentiates by relationship.
  BEREAVEMENT: {
    ruleSetCode:        'UAE-DEFAULT',
    absenceTypeCode:    'BEREAVEMENT',
    entitlementTiers: [
      { minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 5 },
    ],
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         0,
    maxDaysPerYear:           5,
    encashmentAllowed:        false,
    encashmentMaxDays:        null,
  },
}

// Exported for unit-test access (do not consume from app code — go through
// resolveLeaveRuleSet so DB rules win when present).
export const _DEFAULT_LEAVE_LINES = DEFAULT_LINES

// ─── Pure scoring helpers (testable without a DB) ───────────────────────────

interface RuleSetCandidate {
  id:                   string
  ruleSetCode:          string
  legalEntityId:        string | null
  entityTypeScope:      string | null
  nationalityScope:     string | null
  employmentTypeScope:  string | null
  effectiveFrom:        string
  effectiveTo:          string | null
  isDefault:            boolean
}

export interface PersonContext {
  legalEntityId:       string
  entityType:          string | null   // MAINLAND | DIFC | ADGM | FREEZONE
  nationalityCategory: string          // UAE_NATIONAL | GCC_NATIONAL | EXPAT
  employmentType:      string          // FULL_TIME | PART_TIME | ...
}

/**
 * Higher score = better match. Returns -Infinity if the candidate's scope
 * conflicts with the person (e.g. a UAE_NATIONAL-only set against an EXPAT).
 *
 * Exported for unit tests — do not call from app code.
 */
export function scoreLeaveRuleSet(
  set: RuleSetCandidate,
  ctx: PersonContext,
): number {
  // Hard scope conflicts → not a candidate.
  if (set.legalEntityId && set.legalEntityId !== ctx.legalEntityId) return -Infinity
  if (set.nationalityScope && set.nationalityScope !== 'ALL'
        && set.nationalityScope !== ctx.nationalityCategory) return -Infinity
  if (set.entityTypeScope && ctx.entityType && set.entityTypeScope !== ctx.entityType) return -Infinity
  if (set.employmentTypeScope && set.employmentTypeScope !== 'ALL'
        && set.employmentTypeScope !== ctx.employmentType) return -Infinity

  let score = 0
  if (set.legalEntityId === ctx.legalEntityId)              score += 8
  if (set.nationalityScope && set.nationalityScope !== 'ALL') score += 4
  if (set.entityTypeScope)                                   score += 2
  if (set.employmentTypeScope && set.employmentTypeScope !== 'ALL') score += 1
  if (set.isDefault)                                          score += 0.5
  return score
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolves a single leave rule line for the given employee + absence type.
 * Returns the most specific match per `scoreLeaveRuleSet`, or the code-level
 * default (`DEFAULT_LINES[absenceTypeCode]`) when no DB rule covers it.
 */
export async function resolveLeaveRuleSet(
  personId:        string,
  absenceTypeCode: string,
  asOf:            string = todayUae(),
): Promise<ResolvedLeaveRule | null> {
  const [person] = await db
    .select({
      legalEntityId:       persons.legalEntityId,
      entityType:          legalEntities.entityType,
      nationalityCategory: persons.nationalityCategory,
      employmentType:      persons.employmentType,
    })
    .from(persons)
    .leftJoin(legalEntities, eq(persons.legalEntityId, legalEntities.id))
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)

  if (!person) return getDefault(absenceTypeCode)

  const ctx: PersonContext = {
    legalEntityId:       person.legalEntityId,
    entityType:          person.entityType ?? null,
    nationalityCategory: person.nationalityCategory,
    employmentType:      person.employmentType,
  }

  // Pull every active set effective on `asOf`. Phase 1 has at most ~10 rule
  // sets so we score them in memory rather than building one giant SQL CASE.
  //
  // S5-Q9 — N+1 deferred to Phase 2 (TD-09 cron poller). Today's interactive
  // callers issue one resolution per request (worst-case ~10 sets × 1 line
  // SELECT = 11 round-trips), which is acceptable at human latency. When
  // the monthly accrual cron lands and resolves rules across hundreds of
  // employees in a tight loop, this is the natural place to collapse to a
  // single LEFT JOIN with an in-SQL ORDER BY composite-rank expression.
  const sets = await db
    .select({
      id:                  leaveRuleSets.id,
      ruleSetCode:         leaveRuleSets.ruleSetCode,
      legalEntityId:       leaveRuleSets.legalEntityId,
      entityTypeScope:     leaveRuleSets.entityTypeScope,
      nationalityScope:    leaveRuleSets.nationalityScope,
      employmentTypeScope: leaveRuleSets.employmentTypeScope,
      effectiveFrom:       leaveRuleSets.effectiveFrom,
      effectiveTo:         leaveRuleSets.effectiveTo,
      isDefault:           leaveRuleSets.isDefault,
    })
    .from(leaveRuleSets)
    .where(
      and(
        eq(leaveRuleSets.tenantId, TENANT_ID),
        eq(leaveRuleSets.isActive, true),
        lte(leaveRuleSets.effectiveFrom, asOf),
        or(isNull(leaveRuleSets.effectiveTo), gte(leaveRuleSets.effectiveTo, asOf)),
      ),
    )

  const ranked = sets
    .map(s => ({ s, score: scoreLeaveRuleSet(s as RuleSetCandidate, ctx) }))
    .filter(r => r.score !== -Infinity)
    .sort((a, b) => b.score - a.score)

  for (const { s } of ranked) {
    const [line] = await db
      .select()
      .from(leaveRuleLines)
      .where(
        and(
          eq(leaveRuleLines.tenantId, TENANT_ID),
          eq(leaveRuleLines.leaveRuleSetId, s.id),
          eq(leaveRuleLines.absenceTypeCode, absenceTypeCode),
          eq(leaveRuleLines.isActive, true),
        ),
      )
      .limit(1)

    if (line) {
      return {
        ruleSetId:                s.id,
        ruleSetCode:              s.ruleSetCode,
        absenceTypeCode:          line.absenceTypeCode,
        entitlementTiers:         (line.entitlementTiersJson as EntitlementTier[]) ?? [],
        maxCarryForwardDays:      Number(line.maxCarryForwardDays),
        carryForwardExpiryMonths: line.carryForwardExpiryMonths,
        isProRated:               line.isProRated,
        accrualFrequency:         line.accrualFrequency as ResolvedLeaveRule['accrualFrequency'],
        minServiceMonths:         line.minServiceMonths,
        maxDaysPerYear:           line.maxDaysPerYear === null ? null : Number(line.maxDaysPerYear),
        encashmentAllowed:        line.encashmentAllowed,
        encashmentMaxDays:        line.encashmentMaxDays === null ? null : Number(line.encashmentMaxDays),
        source:                   'DB',
      }
    }
  }

  return getDefault(absenceTypeCode)
}

function getDefault(code: string): ResolvedLeaveRule | null {
  const def = DEFAULT_LINES[code]
  if (!def) return null
  return { ...def, ruleSetId: null, source: 'DEFAULT' }
}

/**
 * Returns the days-entitled value matching the given service-months tier.
 * When no tier matches (employee under the lowest minServiceMonths band),
 * returns 0.
 */
export function entitlementForService(
  rule:          Pick<ResolvedLeaveRule, 'entitlementTiers'>,
  serviceMonths: number,
): number {
  for (const tier of rule.entitlementTiers) {
    const aboveMin = serviceMonths >= tier.minServiceMonths
    const underMax = tier.maxServiceMonths === null || tier.maxServiceMonths === undefined
                     || serviceMonths < tier.maxServiceMonths
    if (aboveMin && underMax) return tier.daysEntitled
  }
  return 0
}
