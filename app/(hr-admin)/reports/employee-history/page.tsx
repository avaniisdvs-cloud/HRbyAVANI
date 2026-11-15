/**
 * Employee Assignment History report (HISTORY-ONLY, read-only).
 *
 * Answers: what happened to the employee over time, what changed initially vs
 * later, who the current manager is, and how many promotions / grade changes /
 * transfers / manager changes occurred. Reads the full effective-dated timeline
 * (all worker_assignments slices) + the employment_actions narrative.
 *
 * This is additive — it does not affect any operational report or workflow,
 * which continue to read the current/active record.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import {
  getEmployeeAssignmentHistory, listHistoryEmployees, type HistorySummary,
} from '@/modules/reports/employee-history'

export const metadata = { title: 'Employee History · AVANIIS People' }

const HR_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

type SP = Promise<{ personId?: string; q?: string }>

function fmt(d: string): string {
  if (!d) return '—'
  if (d.startsWith('9999')) return 'Present'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as const
const th = { textAlign: 'left' as const, fontSize: 'var(--text-caption)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-3)', padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const }
const td = { fontSize: 'var(--text-body)', color: 'var(--ink-1)', padding: '8px 10px', borderBottom: '1px solid var(--border)' }

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ ...card, padding: 14, minWidth: 130 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand-active)', fontFamily: 'var(--font-serif)' }}>{value}</div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

const SUMMARY_LABELS: Record<keyof HistorySummary, { en: string; ar: string }> = {
  totalActions:    { en: 'Total Changes',   ar: 'إجمالي التغييرات' },
  promotions:      { en: 'Promotions',      ar: 'الترقيات' },
  demotions:       { en: 'Demotions',       ar: 'التخفيضات' },
  gradeChanges:    { en: 'Grade Changes',   ar: 'تغييرات الدرجة' },
  transfers:       { en: 'Dept Transfers',  ar: 'تنقلات الأقسام' },
  managerChanges:  { en: 'Manager Changes', ar: 'تغييرات المدير' },
  positionChanges: { en: 'Position Changes',ar: 'تغييرات المنصب' },
}

export default async function EmployeeHistoryPage({ searchParams }: { searchParams: SP }) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  const user = session.user
  if (!HR_ROLES.includes(user.role)) redirect(roleHome(user.role))

  const { personId, q } = await searchParams
  const locale = await getLocale()
  const ar = locale === 'ar'
  const L = (en: string, arr: string) => (ar ? arr : en)

  // ── Employee picker (no person selected) ──────────────────────────────────
  if (!personId) {
    const people = await listHistoryEmployees(user, q ?? '')
    return (
      <div className="page-in" style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>
          {L('Employee Assignment History', 'سجل تعيينات الموظف')}
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 18px' }}>
          {L('Select an employee to view their full assignment history, promotions, grade changes and manager history.',
             'اختر موظفاً لعرض سجل تعييناته الكامل والترقيات وتغييرات الدرجة وتاريخ المدير.')}
        </p>
        <form style={{ marginBottom: 16 }}>
          <input name="q" defaultValue={q ?? ''} placeholder={L('Search by name or employee number…', 'ابحث بالاسم أو رقم الموظف…')}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 14 }} />
        </form>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {people.length === 0 ? (
            <div style={{ padding: 16, fontSize: 'var(--text-body)', color: 'var(--ink-4)' }}>{L('No employees found.', 'لا يوجد موظفون.')}</div>
          ) : people.map(p => (
            <Link key={p.id} href={`/reports/employee-history?personId=${p.id}`}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink-1)' }}>
              <span style={{ fontSize: 14 }}>{ar ? p.fullNameAr : (p.fullNameEn ?? p.fullNameAr)}</span>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{p.personNumber}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  // ── Selected employee ─────────────────────────────────────────────────────
  const h = await getEmployeeAssignmentHistory(user, personId)
  if (!h) redirect('/reports/employee-history')

  return (
    <div className="page-in" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Link href="/reports/employee-history" style={{ fontSize: 'var(--text-body)', color: 'var(--brand-active)', textDecoration: 'none' }}>← {L('Back to employees', 'العودة للموظفين')}</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', margin: '8px 0 0' }}>
        {ar ? h.person.fullNameAr : (h.person.fullNameEn ?? h.person.fullNameAr)}
      </h1>
      <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 18px' }}>
        {h.person.personNumber} · {L('Hired', 'تاريخ التعيين')} {fmt(h.person.hireDate)} · {L('Status', 'الحالة')}: {h.person.assignmentStatus}
      </p>

      {/* Current state */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)', marginBottom: 10 }}>{L('Current Assignment', 'التعيين الحالي')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 14 }}>
          <div><div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>{L('Manager', 'المدير')}</div>{h.current.managerName ?? '—'}</div>
          <div><div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>{L('Position', 'المنصب')}</div>{h.current.positionTitle ?? '—'}</div>
          <div><div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>{L('Grade', 'الدرجة')}</div>{h.current.gradeName ?? '—'}</div>
          <div><div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>{L('Department', 'القسم')}</div>{h.current.departmentName ?? '—'}</div>
          <div><div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>{L('Since', 'منذ')}</div>{fmt(h.current.since ?? '')}</div>
        </div>
      </div>

      {/* Summary counts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        {(Object.keys(SUMMARY_LABELS) as (keyof HistorySummary)[]).map(k => (
          <Stat key={k} label={L(SUMMARY_LABELS[k].en, SUMMARY_LABELS[k].ar)} value={h.summary[k]} />
        ))}
      </div>

      {/* Assignment timeline */}
      <div style={{ ...card, padding: 0, marginBottom: 22, overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', borderBottom: '1px solid var(--border)' }}>{L('Assignment Timeline', 'الجدول الزمني للتعيينات')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{L('Effective Period', 'الفترة الفعلية')}</th>
            <th style={th}>{L('Action', 'الإجراء')}</th>
            <th style={th}>{L('Position', 'المنصب')}</th>
            <th style={th}>{L('Grade', 'الدرجة')}</th>
            <th style={th}>{L('Department', 'القسم')}</th>
            <th style={th}>{L('Manager', 'المدير')}</th>
            <th style={th}>{L('Current', 'الحالي')}</th>
          </tr></thead>
          <tbody>
            {h.timeline.map(t => (
              <tr key={t.assignmentId}>
                <td style={td}>{fmt(t.effectiveStartDate)} → {fmt(t.effectiveEndDate)}</td>
                <td style={td}>{t.actionType}{t.actionMode !== 'UPDATE' ? ` (${t.actionMode})` : ''}</td>
                <td style={td}>{t.positionTitle ?? '—'}</td>
                <td style={td}>{t.gradeName ?? '—'}</td>
                <td style={td}>{t.departmentName ?? '—'}</td>
                <td style={td}>{t.managerName ?? '—'}</td>
                <td style={td}>{t.isCurrent ? '✓' : ''}</td>
              </tr>
            ))}
            {h.timeline.length === 0 && <tr><td style={td} colSpan={7}>{L('No assignment history.', 'لا يوجد سجل تعيينات.')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Change narrative */}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', borderBottom: '1px solid var(--border)' }}>{L('What Changed (Employment Actions)', 'ما الذي تغيّر (إجراءات التوظيف)')}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{L('Effective', 'الفعلي')}</th>
            <th style={th}>{L('Action', 'الإجراء')}</th>
            <th style={th}>{L('Change', 'التغيير')}</th>
            <th style={th}>{L('Reason', 'السبب')}</th>
          </tr></thead>
          <tbody>
            {h.actions.map((a, i) => {
              const parts: string[] = []
              if ((a.fromManager ?? a.toManager) && a.fromManager !== a.toManager) parts.push(`${L('Manager', 'المدير')}: ${a.fromManager ?? '—'} → ${a.toManager ?? '—'}`)
              if ((a.fromGrade ?? a.toGrade) && a.fromGrade !== a.toGrade) parts.push(`${L('Grade', 'الدرجة')}: ${a.fromGrade ?? '—'} → ${a.toGrade ?? '—'}`)
              if ((a.fromPosition ?? a.toPosition) && a.fromPosition !== a.toPosition) parts.push(`${L('Position', 'المنصب')}: ${a.fromPosition ?? '—'} → ${a.toPosition ?? '—'}`)
              if ((a.fromDept ?? a.toDept) && a.fromDept !== a.toDept) parts.push(`${L('Department', 'القسم')}: ${a.fromDept ?? '—'} → ${a.toDept ?? '—'}`)
              return (
                <tr key={i}>
                  <td style={td}>{fmt(a.effectiveDate)}</td>
                  <td style={td}>{a.actionType}</td>
                  <td style={td}>{parts.length ? parts.join(' · ') : '—'}</td>
                  <td style={td}>{a.reasonText ?? '—'}</td>
                </tr>
              )
            })}
            {h.actions.length === 0 && <tr><td style={td} colSpan={4}>{L('No recorded employment actions.', 'لا توجد إجراءات توظيف مسجلة.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
