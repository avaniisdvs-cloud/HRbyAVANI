import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect }    from 'next/navigation'
import Link            from 'next/link'
import { auth }        from '@/lib/auth'
import { db }          from '@/lib/db'
import {
  payrollRuns,
  eosbCalculations,
  legalEntities,
} from '@/drizzle/schema'
import {
  gpssaContributions,
  dewsContributions,
} from '@/drizzle/schema'
import { TENANT_ID }   from '@/lib/constants'
import { and, eq, desc, sum, count, sql } from 'drizzle-orm'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'
import type { PayrollRunStatus } from '@/modules/payroll/types'
import { PAYROLL_RUN_STATUS_LABELS } from '@/modules/payroll/types'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Payroll Dashboard' }

function statusPillClass(status: PayrollRunStatus): string {
  const map: Record<string, string> = {
    DRAFT:             'bg-[var(--status-draft-bg)]   text-[var(--status-draft-fg)]',
    CALCULATED:        'bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]',
    LOCKED:            'bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]',
    APPROVAL_PENDING:  'bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]',
    APPROVED:          'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    SIF_GENERATED:     'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    CONFIRMED:         'bg-[var(--status-taken-bg)]   text-[var(--status-taken-fg)]',
    ARCHIVED:          'bg-[var(--status-draft-bg)]   text-[var(--status-draft-fg)]',
  }
  return map[status] ?? 'bg-[var(--surface)] text-[var(--ink-2)]'
}

function fmtMoney(n: number | null | undefined): string {
  return formatCompanyMoney(Number(n ?? 0), DEFAULT_CURRENCY_CONFIG)
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function PayrollDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)
  const entityId = session.user.legalEntityId

  // GEO-OPT-001: Parallelise payroll dashboard queries — reduces 7 sequential
  // Neon round-trips to 2 parallel batches. Pattern matches the /dashboard
  // Promise.all fix (commit a01dc1b) that cut NFR-01 p95 from 2,987ms → 1,143ms.
  // Batch 1: 5 independent queries fire concurrently.
  // Batch 2: GPSSA + DEWS are conditional on latestRun.id — fire after batch 1.

  const today = new Date().toISOString().slice(0, 10)

  const [
    [latestRun],
    recentRuns,
    [pendingCount],
    [varianceCount],
    [eosbRow],
  ] = await Promise.all([
    // Latest payroll run
    db
      .select({
        id:                 payrollRuns.id,
        runNumber:          payrollRuns.runNumber,
        status:             payrollRuns.status,
        payPeriodStart:     payrollRuns.payPeriodStart,
        payPeriodEnd:       payrollRuns.payPeriodEnd,
        paymentDate:        payrollRuns.paymentDate,
        wpsDeadline:        payrollRuns.wpsDeadline,
        employeeCount:      payrollRuns.employeeCount,
        totalGrossPay:      payrollRuns.totalGrossPay,
        totalNetPay:        payrollRuns.totalNetPay,
        totalEmployerCost:  payrollRuns.totalEmployerCost,
        totalDeductions:    payrollRuns.totalDeductions,
        totalEosbProvision: payrollRuns.totalEosbProvision,
        totalGpssaEmployer: payrollRuns.totalGpssaEmployer,
      })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.tenantId, TENANT_ID), eq(payrollRuns.legalEntityId, entityId)))
      .orderBy(desc(payrollRuns.paymentDate))
      .limit(1),

    // Recent 5 runs
    db
      .select({
        id:             payrollRuns.id,
        runNumber:      payrollRuns.runNumber,
        status:         payrollRuns.status,
        payPeriodStart: payrollRuns.payPeriodStart,
        payPeriodEnd:   payrollRuns.payPeriodEnd,
        paymentDate:    payrollRuns.paymentDate,
        totalNetPay:    payrollRuns.totalNetPay,
        employeeCount:  payrollRuns.employeeCount,
      })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.tenantId, TENANT_ID), eq(payrollRuns.legalEntityId, entityId)))
      .orderBy(desc(payrollRuns.paymentDate))
      .limit(5),

    // Pending payroll approvals
    db
      .select({ n: count() })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, TENANT_ID),
        eq(payrollRuns.legalEntityId, entityId),
        eq(payrollRuns.status, 'APPROVAL_PENDING'),
      )),

    // Variance alerts (runs in active states)
    db
      .select({ n: count() })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, TENANT_ID),
        eq(payrollRuns.legalEntityId, entityId),
        sql`${payrollRuns.status} IN ('CALCULATED','UNDER_REVIEW','LOCKED')`,
      )),

    // EOSB liability total
    db
      .select({ total: sum(eosbCalculations.eosbFinalAmount) })
      .from(eosbCalculations)
      .where(and(
        eq(eosbCalculations.tenantId, TENANT_ID),
        eq(eosbCalculations.legalEntityId, entityId),
        eq(eosbCalculations.calculationType, 'MONTHLY_PROVISION'),
        eq(eosbCalculations.calculationDate, today),
      )),
  ])

  // Batch 2: GPSSA + DEWS are conditional on latestRun.id from batch 1
  const [[gpssaRow], [dewsRow]] = await Promise.all([
    // GPSSA total (current payroll run)
    latestRun?.id
      ? db
          .select({ total: sum(gpssaContributions.totalContribution) })
          .from(gpssaContributions)
          .where(and(
            eq(gpssaContributions.tenantId, TENANT_ID),
            eq(gpssaContributions.payrollRunId, latestRun.id),
          ))
      : Promise.resolve([{ total: null }]),

    // DEWS total (current payroll run)
    latestRun?.id
      ? db
          .select({ total: sum(dewsContributions.contributionAmount) })
          .from(dewsContributions)
          .where(and(
            eq(dewsContributions.tenantId, TENANT_ID),
            eq(dewsContributions.payrollRunId, latestRun.id),
          ))
      : Promise.resolve([{ total: null }]),
  ])

  const kpis = latestRun ? [
    { label: locale === 'ar' ? 'إجمالي الرواتب' : 'Gross Payroll',    value: fmtMoney(Number(latestRun.totalGrossPay)),    icon: '💰', color: 'text-[var(--accent)]' },
    { label: locale === 'ar' ? 'صافي الرواتب' : 'Net Payroll',      value: fmtMoney(Number(latestRun.totalNetPay)),      icon: '✅', color: 'text-[var(--status-approved-fg)]' },
    { label: locale === 'ar' ? 'تكلفة صاحب العمل' : 'Employer Cost',    value: fmtMoney(Number(latestRun.totalEmployerCost)), icon: '🏢', color: 'text-[var(--ink-1)]' },
    { label: locale === 'ar' ? 'إجمالي الاستقطاعات' : 'Total Deductions', value: fmtMoney(Number(latestRun.totalDeductions)), icon: '➖', color: 'text-[var(--status-rejected-fg)]' },
    { label: locale === 'ar' ? 'مخصص نهاية الخدمة' : 'EOSB Provision',   value: fmtMoney(Number(latestRun.totalEosbProvision)), icon: '📋', color: 'text-[var(--ink-2)]' },
    { label: locale === 'ar' ? 'الموظفون' : 'Employees',        value: String(latestRun.employeeCount ?? 0),         icon: '👥', color: 'text-[var(--ink-1)]' },
  ] : []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageTitle className="text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {locale === 'ar' ? 'الرواتب' : 'Payroll'}
          </PageTitle>
          <p className="mt-0.5 text-sm text-[var(--ink-3)]">{locale === 'ar' ? 'إدارة دورات الرواتب وعناصر الراتب ونهاية الخدمة وحماية الأجور' : 'Manage payroll runs, salary elements, EOSB, and WPS'}</p>
        </div>
        <Link
          href="/payroll/runs/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-700)] transition-colors"
        >
          <span>+</span> {locale === 'ar' ? 'دورة رواتب جديدة' : 'New Payroll Run'}
        </Link>
      </div>

      {/* Current Period Banner */}
      {latestRun && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'دورة الرواتب الحالية' : 'Current Payroll Run'}</p>
              <p className="mt-1 text-lg font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {latestRun.runNumber}
              </p>
              <p className="text-sm text-[var(--ink-2)]">
                {fmtDate(String(latestRun.payPeriodStart))} → {fmtDate(String(latestRun.payPeriodEnd))} · {locale === 'ar' ? 'الدفع' : 'Payment'}: {fmtDate(String(latestRun.paymentDate))}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {latestRun.wpsDeadline && (
                <div className="text-right">
                  <p className="text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'الموعد النهائي لحماية الأجور' : 'WPS Deadline'}</p>
                  <p className="font-medium text-[var(--ink-1)]">{fmtDate(String(latestRun.wpsDeadline))}</p>
                </div>
              )}
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusPillClass(latestRun.status as PayrollRunStatus)}`}>
                {PAYROLL_RUN_STATUS_LABELS[latestRun.status as PayrollRunStatus] ?? latestRun.status}
              </span>
              <Link href={`/payroll/runs/${latestRun.id}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-1)] hover:bg-[var(--card)] transition-colors">
                {locale === 'ar' ? 'عرض التفاصيل ←' : 'View Details →'}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map(kpi => (
            <div key={kpi.label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-xs text-[var(--ink-3)]">{kpi.label}</p>
              <p className={`mt-1 text-lg font-semibold ${kpi.color}`} style={{ fontFamily: 'var(--font-mono)' }}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Alert Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AlertCard
          label={locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
          value={String(pendingCount?.n ?? 0)}
          href="/payroll/runs"
          color={Number(pendingCount?.n) > 0 ? 'amber' : 'neutral'}
        />
        <AlertCard
          label={locale === 'ar' ? 'التزام نهاية الخدمة (EOSB)' : 'EOSB Liability'}
          value={fmtMoney(Number(eosbRow?.total ?? 0))}
          href="/payroll/reports"
          color="neutral"
        />
        <AlertCard
          label={locale === 'ar' ? 'GPSSA (الدورة الحالية)' : 'GPSSA (Current Run)'}
          value={fmtMoney(Number(gpssaRow?.total ?? 0))}
          href="/payroll/reports"
          color="neutral"
        />
        <AlertCard
          label={locale === 'ar' ? 'DEWS (الدورة الحالية)' : 'DEWS (Current Run)'}
          value={fmtMoney(Number(dewsRow?.total ?? 0))}
          href="/payroll/reports"
          color="neutral"
        />
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: locale === 'ar' ? 'دورات الرواتب' : 'Payroll Runs',     href: '/payroll/runs',            icon: '📋' },
          { label: locale === 'ar' ? 'عناصر الراتب' : 'Salary Elements',  href: '/payroll/salary-elements', icon: '💷' },
          { label: locale === 'ar' ? 'التعريفات' : 'Definitions',      href: '/payroll/definitions',     icon: '⚙️' },
          { label: locale === 'ar' ? 'تجهيز حماية الأجور' : 'WPS Staging',      href: '/payroll/wps',             icon: '🏦' },
          { label: locale === 'ar' ? 'التقارير' : 'Reports',          href: '/payroll/reports',         icon: '📊' },
        ].map(nav => (
          <Link key={nav.href} href={nav.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-center hover:border-[var(--accent-200)] hover:bg-[var(--surface)] transition-colors">
            <span className="text-2xl">{nav.icon}</span>
            <span className="text-sm font-medium text-[var(--ink-1)]">{nav.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Runs Table */}
      {recentRuns.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'أحدث دورات الرواتب' : 'Recent Payroll Runs'}</SectionTitle>
            <Link href="/payroll/runs" className="text-xs text-[var(--accent)] hover:underline">{locale === 'ar' ? 'عرض الكل ←' : 'View all →'}</Link>
          </div>
          <TableScrollRegion><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2 text-left">{locale === 'ar' ? 'رقم الدورة' : 'Run #'}</th>
                <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الفترة' : 'Period'}</th>
                <th className="px-4 py-2 text-left">{locale === 'ar' ? 'تاريخ الدفع' : 'Payment Date'}</th>
                <th className="px-4 py-2 text-right">{locale === 'ar' ? 'الموظفون' : 'Employees'}</th>
                <th className="px-4 py-2 text-right">{locale === 'ar' ? 'صافي الراتب' : 'Net Pay'}</th>
                <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {recentRuns.map(run => (
                <tr key={run.id} className="hover:bg-[var(--surface)] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--ink-1)]">{run.runNumber}</td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">
                    {fmtDate(String(run.payPeriodStart))} → {fmtDate(String(run.payPeriodEnd))}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">{fmtDate(String(run.paymentDate))}</td>
                  <td className="px-4 py-3 text-right text-[var(--ink-1)]">{run.employeeCount ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--ink-1)]">
                    {run.totalNetPay ? fmtMoney(Number(run.totalNetPay)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusPillClass(run.status as PayrollRunStatus)}`}>
                      {PAYROLL_RUN_STATUS_LABELS[run.status as PayrollRunStatus] ?? run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/payroll/runs/${run.id}`} className="text-xs text-[var(--accent)] hover:underline">{locale === 'ar' ? 'عرض' : 'View'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}

      {/* Empty state */}
      {recentRuns.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <p className="text-[var(--ink-3)]">{locale === 'ar' ? 'لا توجد دورات رواتب بعد.' : 'No payroll runs yet.'}</p>
          <Link href="/payroll/runs/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-700)]">
            {locale === 'ar' ? 'إنشاء أول دورة رواتب' : 'Create First Payroll Run'}
          </Link>
        </div>
      )}
    </div>
  )
}

function AlertCard({
  label, value, href, color,
}: {
  label: string
  value: string
  href: string
  color: 'amber' | 'neutral'
}) {
  return (
    <Link href={href}
      className={`rounded-xl border p-4 transition-colors hover:bg-[var(--surface)] ${
        color === 'amber'
          ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/20'
          : 'border-[var(--border)] bg-[var(--card)]'
      }`}>
      <p className="text-xs text-[var(--ink-3)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {value}
      </p>
    </Link>
  )
}
