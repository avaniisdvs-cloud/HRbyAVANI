import { redirect }       from 'next/navigation'
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { auth }            from '@/lib/auth'
import { db }              from '@/lib/db'
import {
  absenceBalances,
  absenceEntries,
  absenceTypes,
  departments,
  legalEntities,
  persons,
  positions,
  publicHolidays,
} from '@/drizzle/schema'
import { workflowStepInstances } from '@/drizzle/schema/workflow-engine'
import { getActionableApprovalInbox } from '@/modules/workflow'
import { TENANT_ID }       from '@/lib/constants'
import { getLocale }       from '@/lib/locale-server'
import { ManagerDashboard } from '@/components/dashboard/ManagerDashboard'
import { AdminDashboard }   from '@/components/dashboard/AdminDashboard'
import type { DeptRow, LeaveUtilRow, UpcomingHoliday } from '@/components/dashboard/AdminDashboard'
import type { TeamMember, PendingWorkflowItem } from '@/components/dashboard/ManagerDashboard'

export const metadata = { title: 'Dashboard' }

// Format a date column value (string | Date | null) to "DD Mon YYYY" for display
function fmtDate(d: string | Date | null): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function HrAdminDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale  = await getLocale()
  const role    = session.user.role
  const entityId = session.user.legalEntityId ?? null

  if (role === 'EMPLOYEE') redirect('/me')

  // ── Manager branch ──────────────────────────────────────────────────────
  if (role === 'MANAGER') {
    const managerId = session.user.personId ?? null

    // Team members (persons who report to this manager)
    const rawTeam = managerId
      ? await db
          .select({
            id:         persons.id,
            fullNameEn: persons.fullNameEn,
            jobTitleEn: positions.positionTitleEn,
            status:     persons.assignmentStatus,
          })
          .from(persons)
          .leftJoin(positions, eq(persons.currentPositionId, positions.id))
          .where(and(
            eq(persons.tenantId, TENANT_ID),
            eq(persons.lineManagerId, managerId),
            eq(persons.isActive, true),
          ))
          .orderBy(asc(persons.fullNameEn))
      : []

    const teamPersonIds = rawTeam.map(m => m.id)

    // On-leave this calendar month for the team
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    const [{ onLeaveThisMonth }] = teamPersonIds.length > 0
      ? await db
          .select({ onLeaveThisMonth: count() })
          .from(absenceEntries)
          .where(and(
            eq(absenceEntries.tenantId, TENANT_ID),
            eq(absenceEntries.status, 'APPROVED'),
            inArray(absenceEntries.personId, teamPersonIds),
            lte(absenceEntries.startDate, monthEnd),
            gte(absenceEntries.endDate, monthStart),
          ))
      : [{ onLeaveThisMonth: 0 }]

    // Pending approvals — derived from THE single source of truth so this card
    // and "Needs your review" can never disagree with the Approvals page,
    // /workflows, or the notification bell. Only genuinely actionable items
    // (PENDING step assigned/delegated to me, live workflow, non-terminal
    // resource) are counted; a CANCELLED leave whose workflow row was never
    // reconciled is correctly excluded here just as it is on /approvals.
    const inbox = await getActionableApprovalInbox()
    const actionableInbox = inbox.filter(r => r.isActionable)

    const pendingItems: PendingWorkflowItem[] = actionableInbox.slice(0, 10).map(r => ({
      id:           r.stepInstanceId,
      personNameEn: r.initiatorName ?? null,
      detail:       `${r.resourceType === 'absence_entries' ? (r.leaveTypeName ?? 'Leave Request') : r.workflowNameEn} · submitted ${fmtDate(r.startedAt)}`,
      type:         /timesheet|overtime/.test(r.resourceType) ? 'TIMESHEET' : 'LEAVE',
    }))

    const teamMembers: TeamMember[] = rawTeam.map(m => ({
      id:         m.id,
      fullNameEn: m.fullNameEn,
      jobTitleEn: m.jobTitleEn ?? null,
      status:     m.status,
    }))

    return (
      <ManagerDashboard
        userName={session.user.name ?? 'Manager'}
        locale={locale}
        teamSize={teamMembers.length}
        pendingApprovals={actionableInbox.length}
        onLeaveThisMonth={Number(onLeaveThisMonth)}
        teamMembers={teamMembers}
        pendingItems={pendingItems}
      />
    )
  }

  // ── Admin / Director / Super-admin branch ───────────────────────────────

  // Entity scope: SUPER_ADMIN sees all; others see their own entity
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const today           = new Date().toISOString().slice(0, 10)
  const ninetyDaysLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const year            = new Date().getUTCFullYear()
  const currentPersonId = session.user.personId ?? null

  // Build condition arrays before parallelising so each query shares the same
  // scope derivation logic (isSuperAdmin, entityId).
  const headcountConds = [
    eq(persons.tenantId, TENANT_ID),
    eq(persons.assignmentStatus, 'ACTIVE'),
    eq(persons.isActive, true),
    ...(!isSuperAdmin && entityId ? [eq(persons.legalEntityId, entityId)] : []),
  ]

  const deptConds = [
    eq(departments.tenantId, TENANT_ID),
    eq(departments.isActive, true),
    ...(!isSuperAdmin && entityId ? [eq(departments.legalEntityId, entityId)] : []),
  ]

  // Entity-scoped for non-SUPER_ADMIN so the count reconciles exactly with the
  // "On Leave Today" drill-down (/absence?status=APPROVED&fromDate=…&toDate=…),
  // which auto-scopes to the caller's legal entity inside listLeaveRequests().
  const leaveTodayConds = [
    eq(absenceEntries.tenantId, TENANT_ID),
    eq(absenceEntries.status, 'APPROVED'),
    lte(absenceEntries.startDate, today),
    gte(absenceEntries.endDate, today),
    ...(!isSuperAdmin && entityId ? [eq(absenceEntries.legalEntityId, entityId)] : []),
  ]

  const balanceConds = [
    eq(absenceBalances.tenantId, TENANT_ID),
    eq(absenceBalances.balanceYear, year),
    ...(!isSuperAdmin && entityId ? [eq(absenceBalances.legalEntityId, entityId)] : []),
  ]

  const holidayConds = [
    eq(publicHolidays.tenantId, TENANT_ID),
    gte(publicHolidays.holidayDate, today),
    lte(publicHolidays.holidayDate, ninetyDaysLater),
    ...(!isSuperAdmin && entityId
      ? [sql`(${publicHolidays.legalEntityId} is null or ${publicHolidays.legalEntityId} = ${entityId})`]
      : []),
  ]

  // ── Parallelise all 6 independent DB queries ──────────────────────────────
  // Previously these were 6 sequential awaits: total time = Σ(query times).
  // With Promise.all they run concurrently on a single connection per round trip:
  // total time ≈ max(query times) — typically 5–8× faster under concurrent load.
  // This also reduces how long each Neon connection is held, preventing
  // connection pool exhaustion at high VU counts.
  const [
    [{ headcount }],
    deptRows,
    [{ onLeaveToday }],
    [{ pendingApprovals }],
    leaveUtilRows,
    rawHolidays,
  ] = await Promise.all([
    // 1. Active headcount
    db
      .select({ headcount: count() })
      .from(persons)
      .where(and(...headcountConds)),

    // 2. Department headcount
    db
      .select({
        id:           departments.id,
        nameEn:       departments.nameEn,
        nameAr:       departments.nameAr,
        entityNameEn: legalEntities.nameEn,
        cnt:          count(persons.id),
      })
      .from(departments)
      .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
      .leftJoin(persons, and(
        eq(persons.currentDepartmentId, departments.id),
        eq(persons.assignmentStatus, 'ACTIVE'),
        eq(persons.isActive, true),
      ))
      .where(and(...deptConds))
      .groupBy(departments.id, departments.nameEn, departments.nameAr, legalEntities.nameEn)
      .orderBy(desc(count(persons.id))),

    // 3. On leave today
    db
      .select({ onLeaveToday: count() })
      .from(absenceEntries)
      .where(and(...leaveTodayConds)),

    // 4. Pending approvals — step instances assigned to THIS user
    db
      .select({ pendingApprovals: count() })
      .from(workflowStepInstances)
      .where(and(
        eq(workflowStepInstances.tenantId, TENANT_ID),
        eq(workflowStepInstances.status, 'PENDING'),
        currentPersonId
          ? eq(workflowStepInstances.assignedToPersonId, currentPersonId)
          : sql`false`,
      )),

    // 5. Leave utilization YTD
    db
      .select({
        typeNameEn: absenceTypes.typeNameEn,
        typeNameAr: absenceTypes.typeNameAr,
        taken:      sql<number>`coalesce(sum(${absenceBalances.takenDays}), 0)::float`,
        entitled:   sql<number>`coalesce(sum(${absenceBalances.openingBalanceDays} + ${absenceBalances.accruedDays}), 0)::float`,
      })
      .from(absenceBalances)
      .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(and(...balanceConds))
      .groupBy(absenceTypes.typeNameEn, absenceTypes.typeNameAr)
      .orderBy(asc(absenceTypes.typeNameEn)),

    // 6. Upcoming public holidays
    db
      .select({
        nameEn: publicHolidays.holidayNameEn,
        nameAr: publicHolidays.holidayNameAr,
        date:   publicHolidays.holidayDate,
      })
      .from(publicHolidays)
      .where(and(...holidayConds))
      .orderBy(asc(publicHolidays.holidayDate))
      .limit(5),
  ])

  const departments_: DeptRow[] = deptRows.map(d => ({
    id:           d.id,
    nameEn:       d.nameEn,
    nameAr:       d.nameAr ?? null,
    entityNameEn: d.entityNameEn ?? null,
    count:        Number(d.cnt),
  }))

  const leaveUtil: LeaveUtilRow[] = leaveUtilRows.map(r => ({
    typeNameEn: r.typeNameEn ?? null,
    typeNameAr: r.typeNameAr ?? null,
    taken:      Number(r.taken),
    entitled:   Number(r.entitled),
  }))

  const holidays: UpcomingHoliday[] = rawHolidays.map(h => ({
    nameEn: h.nameEn,
    nameAr: h.nameAr,
    date:   fmtDate(h.date),
  }))

  return (
    <AdminDashboard
      locale={locale}
      today={today}
      headcount={Number(headcount)}
      onLeaveToday={Number(onLeaveToday)}
      pendingApprovals={Number(pendingApprovals)}
      departments={departments_}
      leaveUtil={leaveUtil}
      holidays={holidays}
    />
  )
}
