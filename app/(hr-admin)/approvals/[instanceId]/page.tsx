import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { getWorkflowTimeline } from '@/modules/workflow-intelligence'
import { getLeaveRecommendationForInstance, getLeaveRequestSummaryForInstance } from '@/modules/aria'
import { getLocale } from '@/lib/locale-server'
import { WorkflowActionForm } from './action-form'
import { AriaRecommendationCard } from '@/components/aria/AriaRecommendationCard'
import { WorkflowTimeline } from '@/components/workflow/WorkflowTimeline'
import { WorkflowStatusBadge } from '@/components/workflow/WorkflowStatusBadge'
import { startTimer, SLOW_PAGE_MS } from '@/lib/telemetry'
import { logger } from '@/lib/logger'

export const metadata = { title: 'Review Approval · AVANIIS People' }

const APPROVER_ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

function fmtGST(d: Date) {
  return d.toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' GST'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!APPROVER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))

  const { instanceId } = await params

  // ⚡ P1 perf instrumentation — server data-fetch timing for the review page.
  const _t = startTimer()

  // CWE-639 fix: row-level authorization. Unauthorized (or unknown) → notFound(),
  // never partial data. Only stakeholders / entity-scoped admins get the instance.
  const timeline = await getWorkflowTimeline(session, instanceId)
  if (!timeline) notFound()
  const detail = timeline.instance

  // Resource-specific extras (read-only — recommendation fetch NO LONGER generates).
  const [ariaRec, leave] = await Promise.all([
    getLeaveRecommendationForInstance(instanceId),
    getLeaveRequestSummaryForInstance(instanceId),
  ])

  const _dataMs = _t.elapsedMs()
  logger.info('approvals', 'review page data loaded', {
    instanceId, durationMs: _dataMs, slow: _dataMs > SLOW_PAGE_MS,
    hasAriaRec: !!ariaRec,
  })

  const locale = await getLocale()
  const lang: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en'
  const now = new Date()

  const myPendingStep = detail.steps.find(
    s => s.status === 'PENDING' && s.assigneePersonId === session.user.personId,
  )
  const myDecidedStep = detail.steps.find(
    s => s.assigneePersonId === session.user.personId && !!s.decision,
  )
  const isComplete = ['APPROVED', 'REJECTED', 'CANCELLED', 'RECALLED'].includes(detail.status)
  const currentPendingStep = detail.steps.find(s => s.status === 'PENDING')

  let requestSummaryLine = ''
  if (leave) {
    const typeLabel = (lang === 'ar' ? leave.typeNameAr : leave.typeNameEn) ?? detail.workflowNameEn
    const stagePart = !isComplete && currentPendingStep
      ? `, pending ${currentPendingStep.stepName} approval`
      : ''
    requestSummaryLine =
      `${typeLabel} from ${leave.employeeName} for ${leave.startDateFmt} – ${leave.endDateFmt} ` +
      `(${leave.durationDays} day${leave.durationDays === 1 ? '' : 's'})${stagePart}.`
  }

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box', maxWidth: 860 }}>

      {/* Back */}
      <Link
        href="/approvals"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 'var(--text-body)', color: 'var(--ink-3)', textDecoration: 'none', marginBottom: 20,
        }}
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        Back to inbox
      </Link>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500,
            letterSpacing: '-0.4px', color: 'var(--ink-1)', margin: 0,
          }}>
            {detail.workflowNameEn}
          </h1>
          <WorkflowStatusBadge status={detail.status} lang={lang} />
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {detail.workflowCode} · Initiated by {detail.initiatorName} · {fmtGST(detail.startedAt)}
        </div>
        {requestSummaryLine && (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', margin: '8px 0 0 0', lineHeight: 1.5 }}>
            {requestSummaryLine}
          </p>
        )}
      </div>

      {/* Two-column: main (left) · ARIA + history (right). Responsive — stacks on mobile. */}
      <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_340px]">

        {/* ── LEFT: actions (top) · details · approval chain · actions (bottom) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* TOP action panel — so approvers don't have to scroll */}
          {!isComplete && myPendingStep && (
            <WorkflowActionForm
              stepInstanceId={myPendingStep.stepInstanceId}
              isFyiOnly={myPendingStep.isFyiOnly}
              canDelegate={myPendingStep.canDelegate}
              resourceType={detail.resourceType}
              resourceId={detail.resourceId}
            />
          )}

          {!isComplete && !myPendingStep && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
              <Clock size={16} strokeWidth={2} style={{ color: 'var(--ink-3)', flexShrink: 0, marginTop: 1 }} aria-hidden />
              <div>
                {myDecidedStep ? (
                  <>
                    You already actioned the <strong>{myDecidedStep.stepName}</strong> step
                    {myDecidedStep.decision ? ` (${myDecidedStep.decision === 'APPROVE' ? 'approved' : myDecidedStep.decision === 'REJECT' ? 'rejected' : 'delegated'})` : ''}.{' '}
                    {currentPendingStep
                      ? <>This request is now with <strong>{currentPendingStep.assigneeName ?? currentPendingStep.stepName}</strong>.</>
                      : 'No further action is required from you.'}
                  </>
                ) : (
                  <><strong>View only.</strong> You are not the current approver on this request
                    {currentPendingStep ? <> — it is awaiting <strong>{currentPendingStep.assigneeName ?? currentPendingStep.stepName}</strong>.</> : '.'}</>
                )}
              </div>
            </div>
          )}

          {isComplete && (
            <div style={{
              background: detail.status === 'APPROVED' ? 'var(--status-approved-bg, #dcfce7)' : 'var(--status-rejected-bg)',
              border: `1px solid ${detail.status === 'APPROVED' ? 'var(--status-approved-border, #86efac)' : 'var(--status-rejected-border, #fca5a5)'}`,
              borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600,
              color: detail.status === 'APPROVED' ? 'var(--status-approved-fg, #166534)' : 'var(--status-rejected-fg)',
            }}>
              {detail.status === 'APPROVED' ? <CheckCircle2 size={18} strokeWidth={2} /> : <XCircle size={18} strokeWidth={2} />}
              This workflow has been {detail.status.toLowerCase()}.
              {detail.completedAt && (
                <span style={{ fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', marginLeft: 4, fontWeight: 400 }}>{fmtGST(detail.completedAt)}</span>
              )}
            </div>
          )}

          {/* Leave Request Details */}
          {leave && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{lang === 'ar' ? 'تفاصيل طلب الإجازة' : 'Leave Request Details'}</h3>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{leave.requestNumber}</span>
              </div>
              <div style={{ padding: '6px 20px 14px' }}>
                {([
                  ['Employee',       `${leave.employeeName} (${leave.employeeNumber})`],
                  ['Leave type',     (lang === 'ar' ? leave.typeNameAr : leave.typeNameEn) ?? '—'],
                  ['Start date',     leave.startDateFmt],
                  ['End date',       leave.endDateFmt],
                  ['Duration',       `${leave.durationDays} day${leave.durationDays === 1 ? '' : 's'}${leave.isHalfDay ? ` · half-day${leave.halfDayPeriod ? ` (${leave.halfDayPeriod})` : ''}` : ''}`],
                  ['Reason / comments', leave.notes && leave.notes.trim() ? leave.notes : '—'],
                  ['Attachment',     leave.hasAttachment ? 'Yes — supporting document attached' : 'None'],
                  ['Balance before', leave.balanceBefore !== null
                    ? `${leave.balanceBefore} days${leave.balanceSource === 'live' ? ' · current balance (legacy fallback — not as-of-submission)' : ''}`
                    : (leave.requiresBalance ? '—' : 'Not applicable (no balance control)')],
                  ['Balance after',  leave.balanceAfter !== null
                    ? `${leave.balanceAfter} days${leave.balanceSource === 'live' ? ' · current balance (legacy fallback — not as-of-submission)' : ''}`
                    : (leave.requiresBalance ? '—' : 'Not applicable (no balance control)')],
                  ['Submitted',      fmtGST(detail.startedAt)],
                  ['Current status', leave.status],
                  ['Current approver', isComplete ? '—' : (currentPendingStep ? `${currentPendingStep.assigneeName ?? '—'}${currentPendingStep.stepName ? ` (${currentPendingStep.stepName})` : ''}` : 'Resolving…')],
                ] as [string, string][]).map(([label, value]) => (
                  <div data-responsive-grid="true" key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{label}</span>
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!leave && detail.resourceType === 'absence_entries' && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
              {lang === 'ar' ? 'تعذّر تحميل تفاصيل الإجازة.' : 'Leave request details could not be loaded.'}
            </div>
          )}

          {/* Approval chain (left) */}
          <WorkflowTimeline data={timeline} lang={lang} now={now} sections={{ summary: true, chain: true, audit: false }} />


        </div>

        {/* ── RIGHT: ARIA recommendation · workflow history ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 16 }}>
          {detail.resourceType === 'absence_entries' && (
            <AriaRecommendationCard recommendation={ariaRec} lang={lang} />
          )}
          {/* Workflow history (audit) */}
          <WorkflowTimeline data={timeline} lang={lang} now={now} sections={{ summary: false, chain: false, audit: true }} />
        </div>
      </div>
    </div>
  )
}
