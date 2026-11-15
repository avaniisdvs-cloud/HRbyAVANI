/**
 * Payroll Engine — Unit Tests (Sprint 11/12)
 *
 * Covers 10 functional areas:
 *  1. Salary calculation (gross, deductions, net)
 *  2. GPSSA deduction applied to UAE nationals only
 *  3. Suspension treatment reducing gross pay
 *  4. EOSB monthly provision calculation
 *  5. Variance flagging (BR-PAY-001)
 *  6. Run aggregation across multiple employees
 *  7. WPS staging validation (BR-WPS-001)
 *  8. DEWS contribution (BR-DIFC-003)
 *  9. YTD accumulator logic
 * 10. Payroll Zod validation schemas
 */

import { describe, it, expect } from 'vitest'
import {
  calculateEmployeePayroll,
  aggregateRunTotals,
  validateWpsRecords,
  calculateDewsContribution,
  computeYtd,
} from '@/modules/payroll/calculation-engine'
import {
  createPayrollRunSchema,
  payrollDefinitionSchema,
  salaryElementSchema,
  rejectPayrollRunSchema,
  wpsUpdateRecordSchema,
} from '@/modules/payroll/validations'
import type { PayrollEmployeeInput } from '@/modules/payroll/types'

// ── Base fixture — standard expat employee ───────────────────────────────────

function makeInput(overrides: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput {
  return {
    personId:             'person-uuid-001',
    assignmentId:         'asgn-uuid-001',
    nationalityCategory:  'EXPAT',
    assignmentStatus:     'ACTIVE',
    suspensionReason:     undefined,
    suspensionDays:       0,
    eosbScheme:           'TRADITIONAL',
    hireDate:             '2021-01-01',
    basicSalary:          10_000,
    housingAllowance:     3_000,
    transportAllowance:   1_000,
    otherAllowances:      500,
    overtimePay:          0,
    bonus:                0,
    sickLeaveDeduct:      0,
    unpaidLeaveDeduct:    0,
    salaryAdvanceDeduct:  0,
    medicalInsuranceDeduct: 0,
    otherDeductions:      0,
    priorMonthNetPay:     null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SALARY CALCULATION — GROSS, DEDUCTIONS, NET
// ─────────────────────────────────────────────────────────────────────────────

describe('1. Salary calculation — gross, deductions, net pay', () => {
  it('standard expat: gross = basic + housing + transport + other', () => {
    const r = calculateEmployeePayroll(makeInput())
    expect(r.basicSalary).toBe(10_000)
    expect(r.housingAllowance).toBe(3_000)
    expect(r.transportAllowance).toBe(1_000)
    expect(r.otherAllowances).toBe(500)
    expect(r.totalGrossPay).toBe(14_500)
  })

  it('includes overtime and bonus in gross pay', () => {
    const r = calculateEmployeePayroll(makeInput({ overtimePay: 1_200, bonus: 5_000 }))
    expect(r.totalGrossPay).toBe(14_500 + 1_200 + 5_000)
  })

  it('deductions reduce net pay correctly', () => {
    const r = calculateEmployeePayroll(makeInput({
      sickLeaveDeduct:      500,
      salaryAdvanceDeduct:  1_000,
      medicalInsuranceDeduct: 200,
    }))
    expect(r.totalDeductions).toBe(500 + 1_000 + 200)
    expect(r.netPay).toBe(r.totalGrossPay - r.totalDeductions)
  })

  it('net pay cannot go below zero — floor at 0', () => {
    const r = calculateEmployeePayroll(makeInput({
      basicSalary:         0,
      housingAllowance:    0,
      transportAllowance:  0,
      otherAllowances:     0,
      salaryAdvanceDeduct: 99_999,
    }))
    expect(r.netPay).toBe(0)
  })

  it('rounds all monetary amounts to 2 decimal places', () => {
    const r = calculateEmployeePayroll(makeInput({
      basicSalary:       10_333.333,
      housingAllowance:  3_166.666,
    }))
    expect(r.basicSalary.toString()).toMatch(/^\d+(\.\d{1,2})?$/)
    expect(r.totalGrossPay.toString()).toMatch(/^\d+(\.\d{1,2})?$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. GPSSA DEDUCTION — UAE NATIONALS ONLY (BR-GPSSA-001)
// ─────────────────────────────────────────────────────────────────────────────

describe('2. GPSSA deduction — UAE nationals only (BR-GPSSA-001)', () => {
  it('UAE national: 5% employee deduction applied to basic salary', () => {
    const r = calculateEmployeePayroll(makeInput({
      nationalityCategory: 'UAE_NATIONAL',
      basicSalary: 20_000,
    }))
    // Employee GPSSA: 20,000 × 5% = 1,000
    expect(r.gpssaEmployeeDeduct).toBe(1_000)
    expect(r.gpssaEmployerContrib).toBe(3_000) // 15%
    expect(r.ruleRefs).toContain('BR-GPSSA-001')
  })

  it('UAE national: GPSSA reduces net pay compared to expat with same salary', () => {
    const expat = calculateEmployeePayroll(makeInput({ nationalityCategory: 'EXPAT' }))
    const uae   = calculateEmployeePayroll(makeInput({ nationalityCategory: 'UAE_NATIONAL' }))
    expect(uae.netPay).toBeLessThan(expat.netPay)
    expect(uae.gpssaEmployeeDeduct).toBe(500) // 10,000 × 5%
  })

  it('expat: no GPSSA deduction or employer contribution', () => {
    const r = calculateEmployeePayroll(makeInput({ nationalityCategory: 'EXPAT' }))
    expect(r.gpssaEmployeeDeduct).toBe(0)
    expect(r.gpssaEmployerContrib).toBe(0)
    expect(r.ruleRefs).not.toContain('BR-GPSSA-001')
  })

  it('GCC national: no GPSSA deduction', () => {
    const r = calculateEmployeePayroll(makeInput({ nationalityCategory: 'GCC_NATIONAL' }))
    expect(r.gpssaEmployeeDeduct).toBe(0)
    expect(r.gpssaEmployerContrib).toBe(0)
  })

  it('GPSSA always uses unadjusted basic salary (not suspended-adjusted amount)', () => {
    // Even under half-pay suspension, GPSSA is on full basic
    const r = calculateEmployeePayroll(makeInput({
      nationalityCategory: 'UAE_NATIONAL',
      assignmentStatus:    'SUSPENDED',
      suspensionReason:    'INVESTIGATION',
      suspensionDays:      45,
      basicSalary:         10_000,
    }))
    // GPSSA uses original 10,000, not the half-pay 5,000
    expect(r.gpssaEmployeeDeduct).toBe(500) // 10,000 × 5%
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUSPENSION TREATMENT REDUCING GROSS PAY (BR-SUSP-001)
// ─────────────────────────────────────────────────────────────────────────────

describe('3. Suspension treatment — pay multiplier (BR-SUSP-001)', () => {
  it('ACTIVE employee receives full pay (multiplier = 1.0)', () => {
    const r = calculateEmployeePayroll(makeInput({ assignmentStatus: 'ACTIVE' }))
    expect(r.basicSalary).toBe(10_000)
    expect(r.housingAllowance).toBe(3_000)
    expect(r.suspensionTreatment).toBe('FULL_PAY')
  })

  it('DISCIPLINARY suspension: no pay (multiplier = 0)', () => {
    const r = calculateEmployeePayroll(makeInput({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'DISCIPLINARY',
      suspensionDays:   10,
    }))
    expect(r.basicSalary).toBe(0)
    expect(r.housingAllowance).toBe(0)
    expect(r.transportAllowance).toBe(0)
    expect(r.otherAllowances).toBe(0)
    expect(r.suspensionTreatment).toBe('NO_PAY')
  })

  it('INVESTIGATION ≤ 30 days: full pay', () => {
    const r = calculateEmployeePayroll(makeInput({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'INVESTIGATION',
      suspensionDays:   30,
    }))
    expect(r.basicSalary).toBe(10_000)
    expect(r.suspensionTreatment).toBe('FULL_PAY')
  })

  it('INVESTIGATION > 30 days: half pay (multiplier = 0.5)', () => {
    const r = calculateEmployeePayroll(makeInput({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'INVESTIGATION',
      suspensionDays:   31,
    }))
    expect(r.basicSalary).toBe(5_000)
    expect(r.housingAllowance).toBe(1_500)
    expect(r.transportAllowance).toBe(500)
    expect(r.suspensionTreatment).toBe('HALF_PAY')
  })

  it('overtime and bonus are NOT suspended (paid regardless)', () => {
    const r = calculateEmployeePayroll(makeInput({
      assignmentStatus: 'SUSPENDED',
      suspensionReason: 'DISCIPLINARY',
      suspensionDays:   10,
      overtimePay:      2_000,
      bonus:            5_000,
    }))
    expect(r.overtimePay).toBe(2_000)
    expect(r.bonus).toBe(5_000)
    // Net pay = overtime + bonus only (basic/allowances = 0)
    expect(r.netPay).toBe(7_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. EOSB MONTHLY PROVISION
// ─────────────────────────────────────────────────────────────────────────────

describe('4. EOSB monthly provision for TRADITIONAL/VSS schemes', () => {
  it('TRADITIONAL scheme employee with 3+ years service gets positive EOSB provision', () => {
    const r = calculateEmployeePayroll(makeInput({
      eosbScheme: 'TRADITIONAL',
      hireDate:   '2021-01-01',
      basicSalary: 10_000,
    }))
    // Hired 2021-01-01; >3 years of service by test date
    expect(r.eosbProvision).toBeGreaterThan(0)
    expect(r.ruleRefs.some(ref => ref.startsWith('BR-EOSB'))).toBe(true)
  })

  it('GPSSA scheme (UAE national): no EOSB provision', () => {
    const r = calculateEmployeePayroll(makeInput({
      eosbScheme:           'GPSSA',
      nationalityCategory:  'UAE_NATIONAL',
      hireDate:             '2021-01-01',
    }))
    expect(r.eosbProvision).toBe(0)
  })

  it('DEWS scheme: no EOSB provision (calculated separately at entity level)', () => {
    const r = calculateEmployeePayroll(makeInput({
      eosbScheme: 'DEWS',
      hireDate:   '2021-01-01',
    }))
    expect(r.eosbProvision).toBe(0)
  })

  it('expat with less than 1 year service: EOSB provision = 0 (BR-EOSB-001)', () => {
    const today = new Date()
    const hireDate = new Date(today)
    hireDate.setMonth(today.getMonth() - 6)
    const r = calculateEmployeePayroll(makeInput({
      eosbScheme:  'TRADITIONAL',
      hireDate:    hireDate.toISOString().slice(0, 10),
      basicSalary: 10_000,
    }))
    expect(r.eosbProvision).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. VARIANCE FLAGGING (BR-PAY-001)
// ─────────────────────────────────────────────────────────────────────────────

describe('5. Variance flagging — ≥20% change triggers flag (BR-PAY-001)', () => {
  it('no prior month: variance not flagged', () => {
    const r = calculateEmployeePayroll(makeInput({ priorMonthNetPay: null }))
    expect(r.isVarianceFlagged).toBe(false)
    expect(r.variancePct).toBeNull()
  })

  it('same as prior month: no flag', () => {
    // gross = 14,500; deductions = 0; net = 14,500
    const r = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 14_500 }))
    expect(r.isVarianceFlagged).toBe(false)
    expect(r.variancePct).toBe(0)
  })

  it('19% increase: not flagged (below threshold)', () => {
    // net = 14,500; prior = 14,500 / 1.19 ≈ 12,185
    const r = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 12_185 }))
    expect(r.isVarianceFlagged).toBe(false)
    expect(r.ruleRefs).not.toContain('BR-PAY-001')
  })

  it('exactly 20% increase: flagged (at threshold)', () => {
    // net = 14,500; prior = 14,500 / 1.20 = 12,083.33
    const r = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 12_083.33 }))
    expect(r.isVarianceFlagged).toBe(true)
    expect(r.ruleRefs).toContain('BR-PAY-001')
  })

  it('50% drop: flagged', () => {
    // net = 14,500; prior = 29,000 → delta = -50%
    const r = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 29_000 }))
    expect(r.isVarianceFlagged).toBe(true)
    expect(r.variancePct).toBeLessThan(-0.2)
    expect(r.ruleRefs).toContain('BR-PAY-001')
  })

  it('prior month = 0: variance not computed (division by zero guard)', () => {
    const r = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 0 }))
    expect(r.isVarianceFlagged).toBe(false)
    expect(r.variancePct).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. RUN AGGREGATION
// ─────────────────────────────────────────────────────────────────────────────

describe('6. aggregateRunTotals — multi-employee run totals', () => {
  it('empty result set returns all-zero totals with zero employee count', () => {
    const t = aggregateRunTotals([])
    expect(t.employeeCount).toBe(0)
    expect(t.totalGrossPay).toBe(0)
    expect(t.totalNetPay).toBe(0)
    expect(t.varianceAlerts).toBe(0)
  })

  it('sums gross pay across all employees', () => {
    const r1 = calculateEmployeePayroll(makeInput({ personId: 'p1', basicSalary: 10_000 }))
    const r2 = calculateEmployeePayroll(makeInput({ personId: 'p2', basicSalary: 20_000, housingAllowance: 5_000 }))
    const t = aggregateRunTotals([r1, r2])
    expect(t.employeeCount).toBe(2)
    expect(t.totalGrossPay).toBe(r1.totalGrossPay + r2.totalGrossPay)
    expect(t.totalNetPay).toBe(r1.netPay + r2.netPay)
  })

  it('counts variance alerts correctly', () => {
    // employee with big pay drop (flagged) + normal employee
    const flagged = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 29_000 })) // -50%
    const normal  = calculateEmployeePayroll(makeInput({ priorMonthNetPay: 14_500 })) // 0%
    const t = aggregateRunTotals([flagged, normal])
    expect(t.varianceAlerts).toBe(1)
  })

  it('sums GPSSA employer contributions from UAE national employees', () => {
    const expat = calculateEmployeePayroll(makeInput({ nationalityCategory: 'EXPAT' }))
    const uae   = calculateEmployeePayroll(makeInput({
      nationalityCategory: 'UAE_NATIONAL',
      basicSalary: 10_000,
    }))
    const t = aggregateRunTotals([expat, uae])
    expect(t.totalGpssaEmployer).toBe(1_500) // 10,000 × 15% from UAE national
  })

  it('total employer cost = netPay + GPSSA ER + EOSB provision (for basic expat)', () => {
    const r = calculateEmployeePayroll(makeInput())
    const t = aggregateRunTotals([r])
    expect(t.totalEmployerCost).toBe(r.totalEmployerCost)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. WPS STAGING VALIDATION (BR-WPS-001)
// ─────────────────────────────────────────────────────────────────────────────

describe('7. validateWpsRecords — WPS SIF validation (BR-WPS-001)', () => {
  const validRecord = {
    personId:           'person-001',
    fullNameEn:         'Ahmed Al Mansoori',
    iban:               'AE070331234567890123456',
    routingCode:        'NBAD',
    netPayAed:          14_500,
    employerLabourCode: 'MOL12345',
    employeeLabourCard: 'EMP98765',
  }

  it('valid record passes validation', () => {
    const result = validateWpsRecords([validRecord])
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('missing IBAN triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, iban: null }])
    expect(result.isValid).toBe(false)
    expect(result.errors[0].field).toBe('iban')
  })

  it('IBAN shorter than 15 characters triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, iban: 'AE12345' }])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.field === 'iban')).toBe(true)
  })

  it('missing routing code triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, routingCode: null }])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.field === 'routingCode')).toBe(true)
  })

  it('empty routing code triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, routingCode: '   ' }])
    expect(result.isValid).toBe(false)
  })

  it('missing employer labour code triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, employerLabourCode: null }])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.field === 'employerLabourCode')).toBe(true)
  })

  it('zero net pay triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, netPayAed: 0 }])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.field === 'netPayAed')).toBe(true)
  })

  it('negative net pay triggers error', () => {
    const result = validateWpsRecords([{ ...validRecord, netPayAed: -100 }])
    expect(result.isValid).toBe(false)
  })

  it('multiple employees: all errors collected', () => {
    const bad1 = { ...validRecord, personId: 'p1', iban: null }
    const bad2 = { ...validRecord, personId: 'p2', routingCode: null, netPayAed: 0 }
    const result = validateWpsRecords([bad1, bad2])
    expect(result.isValid).toBe(false)
    // bad1: 1 error (iban); bad2: 2 errors (routingCode + netPayAed)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('valid record includes a reference to BR-WPS-001 in error messages', () => {
    const result = validateWpsRecords([{ ...validRecord, iban: null }])
    expect(result.errors[0].message).toContain('BR-WPS-001')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. DEWS CONTRIBUTION (BR-DIFC-003)
// ─────────────────────────────────────────────────────────────────────────────

describe('8. calculateDewsContribution — DIFC DEWS (BR-DIFC-003)', () => {
  it('under 5 years: rate = 5.83% of basic salary', () => {
    const r = calculateDewsContribution(10_000, 3)
    expect(r.rate).toBe(0.0583)
    expect(r.amount).toBe(583)
    expect(r.serviceBand).toBe('UNDER_5_YEARS')
  })

  it('exactly 5 years: rate = 8.33% of basic salary', () => {
    const r = calculateDewsContribution(10_000, 5)
    expect(r.rate).toBe(0.0833)
    expect(r.amount).toBe(833)
    expect(r.serviceBand).toBe('5_YEARS_PLUS')
  })

  it('over 5 years: rate = 8.33%', () => {
    const r = calculateDewsContribution(10_000, 7)
    expect(r.rate).toBe(0.0833)
    expect(r.amount).toBe(833)
    expect(r.serviceBand).toBe('5_YEARS_PLUS')
  })

  it('rounds contribution to 2 decimal places', () => {
    // 15,333.33 × 5.83% = 893.93...
    const r = calculateDewsContribution(15_333.33, 2)
    expect(Number.isInteger(r.amount * 100)).toBe(true)
  })

  it('zero salary returns zero contribution', () => {
    const r = calculateDewsContribution(0, 3)
    expect(r.amount).toBe(0)
  })

  it('DEWS 5-year boundary: 4.99 years → UNDER_5_YEARS', () => {
    const r = calculateDewsContribution(10_000, 4.99)
    expect(r.serviceBand).toBe('UNDER_5_YEARS')
    expect(r.rate).toBe(0.0583)
  })

  it('high-salary executive: correct AED amount', () => {
    // 50,000 × 8.33% = 4,165
    const r = calculateDewsContribution(50_000, 6)
    expect(r.amount).toBe(4_165)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. YTD ACCUMULATOR LOGIC
// ─────────────────────────────────────────────────────────────────────────────

describe('9. computeYtd — year-to-date accumulation', () => {
  const zeroPrior = { ytdGrossPay: 0, ytdNetPay: 0, ytdEosbProvision: 0, ytdGpssa: 0 }

  it('first month: YTD equals current month values', () => {
    const current = { totalGrossPay: 14_500, netPay: 14_000, eosbProvision: 400, gpssaEmployeeDeduct: 0 }
    const ytd = computeYtd(zeroPrior, current)
    expect(ytd.ytdGrossPay).toBe(14_500)
    expect(ytd.ytdNetPay).toBe(14_000)
    expect(ytd.ytdEosbProvision).toBe(400)
    expect(ytd.ytdGpssa).toBe(0)
  })

  it('accumulates across multiple months', () => {
    const month1 = { totalGrossPay: 14_500, netPay: 14_000, eosbProvision: 400, gpssaEmployeeDeduct: 0 }
    const month2 = { totalGrossPay: 15_000, netPay: 14_500, eosbProvision: 400, gpssaEmployeeDeduct: 0 }

    const ytdAfterM1 = computeYtd(zeroPrior, month1)
    const ytdAfterM2 = computeYtd(ytdAfterM1, month2)

    expect(ytdAfterM2.ytdGrossPay).toBe(14_500 + 15_000)
    expect(ytdAfterM2.ytdNetPay).toBe(14_000 + 14_500)
    expect(ytdAfterM2.ytdEosbProvision).toBe(800)
  })

  it('accumulates GPSSA for UAE national employee', () => {
    const m1 = { totalGrossPay: 20_000, netPay: 18_500, eosbProvision: 0, gpssaEmployeeDeduct: 1_000 }
    const m2 = { totalGrossPay: 20_000, netPay: 18_500, eosbProvision: 0, gpssaEmployeeDeduct: 1_000 }
    const ytd = computeYtd(computeYtd(zeroPrior, m1), m2)
    expect(ytd.ytdGpssa).toBe(2_000)
  })

  it('result is rounded to 2 decimal places', () => {
    const m = { totalGrossPay: 10_333.333, netPay: 9_999.999, eosbProvision: 333.333, gpssaEmployeeDeduct: 0 }
    const ytd = computeYtd(zeroPrior, m)
    expect(String(ytd.ytdGrossPay)).toMatch(/^\d+(\.\d{1,2})?$/)
    expect(String(ytd.ytdNetPay)).toMatch(/^\d+(\.\d{1,2})?$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. ZOD VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

describe('10. Payroll Zod validation schemas', () => {
  // ── createPayrollRunSchema ──────────────────────────────────────────────

  describe('createPayrollRunSchema', () => {
    const validRun = {
      payrollId:      '00000000-0000-0000-0000-000000000001',
      legalEntityId:  '00000000-0000-0000-0000-000000000002',
      runType:        'REGULAR' as const,
      payPeriodStart: '2026-05-01',
      payPeriodEnd:   '2026-05-31',
      paymentDate:    '2026-05-25',
    }

    it('accepts valid payroll run input', () => {
      expect(() => createPayrollRunSchema.parse(validRun)).not.toThrow()
    })

    it('rejects when period end is before period start', () => {
      expect(() => createPayrollRunSchema.parse({
        ...validRun,
        payPeriodEnd: '2026-04-30',
      })).toThrow()
    })

    it('rejects when payment date is before period start', () => {
      expect(() => createPayrollRunSchema.parse({
        ...validRun,
        paymentDate: '2026-04-30',
      })).toThrow()
    })

    it('rejects invalid run type', () => {
      expect(() => createPayrollRunSchema.parse({
        ...validRun,
        runType: 'INVALID',
      })).toThrow()
    })

    it('rejects invalid UUID for payrollId', () => {
      expect(() => createPayrollRunSchema.parse({
        ...validRun,
        payrollId: 'not-a-uuid',
      })).toThrow()
    })

    it('rejects malformed date format', () => {
      expect(() => createPayrollRunSchema.parse({
        ...validRun,
        payPeriodStart: '01-05-2026',
      })).toThrow()
    })

    it('accepts all valid run types', () => {
      for (const runType of ['REGULAR', 'OFF_CYCLE', 'CORRECTION', 'FINAL_SETTLEMENT']) {
        expect(() => createPayrollRunSchema.parse({ ...validRun, runType })).not.toThrow()
      }
    })
  })

  // ── payrollDefinitionSchema ─────────────────────────────────────────────

  describe('payrollDefinitionSchema', () => {
    const validDef = {
      legalEntityId:     '00000000-0000-0000-0000-000000000001',
      payrollCode:       'MONTHLY',
      payrollNameEn:     'Monthly Staff Payroll',
      payFrequency:      'MONTHLY' as const,
      paymentDayOfMonth: 25,
    }

    it('accepts valid payroll definition', () => {
      expect(() => payrollDefinitionSchema.parse(validDef)).not.toThrow()
    })

    it('normalises payrollCode to uppercase', () => {
      const r = payrollDefinitionSchema.parse({ ...validDef, payrollCode: 'monthly' })
      expect(r.payrollCode).toBe('MONTHLY')
    })

    it('defaults currency to AED', () => {
      const r = payrollDefinitionSchema.parse(validDef)
      expect(r.currency).toBe('AED')
    })

    it('rejects payment day > 31', () => {
      expect(() => payrollDefinitionSchema.parse({ ...validDef, paymentDayOfMonth: 32 })).toThrow()
    })

    it('rejects payment day < 1', () => {
      expect(() => payrollDefinitionSchema.parse({ ...validDef, paymentDayOfMonth: 0 })).toThrow()
    })

    it('rejects invalid pay frequency', () => {
      expect(() => payrollDefinitionSchema.parse({ ...validDef, payFrequency: 'DAILY' })).toThrow()
    })
  })

  // ── salaryElementSchema ─────────────────────────────────────────────────

  describe('salaryElementSchema', () => {
    const validElement = {
      personId:              '00000000-0000-0000-0000-000000000001',
      assignmentId:          '00000000-0000-0000-0000-000000000002',
      legalEntityId:         '00000000-0000-0000-0000-000000000003',
      payrollId:             '00000000-0000-0000-0000-000000000004',
      elementCode:           'BASIC_SALARY',
      elementNameEn:         'Basic Salary',
      elementClassification: 'EARNINGS' as const,
      amount:                10_000,
      effectiveStartDate:    '2026-01-01',
    }

    it('accepts valid salary element', () => {
      expect(() => salaryElementSchema.parse(validElement)).not.toThrow()
    })

    it('normalises elementCode to uppercase', () => {
      const r = salaryElementSchema.parse({ ...validElement, elementCode: 'basic_salary' })
      expect(r.elementCode).toBe('BASIC_SALARY')
    })

    it('rejects when neither amount nor percentageValue is provided', () => {
      const { amount, ...noAmount } = validElement
      expect(() => salaryElementSchema.parse(noAmount)).toThrow()
    })

    it('accepts percentageValue without amount', () => {
      const { amount, ...noAmount } = validElement
      expect(() => salaryElementSchema.parse({
        ...noAmount,
        percentageValue: 0.05,
        percentageBasis: 'BASIC',
      })).not.toThrow()
    })

    it('rejects invalid classification', () => {
      expect(() => salaryElementSchema.parse({
        ...validElement,
        elementClassification: 'BONUS',
      })).toThrow()
    })

    it('rejects negative amount', () => {
      expect(() => salaryElementSchema.parse({
        ...validElement,
        amount: -500,
      })).toThrow()
    })

    it('accepts all valid classification values', () => {
      const classifications = ['EARNINGS', 'DEDUCTION', 'EMPLOYER_COST', 'EMPLOYER_LIABILITY', 'INFO']
      for (const cls of classifications) {
        expect(() => salaryElementSchema.parse({
          ...validElement,
          elementClassification: cls,
        })).not.toThrow()
      }
    })
  })

  // ── rejectPayrollRunSchema ──────────────────────────────────────────────

  describe('rejectPayrollRunSchema', () => {
    it('requires rejection reason', () => {
      expect(() => rejectPayrollRunSchema.parse({
        runId: '00000000-0000-0000-0000-000000000001',
        reason: '',
      })).toThrow()
    })

    it('accepts valid rejection', () => {
      expect(() => rejectPayrollRunSchema.parse({
        runId:  '00000000-0000-0000-0000-000000000001',
        reason: 'Salary elements need correction for one employee.',
      })).not.toThrow()
    })
  })

  // ── wpsUpdateRecordSchema ───────────────────────────────────────────────

  describe('wpsUpdateRecordSchema', () => {
    it('accepts INCLUDED status', () => {
      expect(() => wpsUpdateRecordSchema.parse({
        sifRecordId: '00000000-0000-0000-0000-000000000001',
        sifStatus:   'INCLUDED',
      })).not.toThrow()
    })

    it('accepts ON_HOLD with exclusion reason', () => {
      expect(() => wpsUpdateRecordSchema.parse({
        sifRecordId:      '00000000-0000-0000-0000-000000000001',
        sifStatus:        'ON_HOLD',
        exclusionReason:  'Employee bank account under review',
      })).not.toThrow()
    })

    it('rejects invalid status value', () => {
      expect(() => wpsUpdateRecordSchema.parse({
        sifRecordId: '00000000-0000-0000-0000-000000000001',
        sifStatus:   'PAID',
      })).toThrow()
    })
  })
})
