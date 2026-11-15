import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

/**
 * S5-04 / S5-07 — Leave-rule resolver pure-helper tests.
 *
 * Coverage:
 *   • scoreLeaveRuleSet — precedence (nationality > entity_type > employment_type > ALL)
 *   • _DEFAULT_LEAVE_LINES — UAE statutory floors are baked in correctly
 *     (BR-AL-001 / BR-AL-002 / BR-SL-001 / BR-ML-001 / BR-PL-001 / BR-HJ-001
 *      / BR-BL-001 / BR-STL-001)
 *   • entitlementForService — service-tier lookup
 *
 * The DB-touching `resolveLeaveRuleSet` is exercised through the integration
 * tests for absence Server Actions (it joins persons + legalEntities).
 */
const {
  scoreLeaveRuleSet,
  entitlementForService,
  _DEFAULT_LEAVE_LINES,
} = await import('@/lib/leave-rule-resolver')
import type { PersonContext } from '@/lib/leave-rule-resolver'

const expatCtx: PersonContext = {
  legalEntityId:       'entity-1',
  entityType:          'MAINLAND',
  nationalityCategory: 'EXPAT',
  employmentType:      'FULL_TIME',
}

const uaeNationalCtx: PersonContext = {
  ...expatCtx,
  nationalityCategory: 'UAE_NATIONAL',
}

describe('scoreLeaveRuleSet — precedence (S5-04)', () => {
  it('exact-entity rule beats global rule', () => {
    const exact = {
      id: 'a', ruleSetCode: 'A', legalEntityId: 'entity-1',
      entityTypeScope: null, nationalityScope: 'ALL',
      employmentTypeScope: 'ALL', effectiveFrom: '2026-01-01',
      effectiveTo: null, isDefault: false,
    }
    const global = {
      ...exact, id: 'b', ruleSetCode: 'B', legalEntityId: null,
    }
    expect(scoreLeaveRuleSet(exact, expatCtx)).toBeGreaterThan(scoreLeaveRuleSet(global, expatCtx))
  })

  it('UAE_NATIONAL-scope rule beats ALL-scope rule for a UAE national', () => {
    const uae = {
      id: 'a', ruleSetCode: 'A', legalEntityId: null,
      entityTypeScope: null, nationalityScope: 'UAE_NATIONAL',
      employmentTypeScope: 'ALL', effectiveFrom: '2026-01-01',
      effectiveTo: null, isDefault: false,
    }
    const all = {
      ...uae, id: 'b', ruleSetCode: 'B', nationalityScope: 'ALL',
    }
    expect(scoreLeaveRuleSet(uae, uaeNationalCtx))
      .toBeGreaterThan(scoreLeaveRuleSet(all, uaeNationalCtx))
  })

  it('UAE_NATIONAL-scope rule is invalid for an EXPAT (-Infinity)', () => {
    const uae = {
      id: 'a', ruleSetCode: 'A', legalEntityId: null,
      entityTypeScope: null, nationalityScope: 'UAE_NATIONAL',
      employmentTypeScope: 'ALL', effectiveFrom: '2026-01-01',
      effectiveTo: null, isDefault: false,
    }
    expect(scoreLeaveRuleSet(uae, expatCtx)).toBe(-Infinity)
  })

  it('entity-type mismatch is invalid (-Infinity)', () => {
    const difc = {
      id: 'a', ruleSetCode: 'A', legalEntityId: null,
      entityTypeScope: 'DIFC', nationalityScope: 'ALL',
      employmentTypeScope: 'ALL', effectiveFrom: '2026-01-01',
      effectiveTo: null, isDefault: false,
    }
    expect(scoreLeaveRuleSet(difc, expatCtx)).toBe(-Infinity)
  })

  it('PART_TIME rule is invalid for FULL_TIME employee', () => {
    const pt = {
      id: 'a', ruleSetCode: 'A', legalEntityId: null,
      entityTypeScope: null, nationalityScope: 'ALL',
      employmentTypeScope: 'PART_TIME', effectiveFrom: '2026-01-01',
      effectiveTo: null, isDefault: false,
    }
    expect(scoreLeaveRuleSet(pt, expatCtx)).toBe(-Infinity)
  })

  it('isDefault adds a tiny score boost (tiebreaker)', () => {
    const a = {
      id: 'a', ruleSetCode: 'A', legalEntityId: null,
      entityTypeScope: null, nationalityScope: 'ALL',
      employmentTypeScope: 'ALL', effectiveFrom: '2026-01-01',
      effectiveTo: null, isDefault: true,
    }
    const b = { ...a, id: 'b', isDefault: false }
    expect(scoreLeaveRuleSet(a, expatCtx)).toBeGreaterThan(scoreLeaveRuleSet(b, expatCtx))
  })

  // GAP-M03 FIX (FIX-S9-03) — DIFC entitlements differ from mainland.
  // BR-DIFC-005: DIFC Employment Law 2019, ANNUAL = 20 working days,
  // MATERNITY = 65 working days, SICK = 60 days (10/20/30).
  it('DIFC-scoped rule wins over mainland default for a DIFC entity', () => {
    const difcCtx: PersonContext = {
      legalEntityId:       'difc-entity-1',
      entityType:          'DIFC',
      nationalityCategory: 'EXPAT',
      employmentType:      'FULL_TIME',
    }
    const difcRule = {
      id: 'a', ruleSetCode: 'UAE-DIFC-2019', legalEntityId: null,
      entityTypeScope: 'DIFC', nationalityScope: 'ALL',
      employmentTypeScope: 'ALL', effectiveFrom: '2019-08-28',
      effectiveTo: null, isDefault: false,
    }
    const mainlandRule = {
      id: 'b', ruleSetCode: 'UAE-MAINLAND-2024', legalEntityId: null,
      entityTypeScope: 'MAINLAND', nationalityScope: 'ALL',
      employmentTypeScope: 'ALL', effectiveFrom: '2022-02-02',
      effectiveTo: null, isDefault: true,
    }
    expect(scoreLeaveRuleSet(difcRule, difcCtx))
      .toBeGreaterThan(scoreLeaveRuleSet(mainlandRule, difcCtx))
    expect(scoreLeaveRuleSet(mainlandRule, difcCtx)).toBe(-Infinity)
  })
})

describe('_DEFAULT_LEAVE_LINES — UAE statutory floors (S5-07)', () => {
  it('BR-AL-001 — annual leave reaches ≥30 days at ≥1y service', () => {
    const annual = _DEFAULT_LEAVE_LINES.ANNUAL
    const tier12mo = annual.entitlementTiers.find(t => t.minServiceMonths === 12)
    expect(tier12mo?.daysEntitled).toBeGreaterThanOrEqual(30)
  })

  it('BR-AL-001 — annual leave is ≥22 days minimum at every tier ≥1y service', () => {
    const annual = _DEFAULT_LEAVE_LINES.ANNUAL
    const above1y = annual.entitlementTiers.filter(t => t.minServiceMonths >= 12)
    for (const tier of above1y) {
      expect(tier.daysEntitled).toBeGreaterThanOrEqual(22)
    }
  })

  it('BR-AL-002 — annual leave maxDaysPerYear is 30', () => {
    expect(_DEFAULT_LEAVE_LINES.ANNUAL.maxDaysPerYear).toBe(30)
  })

  it('BR-SL-001 — sick leave totals 90 days', () => {
    expect(_DEFAULT_LEAVE_LINES.SICK.maxDaysPerYear).toBe(90)
    expect(_DEFAULT_LEAVE_LINES.SICK.entitlementTiers[0].daysEntitled).toBe(90)
  })

  it('BR-SL-001 — sick leave requires ≥6 months service', () => {
    expect(_DEFAULT_LEAVE_LINES.SICK.minServiceMonths).toBe(6)
  })

  it('BR-ML-001 — maternity leave is 60 days statutory', () => {
    expect(_DEFAULT_LEAVE_LINES.MATERNITY.maxDaysPerYear).toBe(60)
    expect(_DEFAULT_LEAVE_LINES.MATERNITY.entitlementTiers[0].daysEntitled).toBe(60)
  })

  it('BR-PL-001 — paternity leave is 5 days', () => {
    expect(_DEFAULT_LEAVE_LINES.PATERNITY.maxDaysPerYear).toBe(5)
  })

  it('BR-HJ-001 — Hajj leave is 30 days, once per employment (caller-enforced)', () => {
    expect(_DEFAULT_LEAVE_LINES.HAJJ.maxDaysPerYear).toBe(30)
  })

  it('BR-STL-001 — study leave is ≤10 days/year', () => {
    const study = _DEFAULT_LEAVE_LINES.STUDY
    expect(study.maxDaysPerYear).toBeLessThanOrEqual(10)
    expect(study.minServiceMonths).toBeGreaterThanOrEqual(12)
  })

  it('BR-BL-001 — bereavement floor is 5 days', () => {
    expect(_DEFAULT_LEAVE_LINES.BEREAVEMENT.maxDaysPerYear).toBe(5)
  })

  it('BR-AL-003 — annual leave carry-forward window is 24 months', () => {
    expect(_DEFAULT_LEAVE_LINES.ANNUAL.carryForwardExpiryMonths).toBe(24)
  })

  it('BR-AL-004 — annual leave allows encashment', () => {
    expect(_DEFAULT_LEAVE_LINES.ANNUAL.encashmentAllowed).toBe(true)
  })
})

describe('entitlementForService — tier lookup', () => {
  const annual = _DEFAULT_LEAVE_LINES.ANNUAL
  it('returns 0 below probation', () => {
    expect(entitlementForService(annual, 3)).toBe(0)
  })
  it('returns 24 between 6m and 12m service', () => {
    expect(entitlementForService(annual, 8)).toBe(24)
  })
  it('returns 30 at ≥12 months', () => {
    expect(entitlementForService(annual, 12)).toBe(30)
    expect(entitlementForService(annual, 60)).toBe(30)
  })

  it('returns 0 when no tier matches', () => {
    const rule = {
      entitlementTiers: [
        { minServiceMonths: 24, maxServiceMonths: null, daysEntitled: 5 },
      ],
    }
    expect(entitlementForService(rule, 12)).toBe(0)
  })
})
