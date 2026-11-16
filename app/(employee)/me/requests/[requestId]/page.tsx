import { PageTitle } from '@/components/ui/typography'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getWorkflowTimeline } from '@/modules/workflow-intelligence'
import { getLeaveRecommendationForInstance, getLeaveRequestSummaryForInstance } from '@/modules/aria'
import { getLocale } from '@/lib/locale-server'
import { WorkflowTimeline } from '@/components/workflow/WorkflowTimeline'
import { WorkflowStatusBadge } from '@/components/workflow/WorkflowStatusBadge'
import { AriaRecommendationCard } from '@/components/aria/AriaRecommendationCard'

export const metadata = { title: 'Request Status · Self Service' }

function fmtGST(d: Date) {
  return d.toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' GST'
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const { requestId } = await params

  // Row-level authorization (Phase B): requester (initiator) / in-chain / entity-
  // scoped admin only. Unauthorized → notFound (no partial data). Read-only view —
  // the requester sees status, not action buttons. Reuses the shared WorkflowTimeline.
  const timeline = await getWorkflowTimeline(session, requestId)
  if (!timeline) notFound()
  const detail = timeline.instance

  const [ariaRec, leave] = await Promise.all([
    getLeaveRecommendationForInstance(requestId),
    getLeaveRequestSummaryForInstance(requestId),
  ])

  const locale = await getLocale()
  const lang: 'en' | 'ar' = locale === 'ar' ? 'ar' : 'en'
  const now = new Date()

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box', maxWidth: 820 }}>

      <Link href="/me/requests" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-body)', color: 'var(--ink-3)', textDecoration: 'none', marginBottom: 18 }}>
        <ChevronLeft size={15} strokeWidth={2} aria-hidden />
        {lang === 'ar' ? 'طلباتي' : 'My Requests'}
      </Link>

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--ink-1)', margin: 0 }}>
            {detail.workflowNameEn}
          </PageTitle>
          <WorkflowStatusBadge status={detail.status} lang={lang} />
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {detail.workflowCode} · {fmtGST(detail.startedAt)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Request summary (leave only) */}
        {leave && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{lang === 'ar' ? 'ملخص الطلب' : 'Request summary'}</h3>
            </div>
            <div style={{ padding: '6px 20px 14px' }}>
              {([
                ['Absence type', (lang === 'ar' ? leave.typeNameAr : leave.typeNameEn) ?? '—'],
                ['Dates', `${leave.startDateFmt} – ${leave.endDateFmt}`],
                ['Days', `${leave.durationDays}${leave.isHalfDay ? ' · half-day' : ''}`],
                ['Reason / notes', leave.notes && leave.notes.trim() ? leave.notes : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div data-responsive-grid="true" key={label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{label}</span>
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shared timeline — chain + audit + intelligence (no duplicate implementation) */}
        <WorkflowTimeline data={timeline} lang={lang} now={now} />

        {/* ARIA recommendation (leave only; read-only fetch — no generation on render) */}
        {detail.resourceType === 'absence_entries' && (
          <AriaRecommendationCard recommendation={ariaRec} lang={lang} />
        )}
      </div>
    </div>
  )
}
