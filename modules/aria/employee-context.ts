'use server'

import { and, asc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import { db }             from '@/lib/db'
import { TENANT_ID }      from '@/lib/constants'
import { formatDMY }      from '@/lib/utils/date-format'
import {
  absenceBalances,
  absenceTypes,
  absenceEntries,
  personDocuments,
  publicHolidays,
  persons,
  departments,
} from '@/drizzle/schema'

export type EmployeeAriaContext = {
  balances: Array<{
    leaveTypeName:    string
    leaveTypeNameAr:  string
    availableDays:    number
    totalEntitlement: number
    colorCode:        'green' | 'amber' | 'red'
  }>
  pendingRequestsCount: number
  nextHoliday: {
    name:      string
    nameAr:    string
    date:      string
    daysUntil: number
  } | null
  expiringDocuments: Array<{
    documentType: string
    expiryDate:   string
    daysUntil:    number
    severity:     'critical' | 'warning' | 'info'
  }>
}

export async function getEmployeeAriaContext(
  personId: string,
): Promise<EmployeeAriaContext> {
  const today       = new Date()
  const todayStr    = today.toISOString().slice(0, 10)
  const in90Days    = new Date(today)
  in90Days.setDate(today.getDate() + 90)
  const in90Str     = in90Days.toISOString().slice(0, 10)
  const currentYear = today.getUTCFullYear()

  try {
    const [balanceRows, pendingRows, holidayRows, documentRows] = await Promise.all([
      db.select({
        typeCode:    absenceTypes.typeCode,
        nameEn:      absenceTypes.typeNameEn,
        nameAr:      absenceTypes.typeNameAr,
        accrued:     absenceBalances.accruedDays,
        taken:       absenceBalances.takenDays,
        closing:     absenceBalances.closingBalanceDays,
      })
        .from(absenceBalances)
        .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
        .where(and(
          eq(absenceBalances.tenantId, TENANT_ID),
          eq(absenceBalances.personId, personId),
          eq(absenceBalances.balanceYear, currentYear),
        ))
        .orderBy(asc(absenceTypes.typeCode))
        .limit(5),

      db.select({ id: absenceEntries.id })
        .from(absenceEntries)
        .where(and(
          eq(absenceEntries.tenantId, TENANT_ID),
          eq(absenceEntries.personId, personId),
          eq(absenceEntries.status, 'PENDING'),
        )),

      db.select({
        nameEn:      publicHolidays.holidayNameEn,
        nameAr:      publicHolidays.holidayNameAr,
        date:        publicHolidays.holidayDate,
      })
        .from(publicHolidays)
        .where(and(
          eq(publicHolidays.tenantId, TENANT_ID),
          eq(publicHolidays.isConfirmed, true),
          gte(publicHolidays.holidayDate, todayStr),
        ))
        .orderBy(asc(publicHolidays.holidayDate))
        .limit(1),

      db.select({
        documentType: personDocuments.documentType,
        expiryDate:   personDocuments.expiryDate,
      })
        .from(personDocuments)
        .where(and(
          eq(personDocuments.tenantId, TENANT_ID),
          eq(personDocuments.personId, personId),
          isNotNull(personDocuments.expiryDate),
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, in90Str),
        ))
        .orderBy(asc(personDocuments.expiryDate))
        .limit(10),
    ])

    const balances = balanceRows
      .filter(b => b.nameEn != null)
      .map(b => {
        const accrued = Number(b.accrued ?? 0)
        const taken   = Number(b.taken ?? 0)
        const avail   = b.closing != null
          ? Math.floor(Number(b.closing))
          : Math.max(0, Math.round(accrued - taken))
        const pct = accrued > 0 ? avail / accrued : 1
        return {
          leaveTypeName:    b.nameEn!,
          leaveTypeNameAr:  b.nameAr ?? b.nameEn!,
          availableDays:    avail,
          totalEntitlement: Math.round(accrued),
          colorCode: (pct > 0.5 ? 'green' : pct >= 0.2 ? 'amber' : 'red') as 'green' | 'amber' | 'red',
        }
      })

    const nextHoliday = holidayRows[0]
      ? (() => {
          const d = new Date(holidayRows[0].date as string)
          const daysUntil = Math.ceil(
            (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          )
          return {
            name:      holidayRows[0].nameEn,
            nameAr:    holidayRows[0].nameAr,
            date:      formatDMY(holidayRows[0].date as string),
            daysUntil,
          }
        })()
      : null

    const expiringDocuments = documentRows
      .filter(d => d.expiryDate != null)
      .map(d => {
        const exp = new Date(d.expiryDate as string)
        const daysUntil = Math.ceil(
          (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        )
        return {
          documentType: d.documentType,
          expiryDate:   formatDMY(d.expiryDate as string),
          daysUntil,
          severity: (
            daysUntil < 30 ? 'critical' : daysUntil < 60 ? 'warning' : 'info'
          ) as 'critical' | 'warning' | 'info',
        }
      })

    return {
      balances,
      pendingRequestsCount: pendingRows.length,
      nextHoliday,
      expiringDocuments,
    }
  } catch (err) {
    console.error('[getEmployeeAriaContext]', err)
    return {
      balances:             [],
      pendingRequestsCount: 0,
      nextHoliday:          null,
      expiringDocuments:    [],
    }
  }
}

// ── Manager ARIA context ───────────────────────────────────────────────────

export type ManagerAriaContext = {
  /** Number of direct reports */
  teamSize: number
  /** Names of direct reports (first + last, EN) */
  teamMemberNames: string[]
  /** Number of direct reports currently on approved leave today */
  onLeaveTodayCount: number
  /** Number of workflow approvals currently pending for this manager */
  pendingApprovalsCount: number
}

/**
 * Fetches team context for a MANAGER role ARIA session.
 * Scoped strictly to the manager's direct reports (persons.lineManagerId).
 * No org-wide data is included.
 */
export async function getManagerAriaContext(
  managerPersonId: string,
): Promise<ManagerAriaContext> {
  const today = new Date().toISOString().slice(0, 10)

  try {
    // Direct reports
    const reportRows = await db
      .select({
        id:          persons.id,
        firstNameEn: persons.firstNameEn,
        lastNameEn:  persons.lastNameEn,
      })
      .from(persons)
      .where(and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.lineManagerId, managerPersonId),
        eq(persons.isActive, true),
      ))

    const teamSize = reportRows.length
    const teamMemberNames = reportRows.map(r =>
      `${r.firstNameEn ?? ''} ${r.lastNameEn ?? ''}`.trim(),
    )

    if (teamSize === 0) {
      return { teamSize: 0, teamMemberNames: [], onLeaveTodayCount: 0, pendingApprovalsCount: 0 }
    }

    const reportIds = reportRows.map(r => r.id)

    // On leave today (approved)
    const [onLeaveRows, pendingApprovalRows] = await Promise.all([
      db
        .select({ id: absenceEntries.id })
        .from(absenceEntries)
        .where(and(
          inArray(absenceEntries.personId, reportIds),
          lte(absenceEntries.startDate, today),
          gte(absenceEntries.endDate, today),
          eq(absenceEntries.status, 'APPROVED'),
        )),

      // Pending leave requests (PENDING approval status) for direct reports
      db
        .select({ id: absenceEntries.id })
        .from(absenceEntries)
        .where(and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'PENDING'),
        )),
    ])

    return {
      teamSize,
      teamMemberNames,
      onLeaveTodayCount:    onLeaveRows.length,
      pendingApprovalsCount: pendingApprovalRows.length,
    }
  } catch (err) {
    console.error('[getManagerAriaContext]', err)
    return { teamSize: 0, teamMemberNames: [], onLeaveTodayCount: 0, pendingApprovalsCount: 0 }
  }
}
