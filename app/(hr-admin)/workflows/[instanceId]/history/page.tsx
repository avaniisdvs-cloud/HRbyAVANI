import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { getWorkflowInstanceDetailV2 } from '@/modules/workflow'
import { Badge } from '@/components/ui/badge'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Workflow history · AVANIIS HR' }

const APPROVER_ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

export default async function WorkflowHistoryPage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!APPROVER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await resolveLocale(session.user.personId)

  const { instanceId } = await params

  const detail = await getWorkflowInstanceDetailV2(instanceId)
  if (!detail) notFound()

  const formatTs = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ')

  return (
    <div className="page-in">
      <div>
        <Link
          href={`/workflows/${detail.instanceId}`}
          className="text-xs text-accent hover:underline"
        >
          {locale === 'ar' ? '← العودة إلى سير العمل' : '← Back to workflow'}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>
            {locale === 'ar' ? 'السجل' : 'History'}
          </h1>
          <Badge>{detail.status}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-ink-3">
          {detail.workflowCode} · {detail.resourceType}#{detail.resourceId.slice(0, 8)}…
        </p>
      </div>

      {/* Workflow summary */}
      <div style={{ marginTop: 24, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'ملخّص سير العمل' : 'Workflow summary'}
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-1.5 text-sm">
          <Row k={locale === 'ar' ? 'سير العمل' : 'Workflow'} v={detail.workflowNameEn} />
          <Row k={locale === 'ar' ? 'المقدِّم' : 'Initiator'} v={detail.initiatorName} />
          <Row k={locale === 'ar' ? 'تاريخ البدء' : 'Initiated at'} v={formatTs(detail.startedAt)} />
          <Row k={locale === 'ar' ? 'موعد SLA' : 'SLA deadline'}
               v={detail.slaDeadline ? formatTs(detail.slaDeadline) : '—'} />
          {detail.completedAt && (
            <Row k={locale === 'ar' ? 'تاريخ الإنجاز' : 'Completed at'} v={formatTs(detail.completedAt)} />
          )}
          {detail.steps.find(s => s.decision === 'REJECT')?.decisionNote && (
            <Row k={locale === 'ar' ? 'سبب الرفض' : 'Rejection reason'}
                 v={detail.steps.find(s => s.decision === 'REJECT')!.decisionNote!}
                 valueClassName="text-destructive" />
          )}
        </div>
      </div>

      {/* Approval chain */}
      <div style={{ marginTop: 24, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'سلسلة الموافقة' : 'Approval chain'} ({detail.steps.length})
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {detail.steps.length === 0 ? (
            <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا توجد مراحل.' : 'No steps available.'}</p>
          ) : (
            <ol className="space-y-2">
              {detail.steps.map(s => {
                const isCurrent = s.status === 'PENDING'
                return (
                  <li
                    key={s.stepInstanceId}
                    className={`rounded-md border p-2.5 ${
                      isCurrent ? 'border-accent bg-accent-050' : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">{s.stepOrder}</Badge>
                      <span className="text-sm font-medium text-ink-1">{s.stepName}</span>
                      <span className="text-xs text-ink-3">{s.assigneeName ?? '—'}</span>
                      {s.slaDeadline && (
                        <span className="text-xs text-ink-3">
                          · SLA {formatTs(s.slaDeadline)}
                        </span>
                      )}
                      {isCurrent && <Badge>{locale === 'ar' ? 'حالية' : 'Current'}</Badge>}
                      {s.status === 'APPROVED' && <Badge variant="outline">{locale === 'ar' ? 'موافقة' : 'Approved'}</Badge>}
                      {s.status === 'REJECTED' && <Badge variant="outline" className="text-destructive">{locale === 'ar' ? 'رفض' : 'Rejected'}</Badge>}
                      {s.status === 'SKIPPED' && <Badge variant="outline">{locale === 'ar' ? 'متجاوَزة' : 'Skipped'}</Badge>}
                    </div>
                    {s.decisionNote && (
                      <p className="mt-1 text-xs italic text-ink-2">&ldquo;{s.decisionNote}&rdquo;</p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>

      {/* Audit timeline */}
      <div style={{ marginTop: 24, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'جدول القرارات' : 'Decision timeline'} ({detail.auditEvents.length})
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {detail.auditEvents.length === 0 ? (
            <p className="text-sm text-ink-3">
              {locale === 'ar' ? 'لم تُسجّل أي قرارات بعد.' : 'No decisions recorded yet.'}
            </p>
          ) : (
            <ol className="space-y-3">
              {[...detail.auditEvents].reverse().map((e, i) => {
                const accent =
                  e.action === 'APPROVED' || e.action === 'APPROVE'
                    ? 'border-accent'
                    : e.action === 'REJECTED' || e.action === 'REJECT'
                      ? 'border-destructive'
                      : 'border-status-warning'
                return (
                  <li key={i} className={`border-s-2 ps-3 ${accent}`}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs font-medium text-ink-1">
                        {e.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-ink-2">
                        {e.actorName ?? 'System'}
                      </span>
                      <span className="ms-auto font-mono text-xs text-ink-3">
                        {formatTs(e.loggedAt)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-3" style={{ marginTop: 24 }}>
        Approval chain sourced from <code className="font-mono">workflow_step_instances</code>.
        Audit events sourced from <code className="font-mono">workflow_audit_log</code>.
      </p>
    </div>
  )
}

function Row({
  k, v, valueClassName,
}: { k: string; v: string; valueClassName?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="min-w-[180px] text-xs uppercase tracking-wide text-ink-3">{k}</span>
      <span className={`text-ink-1 ${valueClassName ?? ''}`}>{v}</span>
    </div>
  )
}
