/**
 * WorkflowTimeline — the single reusable workflow timeline.
 *
 * Renders, from one shared data shape, for every surface (approval detail,
 * employee request detail, bell preview):
 *   - an intelligence summary strip (current/next approver, age, SLA)
 *   - the approval chain (steps, statuses, decisions)
 *   - the audit trail (business-friendly labels via friendlyAuditLabel)
 *
 * Server-safe (no hooks). Status vocabulary comes only from lib/workflow-status.
 */
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { friendlyAuditLabel } from '@/lib/workflow-audit-labels'
import type { WorkflowTimeline as WorkflowTimelineData } from '@/modules/workflow-intelligence'
import { WorkflowStatusBadge } from './WorkflowStatusBadge'

function fmtGST(d: Date | string | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' GST'
}

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
}
const head: React.CSSProperties = { padding: '14px 20px', borderBottom: '1px solid var(--border)' }

export function WorkflowTimeline({
  data, lang = 'en', now = new Date(), sections,
}: {
  data: WorkflowTimelineData
  lang?: 'en' | 'ar'
  now?: Date
  /** Which parts to render. Default: all. Lets a 2-column layout place chain
      (left) and audit/history (right) using the SAME component (no duplication). */
  sections?: { summary?: boolean; chain?: boolean; audit?: boolean }
}) {
  const { instance, intelligence } = data
  const ar = lang === 'ar'
  const show = {
    summary: sections?.summary ?? true,
    chain:   sections?.chain   ?? true,
    audit:   sections?.audit   ?? true,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Intelligence summary strip */}
      {show.summary && intelligence && (
        <div style={{ ...card, padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <SummaryItem label={ar ? 'الحالة' : 'Status'} >
            <WorkflowStatusBadge status={intelligence.status} lang={lang} />
          </SummaryItem>
          {intelligence.currentApproverName && (
            <SummaryItem label={ar ? 'مع' : 'Now with'} value={`${intelligence.currentApproverName}${intelligence.currentStepName ? ` · ${intelligence.currentStepName}` : ''}`} />
          )}
          {intelligence.nextApproverName && (
            <SummaryItem label={ar ? 'التالي' : 'Next'} value={intelligence.nextApproverName} />
          )}
          <SummaryItem label={ar ? 'العمر' : 'Age'} value={`${Math.round(intelligence.ageHours)}h`} />
          {intelligence.slaDeadline && (
            <SummaryItem label="SLA">
              {intelligence.isSlaBreached
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--status-rejected-fg)', fontSize: 'var(--text-caption)', fontWeight: 700 }}><AlertTriangle size={11} />{ar ? 'تجاوز المهلة' : 'Breached'}</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}><Clock size={11} />{fmtGST(intelligence.slaDeadline)}</span>}
            </SummaryItem>
          )}
        </div>
      )}

      {/* Approval chain */}
      {show.chain && (
      <div style={card}>
        <div style={head}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{ar ? 'سلسلة الموافقة' : 'Approval chain'}</h3>
        </div>
        <div style={{ padding: '4px 0' }}>
          {instance.steps.map((step, i) => (
            <div key={step.stepInstanceId} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px',
              borderBottom: i < instance.steps.length - 1 ? '1px solid var(--border)' : 'none',
              background: step.status === 'PENDING' ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                fontSize: 'var(--text-caption)', fontWeight: 700,
                background: step.status === 'APPROVED' ? 'var(--status-approved-bg, #dcfce7)'
                  : step.status === 'REJECTED' ? 'var(--status-rejected-bg)'
                  : step.status === 'PENDING' ? 'var(--accent)' : 'var(--surface)',
                color: step.status === 'APPROVED' ? 'var(--status-approved-fg, #166534)'
                  : step.status === 'REJECTED' ? 'var(--status-rejected-fg)'
                  : step.status === 'PENDING' ? '#fff' : 'var(--ink-3)',
              }}>
                {step.status === 'APPROVED' ? <CheckCircle2 size={14} strokeWidth={2.5} />
                  : step.status === 'REJECTED' ? <XCircle size={14} strokeWidth={2.5} /> : step.stepOrder}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{step.stepName}</span>
                  <WorkflowStatusBadge status={step.status} lang={lang} />
                  {step.isFyiOnly && (
                    <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>FYI</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 3 }}>
                  {step.assigneeName ?? '—'}
                  {step.decidedAt && <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>· {fmtGST(step.decidedAt)}</span>}
                </div>
                {step.decisionNote && (
                  <div style={{ marginTop: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-2)', background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', borderLeft: '2px solid var(--border)' }}>{step.decisionNote}</div>
                )}
              </div>
              {step.status === 'PENDING' && step.slaDeadline && (
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  {now > step.slaDeadline
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--status-rejected-fg)', fontSize: 'var(--text-caption)', fontWeight: 700 }}><AlertTriangle size={11} />{ar ? 'تجاوز' : 'Breached'}</div>
                    : <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}><Clock size={11} />{fmtGST(step.slaDeadline)}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Audit trail — business-friendly labels */}
      {show.audit && (
      <div style={card}>
        <div style={head}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{ar ? 'سجل التدقيق' : 'Audit trail'}</h3>
        </div>
        <div style={{ padding: '8px 0', maxHeight: 360, overflowY: 'auto' }}>
          {instance.auditEvents.length === 0 ? (
            <div style={{ padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{ar ? 'لا أحداث بعد.' : 'No events yet.'}</div>
          ) : instance.auditEvents.map((e, i) => (
            <div key={`${e.loggedAt}-${e.action}-${i}`} style={{ padding: '8px 20px', borderBottom: i < instance.auditEvents.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>{friendlyAuditLabel(e.action, lang)}</div>
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>{e.actorName ?? 'System'}</div>
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{fmtGST(e.loggedAt)}</div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

function SummaryItem({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-4)' }}>{label}</span>
      {children ?? <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{value}</span>}
    </div>
  )
}
