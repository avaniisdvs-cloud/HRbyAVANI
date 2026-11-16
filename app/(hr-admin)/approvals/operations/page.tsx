import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, AlertTriangle, Clock, Users, Layers } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { getWorkflowOperations } from '@/modules/workflow-intelligence'
import { getLocale } from '@/lib/locale-server'
import { WorkflowStatusBadge } from '@/components/workflow/WorkflowStatusBadge'

export const metadata = { title: 'Workflow Operations · AVANIIS People' }

// Org-wide oversight is HR leadership only (defense-in-depth: middleware gates the
// path, this guard re-checks, and getWorkflowOperations returns empty for others).
const OPS_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
const PAGE_SIZE = 25

function fmtGST(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' GST'
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: 'warn' | 'danger' }) {
  const fg = tone === 'danger' ? 'var(--status-rejected-fg)' : tone === 'warn' ? 'var(--status-warning-fg, #b45309)' : 'var(--ink-1)'
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', minWidth: 160, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-3)' }}>
        {icon}{label}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500, color: fg, marginTop: 6 }}>{value}</div>
    </div>
  )
}

export default async function WorkflowOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ wf?: string; status?: string; breached?: string; page?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!OPS_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await getLocale()
  const ar = locale === 'ar'
  const sp = await searchParams

  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1)
  const filters = {
    workflowCode:    sp.wf?.trim() || undefined,
    status:          sp.status?.trim() || undefined,
    slaBreachedOnly: sp.breached === '1',
    limit:           PAGE_SIZE,
    offset:          (page - 1) * PAGE_SIZE,
  }

  const { rows, total, aggregates } = await getWorkflowOperations(session, filters)
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const scopeNote = session.user.role === 'SUPER_ADMIN'
    ? (ar ? 'كل الكيانات' : 'All legal entities')
    : (ar ? 'كيانك القانوني' : 'Your legal entity')

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { wf: sp.wf, status: sp.status, breached: sp.breached, page: String(page), ...over }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    return `?${p.toString()}`
  }

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500, letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: '0 0 4px' }}>
          {ar ? 'عمليات سير العمل' : 'Workflow Operations'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
          {ar ? 'إشراف على مستوى المؤسسة (قراءة فقط)' : 'Organization-wide oversight (read-only)'} · {scopeNote}
        </p>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Metric icon={<Layers size={12} />} label={ar ? 'قيد التنفيذ' : 'In progress'} value={aggregates.pending} />
        <Metric icon={<AlertTriangle size={12} />} label={ar ? 'تجاوز المهلة' : 'SLA breached'} value={aggregates.breached} tone={aggregates.breached > 0 ? 'danger' : undefined} />
        <Metric icon={<Users size={12} />} label={ar ? 'أكبر عنق زجاجة' : 'Top bottleneck'} value={aggregates.byApprover[0] ? `${aggregates.byApprover[0].approver ?? '—'} (${aggregates.byApprover[0].count})` : '—'} />
      </div>

      {/* Filters (read-only GET form) */}
      <form method="GET" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          <div style={{ marginBottom: 4 }}>{ar ? 'رمز سير العمل' : 'Workflow code'}</div>
          <input name="wf" defaultValue={sp.wf ?? ''} placeholder="WF_ANNUAL_LEAVE" style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-body)', background: 'var(--card)', color: 'var(--ink-1)' }} />
        </label>
        <label style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          <div style={{ marginBottom: 4 }}>{ar ? 'الحالة' : 'Status'}</div>
          <select name="status" defaultValue={sp.status ?? ''} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-body)', background: 'var(--card)', color: 'var(--ink-1)' }}>
            <option value="">{ar ? 'الكل' : 'All'}</option>
            <option value="IN_PROGRESS">{ar ? 'قيد التنفيذ' : 'In progress'}</option>
            <option value="APPROVED">{ar ? 'معتمد' : 'Approved'}</option>
            <option value="REJECTED">{ar ? 'مرفوض' : 'Rejected'}</option>
            <option value="CANCELLED">{ar ? 'ملغى' : 'Cancelled'}</option>
          </select>
        </label>
        <label style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
          <input type="checkbox" name="breached" value="1" defaultChecked={sp.breached === '1'} />
          {ar ? 'متجاوزة المهلة فقط' : 'SLA breached only'}
        </label>
        <button type="submit" style={{ padding: '8px 16px', background: 'var(--accent)', color: "var(--on-accent)", border: 'none', borderRadius: 8, fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer' }}>
          {ar ? 'تصفية' : 'Filter'}
        </button>
        <Link href="/approvals/operations" style={{ padding: '8px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-3)', textDecoration: 'none' }}>{ar ? 'مسح' : 'Clear'}</Link>
      </form>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {ar ? 'لا توجد سجلات مطابقة.' : 'No matching workflows.'}
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {(ar
                    ? ['سير العمل', 'مقدّم الطلب', 'لدى الآن', 'الخطوة', 'المدة', 'المهلة', 'الحالة', '']
                    : ['Workflow', 'Requester', 'Now with', 'Step', 'Age', 'SLA', 'Status', '']
                  ).map(h => (
                    <th key={h} style={{ padding: '11px 18px', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.instanceId} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', background: r.isSlaBreached ? 'color-mix(in srgb, var(--status-rejected-bg) 35%, transparent)' : 'transparent' }}>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{r.workflowNameEn}</div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>{r.workflowCode}</div>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{r.initiatorName ?? '—'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{r.currentApproverName ?? '—'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{r.currentStepName ? `${r.currentStepOrder}/${r.totalSteps} · ${r.currentStepName}` : `${r.totalSteps} steps`}</td>
                    <td style={{ padding: '12px 18px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{Math.round(r.ageHours)}h</td>
                    <td style={{ padding: '12px 18px', whiteSpace: 'nowrap' }}>
                      {r.isSlaBreached
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--status-rejected-fg)', fontSize: 'var(--text-caption)', fontWeight: 700 }}><AlertTriangle size={11} />{ar ? 'تجاوزت المهلة' : 'Breached'}</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}><Clock size={11} />{r.slaDeadline ? fmtGST(r.slaDeadline) : '—'}</span>}
                    </td>
                    <td style={{ padding: '12px 18px' }}><WorkflowStatusBadge status={r.status} lang={ar ? 'ar' : 'en'} /></td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                      <Link href={`/approvals/${r.instanceId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-active)', fontSize: 'var(--text-caption)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        {ar ? 'عرض' : 'View'} <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
        <span>{ar ? `${total} إجمالي` : `${total} total`} · {ar ? `صفحة ${page}/${totalPages}` : `Page ${page} of ${totalPages}`}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {page > 1 && <Link href={qs({ page: String(page - 1) })} style={{ color: 'var(--brand-active)', textDecoration: 'none' }}>← {ar ? 'السابق' : 'Prev'}</Link>}
          {page < totalPages && <Link href={qs({ page: String(page + 1) })} style={{ color: 'var(--brand-active)', textDecoration: 'none' }}>{ar ? 'التالي' : 'Next'} →</Link>}
        </span>
      </div>

      <p style={{ marginTop: 14, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
        {ar ? 'للقراءة فقط — لا توجد إجراءات موافقة هنا. افتح أي طلب للعرض.' : 'Read-only oversight — no approval actions here. Open any request to view its full timeline.'}
      </p>
    </div>
  )
}
