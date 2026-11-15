/**
 * payroll — pure business-logic services.
 *
 * Sprint 3 deliverable: GPSSA contribution calculator (BR-GPSSA-001..003).
 * EOSB / VSS / WPS-SIF land in Sprint 7-8 per the roadmap.
 *
 * No `'use server'`, no DB writes — every helper is a pure function so it
 * can be exercised by Vitest without a database.
 */

export interface GpssaInput {
  /** Persons row — only the fields we need are typed. */
  person: {
    nationalityCategory: string  // 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT'
  }
  /** Monthly basic salary in AED. EOSB-eligible amount only — no allowances. */
  basicSalary: number
}

export interface GpssaContribution {
  /** True when this person is GPSSA-eligible (UAE_NATIONAL only). */
  applies:           boolean
  /** Employer share (15% of basic salary), 0 when !applies. */
  employerShare:     number
  /** Employee share (5% of basic salary), 0 when !applies. */
  employeeShare:     number
  /** Sum of employer + employee shares. */
  totalContribution: number
  /** Rule reference for audit trails. */
  ruleRef:           'BR-GPSSA-001'
}

/**
 * BR-GPSSA-001 — UAE Nationals in the private sector contribute to the
 * General Pension and Social Security Authority. Employer = 15%,
 * employee = 5%. EOSB engine MUST skip these employees (BR-EOSB-004
 * routes them here instead).
 *
 * BR-GPSSA-003: contributions start from day 1 of employment, even for
 *               employees on probation — caller is expected to invoke this
 *               for every payroll period from hire onward.
 *
 * @see 02_BUSINESS_REQUIREMENTS/02_UAE_LABOUR_LAW_BUSINESS_RULES.md §8
 */
export function calculateGpssaContribution(
  { person, basicSalary }: GpssaInput,
): GpssaContribution {
  if (!Number.isFinite(basicSalary) || basicSalary < 0) {
    throw new Error('basicSalary must be a non-negative finite number')
  }
  if (person.nationalityCategory !== 'UAE_NATIONAL') {
    return {
      applies:           false,
      employerShare:     0,
      employeeShare:     0,
      totalContribution: 0,
      ruleRef:           'BR-GPSSA-001',
    }
  }
  // Round to 2 dp — AED currency precision.
  const round2 = (n: number): number => Math.round(n * 100) / 100
  const employerShare = round2(basicSalary * 0.15)
  const employeeShare = round2(basicSalary * 0.05)
  return {
    applies:           true,
    employerShare,
    employeeShare,
    totalContribution: round2(employerShare + employeeShare),
    ruleRef:           'BR-GPSSA-001',
  }
}

// ── Suspension Payroll Treatment (GAP-M09) ────────────────────────────────

export type SuspensionPayTreatment = 'FULL_PAY' | 'HALF_PAY' | 'NO_PAY'

export interface SuspensionPayInput {
  /** Employee's assignment status for the pay period. */
  assignmentStatus: string
  /** Reason category captured at suspension time. */
  suspensionReason?: 'DISCIPLINARY' | 'INVESTIGATION' | 'PENDING_TERMINATION' | string
  /** Number of continuous suspension days up to and including this pay period. */
  suspensionDays: number
}

export interface SuspensionPayResult {
  treatment:      SuspensionPayTreatment
  payMultiplier:  number
  ruleRef:        'BR-SUSP-001'
  note:           string
}

/**
 * BR-SUSP-001 — UAE FDL 33/2021 Article 39 / Cabinet Resolution 1/2022:
 * Payroll treatment during suspension depends on reason and duration.
 *
 * Rules applied in order:
 *   1. Not suspended → FULL_PAY (1.0).
 *   2. DISCIPLINARY suspension → NO_PAY (0.0) for the period; final
 *      settlement adjusted if employee is cleared (HR adjustment required).
 *   3. INVESTIGATION suspension ≤ 30 days → FULL_PAY (1.0).
 *   4. INVESTIGATION suspension > 30 days → HALF_PAY (0.5) for the excess.
 *   5. PENDING_TERMINATION → FULL_PAY (1.0) through notice period.
 *
 * The payroll run MUST call this function and store the result on the
 * payroll_run_lines row. HR can override via a manual adjustment entry.
 * This is a pure function — no DB access; caller supplies context.
 */
export function determineSuspensionPayTreatment(
  input: SuspensionPayInput,
): SuspensionPayResult {
  if (input.assignmentStatus !== 'SUSPENDED') {
    return {
      treatment:     'FULL_PAY',
      payMultiplier: 1.0,
      ruleRef:       'BR-SUSP-001',
      note: 'Employee is not suspended; full pay applies.',
    }
  }

  if (input.suspensionReason === 'DISCIPLINARY') {
    return {
      treatment:     'NO_PAY',
      payMultiplier: 0.0,
      ruleRef:       'BR-SUSP-001',
      note: 'BR-SUSP-001: Disciplinary suspension — no pay. Reverse via manual adjustment if cleared.',
    }
  }

  if (input.suspensionReason === 'PENDING_TERMINATION') {
    return {
      treatment:     'FULL_PAY',
      payMultiplier: 1.0,
      ruleRef:       'BR-SUSP-001',
      note: 'BR-SUSP-001: Suspension pending termination — full pay through notice period.',
    }
  }

  // INVESTIGATION (default) — full pay up to 30 days, half pay after
  if (input.suspensionDays <= 30) {
    return {
      treatment:     'FULL_PAY',
      payMultiplier: 1.0,
      ruleRef:       'BR-SUSP-001',
      note: `BR-SUSP-001: Investigation suspension day ${input.suspensionDays} (≤30) — full pay.`,
    }
  }

  return {
    treatment:     'HALF_PAY',
    payMultiplier: 0.5,
    ruleRef:       'BR-SUSP-001',
    note: `BR-SUSP-001: Investigation suspension day ${input.suspensionDays} (>30) — half pay.`,
  }
}

// ── EOSB / Gratuity Calculator (BR-EOSB-001 through BR-EOSB-006) ─────────────

export interface EosbInput {
  /** Person row — only fields relevant to eligibility. */
  person: {
    /** 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT' */
    nationalityCategory: string
  }
  /** Monthly basic salary in AED (no allowances — BR-EOSB-006). */
  basicSalary: number
  /** Employment hire date (YYYY-MM-DD). */
  hireDate: string
  /** Termination / calculation date (YYYY-MM-DD). */
  calculationDate: string
  /** Total unpaid leave days to deduct from service. Defaults to 0. */
  totalUnpaidLeaveDays?: number
  /**
   * Override parameters (normally loaded from compliance_rules via getEosbParams).
   * Defaults: rateYear1To5=21, rateBeyond5=30, capMonths=24, dailyRateDivisor=30.
   */
  params?: {
    rateYear1To5?:     number
    rateBeyond5?:      number
    capMonths?:        number
    dailyRateDivisor?: number
  }
}

export interface EosbResult {
  /** False for UAE_NATIONAL (GPSSA applies instead — BR-EOSB-005). */
  applies:          boolean
  /** Net service in decimal years (calendar days minus unpaid leave / 365.25). */
  serviceYears:     number
  /** Daily rate = basicSalary / dailyRateDivisor (default 30). */
  dailyRate:        number
  /** EOSB accrued for first 1–5 years (21 working days / year). */
  eosbFirst5Years:  number
  /** EOSB accrued for service beyond 5 years (30 working days / year). */
  eosbBeyond5Years: number
  /** Raw total before cap. */
  eosbBeforeCap:    number
  /** Cap ceiling = basicSalary × capMonths. */
  capAmount:        number
  /** True if eosbBeforeCap exceeded the cap. */
  isCapped:         boolean
  /** Final payable amount (min(eosbBeforeCap, capAmount), 0 if !applies). */
  eosbFinalAmount:  number
  /** Rule references applied. */
  ruleRefs:         string[]
}

/**
 * Pure EOSB / end-of-service gratuity calculator for UAE private-sector employees.
 *
 * Business rules applied:
 *   BR-EOSB-001 — < 1 year → AED 0
 *   BR-EOSB-002 — 1–5 years → 21 working days per year
 *   BR-EOSB-003 — > 5 years → 21 days/yr for first 5 + 30 days/yr for remainder
 *   BR-EOSB-004 — cap = 24 months basic salary
 *   BR-EOSB-005 — UAE nationals excluded (GPSSA applies)
 *   BR-EOSB-006 — basic salary only (no allowances)
 *
 * Daily rate = basicSalary / dailyRateDivisor  (default divisor = 30,
 * matching the UAE Labour Law working-days convention used in most payroll
 * systems; some use (basic × 12) / 365 — override via params.dailyRateDivisor).
 *
 * No DB access — pure function safe for unit testing without mocks.
 */
export function calculateEosb(input: EosbInput): EosbResult {
  const { person, basicSalary, hireDate, calculationDate } = input
  const unpaidDays        = input.totalUnpaidLeaveDays ?? 0
  const rateYear1To5      = input.params?.rateYear1To5     ?? 21
  const rateBeyond5       = input.params?.rateBeyond5       ?? 30
  const capMonths         = input.params?.capMonths          ?? 24
  const dailyRateDivisor  = input.params?.dailyRateDivisor   ?? 30

  // Input guards
  if (!Number.isFinite(basicSalary) || basicSalary < 0) {
    throw new Error('basicSalary must be a non-negative finite number')
  }
  if (unpaidDays < 0) {
    throw new Error('totalUnpaidLeaveDays must be non-negative')
  }

  const round2 = (n: number): number => Math.round(n * 100) / 100

  // BR-EOSB-005: UAE nationals → not eligible (GPSSA handles them)
  if (person.nationalityCategory === 'UAE_NATIONAL') {
    return {
      applies:          false,
      serviceYears:     0,
      dailyRate:        0,
      eosbFirst5Years:  0,
      eosbBeyond5Years: 0,
      eosbBeforeCap:    0,
      capAmount:        0,
      isCapped:         false,
      eosbFinalAmount:  0,
      ruleRefs:         ['BR-EOSB-005'],
    }
  }

  // Service calculation
  const msPerDay    = 86_400_000
  const hire        = new Date(hireDate).getTime()
  const calcDate    = new Date(calculationDate).getTime()
  const calendarDays = Math.round(Math.abs(calcDate - hire) / msPerDay)
  const netDays      = Math.max(0, calendarDays - unpaidDays)
  const serviceYears = netDays / 365.25

  // BR-EOSB-001: < 1 year → 0
  if (serviceYears < 1) {
    return {
      applies:          true,
      serviceYears:     round2(serviceYears),
      dailyRate:        0,
      eosbFirst5Years:  0,
      eosbBeyond5Years: 0,
      eosbBeforeCap:    0,
      capAmount:        round2(basicSalary * capMonths),
      isCapped:         false,
      eosbFinalAmount:  0,
      ruleRefs:         ['BR-EOSB-001'],
    }
  }

  const dailyRate = basicSalary / dailyRateDivisor

  // BR-EOSB-002 / BR-EOSB-003: split at 5-year mark
  const years1to5  = Math.min(serviceYears, 5)
  const yearsBeyond5 = Math.max(0, serviceYears - 5)

  const eosbFirst5Years  = round2(dailyRate * rateYear1To5 * years1to5)
  const eosbBeyond5Years = round2(dailyRate * rateBeyond5  * yearsBeyond5)
  const eosbBeforeCap    = round2(eosbFirst5Years + eosbBeyond5Years)

  // BR-EOSB-004: cap
  const capAmount  = round2(basicSalary * capMonths)
  const isCapped   = eosbBeforeCap > capAmount
  const eosbFinalAmount = isCapped ? capAmount : eosbBeforeCap

  const ruleRefs: string[] = ['BR-EOSB-002', 'BR-EOSB-006']
  if (serviceYears > 5)  ruleRefs.push('BR-EOSB-003')
  if (isCapped)          ruleRefs.push('BR-EOSB-004')

  return {
    applies:          true,
    serviceYears:     round2(serviceYears),
    dailyRate:        round2(dailyRate),
    eosbFirst5Years,
    eosbBeyond5Years,
    eosbBeforeCap,
    capAmount,
    isCapped,
    eosbFinalAmount,
    ruleRefs,
  }
}
