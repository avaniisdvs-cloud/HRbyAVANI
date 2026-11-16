import { PageTitle } from '@/components/ui/typography'
import { redirect }  from 'next/navigation'
import Link          from 'next/link'
import { auth }      from '@/lib/auth'
import { db }        from '@/lib/db'
import { and, eq, desc, asc } from 'drizzle-orm'
import { salaryElements, persons } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Salary Elements · AVANIIS' }

function fmtMoney(n: unknown) {
  return formatCompanyMoney(Number(n ?? 0), DEFAULT_CURRENCY_CONFIG)
}

function fmtDate(d: unknown): string {
  if (!d) return '—'
  return new Date(String(d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function classificationBadge(c: string) {
  const map: Record<string, string> = {
    EARNINGS:         'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    DEDUCTION:        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    EMPLOYER_COST:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    EMPLOYER_LIABILITY: 'bg-purple-100 text-purple-800',
    INFO:             'bg-[var(--status-draft-bg)] text-[var(--status-draft-fg)]',
  }
  return map[c] ?? 'bg-[var(--surface)] text-[var(--ink-2)]'
}

export default async function SalaryElementsPage({
  searchParams,
}: {
  searchParams: Promise<{ personId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)

  const sp = searchParams ? await searchParams : {} as { personId?: string }
  const filterPersonId = sp.personId

  // Fetch elements with person names
  const rows = await db
    .select({
      id:                    salaryElements.id,
      personId:              salaryElements.personId,
      fullNameEn:            persons.fullNameEn,
      personNumber:          persons.personNumber,
      elementCode:           salaryElements.elementCode,
      elementNameEn:         salaryElements.elementNameEn,
      elementNameAr:         salaryElements.elementNameAr,
      elementClassification: salaryElements.elementClassification,
      amount:                salaryElements.amount,
      currency:              salaryElements.currency,
      isRecurring:           salaryElements.isRecurring,
      isSubjectToEosb:       salaryElements.isSubjectToEosb,
      isWpsReportable:       salaryElements.isWpsReportable,
      effectiveStartDate:    salaryElements.effectiveStartDate,
      effectiveEndDate:      salaryElements.effectiveEndDate,
    })
    .from(salaryElements)
    .leftJoin(persons, eq(salaryElements.personId, persons.id))
    .where(and(
      eq(salaryElements.tenantId, TENANT_ID),
      filterPersonId ? eq(salaryElements.personId, filterPersonId) : undefined,
    ))
    .orderBy(asc(persons.fullNameEn), asc(salaryElements.elementCode))
    .limit(200)

  // Group by classification for summary
  const summaries = ['EARNINGS', 'DEDUCTION', 'EMPLOYER_COST'].map(cls => ({
    label: cls.replace('_', ' '),
    count: rows.filter(r => r.elementClassification === cls).length,
  }))

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-[var(--ink-3)]">
            <Link href="/payroll" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الرواتب' : 'Payroll'}</Link>
            {' / '}{locale === 'ar' ? 'عناصر الراتب' : 'Salary Elements'}
          </nav>
          <PageTitle className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {locale === 'ar' ? 'عناصر الراتب' : 'Salary Elements'}
          </PageTitle>
          <p className="text-sm text-[var(--ink-3)]">
            {locale === 'ar' ? 'الإيرادات والاستقطاعات وتكاليف صاحب العمل المؤرخة فعلياً لكل موظف' : 'Effective-dated earnings, deductions, and employer costs per employee'}
          </p>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {summaries.map(s => (
          <span key={s.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-2)]">
            <span className="font-mono text-[var(--ink-1)]">{s.count}</span> {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-2)]">
          <span className="font-mono text-[var(--ink-1)]">{rows.length}</span> {locale === 'ar' ? 'الإجمالي' : 'Total'}
        </span>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <p className="text-[var(--ink-3)]">{locale === 'ar' ? 'لم يتم العثور على عناصر راتب.' : 'No salary elements found.'}</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">{locale === 'ar' ? 'تُنشأ عناصر الراتب لكل موظف عبر تبويب الموظف ← الأجور.' : 'Salary elements are created per employee via the Person → Compensation tab.'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الرمز' : 'Code'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'ar' ? 'اسم العنصر' : 'Element Name'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'ar' ? 'التصنيف' : 'Classification'}</th>
                  <th className="px-4 py-3 text-right">{locale === 'ar' ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-4 py-3 text-center">{locale === 'ar' ? 'متكرر' : 'Recurring'}</th>
                  <th className="px-4 py-3 text-center">EOSB</th>
                  <th className="px-4 py-3 text-center">WPS</th>
                  <th className="px-4 py-3 text-left">{locale === 'ar' ? 'ساري من' : 'Effective From'}</th>
                  <th className="px-4 py-3 text-left">{locale === 'ar' ? 'ساري إلى' : 'Effective To'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-[var(--surface)] transition-colors ${r.effectiveEndDate ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/persons/${r.personId}`}
                        className="font-medium text-[var(--accent)] hover:underline">{r.fullNameEn ?? '—'}</Link>
                      {r.personNumber && (
                        <p className="text-xs font-mono text-[var(--ink-3)]">{r.personNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[var(--ink-1)]">{r.elementCode}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-[var(--ink-1)]">{r.elementNameEn}</p>
                      {r.elementNameAr && <p className="text-xs text-[var(--ink-3)]" dir="rtl">{r.elementNameAr}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${classificationBadge(r.elementClassification)}`}>
                        {r.elementClassification.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-1)]">
                      {r.amount ? fmtMoney(r.amount) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      {r.isRecurring ? '✓' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      {r.isSubjectToEosb ? '✓' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      {r.isWpsReportable ? '✓' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{fmtDate(r.effectiveStartDate)}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{fmtDate(r.effectiveEndDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Business rules reference */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--ink-3)]">
        <p className="font-medium text-[var(--ink-2)] mb-1">{locale === 'ar' ? 'قواعد تصنيف العناصر' : 'Element Classification Rules'}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div><strong>EARNINGS</strong> — {locale === 'ar' ? 'الراتب الأساسي والبدلات والمكافآت (تزيد إجمالي الأجر)' : 'Basic salary, allowances, bonuses (increases gross pay)'}</div>
          <div><strong>DEDUCTION</strong> — {locale === 'ar' ? 'التأمينات الاجتماعية والسلف وحصة الموظف من التأمين (تقلل صافي الأجر)' : 'GPSSA, advances, insurance EE share (reduces net pay)'}</div>
          <div><strong>EMPLOYER_COST</strong> — {locale === 'ar' ? 'حصة صاحب العمل من التأمينات الاجتماعية ومخصص نهاية الخدمة وحصة صاحب العمل من التأمين' : 'GPSSA ER, EOSB provision, insurance ER share'}</div>
          <div><strong>EOSB ✓</strong> — {locale === 'ar' ? 'العناصر المؤهلة لنهاية الخدمة فقط تُحتسب في مكافأة نهاية الخدمة (BR-EOSB-006)' : 'Only elements marked EOSB-eligible count for gratuity (BR-EOSB-006)'}</div>
        </div>
      </div>
    </div>
  )
}
