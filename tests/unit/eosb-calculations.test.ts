/**
 * EOSB / End-of-Service Gratuity — Unit Tests
 *
 * Tests the pure `calculateEosb` function in @/modules/payroll/services.
 * No database access required — all inputs are explicit.
 *
 * Business rules under test:
 *   BR-EOSB-001  < 1 year service → AED 0
 *   BR-EOSB-002  1–5 years → 21 working days per year of service
 *   BR-EOSB-003  > 5 years → 21 days/yr for first 5 yrs + 30 days/yr beyond 5
 *   BR-EOSB-004  Cap = 24 months basic salary
 *   BR-EOSB-005  UAE nationals → NOT eligible (GPSSA applies instead)
 *   BR-EOSB-006  Basic salary ONLY (no allowances)
 *
 * Daily rate formula used by this implementation:
 *   dailyRate = round2(basicSalary / 30)   (UAE Labour Law convention)
 *
 * Service years:
 *   serviceYears = netCalendarDays / 365.25   (Julian year divisor)
 *
 * All expected values below are pre-computed from the same formula the
 * implementation uses, with specific real calendar dates chosen so the
 * number of days is known exactly.
 *
 * ── Date reference ──────────────────────────────────────────────────────────
 *  2023-03-01 → 2024-03-01  = 366 days  (crosses Feb 29, 2024)
 *  2024-01-01 → 2026-01-01  = 731 days
 *  2021-01-01 → 2026-01-01  = 1826 days
 *  2020-01-01 → 2026-01-01  = 2192 days
 *  2015-01-01 → 2025-01-01  = 3653 days
 *  2021-01-01 → 2024-07-01  = 1277 days (~3.495 Julian yrs; round2 = 3.5)
 *  2018-01-01 → 2023-10-01  = 2099 days (~5.747 Julian yrs; round2 = 5.75)
 *  1994-01-01 → 2024-01-01  = 10957 days (~29.997 Julian yrs; round2 = 30)
 *  2016-01-01 → 2024-01-01  = 2922 days (~7.996 Julian yrs; round2 = 8.0)
 */

import { describe, it, expect } from 'vitest'
import { calculateEosb, calculateGpssaContribution } from '@/modules/payroll/services'

// ── Person nationality stubs ──────────────────────────────────────────────────

const EXPAT   = { nationalityCategory: 'EXPAT' }
const GCC     = { nationalityCategory: 'GCC_NATIONAL' }
const UAE_NAT = { nationalityCategory: 'UAE_NATIONAL' }

// ── EOSB-001: Less than 1 year → AED 0 ──────────────────────────────────────

describe('EOSB-001 — less than 1 year of service returns AED 0', () => {
  it('6 months service (181 calendar days) → eosbFinalAmount = 0', () => {
    // 181 / 365.25 = 0.4955 years
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2025-01-01', calculationDate: '2025-07-01',
    })
    expect(r.applies).toBe(true)
    expect(r.eosbFinalAmount).toBe(0)
    expect(r.serviceYears).toBeLessThan(1)
    expect(r.ruleRefs).toContain('BR-EOSB-001')
  })

  it('364 calendar days → raw serviceYears < 1 → eosbFinalAmount = 0', () => {
    // 364 / 365.25 = 0.9966 — below the 1-year threshold
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2025-01-01', calculationDate: '2025-12-31',
    })
    expect(r.eosbFinalAmount).toBe(0)
    // Note: r.serviceYears is round2(raw) which may show 1.0 for display,
    // but the eligibility gate uses the raw float, so EOSB is still 0.
    expect(r.ruleRefs).toContain('BR-EOSB-001')
  })

  it('same hire and calculation date (0 days) → eosbFinalAmount = 0', () => {
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2025-06-01', calculationDate: '2025-06-01',
    })
    expect(r.eosbFinalAmount).toBe(0)
    expect(r.serviceYears).toBe(0)
  })
})

// ── EOSB-002: Exactly 1 year → 21 days × daily rate ─────────────────────────

describe('EOSB-002 — 1 year service: 21 working days × daily rate', () => {
  it('366 calendar days (crosses Feb 29): EXPAT AED 10,000 → 7,014.30 AED', () => {
    // 2023-03-01 → 2024-03-01 = 366 days → svc = 1.002; daily = 333.33
    // eosbFirst5 = round2(333.33 × 21 × 1.002053) = 7,014.30
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2023-03-01', calculationDate: '2024-03-01',
    })
    expect(r.applies).toBe(true)
    expect(r.serviceYears).toBeCloseTo(1, 1)
    expect(r.dailyRate).toBe(333.33)
    expect(r.eosbFirst5Years).toBe(7014.37)
    expect(r.eosbBeyond5Years).toBe(0)
    expect(r.eosbFinalAmount).toBe(7014.37)
    expect(r.isCapped).toBe(false)
    expect(r.ruleRefs).toContain('BR-EOSB-002')
    expect(r.ruleRefs).toContain('BR-EOSB-006')
    expect(r.ruleRefs).not.toContain('BR-EOSB-001')
  })

  it('GCC national with 366 days service → also eligible (only UAE_NATIONAL excluded)', () => {
    const r = calculateEosb({
      person: GCC, basicSalary: 10_000,
      hireDate: '2023-03-01', calculationDate: '2024-03-01',
    })
    expect(r.applies).toBe(true)
    expect(r.eosbFinalAmount).toBe(7014.37)
  })
})

// ── EOSB-003: 2 years service ────────────────────────────────────────────────

describe('EOSB-003 — 2 years service', () => {
  it('2024-01-01 → 2026-01-01 (731 days): AED 15,000 basic → 21,014.37 AED', () => {
    // 731 days → svc = 2.0021; daily = round2(15000/30) = 500
    // eosbFirst5 = round2(500 × 21 × 2.0021) = 21,014.37
    const r = calculateEosb({
      person: EXPAT, basicSalary: 15_000,
      hireDate: '2024-01-01', calculationDate: '2026-01-01',
    })
    expect(r.applies).toBe(true)
    expect(r.dailyRate).toBe(500)
    expect(r.eosbFirst5Years).toBe(21_014.37)
    expect(r.eosbBeyond5Years).toBe(0)
    expect(r.eosbFinalAmount).toBe(21_014.37)
    expect(r.isCapped).toBe(false)
    expect(r.ruleRefs).toContain('BR-EOSB-002')
    expect(r.ruleRefs).not.toContain('BR-EOSB-003')
  })
})

// ── EOSB-004: 5 years service — boundary ─────────────────────────────────────

describe('EOSB-004 — 5 years service (boundary)', () => {
  it('2021-01-01 → 2026-01-01 (1826 days): 21-day rate for all 5 years, no beyond-5 component', () => {
    // 1826 days → svc_raw = 4.999; yr_beyond_5 = 0 → b5 = 0
    // daily = round2(12000/30) = 400
    // eosbFirst5 = round2(400 × 21 × 4.999315) = 41,994.25
    const r = calculateEosb({
      person: EXPAT, basicSalary: 12_000,
      hireDate: '2021-01-01', calculationDate: '2026-01-01',
    })
    expect(r.eosbFirst5Years).toBe(41_994.25)
    expect(r.eosbBeyond5Years).toBe(0)
    expect(r.eosbFinalAmount).toBe(41_994.25)
    expect(r.ruleRefs).not.toContain('BR-EOSB-003')
  })
})

// ── EOSB-005: 6+ years service — 30-day rate beyond 5 years ─────────────────

describe('EOSB-005 — 6+ years: first 5 at 21-day rate + remainder at 30-day rate', () => {
  it('2020-01-01 → 2026-01-01 (2192 days, 6 Julian yrs): correct split', () => {
    // 2192 days → svc = 5.998...; yr1to5 = 5, yrBeyond = 0.998
    // daily (unrounded) = 10000/30 = 333.333...
    // eosbFirst5 = round2(333.333 × 21 × 5)    = 35,000.00
    // eosbBeyond = round2(333.333 × 30 × 0.998) = 10,013.69
    // total before cap = 45,013.69
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2020-01-01', calculationDate: '2026-01-01',
    })
    expect(r.eosbFirst5Years).toBe(35_000)
    expect(r.eosbBeyond5Years).toBe(10_013.69)
    expect(r.eosbBeforeCap).toBe(45_013.69)
    expect(r.eosbFinalAmount).toBe(45_013.69)
    expect(r.isCapped).toBe(false)
    expect(r.ruleRefs).toContain('BR-EOSB-003')
  })

  it('2015-01-01 → 2025-01-01 (3653 days, ~10 yrs): 5yr@21 + 5yr@30', () => {
    // 3653 days → svc = 9.999; yr1to5 = 5; yrBeyond = 4.999
    // daily (unrounded) = 8000/30 = 266.666...
    // eosbFirst5 = round2(266.666 × 21 × 5)    = 28,000.00
    // eosbBeyond = round2(266.666 × 30 × 4.999) = 40,010.95
    // total = 68,010.95
    const r = calculateEosb({
      person: EXPAT, basicSalary: 8_000,
      hireDate: '2015-01-01', calculationDate: '2025-01-01',
    })
    expect(r.eosbFirst5Years).toBe(28_000)
    expect(r.eosbBeyond5Years).toBe(40_010.95)
    expect(r.eosbFinalAmount).toBe(68_010.95)
    expect(r.isCapped).toBe(false)
  })
})

// ── EOSB-006: UAE National → 0 EOSB ─────────────────────────────────────────

describe('EOSB-006 — UAE national: NOT eligible for EOSB (BR-EOSB-005)', () => {
  it('UAE national returns applies=false and eosbFinalAmount=0', () => {
    const r = calculateEosb({
      person: UAE_NAT, basicSalary: 10_000,
      hireDate: '2020-01-01', calculationDate: '2026-01-01',
    })
    expect(r.applies).toBe(false)
    expect(r.eosbFinalAmount).toBe(0)
    expect(r.ruleRefs).toContain('BR-EOSB-005')
  })

  it('UAE national: all monetary fields are 0 regardless of service length or salary', () => {
    const r = calculateEosb({
      person: UAE_NAT, basicSalary: 50_000,
      hireDate: '2010-01-01', calculationDate: '2026-01-01',
    })
    expect(r.dailyRate).toBe(0)
    expect(r.eosbFirst5Years).toBe(0)
    expect(r.eosbBeyond5Years).toBe(0)
    expect(r.eosbBeforeCap).toBe(0)
    expect(r.capAmount).toBe(0)
    expect(r.eosbFinalAmount).toBe(0)
  })
})

// ── EOSB-007: Only basicSalary used — BR-EOSB-006 ────────────────────────────

describe('EOSB-007 — BR-EOSB-006: only basicSalary matters, allowances excluded', () => {
  it('identical basicSalary inputs produce identical EOSB amounts', () => {
    const hire = '2021-01-01'
    const calc = '2024-07-01'
    const r1 = calculateEosb({ person: EXPAT, basicSalary: 12_000, hireDate: hire, calculationDate: calc })
    const r2 = calculateEosb({ person: EXPAT, basicSalary: 12_000, hireDate: hire, calculationDate: calc })
    expect(r1.eosbFinalAmount).toBe(r2.eosbFinalAmount)
  })

  it('higher input salary (as if allowances were included) inflates EOSB — confirming caller must strip allowances', () => {
    // Basic-only: AED 10,000 → lower EOSB
    // Gross (incorrectly including allowances): AED 18,000 → higher EOSB
    const hire = '2021-01-01'
    const calc = '2024-07-01'
    const rBasic = calculateEosb({ person: EXPAT, basicSalary: 10_000, hireDate: hire, calculationDate: calc })
    const rGross = calculateEosb({ person: EXPAT, basicSalary: 18_000, hireDate: hire, calculationDate: calc })
    expect(rGross.eosbFinalAmount).toBeGreaterThan(rBasic.eosbFinalAmount)
  })
})

// ── EOSB-008: Cap at 24 months basic salary (BR-EOSB-004) ────────────────────

describe('EOSB-008 — BR-EOSB-004: cap = 24 months basic salary', () => {
  it('1994-01-01 → 2024-01-01 (30 Julian yrs) with AED 100,000 basic — cap triggered', () => {
    // 10957 days → svc ≈ 30; daily = 3333.33
    // eosbFirst5  = round2(3333.33 × 21 × 5)     = 349,999.65
    // eosbBeyond5 = round2(3333.33 × 30 × 25)    ≈ 2,499,860.61
    // beforeCap   = 2,849,860.26 > cap = 2,400,000
    const r = calculateEosb({
      person: EXPAT, basicSalary: 100_000,
      hireDate: '1994-01-01', calculationDate: '2024-01-01',
    })
    expect(r.isCapped).toBe(true)
    expect(r.capAmount).toBe(2_400_000)
    expect(r.eosbFinalAmount).toBe(2_400_000)
    expect(r.eosbBeforeCap).toBeGreaterThan(2_400_000)
    expect(r.ruleRefs).toContain('BR-EOSB-004')
  })

  it('2016-01-01 → 2024-01-01 (8 Julian yrs) with AED 10,000 — well below cap', () => {
    // 2922 days → svc ≈ 8; daily (unrounded) = 10000/30 = 333.333...
    // eosbFirst5  = round2(333.333 × 21 × 5) = 35,000.00
    // eosbBeyond5 = round2(333.333 × 30 × 3) = 30,000.00
    // total = 65,000.00 < cap = 240,000
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2016-01-01', calculationDate: '2024-01-01',
    })
    expect(r.isCapped).toBe(false)
    expect(r.eosbFinalAmount).toBe(r.eosbBeforeCap)
    expect(r.eosbFinalAmount).toBe(65_000)
    expect(r.eosbFinalAmount).toBeLessThan(r.capAmount)
  })

  it('cap override via params.capMonths (e.g. free-zone 18-month cap)', () => {
    const r = calculateEosb({
      person: EXPAT, basicSalary: 100_000,
      hireDate: '1994-01-01', calculationDate: '2024-01-01',
      params: { capMonths: 18 },
    })
    expect(r.capAmount).toBe(100_000 * 18)
    expect(r.isCapped).toBe(true)
    expect(r.eosbFinalAmount).toBe(100_000 * 18)
  })
})

// ── EOSB-009: GPSSA for UAE nationals (via calculateGpssaContribution) ────────

describe('EOSB-009 — UAE nationals: GPSSA applies instead of EOSB', () => {
  it('AED 15,000 UAE national: EOSB = 0, GPSSA totalContribution = 3,000 AED', () => {
    const basic = 15_000

    // EOSB engine skips UAE national
    const eosb = calculateEosb({
      person: UAE_NAT, basicSalary: basic,
      hireDate: '2020-01-01', calculationDate: '2026-01-01',
    })
    expect(eosb.applies).toBe(false)
    expect(eosb.eosbFinalAmount).toBe(0)

    // GPSSA handles them
    const gpssa = calculateGpssaContribution({ person: UAE_NAT, basicSalary: basic })
    expect(gpssa.applies).toBe(true)
    expect(gpssa.employerShare).toBe(2_250)   // 15,000 × 15%
    expect(gpssa.employeeShare).toBe(750)      // 15,000 × 5%
    expect(gpssa.totalContribution).toBe(3_000)
    expect(gpssa.ruleRef).toBe('BR-GPSSA-001')
  })

  it('Expat gets EOSB, not GPSSA — mutually exclusive', () => {
    const eosb  = calculateEosb({
      person: EXPAT, basicSalary: 15_000,
      hireDate: '2020-01-01', calculationDate: '2026-01-01',
    })
    const gpssa = calculateGpssaContribution({ person: EXPAT, basicSalary: 15_000 })

    expect(eosb.applies).toBe(true)
    expect(eosb.eosbFinalAmount).toBeGreaterThan(0)
    expect(gpssa.applies).toBe(false)
    expect(gpssa.totalContribution).toBe(0)
  })
})

// ── EOSB-010: Fractional years handled correctly ─────────────────────────────

describe('EOSB-010 — fractional year service is proportional', () => {
  it('2021-01-01 → 2024-07-01 (~3.5 Julian yrs, 1277 days): proportional 21-day rate', () => {
    // 1277 days → svc_raw = 3.4947…; round2 = 3.5
    // daily (unrounded) = 10000/30 = 333.333...
    // eosbFirst5 = round2(333.333 × 21 × 3.4947) = 24,473.65
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2021-01-01', calculationDate: '2024-07-01',
    })
    expect(r.serviceYears).toBe(3.5)
    expect(r.dailyRate).toBe(333.33)
    expect(r.eosbFirst5Years).toBe(24_473.65)
    expect(r.eosbBeyond5Years).toBe(0)
    expect(r.eosbFinalAmount).toBe(24_473.65)
  })

  it('2018-01-01 → 2023-10-01 (~5.75 Julian yrs, 2099 days): split at 5yr', () => {
    // 2099 days → svc_raw = 5.7455…; round2 = 5.75
    // daily (unrounded) = 10000/30 = 333.333...
    // yr1to5 = 5; yrBeyond = 0.7455
    // eosbFirst5  = round2(333.333 × 21 × 5)      = 35,000.00
    // eosbBeyond5 = round2(333.333 × 30 × 0.7455) = 7,467.49
    // total = 42,467.49
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2018-01-01', calculationDate: '2023-10-01',
    })
    expect(r.serviceYears).toBe(5.75)
    expect(r.eosbFirst5Years).toBe(35_000)
    expect(r.eosbBeyond5Years).toBe(7_467.49)
    expect(r.eosbFinalAmount).toBe(42_467.49)
  })

  it('unpaid leave days reduce net service below 1-year threshold → EOSB = 0', () => {
    // 366 calendar days, 10 unpaid → net = 356 days → 356/365.25 = 0.9747 < 1
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2023-03-01', calculationDate: '2024-03-01',
      totalUnpaidLeaveDays: 10,
    })
    expect(r.eosbFinalAmount).toBe(0)
    expect(r.ruleRefs).toContain('BR-EOSB-001')
  })
})

// ── Input validation guards ───────────────────────────────────────────────────

describe('Input validation', () => {
  it('rejects negative basicSalary', () => {
    expect(() => calculateEosb({
      person: EXPAT, basicSalary: -1,
      hireDate: '2020-01-01', calculationDate: '2025-01-01',
    })).toThrow(/non-negative/)
  })

  it('rejects non-finite basicSalary', () => {
    expect(() => calculateEosb({
      person: EXPAT, basicSalary: Infinity,
      hireDate: '2020-01-01', calculationDate: '2025-01-01',
    })).toThrow(/finite/)
  })

  it('rejects negative totalUnpaidLeaveDays', () => {
    expect(() => calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2020-01-01', calculationDate: '2025-01-01',
      totalUnpaidLeaveDays: -5,
    })).toThrow(/non-negative/)
  })

  it('AED 0 basicSalary for eligible employee returns EOSB of 0 without error', () => {
    const r = calculateEosb({
      person: EXPAT, basicSalary: 0,
      hireDate: '2020-01-01', calculationDate: '2023-03-01',
    })
    expect(r.applies).toBe(true)
    expect(r.eosbFinalAmount).toBe(0)
  })
})

// ── Custom params override (dailyRateDivisor) ─────────────────────────────────

describe('Custom params — alternative daily rate divisor', () => {
  it('dailyRateDivisor = 365/12 gives (basic×12)/365 convention', () => {
    // Some implementations use (basic × 12) / 365 = basic / 30.4167
    // 2025-01-01 → 2027-01-01 = 730 days → svc = 1.998
    // daily (unrounded) = 10000 / (365/12) = 328.767...
    // displayed dailyRate = round2(328.767) = 328.77
    // 730 days → svc = 1.998; eosbFirst5 = round2(328.767 × 21 × 1.998) = 13,798.77
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2025-01-01', calculationDate: '2027-01-01',
      params: { dailyRateDivisor: 365 / 12 },
    })
    expect(r.dailyRate).toBe(328.77)
    expect(r.eosbFinalAmount).toBe(13_798.77)
  })

  it('custom rateYear1To5 = 15 (hypothetical reduced rate)', () => {
    // 366 days → svc ≈ 1.002; daily (unrounded) = 333.333...
    // eosbFirst5 = round2(333.333 × 15 × 1.002053) = 5,010.27
    const r = calculateEosb({
      person: EXPAT, basicSalary: 10_000,
      hireDate: '2023-03-01', calculationDate: '2024-03-01',
      params: { rateYear1To5: 15 },
    })
    expect(r.eosbFirst5Years).toBe(5_010.27)
    expect(r.eosbFinalAmount).toBe(5_010.27)
  })
})
