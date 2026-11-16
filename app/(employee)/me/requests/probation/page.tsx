import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons } from '@/drizzle/schema'
import { probationReviews } from '@/drizzle/schema/probation'
import { eq, and, inArray } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { addDays } from '@/lib/effective-date'
import { formatDMY } from '@/lib/utils/date-format'
import { resolveLocale } from '@/lib/language-preference'
import { ProbationStatusCard } from './ProbationStatusCard'
import { InitiateReviewButton } from './InitiateReviewButton'

export const metadata = { title: 'My Probation · Self Service' }

const REVIEW_STEPS: Array<{
  key: string
  labelEn: string
  labelAr: string
  currentStatus: string
  completedStatuses: string[]
}> = [
  { key: 'initiated', labelEn: 'Review Initiated',       labelAr: 'تم بدء المراجعة',         currentStatus: '',                       completedStatuses: ['PENDING_LM', 'PENDING_HR', 'PENDING_ACKNOWLEDGMENT', 'COMPLETED'] },
  { key: 'lm',        labelEn: 'Line Manager Review',    labelAr: 'مراجعة المدير المباشر',    currentStatus: 'PENDING_LM',             completedStatuses: ['PENDING_HR', 'PENDING_ACKNOWLEDGMENT', 'COMPLETED'] },
  { key: 'hr',        labelEn: 'HR Approval',            labelAr: 'موافقة الموارد البشرية',   currentStatus: 'PENDING_HR',             completedStatuses: ['PENDING_ACKNOWLEDGMENT', 'COMPLETED'] },
  { key: 'ack',       labelEn: 'Pending Your Signature', labelAr: 'في انتظار توقيعك',         currentStatus: 'PENDING_ACKNOWLEDGMENT', completedStatuses: ['COMPLETED'] },
]


export default async function MyProbationPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const personId = (session.user as { personId?: string }).personId
  if (!personId) {
    return (
      <div style={{ padding: '32px 28px', maxWidth: 700 }}>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          Your sign-in is not linked to a person record. Please contact HR Admin.
        </p>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">
          تسجيل الدخول الخاص بك غير مرتبط بسجل الموظف. يرجى التواصل مع مسؤول الموارد البشرية.
        </p>
      </div>
    )
  }

  const locale = await resolveLocale(personId)

  // ── Load person record ────────────────────────────────────────────────────
  const [[person], [activeReview]] = await Promise.all([
    db
      .select()
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1),
    db
      .select()
      .from(probationReviews)
      .where(and(
        eq(probationReviews.tenantId, TENANT_ID),
        eq(probationReviews.personId, personId),
        inArray(probationReviews.reviewStatus, ['PENDING_LM', 'PENDING_HR', 'PENDING_ACKNOWLEDGMENT']),
      ))
      .limit(1),
  ])

  if (!person) redirect('/me')

  const probationStatus  = person.probationStatus ?? 'ACTIVE'
  const hireDate         = person.hireDate as string
  const probationEndDate = person.probationEndDate as string | null
  const maxExtensionDate = hireDate ? addDays(hireDate, 182) : null

  return (
    <div style={{ padding: '24px 28px', maxWidth: 780, width: '100%', boxSizing: 'border-box' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <PageTitle style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 600,
            fontFamily: 'var(--font-serif)',
            color: 'var(--ink-1)',
            letterSpacing: '-0.4px',
          }}>
            My Probation
          </PageTitle>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">
            فترة التجربة
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          Track your probation period and request a formal review.
          {' '}
          <span dir="rtl" lang="ar" style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>
            تتبع فترة التجربة وطلب مراجعة رسمية
          </span>
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Branch A: ACTIVE + no active review → show card + initiate button */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {probationStatus === 'ACTIVE' && !activeReview && probationEndDate && maxExtensionDate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ProbationStatusCard
            hireDate={hireDate}
            probationEndDate={probationEndDate}
            probationStatus={probationStatus}
            maxExtensionDate={maxExtensionDate}
            locale={locale}
          />

          {/* Initiate CTA */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '22px 24px',
          }}>
            <SectionTitle style={{
              margin: '0 0 6px',
              fontSize: 'var(--text-lead)',
              fontWeight: 600,
              color: 'var(--ink-1)',
              fontFamily: 'var(--font-serif)',
            }}>
              Request a Probation Review
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', fontWeight: 400, marginLeft: 8 }} dir="rtl" lang="ar">
                طلب مراجعة فترة التجربة
              </span>
            </SectionTitle>
            <p style={{ margin: '0 0 18px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
              When you are ready, you can formally request your probation review. Your Line Manager will be asked
              to make a recommendation (Confirm, Extend, or Fail), followed by HR approval.
            </p>
            <InitiateReviewButton personId={personId} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Branch B: Active review in progress → show status timeline        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeReview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {probationEndDate && maxExtensionDate && (
            <ProbationStatusCard
              hireDate={hireDate}
              probationEndDate={probationEndDate}
              probationStatus={probationStatus}
              maxExtensionDate={maxExtensionDate}
              locale={locale}
            />
          )}

          {/* Review in-progress card */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--accent-200)',
            borderRadius: 12,
            padding: '22px 24px',
          }}>
            <SectionTitle style={{
              margin: '0 0 20px',
              fontSize: 'var(--text-lead)',
              fontWeight: 600,
              color: 'var(--ink-1)',
              fontFamily: 'var(--font-serif)',
            }}>
              Review In Progress
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', fontWeight: 400, marginLeft: 8 }} dir="rtl" lang="ar">
                المراجعة جارية
              </span>
            </SectionTitle>

            {/* Step timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {REVIEW_STEPS.map((step, idx) => {
                const isCurrent   = step.currentStatus === activeReview.reviewStatus
                const isCompleted = !isCurrent && step.completedStatuses.includes(activeReview.reviewStatus)
                const dotColor    = isCompleted || isCurrent ? 'var(--accent)' : 'var(--border)'
                const lineColor   = isCompleted ? 'var(--accent)' : 'var(--border)'

                return (
                  <div key={step.key} style={{ display: 'flex', gap: 16 }}>
                    {/* Dot + connector */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: isCompleted ? dotColor : 'var(--card)',
                        border: `2px solid ${dotColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {isCompleted && !isCurrent && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {isCurrent && (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                        )}
                      </div>
                      {idx < REVIEW_STEPS.length - 1 && (
                        <div style={{
                          width: 2,
                          flexGrow: 1,
                          minHeight: 28,
                          background: lineColor,
                          marginTop: 2,
                          marginBottom: 2,
                          borderRadius: 1,
                        }} />
                      )}
                    </div>

                    {/* Label */}
                    <div style={{ paddingBottom: idx < REVIEW_STEPS.length - 1 ? 24 : 0 }}>
                      <div style={{
                        fontSize: 'var(--text-body)',
                        fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? 'var(--ink-1)' : isCompleted ? 'var(--ink-2)' : 'var(--ink-4)',
                      }}>
                        {step.labelEn}
                        {isCurrent && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 'var(--text-caption)',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: 'var(--accent-050)',
                            color: 'var(--brand-active)',
                          }}>
                            Current step
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }} dir="rtl" lang="ar">
                        {step.labelAr}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{
              marginTop: 20,
              padding: '10px 14px',
              background: 'var(--surface)',
              borderRadius: 8,
              fontSize: 'var(--text-body)',
              color: 'var(--ink-2)',
            }}>
              A review is already in progress. You will be notified when action is required from you.
              <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">
                المراجعة جارية بالفعل. ستتلقى إشعاراً عند الحاجة لاتخاذ إجراء.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Branch C: CONFIRMED                                               */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {probationStatus === 'CONFIRMED' && !activeReview && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--accent-200)',
          borderRadius: 12,
          padding: '32px 28px',
          textAlign: 'center',
        }}>
          {/* Checkmark circle */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--accent-050)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="14" fill="var(--accent)" fillOpacity="0.15" />
              <path d="M8 14l4 4 8-8" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <SectionTitle style={{
            margin: '0 0 8px',
            fontSize: 20,
            fontWeight: 600,
            fontFamily: 'var(--font-serif)',
            color: 'var(--ink-1)',
          }}>
            Employment Confirmed
          </SectionTitle>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
            Your employment has been confirmed. Congratulations!
          </p>
          {person.hireDate && (
            <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
              Hired: {formatDMY(hireDate)}
            </p>
          )}
          <p style={{ margin: '10px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">
            تم تأكيد توظيفك. مبروك!
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Branch D: EXTENDED                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {probationStatus === 'EXTENDED' && !activeReview && probationEndDate && maxExtensionDate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ProbationStatusCard
            hireDate={hireDate}
            probationEndDate={probationEndDate}
            probationStatus={probationStatus}
            maxExtensionDate={maxExtensionDate}
            locale={locale}
          />

          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--status-warning-fg)',
            borderRadius: 12,
            padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="var(--status-warning-bg)" />
                <path d="M10 6v4.5" stroke="var(--status-warning-fg)" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="10" cy="14" r="1" fill="var(--status-warning-fg)" />
              </svg>
              <SectionTitle style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--status-warning-fg)' }}>
                Probation Extended
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 400, color: 'var(--status-warning-fg)', marginLeft: 8 }} dir="rtl" lang="ar">
                  تم تمديد فترة التجربة
                </span>
              </SectionTitle>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
              Your probation period has been extended to{' '}
              <strong style={{ color: 'var(--ink-1)' }}>{formatDMY(probationEndDate)}</strong>.
              Use this time to demonstrate your skills and continue growing in your role.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
              You may request a new review at any time before the extended end date.
            </p>
            <div style={{ marginTop: 16 }}>
              <InitiateReviewButton personId={personId} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Branch E: FAILED                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {probationStatus === 'FAILED' && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--status-rejected-dot)',
          borderRadius: 12,
          padding: '28px 24px',
        }}>
          <SectionTitle style={{
            margin: '0 0 12px',
            fontSize: 17,
            fontWeight: 600,
            fontFamily: 'var(--font-serif)',
            color: 'var(--status-rejected-fg)',
          }}>
            Probation Not Passed
            <span style={{ fontSize: 'var(--text-body)', fontWeight: 400, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', marginLeft: 8 }} dir="rtl" lang="ar">
              لم تتجاوز فترة التجربة
            </span>
          </SectionTitle>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
            HR has been notified and will be in touch with you regarding next steps.
            If you have any questions, please contact your HR Business Partner directly.
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">
            تم إخطار الموارد البشرية وستتواصل معك بشأن الخطوات التالية.
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Branch F: No hire date or probation data                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {probationStatus === 'ACTIVE' && !probationEndDate && !activeReview && (
        <div style={{
          background: 'var(--surface)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          padding: '32px 24px',
          textAlign: 'center',
          fontSize: 'var(--text-body)',
          color: 'var(--ink-3)',
        }}>
          Probation end date has not been set on your record. Please contact HR Admin.
          <br />
          <span dir="rtl" lang="ar" style={{ fontSize: 'var(--text-body)' }}>
            لم يتم تحديد تاريخ انتهاء فترة التجربة. يرجى التواصل مع مسؤول الموارد البشرية.
          </span>
        </div>
      )}
    </div>
  )
}
