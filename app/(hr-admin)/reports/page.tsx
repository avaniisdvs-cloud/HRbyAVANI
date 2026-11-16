/**
 * Reports hub — 6 role-scoped reports, real DB queries, CSV export.
 *
 * Role access:
 *   SUPER_ADMIN / HR_DIRECTOR  → all 6 reports
 *   HR_ADMIN                   → reports 1–5 (no audit trail)
 *   MANAGER                    → reports 2–3, own team only
 *   FINANCE                    → reports 1, 4, 5
 */
import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect }  from 'next/navigation'
import Link          from 'next/link'
import { DateInput } from '@/components/forms/DateInput'
import {
  and, asc, count, desc, eq, gte, inArray, lte, sql,
} from 'drizzle-orm'
import {
  BarChart3, FileText, Shield, AlertTriangle, RefreshCw, FileBarChart, HeartPulse,
} from 'lucide-react'
import { auth }           from '@/lib/auth'
import { db }             from '@/lib/db'
import {
  absenceBalances,
  absenceEntries,
  absenceTypes,
  auditLog,
  contracts,
  departments,
  legalEntities,
  personDocuments,
  persons,
  projects,
  workerAssignments,
} from '@/drizzle/schema'
import { TENANT_ID }      from '@/lib/constants'
import { getLocale }      from '@/lib/locale-server'
import { computeClosingBalance } from '@/modules/absence/services'
import { resolveManagerPersonScope } from '@/modules/absence/report-scope'
import { resolvePendingApprovers } from '@/modules/workflow/queries'

export const metadata = { title: 'Reports' }

// ── Types ────────────────────────────────────────────────────────────────────

type ReportId =
  | 'headcount'
  | 'leave-summary'
  | 'leave-balances'
  | 'doc-expiry'
  | 'contracts'
  | 'audit-trail'

type SearchParams = {
  report?:    string
  dept?:      string   // department id
  entity?:    string   // legal entity id
  project?:   string   // project id
  from?:      string   // YYYY-MM-DD
  to?:        string
  window?:    string   // "30" | "60" | "90" for expiry window
  status?:    string
  person?:    string   // direct-report person id (MANAGER employee filter)
  ltype?:     string   // absence type id (leave type filter)
}

// ── Report nav definitions ────────────────────────────────────────────────────

const ALL_REPORTS: { id: ReportId; labelEn: string; labelAr: string; roles: string[] }[] = [
  {
    id: 'headcount',       labelEn: 'Headcount by Department', labelAr: 'التوزيع حسب القسم',
    roles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'FINANCE'],
  },
  {
    id: 'leave-summary',   labelEn: 'Leave Summary',           labelAr: 'ملخص الإجازات',
    roles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
  },
  {
    id: 'leave-balances',  labelEn: 'Leave Balances',          labelAr: 'أرصدة الإجازات',
    roles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
  },
  {
    id: 'doc-expiry',      labelEn: 'Document Expiry',         labelAr: 'انتهاء صلاحية الوثائق',
    roles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'FINANCE'],
  },
  {
    id: 'contracts',       labelEn: 'Contract Renewals',       labelAr: 'تجديد العقود',
    roles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'FINANCE'],
  },
  {
    id: 'audit-trail',     labelEn: 'Audit Trail',             labelAr: 'سجل التدقيق',
    roles: ['SUPER_ADMIN'],
  },
]

function reportIcon(id: ReportId) {
  switch (id) {
    case 'headcount':      return BarChart3
    case 'leave-summary':  return FileText
    case 'leave-balances': return BarChart3
    case 'doc-expiry':     return AlertTriangle
    case 'contracts':      return RefreshCw
    case 'audit-trail':    return Shield
    default:               return FileBarChart
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null
  const dt  = typeof d === 'string' ? new Date(d) : d
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function expiryColor(days: number | null): string {
  if (days === null) return 'var(--ink-3)'
  if (days <= 30)   return 'var(--status-rejected-fg)'
  if (days <= 60)   return 'var(--status-warning-fg)'
  return 'var(--status-approved-fg)'
}

function expiryBg(days: number | null): string {
  if (days === null) return 'var(--surface)'
  if (days <= 30)   return 'var(--status-rejected-bg)'
  if (days <= 60)   return 'var(--status-warning-bg)'
  return 'var(--status-approved-bg)'
}

// ── Shared table styles ───────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)',
  color: 'var(--ink-3)', background: 'var(--surface)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = {
  padding: '12px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-1)',
  borderBottom: '1px solid var(--border)',
}
const EMPTY: React.CSSProperties = {
  padding: '48px 0', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)',
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const role     = session.user.role
  const entityId = session.user.legalEntityId ?? null
  const personId = session.user.personId ?? null
  const locale   = await getLocale()
  const isSA     = role === 'SUPER_ADMIN'
  const isAdmin  = ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN'].includes(role)
  const sp       = searchParams ? await searchParams : {} as SearchParams

  const visibleReports = ALL_REPORTS.filter(r => r.roles.includes(role))
  if (visibleReports.length === 0) redirect('/dashboard')

  // Resolve active report
  const activeId = (visibleReports.find(r => r.id === sp.report)?.id
    ?? visibleReports[0].id) as ReportId

  // Filter params
  const filterEntity  = sp.entity  || (isSA ? '' : (entityId ?? ''))
  const filterDept    = sp.dept     || ''
  const filterProject = sp.project  || ''
  const filterFrom    = sp.from     || ''
  const filterTo      = sp.to       || ''
  const filterWindow  = parseInt(sp.window ?? '90', 10) || 90
  const filterStatus  = sp.status   || ''
  const filterPerson    = sp.person || ''
  const filterLeaveType = sp.ltype  || ''
  const isManager       = role === 'MANAGER'

  // Entity scope helper
  const scopeEntityId = isSA ? (filterEntity || null) : (entityId ?? null)

  // Direct-report team list for MANAGER employee filter (single authoritative
  // fetch — also used as the server-side allow-list for the ?person= param).
  const managerTeamList = (isManager && personId)
    ? await db
        .select({ id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn })
        .from(persons)
        .where(and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.lineManagerId, personId),
          eq(persons.isActive, true),
        ))
        .orderBy(asc(persons.fullNameEn))
    : []
  const managerTeamIds = managerTeamList.map(m => m.id)

  // Leave type options for the Leave Type filter (leave-summary / leave-balances)
  const leaveTypeList = ['leave-summary', 'leave-balances'].includes(activeId)
    ? await db
        .select({ id: absenceTypes.id, nameEn: absenceTypes.typeNameEn })
        .from(absenceTypes)
        .where(and(
          eq(absenceTypes.tenantId, TENANT_ID),
          eq(absenceTypes.isActive, true),
        ))
        .orderBy(asc(absenceTypes.typeNameEn))
    : []

  // Departments for filter bar
  const [deptList, entityList, projectList] = await Promise.all([
    db
      .select({ id: departments.id, nameEn: departments.nameEn })
      .from(departments)
      .where(and(
        eq(departments.tenantId, TENANT_ID),
        eq(departments.isActive, true),
        ...(scopeEntityId ? [eq(departments.legalEntityId, scopeEntityId)] : []),
      ))
      .orderBy(asc(departments.nameEn)),
    isSA
      ? db
          .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
          .from(legalEntities)
          .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
          .orderBy(asc(legalEntities.nameEn))
      : Promise.resolve([]),
    db
      .select({ id: projects.id, code: projects.code, nameEn: projects.nameEn })
      .from(projects)
      .where(and(
        eq(projects.tenantId, TENANT_ID),
        eq(projects.isActive, true),
        ...(scopeEntityId ? [eq(projects.legalEntityId, scopeEntityId)] : []),
      ))
      .orderBy(asc(projects.code)),
  ])

  // ── Fetch report data ──────────────────────────────────────────────────────

  let content: React.ReactNode = null

  // ── 1. Headcount by Department ─────────────────────────────────────────────
  if (activeId === 'headcount') {
    const conds = [
      eq(departments.tenantId, TENANT_ID),
      eq(departments.isActive, true),
    ]
    if (scopeEntityId) conds.push(eq(departments.legalEntityId, scopeEntityId))
    if (filterDept)    conds.push(eq(departments.id, filterDept))

    const personJoinConds = filterProject
      ? and(
          eq(persons.currentDepartmentId, departments.id),
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.isActive, true),
          sql`EXISTS (
            SELECT 1 FROM worker_assignments _wa
            WHERE _wa.person_id = ${persons.id}
              AND _wa.project_id = ${filterProject}::uuid
              AND _wa.is_current = true
              AND _wa.tenant_id = ${TENANT_ID}::uuid
          )`,
        )
      : and(
          eq(persons.currentDepartmentId, departments.id),
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.isActive, true),
        )

    const rows = await db
      .select({
        deptNameEn:   departments.nameEn,
        deptNameAr:   departments.nameAr,
        entityNameEn: legalEntities.nameEn,
        active:       count(persons.id),
      })
      .from(departments)
      .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
      .leftJoin(persons, personJoinConds)
      .where(and(...conds))
      .groupBy(departments.id, departments.nameEn, departments.nameAr, legalEntities.nameEn)
      .orderBy(desc(count(persons.id)))

    const total = rows.reduce((s, r) => s + Number(r.active), 0)
    const max   = Math.max(1, ...rows.map(r => Number(r.active)))

    content = (
      <div>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>{locale === 'ar' ? 'القسم' : 'Department'}</th>
              <th style={TH}>{locale === 'ar' ? 'الكيان' : 'Entity'}</th>
              <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'عدد الموظفين' : 'Headcount'}</th>
              <th style={{ ...TH, width: 160 }}>{locale === 'ar' ? 'النسبة' : 'Share'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} style={EMPTY}>{locale === 'ar' ? 'لا توجد بيانات تطابق عوامل التصفية الحالية' : 'No data matches the current filters'}</td></tr>
            ) : rows.map(r => {
              const n   = Number(r.active)
              const pct = total > 0 ? Math.round((n / total) * 100) : 0
              return (
                <tr key={r.deptNameEn}>
                  <td style={TD}>
                    <div style={{ fontWeight: 600 }}>{r.deptNameEn}</div>
                    {r.deptNameAr && <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{r.deptNameAr}</div>}
                  </td>
                  <td style={{ ...TD, color: 'var(--ink-3)' }}>{r.entityNameEn ?? '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{n}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)' }}>
                        <div style={{ width: `${Math.round((n / max) * 100)}%`, height: '100%', borderRadius: 3, background: 'var(--accent)' }} />
                      </div>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', width: 32 }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ ...TD, fontWeight: 700, borderTop: '2px solid var(--border)' }} colSpan={2}>{locale === 'ar' ? 'الإجمالي' : 'Total'}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', borderTop: '2px solid var(--border)' }}>{total}</td>
                <td style={{ ...TD, borderTop: '2px solid var(--border)' }} />
              </tr>
            </tfoot>
          )}
        </table></TableScrollRegion>
      </div>
    )
  }

  // ── 2. Leave Summary ───────────────────────────────────────────────────────
  if (activeId === 'leave-summary') {
    const conds = [
      eq(absenceEntries.tenantId, TENANT_ID),
    ]
    // Entity scope: for MANAGER the team allow-list (managerTeamIds) is the
    // single source of truth — their direct reports may span legal entities and
    // a leave entry's stored legal_entity_id is a creation-time snapshot that can
    // differ from the report's balance row. Re-applying the manager's own entity
    // here would silently drop those rows (the "No leave records" symptom) without
    // widening access. Admins keep the entity filter.
    if (scopeEntityId && !isManager) conds.push(eq(absenceEntries.legalEntityId, scopeEntityId))
    if (filterFrom)    conds.push(gte(absenceEntries.startDate, filterFrom))
    if (filterTo)      conds.push(lte(absenceEntries.endDate, filterTo))
    if (filterStatus)  conds.push(eq(absenceEntries.status, filterStatus))
    if (filterLeaveType) conds.push(eq(absenceEntries.absenceTypeId, filterLeaveType))

    // MANAGER: scope to their direct reports (server-side enforced). The scope
    // condition MUST be pushed onto the query — an empty team yields 1=0 so a
    // manager with no reports sees nothing (the empty-state row renders). Setting
    // `content` alone is not enough: it is overwritten by the table below.
    if (isManager && personId) {
      const scope = resolveManagerPersonScope(managerTeamIds, filterPerson)
      conds.push(scope.mode === 'NO_TEAM'
        ? sql`1=0`
        : inArray(absenceEntries.personId, scope.personIds))
    }

    // Department filter — NOT applied for MANAGER (they filter by employee).
    if (filterDept && !isManager) {
      const deptPersons = await db
        .select({ id: persons.id })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, filterDept), eq(persons.isActive, true)))
      const ids = deptPersons.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(absenceEntries.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        requestNumber:  absenceEntries.requestNumber,
        personNameEn:   persons.fullNameEn,
        deptNameEn:     departments.nameEn,
        typeNameEn:     absenceTypes.typeNameEn,
        startDate:      absenceEntries.startDate,
        endDate:        absenceEntries.endDate,
        durationDays:   absenceEntries.durationDays,
        status:         absenceEntries.status,
        workflowInstanceId: absenceEntries.workflowInstanceId,
      })
      .from(absenceEntries)
      .leftJoin(persons,      eq(absenceEntries.personId, persons.id))
      .leftJoin(departments,  eq(persons.currentDepartmentId, departments.id))
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(...conds))
      .orderBy(desc(absenceEntries.startDate))
      .limit(500)

    // Resolve the current approver for PENDING rows so the Status column can
    // show "Pending / with <approver>" without adding a column. Batched to one
    // query; unresolved approvers fall back to a bare "Pending".
    const pendingInstanceIds = rows
      .filter(r => r.status === 'PENDING' && r.workflowInstanceId)
      .map(r => r.workflowInstanceId as string)
    const approverByInstance = await resolvePendingApprovers(pendingInstanceIds)

    const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
      APPROVED:  { bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
      PENDING:   { bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)'  },
      REJECTED:  { bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)' },
      CANCELLED: { bg: 'var(--status-draft-bg)',    fg: 'var(--status-draft-fg)'    },
      TAKEN:     { bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
    }

    content = (
      <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>{locale === 'ar' ? 'رقم الطلب' : 'Request #'}</th>
            <th style={TH}>{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
            <th style={TH}>{locale === 'ar' ? 'القسم' : 'Department'}</th>
            <th style={TH}>{locale === 'ar' ? 'النوع' : 'Type'}</th>
            <th style={TH}>{locale === 'ar' ? 'الفترة' : 'Period'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'الأيام' : 'Days'}</th>
            <th style={TH}>{locale === 'ar' ? 'الحالة' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} style={EMPTY}>{locale === 'ar' ? 'لا توجد سجلات إجازات تطابق عوامل التصفية الحالية' : 'No leave records match the current filters'}</td></tr>
          ) : rows.map(r => {
            const st = STATUS_STYLE[r.status ?? ''] ?? { bg: 'var(--surface)', fg: 'var(--ink-3)' }
            // BR-WF: for PENDING requests, surface the current approver inline in
            // the Status column ("Pending / with <name>"). Empty label (config
            // warning / unresolved) falls back to a bare "Pending", never an error.
            const approver = (r.status === 'PENDING' && r.workflowInstanceId)
              ? approverByInstance[r.workflowInstanceId]
              : undefined
            const approverLabel = approver
              ? (locale === 'ar' ? approver.approverLabelAr : approver.approverLabelEn)
              : ''
            return (
              <tr key={r.requestNumber}>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{r.requestNumber}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{r.personNameEn ?? '—'}</td>
                <td style={{ ...TD, color: 'var(--ink-3)' }}>{r.deptNameEn ?? '—'}</td>
                <td style={TD}>{r.typeNameEn ?? '—'}</td>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>
                  {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {Number(r.durationDays).toFixed(1)}
                </td>
                <td style={TD}>
                  <span style={{
                    background: st.bg, color: st.fg,
                    borderRadius: 999, padding: '3px 10px',
                    fontSize: 'var(--text-caption)', fontWeight: 700,
                  }}>
                    {r.status}
                  </span>
                  {r.status === 'PENDING' && approverLabel && (
                    <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                      {locale === 'ar' ? `بانتظار ${approverLabel}` : `with ${approverLabel}`}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></TableScrollRegion>
    )
  }

  // ── 3. Leave Balances ──────────────────────────────────────────────────────
  if (activeId === 'leave-balances') {
    const year = new Date().getUTCFullYear()
    const conds = [
      eq(absenceBalances.tenantId, TENANT_ID),
      eq(absenceBalances.balanceYear, year),
    ]
    if (scopeEntityId) conds.push(eq(absenceBalances.legalEntityId, scopeEntityId))
    if (filterLeaveType) conds.push(eq(absenceBalances.absenceTypeId, filterLeaveType))

    // MANAGER: scope to their direct reports (server-side enforced). Same
    // contract as Leave Summary — empty team → 1=0, otherwise the team allow-list
    // (or a single requested in-team person). Pushed onto the query, not `content`.
    if (isManager && personId) {
      const scope = resolveManagerPersonScope(managerTeamIds, filterPerson)
      conds.push(scope.mode === 'NO_TEAM'
        ? sql`1=0`
        : inArray(absenceBalances.personId, scope.personIds))
    }

    // Department filter — NOT applied for MANAGER (they filter by employee).
    if (filterDept && !isManager) {
      const deptPersons = await db
        .select({ id: persons.id })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, filterDept), eq(persons.isActive, true)))
      const ids = deptPersons.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(absenceBalances.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        personNumber:       persons.personNumber,
        personNameEn:       persons.fullNameEn,
        deptNameEn:         departments.nameEn,
        typeNameEn:         absenceTypes.typeNameEn,
        opening:            absenceBalances.openingBalanceDays,
        accrued:            absenceBalances.accruedDays,
        taken:              absenceBalances.takenDays,
        pending:            absenceBalances.pendingDays,
        carriedForward:     absenceBalances.carriedForwardDays,
        adjusted:           absenceBalances.adjustedDays,
        forfeited:          absenceBalances.forfeitedDays,
        closing:            absenceBalances.closingBalanceDays,
      })
      .from(absenceBalances)
      .leftJoin(persons,      eq(absenceBalances.personId, persons.id))
      .leftJoin(departments,  eq(persons.currentDepartmentId, departments.id))
      .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(and(...conds))
      .orderBy(asc(persons.personNumber), asc(absenceTypes.typeNameEn))
      .limit(1000)

    content = (
      <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>{locale === 'ar' ? 'رقم الموظف' : 'Emp #'}</th>
            <th style={TH}>{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
            <th style={TH}>{locale === 'ar' ? 'القسم' : 'Department'}</th>
            <th style={TH}>{locale === 'ar' ? 'نوع الإجازة' : 'Leave Type'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'الرصيد الافتتاحي' : 'Opening'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'المستحق' : 'Accrued'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'المستخدم' : 'Taken'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'قيد الانتظار' : 'Pending'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'الرصيد' : 'Balance'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} style={EMPTY}>{locale === 'ar' ? `لا توجد بيانات أرصدة لعام ${year}` : `No balance data for ${year}`}</td></tr>
          ) : rows.map((r, i) => {
            // BR-AL-002: Balance is always derived from its ledger components so the
            // report stays correct even when the stored closing_balance_days is NULL
            // (e.g. rows imported by the V2 migration before closing was computed).
            const closing = computeClosingBalance({
              openingBalanceDays: Number(r.opening ?? 0),
              accruedDays:        Number(r.accrued ?? 0),
              takenDays:          Number(r.taken ?? 0),
              pendingDays:        Number(r.pending ?? 0),
              adjustedDays:       Number(r.adjusted ?? 0),
              carriedForwardDays: Number(r.carriedForward ?? 0),
              forfeitedDays:      Number(r.forfeited ?? 0),
            })
            const low     = closing < 3
            return (
              <tr key={i}>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{r.personNumber ?? '—'}</td>
                <td style={{ ...TD, fontWeight: 600 }}>{r.personNameEn ?? '—'}</td>
                <td style={{ ...TD, color: 'var(--ink-3)' }}>{r.deptNameEn ?? '—'}</td>
                <td style={TD}>{r.typeNameEn ?? '—'}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(r.opening ?? 0).toFixed(1)}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(r.accrued ?? 0).toFixed(1)}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(r.taken ?? 0).toFixed(1)}</td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--status-warning-fg)' }}>
                  {Number(r.pending ?? 0).toFixed(1)}
                </td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <span style={{
                    background: low ? 'var(--status-rejected-bg)' : 'var(--status-approved-bg)',
                    color:      low ? 'var(--status-rejected-fg)' : 'var(--status-approved-fg)',
                    borderRadius: 999, padding: '2px 8px',
                    fontSize: 'var(--text-caption)', fontWeight: 700, fontFamily: 'var(--font-mono)',
                  }}>
                    {closing.toFixed(1)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></TableScrollRegion>
    )
  }

  // ── 4. Document Expiry Tracker ─────────────────────────────────────────────
  if (activeId === 'doc-expiry') {
    const windowDays = [30, 60, 90].includes(filterWindow) ? filterWindow : 90
    const today      = new Date().toISOString().slice(0, 10)
    const windowEnd  = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const conds = [
      eq(personDocuments.tenantId, TENANT_ID),
      gte(personDocuments.expiryDate, today),
      lte(personDocuments.expiryDate, windowEnd),
    ]
    if (scopeEntityId) conds.push(eq(personDocuments.legalEntityId, scopeEntityId))
    if (filterDept) {
      const deptPersons = await db
        .select({ id: persons.id })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, filterDept), eq(persons.isActive, true)))
      const ids = deptPersons.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(personDocuments.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        personNameEn:  persons.fullNameEn,
        personNumber:  persons.personNumber,
        deptNameEn:    departments.nameEn,
        documentType:  personDocuments.documentType,
        documentTitle: personDocuments.documentTitle,
        expiryDate:    personDocuments.expiryDate,
        status:        personDocuments.documentStatus,
      })
      .from(personDocuments)
      .leftJoin(persons,     eq(personDocuments.personId, persons.id))
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(and(...conds))
      .orderBy(asc(personDocuments.expiryDate))
      .limit(500)

    content = (
      <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
            <th style={TH}>{locale === 'ar' ? 'القسم' : 'Department'}</th>
            <th style={TH}>{locale === 'ar' ? 'الوثيقة' : 'Document'}</th>
            <th style={TH}>{locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}</th>
            <th style={TH}>{locale === 'ar' ? 'الأيام المتبقية' : 'Days Left'}</th>
            <th style={TH}>{locale === 'ar' ? 'الحالة' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={EMPTY}>{locale === 'ar' ? `لا توجد وثائق تنتهي صلاحيتها خلال ${windowDays} يوماً` : `No documents expiring within ${windowDays} days`}</td></tr>
          ) : rows.map((r, i) => {
            const days = daysUntil(r.expiryDate)
            return (
              <tr key={i}>
                <td style={TD}>
                  <div style={{ fontWeight: 600 }}>{r.personNameEn ?? '—'}</div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{r.personNumber ?? ''}</div>
                </td>
                <td style={{ ...TD, color: 'var(--ink-3)' }}>{r.deptNameEn ?? '—'}</td>
                <td style={TD}>
                  <div>{r.documentTitle}</div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{r.documentType}</div>
                </td>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{fmtDate(r.expiryDate)}</td>
                <td style={TD}>
                  <span style={{
                    background: expiryBg(days),
                    color:      expiryColor(days),
                    borderRadius: 999, padding: '3px 10px',
                    fontSize: 'var(--text-caption)', fontWeight: 700, fontFamily: 'var(--font-mono)',
                  }}>
                    {days === null ? '—' : `${days}d`}
                  </span>
                </td>
                <td style={TD}>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{r.status}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></TableScrollRegion>
    )
  }

  // ── 5. Contract Renewals ───────────────────────────────────────────────────
  if (activeId === 'contracts') {
    const windowDays = [30, 60, 90].includes(filterWindow) ? filterWindow : 90
    const today      = new Date().toISOString().slice(0, 10)
    const windowEnd  = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const conds = [
      eq(contracts.tenantId, TENANT_ID),
      eq(contracts.status, 'ACTIVE'),
      gte(contracts.endDate, today),
      lte(contracts.endDate, windowEnd),
    ]
    if (scopeEntityId) conds.push(eq(contracts.legalEntityId, scopeEntityId))
    if (filterDept) {
      const deptPersons = await db
        .select({ id: persons.id })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, filterDept), eq(persons.isActive, true)))
      const ids = deptPersons.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(contracts.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        contractNumber: contracts.contractNumber,
        personNameEn:   persons.fullNameEn,
        personNumber:   persons.personNumber,
        deptNameEn:     departments.nameEn,
        contractType:   contracts.contractType,
        startDate:      contracts.startDate,
        endDate:        contracts.endDate,
        renewalCount:   contracts.renewalCount,
      })
      .from(contracts)
      .leftJoin(persons,     eq(contracts.personId, persons.id))
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(and(...conds))
      .orderBy(asc(contracts.endDate))
      .limit(500)

    content = (
      <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>{locale === 'ar' ? 'رقم العقد' : 'Contract #'}</th>
            <th style={TH}>{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
            <th style={TH}>{locale === 'ar' ? 'القسم' : 'Department'}</th>
            <th style={TH}>{locale === 'ar' ? 'النوع' : 'Type'}</th>
            <th style={TH}>{locale === 'ar' ? 'البداية' : 'Start'}</th>
            <th style={TH}>{locale === 'ar' ? 'تاريخ الانتهاء' : 'Expires'}</th>
            <th style={TH}>{locale === 'ar' ? 'الأيام المتبقية' : 'Days Left'}</th>
            <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'التجديدات' : 'Renewals'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} style={EMPTY}>{locale === 'ar' ? `لا توجد عقود تنتهي خلال ${windowDays} يوماً` : `No contracts expiring within ${windowDays} days`}</td></tr>
          ) : rows.map(r => {
            const days = daysUntil(r.endDate)
            return (
              <tr key={r.contractNumber}>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{r.contractNumber}</td>
                <td style={TD}>
                  <div style={{ fontWeight: 600 }}>{r.personNameEn ?? '—'}</div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{r.personNumber ?? ''}</div>
                </td>
                <td style={{ ...TD, color: 'var(--ink-3)' }}>{r.deptNameEn ?? '—'}</td>
                <td style={{ ...TD, fontSize: 'var(--text-caption)' }}>{r.contractType}</td>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{fmtDate(r.startDate)}</td>
                <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{fmtDate(r.endDate)}</td>
                <td style={TD}>
                  <span style={{
                    background: expiryBg(days),
                    color:      expiryColor(days),
                    borderRadius: 999, padding: '3px 10px',
                    fontSize: 'var(--text-caption)', fontWeight: 700, fontFamily: 'var(--font-mono)',
                  }}>
                    {days === null ? '—' : `${days}d`}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.renewalCount}</td>
              </tr>
            )
          })}
        </tbody>
      </table></TableScrollRegion>
    )
  }

  // ── 6. Audit Trail (SUPER_ADMIN only) ──────────────────────────────────────
  if (activeId === 'audit-trail') {
    if (role !== 'SUPER_ADMIN') redirect('/dashboard')

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const conds = [
      eq(auditLog.tenantId, TENANT_ID),
      gte(auditLog.eventTime, sevenDaysAgo),
    ]
    if (filterFrom) conds.push(gte(auditLog.eventTime, new Date(filterFrom)))
    if (filterTo)   conds.push(lte(auditLog.eventTime, new Date(filterTo + 'T23:59:59Z')))

    const rows = await db
      .select({
        eventTime:    auditLog.eventTime,
        actorName:    auditLog.actorName,
        actorRole:    auditLog.actorRole,
        eventType:    auditLog.eventType,
        resourceType: auditLog.resourceType,
        channel:      auditLog.channel,
        ipAddress:    auditLog.ipAddress,
        description:  auditLog.description,
      })
      .from(auditLog)
      .where(and(...conds))
      .orderBy(desc(auditLog.eventTime))
      .limit(200)

    content = (
      <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>{locale === 'ar' ? 'الوقت' : 'Time'}</th>
            <th style={TH}>{locale === 'ar' ? 'المنفِّذ' : 'Actor'}</th>
            <th style={TH}>{locale === 'ar' ? 'الدور' : 'Role'}</th>
            <th style={TH}>{locale === 'ar' ? 'الحدث' : 'Event'}</th>
            <th style={TH}>{locale === 'ar' ? 'المورد' : 'Resource'}</th>
            <th style={TH}>{locale === 'ar' ? 'القناة' : 'Channel'}</th>
            <th style={TH}>{locale === 'ar' ? 'الوصف' : 'Description'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} style={EMPTY}>{locale === 'ar' ? 'لا توجد أحداث تدقيق في الفترة المحددة' : 'No audit events in the selected period'}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
                {r.eventTime ? new Date(r.eventTime).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
              </td>
              <td style={{ ...TD, fontWeight: 600 }}>{r.actorName}</td>
              <td style={{ ...TD, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{r.actorRole}</td>
              <td style={{ ...TD, fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)' }}>{r.eventType}</td>
              <td style={{ ...TD, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{r.resourceType}</td>
              <td style={{ ...TD, fontSize: 'var(--text-caption)' }}>{r.channel}</td>
              <td style={{ ...TD, color: 'var(--ink-3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.description ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table></TableScrollRegion>
    )
  }

  // ── Build export URL ─────────────────────────────────────────────────────
  const exportParams = new URLSearchParams({ type: activeId })
  if (filterEntity)  exportParams.set('entity',  filterEntity)
  if (filterDept)    exportParams.set('dept',     filterDept)
  if (filterProject) exportParams.set('project',  filterProject)
  if (filterFrom)    exportParams.set('from',     filterFrom)
  if (filterTo)      exportParams.set('to',       filterTo)
  if (filterWindow)  exportParams.set('window',   String(filterWindow))
  if (filterStatus)  exportParams.set('status',   filterStatus)
  if (filterPerson)    exportParams.set('person', filterPerson)
  if (filterLeaveType) exportParams.set('ltype',  filterLeaveType)
  const exportHref = `/reports/export?${exportParams.toString()}`

  // ── Render ────────────────────────────────────────────────────────────────
  const activeReport = visibleReports.find(r => r.id === activeId)!
  const title = locale === 'ar' ? activeReport.labelAr : activeReport.labelEn

  return (
    <div className="page-in reports-layout" style={{ width: '100%', boxSizing: 'border-box', display: 'flex' }}>

      {/* Left nav — in-page report switcher.
          Suppressed for MANAGER: their main sidebar (manager-nav.ts) already
          lists Reports → Leave Summary / Leave Balances, so this panel would be a
          duplicate. Admin roles still rely on it as their 2-level secondary nav
          (the Reports workspace secondary panel is suppressed for them). */}
      {!isManager && (
      <div className="reports-navigation" style={{
        flexShrink: 0,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '8px 0', alignSelf: 'flex-start',
        position: 'sticky', top: 24,
      }}>
        <div style={{
          padding: '10px 16px 8px',
          fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '1.2px', fontFamily: 'var(--font-mono)', color: 'var(--ink-3)',
        }}>
          {locale === 'ar' ? 'التقارير' : 'Reports'}
        </div>
        {visibleReports.map(r => {
          const Icon    = reportIcon(r.id)
          const isActive = r.id === activeId
          const params  = new URLSearchParams(sp as Record<string, string>)
          params.set('report', r.id)
          return (
            <Link
              key={r.id}
              href={`/reports?${params.toString()}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px', textDecoration: 'none',
                background: isActive ? 'var(--accent-050)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                color: isActive ? 'var(--brand-active)' : 'var(--ink-2)',
                fontSize: 'var(--text-body)', fontWeight: isActive ? 600 : 400,
                transition: 'background 0.1s',
              }}
            >
              <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              {locale === 'ar' ? r.labelAr : r.labelEn}
            </Link>
          )
        })}

        {/* Employee Movement lives on its own route (/reports/employee-movement).
            Listed here for the same reason as Insurance below — the Reports
            workspace secondary-nav panel is suppressed for admin roles, so this
            in-page panel is their effective Reports navigation. */}
        {['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(role) && (
          <Link
            href="/reports/employee-movement"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 16px', textDecoration: 'none',
              background: 'transparent',
              borderLeft: '3px solid transparent',
              color: 'var(--ink-2)', fontSize: 'var(--text-body)', fontWeight: 400,
            }}
          >
            <BarChart3 size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {locale === 'ar' ? 'حركة الموظفين' : 'Employee Movement'}
          </Link>
        )}

        {/* Insurance Reports lives on its own route (/reports/insurance). It is
            listed here so it remains reachable now that the Reports workspace
            secondary-nav panel is suppressed (2-level navigation). */}
        {['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(role) && (
          <Link
            href="/reports/insurance"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 16px', textDecoration: 'none',
              background: 'transparent',
              borderLeft: '3px solid transparent',
              color: 'var(--ink-2)', fontSize: 'var(--text-body)', fontWeight: 400,
            }}
          >
            <HeartPulse size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {locale === 'ar' ? 'تقارير التأمين' : 'Insurance Reports'}
          </Link>
        )}
      </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <PageTitle style={{
              fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500,
              letterSpacing: '-0.4px', color: 'var(--ink-1)', margin: 0,
            }}>
              {title}
            </PageTitle>
          </div>
          <Link
            href={exportHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--ink-1)', borderRadius: 7,
              padding: '8px 14px', fontSize: 'var(--text-caption)', fontWeight: 600,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            ↓ {locale === 'ar' ? 'تصدير CSV' : 'Export CSV'}
          </Link>
        </div>

        {/* Filter bar */}
        <form method="GET" action="/reports" style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <input type="hidden" name="report" value={activeId} />

          {/* Entity filter (SUPER_ADMIN only) */}
          {isSA && entityList.length > 0 && (
            <select name="entity" defaultValue={filterEntity} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="">{locale === 'ar' ? 'جميع الكيانات' : 'All entities'}</option>
              {entityList.map(e => <option key={e.id} value={e.id}>{e.nameEn}</option>)}
            </select>
          )}

          {/* Department filter — hidden for MANAGER (they filter by direct report) */}
          {!isManager && ['headcount', 'leave-summary', 'leave-balances', 'doc-expiry', 'contracts'].includes(activeId) && (
            <select name="dept" defaultValue={filterDept} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="">{locale === 'ar' ? 'جميع الأقسام' : 'All departments'}</option>
              {deptList.map(d => <option key={d.id} value={d.id}>{d.nameEn}</option>)}
            </select>
          )}

          {/* Team Member filter — MANAGER only, direct reports */}
          {isManager && ['leave-summary', 'leave-balances'].includes(activeId) && managerTeamList.length > 0 && (
            <select name="person" defaultValue={filterPerson} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="">{locale === 'ar' ? 'جميع أعضاء الفريق' : 'All direct reports'}</option>
              {managerTeamList.map(m => (
                <option key={m.id} value={m.id}>{m.fullNameEn ?? '—'} ({m.personNumber})</option>
              ))}
            </select>
          )}

          {/* Leave Type filter — leave-summary / leave-balances, all roles */}
          {['leave-summary', 'leave-balances'].includes(activeId) && leaveTypeList.length > 0 && (
            <select name="ltype" defaultValue={filterLeaveType} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="">{locale === 'ar' ? 'جميع أنواع الإجازات' : 'All leave types'}</option>
              {leaveTypeList.map(t => <option key={t.id} value={t.id}>{t.nameEn}</option>)}
            </select>
          )}

          {/* Project filter (headcount only) */}
          {activeId === 'headcount' && projectList.length > 0 && (
            <select name="project" defaultValue={filterProject} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="">{locale === 'ar' ? 'جميع المشاريع' : 'All projects'}</option>
              {projectList.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.nameEn}</option>
              ))}
            </select>
          )}

          {/* Date range */}
          {['leave-summary', 'audit-trail'].includes(activeId) && (<>
            <DateInput name="from" defaultValue={filterFrom} placeholder={locale === 'ar' ? 'من' : 'From'}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)', color: 'var(--ink-1)' }} />
            <DateInput name="to" defaultValue={filterTo} placeholder={locale === 'ar' ? 'إلى' : 'To'}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)', color: 'var(--ink-1)' }} />
          </>)}

          {/* Status filter for leave summary */}
          {activeId === 'leave-summary' && (
            <select name="status" defaultValue={filterStatus} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="">{locale === 'ar' ? 'جميع الحالات' : 'All statuses'}</option>
              {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'TAKEN', 'RECALLED'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {/* Expiry window (doc-expiry + contracts) */}
          {['doc-expiry', 'contracts'].includes(activeId) && (
            <select name="window" defaultValue={String(filterWindow)} style={{
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
              color: 'var(--ink-1)',
            }}>
              <option value="30">{locale === 'ar' ? 'تنتهي خلال 30 يوماً' : 'Expiring in 30 days'}</option>
              <option value="60">{locale === 'ar' ? 'تنتهي خلال 60 يوماً' : 'Expiring in 60 days'}</option>
              <option value="90">{locale === 'ar' ? 'تنتهي خلال 90 يوماً' : 'Expiring in 90 days'}</option>
            </select>
          )}

          <button type="submit" style={{
            background: 'var(--accent)', color: 'var(--primary-foreground)',
            border: 'none', borderRadius: 6, padding: '7px 14px',
            fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
          }}>
            {locale === 'ar' ? 'تطبيق' : 'Apply'}
          </button>

          <Link href={`/reports?report=${activeId}`} style={{
            display: 'inline-flex', alignItems: 'center',
            border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px',
            fontSize: 'var(--text-body)', color: 'var(--ink-2)', textDecoration: 'none', background: 'var(--card)',
          }}>
            {locale === 'ar' ? 'إعادة ضبط' : 'Reset'}
          </Link>
        </form>

        {/* Table card */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'auto',
        }}>
          {content}
        </div>
      </div>
    </div>
  )
}
