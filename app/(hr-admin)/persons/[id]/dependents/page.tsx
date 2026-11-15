import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq, asc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons, personDependents } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { Badge } from '@/components/ui/badge'
import { DependentsManager } from './DependentsManager'

export const metadata = { title: 'Dependents' }

/**
 * S4-05 — Dependents page (Server Component shell).
 *
 * BR-INS-004 — max 9 active dependents per employee. The Add button
 * locks once the cap is reached; the server enforces the same rule.
 *
 * EID + passport ciphertext is loaded but never sent to the client —
 * the table renders only `<masked>` markers when the column is non-null.
 */
export default async function DependentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)

  const { id } = await params

  const allowedRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(`/persons/${id}`)

  const [person] = await db
    .select({
      id: persons.id, personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr,
      legalEntityId: persons.legalEntityId,
      numberOfDependents: persons.numberOfDependents,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
    .limit(1)
  if (!person) notFound()
  if (
    session.user.role !== 'SUPER_ADMIN'
    && session.user.legalEntityId !== person.legalEntityId
  ) redirect(`/persons/${id}`)

  const dependentRows = await db
    .select({
      id:               personDependents.id,
      dependentNumber:  personDependents.dependentNumber,
      relationship:     personDependents.relationship,
      firstNameEn:      personDependents.firstNameEn,
      lastNameEn:       personDependents.lastNameEn,
      fullNameAr:       personDependents.fullNameAr,
      dateOfBirth:      personDependents.dateOfBirth,
      gender:           personDependents.gender,
      nationalityCode:  personDependents.nationalityCode,
      emiratesId:       personDependents.emiratesId,        // ciphertext (boolean visibility only)
      emiratesIdExpiry: personDependents.emiratesIdExpiry,
      passportNumber:   personDependents.passportNumber,    // ciphertext
      passportCountry:  personDependents.passportCountry,
      passportExpiry:   personDependents.passportExpiry,
      effectiveFrom:    personDependents.effectiveFrom,
      approvalStatus:   personDependents.approvalStatus,
    })
    .from(personDependents)
    .where(and(
      eq(personDependents.tenantId, TENANT_ID),
      eq(personDependents.personId, person.id),
    ))
    .orderBy(asc(personDependents.dependentNumber))

  // BR-INS-004 — count active rows; Add button locks at 9.
  const activeCount = dependentRows.length
  const atCap = activeCount >= 9

  return (
    <div className="page-in">
      <div className="mb-6">
        <Link href={`/persons/${person.id}`} className="text-sm text-ink-3 hover:text-accent">{locale === 'ar' ? '← العودة إلى الملف الشخصي' : '← Back to profile'}</Link>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{locale === 'ar' ? 'المعالون' : 'Dependents'}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {person.personNumber} · {person.fullNameEn ?? '—'}
          <span className="mx-2 text-ink-3">·</span>
          <Badge variant={atCap ? 'outline' : 'secondary'}>
            {activeCount}/9 — BR-INS-004
          </Badge>
        </p>
      </div>

      <div className="space-y-6">
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'المعالون الحاليون' : 'Existing dependents'}
              <Badge className="ms-2 align-middle" variant="outline">{activeCount}</Badge>
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {dependentRows.length === 0 ? (
              <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا يوجد معالون مسجلون.' : 'No dependents on file.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-start text-xs uppercase text-ink-3">
                    <tr>
                      <th className="pb-2 pe-3 font-medium">#</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'صلة القرابة' : 'Relationship'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الاسم (EN)' : 'Name (EN)'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الاسم (AR)' : 'Name (AR)'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'تاريخ الميلاد' : 'DOB'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الجنسية' : 'Nationality'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'انتهاء الجواز' : 'Passport expiry'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الهوية' : 'EID'}</th>
                      <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dependentRows.map(d => (
                      <tr key={d.id}>
                        <td className="py-2 pe-3 font-mono text-xs text-ink-3">{d.dependentNumber}</td>
                        <td className="py-2 pe-3 text-ink-2">{d.relationship}</td>
                        <td className="py-2 pe-3 text-ink-1">{d.firstNameEn} {d.lastNameEn}</td>
                        <td className="py-2 pe-3 text-ink-2" dir="rtl">{d.fullNameAr}</td>
                        <td className="py-2 pe-3 font-mono text-xs text-ink-3">{d.dateOfBirth}</td>
                        <td className="py-2 pe-3 font-mono text-xs text-ink-2">{d.nationalityCode}</td>
                        <td className="py-2 pe-3 font-mono text-xs text-ink-3">{d.passportExpiry ?? '—'}</td>
                        <td className="py-2 pe-3 text-xs">
                          {d.emiratesId
                            ? <Badge variant="outline">{locale === 'ar' ? 'مسجّلة · مُخفاة' : 'on file · masked'}</Badge>
                            : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="py-2 pe-3">
                          <Badge variant={d.approvalStatus === 'APPROVED' ? 'secondary' : 'outline'}>
                            {d.approvalStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-ink-3">
              {locale === 'ar'
                ? 'القاعدة الصارمة 4: تُشفّر أرقام الهوية الإماراتية وجوازات السفر قبل الإدراج. تشير شارة "مسجّلة · مُخفاة" إلى وجود نص مشفّر؛ ولا يُرسَل النص الكامل إلى المتصفح أبداً. تتحول حالة الموافقة إلى APPROVED عبر مسار تسجيل التأمين (خارج نطاق S4).'
                : 'Hard Rule 4: Emirates ID and passport numbers are encrypted before INSERT. The “on file · masked” badge shows that ciphertext exists; full plaintext is never streamed to the browser. Approval status flips to APPROVED via the insurance enrolment flow (out of S4 scope).'}
            </p>
          </div>
        </div>

        <DependentsManager personId={person.id} atCap={atCap} />
      </div>
    </div>
  )
}
