import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { getLeaveRequest } from '@/modules/absence'
import { getWorkflowStatusForRequest } from '@/modules/workflow'
import type { WorkflowStatusDetail } from '@/modules/workflow'
import { Badge } from '@/components/ui/badge'
import { resolveLocale } from '@/lib/language-preference'
import type { Locale } from '@/lib/i18n'
import { LeaveDecisionBar } from './LeaveDecisionBar'
import { LeaveCertUploadWidget } from './LeaveCertUploadWidget'

export const metadata = { title: 'Leave request detail' }

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default async function LeaveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submitted?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN', 'FINANCE']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const { id } = await params
  const sp = searchParams ? await searchParams : {} as { submitted?: string }
  const locale = await resolveLocale(session.user.personId)

  const view = await getLeaveRequest(id)
  if (!view) notFound()

  const justSubmitted = sp.submitted === 'true'
  const isOpen        = view.status === 'PENDING'
  const isDraft       = view.status === 'DRAFT' || view.status === 'REJECTED'
  const isCancelable  = ['DRAFT', 'PENDING', 'APPROVED'].includes(view.status)

  // Fetch v2 workflow status keyed by absence entry ID (resourceId)
  const wf = await getWorkflowStatusForRequest(view.id).catch(() => null)

  // ── Decision/cancel authorisation (mirrors the server rule in takeWorkflowAction) ──
  // Approve/Reject appear ONLY to the actual assigned approver of the current
  // pending step (relationship-based — any functional role can be the approver if
  // the workflow assigned the step to them), or to a privileged HR role. NEVER to
  // the applicant: a user cannot approve their own leave even if their functional
  // role is MANAGER/HR. takeWorkflowAction enforces the same rule server-side.
  const PRIVILEGED_HR_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  const pendingStep        = wf?.steps?.find(s => s.status === 'PENDING') ?? null
  const isApplicant        = !!session.user.personId && session.user.personId === view.personId
  const isAssignedApprover = !!session.user.personId && pendingStep?.assigneePersonId === session.user.personId
  const isPrivilegedHr     = PRIVILEGED_HR_ROLES.includes(session.user.role)

  const canDecide = isOpen && !isApplicant && (isAssignedApprover || isPrivilegedHr)
  // The applicant may cancel their own request; HR and the assigned approver may also cancel.
  const canCancel = isCancelable && (isApplicant || isPrivilegedHr || isAssignedApprover)

  return (
    <div className="page-in">

      {/* ── Submission confirmation banner ── */}
      {justSubmitted && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            background: 'var(--status-success-bg)',
            border: '1px solid var(--status-success-border)',
            borderRadius: 'var(--radius-lg, 8px)',
            padding: '14px 18px', marginBottom: 20,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="10" cy="10" r="9" fill="var(--status-step-done)" />
            <path d="M6 10.5l2.5 2.5 5.5-5.5" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--status-success-fg)' }}>
              {locale === 'ar' ? 'تم تقديم طلب الإجازة بنجاح' : 'Leave submitted successfully'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-body)', color: 'var(--status-success-fg)', opacity: 0.85 }}>
              {locale === 'ar' ? (
                <span dir="rtl">الطلب {view.requestNumber} قيد انتظار الموافقة. سيتم إبلاغك فور اتخاذ القرار.</span>
              ) : (
                <>Request <strong>{view.requestNumber}</strong> is now pending approval. You will be notified once a decision is made.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/absence" className="text-xs text-accent hover:underline">{locale === 'ar' ? '← جميع طلبات الإجازات' : '← All leave requests'}</Link>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>
            {view.requestNumber}
            <span className="ms-3 align-middle">
              <Badge
                variant={
                  view.status === 'APPROVED' || view.status === 'TAKEN' ? 'secondary'
                  : view.status === 'REJECTED' || view.status === 'CANCELLED' ? 'outline'
                  : 'default'
                }
              >
                {view.status}
              </Badge>
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {view.personFullNameEn} · <span dir="rtl">{view.personFullNameAr}</span>
            {view.personNumber && <span className="ms-2 font-mono text-xs">({view.personNumber})</span>}
          </p>
        </div>
      </div>

      {/* ── Approval tracker (full-width, shown when v2 workflow exists) ── */}
      {wf && (
        <ApprovalTracker wf={wf} leaveStatus={view.status} locale={locale} />
      )}

      {/* ── Detail cards ── */}
      <div className="grid gap-6 md:grid-cols-2" style={{ marginTop: 24 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'تفاصيل الطلب' : 'Request details'}</h3>
          </div>
          <div style={{ padding: '16px 20px' }} className="space-y-2 text-sm">
            <Row label={locale === 'ar' ? 'النوع' : 'Type'}>
              {view.absenceTypeNameEn ?? view.absenceTypeCode ?? '—'}
              {view.absenceTypeNameAr && (
                <span className="ms-2 text-xs text-ink-3" dir="rtl">{view.absenceTypeNameAr}</span>
              )}
            </Row>
            <Row label={locale === 'ar' ? 'الفترة' : 'Range'}>
              <span className="font-mono">{view.startDate} → {view.endDate}</span>
              {view.isHalfDay && <Badge variant="outline" className="ms-2">½ {view.halfDayPeriod}</Badge>}
            </Row>
            <Row label={locale === 'ar' ? 'الأيام' : 'Days'}>{view.durationDays}</Row>
            <Row label={locale === 'ar' ? 'تم التقديم عبر' : 'Submitted via'}>{view.submittedVia}</Row>
            <Row label={locale === 'ar' ? 'تاريخ الإنشاء' : 'Created'}>{new Date(view.createdDate).toISOString().slice(0, 19).replace('T', ' ')}</Row>
            {view.notes && (
              <div className="pt-2">
                <div className="text-xs text-ink-3">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</div>
                <div className="rounded bg-surface p-2 text-sm">{view.notes}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'سير العمل + الرصيد' : 'Workflow + balance'}</h3>
          </div>
          <div style={{ padding: '16px 20px' }} className="space-y-2 text-sm">
            <Row label={locale === 'ar' ? 'نسخة سير العمل' : 'Workflow instance'}>
              {wf ? (
                <span className="font-mono text-xs">{wf.instanceId}</span>
              ) : (
                <span className="text-ink-3">{locale === 'ar' ? '— لم يُقدَّم بعد —' : '— not yet submitted —'}</span>
              )}
            </Row>
            <Row label={locale === 'ar' ? 'تمت الموافقة بواسطة' : 'Approved by'}>{view.approvedBy ?? '—'}</Row>
            <Row label={locale === 'ar' ? 'تاريخ الموافقة' : 'Approval date'}>
              {view.approvalDate
                ? new Date(view.approvalDate).toISOString().slice(0, 19).replace('T', ' ')
                : '—'}
            </Row>
            {view.rejectionReason && (
              <div className="pt-2">
                <div className="text-xs text-ink-3">{locale === 'ar' ? 'سبب الرفض / الإلغاء' : 'Rejection / cancellation reason'}</div>
                <div className="rounded bg-surface p-2 text-sm">{view.rejectionReason}</div>
              </div>
            )}
            <Row label={locale === 'ar' ? 'الرصيد قبل' : 'Balance before'}>{view.balanceBeforeDays ?? '—'}</Row>
            <Row label={locale === 'ar' ? 'الرصيد بعد' : 'Balance after'}>{view.balanceAfterDays ?? '—'}</Row>
            <Row label={locale === 'ar' ? 'الشهادة الطبية مطلوبة' : 'Medical cert required'}>{view.medicalCertRequired ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')}</Row>
            {view.medicalCertRequired && (
              <Row label={locale === 'ar' ? 'تم رفع الشهادة' : 'Cert uploaded'}>{view.medicalCertUploaded ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')}</Row>
            )}
          </div>
        </div>
      </div>

      {/* ── Medical certificate upload (shown when cert is required) ── */}
      {view.medicalCertRequired && (
        <div style={{ marginTop: 24 }}>
          <LeaveCertUploadWidget
            requestId={view.id}
            certUploaded={!!view.medicalCertUploaded}
            uploadedFileName={null}
            canUpload={isDraft}
            locale={locale}
          />
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <LeaveDecisionBar
          requestId={view.id}
          status={view.status}
          canSubmit={isDraft}
          canDecide={canDecide}
          canCancel={canCancel}
          locale={locale}
        />
      </div>
    </div>
  )
}

// ── Approval Tracker (v2) ─────────────────────────────────────────────────────

function ApprovalTracker({
  wf,
  leaveStatus,
  locale,
}: {
  wf: WorkflowStatusDetail
  leaveStatus: string
  locale: Locale
}) {
  const wfDone = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(wf.status)

  const pendingStep = wf.steps.find(s => s.status === 'PENDING')
  const pendingWith = pendingStep?.assigneeName ?? '—'

  return (
    <div
      style={{
        marginTop: 20,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'مسار الموافقة' : 'Approval Progress'}
        </h3>
        {!wfDone && pendingStep && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 'var(--text-caption)', fontWeight: 600,
              color: 'var(--brand-active)',
              background: 'var(--accent-050)',
              border: '1px solid var(--accent-200)',
              borderRadius: 20, padding: '3px 10px',
            }}
          >
            <span
              style={{
                display: 'inline-block', width: 7, height: 7,
                borderRadius: '50%', background: 'var(--accent)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            {locale === 'ar' ? 'بانتظار: ' : 'Pending with: '}{pendingWith}
          </span>
        )}
        {wf.status === 'APPROVED' && (
          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--status-approved-fg)', background: 'var(--status-approved-bg)', border: '1px solid var(--status-approved-dot)', borderRadius: 20, padding: '3px 10px' }}>
            {locale === 'ar' ? '✓ تمت الموافقة بالكامل' : '✓ Fully Approved'}
          </span>
        )}
        {wf.status === 'REJECTED' && (
          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--status-rejected-fg)', background: 'var(--status-rejected-bg)', border: '1px solid var(--status-rejected-dot)', borderRadius: 20, padding: '3px 10px' }}>
            {locale === 'ar' ? '✗ مرفوض' : '✗ Rejected'}
          </span>
        )}
      </div>

      {/* Step pipeline */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {wf.steps.map((step, idx) => {
            const isLast = idx === wf.steps.length - 1
            const state: 'done' | 'current' | 'upcoming' | 'rejected' =
              step.status === 'APPROVED' || step.status === 'AUTO_APPROVED' ? 'done'
              : step.status === 'REJECTED'  ? 'rejected'
              : step.status === 'PENDING'   ? 'current'
              : 'upcoming'

            return (
              <StepRow
                key={step.stepOrder}
                step={step}
                state={state}
                isLast={isLast}
                locale={locale}
              />
            )
          })}
        </div>

        {!wfDone && wf.slaDeadline && (
          <p style={{ margin: '14px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
            {locale === 'ar' ? 'الموعد النهائي لاتفاقية مستوى الخدمة: ' : 'SLA deadline: '}<strong>{fmtDate(wf.slaDeadline)}</strong>
          </p>
        )}
      </div>
    </div>
  )
}

function StepRow({
  step,
  state,
  isLast,
  locale,
}: {
  step: WorkflowStatusDetail['steps'][number]
  state: 'done' | 'current' | 'upcoming' | 'rejected'
  isLast: boolean
  locale: Locale
}) {
  const iconSize = 28

  const iconBg =
    state === 'done'     ? 'var(--status-step-done)'
    : state === 'current'  ? 'var(--accent)'
    : state === 'rejected' ? 'var(--status-step-rejected)'
    : 'var(--border)'

  const iconContent =
    state === 'done'     ? <CheckIcon />
    : state === 'current'  ? <span style={{ fontSize: 'var(--text-caption)', color: '#fff', fontWeight: 700 }}>{step.stepOrder}</span>
    : state === 'rejected' ? <CrossIcon />
    : <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 600 }}>{step.stepOrder}</span>

  const labelColor =
    state === 'done'     ? 'var(--ink-1)'
    : state === 'current'  ? 'var(--accent-700)'
    : state === 'rejected' ? 'var(--status-rejected-fg)'
    : 'var(--ink-3)'

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
      {/* Icon + connector line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: iconSize }}>
        <div
          style={{
            width: iconSize, height: iconSize,
            borderRadius: '50%',
            background: iconBg,
            border: state === 'upcoming' ? '2px solid var(--border)' : 'none',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}
        >
          {iconContent}
        </div>
        {!isLast && (
          <div
            style={{
              width: 2, flex: 1, minHeight: 16,
              background: state === 'done' ? 'var(--status-step-done)' : 'var(--border)',
              margin: '4px 0',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: isLast ? 0 : 20, flexGrow: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: labelColor }}>
            {step.stepName}
          </span>
          {step.assigneeName && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              {step.assigneeName}
            </span>
          )}
        </div>

        {state === 'current' && (
          <div style={{ marginTop: 4, fontSize: 'var(--text-body)', color: 'var(--brand-active)' }}>
            {locale === 'ar'
              ? <span dir="rtl">⏳ بانتظار الموافقة</span>
              : <>⏳ Awaiting decision</>}
          </div>
        )}

        {state === 'done' && step.decidedAt && (
          <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--status-approved-fg)', fontWeight: 600 }}>{locale === 'ar' ? '✓ تمت الموافقة' : '✓ Approved'}</span>
            {' · '}
            {fmtDate(step.decidedAt)}
          </div>
        )}

        {state === 'done' && !step.decidedAt && (
          <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--status-approved-fg)' }}>{locale === 'ar' ? '✓ تمت الموافقة' : '✓ Approved'}</div>
        )}

        {state === 'rejected' && (
          <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)' }}>
            <strong>{locale === 'ar' ? '✗ مرفوض' : '✗ Rejected'}</strong>
            {step.decidedAt && <span> · {fmtDate(step.decidedAt)}</span>}
          </div>
        )}

        {state === 'upcoming' && (
          <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'لم يبدأ بعد' : 'Not started yet'}</div>
        )}
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="col-span-2 text-ink-1">{children}</div>
    </div>
  )
}
