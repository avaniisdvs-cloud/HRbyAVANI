import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Inbox, AlertTriangle, Clock, ArrowRight, History } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { getPendingApprovalsV2, getApprovalHistoryForUser } from '@/modules/workflow'
import { getLocale } from '@/lib/locale-server'

export const metadata = { title: 'Approvals · AVANIIS People' }

const APPROVER_ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

function fmtGST(d: Date) {
  return d.toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' GST'
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
}

// ─── SLA badge ────────────────────────────────────────────────────────────────

function SlaBadge({ hoursLeft, isBreached }: { hoursLeft: number | null; isBreached: boolean }) {
  if (isBreached) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
        borderRadius: 999, padding: '3px 9px',
        fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>
        <AlertTriangle size={10} strokeWidth={2.5} aria-hidden />
        SLA Breached
      </span>
    )
  }
  if (hoursLeft === null) return <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>—</span>
  const isUrgent = hoursLeft < 8
  const color = isUrgent ? 'var(--status-warning-fg, #b45309)' : 'var(--ink-3)'
  const bg    = isUrgent ? 'var(--status-warning-bg, #fef3c7)' : 'transparent'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, borderRadius: 6, padding: isUrgent ? '2px 8px' : '0',
      fontSize: 'var(--text-caption)', color, fontFamily: 'var(--font-mono)',
    }}>
      <Clock size={11} strokeWidth={2} aria-hidden />
      {hoursLeft < 1 ? `<1h` : hoursLeft < 24 ? `${Math.round(hoursLeft)}h` : `${Math.round(hoursLeft / 24)}d`}
    </span>
  )
}

function resourceLabel(type: string) {
  const map: Record<string, string> = {
    absence_entries:   'Leave Request',
    worker_assignment: 'Assignment Change',
    overtime_entry:    'Overtime Request',
    salary_revision:   'Salary Revision',
    hiring_requests:   'Hiring Request',
    transfer_requests: 'Transfer Request',
  }
  return map[type] ?? type
}

// ─── Decision / status pills ────────────────────────────────────────────────

function DecisionPill({ decision }: { decision: string | null }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    APPROVE:  { bg: 'var(--status-approved-bg, #dcfce7)', fg: 'var(--status-approved-fg, #166534)', label: 'Approved' },
    REJECT:   { bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)', label: 'Rejected' },
    DELEGATE: { bg: 'var(--surface)', fg: 'var(--ink-2)', label: 'Delegated' },
  }
  const cfg = map[decision ?? ''] ?? { bg: 'var(--surface)', fg: 'var(--ink-3)', label: decision ?? '—' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', background: cfg.bg, color: cfg.fg,
      borderRadius: 999, padding: '3px 10px', fontSize: 'var(--text-caption)', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.4px',
    }}>{cfg.label}</span>
  )
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    IN_PROGRESS: 'In progress', PENDING: 'In progress', APPROVED: 'Approved',
    REJECTED: 'Rejected', CANCELLED: 'Cancelled', RECALLED: 'Recalled', COMPLETED: 'Completed',
  }
  return map[s] ?? s
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, pendingCount, ar }: { active: 'pending' | 'history'; pendingCount: number; ar: boolean }) {
  const tabs = [
    { id: 'pending', href: '/approvals', labelEn: 'Pending', labelAr: 'قيد الانتظار', count: pendingCount as number | null },
    { id: 'history', href: '/approvals?tab=history', labelEn: 'My decisions', labelAr: 'قراراتي', count: null as number | null },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
      {tabs.map(t => {
        const isActive = active === t.id
        return (
          <Link key={t.id} href={t.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '10px 16px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            color: isActive ? 'var(--brand-active)' : 'var(--ink-3)',
            borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {ar ? t.labelAr : t.labelEn}
            {t.count !== null && t.count > 0 && (
              <span style={{
                background: isActive ? 'var(--accent)' : 'var(--surface)',
                color: isActive ? '#fff' : 'var(--ink-3)',
                borderRadius: 999, fontSize: 'var(--text-caption)', fontWeight: 700, padding: '1px 7px', minWidth: 18, textAlign: 'center',
              }}>{t.count}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const locale  = await getLocale()
  const ar      = locale === 'ar'
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!APPROVER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))

  const { tab } = await searchParams
  const activeTab: 'pending' | 'history' = tab === 'history' ? 'history' : 'pending'

  const [pending, history] = await Promise.all([
    getPendingApprovalsV2(),
    activeTab === 'history' ? getApprovalHistoryForUser() : Promise.resolve([]),
  ])

  const now = Date.now()

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: '0 0 4px',
        }}>
          {ar ? 'الموافقات' : 'Approvals'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: 0 }}>
          {ar ? 'الموافقات المعلّقة وسجل قراراتك' : 'Your pending approvals and decision history'}
        </p>
      </div>

      <TabBar active={activeTab} pendingCount={pending.length} ar={ar} />

      {/* ── PENDING TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {pending.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-100)', display: 'grid', placeItems: 'center', color: 'var(--brand-active)' }}>
                <Inbox size={22} strokeWidth={1.5} />
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: 'var(--ink-1)' }}>
                {ar ? 'لا توجد موافقات معلقة' : 'All caught up'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 320 }}>
                {ar ? 'لا توجد خطوات موافقة معيّنة لك حاليًا.' : 'No approval steps are currently assigned to you.'}
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr>
                    {['Workflow', 'Request', 'Requester', 'Step', 'SLA', ''].map(h => (
                      <th key={h} style={{ padding: '11px 20px', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r, i) => {
                    const hoursLeft = r.slaDeadline ? (r.slaDeadline.getTime() - now) / 3_600_000 : null
                    const rowBg = r.isBreached ? 'color-mix(in srgb, var(--status-rejected-bg) 40%, transparent)' : 'transparent'
                    return (
                      <tr key={r.instanceId} style={{ borderBottom: i < pending.length - 1 ? '1px solid var(--border)' : 'none', background: rowBg }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3 }}>{r.workflowNameEn}</div>
                          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{r.workflowCode}</div>
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{resourceLabel(r.resourceType)}</td>
                        <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{r.initiatorName}</td>
                        <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{r.stepOrder}. {r.stepName}</td>
                        <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                          <SlaBadge hoursLeft={hoursLeft} isBreached={r.isBreached} />
                          {r.slaDeadline && <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{fmtGST(r.slaDeadline)}</div>}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <Link href={`/approvals/${r.instanceId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: r.isBreached ? 'var(--status-rejected-fg)' : 'var(--accent)', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 'var(--text-caption)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            Review <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {history.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-100)', display: 'grid', placeItems: 'center', color: 'var(--brand-active)' }}>
                <History size={22} strokeWidth={1.5} />
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: 'var(--ink-1)' }}>
                {ar ? 'لا يوجد سجل قرارات' : 'No decisions yet'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 340 }}>
                {ar ? 'ستظهر هنا الطلبات التي وافقت عليها أو رفضتها.' : 'Requests you approve, reject, or delegate will appear here.'}
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                <thead>
                  <tr>
                    {['Request', 'Requester', 'Dates', 'My decision', 'Decided', 'Current status', 'Now with', ''].map(h => (
                      <th key={h} style={{ padding: '11px 20px', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, i) => (
                    <tr key={`${r.instanceId}-${i}`} style={{ borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{r.leaveTypeName ?? r.workflowNameEn}</div>
                        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 2 }}>{resourceLabel(r.resourceType)}</div>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{r.requesterName}</td>
                      <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {r.leaveStartDate ? `${fmtDate(r.leaveStartDate)} – ${fmtDate(r.leaveEndDate)}` : '—'}
                      </td>
                      <td style={{ padding: '14px 20px' }}><DecisionPill decision={r.myDecision} /></td>
                      <td style={{ padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {r.decidedAt ? fmtGST(r.decidedAt) : '—'}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{statusLabel(r.instanceStatus)}</td>
                      <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {r.currentApproverName ? `${r.currentApproverName}${r.currentStepName ? ` · ${r.currentStepName}` : ''}` : '—'}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <Link href={`/approvals/${r.instanceId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--brand-active)', fontSize: 'var(--text-caption)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          View <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
        SLA working hours: Sun–Thu 09:00–18:00 GST · Ramadan hours apply when active
      </p>
    </div>
  )
}
