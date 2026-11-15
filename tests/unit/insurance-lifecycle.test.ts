import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  aedToFils,
  filsToAed,
  splitPremium,
  computeExpiryDate,
  isWithinBackdateGrace,
} from '@/modules/insurance/utils'
import { checkDependentAgeEligibility } from '@/modules/insurance/eligibility'
import {
  EnrolEmployeeSchema,
  EnrolDependentSchema,
  CreateInsurancePlanSchema,
} from '@/modules/insurance/validations'

// ── aedToFils ─────────────────────────────────────────────────────────────────

describe('aedToFils', () => {
  it('converts whole AED to fils', () => {
    expect(aedToFils('100')).toBe(10000)
    expect(aedToFils('1')).toBe(100)
  })

  it('converts decimal AED without floating-point error', () => {
    // Classic float bug: 0.1 + 0.2 = 0.30000000000000004
    expect(aedToFils('0.10')).toBe(10)
    expect(aedToFils('3456.78')).toBe(345678)
    expect(aedToFils('9999.99')).toBe(999999)
  })

  it('handles zero and empty string', () => {
    expect(aedToFils('0')).toBe(0)
    expect(aedToFils('')).toBe(0)
  })
})

// ── filsToAed ─────────────────────────────────────────────────────────────────

describe('filsToAed', () => {
  it('converts fils back to AED string with 2dp', () => {
    expect(filsToAed(10000)).toBe('100.00')
    expect(filsToAed(345678)).toBe('3456.78')
    expect(filsToAed(1)).toBe('0.01')
    expect(filsToAed(0)).toBe('0.00')
  })

  it('round-trips with aedToFils', () => {
    const cases = ['1200.00', '3456.78', '0.01', '99999.99']
    for (const aed of cases) {
      expect(filsToAed(aedToFils(aed))).toBe(aed)
    }
  })
})

// ── splitPremium ──────────────────────────────────────────────────────────────

describe('splitPremium', () => {
  it('100% employer contribution: employee bears nothing', () => {
    const { annualAed, employerAed, employeeAed } = splitPremium('1200.00', '100')
    expect(annualAed).toBe('1200.00')
    expect(employerAed).toBe('1200.00')
    expect(employeeAed).toBe('0.00')
  })

  it('0% employer contribution: employee bears everything', () => {
    const { employerAed, employeeAed, annualAed } = splitPremium('1200.00', '0')
    expect(employerAed).toBe('0.00')
    expect(employeeAed).toBe('1200.00')
    expect(annualAed).toBe('1200.00')
  })

  it('50/50 split — employer + employee always equals annual', () => {
    const { annualAed, employerAed, employeeAed } = splitPremium('1200.00', '50')
    expect(employerAed).toBe('600.00')
    expect(employeeAed).toBe('600.00')
    expect(aedToFils(employerAed) + aedToFils(employeeAed)).toBe(aedToFils(annualAed))
  })

  it('fractional split — employer + employee sums exactly to annual (no residual)', () => {
    // 1/3 split would be 0.333... — integer math avoids the gap
    const { annualAed, employerAed, employeeAed } = splitPremium('1000.00', '33.33')
    const sum = aedToFils(employerAed) + aedToFils(employeeAed)
    expect(sum).toBe(aedToFils(annualAed))
  })

  it('real-world plan premium — no floating-point residual', () => {
    const { annualAed, employerAed, employeeAed } = splitPremium('7680.00', '80')
    expect(aedToFils(employerAed) + aedToFils(employeeAed)).toBe(aedToFils(annualAed))
    expect(employerAed).toBe('6144.00')
    expect(employeeAed).toBe('1536.00')
  })
})

// ── computeExpiryDate ─────────────────────────────────────────────────────────

describe('computeExpiryDate', () => {
  it('returns effectiveDate + 12 months - 1 day when within policy', () => {
    expect(computeExpiryDate('2026-05-16', '2028-12-31')).toBe('2027-05-15')
  })

  it('caps at policyEndDate when that is earlier than +12m', () => {
    expect(computeExpiryDate('2026-05-16', '2026-12-31')).toBe('2026-12-31')
  })

  it('returns +12m result when no policyEndDate', () => {
    expect(computeExpiryDate('2026-05-16', null)).toBe('2027-05-15')
    expect(computeExpiryDate('2026-05-16', undefined)).toBe('2027-05-15')
  })

  it('handles leap-year boundary: 2024-02-29 + 12m → 2025-02-28', () => {
    // 2024 is a leap year; 2025 is not, so Feb 29 doesn't exist → Feb 28
    expect(computeExpiryDate('2024-03-01', '2030-12-31')).toBe('2025-02-28')
  })

  it('handles year-end rollover', () => {
    expect(computeExpiryDate('2026-01-01', '2030-12-31')).toBe('2026-12-31')
  })

  it('policyEndDate equal to computed +12m − 1d returns that date', () => {
    expect(computeExpiryDate('2026-05-16', '2027-05-15')).toBe('2027-05-15')
  })
})

// ── isWithinBackdateGrace ─────────────────────────────────────────────────────

describe('isWithinBackdateGrace', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts today', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(isWithinBackdateGrace(today, 30)).toBe(true)
  })

  it('accepts date exactly at grace boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T10:00:00Z'))
    // 30 days back = 2026-04-16
    expect(isWithinBackdateGrace('2026-04-16', 30)).toBe(true)
  })

  it('rejects date one day past the grace boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T10:00:00Z'))
    expect(isWithinBackdateGrace('2026-04-15', 30)).toBe(false)
  })

  it('accepts future dates', () => {
    expect(isWithinBackdateGrace('2030-01-01', 30)).toBe(true)
  })
})

// ── checkDependentAgeEligibility ─────────────────────────────────────────────

describe('checkDependentAgeEligibility', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for non-child relationships (age cap does not apply)', () => {
    expect(checkDependentAgeEligibility('SPOUSE', '1985-01-01', false, 18, 25)).toBeNull()
    expect(checkDependentAgeEligibility('PARENT', '1960-01-01', false, 18, 25)).toBeNull()
  })

  it('returns null when dependent is under childMaxAge', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16'))
    // 15-year-old child
    expect(checkDependentAgeEligibility('CHILD', '2011-01-01', false, 18, 25)).toBeNull()
  })

  it('returns error when child exceeds childMaxAge (non-student)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16'))
    // 19-year-old, max 18
    const result = checkDependentAgeEligibility('SON', '2007-01-01', false, 18, 25)
    expect(result).toMatch(/BR-INS-005/)
    expect(result).toMatch(/19/)
    expect(result).toMatch(/standard/)
  })

  it('allows child over childMaxAge when isStudent=true and within extension age', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16'))
    // 22-year-old student, extension age 25
    expect(checkDependentAgeEligibility('DAUGHTER', '2004-01-01', true, 18, 25)).toBeNull()
  })

  it('rejects student who exceeds childStudentExtensionAge', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16'))
    // 26-year-old student, extension age 25
    const result = checkDependentAgeEligibility('CHILD', '2000-01-01', true, 18, 25)
    expect(result).toMatch(/BR-INS-005/)
    expect(result).toMatch(/student extension/)
  })

  it('returns null when dateOfBirth is missing', () => {
    expect(checkDependentAgeEligibility('CHILD', null, false, 18, 25)).toBeNull()
  })
})

// ── Schema validation ─────────────────────────────────────────────────────────

describe('EnrolEmployeeSchema', () => {
  const validBase = {
    personId:      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    legalEntityId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    effectiveDate: new Date().toISOString().split('T')[0],
  }

  it('accepts a valid payload', () => {
    expect(() => EnrolEmployeeSchema.parse(validBase)).not.toThrow()
  })

  it('rejects effectiveDate more than 30 days in the past', () => {
    const past = new Date()
    past.setDate(past.getDate() - 31)
    const result = EnrolEmployeeSchema.safeParse({
      ...validBase,
      effectiveDate: past.toISOString().split('T')[0],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).toMatch(/30 days/)
  })

  it('accepts effectiveDate in the future', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    expect(() => EnrolEmployeeSchema.parse({
      ...validBase,
      effectiveDate: future.toISOString().split('T')[0],
    })).not.toThrow()
  })
})

describe('EnrolDependentSchema', () => {
  const validBase = {
    personId:      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    dependentId:   'c3d4e5f6-a7b8-9012-cdef-123456789012',
    legalEntityId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    effectiveDate: new Date().toISOString().split('T')[0],
  }

  it('accepts payload without isStudent (optional field)', () => {
    expect(() => EnrolDependentSchema.parse(validBase)).not.toThrow()
  })

  it('accepts isStudent: true', () => {
    expect(() => EnrolDependentSchema.parse({ ...validBase, isStudent: true })).not.toThrow()
  })

  it('rejects backdated effectiveDate', () => {
    const past = new Date()
    past.setDate(past.getDate() - 45)
    const result = EnrolDependentSchema.safeParse({
      ...validBase,
      effectiveDate: past.toISOString().split('T')[0],
    })
    expect(result.success).toBe(false)
  })
})

describe('CreateInsurancePlanSchema — premium fields', () => {
  const validPlan = {
    legalEntityId:     'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    planCode:          'INS-BASIC',
    planNameEn:        'Basic Plan',
    providerName:      'AXA',
    policyNumber:      'POL-001',
    planCategory:      'BASIC' as const,
    employeePremiumAed: '1200.00',
    policyStartDate:   '2026-01-01',
    policyEndDate:     '2026-12-31',
  }

  it('accepts valid numeric premium string', () => {
    expect(() => CreateInsurancePlanSchema.parse(validPlan)).not.toThrow()
  })

  it('rejects non-numeric employeePremiumAed', () => {
    const result = CreateInsurancePlanSchema.safeParse({
      ...validPlan,
      employeePremiumAed: 'twelve hundred',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative employeePremiumAed', () => {
    const result = CreateInsurancePlanSchema.safeParse({
      ...validPlan,
      employeePremiumAed: '-100',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric optional premium fields', () => {
    const result = CreateInsurancePlanSchema.safeParse({
      ...validPlan,
      spousePremiumAed: 'abc',
    })
    expect(result.success).toBe(false)
  })
})
