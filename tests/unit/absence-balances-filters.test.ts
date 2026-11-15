import { describe, it, expect } from 'vitest'
import {
  computePlanExpiryISO,
  isExpiringSoon,
  deriveBalanceStatus,
  deriveCarryForwardStatus,
  BalancesSearchSchema,
  buildBalanceConditions,
  EXPIRING_SOON_DAYS,
} from '@/app/(hr-admin)/absence/balances/filters'

describe('computePlanExpiryISO (Phase 1 plan-level approximation)', () => {
  it('returns null when the plan never expires (months <= 0)', () => {
    expect(computePlanExpiryISO(2026, 0)).toBeNull()
    expect(computePlanExpiryISO(2026, -3)).toBeNull()
  })

  it('returns null for out-of-range years', () => {
    expect(computePlanExpiryISO(1999, 12)).toBeNull()
    expect(computePlanExpiryISO(2101, 12)).toBeNull()
  })

  it('anchors to Jan 1 of the balance year + N months (UTC)', () => {
    // 12 months from 2026-01-01 → 2027-01-01
    expect(computePlanExpiryISO(2026, 12)).toBe('2027-01-01')
    // 24 months (BR-AL-003 default) → 2028-01-01
    expect(computePlanExpiryISO(2026, 24)).toBe('2028-01-01')
    // 6 months → 2026-07-01
    expect(computePlanExpiryISO(2026, 6)).toBe('2026-07-01')
  })
})

describe('isExpiringSoon (90-day window)', () => {
  const today = '2026-06-05'

  it('is false when nothing is carried', () => {
    expect(isExpiringSoon(0, 0, '2026-07-01', today)).toBe(false)
  })

  it('is false when already forfeited', () => {
    expect(isExpiringSoon(5, 3, '2026-07-01', today)).toBe(false)
  })

  it('is false when there is no expiry (never expires)', () => {
    expect(isExpiringSoon(5, 0, null, today)).toBe(false)
  })

  it('is true when expiry is within 90 days', () => {
    expect(isExpiringSoon(5, 0, '2026-07-01', today)).toBe(true) // ~26 days out
  })

  it('is false when expiry is beyond 90 days', () => {
    expect(isExpiringSoon(5, 0, '2026-12-01', today)).toBe(false)
  })

  it('is false when expiry is already in the past', () => {
    expect(isExpiringSoon(5, 0, '2026-01-01', today)).toBe(false)
  })

  it('boundary: exactly 90 days out is still expiring', () => {
    const horizon = new Date(`${today}T00:00:00Z`)
    horizon.setUTCDate(horizon.getUTCDate() + EXPIRING_SOON_DAYS)
    expect(isExpiringSoon(5, 0, horizon.toISOString().slice(0, 10), today)).toBe(true)
  })
})

describe('deriveBalanceStatus', () => {
  const today = '2026-06-05'

  it('returns null for not-yet-computed closing', () => {
    expect(deriveBalanceStatus({ closingBalanceDays: null, carriedForwardDays: 0, forfeitedDays: 0, expiryISO: null, todayISO: today })).toBeNull()
  })

  it('classifies positive / negative / zero', () => {
    expect(deriveBalanceStatus({ closingBalanceDays: 12, carriedForwardDays: 0, forfeitedDays: 0, expiryISO: null, todayISO: today })).toBe('positive')
    expect(deriveBalanceStatus({ closingBalanceDays: -2, carriedForwardDays: 0, forfeitedDays: 0, expiryISO: null, todayISO: today })).toBe('negative')
    expect(deriveBalanceStatus({ closingBalanceDays: 0, carriedForwardDays: 0, forfeitedDays: 0, expiryISO: null, todayISO: today })).toBe('zero')
  })

  it('prefers Expiring Soon over Positive', () => {
    expect(deriveBalanceStatus({ closingBalanceDays: 12, carriedForwardDays: 5, forfeitedDays: 0, expiryISO: '2026-07-01', todayISO: today })).toBe('expiring')
  })
})

describe('deriveCarryForwardStatus', () => {
  const today = '2026-06-05'

  it('Expired when forfeited', () => {
    expect(deriveCarryForwardStatus({ carriedForwardDays: 0, forfeitedDays: 4, expiryISO: null, todayISO: today })).toBe('expired')
  })

  it('Not Eligible when nothing carried', () => {
    expect(deriveCarryForwardStatus({ carriedForwardDays: 0, forfeitedDays: 0, expiryISO: null, todayISO: today })).toBe('not_eligible')
  })

  it('Eligible when carried and never expires', () => {
    expect(deriveCarryForwardStatus({ carriedForwardDays: 5, forfeitedDays: 0, expiryISO: null, todayISO: today })).toBe('eligible')
  })

  it('Eligible when carried and expiry is still future', () => {
    expect(deriveCarryForwardStatus({ carriedForwardDays: 5, forfeitedDays: 0, expiryISO: '2026-12-01', todayISO: today })).toBe('eligible')
  })

  it('Not Eligible when carried but expiry already passed', () => {
    expect(deriveCarryForwardStatus({ carriedForwardDays: 5, forfeitedDays: 0, expiryISO: '2026-01-01', todayISO: today })).toBe('not_eligible')
  })
})

describe('BalancesSearchSchema', () => {
  it('parses a full valid filter set', () => {
    const r = BalancesSearchSchema.safeParse({
      year: '2026',
      entityId: '00000000-0000-0000-0000-000000000001',
      typeId: '00000000-0000-0000-0000-000000000002',
      departmentId: '00000000-0000-0000-0000-000000000003',
      projectId: '00000000-0000-0000-0000-000000000004',
      q: 'ahmed',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'expiring',
      cf: 'eligible',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.year).toBe(2026)
      expect(r.data.departmentId).toBe('00000000-0000-0000-0000-000000000003')
      expect(r.data.projectId).toBe('00000000-0000-0000-0000-000000000004')
      expect(r.data.status).toBe('expiring')
      expect(r.data.cf).toBe('eligible')
    }
  })

  it('drops a non-uuid departmentId/projectId via catch', () => {
    const r = BalancesSearchSchema.safeParse({ departmentId: 'not-a-uuid', projectId: '123' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.departmentId).toBeUndefined()
      expect(r.data.projectId).toBeUndefined()
    }
  })

  it('drops invalid enum values via catch (does not throw)', () => {
    const r = BalancesSearchSchema.safeParse({ status: 'bogus', cf: 'nope', year: 'abc' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.status).toBeUndefined()
      expect(r.data.cf).toBeUndefined()
      expect(r.data.year).toBeUndefined()
    }
  })

  it('rejects malformed dates by dropping them', () => {
    const r = BalancesSearchSchema.safeParse({ startDate: '06/05/2026' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.startDate).toBeUndefined()
  })
})

describe('buildBalanceConditions — Department/Project + RBAC', () => {
  const ENT = '11111111-1111-1111-1111-111111111111'
  const DEPT = '22222222-2222-2222-2222-222222222222'
  const PROJ = '33333333-3333-3333-3333-333333333333'

  it('adds an EXISTS(worker_assignments) condition when a department is set', () => {
    const before = buildBalanceConditions({ year: 2026 }, null).length
    const after = buildBalanceConditions({ year: 2026, departmentId: DEPT }, null).length
    expect(after).toBe(before + 1)
  })

  it('adds exactly one EXISTS condition when BOTH department and project are set (single subquery, de-dup)', () => {
    const base = buildBalanceConditions({ year: 2026 }, null).length
    const both = buildBalanceConditions({ year: 2026, departmentId: DEPT, projectId: PROJ }, null).length
    expect(both).toBe(base + 1)
  })

  it('pins to scopedEntityId and ignores a supplied entityId for non-SUPER_ADMIN', () => {
    // With a scoped (non-super) entity, the entity condition count must be the
    // same whether or not a rogue entityId is supplied — proving it is ignored.
    const pinned = buildBalanceConditions({ year: 2026 }, ENT).length
    const withRogue = buildBalanceConditions({ year: 2026, entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, ENT).length
    expect(withRogue).toBe(pinned)
  })

  it('SUPER_ADMIN (null scope) honors a supplied entityId', () => {
    const none = buildBalanceConditions({ year: 2026 }, null).length
    const withEntity = buildBalanceConditions({ year: 2026, entityId: ENT }, null).length
    expect(withEntity).toBe(none + 1)
  })
})
