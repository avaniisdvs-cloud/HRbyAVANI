import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect }  from 'next/navigation'
import Link          from 'next/link'
import { auth }      from '@/lib/auth'
import { db }        from '@/lib/db'
import { and, eq, desc } from 'drizzle-orm'
import { payrollRuns }   from '@/drizzle/schema'
import { TENANT_ID }     from '@/lib/constants'
import {
  getPayrollResultRows,
  getEosbLiabilityReport,
  getVarianceReport,
  getGpssaTotalForRun,
  getDewsTotalForRun,
  getSalaryDistribution,
} from '@/modules/payroll/queries'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Payroll Reports' }

function fmtMoney(n: number | null | undefined) {
  return formatCompanyMoney(Number(n ?? 0), DEFAULT_CURRENCY_CONFIG)
}

function fmtDate(d: unknown): string {
  if (!d) return '—'
  return new Date(String(d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function PayrollReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string; tab?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)
  const sp = searchParams ? await searchParams : {} as { runId?: string; tab?: string }
  const entityId = session.user.legalEntityId
  const activeTab = sp.tab ?? 'summary'

  // Fetch recent runs for selector
  const runs = await db
    .select({
      id:             payrollRuns.id,
      runNumber:      payrollRuns.runNumber,
      payPeriodStart: payrollRuns.payPeriodStart,
      payPeriodEnd:   payrollRuns.payPeriodEnd,
      paymentDate:    payrollRuns.paymentDate,
      status:         payrollRuns.status,
      totalGrossPay:  payrollRuns.totalGrossPay,
      totalNetPay:    payrollRuns.totalNetPay,
      totalDeductions: payrollRuns.totalDeductions,
      totalEmployerCost: payrollRuns.totalEmployerCost,
      totalEosbProvision: payrollRuns.totalEosbProvision,
      totalGpssaEmployer: payrollRuns.totalGpssaEmployer,
      employeeCount:  payrollRuns.employeeCount,
    })
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.tenantId, TENANT_ID),
      eq(payrollRuns.legalEntityId, entityId),
    ))
    .orderBy(desc(payrollRuns.paymentDate))
    .limit(12)

  const selectedRunId = sp.runId ?? runs[0]?.id
  const selectedRun   = runs.find(r => r.id === selectedRunId)

  // Load data for selected run
  const [results, eosbRows, variances, distribution, gpssaTotal, dewsTotal] = await Promise.all([
    selectedRunId ? getPayrollResultRows(selectedRunId) : Promise.resolve([]),
    getEosbLiabilityReport(entityId),
    selectedRunId ? getVarianceReport(selectedRunId) : Promise.resolve([]),
    selectedRunId ? getSalaryDistribution(selectedRunId) : Promise.resolve([]),
    selectedRunId ? getGpssaTotalForRun(selectedRunId) : Promise.resolve(0),
    selectedRunId ? getDewsTotalForRun(selectedRunId) : Promise.resolve(0),
  ])

  const tabs = [
    { key: 'summary',      label: locale === 'ar' ? 'ملخص' : 'Summary' },
    { key: 'distribution', label: locale === 'ar' ? 'توزيع الرواتب' : 'Salary Distribution' },
    { key: 'eosb',         label: locale === 'ar' ? 'التزام نهاية الخدمة' : 'EOSB Liability' },
    { key: 'variance',     label: locale === 'ar' ? 'التباين' : 'Variance' },
    { key: 'deductions',   label: locale === 'ar' ? 'الاستقطاعات' : 'Deductions' },
    { key: 'gpssa',        label: 'GPSSA / DEWS' },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-[var(--ink-3)]">
            <Link href="/payroll" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الرواتب' : 'Payroll'}</Link>
            {' / '}{locale === 'ar' ? 'التقارير' : 'Reports'}
          </nav>
          <PageTitle className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {locale === 'ar' ? 'تقارير الرواتب' : 'Payroll Reports'}
          </PageTitle>
        </div>
      </div>

      {/* Run selector */}
      <div className="flex flex-wrap gap-2">
        {runs.slice(0, 8).map(run => (
          <Link key={run.id}
            href={`/payroll/reports?runId=${run.id}&tab=${activeTab}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              run.id === selectedRunId
                ? 'border-[var(--accent)] bg-[var(--accent-050)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] hover:border-[var(--accent-200)]'
            }`}>
            {run.runNumber}
          </Link>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-[var(--border)]">
        {tabs.map(tab => (
          <Link key={tab.key}
            href={`/payroll/reports?${selectedRunId ? `runId=${selectedRunId}&` : ''}tab=${tab.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--ink-2)] hover:text-[var(--ink-1)]'
            }`}>
            {tab.label}
          </Link>
        ))}
      </div>

      {/* ── SUMMARY ── */}
      {activeTab === 'summary' && selectedRun && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: locale === 'ar' ? 'إجمالي الراتب' : 'Gross Pay',    value: fmtMoney(Number(selectedRun.totalGrossPay)) },
              { label: locale === 'ar' ? 'الاستقطاعات' : 'Deductions',   value: fmtMoney(Number(selectedRun.totalDeductions)) },
              { label: locale === 'ar' ? 'صافي الراتب' : 'Net Pay',      value: fmtMoney(Number(selectedRun.totalNetPay)) },
              { label: locale === 'ar' ? 'تكلفة صاحب العمل' : 'Employer Cost', value: fmtMoney(Number(selectedRun.totalEmployerCost)) },
              { label: locale === 'ar' ? 'مخصص نهاية الخدمة' : 'EOSB Prov.',   value: fmtMoney(Number(selectedRun.totalEosbProvision)) },
              { label: locale === 'ar' ? 'GPSSA (صاحب العمل)' : 'GPSSA (ER)',   value: fmtMoney(Number(selectedRun.totalGpssaEmployer)) },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <p className="text-xs text-[var(--ink-3)]">{item.label}</p>
                <p className="mt-1 font-mono font-semibold text-[var(--ink-1)]">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'الفترة' : 'Period'}</p>
            <p className="font-medium text-[var(--ink-1)]">
              {fmtDate(selectedRun.payPeriodStart)} – {fmtDate(selectedRun.payPeriodEnd)} ·
              {selectedRun.employeeCount ?? 0} {locale === 'ar' ? 'موظفون' : 'employees'} · {locale === 'ar' ? 'الحالة' : 'Status'}: {selectedRun.status}
            </p>
          </div>
        </div>
      )}

      {/* ── SALARY DISTRIBUTION ── */}
      {activeTab === 'distribution' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'توزيع صافي الراتب' : 'Net Pay Distribution'}</SectionTitle>
          </div>
          {distribution.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--ink-3)]">{locale === 'ar' ? 'لا توجد بيانات للدورة المحددة.' : 'No data for selected run.'}</p>
          ) : (
            <div className="space-y-3 p-4">
              {distribution.map(band => {
                const maxCount = Math.max(...distribution.map(b => b.count), 1)
                const pct = Math.round((band.count / maxCount) * 100)
                return (
                  <div key={band.label} className="flex items-center gap-3">
                    <span className="w-32 text-right text-xs text-[var(--ink-3)]">{band.label}</span>
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-5 rounded-md bg-[var(--accent-100)] overflow-hidden flex-1">
                        <div
                          className="h-full rounded-md bg-[var(--accent)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-xs font-mono text-[var(--ink-2)]">{band.count}</span>
                    </div>
                    <span className="w-32 text-right text-xs font-mono text-[var(--ink-1)]">
                      {fmtMoney(band.totalNetPay)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── EOSB LIABILITY ── */}
      {activeTab === 'eosb' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'التزام نهاية الخدمة' : 'EOSB Liability'} ({eosbRows.length})</SectionTitle>
            <span className="text-sm font-mono font-semibold text-[var(--accent)]">
              {locale === 'ar' ? 'الإجمالي' : 'Total'}: {fmtMoney(eosbRows.reduce((s, r) => s + r.eosbFinalAmount, 0))}
            </span>
          </div>
          {eosbRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--ink-3)]">{locale === 'ar' ? 'لم يُعثر على حسابات نهاية خدمة لهذا اليوم.' : 'No EOSB calculations found for today.'}</p>
          ) : (
            <TableScrollRegion><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'تاريخ التعيين' : 'Hire Date'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'سنوات الخدمة' : 'Service Yrs'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'التزام نهاية الخدمة' : 'EOSB Liability'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {eosbRows.map(r => (
                  <tr key={r.personId} className="hover:bg-[var(--surface)]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[var(--ink-1)]">{r.fullNameEn}</p>
                      {r.employeeNumber && <p className="text-xs font-mono text-[var(--ink-3)]">{r.employeeNumber}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{fmtDate(r.hireDate)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-1)]">{r.serviceYears.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-1)]">{fmtMoney(r.basicSalary)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--accent)]">
                      {fmtMoney(r.eosbFinalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></TableScrollRegion>
          )}
        </div>
      )}

      {/* ── VARIANCE REPORT ── */}
      {activeTab === 'variance' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">
              {locale === 'ar' ? 'تنبيهات التباين' : 'Variance Alerts'} — BR-PAY-001 {locale === 'ar' ? '(تغيّر ≥20٪ شهرياً)' : '(≥20% month-on-month change)'}
            </SectionTitle>
          </div>
          {variances.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--ink-3)]">{locale === 'ar' ? 'لا توجد تنبيهات تباين لهذه الدورة.' : 'No variance alerts for this run.'}</p>
          ) : (
            <TableScrollRegion><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'صافي الراتب السابق' : 'Prior Net Pay'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'صافي الراتب الحالي' : 'Current Net Pay'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'التباين' : 'Variance'}</th>
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'السبب' : 'Reason'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {variances.map(r => (
                  <tr key={r.personId} className="hover:bg-[var(--surface)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--ink-1)]">{r.fullNameEn}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-2)]">{fmtMoney(r.priorNetPay)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-1)]">{fmtMoney(r.currentNetPay)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${r.variancePct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.variancePct > 0 ? '+' : ''}{(r.variancePct * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--ink-3)]">{r.varianceReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></TableScrollRegion>
          )}
        </div>
      )}

      {/* ── DEDUCTIONS ── */}
      {activeTab === 'deductions' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'تفصيل الاستقطاعات' : 'Deductions Breakdown'}</SectionTitle>
          </div>
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--ink-3)]">{locale === 'ar' ? 'لا توجد نتائج رواتب لهذه الدورة.' : 'No payroll results for this run.'}</p>
          ) : (
            <TableScrollRegion><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'GPSSA (الموظف)' : 'GPSSA (EE)'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'التأمين الطبي' : 'Med. Insurance'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'أخرى' : 'Other'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'إجمالي الاستقطاعات' : 'Total Deductions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {results.map(r => (
                  <tr key={r.id} className="hover:bg-[var(--surface)]">
                    <td className="px-4 py-2.5 font-medium text-[var(--ink-1)]">{r.fullNameEn}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-2)]">{fmtMoney(r.gpssaEmployerContrib)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-2)]">—</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-2)]">—</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-600">{fmtMoney(r.totalDeductions)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[var(--border)] bg-[var(--surface)]">
                <tr>
                  <td className="px-4 py-3 font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'الإجمالي' : 'Total'}</td>
                  <td colSpan={3} />
                  <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                    {fmtMoney(results.reduce((s, r) => s + r.totalDeductions, 0))}
                  </td>
                </tr>
              </tfoot>
            </table></TableScrollRegion>
          )}
        </div>
      )}

      {/* ── GPSSA / DEWS ── */}
      {activeTab === 'gpssa' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'إجمالي GPSSA (الدورة الحالية)' : 'GPSSA Total (Current Run)'}</p>
              <p className="mt-1 text-xl font-mono font-bold text-[var(--ink-1)]">{fmtMoney(gpssaTotal)}</p>
              <p className="mt-1 text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'صاحب العمل 15٪ + الموظف 5٪ من الراتب الأساسي — BR-GPSSA-001' : 'Employer 15% + Employee 5% of basic salary — BR-GPSSA-001'}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'إجمالي DEWS (الدورة الحالية)' : 'DEWS Total (Current Run)'}</p>
              <p className="mt-1 text-xl font-mono font-bold text-[var(--ink-1)]">{fmtMoney(dewsTotal)}</p>
              <p className="mt-1 text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'نظام مركز دبي المالي العالمي للادخار — BR-DIFC-003' : 'DIFC Workplace Savings Scheme — BR-DIFC-003'}</p>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--ink-3)]">
            <p><strong>GPSSA (BR-GPSSA-001)</strong>: UAE Nationals in private sector. Employer = 15%, Employee = 5% of basic salary. Due by 15th of each month.</p>
            <p className="mt-1"><strong>DEWS (BR-DIFC-003)</strong>: DIFC entities only. Under 5 years service = 5.83%, 5+ years = 8.33% of basic salary. Managed by Zurich International Life.</p>
            <p className="mt-1"><strong>VSS</strong>: Mainland entities electing Cabinet Resolution 96/2023 alternative scheme. Rate set by entity admin.</p>
          </div>
        </div>
      )}
    </div>
  )
}
