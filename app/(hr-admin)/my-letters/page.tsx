import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { persons, personContacts, userAccounts, employeeLetters, letterTemplateTypes } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { LETTER_TYPE_LABELS } from '@/lib/documents/get-employee-documents'
import { RequestLetterForm } from '@/app/(employee)/me/letters/RequestLetterForm'
import { FileText } from 'lucide-react'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'My Letters' }

// Localized overrides for the status pill labels (keys match STATUS_META).
const STATUS_LABEL_AR: Record<string, string> = {
  SUBMITTED:         'تم التقديم',
  DRAFT:             'قيد المعالجة',
  PENDING_APPROVAL:  'بانتظار الموافقة',
  APPROVED:          'جاهز',
  SIGNED:            'موقّع',
  SENT:              'مُرسل',
  REJECTED:          'مرفوض',
  PENDING_SIGNATURE: 'بانتظار التوقيع',
  CANCELLED:         'ملغى',
  FAILED:            'فشل',
}

const STATUS_DESC_AR: Record<string, string> = {
  SUBMITTED:         'قيد التجهيز — لا يلزم أي إجراء',
  DRAFT:             'قيد التجهيز',
  PENDING_APPROVAL:  'بانتظار موافقة الموارد البشرية',
  PENDING_SIGNATURE: 'بانتظار توقيعك',
  APPROVED:          'جاهز للتنزيل',
  REJECTED:          'تواصل مع الموارد البشرية للتفاصيل',
}

const STATUS_META: Record<string, { bg: string; fg: string; label: string }> = {
  SUBMITTED:         { bg: '#EFF6FF',        fg: '#1D4ED8', label: 'Submitted'          },
  DRAFT:             { bg: 'var(--surface)', fg: 'var(--ink-3)', label: 'Processing'    },
  PENDING_APPROVAL:  { bg: '#FEF3C7',        fg: '#D97706', label: 'Pending Approval'   },
  APPROVED:          { bg: '#DCFCE7',        fg: '#16A34A', label: 'Ready'              },
  SIGNED:            { bg: '#DBEAFE',        fg: '#2563EB', label: 'Signed'             },
  SENT:              { bg: '#DCFCE7',        fg: '#16A34A', label: 'Sent'               },
  REJECTED:          { bg: '#FEE2E2',        fg: '#DC2626', label: 'Rejected'           },
  PENDING_SIGNATURE: { bg: '#FEF3C7',        fg: '#D97706', label: 'Awaiting Signature' },
  CANCELLED:         { bg: 'var(--surface)', fg: 'var(--ink-3)', label: 'Cancelled'     },
  FAILED:            { bg: '#FEE2E2',        fg: '#DC2626', label: 'Failed'             },
}

const STATUS_DESC: Record<string, string> = {
  SUBMITTED:         'Being prepared — no action needed',
  DRAFT:             'Being prepared',
  PENDING_APPROVAL:  'Awaiting HR approval',
  PENDING_SIGNATURE: 'Awaiting your signature',
  APPROVED:          'Ready to download',
  REJECTED:          'Contact HR for details',
}

function friendlyFailure(reason: string | null | undefined, locale: string = 'en'): string {
  const ar = locale === 'ar'
  if (!reason) return ar ? 'فشل التوليد — يرجى التواصل مع الموارد البشرية لإعادة الإصدار.' : 'Generation failed — please contact HR to reissue.'
  const r = reason.toLowerCase()
  if (r.includes('storage') || r.includes('not configured') || r.includes('blob') || r.includes('bucket'))
    return ar ? 'لم يتم تهيئة تخزين المستندات بعد. تم إبلاغ الموارد البشرية / تقنية المعلومات — يرجى المحاولة مرة أخرى قريباً.' : 'Document storage is not configured yet. HR/IT has been notified — please try again shortly.'
  if (r.includes('body not resolved') || r.includes('template') || r.includes('token'))
    return ar ? 'قالب الخطاب غير مكتمل لسجلك. يرجى التواصل مع الموارد البشرية.' : 'The letter template is incomplete for your record. Please contact HR.'
  if (r.includes('image') || r.includes('logo') || r.includes('signature') || r.includes('render'))
    return ar ? 'تعذّر تنسيق الخطاب (مشكلة في الشعار أو التوقيع). يرجى التواصل مع الموارد البشرية لإعادة الإصدار.' : 'The letter could not be formatted (logo or signature issue). Please contact HR to reissue.'
  if (r.includes('work_email') || r.includes('email') || r.includes('contact'))
    return ar ? 'البريد الإلكتروني للعمل مفقود من ملفك الشخصي. يرجى التواصل مع الموارد البشرية لإضافته ثم إعادة الطلب.' : 'Your work email is missing from your profile. Please contact HR to add it, then re-request.'
  return ar ? `تعذّر التوليد: ${reason.slice(0, 140)}` : `Could not generate: ${reason.slice(0, 140)}`
}

const TH: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 600,
  color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

/**
 * My Letters page for MANAGER role — renders identical content to the ESS
 * /me/letters page but within the hr-admin shell (AdminSidebar stays visible).
 */
export default async function MyLettersPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale((session.user as { personId?: string }).personId)

  // Three-layer personId resolution
  let resolvedPersonId: string | null = (session.user as { personId?: string }).personId ?? null

  if (!resolvedPersonId && session.user.email) {
    const [c] = await db
      .select({ personId: personContacts.personId })
      .from(personContacts)
      .where(and(eq(personContacts.contactType, 'WORK_EMAIL'), eq(personContacts.contactValue, session.user.email)))
      .limit(1)
      .catch(() => [] as Array<{ personId: string }>)
    resolvedPersonId = c?.personId ?? null
  }

  if (!resolvedPersonId && session.user.email) {
    const [u] = await db
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(eq(userAccounts.primaryEmail, session.user.email.toLowerCase()))
      .limit(1)
      .catch(() => [] as Array<{ personId: string | null }>)
    resolvedPersonId = u?.personId ?? null
  }

  const [person] = resolvedPersonId
    ? await db.select().from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, resolvedPersonId)))
        .limit(1).catch(() => [])
    : []

  const letterRows = person
    ? await db
        .select({
          id: employeeLetters.id, typeCode: employeeLetters.typeCode,
          letterNumber: employeeLetters.letterNumber, status: employeeLetters.status,
          pdfUrl: employeeLetters.pdfUrl, signedPdfUrl: employeeLetters.signedPdfUrl,
          hasPdfData: sql<boolean>`${employeeLetters.pdfData} IS NOT NULL`,
          failureReason: employeeLetters.failureReason, generatedAt: employeeLetters.generatedAt,
          requestedAt: employeeLetters.requestedAt, createdDate: employeeLetters.createdDate,
          typeNameEn: letterTemplateTypes.nameEn,
        })
        .from(employeeLetters)
        .leftJoin(letterTemplateTypes, eq(letterTemplateTypes.typeCode, employeeLetters.typeCode))
        .where(and(eq(employeeLetters.tenantId, TENANT_ID), eq(employeeLetters.personId, person.id)))
        .orderBy(desc(employeeLetters.createdDate))
    : []

  const selfServiceTypes = await db
    .select({ typeCode: letterTemplateTypes.typeCode, nameEn: letterTemplateTypes.nameEn, nameAr: letterTemplateTypes.nameAr, requiresApproval: letterTemplateTypes.requiresApproval })
    .from(letterTemplateTypes)
    .where(and(eq(letterTemplateTypes.allowEssSelfRequest, true), eq(letterTemplateTypes.isActive, true)))
    .orderBy(letterTemplateTypes.nameEn)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <FileText size={18} style={{ color: 'var(--brand-active)' }} />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
          {locale === 'ar' ? 'خطاباتي' : 'My Letters'}
        </h1>
        {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">خطاباتي</span>}
      </div>

      {person && selfServiceTypes.length > 0 && (
        <div style={{ marginBottom: 28, padding: '18px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'طلب خطاب' : 'Request a Letter'}</h2>
          <RequestLetterForm types={selfServiceTypes} personId={person.id} />
        </div>
      )}

      {!person && (
        <div style={{ marginBottom: 28, padding: '14px 18px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 'var(--text-body)', color: '#92400E' }}>
          {locale === 'ar'
            ? 'تعذّر العثور على سجل الموظف الخاص بك. يرجى التواصل مع الموارد البشرية للتأكد من ربط حسابك بملفك الوظيفي قبل طلب الخطابات.'
            : 'Your employee record could not be found. Please contact HR to ensure your account is linked to your employee profile before requesting letters.'}
        </div>
      )}

      <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'سجل الخطابات' : 'Letter History'}</h2>

      {letterRows.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14, padding: '32px 20px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
          {locale === 'ar'
            ? 'لا توجد خطابات مسجّلة بعد. استخدم قسم «طلب خطاب» أعلاه لتقديم طلبك الأول.'
            : 'No letters on record yet. Use the “Request a Letter” section above to submit your first request.'}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <th style={TH}>{locale === 'ar' ? 'المرجع' : 'Reference'}</th>
                  <th style={TH}>{locale === 'ar' ? 'الخطاب' : 'Letter'}</th>
                  <th style={TH}>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th style={TH}>{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th style={{ ...TH, textAlign: 'right' }}>{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {letterRows.map((l, idx) => {
                  const meta        = STATUS_META[l.status] ?? STATUS_META.DRAFT
                  const statusLabel = locale === 'ar' ? (STATUS_LABEL_AR[l.status] ?? meta.label) : meta.label
                  const statusDesc  = l.status === 'FAILED'
                    ? friendlyFailure(l.failureReason, locale)
                    : (locale === 'ar' ? STATUS_DESC_AR[l.status] : STATUS_DESC[l.status])
                  const friendlyType = l.typeNameEn ?? LETTER_TYPE_LABELS[l.typeCode] ?? l.typeCode
                  const title        = `${friendlyType} — ${l.letterNumber}`
                  const hasPdf       = !!(l.signedPdfUrl || l.pdfUrl || l.hasPdfData)
                  const displayDate  = l.requestedAt ?? l.generatedAt ?? l.createdDate
                  return (
                    <tr key={l.id} style={{ borderBottom: idx < letterRows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{l.letterNumber}</td>
                      <td style={{ ...TD, color: 'var(--ink-1)', fontWeight: 500, wordBreak: 'break-word' }}>{title}</td>
                      <td style={{ ...TD, color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>
                        {displayDate ? new Date(displayDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={TD}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 'var(--text-caption)', fontWeight: 600, background: meta.bg, color: meta.fg, whiteSpace: 'nowrap' }}>
                          {statusLabel}
                        </span>
                        {statusDesc && (
                          <div style={{ fontSize: 'var(--text-caption)', color: (l.status === 'REJECTED' || l.status === 'FAILED') ? '#DC2626' : 'var(--ink-3)', marginTop: 2 }}>
                            {statusDesc}
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        {l.status === 'PENDING_SIGNATURE' ? (
                          <a href={`/me/letters/sign/${l.id}`} style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: '#fff', background: 'var(--accent)', border: '1px solid var(--accent-200)', borderRadius: 6, padding: '3px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }} aria-label={`${locale === 'ar' ? 'توقيع' : 'Sign'} ${l.letterNumber}`}>
                            {locale === 'ar' ? 'وقّع الآن' : 'Sign Now'}
                          </a>
                        ) : hasPdf ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <a href={`/api/employee-letters/download-my?id=${l.id}&mode=view`} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--brand-active)', background: 'var(--accent-050)', border: '1px solid var(--accent-200)', borderRadius: 6, padding: '3px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }} aria-label={`${locale === 'ar' ? 'عرض' : 'View'} ${l.letterNumber} PDF`}>{locale === 'ar' ? 'عرض' : 'View'}</a>
                            <a href={`/api/employee-letters/download-my?id=${l.id}`} download style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', textDecoration: 'none', whiteSpace: 'nowrap' }} aria-label={`${locale === 'ar' ? 'تنزيل' : 'Download'} ${l.letterNumber}`}>{locale === 'ar' ? 'تنزيل' : 'Download'}</a>
                          </div>
                        ) : (
                          <span style={{ fontSize: 'var(--text-caption)', color: l.status === 'FAILED' ? '#DC2626' : 'var(--ink-4)' }}>
                            {l.status === 'FAILED'
                              ? (locale === 'ar' ? 'تواصل مع الموارد البشرية' : 'Contact HR')
                              : l.status === 'PENDING_APPROVAL'
                                ? (locale === 'ar' ? 'بانتظار الموافقة' : 'Pending approval')
                                : (l.status === 'SUBMITTED' || l.status === 'DRAFT')
                                  ? (locale === 'ar' ? 'قيد التجهيز…' : 'Being prepared…')
                                  : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 'var(--text-caption)', color: 'var(--ink-4)', background: 'var(--surface)' }}>
            {locale === 'ar'
              ? 'تُقدَّم الخطابات الموقّعة بشكل آمن عبر بوابة الموظف. «عرض» يفتح ملف PDF في متصفحك؛ «تنزيل» يحفظه على جهازك.'
              : 'Signed letters are served securely via the employee portal. View opens the PDF in your browser; Download saves it to your device.'}
          </div>
        </div>
      )}
    </div>
  )
}
