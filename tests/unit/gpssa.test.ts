import { describe, it, expect } from 'vitest'
import { calculateGpssaContribution } from '@/modules/payroll/services'

describe('calculateGpssaContribution — BR-GPSSA-001', () => {
  it('UAE national: 15% employer + 5% employee on AED 10,000 basic', () => {
    const r = calculateGpssaContribution({
      person:      { nationalityCategory: 'UAE_NATIONAL' },
      basicSalary: 10_000,
    })
    expect(r.applies).toBe(true)
    expect(r.employerShare).toBe(1500)
    expect(r.employeeShare).toBe(500)
    expect(r.totalContribution).toBe(2000)
    expect(r.ruleRef).toBe('BR-GPSSA-001')
  })

  it('GCC national: not eligible — all zeros', () => {
    const r = calculateGpssaContribution({
      person:      { nationalityCategory: 'GCC_NATIONAL' },
      basicSalary: 25_000,
    })
    expect(r.applies).toBe(false)
    expect(r.employerShare).toBe(0)
    expect(r.employeeShare).toBe(0)
    expect(r.totalContribution).toBe(0)
  })

  it('Expat: not eligible — all zeros (BR-EOSB-004 routes them via gratuity)', () => {
    const r = calculateGpssaContribution({
      person:      { nationalityCategory: 'EXPAT' },
      basicSalary: 18_500,
    })
    expect(r.applies).toBe(false)
    expect(r.totalContribution).toBe(0)
  })

  it('rounds AED to 2 dp on fractional salary', () => {
    // 12_345.67 × 0.15 = 1851.8505 → 1851.85
    // 12_345.67 × 0.05 = 617.2835  → 617.28
    const r = calculateGpssaContribution({
      person:      { nationalityCategory: 'UAE_NATIONAL' },
      basicSalary: 12_345.67,
    })
    expect(r.employerShare).toBe(1851.85)
    expect(r.employeeShare).toBe(617.28)
    expect(r.totalContribution).toBe(2469.13)
  })

  it('zero basic salary returns zero contributions for an eligible person', () => {
    const r = calculateGpssaContribution({
      person:      { nationalityCategory: 'UAE_NATIONAL' },
      basicSalary: 0,
    })
    expect(r.applies).toBe(true)
    expect(r.totalContribution).toBe(0)
  })

  it('rejects negative basic salary', () => {
    expect(() => calculateGpssaContribution({
      person:      { nationalityCategory: 'UAE_NATIONAL' },
      basicSalary: -100,
    })).toThrow(/non-negative/i)
  })

  it('rejects non-finite basic salary', () => {
    expect(() => calculateGpssaContribution({
      person:      { nationalityCategory: 'UAE_NATIONAL' },
      basicSalary: Number.POSITIVE_INFINITY,
    })).toThrow(/finite/i)
  })
})
