import { redirect } from 'next/navigation'
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { absenceBalances, absenceEntries, absenceTypes, personDocuments, persons, workSchedules, workerAssignments, workflowStepInstances } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { EmployeeHero }        from '@/components/employee/EmployeeHero'
import { LeaveShell }          from '@/components/employee/LeaveShell'
import { RecentActivityCard }  from '@/components/employee/RecentActivityCard'
import { UpcomingTimeOffCard } from '@/components/employee/UpcomingTimeOffCard'
import { TeamOutCard }         from '@/components/employee/TeamOutCard'
import { CompanyUpdatesCard }  from '@/components/employee/CompanyUpdatesCard'
import { ExpiringDocsList }    from '@/components/employee/ExpiringDocsList'
import { SectionHeader }       from '@/components/ui/SectionHeader'
import { DsarDownloadButton }  from './DsarDownloadButton'
import { isoDateAddDays }      from '@/lib/date-utils'
import { getLocale }           from '@/lib/locale-server'

export const metadata = { title: 'My HR · Self Service' }

// Annual entitlement ceilings — used as the denominator in balance display.
// Remaining/used values always come from DB; these are the policy maximums.
const LEAVE_TYPE_TOTALS: Record<string, { label: string; total: number }> = {
  ANNUAL:    { label: 'Annual',    total: 0 },
  SICK:      { label: 'Sick',      total: 0 },
  EMERGENCY: { label: 'Emergency', total: 0  },
}

export default async function EmployeeDashboardPage() {
  const locale = await getLocale()
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const personId = session.user.personId
  if (!personId) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          {locale === 'ar'
            ? 'لم يتم ربط حسابك بسجل شخص بعد. يرجى التواصل مع مسؤول الموارد البشرية لإتمام التسجيل.'
            : 'Your sign-in is not linked to a person record yet. Please contact HR Admin to complete onboarding.'}
        </p>
      </div>
    )
  }

  const uaeHour      = (new Date().getUTCHours() + 4) % 24
  const greeting     = locale === 'ar'
    ? (uaeHour < 12 ? 'صباح الخير' : uaeHour < 18 ? 'مساء الخير' : 'مساء النور')
    : (uaeHour < 12 ? 'Good morning' : uaeHour < 18 ? 'Good afternoon' : 'Good evening')
  const today        = new Date().toISOString().slice(0, 10)
  const horizon90    = isoDateAddDays(today, 90)
  const balanceYear  = new Date().getUTCFullYear()
  const todayDisplay = new Date().toLocaleDateString('en-AE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const monthStart = today.slice(0, 7) + '-01'
  const monthEnd   = isoDateAddDays(
    new Date(today.slice(0, 7) + '-01').toISOString().slice(0, 10),
    new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate() - 1,
  )

  const [balances, recentRequests, expiringDocs, upcomingApproved, teamOut, personRows, weekSchedule] = await Promise.all([
    // 1. Leave balances for current year
    db.select({
      code:    absenceTypes.typeCode,
      label:   absenceTypes.typeNameEn,
      entitlement: absenceTypes.maxDaysPerYear,
      taken:   absenceBalances.takenDays,
      accrued: absenceBalances.accruedDays,
      closing: absenceBalances.closingBalanceDays,
    })
      .from(absenceBalances)
      .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.personId, personId),
        eq(absenceBalances.balanceYear, balanceYear),
      ))
      .orderBy(asc(absenceTypes.typeCode)),

    // 2. Last 8 leave requests (all statuses) — includes workflowInstanceId for approver enrichment
    db.select({
      id:                 absenceEntries.id,
      typeCode:           absenceTypes.typeCode,
      typeLabel:          absenceTypes.typeNameEn,
      durationDays:       absenceEntries.durationDays,
      startDate:          absenceEntries.startDate,
      endDate:            absenceEntries.endDate,
      createdDate:        absenceEntries.createdDate,
      status:             absenceEntries.status,
      notes:              absenceEntries.notes,
      workflowInstanceId: absenceEntries.workflowInstanceId,
    })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        eq(absenceEntries.personId, personId),
      ))
      .orderBy(desc(absenceEntries.createdDate))
      .limit(8),

    // 3. Documents expiring in next 90 days
    db.select({
      id:             personDocuments.id,
      documentType:   personDocuments.documentType,
      documentNumber: personDocuments.documentNumber,
      expiryDate:     personDocuments.expiryDate,
      documentStatus: personDocuments.documentStatus,
    })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.tenantId, TENANT_ID),
        eq(personDocuments.personId, personId),
        isNotNull(personDocuments.expiryDate),
        gte(personDocuments.expiryDate, today),
        lte(personDocuments.expiryDate, horizon90),
      ))
      .orderBy(asc(personDocuments.expiryDate))
      .limit(20),

    // 4. Upcoming approved leave
    db.select({
      id:           absenceEntries.id,
      typeCode:     absenceTypes.typeCode,
      typeLabel:    absenceTypes.typeNameEn,
      startDate:    absenceEntries.startDate,
      endDate:      absenceEntries.endDate,
      durationDays: absenceEntries.durationDays,
      notes:        absenceEntries.notes,
    })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        eq(absenceEntries.personId, personId),
        eq(absenceEntries.status, 'APPROVED'),
        gte(absenceEntries.startDate, today),
      ))
      .orderBy(asc(absenceEntries.startDate))
      .limit(3),

    // 5. Team members out this month
    db.select({
      id:        absenceEntries.id,
      firstName: persons.firstNameEn,
      lastName:  persons.lastNameEn,
      typeCode:  absenceTypes.typeCode,
      typeLabel: absenceTypes.typeNameEn,
      startDate: absenceEntries.startDate,
      endDate:   absenceEntries.endDate,
    })
      .from(absenceEntries)
      .leftJoin(persons,      eq(absenceEntries.personId, persons.id))
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        ne(absenceEntries.personId, personId),
        eq(absenceEntries.status, 'APPROVED'),
        lte(absenceEntries.startDate, monthEnd),
        gte(absenceEntries.endDate,   monthStart),
      ))
      .orderBy(asc(absenceEntries.startDate))
      .limit(4),

    // 6. Person record — probation status for leave eligibility banner
    db.select({
      hireDate:         persons.hireDate,
      probationEndDate: persons.probationEndDate,
      probationStatus:  persons.probationStatus,
    })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1),

    // 7. Employee's assigned work schedule — contracted weekly hours for the badge
    db.select({ totalHoursPerWeek: workSchedules.totalHoursPerWeek })
      .from(workerAssignments)
      .innerJoin(workSchedules, eq(workerAssignments.workScheduleId, workSchedules.id))
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, personId),
        eq(workerAssignments.isCurrent, true),
        isNotNull(workerAssignments.workScheduleId),
      ))
      .limit(1),
  ])

  const personData    = personRows[0] ?? null
  const probEndDate   = personData?.probationEndDate ?? null
  // BR-37: employee is on probation if status=ACTIVE and today is on or before probation end date
  const isOnProbation = !!(
    personData?.probationStatus === 'ACTIVE' &&
    probEndDate &&
    today <= probEndDate
  )

  // Enrich PENDING recent requests with pending-step approver name + since date.
  const pendingInstanceIds = recentRequests
    .filter(r => r.status === 'PENDING' && r.workflowInstanceId)
    .map(r => r.workflowInstanceId as string)

  const approverMap = new Map<string, { name: string | null; since: Date | string | null }>()

  if (pendingInstanceIds.length > 0) {
    const approverAlias = alias(persons, 'approver')
    const delegateAlias = alias(persons, 'delegate')
    const stepRows = await db
      .select({
        instanceId:   workflowStepInstances.instanceId,
        approverName: approverAlias.fullNameEn,
        delegateName: delegateAlias.fullNameEn,
        since:        workflowStepInstances.createdDate,
      })
      .from(workflowStepInstances)
      .leftJoin(approverAlias, eq(workflowStepInstances.assignedToPersonId, approverAlias.id))
      .leftJoin(delegateAlias, eq(workflowStepInstances.delegatedToPersonId, delegateAlias.id))
      .where(and(
        inArray(workflowStepInstances.instanceId, pendingInstanceIds),
        eq(workflowStepInstances.status, 'PENDING'),
      ))
    for (const s of stepRows) {
      approverMap.set(s.instanceId, {
        name:  s.delegateName ?? s.approverName ?? null,
        since: s.since ?? null,
      })
    }
  }

  const firstName     = session.user.name?.split(' ')[0] ?? 'there'
  const pendingCount  = recentRequests.filter(r => r.status === 'PENDING').length
  const hoursThisWeek = Math.round(
    parseFloat(weekSchedule[0]?.totalHoursPerWeek ?? '0') * 10
  ) / 10

  // Build display balances from real DB rows only.
  // total = annual policy entitlement (denominator); remaining/used = live from DB.
  // When no accrual row exists yet (new employee / probation), remaining defaults to 0.
  const leaveBalances = ['ANNUAL', 'SICK', 'EMERGENCY'].map(code => {
    const b    = balances.find(x => x.code === code)
    const meta = LEAVE_TYPE_TOTALS[code]
    const total     = b?.entitlement != null ? Number(b.entitlement) : meta.total
    const used      = b ? Math.round(Number(b.taken))   : 0
    const remaining = b?.closing != null ? Math.floor(Number(b.closing)) : 0
    return { code, label: b?.label ?? meta.label, remaining, total, used }
  })

  return (
    <div className="page-in" style={{ padding: 'calc(24px * var(--density))', width: '100%', boxSizing: 'border-box' }}>

      <EmployeeHero
        firstName={firstName}
        greeting={greeting}
        todayDisplay={todayDisplay}
        pendingCount={pendingCount}
        hoursThisWeek={hoursThisWeek}
        locale={locale}
      />

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%', marginTop: 20 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <LeaveShell
            balances={leaveBalances}
            locale={locale}
            isOnProbation={isOnProbation}
            probationEndDate={probEndDate}
          />
          <RecentActivityCard
            items={recentRequests.map(r => ({
              ...r,
              pendingApproverName:  r.workflowInstanceId ? (approverMap.get(r.workflowInstanceId)?.name  ?? null) : null,
              pendingApproverSince: r.workflowInstanceId ? (approverMap.get(r.workflowInstanceId)?.since ?? null) : null,
            }))}
            locale={locale}
          />
        </div>
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <UpcomingTimeOffCard upcoming={upcomingApproved} locale={locale} />
          <TeamOutCard teamOut={teamOut} locale={locale} />
          <CompanyUpdatesCard locale={locale} />
        </div>
      </div>

      {expiringDocs.length > 0 && (
        <div className="space-y-3 mt-6">
          <SectionHeader title="Documents Expiring Soon" titleAr="وثائق توشك على الانتهاء" />
          <ExpiringDocsList docs={expiringDocs} today={today} locale={locale} />
        </div>
      )}

      <div className="flex justify-end pt-4 mt-2">
        <DsarDownloadButton personId={personId} locale={locale} />
      </div>

    </div>
  )
}
