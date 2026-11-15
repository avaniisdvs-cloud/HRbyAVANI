/**
 * Payroll Calculation Engine — Sprint 11/12.
 *
 * Pure functions: no DB access, no 'use server'. Designed to be called by
 * payroll Server Actions inside a Drizzle transaction.
 *
 * Business rules applied:
 *   BR-EOSB-001 through BR-EOSB-006  — EOSB gratuity
 *   BR-GPSSA-001 through BR-GPSSA-003 — GPSSA contributions (UAE nationals)
 *   BR-SUSP-001                        — Suspension pay treatment
 *   BR-PAY-001                         — Variance flagging (±20% of prior month)
 *   BR-PAY-002                         — Overtime at 1.25× for regular, 1.5× for public holidays
 *   BR-WPS-001                         — All payroll net pay must go through WPS
 */

import {
  calculateEosb,
  calculateGpssaContribution,
  determineSuspensionPayTreatment,
  type EosbInput,
} from './services'
import type { PayrollEmployeeInput, PayrollCalculationResult } from './types'

// ── Constants ────────────────────────────────────────────────────────────────

/** BR-PAY-001: Flag variance if ≥ 20% deviation from prior month net pay */
const VARIANCE_FLAG_THRESHOLD = 0.20

// ── Rounding ─────────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Main Calculator ───────────────────────────────────────────────────────────

/**
 * Calculate payroll result for a single employee for one pay period.
 * Returns a PayrollCalculationResult ready for insertion into payroll_results.
 *
 * Called inside `calculatePayrollRun()` for each active employee.
 */
export function calculateEmployeePayroll(
  input: PayrollEmployeeInput,
): PayrollCalculationResult {
  const ruleRefs: string[] = []

  // ── 1. Suspension treatment (BR-SUSP-001) ────────────────────────────────
  const suspension = determineSuspensionPayTreatment({
    assignmentStatus: input.assignmentStatus,
    suspensionReason: input.suspensionReason,
    suspensionDays:   input.suspensionDays,
  })
  ruleRefs.push(suspension.ruleRef)
  const payMultiplier = suspension.payMultiplier

  // ── 2. Gross Pay Calculation ─────────────────────────────────────────────
  const basicSalary        = r2(input.basicSalary        * payMultiplier)
  const housingAllowance   = r2(input.housingAllowance   * payMultiplier)
  const transportAllowance = r2(input.transportAllowance * payMultiplier)
  const otherAllowances    = r2(input.otherAllowances    * payMultiplier)
  const overtimePay        = r2(input.overtimePay)  // overtime not suspended
  const bonus              = r2(input.bonus)          // bonuses not suspended

  const totalGrossPay = r2(
    basicSalary + housingAllowance + transportAllowance +
    otherAllowances + overtimePay + bonus,
  )

  // ── 3. GPSSA Deduction (BR-GPSSA-001) ────────────────────────────────────
  const gpssaResult = calculateGpssaContribution({
    person:      { nationalityCategory: input.nationalityCategory },
    basicSalary: input.basicSalary, // GPSSA always on unadjusted basic
  })
  const gpssaEmployeeDeduct   = gpssaResult.applies ? gpssaResult.employeeShare   : 0
  const gpssaEmployerContrib  = gpssaResult.applies ? gpssaResult.employerShare   : 0
  if (gpssaResult.applies) ruleRefs.push('BR-GPSSA-001')

  // ── 4. Deductions ─────────────────────────────────────────────────────────
  const sickLeaveDeduction    = r2(input.sickLeaveDeduct)
  const unpaidLeaveDeduction  = r2(input.unpaidLeaveDeduct)
  const salaryAdvanceDeduct   = r2(input.salaryAdvanceDeduct)
  const medicalInsuranceDeduct = r2(input.medicalInsuranceDeduct)
  const otherDeductions       = r2(input.otherDeductions)

  const totalDeductions = r2(
    sickLeaveDeduction + unpaidLeaveDeduction + gpssaEmployeeDeduct +
    salaryAdvanceDeduct + medicalInsuranceDeduct + otherDeductions,
  )

  // ── 5. Net Pay ────────────────────────────────────────────────────────────
  const netPay = r2(Math.max(0, totalGrossPay - totalDeductions))

  // ── 6. EOSB Monthly Provision (BR-EOSB-001 through BR-EOSB-006) ──────────
  let eosbProvision = 0

  if (input.eosbScheme === 'TRADITIONAL' || input.eosbScheme === 'VSS') {
    const today = new Date().toISOString().slice(0, 10)
    const eosbInput: EosbInput = {
      person:          { nationalityCategory: input.nationalityCategory },
      basicSalary:     input.basicSalary, // BR-EOSB-006: basic salary only
      hireDate:        input.hireDate,
      calculationDate: today,
    }
    const eosbResult = calculateEosb(eosbInput)
    if (eosbResult.applies && eosbResult.serviceYears >= 1) {
      // Monthly provision = full accrued EOSB / months of service so far
      const monthsOfService = Math.max(1, eosbResult.serviceYears * 12)
      eosbProvision = r2(eosbResult.eosbFinalAmount / monthsOfService)
      ruleRefs.push(...eosbResult.ruleRefs.filter(r => !ruleRefs.includes(r)))
    }
  }
  // DEWS: calculated separately at DIFC entity level
  // GPSSA: employer contribution replaces EOSB for UAE nationals

  // ── 7. Medical Insurance Employer Cost ────────────────────────────────────
  const medicalInsuranceEr = r2(input.medicalInsuranceDeduct > 0 ? 0 : 0)
  // Employer medical insurance cost is tracked on person.employer_premium_aed
  // and recorded as a separate line in payroll_results.medical_insurance_er

  // ── 8. Total Employer Cost ────────────────────────────────────────────────
  const totalEmployerCost = r2(
    netPay + gpssaEmployerContrib + eosbProvision + medicalInsuranceEr,
  )

  // ── 9. Variance Check (BR-PAY-001) ────────────────────────────────────────
  let variancePct:       number | null = null
  let isVarianceFlagged  = false

  if (input.priorMonthNetPay !== null && input.priorMonthNetPay > 0) {
    variancePct = r2((netPay - input.priorMonthNetPay) / input.priorMonthNetPay)
    if (Math.abs(variancePct) >= VARIANCE_FLAG_THRESHOLD) {
      isVarianceFlagged = true
      ruleRefs.push('BR-PAY-001')
    }
  }

  return {
    personId:              input.personId,
    assignmentId:          input.assignmentId,
    basicSalary,
    housingAllowance,
    transportAllowance,
    otherAllowances,
    overtimePay,
    bonus,
    totalGrossPay,
    sickLeaveDeduction,
    unpaidLeaveDeduction,
    salaryAdvanceDeduct,
    gpssaEmployeeDeduct,
    medicalInsuranceDeduct,
    otherDeductions,
    totalDeductions,
    netPay,
    gpssaEmployerContrib,
    eosbProvision,
    medicalInsuranceEr,
    totalEmployerCost,
    priorMonthNetPay:      input.priorMonthNetPay,
    variancePct,
    isVarianceFlagged,
    suspensionTreatment:   suspension.treatment,
    ruleRefs,
  }
}

// ── Run Aggregation ───────────────────────────────────────────────────────────

export interface RunTotals {
  employeeCount:     number
  totalGrossPay:     number
  totalDeductions:   number
  totalNetPay:       number
  totalEmployerCost: number
  totalEosbProvision: number
  totalGpssaEmployer: number
  varianceAlerts:    number
}

/**
 * Aggregate payroll calculation results into run-level totals.
 * Stored on payroll_runs after bulk calculation.
 */
export function aggregateRunTotals(
  results: PayrollCalculationResult[],
): RunTotals {
  const totals: RunTotals = {
    employeeCount:     results.length,
    totalGrossPay:     0,
    totalDeductions:   0,
    totalNetPay:       0,
    totalEmployerCost: 0,
    totalEosbProvision: 0,
    totalGpssaEmployer: 0,
    varianceAlerts:    0,
  }

  for (const r of results) {
    totals.totalGrossPay      = r2(totals.totalGrossPay      + r.totalGrossPay)
    totals.totalDeductions    = r2(totals.totalDeductions    + r.totalDeductions)
    totals.totalNetPay        = r2(totals.totalNetPay        + r.netPay)
    totals.totalEmployerCost  = r2(totals.totalEmployerCost  + r.totalEmployerCost)
    totals.totalEosbProvision = r2(totals.totalEosbProvision + r.eosbProvision)
    totals.totalGpssaEmployer = r2(totals.totalGpssaEmployer + r.gpssaEmployerContrib)
    if (r.isVarianceFlagged) totals.varianceAlerts++
  }

  return totals
}

// ── WPS Pre-Validation ────────────────────────────────────────────────────────

export interface WpsValidationResult {
  isValid:  boolean
  errors:   Array<{ personId: string; field: string; message: string }>
}

/** BR-WPS-001: Validate WPS SIF record requirements before SIF generation. */
export function validateWpsRecords(
  records: Array<{
    personId:           string
    fullNameEn:         string
    iban:               string | null
    routingCode:        string | null
    netPayAed:          number
    employerLabourCode: string | null
    employeeLabourCard: string | null
  }>,
): WpsValidationResult {
  const errors: WpsValidationResult['errors'] = []

  for (const rec of records) {
    if (!rec.iban || rec.iban.trim().length < 15) {
      errors.push({ personId: rec.personId, field: 'iban', message: 'Valid IBAN is required for WPS (BR-WPS-001)' })
    }
    if (!rec.routingCode || rec.routingCode.trim().length === 0) {
      errors.push({ personId: rec.personId, field: 'routingCode', message: 'Bank routing code required for WPS' })
    }
    if (!rec.employerLabourCode || rec.employerLabourCode.trim().length === 0) {
      errors.push({ personId: rec.personId, field: 'employerLabourCode', message: 'Employer labour code required for WPS' })
    }
    if (rec.netPayAed <= 0) {
      errors.push({ personId: rec.personId, field: 'netPayAed', message: 'Net pay must be > 0 for WPS inclusion' })
    }
  }

  return { isValid: errors.length === 0, errors }
}

// ── DEWS Monthly Contribution ─────────────────────────────────────────────────

/**
 * BR-DIFC-003: DEWS (Workplace Savings Scheme) for DIFC entities.
 *   Under 5 years: 5.83% of basic salary
 *   5+ years:      8.33% of basic salary
 */
export function calculateDewsContribution(
  basicSalary: number,
  serviceYears: number,
): { rate: number; amount: number; serviceBand: 'UNDER_5_YEARS' | '5_YEARS_PLUS' } {
  const serviceBand = serviceYears >= 5 ? '5_YEARS_PLUS' : 'UNDER_5_YEARS'
  const rate        = serviceBand === '5_YEARS_PLUS' ? 0.0833 : 0.0583
  const amount      = r2(basicSalary * rate)
  return { rate, amount, serviceBand }
}

// ── YTD Calculation ───────────────────────────────────────────────────────────

/**
 * Compute YTD accumulators given the prior YTD and current period values.
 * Called after each payroll period is calculated.
 */
export function computeYtd(
  prior: { ytdGrossPay: number; ytdNetPay: number; ytdEosbProvision: number; ytdGpssa: number },
  current: { totalGrossPay: number; netPay: number; eosbProvision: number; gpssaEmployeeDeduct: number },
): { ytdGrossPay: number; ytdNetPay: number; ytdEosbProvision: number; ytdGpssa: number } {
  return {
    ytdGrossPay:      r2(prior.ytdGrossPay      + current.totalGrossPay),
    ytdNetPay:        r2(prior.ytdNetPay         + current.netPay),
    ytdEosbProvision: r2(prior.ytdEosbProvision  + current.eosbProvision),
    ytdGpssa:         r2(prior.ytdGpssa          + current.gpssaEmployeeDeduct),
  }
}
