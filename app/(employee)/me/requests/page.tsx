import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Inbox, ArrowRight, AlertTriangle, Clock } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getMyRequests } from '@/modules/workflow-intelligence'
import { getLocale } from '@/lib/locale-server'
import { WorkflowStatusBadge } from '@/components/workflow/WorkflowStatusBadge'

export const metadata = { title: 'My Requests · Self Service' }

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
}

// Generic resource-type label — works for any current/future workflow type.
function resourceLabel(type: string, fallback: string) {
  const map: Record<string, string> = {
    absence_entries:   'Leave',
    hiring_requests:   'Hiring',
    transfer_requests: 'Transfer / Promotion',
    probation_review:  'Probation',
    employee_letters:  'Letter',
  }
  return map[type] ?? fallback
}

const isComplete = (s: string) => ['APPROVED', 'REJECTED', 'CANCELLED', 'RECALLED'].includes(s)

export default async function MyRequestsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await getLocale()
  const ar = locale === 'ar'
  // Self-scoped (requester sees only their own), generic over all workflow types.
  const rows = await getMyRequests(session)

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box', maxWidth: 980 }}>
      <div style={{ marginBottom: 18 }}>
        <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500, letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0 }}>
          {ar ? 'طلباتي' : 'My Requests'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0' }}>
          {ar ? 'حالة كل ما قدّمته — مع الموافِق الحالي والتالي والتقدّم' : 'Status of everything you submitted — current approver, next approver, and progress.'}
        </p>
      </div>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-100)', display: 'grid', placeItems: 'center', color: 'var(--brand-active)' }}>
            <Inbox size={20} strokeWidth={1.5} />
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink-1)' }}>{ar ? 'لا توجد طلبات' : 'No requests yet'}</div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', maxWidth: 340 }}>{ar ? 'ستظهر هنا طلبات الإجازة والخطابات والتحويلات وغيرها بمجرد تقديمها.' : 'Leave, letters, transfers and other requests appear here once submitted.'}</div>
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr>
                  {['Request', 'Submitted', 'Status', 'Now with', 'Progress', ''].map(h => (
                    <th key={h} style={{ padding: '11px 18px', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.instanceId} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', background: r.isSlaBreached && !isComplete(r.status) ? 'color-mix(in srgb, var(--status-rejected-bg) 30%, transparent)' : 'transparent' }}>
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{r.workflowNameEn}</div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{resourceLabel(r.resourceType, r.workflowCode)}</div>
                    </td>
                    <td style={{ padding: '13px 18px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{fmtDate(r.startedAt)}</td>
                    <td style={{ padding: '13px 18px' }}><WorkflowStatusBadge status={r.status} lang={ar ? 'ar' : 'en'} /></td>
                    <td style={{ padding: '13px 18px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                      {isComplete(r.status)
                        ? '—'
                        : r.currentApproverName
                          ? <>{ar ? 'بانتظار: ' : 'Pending with: '}<strong style={{ fontWeight: 600 }}>{r.currentApproverName}</strong>{r.currentStepName ? ` (${r.currentStepName})` : ''}</>
                          : (ar ? 'قيد التحديد…' : 'Resolving…')}
                      {!isComplete(r.status) && r.isSlaBreached && (
                        <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--status-rejected-fg)', fontSize: 'var(--text-caption)', fontWeight: 700 }}><AlertTriangle size={10} />SLA</span>
                      )}
                    </td>
                    <td style={{ padding: '13px 18px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={11} aria-hidden />{r.currentStepOrder}/{r.totalSteps}
                        {r.nextApproverName && !isComplete(r.status) ? <span style={{ color: 'var(--ink-4)' }}> · {ar ? 'التالي' : 'next'}: {r.nextApproverName}</span> : null}
                      </span>
                    </td>
                    <td style={{ padding: '13px 18px', textAlign: 'right' }}>
                      <Link href={`/me/requests/${r.instanceId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-active)', fontSize: 'var(--text-caption)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        {ar ? 'عرض' : 'View'} <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ marginTop: 14, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
        {ar ? 'افتح أي طلب لرؤية المخطط الزمني الكامل للموافقات.' : 'Open any request to see its full approval timeline.'}
      </p>
    </div>
  )
}
