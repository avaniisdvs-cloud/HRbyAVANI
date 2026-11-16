import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect }    from 'next/navigation'
import Link            from 'next/link'
import { auth }        from '@/lib/auth'
import { getPayrollRuns } from '@/modules/payroll/queries'
import { PAYROLL_RUN_STATUS_LABELS } from '@/modules/payroll/types'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'
import { resolveLocale } from '@/lib/language-preference'
import type { PayrollRunStatus } from '@/modules/payroll/types'

export const metadata = { title: 'Payroll Runs · AVANIIS' }

function statusPillClass(status: PayrollRunStatus): string {
  const map: Record<string, string> = {
    DRAFT:            'bg-[var(--status-draft-bg)]    text-[var(--status-draft-fg)]',
    CALCULATED:       'bg-[var(--status-pending-bg)]  text-[var(--status-pending-fg)]',
    UNDER_REVIEW:     'bg-[var(--status-pending-bg)]  text-[var(--status-pending-fg)]',
    LOCKED:           'bg-[var(--status-pending-bg)]  text-[var(--status-pending-fg)]',
    APPROVAL_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    APPROVED:         'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    SIF_GENERATED:    'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    SUBMITTED_TO_BANK: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    CONFIRMED:        'bg-[var(--status-taken-bg)]    text-[var(--status-taken-fg)]',
    ARCHIVED:         'bg-[var(--status-draft-bg)]    text-[var(--status-draft-fg)]',
  }
  return map[status] ?? 'bg-[var(--surface)] text-[var(--ink-2)]'
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n: number | null): string {
  return n !== null ? formatCompanyMoney(n, DEFAULT_CURRENCY_CONFIG) : '—'
}

export default async function PayrollRunsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)

  const runs = await getPayrollRuns({
    legalEntityId: session.user.legalEntityId,
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-xs text-[var(--ink-3)]">
            <Link href="/payroll" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الرواتب' : 'Payroll'}</Link>
            {' / '}{locale === 'ar' ? 'الدورات' : 'Runs'}
          </nav>
          <PageTitle className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {locale === 'ar' ? 'دورات الرواتب' : 'Payroll Runs'}
          </PageTitle>
        </div>
        <Link
          href="/payroll/runs/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-700)] transition-colors"
        >
          {locale === 'ar' ? '+ دورة جديدة' : '+ New Run'}
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-16 text-center">
          <p className="text-[var(--ink-3)]">{locale === 'ar' ? 'لم يتم العثور على دورات رواتب.' : 'No payroll runs found.'}</p>
          <Link href="/payroll/runs/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
            {locale === 'ar' ? 'إنشاء أول دورة' : 'Create First Run'}
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <TableScrollRegion><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'رقم الدورة' : 'Run #'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الفترة' : 'Period'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'تاريخ الدفع' : 'Payment Date'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الموعد النهائي لـ WPS' : 'WPS Deadline'}</th>
                <th className="px-4 py-3 text-right">{locale === 'ar' ? 'الموظفون' : 'Employees'}</th>
                <th className="px-4 py-3 text-right">{locale === 'ar' ? 'إجمالي الأجر' : 'Gross Pay'}</th>
                <th className="px-4 py-3 text-right">{locale === 'ar' ? 'صافي الأجر' : 'Net Pay'}</th>
                <th className="px-4 py-3 text-left">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {runs.map(run => (
                <tr key={run.id} className="hover:bg-[var(--surface)] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--ink-1)]">{run.runNumber}</td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">{run.runType.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">
                    {fmtDate(run.payPeriodStart)} – {fmtDate(run.payPeriodEnd)}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">{fmtDate(run.paymentDate)}</td>
                  <td className={`px-4 py-3 ${
                    run.wpsDeadline && new Date(run.wpsDeadline) < new Date()
                      ? 'text-red-600 font-semibold'
                      : 'text-[var(--ink-2)]'
                  }`}>
                    {run.wpsDeadline ? fmtDate(run.wpsDeadline) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--ink-1)]">{run.employeeCount ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--ink-1)]">{fmtMoney(run.totalGrossPay)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--ink-1)]">{fmtMoney(run.totalNetPay)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusPillClass(run.status)}`}>
                      {PAYROLL_RUN_STATUS_LABELS[run.status] ?? run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/payroll/runs/${run.id}`}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                      {locale === 'ar' ? 'فتح →' : 'Open →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}
    </div>
  )
}
