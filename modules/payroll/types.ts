/**
 * payroll module — DTO types for server ↔ client boundaries.
 *
 * DB-level types live in drizzle/schema/foundation.ts and
 * drizzle/schema/transactions.ts. These DTOs are the serialisable shapes
 * that pages, Server Actions, and API routes exchange.
 */

// ── Run Status ───────────────────────────────────────────────────────────────

export type PayrollRunStatus =
  | 'DRAFT'
  | 'PRE_CHECKS_PASSED'
  | 'CALCULATED'
  | 'UNDER_REVIEW'
  | 'LOCKED'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'SIF_GENERATED'
  | 'SUBMITTED_TO_BANK'
  | 'CONFIRMED'
  | 'ARCHIVED'

export type PayrollRunType = 'REGULAR' | 'OFF_CYCLE' | 'CORRECTION' | 'FINAL_SETTLEMENT'

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  DRAFT:             'Draft',
  PRE_CHECKS_PASSED: 'Pre-Checks Passed',
  CALCULATED:        'Calculated',
  UNDER_REVIEW:      'Under Review',
  LOCKED:            'Locked',
  APPROVAL_PENDING:  'Pending Approval',
  APPROVED:          'Approved',
  SIF_GENERATED:     'SIF Generated',
  SUBMITTED_TO_BANK: 'Submitted to Bank',
  CONFIRMED:         'Confirmed',
  ARCHIVED:          'Archived',
}

// ── Dashboard KPIs ───────────────────────────────────────────────────────────

export interface PayrollDashboardData {
  currentPeriod: {
    runNumber:      string | null
    status:         PayrollRunStatus | null
    payPeriodStart: string | null
    payPeriodEnd:   string | null
    paymentDate:    string | null
    wpsDeadline:    string | null
  }
  kpis: {
    totalGrossPay:     number
    totalNetPay:       number
    totalEmployerCost: number
    totalDeductions:   number
    totalOvertimePay:  number
    employeeCount:     number
  }
  pendingApprovals:   number
  varianceAlerts:     number
  eosbLiabilityTotal: number
  gpssaTotal:         number
  dewsTotal:          number
  payrollExceptions:  number
  recentRuns:         PayrollRunSummary[]
}

export interface PayrollRunSummary {
  id:               string
  runNumber:        string
  payPeriodStart:   string
  payPeriodEnd:     string
  paymentDate:      string
  runType:          PayrollRunType
  status:           PayrollRunStatus
  employeeCount:    number | null
  totalGrossPay:    number | null
  totalNetPay:      number | null
  totalEmployerCost: number | null
  wpsDeadline:      string | null
  createdDate:      string
}

// ── Payslip ──────────────────────────────────────────────────────────────────

export interface PayslipLine {
  elementCode:    string
  elementNameEn:  string
  elementNameAr:  string | null
  classification: 'EARNINGS' | 'DEDUCTION' | 'EMPLOYER_COST' | 'INFO'
  amount:         number
}

export interface PayslipData {
  runNumber:        string
  payPeriodStart:   string
  payPeriodEnd:     string
  paymentDate:      string
  personId:         string
  employeeNumber:   string | null
  fullNameEn:       string
  jobTitleEn:       string | null
  departmentEn:     string | null
  legalEntityNameEn: string
  currency:         string
  lines:            PayslipLine[]
  totalGrossPay:    number
  totalDeductions:  number
  netPay:           number
  totalEmployerCost: number
  eosbProvision:    number
  ytdGrossPay:      number
  ytdNetPay:        number
}

// ── Payroll Result Row (HR admin table) ──────────────────────────────────────

export interface PayrollResultRow {
  id:                   string
  personId:             string
  employeeNumber:       string | null
  fullNameEn:           string
  departmentEn:         string | null
  jobTitleEn:           string | null
  basicSalary:          number
  housingAllowance:     number
  transportAllowance:   number
  otherAllowances:      number
  overtimePay:          number
  totalGrossPay:        number
  totalDeductions:      number
  netPay:               number
  eosbProvision:        number
  gpssaEmployerContrib: number
  paymentStatus:        string
  isVarianceFlagged:    boolean
  variancePct:          number | null
}

// ── WPS Staging ──────────────────────────────────────────────────────────────

export interface WpsStagingRow {
  id:                 string
  personId:           string
  employeeNumber:     string | null
  fullNameEn:         string
  iban:               string
  routingCode:        string
  netPayAed:          number
  sifStatus:          string
  exclusionReason:    string | null
  employerLabourCode: string
  employeeLabourCard: string | null
  bankConfirmationRef: string | null
}

export interface WpsStagingSummary {
  totalRecords:     number
  totalNetPayAed:   number
  includedCount:    number
  excludedCount:    number
  onHoldCount:      number
  validationErrors: WpsValidationError[]
}

export interface WpsValidationError {
  personId:   string
  fullNameEn: string
  field:      string
  message:    string
}

// ── EOSB Estimate (employee self-service) ────────────────────────────────────

export interface EosbEstimate {
  asOfDate:         string
  serviceYears:     number
  basicSalary:      number
  eosbFinalAmount:  number
  eosbFirst5Years:  number
  eosbBeyond5Years: number
  isCapped:         boolean
  capAmount:        number
  applies:          boolean
  scheme:           'TRADITIONAL' | 'VSS' | 'DEWS' | 'GPSSA'
  ruleRefs:         string[]
}

// ── Payroll Definition DTO ───────────────────────────────────────────────────

export interface PayrollDefinitionDTO {
  id:                string
  payrollCode:       string
  payrollNameEn:     string
  payrollNameAr:     string | null
  payFrequency:      string
  paymentDayOfMonth: number
  currency:          string
  legalEntityId:     string
  legalEntityNameEn: string
  wpsBankCode:       string | null
  isActive:          boolean
}

// ── Report Data ──────────────────────────────────────────────────────────────

export interface PayrollSummaryReport {
  runNumber:          string
  payPeriodStart:     string
  payPeriodEnd:       string
  legalEntityNameEn:  string
  employeeCount:      number
  totalGrossPay:      number
  totalDeductions:    number
  totalNetPay:        number
  totalEmployerCost:  number
  totalEosbProvision: number
  totalGpssaEmployer: number
}

export interface SalaryDistributionBand {
  label:       string
  minAed:      number
  maxAed:      number | null
  count:       number
  totalNetPay: number
}

export interface EosbLiabilityRow {
  personId:        string
  employeeNumber:  string | null
  fullNameEn:      string
  hireDate:        string
  serviceYears:    number
  basicSalary:     number
  eosbFinalAmount: number
  scheme:          string
}

export interface VarianceReportRow {
  personId:          string
  fullNameEn:        string
  priorNetPay:       number
  currentNetPay:     number
  variancePct:       number
  varianceReason:    string | null
  isVarianceFlagged: boolean
}

// ── Action Results ────────────────────────────────────────────────────────────

export interface PayrollActionResult {
  success:  boolean
  message?: string
  runId?:   string
  error?:   string
}

// ── Calculation Inputs / Outputs ─────────────────────────────────────────────

export interface PayrollEmployeeInput {
  personId:            string
  assignmentId:        string | null
  nationalityCategory: string
  hireDate:            string
  assignmentStatus:    string
  suspensionReason?:   string
  suspensionDays:      number
  basicSalary:         number
  housingAllowance:    number
  transportAllowance:  number
  otherAllowances:     number
  overtimePay:         number
  bonus:               number
  sickLeaveDeduct:     number
  unpaidLeaveDeduct:   number
  salaryAdvanceDeduct: number
  medicalInsuranceDeduct: number
  otherDeductions:     number
  priorMonthNetPay:    number | null
  eosbScheme:          'TRADITIONAL' | 'VSS' | 'DEWS' | 'GPSSA'
}

export interface PayrollCalculationResult {
  personId:              string
  assignmentId:          string | null
  basicSalary:           number
  housingAllowance:      number
  transportAllowance:    number
  otherAllowances:       number
  overtimePay:           number
  bonus:                 number
  totalGrossPay:         number
  sickLeaveDeduction:    number
  unpaidLeaveDeduction:  number
  salaryAdvanceDeduct:   number
  gpssaEmployeeDeduct:   number
  medicalInsuranceDeduct: number
  otherDeductions:       number
  totalDeductions:       number
  netPay:                number
  gpssaEmployerContrib:  number
  eosbProvision:         number
  medicalInsuranceEr:    number
  totalEmployerCost:     number
  priorMonthNetPay:      number | null
  variancePct:           number | null
  isVarianceFlagged:     boolean
  suspensionTreatment:   string
  ruleRefs:              string[]
}
