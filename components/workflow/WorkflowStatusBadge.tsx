/**
 * WorkflowStatusBadge — single status pill, driven by lib/workflow-status.ts.
 * Server-safe (no hooks). The only place tone → color/icon is decided.
 */
import { CheckCircle2, XCircle, Clock, AlertTriangle, MinusCircle, CircleDot } from 'lucide-react'
import { workflowStatusMeta, type WorkflowTone } from '@/lib/workflow-status'

const TONE: Record<WorkflowTone, { bg: string; fg: string; Icon: typeof CheckCircle2 }> = {
  approved: { bg: 'var(--status-approved-bg, #dcfce7)', fg: 'var(--status-approved-fg, #166534)', Icon: CheckCircle2 },
  rejected: { bg: 'var(--status-rejected-bg)',          fg: 'var(--status-rejected-fg)',          Icon: XCircle },
  pending:  { bg: 'var(--status-pending-bg)',           fg: 'var(--status-pending-fg)',           Icon: CircleDot },
  waiting:  { bg: 'var(--surface)',                     fg: 'var(--ink-3)',                       Icon: Clock },
  warning:  { bg: 'var(--status-warning-bg, #fef3c7)',  fg: 'var(--status-warning-fg, #b45309)',  Icon: AlertTriangle },
  neutral:  { bg: 'var(--surface)',                     fg: 'var(--ink-3)',                       Icon: MinusCircle },
}

export function WorkflowStatusBadge({ status, lang = 'en' }: { status: string; lang?: 'en' | 'ar' }) {
  const meta = workflowStatusMeta(status)
  const t = TONE[meta.tone]
  const Icon = t.Icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: t.bg, color: t.fg,
      borderRadius: 999, padding: '3px 10px',
      fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
    }}>
      <Icon size={11} strokeWidth={2.5} aria-hidden />
      {lang === 'ar' ? meta.labelAr : meta.labelEn}
    </span>
  )
}
