import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { absenceTypes } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Absence types · AVANIIS HR' }

/**
 * S10-07 — Absence type definitions viewer (Server Component).
 *
 * Read-only list of all absence_types rows. HR_DIRECTOR and SUPER_ADMIN
 * can see statutory flags, pay treatment, eligibility constraints, and
 * document requirements. This table is seed-managed; changes require a
 * migration + legal review.
 */
export default async function AbsenceTypesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const locale = await resolveLocale(session.user.personId)

  const types = await db
    .select({
      id:                     absenceTypes.id,
      typeCode:               absenceTypes.typeCode,
      typeNameEn:             absenceTypes.typeNameEn,
      typeNameAr:             absenceTypes.typeNameAr,
      isStatutory:            absenceTypes.isStatutory,
      isPaid:                 absenceTypes.isPaid,
      requiresMedicalCert:    absenceTypes.requiresMedicalCert,
      certRequiredAfterDays:  absenceTypes.certRequiredAfterDays,
      genderRestriction:      absenceTypes.genderRestriction,
      maxDaysPerYear:         absenceTypes.maxDaysPerYear,
      maxConsecutiveDays:     absenceTypes.maxConsecutiveDays,
      minServiceMonths:       absenceTypes.minServiceMonths,
      minNoticeDays:          absenceTypes.minNoticeDays,
      approvalRequired:       absenceTypes.approvalRequired,
      isOneTimePerEmployment: absenceTypes.isOneTimePerEmployment,
      isActive:               absenceTypes.isActive,
    })
    .from(absenceTypes)
    .where(eq(absenceTypes.tenantId, TENANT_ID))
    .orderBy(asc(absenceTypes.typeCode))

  const paidTone: Record<string, string> = {
    FULL_PAY:  'text-accent',
    HALF_PAY:  'text-accent-700',
    NO_PAY:    'text-destructive',
    TIERED:    'text-ink-2',
  }

  return (
    <div className="page-in">
      <div>
        <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'أنواع الغياب' : 'Absence types'}</PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar'
            ? 'أنواع الإجازات القانونية وغير القانونية في الإمارات. تُدار عبر البيانات الأولية — وتتطلب التغييرات ترحيلاً مُراجَعاً قانونياً.'
            : 'UAE statutory and non-statutory leave types. Seed-managed — changes require a legal-reviewed migration.'}
        </p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <TableScrollRegion><table className="w-full text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase text-ink-3">
              <tr>
                <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الرمز' : 'Code'}</th>
                <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الاسم EN / AR' : 'Name EN / AR'}</th>
                <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الأجر' : 'Pay'}</th>
                <th className="px-5 py-2.5 text-end font-medium">{locale === 'ar' ? 'الحد الأقصى/سنة' : 'Max / yr'}</th>
                <th className="px-5 py-2.5 text-end font-medium">{locale === 'ar' ? 'الإشعار' : 'Notice'}</th>
                <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'القيود' : 'Restrictions'}</th>
                <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'العلامات' : 'Flags'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map(t => (
                <tr key={t.id} className={t.isActive ? '' : 'opacity-40'}>
                  <td className="px-5 py-3 font-mono text-xs font-medium text-ink-1">{t.typeCode}</td>
                  <td className="px-5 py-3">
                    <p className="text-ink-1">{t.typeNameEn}</p>
                    {t.typeNameAr && (
                      <p className="text-xs text-ink-3" dir="rtl" lang="ar">{t.typeNameAr}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium ${paidTone[t.isPaid] ?? 'text-ink-2'}`}>
                      {t.isPaid}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-end font-mono text-xs text-ink-2">
                    {t.maxDaysPerYear ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-end font-mono text-xs text-ink-3">
                    {t.minNoticeDays}d
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.genderRestriction && (
                        <Badge variant="outline" className="text-xs">{t.genderRestriction}</Badge>
                      )}
                      {t.minServiceMonths > 0 && (
                        <Badge variant="outline" className="text-xs">{locale === 'ar' ? `${t.minServiceMonths} شهر خدمة` : `${t.minServiceMonths}mo service`}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.isStatutory            && <Badge variant="secondary" className="text-xs">STATUTORY</Badge>}
                      {t.requiresMedicalCert    && <Badge variant="outline" className="text-xs">CERT REQ</Badge>}
                      {t.approvalRequired       && <Badge variant="outline" className="text-xs">APPROVAL</Badge>}
                      {t.isOneTimePerEmployment && <Badge variant="outline" className="text-xs">ONCE</Badge>}
                      {!t.isActive              && <Badge variant="destructive" className="text-xs">INACTIVE</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
      </div>
    </div>
  )
}
