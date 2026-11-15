'use server'

import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import {
  persons,
  departments,
  absenceEntries,
  absenceTypes,
  absenceBalances,
  contracts,
  personDocuments,
  payrollRuns,
  payrollResults,
  workerAssignments,
} from '@/drizzle/schema'
import { eq, and, gte, lte, count, sql, desc, asc, inArray, ne, or } from 'drizzle-orm'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HRAdminDashboardData {
  headcount: number
  onLeaveToday: number
  pendingApprovals: number
  expiringDocsCount: number
  byDepartment: Array<{ dept: string; count: number }>
  absenceToday: Array<{ typeName: string; count: number }>
  expiringContracts: number
  expiringDocs: Array<{ docType: string; count: number }>
  sickOver14Days: number
}

export interface ManagerDashboardData {
  teamSize: number
  onLeaveToday: number
  pendingApprovals: Array<{
    id: string
    personName: string | null
    typeName: string
    startDate: string
    endDate: string
    durationDays: string
    balanceAfterDays: string | null
  }>
  teamOnLeaveToday: Array<{
    personName: string | null
    typeName: string
    endDate: string
  }>
}

export interface HRDirectorDashboardData {
  headcount: number
  newHiresYtd: number
  terminationsYtd: number
  pendingApprovals: number
  expiringContracts: number
  byDepartment: Array<{ dept: string; count: number }>
  byNationality: Array<{ category: string; count: number }>
  expiringDocs: Array<{ docType: string; count: number }>
  onLeaveToday: number
}

export interface FinanceDashboardData {
  latestRun: {
    employeeCount: number
    totalNetPay: string
    totalEmployerCost: string
    totalGrossPay: string
    status: string
    payPeriodEnd: string
  } | null
  costBreakdown: {
    basicSalary: number
    housingAllowance: number
    transportAllowance: number
    otherAllowances: number
    gpssaEmployer: number
    eosbProvision: number
    totalNetPay: number
    totalEmployerCost: number
  }
}

export interface EmployeeDashboardData {
  personName: string | null
  leaveBalances: Array<{
    typeName: string
    takenDays: string
    accruedDays: string
    pendingDays: string
    closingBalanceDays: string | null
    openingBalanceDays: string
  }>
  expiringDocs: Array<{
    documentType: string
    documentTitle: string
    expiryDate: string | null
  }>
  pendingLeave: Array<{
    id: string
    typeName: string
    startDate: string
    endDate: string
    durationDays: string
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateStrings() {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const thirtyDays = new Date()
  thirtyDays.setDate(thirtyDays.getDate() + 30)
  const thirtyDaysStr = thirtyDays.toISOString().split('T')[0]

  const ninetyDays = new Date()
  ninetyDays.setDate(ninetyDays.getDate() + 90)
  const ninetyDaysStr = ninetyDays.toISOString().split('T')[0]

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]

  const currentYear = today.getFullYear()

  return {
    todayStr,
    thirtyDaysStr,
    ninetyDaysStr,
    thirtyDaysAgoStr,
    startOfYear,
    currentYear,
  }
}

// ── HR Admin Dashboard ────────────────────────────────────────────────────────

export async function getHRAdminDashboardData(): Promise<HRAdminDashboardData> {
  const empty: HRAdminDashboardData = {
    headcount: 0,
    onLeaveToday: 0,
    pendingApprovals: 0,
    expiringDocsCount: 0,
    byDepartment: [],
    absenceToday: [],
    expiringContracts: 0,
    expiringDocs: [],
    sickOver14Days: 0,
  }

  try {
    const { todayStr, thirtyDaysStr, thirtyDaysAgoStr } = getDateStrings()

    // 1. Headcount
    const [headcountRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 2. On leave today
    const [onLeaveTodayRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    // 3. Pending approvals
    const [pendingApprovalsRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'PENDING'),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    // 4. Expiring docs count
    const [expiringDocsCountRow] = await db
      .select({ value: count() })
      .from(personDocuments)
      .where(
        and(
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, thirtyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
          eq(personDocuments.tenantId, TENANT_ID),
        ),
      )

    // 5. By department
    const byDepartmentRows = await db
      .select({
        dept: departments.nameEn,
        count: count(persons.id),
      })
      .from(persons)
      .innerJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )
      .groupBy(departments.nameEn)
      .orderBy(desc(count(persons.id)))
      .limit(8)

    // 6. Absence breakdown today
    const absenceTodayRows = await db
      .select({
        typeName: absenceTypes.typeNameEn,
        count: count(absenceEntries.id),
      })
      .from(absenceEntries)
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )
      .groupBy(absenceTypes.typeNameEn)

    // 7. Expiring contracts
    const [expiringContractsRow] = await db
      .select({ value: count() })
      .from(contracts)
      .where(
        and(
          gte(contracts.endDate, todayStr),
          lte(contracts.endDate, thirtyDaysStr),
          eq(contracts.status, 'ACTIVE'),
          eq(contracts.tenantId, TENANT_ID),
        ),
      )

    // 8. Expiring docs by type
    const expiringDocsRows = await db
      .select({
        docType: personDocuments.documentType,
        count: count(personDocuments.id),
      })
      .from(personDocuments)
      .where(
        and(
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, thirtyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
          eq(personDocuments.tenantId, TENANT_ID),
        ),
      )
      .groupBy(personDocuments.documentType)

    // 9. Sick over 14 days (in last 30 days)
    const [sickOver14Row] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          gte(absenceEntries.durationDays, '14'),
          gte(absenceEntries.startDate, thirtyDaysAgoStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    return {
      headcount: headcountRow?.value ?? 0,
      onLeaveToday: onLeaveTodayRow?.value ?? 0,
      pendingApprovals: pendingApprovalsRow?.value ?? 0,
      expiringDocsCount: expiringDocsCountRow?.value ?? 0,
      byDepartment: byDepartmentRows.map((r) => ({
        dept: r.dept ?? '',
        count: Number(r.count),
      })),
      absenceToday: absenceTodayRows.map((r) => ({
        typeName: r.typeName ?? '',
        count: Number(r.count),
      })),
      expiringContracts: expiringContractsRow?.value ?? 0,
      expiringDocs: expiringDocsRows.map((r) => ({
        docType: r.docType ?? '',
        count: Number(r.count),
      })),
      sickOver14Days: sickOver14Row?.value ?? 0,
    }
  } catch (err) {
    console.error('[getHRAdminDashboardData]', err)
    return empty
  }
}

// ── Manager Dashboard ─────────────────────────────────────────────────────────

export async function getManagerDashboardData(managerId: string): Promise<ManagerDashboardData> {
  const empty: ManagerDashboardData = {
    teamSize: 0,
    onLeaveToday: 0,
    pendingApprovals: [],
    teamOnLeaveToday: [],
  }

  try {
    const { todayStr } = getDateStrings()

    // 1. Direct reports
    const directReports = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(
        and(
          eq(persons.lineManagerId, managerId),
          eq(persons.tenantId, TENANT_ID),
          eq(persons.assignmentStatus, 'ACTIVE'),
        ),
      )

    const teamSize = directReports.length
    const reportIds = directReports.map((p) => p.id)

    if (reportIds.length === 0) {
      return { ...empty, teamSize: 0 }
    }

    // 3. Pending approvals
    const pendingRows = await db
      .select({
        id: absenceEntries.id,
        personName: persons.fullNameEn,
        typeName: absenceTypes.typeNameEn,
        startDate: absenceEntries.startDate,
        endDate: absenceEntries.endDate,
        durationDays: absenceEntries.durationDays,
        balanceAfterDays: sql<string | null>`null`,
      })
      .from(absenceEntries)
      .innerJoin(persons, eq(absenceEntries.personId, persons.id))
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'PENDING'),
        ),
      )
      .orderBy(asc(absenceEntries.createdDate))

    // 4. On leave today
    const [onLeaveTodayRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
        ),
      )

    const teamOnLeaveTodayRows = await db
      .select({
        personName: persons.fullNameEn,
        typeName: absenceTypes.typeNameEn,
        endDate: absenceEntries.endDate,
      })
      .from(absenceEntries)
      .innerJoin(persons, eq(absenceEntries.personId, persons.id))
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
        ),
      )

    return {
      teamSize,
      onLeaveToday: onLeaveTodayRow?.value ?? 0,
      pendingApprovals: pendingRows.map((r) => ({
        id: r.id,
        personName: r.personName,
        typeName: r.typeName ?? '',
        startDate: r.startDate ?? '',
        endDate: r.endDate ?? '',
        durationDays: r.durationDays ?? '',
        balanceAfterDays: r.balanceAfterDays,
      })),
      teamOnLeaveToday: teamOnLeaveTodayRows.map((r) => ({
        personName: r.personName,
        typeName: r.typeName ?? '',
        endDate: r.endDate ?? '',
      })),
    }
  } catch (err) {
    console.error('[getManagerDashboardData]', err)
    return empty
  }
}

// ── HR Director Dashboard ─────────────────────────────────────────────────────

export async function getHRDirectorDashboardData(): Promise<HRDirectorDashboardData> {
  const empty: HRDirectorDashboardData = {
    headcount: 0,
    newHiresYtd: 0,
    terminationsYtd: 0,
    pendingApprovals: 0,
    expiringContracts: 0,
    byDepartment: [],
    byNationality: [],
    expiringDocs: [],
    onLeaveToday: 0,
  }

  try {
    const { todayStr, thirtyDaysStr, startOfYear } = getDateStrings()

    // 1. Headcount
    const [headcountRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 2. New hires YTD
    const [newHiresRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          gte(persons.hireDate, startOfYear),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 3. Terminations YTD
    const [terminationsRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'TERMINATED'),
          gte(persons.separationDate, startOfYear),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 4. Pending approvals
    const [pendingApprovalsRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'PENDING'),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    // 5. Expiring contracts
    const [expiringContractsRow] = await db
      .select({ value: count() })
      .from(contracts)
      .where(
        and(
          gte(contracts.endDate, todayStr),
          lte(contracts.endDate, thirtyDaysStr),
          eq(contracts.status, 'ACTIVE'),
          eq(contracts.tenantId, TENANT_ID),
        ),
      )

    // 6. By department
    const byDepartmentRows = await db
      .select({
        dept: departments.nameEn,
        count: count(persons.id),
      })
      .from(persons)
      .innerJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )
      .groupBy(departments.nameEn)
      .orderBy(desc(count(persons.id)))
      .limit(8)

    // 7. By nationality category
    const byNationalityRows = await db
      .select({
        category: persons.nationalityCategory,
        count: count(persons.id),
      })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )
      .groupBy(persons.nationalityCategory)
      .orderBy(desc(count(persons.id)))

    // 8. Expiring docs by type
    const expiringDocsRows = await db
      .select({
        docType: personDocuments.documentType,
        count: count(personDocuments.id),
      })
      .from(personDocuments)
      .where(
        and(
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, thirtyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
          eq(personDocuments.tenantId, TENANT_ID),
        ),
      )
      .groupBy(personDocuments.documentType)

    // 9. On leave today
    const [onLeaveTodayRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    return {
      headcount: headcountRow?.value ?? 0,
      newHiresYtd: newHiresRow?.value ?? 0,
      terminationsYtd: terminationsRow?.value ?? 0,
      pendingApprovals: pendingApprovalsRow?.value ?? 0,
      expiringContracts: expiringContractsRow?.value ?? 0,
      byDepartment: byDepartmentRows.map((r) => ({
        dept: r.dept ?? '',
        count: Number(r.count),
      })),
      byNationality: byNationalityRows.map((r) => ({
        category: r.category ?? 'Unknown',
        count: Number(r.count),
      })),
      expiringDocs: expiringDocsRows.map((r) => ({
        docType: r.docType ?? '',
        count: Number(r.count),
      })),
      onLeaveToday: onLeaveTodayRow?.value ?? 0,
    }
  } catch (err) {
    console.error('[getHRDirectorDashboardData]', err)
    return empty
  }
}

// ── Finance Dashboard ─────────────────────────────────────────────────────────

export async function getFinanceDashboardData(): Promise<FinanceDashboardData> {
  const emptyBreakdown = {
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowances: 0,
    gpssaEmployer: 0,
    eosbProvision: 0,
    totalNetPay: 0,
    totalEmployerCost: 0,
  }

  try {
    // 1. Latest payroll run
    const [latestRun] = await db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.tenantId, TENANT_ID))
      .orderBy(desc(payrollRuns.payPeriodEnd))
      .limit(1)

    if (!latestRun) {
      return { latestRun: null, costBreakdown: emptyBreakdown }
    }

    // 2. Sum payrollResults for that run
    const [sums] = await db
      .select({
        basicSalary:         sql<number>`COALESCE(SUM(${payrollResults.basicSalary}), 0)`,
        housingAllowance:    sql<number>`COALESCE(SUM(${payrollResults.housingAllowance}), 0)`,
        transportAllowance:  sql<number>`COALESCE(SUM(${payrollResults.transportAllowance}), 0)`,
        otherAllowances:     sql<number>`COALESCE(SUM(${payrollResults.otherAllowances}), 0)`,
        gpssaEmployer:       sql<number>`COALESCE(SUM(${payrollResults.gpssaEmployerContrib}), 0)`,
        eosbProvision:       sql<number>`COALESCE(SUM(${payrollResults.eosbProvision}), 0)`,
        totalNetPay:         sql<number>`COALESCE(SUM(${payrollResults.netPay}), 0)`,
        totalEmployerCost:   sql<number>`COALESCE(SUM(${payrollResults.totalEmployerCost}), 0)`,
        totalGrossPay:       sql<number>`COALESCE(SUM(${payrollResults.totalGrossPay}), 0)`,
      })
      .from(payrollResults)
      .where(eq(payrollResults.payrollRunId, latestRun.id))

    return {
      latestRun: {
        employeeCount:    latestRun.employeeCount ?? 0,
        totalNetPay:      String(latestRun.totalNetPay ?? 0),
        totalEmployerCost: String(latestRun.totalEmployerCost ?? 0),
        totalGrossPay:    String(sums?.totalGrossPay ?? 0),
        status:           latestRun.status ?? '',
        payPeriodEnd:     latestRun.payPeriodEnd ?? '',
      },
      costBreakdown: {
        basicSalary:       Number(sums?.basicSalary ?? 0),
        housingAllowance:  Number(sums?.housingAllowance ?? 0),
        transportAllowance: Number(sums?.transportAllowance ?? 0),
        otherAllowances:   Number(sums?.otherAllowances ?? 0),
        gpssaEmployer:     Number(sums?.gpssaEmployer ?? 0),
        eosbProvision:     Number(sums?.eosbProvision ?? 0),
        totalNetPay:       Number(sums?.totalNetPay ?? 0),
        totalEmployerCost: Number(sums?.totalEmployerCost ?? 0),
      },
    }
  } catch (err) {
    console.error('[getFinanceDashboardData]', err)
    return { latestRun: null, costBreakdown: emptyBreakdown }
  }
}

// ── Employee Self-Service Dashboard ──────────────────────────────────────────

export async function getEmployeeDashboardData(personId: string): Promise<EmployeeDashboardData> {
  const empty: EmployeeDashboardData = {
    personName: null,
    leaveBalances: [],
    expiringDocs: [],
    pendingLeave: [],
  }

  try {
    const { todayStr, ninetyDaysStr, currentYear } = getDateStrings()

    // 1. Person name
    const [person] = await db
      .select({ fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(eq(persons.id, personId))

    // 2. Leave balances for current year
    const balanceRows = await db
      .select({
        typeName:           absenceTypes.typeNameEn,
        takenDays:          absenceBalances.takenDays,
        accruedDays:        absenceBalances.accruedDays,
        pendingDays:        absenceBalances.pendingDays,
        closingBalanceDays: absenceBalances.closingBalanceDays,
        openingBalanceDays: absenceBalances.openingBalanceDays,
      })
      .from(absenceBalances)
      .innerJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(
        and(
          eq(absenceBalances.personId, personId),
          eq(absenceBalances.balanceYear, currentYear),
        ),
      )

    // 3. Expiring docs within 90 days
    const expiringDocRows = await db
      .select({
        documentType:  personDocuments.documentType,
        documentTitle: personDocuments.documentTitle,
        expiryDate:    personDocuments.expiryDate,
      })
      .from(personDocuments)
      .where(
        and(
          eq(personDocuments.personId, personId),
          lte(personDocuments.expiryDate, ninetyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
        ),
      )
      .orderBy(asc(personDocuments.expiryDate))
      .limit(5)

    // 4. Pending leave requests
    const pendingLeaveRows = await db
      .select({
        id:          absenceEntries.id,
        typeName:    absenceTypes.typeNameEn,
        startDate:   absenceEntries.startDate,
        endDate:     absenceEntries.endDate,
        durationDays: absenceEntries.durationDays,
      })
      .from(absenceEntries)
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          eq(absenceEntries.personId, personId),
          eq(absenceEntries.status, 'PENDING'),
        ),
      )

    return {
      personName: person?.fullNameEn ?? null,
      leaveBalances: balanceRows.map((r) => ({
        typeName:           r.typeName ?? '',
        takenDays:          String(r.takenDays ?? 0),
        accruedDays:        String(r.accruedDays ?? 0),
        pendingDays:        String(r.pendingDays ?? 0),
        closingBalanceDays: r.closingBalanceDays != null ? String(r.closingBalanceDays) : null,
        openingBalanceDays: String(r.openingBalanceDays ?? 0),
      })),
      expiringDocs: expiringDocRows.map((r) => ({
        documentType:  r.documentType ?? '',
        documentTitle: r.documentTitle ?? '',
        expiryDate:    r.expiryDate ?? null,
      })),
      pendingLeave: pendingLeaveRows.map((r) => ({
        id:          r.id,
        typeName:    r.typeName ?? '',
        startDate:   r.startDate ?? '',
        endDate:     r.endDate ?? '',
        durationDays: String(r.durationDays ?? 0),
      })),
    }
  } catch (err) {
    console.error('[getEmployeeDashboardData]', err)
    return empty
  }
}
