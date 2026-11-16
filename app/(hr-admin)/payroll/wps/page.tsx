import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { redirect }  from 'next/navigation'
import Link          from 'next/link'
import { auth }      from '@/lib/auth'
import { db }        from '@/lib/db'
import { and, eq, desc } from 'drizzle-orm'
import { payrollRuns }   from '@/drizzle/schema'
import { TENANT_ID }     from '@/lib/constants'
import { getWpsStagingRows } from '@/modules/payroll/queries'
import { validateWpsRecords } from '@/modules/payroll/calculation-engine'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'WPS Staging · AVANIIS' }

function fmtMoney(n: number) {
  return formatCompanyMoney(n, DEFAULT_CURRENCY_CONFIG)
}

function sifStatusBadge(s: string) {
  const map: Record<string, string> = {
    INCLUDED: 'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    EXCLUDED: 'bg-red-100 text-red-800',
    ON_HOLD:  'bg-yellow-100 text-yellow-800',
    FAILED:   'bg-red-100 text-red-800',
    PAID:     'bg-[var(--status-taken-bg)] text-[var(--status-taken-fg)]',
  }
  return map[s] ?? 'bg-[var(--surface)] text-[var(--ink-2)]'
}

export default async function WpsStagingPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)

  const sp = searchParams ? await searchParams : {} as { runId?: string }
  const entityId = session.user.legalEntityId

  // Find SIF-generated runs
  const sifRuns = await db
    .select({
      id:              payrollRuns.id,
      runNumber:       payrollRuns.runNumber,
      payPeriodStart:  payrollRuns.payPeriodStart,
      payPeriodEnd:    payrollRuns.payPeriodEnd,
      status:          payrollRuns.status,
      sifFileReference: payrollRuns.sifFileReference,
      sifGeneratedAt:  payrollRuns.sifGeneratedAt,
      wpsDeadline:     payrollRuns.wpsDeadline,
      totalNetPay:     payrollRuns.totalNetPay,
    })
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.tenantId, TENANT_ID),
      eq(payrollRuns.legalEntityId, entityId),
    ))
    .orderBy(desc(payrollRuns.paymentDate))
    .limit(20)

  const selectedRunId = sp.runId ?? sifRuns.find(r =>
    ['SIF_GENERATED', 'SUBMITTED_TO_BANK', 'APPROVED'].includes(r.status),
  )?.id

  const stagingRows = selectedRunId ? await getWpsStagingRows(selectedRunId) : []

  // Validate WPS records
  const validation = validateWpsRecords(stagingRows.map(r => ({
    personId:           r.personId,
    fullNameEn:         r.fullNameEn,
    iban:               r.iban,
    routingCode:        r.routingCode,
    netPayAed:          r.netPayAed,
    employerLabourCode: r.employerLabourCode,
    employeeLabourCard: r.employeeLabourCard,
  })))

  const selectedRun = sifRuns.find(r => r.id === selectedRunId)
  const totalNetPay  = stagingRows.filter(r => r.sifStatus === 'INCLUDED').reduce((s, r) => s + r.netPayAed, 0)
  const includedCount = stagingRows.filter(r => r.sifStatus === 'INCLUDED').length
  const excludedCount = stagingRows.filter(r => r.sifStatus === 'EXCLUDED').length
  const onHoldCount   = stagingRows.filter(r => r.sifStatus === 'ON_HOLD').length

  return (
    <div className="space-y-6 p-6">
      <div>
        <nav className="text-xs text-[var(--ink-3)]">
          <Link href="/payroll" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الرواتب' : 'Payroll'}</Link>
          {' / '}{locale === 'ar' ? 'تجهيز WPS' : 'WPS Staging'}
        </nav>
        <PageTitle className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
          {locale === 'ar' ? 'تجهيز WPS' : 'WPS Staging'}
        </PageTitle>
        <p className="text-sm text-[var(--ink-3)]">
          {locale === 'ar' ? 'معاينة والتحقق من ملف SIF لنظام حماية الأجور (وزارة الموارد البشرية) — BR-WPS-001' : 'Wage Protection System (MoHRE) SIF file preview and validation — BR-WPS-001'}
        </p>
      </div>

      {/* Run selector */}
      <div className="flex flex-wrap gap-2">
        {sifRuns.slice(0, 6).map(run => (
          <Link key={run.id}
            href={`/payroll/wps?runId=${run.id}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              run.id === selectedRunId
                ? 'border-[var(--accent)] bg-[var(--accent-050)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] hover:border-[var(--accent-200)]'
            }`}>
            {run.runNumber}
          </Link>
        ))}
      </div>

      {selectedRun && (
        <>
          {/* Run info + summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'مرجع SIF' : 'SIF Reference'}</p>
              <p className="mt-0.5 font-mono text-xs font-semibold text-[var(--ink-1)]">
                {selectedRun.sifFileReference ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'مُدرَج / الإجمالي' : 'Included / Total'}</p>
              <p className="mt-0.5 font-semibold text-[var(--ink-1)]">
                {includedCount} / {stagingRows.length}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'إجمالي صافي الأجر (WPS)' : 'Total Net Pay (WPS)'}</p>
              <p className="mt-0.5 font-mono font-semibold text-[var(--accent)]">{fmtMoney(totalNetPay)}</p>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${validation.isValid ? 'border-[var(--border)] bg-[var(--card)]' : 'border-red-200 bg-red-50'}`}>
              <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'التحقق' : 'Validation'}</p>
              <p className={`mt-0.5 font-semibold ${validation.isValid ? 'text-[var(--status-approved-fg)]' : 'text-red-600'}`}>
                {validation.isValid ? (locale === 'ar' ? '✓ جاهز' : '✓ Ready') : (locale === 'ar' ? `${validation.errors.length} أخطاء` : `${validation.errors.length} errors`)}
              </p>
            </div>
          </div>

          {/* Validation errors */}
          {!validation.isValid && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
              <h3 className="mb-2 text-sm font-semibold text-red-800">{locale === 'ar' ? 'أخطاء التحقق من WPS (BR-WPS-001)' : 'WPS Validation Errors (BR-WPS-001)'}</h3>
              <ul className="space-y-1 text-xs text-red-700">
                {validation.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>• <strong>{e.personId}</strong>: {e.field} — {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Excluded / on-hold */}
          {(excludedCount > 0 || onHoldCount > 0) && (
            <div className="flex gap-3">
              {excludedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                  {excludedCount} {locale === 'ar' ? 'مستبعد' : 'Excluded'}
                </span>
              )}
              {onHoldCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                  {onHoldCount} {locale === 'ar' ? 'معلّق' : 'On Hold'}
                </span>
              )}
            </div>
          )}

          {/* SIF Records Table */}
          {stagingRows.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'سجلات SIF' : 'SIF Records'} ({stagingRows.length})</SectionTitle>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                      <th className="px-4 py-2 text-left">{locale === 'ar' ? 'بطاقة العمل' : 'Labour Card'}</th>
                      <th className="px-4 py-2 text-left">IBAN</th>
                      <th className="px-4 py-2 text-left">{locale === 'ar' ? 'رمز البنك' : 'Bank Code'}</th>
                      <th className="px-4 py-2 text-right">{locale === 'ar' ? 'صافي الأجر (درهم)' : 'Net Pay (AED)'}</th>
                      <th className="px-4 py-2 text-center">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                      <th className="px-4 py-2 text-left">{locale === 'ar' ? 'سبب الاستبعاد' : 'Exclusion Reason'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {stagingRows.map((r, i) => (
                      <tr key={r.id}
                        className={`hover:bg-[var(--surface)] transition-colors ${
                          r.sifStatus === 'EXCLUDED' || r.sifStatus === 'ON_HOLD' ? 'opacity-60' : ''
                        }`}>
                        <td className="px-4 py-2.5 text-xs font-mono text-[var(--ink-3)]">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-[var(--ink-1)]">{r.fullNameEn}</p>
                          {r.employeeNumber && <p className="text-xs font-mono text-[var(--ink-3)]">{r.employeeNumber}</p>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--ink-2)]">
                          {r.employeeLabourCard ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--ink-1)]">
                          {r.iban ? `${r.iban.slice(0, 4)}...${r.iban.slice(-4)}` : (locale === 'ar' ? '⚠ مفقود' : '⚠ Missing')}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[var(--ink-2)]">{r.routingCode}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--ink-1)]">
                          {fmtMoney(r.netPayAed)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.sifStatus === 'INCLUDED' ? 'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]' :
                            r.sifStatus === 'PAID'     ? 'bg-[var(--status-taken-bg)] text-[var(--status-taken-fg)]' :
                            r.sifStatus === 'ON_HOLD'  ? 'bg-yellow-100 text-yellow-800' :
                                                         'bg-red-100 text-red-800'
                          }`}>
                            {r.sifStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--ink-3)]">
                          {r.exclusionReason ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-[var(--border)] bg-[var(--surface)]">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-[var(--ink-1)]">
                        {locale === 'ar' ? `إجمالي المُدرَج (${includedCount} موظف)` : `Included Total (${includedCount} employees)`}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[var(--accent)]">
                        {fmtMoney(totalNetPay)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!selectedRunId && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <p className="text-[var(--ink-3)]">{locale === 'ar' ? 'لم يتم اختيار دورة رواتب.' : 'No payroll run selected.'}</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">{locale === 'ar' ? 'اختر دورة من الأعلى أو أنشئ ملف SIF من دورة رواتب معتمدة.' : 'Select a run above or generate a SIF from an approved payroll run.'}</p>
          <Link href="/payroll/runs" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--card)]">
            {locale === 'ar' ? 'الانتقال إلى دورات الرواتب →' : 'Go to Payroll Runs →'}
          </Link>
        </div>
      )}
    </div>
  )
}
