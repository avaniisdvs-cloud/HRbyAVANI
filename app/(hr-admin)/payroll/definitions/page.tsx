import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect }         from 'next/navigation'
import Link                  from 'next/link'
import { auth }              from '@/lib/auth'
import { getPayrollDefinitions } from '@/modules/payroll/queries'
import { resolveLocale } from '@/lib/language-preference'
import { tk } from '@/lib/i18n-messages'

export const metadata = { title: 'Payroll Definitions' }

export default async function PayrollDefinitionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)
  const defs = await getPayrollDefinitions(session.user.legalEntityId)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-[var(--ink-3)]">
            <Link href="/payroll" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الرواتب' : 'Payroll'}</Link>
            {' / '}{locale === 'ar' ? 'التعريفات' : 'Definitions'}
          </nav>
          <PageTitle className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {locale === 'ar' ? 'تعريفات الرواتب' : 'Payroll Definitions'}
          </PageTitle>
          <p className="text-sm text-[var(--ink-3)]">{locale === 'ar' ? 'تهيئة رموز الرواتب وتكرارات الدفع ورموز بنوك حماية الأجور والعملة' : 'Configure payroll codes, pay frequencies, WPS bank codes, and currency'}</p>
        </div>
      </div>

      {defs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <p className="text-[var(--ink-3)]">{locale === 'ar' ? 'لم تُهيّأ أي تعريفات رواتب بعد.' : 'No payroll definitions configured yet.'}</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">{locale === 'ar' ? 'اتصل بمسؤول النظام لإعداد تعريفات الرواتب.' : 'Contact your system administrator to set up payroll definitions.'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <TableScrollRegion><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الرمز' : 'Code'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الاسم' : 'Name'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'التكرار' : 'Frequency'}</th>
                <th className="px-4 py-3 text-center">{locale === 'ar' ? 'يوم الدفع' : 'Payment Day'}</th>
                <th className="px-4 py-3 text-center">{locale === 'ar' ? 'العملة' : 'Currency'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'رمز بنك حماية الأجور' : 'WPS Bank Code'}</th>
                <th className="px-4 py-3 text-center">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {defs.map(d => (
                <tr key={d.id} className="hover:bg-[var(--surface)] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--ink-1)]">{d.payrollCode}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink-1)]">{d.payrollNameEn}</p>
                    {d.payrollNameAr && <p className="text-xs text-[var(--ink-3)]" dir="rtl">{d.payrollNameAr}</p>}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">{d.payFrequency.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-center text-[var(--ink-2)]">{d.paymentDayOfMonth}</td>
                  <td className="px-4 py-3 text-center font-mono text-[var(--ink-1)]">{d.currency}</td>
                  <td className="px-4 py-3 font-mono text-[var(--ink-2)]">{d.wpsBankCode ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      d.isActive
                        ? 'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]'
                        : 'bg-[var(--status-draft-bg)] text-[var(--status-draft-fg)]'
                    }`}>
                      {d.isActive ? tk(locale, 'common.active') : tk(locale, 'common.inactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'حول تعريفات الرواتب' : 'About Payroll Definitions'}</h3>
        <ul className="mt-2 space-y-1 text-xs text-[var(--ink-3)]">
          <li>• {locale === 'ar' ? 'يمكن أن يكون لكل جهة قانونية تعريف رواتب واحد أو أكثر (مثال: موظفون شهريون، مقاولون أسبوعيون)' : 'Each legal entity can have one or more payroll definitions (e.g., monthly staff, weekly contractors)'}</li>
          <li>• {locale === 'ar' ? 'رمز بنك حماية الأجور مطلوب لتقديمات نظام حماية الأجور لوزارة الموارد البشرية (BR-WPS-001)' : 'The WPS Bank Code is required for MoHRE Wage Protection System submissions (BR-WPS-001)'}</li>
          <li>• {locale === 'ar' ? 'العملة الافتراضية هي الدرهم؛ قد تستخدم جهات DIFC الدولار الأمريكي لنظام DEWS' : 'Currency defaults to AED; DIFC entities may use USD for DEWS'}</li>
          <li>• {locale === 'ar' ? 'يوم الدفع من الشهر (مثال: 25) يحدد تاريخ الدفع الافتراضي لدورات الرواتب الجديدة' : 'Payment day of month (e.g., 25) sets the default payment date for new payroll runs'}</li>
        </ul>
      </div>
    </div>
  )
}
