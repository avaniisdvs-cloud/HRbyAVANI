/**
 * payroll read-only query functions.
 * All DB reads for payroll module land here.
 * No auth checks — callers (Server Components / Server Actions) must gate access.
 */
import { db }    from '@/lib/db'
import { and, desc, eq, gte, isNull, lte, sql, sum, count, asc } from 'drizzle-orm'
import {
  payrollDefinitions,
  payrollRuns,
  payrollResults,
  salaryElements,
  eosbCalculations,
  persons,
  departments,
  positions,
  jobs,
  legalEntities,
} from '@/drizzle/schema'
import {
  wpsSifRecords,
  gpssaContributions,
  dewsContributions,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { calculateEosb } from './services'
import type {
  PayrollRunSummary,
  PayrollResultRow,
  WpsStagingRow,
  EosbLiabilityRow,
  VarianceReportRow,
  PayrollDefinitionDTO,
  PayslipData,
  PayslipLine,
  EosbEstimate,
  SalaryDistributionBand,
} from './types'

// ── Payroll Definitions ───────────────────────────────────────────────────────

export async function getPayrollDefinitions(
  legalEntityId?: string,
): Promise<PayrollDefinitionDTO[]> {
  const rows = await db
    .select({
      id:                payrollDefinitions.id,
      payrollCode:       payrollDefinitions.payrollCode,
      payrollNameEn:     payrollDefinitions.payrollNameEn,
      payrollNameAr:     payrollDefinitions.payrollNameAr,
      payFrequency:      payrollDefinitions.payFrequency,
      paymentDayOfMonth: payrollDefinitions.paymentDayOfMonth,
      currency:          payrollDefinitions.currency,
      legalEntityId:     payrollDefinitions.legalEntityId,
      legalEntityNameEn: legalEntities.nameEn,
      wpsBankCode:       payrollDefinitions.wpsBankCode,
      isActive:          payrollDefinitions.isActive,
    })
    .from(payrollDefinitions)
    .leftJoin(legalEntities, eq(payrollDefinitions.legalEntityId, legalEntities.id))
    .where(and(
      eq(payrollDefinitions.tenantId, TENANT_ID),
      legalEntityId ? eq(payrollDefinitions.legalEntityId, legalEntityId) : undefined,
      eq(payrollDefinitions.isActive, true),
    ))
    .orderBy(asc(payrollDefinitions.payrollCode))

  return rows.map(r => ({
    id:                r.id,
    payrollCode:       r.payrollCode,
    payrollNameEn:     r.payrollNameEn,
    payrollNameAr:     r.payrollNameAr ?? null,
    payFrequency:      r.payFrequency,
    paymentDayOfMonth: r.paymentDayOfMonth,
    currency:          r.currency,
    legalEntityId:     r.legalEntityId,
    legalEntityNameEn: r.legalEntityNameEn ?? '',
    wpsBankCode:       r.wpsBankCode ?? null,
    isActive:          r.isActive,
  }))
}

// ── Payroll Runs ──────────────────────────────────────────────────────────────

export async function getPayrollRuns(opts: {
  legalEntityId?: string
  status?:        string
  limit?:         number
}): Promise<PayrollRunSummary[]> {
  const rows = await db
    .select({
      id:               payrollRuns.id,
      runNumber:        payrollRuns.runNumber,
      payPeriodStart:   payrollRuns.payPeriodStart,
      payPeriodEnd:     payrollRuns.payPeriodEnd,
      paymentDate:      payrollRuns.paymentDate,
      runType:          payrollRuns.runType,
      status:           payrollRuns.status,
      employeeCount:    payrollRuns.employeeCount,
      totalGrossPay:    payrollRuns.totalGrossPay,
      totalNetPay:      payrollRuns.totalNetPay,
      totalEmployerCost: payrollRuns.totalEmployerCost,
      wpsDeadline:      payrollRuns.wpsDeadline,
      createdDate:      payrollRuns.createdDate,
    })
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.tenantId, TENANT_ID),
      opts.legalEntityId ? eq(payrollRuns.legalEntityId, opts.legalEntityId) : undefined,
      opts.status        ? eq(payrollRuns.status, opts.status) : undefined,
    ))
    .orderBy(desc(payrollRuns.createdDate))
    .limit(opts.limit ?? 50)

  return rows.map(r => ({
    id:               r.id,
    runNumber:        r.runNumber,
    payPeriodStart:   String(r.payPeriodStart),
    payPeriodEnd:     String(r.payPeriodEnd),
    paymentDate:      String(r.paymentDate),
    runType:          r.runType as PayrollRunSummary['runType'],
    status:           r.status as PayrollRunSummary['status'],
    employeeCount:    r.employeeCount ?? null,
    totalGrossPay:    r.totalGrossPay ? Number(r.totalGrossPay) : null,
    totalNetPay:      r.totalNetPay ? Number(r.totalNetPay) : null,
    totalEmployerCost: r.totalEmployerCost ? Number(r.totalEmployerCost) : null,
    wpsDeadline:      r.wpsDeadline ? String(r.wpsDeadline) : null,
    createdDate:      r.createdDate ? r.createdDate.toISOString() : new Date().toISOString(),
  }))
}

export async function getPayrollRunById(runId: string) {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, TENANT_ID)))
    .limit(1)
  return run ?? null
}

// ── Payroll Results ───────────────────────────────────────────────────────────

export async function getPayrollResultRows(runId: string): Promise<PayrollResultRow[]> {
  const rows = await db
    .select({
      id:                   payrollResults.id,
      personId:             payrollResults.personId,
      employeeNumber:       persons.personNumber,
      fullNameEn:           persons.fullNameEn,
      departmentEn:         departments.nameEn,
      jobTitleEn:           jobs.jobTitleEn,
      basicSalary:          payrollResults.basicSalary,
      housingAllowance:     payrollResults.housingAllowance,
      transportAllowance:   payrollResults.transportAllowance,
      otherAllowances:      payrollResults.otherAllowances,
      overtimePay:          payrollResults.overtimePay,
      totalGrossPay:        payrollResults.totalGrossPay,
      totalDeductions:      payrollResults.totalDeductions,
      netPay:               payrollResults.netPay,
      eosbProvision:        payrollResults.eosbProvision,
      gpssaEmployerContrib: payrollResults.gpssaEmployerContrib,
      paymentStatus:        payrollResults.paymentStatus,
      isVarianceFlagged:    payrollResults.isVarianceFlagged,
      variancePct:          payrollResults.variancePct,
    })
    .from(payrollResults)
    .leftJoin(persons,     eq(payrollResults.personId, persons.id))
    .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
    .leftJoin(positions,   eq(persons.currentPositionId,  positions.id))
    .leftJoin(jobs,        eq(persons.currentJobId,       jobs.id))
    .where(and(
      eq(payrollResults.payrollRunId, runId),
      eq(payrollResults.tenantId, TENANT_ID),
    ))
    .orderBy(asc(persons.fullNameEn))

  return rows.map(r => ({
    id:                   r.id,
    personId:             r.personId,
    employeeNumber:       r.employeeNumber ?? null,
    fullNameEn:           r.fullNameEn ?? '',
    departmentEn:         r.departmentEn ?? null,
    jobTitleEn:           r.jobTitleEn ?? null,
    basicSalary:          Number(r.basicSalary ?? 0),
    housingAllowance:     Number(r.housingAllowance ?? 0),
    transportAllowance:   Number(r.transportAllowance ?? 0),
    otherAllowances:      Number(r.otherAllowances ?? 0),
    overtimePay:          Number(r.overtimePay ?? 0),
    totalGrossPay:        Number(r.totalGrossPay ?? 0),
    totalDeductions:      Number(r.totalDeductions ?? 0),
    netPay:               Number(r.netPay ?? 0),
    eosbProvision:        Number(r.eosbProvision ?? 0),
    gpssaEmployerContrib: Number(r.gpssaEmployerContrib ?? 0),
    paymentStatus:        r.paymentStatus,
    isVarianceFlagged:    r.isVarianceFlagged,
    variancePct:          r.variancePct ? Number(r.variancePct) : null,
  }))
}

export async function getPayrollResultForPerson(
  runId: string,
  personId: string,
): Promise<PayrollResultRow | null> {
  const rows = await getPayrollResultRows(runId)
  return rows.find(r => r.personId === personId) ?? null
}

// ── Salary Elements ───────────────────────────────────────────────────────────

export async function getSalaryElementsForPerson(personId: string) {
  const today = new Date().toISOString().slice(0, 10)
  return db
    .select()
    .from(salaryElements)
    .where(and(
      eq(salaryElements.personId, personId),
      eq(salaryElements.tenantId, TENANT_ID),
      lte(salaryElements.effectiveStartDate, today),
      gte(salaryElements.effectiveEndDate, today),
    ))
    .orderBy(asc(salaryElements.processingOrder))
}

export async function getAllSalaryElementsForPerson(personId: string) {
  return db
    .select()
    .from(salaryElements)
    .where(and(
      eq(salaryElements.personId, personId),
      eq(salaryElements.tenantId, TENANT_ID),
    ))
    .orderBy(desc(salaryElements.effectiveStartDate), asc(salaryElements.processingOrder))
}

// ── Active Employees for Payroll ──────────────────────────────────────────────

export async function getActiveEmployeesForPayroll(legalEntityId: string) {
  return db
    .select({
      personId:            persons.id,
      personNumber:        persons.personNumber,
      fullNameEn:          persons.fullNameEn,
      nationalityCategory: persons.nationalityCategory,
      hireDate:            persons.hireDate,
      assignmentStatus:    persons.assignmentStatus,
      payrollId:           persons.payrollId,
      basicSalary:         persons.basicSalary,
      currentPositionId:   persons.currentPositionId,
      currentDepartmentId: persons.currentDepartmentId,
      employeePremiumAed:  persons.employeePremiumAed,
      employerPremiumAed:  persons.employerPremiumAed,
    })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.legalEntityId, legalEntityId),
      eq(persons.isActive, true),
      sql`${persons.assignmentStatus} IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED')`,
    ))
    .orderBy(asc(persons.fullNameEn))
}

// ── Payslip ───────────────────────────────────────────────────────────────────

export async function getPayslipForEmployee(
  runId: string,
  personId: string,
): Promise<PayslipData | null> {
  const [run] = await db
    .select({
      runNumber:      payrollRuns.runNumber,
      payPeriodStart: payrollRuns.payPeriodStart,
      payPeriodEnd:   payrollRuns.payPeriodEnd,
      paymentDate:    payrollRuns.paymentDate,
      currency:       payrollDefinitions.currency,
      legalEntityId:  payrollRuns.legalEntityId,
    })
    .from(payrollRuns)
    .leftJoin(payrollDefinitions, eq(payrollRuns.payrollId, payrollDefinitions.id))
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, TENANT_ID)))
    .limit(1)

  if (!run) return null

  const [result] = await db
    .select({
      basicSalary:          payrollResults.basicSalary,
      housingAllowance:     payrollResults.housingAllowance,
      transportAllowance:   payrollResults.transportAllowance,
      otherAllowances:      payrollResults.otherAllowances,
      overtimePay:          payrollResults.overtimePay,
      bonus:                payrollResults.bonus,
      retroPay:             payrollResults.retroPay,
      totalGrossPay:        payrollResults.totalGrossPay,
      sickLeaveDeduction:   payrollResults.sickLeaveDeduction,
      unpaidLeaveDeduction: payrollResults.unpaidLeaveDeduction,
      gpssaEmployeeDeduct:  payrollResults.gpssaEmployeeDeduct,
      medicalInsuranceDeduct: payrollResults.medicalInsuranceDeduct,
      salaryAdvanceDeduct:  payrollResults.salaryAdvanceDeduct,
      otherDeductions:      payrollResults.otherDeductions,
      totalDeductions:      payrollResults.totalDeductions,
      netPay:               payrollResults.netPay,
      gpssaEmployerContrib: payrollResults.gpssaEmployerContrib,
      eosbProvision:        payrollResults.eosbProvision,
      medicalInsuranceEr:   payrollResults.medicalInsuranceEr,
      totalEmployerCost:    payrollResults.totalEmployerCost,
      ytdGrossPay:          payrollResults.ytdGrossPay,
      ytdNetPay:            payrollResults.ytdNetPay,
      fullNameEn:           persons.fullNameEn,
      personNumber:         persons.personNumber,
      jobTitleEn:           jobs.jobTitleEn,
      departmentEn:         departments.nameEn,
      legalEntityNameEn:    legalEntities.nameEn,
    })
    .from(payrollResults)
    .leftJoin(persons,      eq(payrollResults.personId,      persons.id))
    .leftJoin(jobs,         eq(persons.currentJobId,         jobs.id))
    .leftJoin(departments,  eq(persons.currentDepartmentId,  departments.id))
    .leftJoin(legalEntities, eq(payrollResults.legalEntityId, legalEntities.id))
    .where(and(
      eq(payrollResults.payrollRunId, runId),
      eq(payrollResults.personId, personId),
      eq(payrollResults.tenantId, TENANT_ID),
    ))
    .limit(1)

  if (!result) return null

  const n = (v: unknown) => Number(v ?? 0)

  const lines: PayslipLine[] = [
    // Earnings
    { elementCode: 'BASIC',       elementNameEn: 'Basic Salary',         elementNameAr: 'الراتب الأساسي',         classification: 'EARNINGS' as const, amount: n(result.basicSalary) },
    { elementCode: 'HOUSING',     elementNameEn: 'Housing Allowance',    elementNameAr: 'بدل سكن',                 classification: 'EARNINGS' as const, amount: n(result.housingAllowance) },
    { elementCode: 'TRANSPORT',   elementNameEn: 'Transport Allowance',  elementNameAr: 'بدل مواصلات',             classification: 'EARNINGS' as const, amount: n(result.transportAllowance) },
    { elementCode: 'OTHER_ALLOW', elementNameEn: 'Other Allowances',     elementNameAr: 'بدلات أخرى',              classification: 'EARNINGS' as const, amount: n(result.otherAllowances) },
    { elementCode: 'OVERTIME',    elementNameEn: 'Overtime Pay',         elementNameAr: 'أجر إضافي',               classification: 'EARNINGS' as const, amount: n(result.overtimePay) },
    { elementCode: 'BONUS',       elementNameEn: 'Bonus',                elementNameAr: 'مكافأة',                  classification: 'EARNINGS' as const, amount: n(result.bonus) },
    { elementCode: 'RETRO',       elementNameEn: 'Retro Pay',            elementNameAr: 'أجر أثري',                classification: 'EARNINGS' as const, amount: n(result.retroPay) },
    // Deductions
    { elementCode: 'SICK_DEDUCT',    elementNameEn: 'Sick Leave Deduction',    elementNameAr: 'خصم إجازة مرضية',        classification: 'DEDUCTION' as const, amount: n(result.sickLeaveDeduction) },
    { elementCode: 'UNPAID_DEDUCT',  elementNameEn: 'Unpaid Leave Deduction',  elementNameAr: 'خصم إجازة بدون أجر',     classification: 'DEDUCTION' as const, amount: n(result.unpaidLeaveDeduction) },
    { elementCode: 'GPSSA_EE',       elementNameEn: 'GPSSA (Employee)',         elementNameAr: 'الهيئة العامة للمعاشات', classification: 'DEDUCTION' as const, amount: n(result.gpssaEmployeeDeduct) },
    { elementCode: 'MED_INS_EE',     elementNameEn: 'Medical Insurance (EE)',   elementNameAr: 'تأمين طبي (الموظف)',     classification: 'DEDUCTION' as const, amount: n(result.medicalInsuranceDeduct) },
    { elementCode: 'ADVANCE_DEDUCT', elementNameEn: 'Salary Advance',           elementNameAr: 'سلفة راتب',              classification: 'DEDUCTION' as const, amount: n(result.salaryAdvanceDeduct) },
    { elementCode: 'OTHER_DEDUCT',   elementNameEn: 'Other Deductions',         elementNameAr: 'خصومات أخرى',            classification: 'DEDUCTION' as const, amount: n(result.otherDeductions) },
  ].filter(l => l.amount !== 0)

  return {
    runNumber:         run.runNumber,
    payPeriodStart:    String(run.payPeriodStart),
    payPeriodEnd:      String(run.payPeriodEnd),
    paymentDate:       String(run.paymentDate),
    personId,
    employeeNumber:    result.personNumber ?? null,
    fullNameEn:        result.fullNameEn ?? '',
    jobTitleEn:        result.jobTitleEn ?? null,
    departmentEn:      result.departmentEn ?? null,
    legalEntityNameEn: result.legalEntityNameEn ?? '',
    currency:          run.currency ?? 'AED',
    lines,
    totalGrossPay:     n(result.totalGrossPay),
    totalDeductions:   n(result.totalDeductions),
    netPay:            n(result.netPay),
    totalEmployerCost: n(result.totalEmployerCost),
    eosbProvision:     n(result.eosbProvision),
    ytdGrossPay:       n(result.ytdGrossPay),
    ytdNetPay:         n(result.ytdNetPay),
  }
}

/** All confirmed payslips for one employee (self-service). */
export async function getPayslipsForEmployee(personId: string): Promise<
  Array<{ runId: string; runNumber: string; payPeriodStart: string; payPeriodEnd: string; paymentDate: string; netPay: number; status: string }>
> {
  const rows = await db
    .select({
      runId:          payrollRuns.id,
      runNumber:      payrollRuns.runNumber,
      payPeriodStart: payrollRuns.payPeriodStart,
      payPeriodEnd:   payrollRuns.payPeriodEnd,
      paymentDate:    payrollRuns.paymentDate,
      netPay:         payrollResults.netPay,
      status:         payrollRuns.status,
    })
    .from(payrollResults)
    .innerJoin(payrollRuns, eq(payrollResults.payrollRunId, payrollRuns.id))
    .where(and(
      eq(payrollResults.personId, personId),
      eq(payrollResults.tenantId, TENANT_ID),
      sql`${payrollRuns.status} IN ('APPROVED','SIF_GENERATED','SUBMITTED_TO_BANK','CONFIRMED')`,
    ))
    .orderBy(desc(payrollRuns.paymentDate))

  return rows.map(r => ({
    runId:          r.runId,
    runNumber:      r.runNumber,
    payPeriodStart: String(r.payPeriodStart),
    payPeriodEnd:   String(r.payPeriodEnd),
    paymentDate:    String(r.paymentDate),
    netPay:         Number(r.netPay ?? 0),
    status:         r.status,
  }))
}

// ── WPS Staging ───────────────────────────────────────────────────────────────

export async function getWpsStagingRows(runId: string): Promise<WpsStagingRow[]> {
  const rows = await db
    .select({
      id:                 wpsSifRecords.id,
      personId:           wpsSifRecords.personId,
      employeeNumber:     persons.personNumber,
      fullNameEn:         persons.fullNameEn,
      iban:               wpsSifRecords.iban,
      routingCode:        wpsSifRecords.routingCode,
      netPayAed:          wpsSifRecords.netPayAed,
      sifStatus:          wpsSifRecords.sifStatus,
      exclusionReason:    wpsSifRecords.exclusionReason,
      employerLabourCode: wpsSifRecords.employerLabourCode,
      employeeLabourCard: wpsSifRecords.employeeLabourCard,
      bankConfirmationRef: wpsSifRecords.bankConfirmationRef,
    })
    .from(wpsSifRecords)
    .leftJoin(persons, eq(wpsSifRecords.personId, persons.id))
    .where(and(
      eq(wpsSifRecords.payrollRunId, runId),
      eq(wpsSifRecords.tenantId, TENANT_ID),
    ))
    .orderBy(asc(wpsSifRecords.sifLineNumber))

  return rows.map(r => ({
    id:                  r.id,
    personId:            r.personId,
    employeeNumber:      r.employeeNumber ?? null,
    fullNameEn:          r.fullNameEn ?? '',
    iban:                r.iban,
    routingCode:         r.routingCode,
    netPayAed:           Number(r.netPayAed),
    sifStatus:           r.sifStatus,
    exclusionReason:     r.exclusionReason ?? null,
    employerLabourCode:  r.employerLabourCode,
    employeeLabourCard:  r.employeeLabourCard ?? null,
    bankConfirmationRef: r.bankConfirmationRef ?? null,
  }))
}

// ── EOSB Liability Report ─────────────────────────────────────────────────────

export async function getEosbLiabilityReport(legalEntityId: string): Promise<EosbLiabilityRow[]> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await db
    .select({
      personId:       eosbCalculations.personId,
      employeeNumber: persons.personNumber,
      fullNameEn:     persons.fullNameEn,
      hireDate:       persons.hireDate,
      serviceYears:   eosbCalculations.serviceYears,
      basicSalary:    eosbCalculations.basicSalaryAtCalc,
      eosbFinalAmount: eosbCalculations.eosbFinalAmount,
      legalEntityNameEn: legalEntities.nameEn,
    })
    .from(eosbCalculations)
    .leftJoin(persons,       eq(eosbCalculations.personId, persons.id))
    .leftJoin(legalEntities, eq(eosbCalculations.legalEntityId, legalEntities.id))
    .where(and(
      eq(eosbCalculations.tenantId, TENANT_ID),
      eq(eosbCalculations.legalEntityId, legalEntityId),
      eq(eosbCalculations.calculationType, 'MONTHLY_PROVISION'),
      eq(eosbCalculations.calculationDate, today),
    ))
    .orderBy(desc(eosbCalculations.eosbFinalAmount))

  return rows.map(r => ({
    personId:        r.personId,
    employeeNumber:  r.employeeNumber ?? null,
    fullNameEn:      r.fullNameEn ?? '',
    hireDate:        String(r.hireDate),
    serviceYears:    Number(r.serviceYears),
    basicSalary:     Number(r.basicSalary),
    eosbFinalAmount: Number(r.eosbFinalAmount),
    scheme:          'TRADITIONAL',
  }))
}

// ── Variance Report ───────────────────────────────────────────────────────────

export async function getVarianceReport(runId: string): Promise<VarianceReportRow[]> {
  const rows = await db
    .select({
      personId:          payrollResults.personId,
      fullNameEn:        persons.fullNameEn,
      priorNetPay:       payrollResults.priorMonthNetPay,
      currentNetPay:     payrollResults.netPay,
      variancePct:       payrollResults.variancePct,
      varianceReason:    payrollResults.varianceReason,
      isVarianceFlagged: payrollResults.isVarianceFlagged,
    })
    .from(payrollResults)
    .leftJoin(persons, eq(payrollResults.personId, persons.id))
    .where(and(
      eq(payrollResults.payrollRunId, runId),
      eq(payrollResults.tenantId, TENANT_ID),
      eq(payrollResults.isVarianceFlagged, true),
    ))
    .orderBy(desc(payrollResults.variancePct))

  return rows.map(r => ({
    personId:          r.personId,
    fullNameEn:        r.fullNameEn ?? '',
    priorNetPay:       Number(r.priorNetPay ?? 0),
    currentNetPay:     Number(r.currentNetPay ?? 0),
    variancePct:       Number(r.variancePct ?? 0),
    varianceReason:    r.varianceReason ?? null,
    isVarianceFlagged: r.isVarianceFlagged,
  }))
}

// ── EOSB Estimate (on-demand for self-service) ────────────────────────────────

export async function getEosbEstimateForPerson(
  personId: string,
  legalEntityId: string,
): Promise<EosbEstimate | null> {
  const [person] = await db
    .select({
      nationalityCategory: persons.nationalityCategory,
      hireDate:            persons.hireDate,
      basicSalary:         persons.basicSalary,
    })
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.tenantId, TENANT_ID)))
    .limit(1)

  if (!person || !person.hireDate) return null

  const [entity] = await db
    .select({ eosbScheme: legalEntities.eosbScheme })
    .from(legalEntities)
    .where(eq(legalEntities.id, legalEntityId))
    .limit(1)

  const scheme = (entity?.eosbScheme ?? 'TRADITIONAL') as EosbEstimate['scheme']

  if (person.nationalityCategory === 'UAE_NATIONAL') {
    return {
      asOfDate:         new Date().toISOString().slice(0, 10),
      serviceYears:     0,
      basicSalary:      Number(person.basicSalary ?? 0),
      eosbFinalAmount:  0,
      eosbFirst5Years:  0,
      eosbBeyond5Years: 0,
      isCapped:         false,
      capAmount:        0,
      applies:          false,
      scheme:           'GPSSA',
      ruleRefs:         ['BR-EOSB-005'],
    }
  }

  // Delegate to the pure calculator
  const result = calculateEosb({
    person:          { nationalityCategory: person.nationalityCategory },
    basicSalary:     Number(person.basicSalary ?? 0),
    hireDate:        String(person.hireDate),
    calculationDate: new Date().toISOString().slice(0, 10),
  })

  return {
    asOfDate:         new Date().toISOString().slice(0, 10),
    serviceYears:     result.serviceYears,
    basicSalary:      Number(person.basicSalary ?? 0),
    eosbFinalAmount:  result.eosbFinalAmount,
    eosbFirst5Years:  result.eosbFirst5Years,
    eosbBeyond5Years: result.eosbBeyond5Years,
    isCapped:         result.isCapped,
    capAmount:        result.capAmount,
    applies:          result.applies,
    scheme,
    ruleRefs:         result.ruleRefs,
  }
}

// ── GPSSA / DEWS totals for dashboard ────────────────────────────────────────

export async function getGpssaTotalForRun(runId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(gpssaContributions.totalContribution) })
    .from(gpssaContributions)
    .where(and(
      eq(gpssaContributions.payrollRunId, runId),
      eq(gpssaContributions.tenantId, TENANT_ID),
    ))
  return Number(row?.total ?? 0)
}

export async function getDewsTotalForRun(runId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(dewsContributions.contributionAmount) })
    .from(dewsContributions)
    .where(and(
      eq(dewsContributions.payrollRunId, runId),
      eq(dewsContributions.tenantId, TENANT_ID),
    ))
  return Number(row?.total ?? 0)
}

// ── Salary Distribution (for reports) ────────────────────────────────────────

export async function getSalaryDistribution(runId: string): Promise<SalaryDistributionBand[]> {
  const bands: Array<{ label: string; minAed: number; maxAed: number | null }> = [
    { label: '0 – 5,000',        minAed: 0,      maxAed: 5000 },
    { label: '5,001 – 10,000',   minAed: 5001,   maxAed: 10000 },
    { label: '10,001 – 20,000',  minAed: 10001,  maxAed: 20000 },
    { label: '20,001 – 40,000',  minAed: 20001,  maxAed: 40000 },
    { label: '40,001 – 80,000',  minAed: 40001,  maxAed: 80000 },
    { label: '80,001+',          minAed: 80001,  maxAed: null  },
  ]

  const rows = await db
    .select({ netPay: payrollResults.netPay })
    .from(payrollResults)
    .where(and(eq(payrollResults.payrollRunId, runId), eq(payrollResults.tenantId, TENANT_ID)))

  return bands.map(band => {
    const inBand = rows.filter(r => {
      const v = Number(r.netPay ?? 0)
      return v >= band.minAed && (band.maxAed === null || v <= band.maxAed)
    })
    return {
      label:       band.label,
      minAed:      band.minAed,
      maxAed:      band.maxAed,
      count:       inBand.length,
      totalNetPay: inBand.reduce((s, r) => s + Number(r.netPay ?? 0), 0),
    }
  })
}
