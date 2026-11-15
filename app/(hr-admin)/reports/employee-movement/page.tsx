/**
 * Employee Movement Report (HISTORY-ONLY, read-only).
 *
 * Cross-employee, scoped, filterable view of the effective-dated assignment
 * timeline. Roles: MANAGER (direct team), HR_ADMIN / HR_DIRECTOR (own entity),
 * SUPER_ADMIN (all). NON-SENSITIVE columns only — never salary.
 */
import { redirect } from 'next/navigation'
import { auth, roleHome } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import {
  getEmployeeMovement, getMovementFilterOptions, type MovementFilters,
} from '@/modules/reports/employee-movement'
import type { TemporalState } from '@/modules/core-hr/assignment-history'

export const metadata = { title: 'Employee Movement Report · AVANIIS People' }

const ALLOWED = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

type SP = Promise<Record<string, string | undefined>>

function fmt(d: string): string {
  if (!d) return '—'
  if (d.startsWith('9999')) return 'Present'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const card  = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as const
const th    = { textAlign: 'left' as const, fontSize: 'var(--text-caption)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-3)', padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const }
const td    = { fontSize: 'var(--text-body)', color: 'var(--ink-1)', padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const }
const label = { fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 4, display: 'block' } as const
const ctrl  = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 'var(--text-body)' } as const

function StateBadge({ s, ar }: { s: TemporalState; ar: boolean }) {
  const map = {
    CURRENT: { t: ar ? 'الحالي' : 'Current', bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
    FUTURE:  { t: ar ? 'مستقبلي' : 'Future', bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)' },
    PAST:    { t: ar ? 'سابق' : 'Past', bg: 'var(--surface)', fg: 'var(--ink-3)' },
  } as const
  const m = map[s]
  return <span style={{ background: m.bg, color: m.fg, fontSize: 'var(--text-caption)', fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{m.t}</span>
}

export default async function EmployeeMovementReportPage({ searchParams }: { searchParams: SP }) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  const user = session.user
  if (!ALLOWED.includes(user.role)) redirect(roleHome(user.role))

  const sp = await searchParams
  const locale = await getLocale()
  const ar = locale === 'ar'
  const L = (en: string, arr: string) => (ar ? arr : en)
  const pick = (en: string | null | undefined, arX: string | null | undefined) =>
    (ar ? (arX || en) : (en || arX)) || '—'

  const filters: MovementFilters = {
    entity: sp.entity, bu: sp.bu, dept: sp.dept, job: sp.job, position: sp.position,
    grade: sp.grade, manager: sp.manager, from: sp.from, to: sp.to,
    actionType: sp.actionType,
    status: (sp.status as TemporalState) || undefined,
    q: sp.q,
  }
  const hasFilters = Object.values(filters).some(Boolean)

  // getMovementFilterOptions/getEmployeeMovement enforce REPORTS:view and throw
  // FORBIDDEN on a matrix deny — deny safely by redirecting to the role home.
  let opts: Awaited<ReturnType<typeof getMovementFilterOptions>>
  let result: Awaited<ReturnType<typeof getEmployeeMovement>>
  try {
    [opts, result] = await Promise.all([
      getMovementFilterOptions(user),
      getEmployeeMovement(user, filters),
    ])
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('FORBIDDEN')) redirect(roleHome(user.role))
    throw e
  }

  // CSV export carries the same filters; the export route re-applies RBAC.
  const exportParams = new URLSearchParams({ type: 'employee-movement' })
  for (const [k, v] of Object.entries(filters)) if (v) exportParams.set(k, String(v))
  const exportHref = `/reports/export?${exportParams.toString()}`

  const Select = ({ name, value, placeholder, options }: {
    name: string; value?: string; placeholder: string
    options: { id: string; nameEn: string | null; nameAr: string | null }[]
  }) => (
    <select name={name} defaultValue={value ?? ''} style={ctrl}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>{pick(o.nameEn, o.nameAr)}</option>
      ))}
    </select>
  )

  return (
    <div className="page-in" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>
        {L('Employee Movement Report', 'تقرير حركة الموظفين')}
      </h1>
      <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 18px' }}>
        {L('Effective-dated assignment history across employees in your scope — promotions, transfers, grade, position, department, manager and organisation changes.',
           'سجل التعيينات الفعّال عبر الموظفين ضمن نطاقك — الترقيات والتنقلات وتغييرات الدرجة والمنصب والقسم والمدير والتنظيم.')}
      </p>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <form style={{ ...card, marginBottom: 16, padding: 18 }}>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          <div><label htmlFor="emp-mov-q" style={label}>{L('Employee', 'الموظف')}</label>
            <input id="emp-mov-q" name="q" defaultValue={filters.q ?? ''} placeholder={L('Name or number…', 'الاسم أو الرقم…')} style={ctrl} /></div>
          {user.role === 'SUPER_ADMIN' && (
            <div><label style={label}>{L('Company (Legal Entity)', 'الشركة (الكيان القانوني)')}</label>
              <Select name="entity" value={filters.entity} placeholder={L('All companies', 'كل الشركات')} options={opts.entities} /></div>
          )}
          <div><label style={label}>{L('Business Unit', 'وحدة الأعمال')}</label>
            <Select name="bu" value={filters.bu} placeholder={L('All business units', 'كل وحدات الأعمال')} options={opts.businessUnits} /></div>
          <div><label style={label}>{L('Department', 'القسم')}</label>
            <Select name="dept" value={filters.dept} placeholder={L('All departments', 'كل الأقسام')} options={opts.departments} /></div>
          <div><label style={label}>{L('Job', 'المسمى الوظيفي')}</label>
            <Select name="job" value={filters.job} placeholder={L('All jobs', 'كل المسميات')} options={opts.jobs} /></div>
          <div><label style={label}>{L('Position', 'المنصب')}</label>
            <Select name="position" value={filters.position} placeholder={L('All positions', 'كل المناصب')} options={opts.positions} /></div>
          <div><label style={label}>{L('Grade', 'الدرجة')}</label>
            <Select name="grade" value={filters.grade} placeholder={L('All grades', 'كل الدرجات')} options={opts.grades} /></div>
          <div><label style={label}>{L('Line Manager', 'المدير المباشر')}</label>
            <Select name="manager" value={filters.manager} placeholder={L('All managers', 'كل المدراء')} options={opts.managers} /></div>
          <div><label style={label}>{L('Change Type', 'نوع التغيير')}</label>
            <select name="actionType" defaultValue={filters.actionType ?? ''} style={ctrl}>
              <option value="">{L('All change types', 'كل أنواع التغيير')}</option>
              {opts.actionTypes.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select></div>
          <div><label style={label}>{L('Status', 'الحالة')}</label>
            <select name="status" defaultValue={filters.status ?? ''} style={ctrl}>
              <option value="">{L('All (past/current/future)', 'الكل (سابق/حالي/مستقبلي)')}</option>
              <option value="CURRENT">{L('Current', 'الحالي')}</option>
              <option value="PAST">{L('Past', 'سابق')}</option>
              <option value="FUTURE">{L('Future', 'مستقبلي')}</option>
            </select></div>
          <div><label htmlFor="emp-mov-from" style={label}>{L('Effective From', 'فعّال من')}</label>
            <input id="emp-mov-from" type="date" name="from" defaultValue={filters.from ?? ''} style={ctrl} /></div>
          <div><label htmlFor="emp-mov-to" style={label}>{L('Effective To', 'فعّال إلى')}</label>
            <input id="emp-mov-to" type="date" name="to" defaultValue={filters.to ?? ''} style={ctrl} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer' }}>
            {L('Apply filters', 'تطبيق المرشحات')}
          </button>
          {hasFilters && (
            <a href="/reports/employee-movement" style={{ fontSize: 'var(--text-body)', color: 'var(--brand-active)', textDecoration: 'none', alignSelf: 'center' }}>
              {L('Clear', 'مسح')}
            </a>
          )}
        </div>
      </form>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 2px 10px' }}>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {L(`${result.rows.length} movement record${result.rows.length !== 1 ? 's' : ''}`, `${result.rows.length} سجل حركة`)}
          {result.truncated ? L(' (showing first 2000 — narrow filters for more)', ' (يعرض أول 2000 — حدد المرشحات لعرض المزيد)') : ''}
        </span>
        {result.rows.length > 0 && (
          <a href={exportHref} style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--brand-active)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px' }}>
            ↓ {L('Export CSV', 'تصدير CSV')}
          </a>
        )}
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead><tr>
            <th style={th}>{L('Emp #', 'رقم الموظف')}</th>
            <th style={th}>{L('Employee', 'الموظف')}</th>
            <th style={th}>{L('Effective Period', 'الفترة الفعلية')}</th>
            <th style={th}>{L('Status', 'الحالة')}</th>
            <th style={th}>{L('Change Type', 'نوع التغيير')}</th>
            <th style={th}>{L('Department', 'القسم')}</th>
            <th style={th}>{L('Position', 'المنصب')}</th>
            <th style={th}>{L('Job', 'المسمى')}</th>
            <th style={th}>{L('Grade', 'الدرجة')}</th>
            <th style={th}>{L('Business Unit', 'وحدة الأعمال')}</th>
            <th style={th}>{L('Company', 'الشركة')}</th>
            <th style={th}>{L('Location', 'الموقع')}</th>
            <th style={th}>{L('Line Manager', 'المدير')}</th>
            <th style={th}>{L('Assign. Status', 'حالة التعيين')}</th>
            <th style={th}>{L('Reason', 'السبب')}</th>
          </tr></thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td style={td} colSpan={15}>{L('No movement records found for the selected filters.', 'لا توجد سجلات حركة للمرشحات المحددة.')}</td></tr>
            ) : result.rows.map((r, i) => (
              <tr key={`${r.personId}-${i}`}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{r.personNumber}</td>
                <td style={td}>{pick(r.fullNameEn, r.fullNameAr)}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{fmt(r.effectiveStartDate)} → {fmt(r.effectiveEndDate)}</td>
                <td style={td}><StateBadge s={r.temporalState} ar={ar} /></td>
                <td style={td}>{r.actionType.replace(/_/g, ' ')}{r.actionMode && r.actionMode !== 'UPDATE' ? ` (${r.actionMode})` : ''}</td>
                <td style={td}>{pick(r.departmentEn, r.departmentAr)}</td>
                <td style={td}>{pick(r.positionEn, r.positionAr)}</td>
                <td style={td}>{pick(r.jobEn, r.jobAr)}</td>
                <td style={td}>{pick(r.gradeEn, r.gradeAr)}</td>
                <td style={td}>{pick(r.businessUnitEn, r.businessUnitAr)}</td>
                <td style={td}>{pick(r.legalEntityEn, r.legalEntityAr)}</td>
                <td style={td}>{pick(r.locationEn, r.locationAr)}</td>
                <td style={td}>{pick(r.lineManagerEn, r.lineManagerAr)}</td>
                <td style={td}>{r.assignmentStatus?.replace(/_/g, ' ')}</td>
                <td style={{ ...td, whiteSpace: 'normal', maxWidth: 220 }}>{r.actionReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
