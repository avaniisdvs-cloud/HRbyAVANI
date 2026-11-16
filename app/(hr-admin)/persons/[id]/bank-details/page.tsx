import { PageTitle } from '@/components/ui/typography'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons } from '@/drizzle/schema'
import { getBankDetails } from '@/modules/core-hr'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { Badge } from '@/components/ui/badge'
import { BankDetailsForm } from './BankDetailsForm'

export const metadata = { title: 'Bank details' }

/**
 * S4-05 — Bank-details page (Server Component shell).
 *
 * IBAN ciphertext lives in person_bank_details (Hard Rule 4). The
 * `getBankDetails` Server Action returns either the masked IBAN
 * ('AE••••••1234') or the full plaintext for HR_DIRECTOR / PAYROLL_ADMIN
 * / SUPER_ADMIN — the response carries `ibanMasked` so the UI can show
 * a "PII unmasked" badge without re-implementing the role gate here.
 */
export default async function BankDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)

  const { id } = await params

  // Read access matches getBankDetails. Write access is enforced server-side
  // (createBankDetails — HR_ADMIN, PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN).
  const allowedReaders = ['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'EMPLOYEE']
  if (!allowedReaders.includes(session.user.role)) redirect(`/persons/${id}`)

  const [person] = await db
    .select({
      id: persons.id, personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr,
      legalEntityId: persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
    .limit(1)
  if (!person) notFound()
  if (
    session.user.role !== 'SUPER_ADMIN'
    && session.user.legalEntityId !== person.legalEntityId
    && session.user.personId !== person.id
  ) redirect(`/persons/${id}`)

  const bank = await getBankDetails(person.id)

  const canWrite = ['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)

  return (
    <div className="page-in">
      <div className="mb-6">
        <Link href={`/persons/${person.id}`} className="text-sm text-ink-3 hover:text-accent">{locale === 'ar' ? '→ العودة إلى الملف الشخصي' : '← Back to profile'}</Link>
        <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{locale === 'ar' ? 'التفاصيل المصرفية' : 'Bank details'}</PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          {person.personNumber} · {person.fullNameEn ?? '—'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'السجل النشط' : 'Active record'}
              <Badge className="ms-2 align-middle" variant={bank ? 'secondary' : 'outline'}>
                {bank ? (bank.isWpsAccount ? 'WPS' : 'NON-WPS') : (locale === 'ar' ? 'لا يوجد' : 'none')}
              </Badge>
              {bank?.ibanMasked && (
                <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? 'IBAN مُخفى' : 'IBAN masked'}</Badge>
              )}
              {bank && !bank.ibanMasked && (
                <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? 'IBAN ظاهر · مُسجَّل في التدقيق' : 'IBAN visible · audit logged'}</Badge>
              )}
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {bank ? (
              <dl className="space-y-3 text-sm">
                <Row k={locale === 'ar' ? 'البنك' : 'Bank'}         v={bank.bankName ?? '—'} />
                <Row k={locale === 'ar' ? 'رمز البنك' : 'Bank code'}    v={bank.bankCode ?? '—'} />
                <Row k={locale === 'ar' ? 'اسم الحساب' : 'Account name'} v={bank.accountName ?? '—'} />
                <Row k="IBAN"         v={bank.iban ?? '—'} mono />
              </dl>
            ) : (
              <p className="text-sm text-ink-3">
                {locale === 'ar'
                  ? 'لا يوجد سجل مصرفي أساسي. أضف واحداً أدناه — يصبح الصف الجديد أساسياً ويُغلق أي صف أساسي قائم اعتباراً من اليوم السابق.'
                  : 'No primary bank record. Add one below — the new row becomes primary and any existing primary is closed effective the day before.'}
              </p>
            )}
            <p className="mt-3 text-xs text-ink-3">
              {locale === 'ar'
                ? 'القاعدة الصارمة 3: استبدال السجل يُغلق ويُعيد الفتح (مؤرّخ بالسريان). النص المشفّر لـ IBAN هو الوحيد الذي يُخزَّن؛ ولا يغادر النص الصريح إطار التشفير أبداً.'
                : 'Hard Rule 3: replacing a record closes-and-reopens (effective-dated). IBAN ciphertext is the only thing persisted; plaintext never leaves the encryption stack frame.'}
            </p>
          </div>
        </div>

        {canWrite ? (
          <BankDetailsForm personId={person.id} />
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'إضافة سجل جديد' : 'Add new record'}</h3></div>
            <div style={{ padding: '16px 20px' }}>
              <p className="text-sm text-ink-3">
                {locale === 'ar'
                  ? 'يحق فقط لمسؤول الموارد البشرية أو مسؤول الرواتب أو مدير الموارد البشرية أو المسؤول الأعلى كتابة التفاصيل المصرفية. دورك يملك صلاحية القراءة فقط.'
                  : 'Only HR Admin, Payroll Admin, HR Director, or Super Admin may write bank details. Your role has read access only.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className={`text-ink-1 ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  )
}
