import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link          from 'next/link'
import { auth }      from '@/lib/auth'
import { getLocale }  from '@/lib/locale-server'
import { getPayslipsForEmployee, getEosbEstimateForPerson, getPayslipForEmployee } from '@/modules/payroll/queries'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'

export const metadata = { title: 'My Payslips' }

function fmtMoney(n: number) {
  return formatCompanyMoney(n, DEFAULT_CURRENCY_CONFIG)
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function MyPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!session.user.personId) redirect('/me')

  const locale = await getLocale()

  const sp = searchParams ? await searchParams : {} as { runId?: string }
  const personId    = session.user.personId
  const entityId    = session.user.legalEntityId

  const [payslips, eosbEstimate] = await Promise.all([
    getPayslipsForEmployee(personId),
    getEosbEstimateForPerson(personId, entityId),
  ])

  const selectedRunId = sp.runId ?? payslips[0]?.runId
  const payslip = selectedRunId
    ? await getPayslipForEmployee(selectedRunId, personId)
    : null

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }} className="space-y-6">
      {/* Header */}
      <div>
        <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'كشوف رواتبي' : 'My Payslips'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          {locale === 'ar' ? 'بيانات الراتب الشهرية وملخص استحقاق مكافأة نهاية الخدمة' : 'Monthly salary statements and EOSB accrual summary'}
        </p>
      </div>

      {/* EOSB Estimate Card */}
      {eosbEstimate && eosbEstimate.applies && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'تقدير مكافأة نهاية الخدمة' : 'End of Service Benefit Estimate'}</p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'سنوات الخدمة' : 'Service Years'}</p>
              <p className="mt-0.5 font-mono font-semibold text-[var(--ink-1)]">{eosbEstimate.serviceYears.toFixed(1)} {locale === 'ar' ? 'سنة' : 'yrs'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</p>
              <p className="mt-0.5 font-mono font-semibold text-[var(--ink-1)]">{fmtMoney(eosbEstimate.basicSalary)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'تقدير المكافأة' : 'EOSB Estimate'}</p>
              <p className="mt-0.5 font-mono font-bold text-[var(--accent)]">{fmtMoney(eosbEstimate.eosbFinalAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'النظام' : 'Scheme'}</p>
              <p className="mt-0.5 font-medium text-[var(--ink-1)]">{eosbEstimate.scheme}</p>
            </div>
          </div>
          {eosbEstimate.isCapped && (
            <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
              {locale === 'ar' ? '⚠ محدّد بحد أقصى 24 شهراً من الراتب الأساسي (BR-EOSB-004)' : '⚠ Capped at 24 months basic salary (BR-EOSB-004)'}
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--ink-4)]">
            {locale === 'ar' ? 'كما في' : 'As of'} {fmtDate(eosbEstimate.asOfDate)} · {locale === 'ar' ? 'القواعد' : 'Rules'}: {eosbEstimate.ruleRefs.join(', ')}
          </p>
        </div>
      )}

      {payslips.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <p className="text-[var(--ink-3)]">{locale === 'ar' ? 'لا توجد كشوف رواتب متاحة بعد.' : 'No payslips available yet.'}</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">{locale === 'ar' ? 'تظهر كشوف الرواتب هنا بمجرد اعتماد راتبك.' : 'Payslips appear here once your payroll has been confirmed.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Payslip list */}
          <div className="space-y-2 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'السجل' : 'History'}</p>
            {payslips.map(p => (
              <Link key={p.runId}
                href={`/me/payslips?runId=${p.runId}`}
                className={`block rounded-lg border px-3 py-2 transition-colors ${
                  p.runId === selectedRunId
                    ? 'border-[var(--accent)] bg-[var(--accent-050)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent-200)]'
                }`}>
                <p className={`text-xs font-semibold ${p.runId === selectedRunId ? 'text-[var(--accent)]' : 'text-[var(--ink-1)]'}`}>
                  {fmtDate(p.payPeriodStart)} – {fmtDate(p.payPeriodEnd)}
                </p>
                <p className="mt-0.5 font-mono text-sm font-bold text-[var(--ink-1)]">
                  {fmtMoney(p.netPay)}
                </p>
              </Link>
            ))}
          </div>

          {/* Payslip detail */}
          <div className="sm:col-span-2">
            {payslip ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
                {/* Payslip header */}
                <div className="border-b border-[var(--border)] px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'كشف الراتب' : 'Payslip'}</p>
                      <p className="font-semibold text-[var(--ink-1)]">{payslip.legalEntityNameEn}</p>
                      <p className="text-sm text-[var(--ink-2)]">{payslip.fullNameEn}</p>
                      {payslip.jobTitleEn && <p className="text-xs text-[var(--ink-3)]">{payslip.jobTitleEn}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'فترة الراتب' : 'Pay Period'}</p>
                      <p className="text-sm font-medium text-[var(--ink-1)]">
                        {fmtDate(payslip.payPeriodStart)} – {fmtDate(payslip.payPeriodEnd)}
                      </p>
                      <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'الدفع' : 'Payment'}: {fmtDate(payslip.paymentDate)}</p>
                    </div>
                  </div>
                </div>

                {/* Earnings */}
                <div className="px-5 py-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'الإيرادات' : 'Earnings'}</p>
                  <div className="space-y-1.5">
                    {payslip.lines.filter(l => l.classification === 'EARNINGS').map(l => (
                      <div key={l.elementCode} className="flex justify-between text-sm">
                        <span className="text-[var(--ink-2)]">{l.elementNameEn}</span>
                        <span className="font-mono text-[var(--ink-1)]">{fmtMoney(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-sm font-semibold">
                      <span className="text-[var(--ink-1)]">{locale === 'ar' ? 'إجمالي الراتب' : 'Gross Pay'}</span>
                      <span className="font-mono text-[var(--ink-1)]">{fmtMoney(payslip.totalGrossPay)}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                {payslip.lines.some(l => l.classification === 'DEDUCTION') && (
                  <div className="border-t border-[var(--border)] px-5 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'الاستقطاعات' : 'Deductions'}</p>
                    <div className="space-y-1.5">
                      {payslip.lines.filter(l => l.classification === 'DEDUCTION').map(l => (
                        <div key={l.elementCode} className="flex justify-between text-sm">
                          <span className="text-[var(--ink-2)]">{l.elementNameEn}</span>
                          <span className="font-mono text-red-600">({fmtMoney(l.amount)})</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-sm font-semibold">
                        <span className="text-[var(--ink-1)]">{locale === 'ar' ? 'إجمالي الاستقطاعات' : 'Total Deductions'}</span>
                        <span className="font-mono text-red-600">({fmtMoney(payslip.totalDeductions)})</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Net Pay */}
                <div className="border-t-2 border-[var(--border)] bg-[var(--surface)] px-5 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-[var(--ink-1)]">{locale === 'ar' ? 'صافي الراتب' : 'Net Pay'}</span>
                    <span className="font-mono text-xl font-bold text-[var(--accent)]">
                      {payslip.currency} {payslip.netPay.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* YTD */}
                <div className="border-t border-[var(--border)] px-5 py-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'منذ بداية العام' : 'Year-to-Date'}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'إجمالي منذ بداية العام' : 'YTD Gross'}</p>
                      <p className="font-mono font-medium text-[var(--ink-1)]">{fmtMoney(payslip.ytdGrossPay)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'صافي منذ بداية العام' : 'YTD Net'}</p>
                      <p className="font-mono font-medium text-[var(--ink-1)]">{fmtMoney(payslip.ytdNetPay)}</p>
                    </div>
                  </div>
                </div>

                {/* Footer note */}
                <div className="border-t border-[var(--border)] px-5 py-3">
                  <p className="text-xs text-[var(--ink-4)]">
                    {locale === 'ar' ? 'كشف الراتب' : 'Payslip'} {payslip.runNumber} · {locale === 'ar' ? 'الموظف' : 'Employee'} #{payslip.employeeNumber ?? '—'} · {payslip.departmentEn ?? ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink-3)]">
                {locale === 'ar' ? 'اختر كشف راتب من القائمة' : 'Select a payslip from the list'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
