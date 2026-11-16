import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { redirect }  from 'next/navigation'
import Link          from 'next/link'
import { auth }      from '@/lib/auth'
import { getPayrollRunById, getPayrollResultRows, getVarianceReport } from '@/modules/payroll/queries'
import { PAYROLL_RUN_STATUS_LABELS } from '@/modules/payroll/types'
import { formatCompanyMoney, DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'
import type { PayrollRunStatus } from '@/modules/payroll/types'
import { PayrollRunActions } from './_components/PayrollRunActions'
import { resolveLocale } from '@/lib/language-preference'

export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }) {
  return { title: `Payroll Run · AVANIIS` }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(String(d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n: unknown): string {
  return formatCompanyMoney(Number(n ?? 0), DEFAULT_CURRENCY_CONFIG)
}

function statusPillClass(status: PayrollRunStatus): string {
  const map: Record<string, string> = {
    DRAFT:            'bg-[var(--status-draft-bg)]    text-[var(--status-draft-fg)]',
    CALCULATED:       'bg-[var(--status-pending-bg)]  text-[var(--status-pending-fg)]',
    UNDER_REVIEW:     'bg-[var(--status-pending-bg)]  text-[var(--status-pending-fg)]',
    LOCKED:           'bg-blue-100 text-blue-800',
    APPROVAL_PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED:         'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    SIF_GENERATED:    'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]',
    SUBMITTED_TO_BANK: 'bg-purple-100 text-purple-800',
    CONFIRMED:        'bg-[var(--status-taken-bg)]    text-[var(--status-taken-fg)]',
    ARCHIVED:         'bg-[var(--status-draft-bg)]    text-[var(--status-draft-fg)]',
  }
  return map[status] ?? 'bg-[var(--surface)] text-[var(--ink-2)]'
}

// Payroll run lifecycle steps for progress indicator
const LIFECYCLE_STEPS: PayrollRunStatus[] = [
  'DRAFT', 'CALCULATED', 'LOCKED', 'APPROVAL_PENDING', 'APPROVED', 'SIF_GENERATED', 'CONFIRMED',
]

function LifecycleStep({ step, current }: { step: PayrollRunStatus; current: PayrollRunStatus }) {
  const steps  = LIFECYCLE_STEPS
  const curIdx = steps.indexOf(current)
  const stepIdx = steps.indexOf(step)
  const done    = stepIdx < curIdx
  const active  = stepIdx === curIdx

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors
        ${done   ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : ''}
        ${active ? 'border-[var(--accent)] bg-[var(--accent-050)] text-[var(--accent)]' : ''}
        ${!done && !active ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-4)]' : ''}
      `}>
        {done ? '✓' : stepIdx + 1}
      </div>
      <span className={`text-xs font-medium leading-tight text-center
        ${active ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'}
      `}>
        {PAYROLL_RUN_STATUS_LABELS[step]}
      </span>
    </div>
  )
}

export default async function PayrollRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)
  const { runId } = await params

  const run = await getPayrollRunById(runId)
  if (!run) redirect('/payroll/runs')

  // P2-P3 — block cross-entity payroll disclosure. getPayrollRunById scopes only
  // by tenant, so without this any authenticated user could read another entity's
  // salary results by run id. Restrict to payroll-capable roles, and (for non
  // SUPER_ADMIN) to runs in the viewer's own legal entity.
  const ALLOWED_PAYROLL_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']
  if (!ALLOWED_PAYROLL_ROLES.includes(session.user.role)) redirect('/dashboard')
  if (session.user.role !== 'SUPER_ADMIN' && session.user.legalEntityId !== run.legalEntityId) {
    redirect('/payroll/runs')
  }

  const [results, variances] = await Promise.all([
    getPayrollResultRows(runId),
    getVarianceReport(runId),
  ])

  const role   = session.user.role
  const status = run.status as PayrollRunStatus

  // Summary stats
  const totalGross    = Number(run.totalGrossPay ?? 0)
  const totalNet      = Number(run.totalNetPay ?? 0)
  const totalDeduct   = Number(run.totalDeductions ?? 0)
  const totalErCost   = Number(run.totalEmployerCost ?? 0)
  const totalEosb     = Number(run.totalEosbProvision ?? 0)
  const totalGpssa    = Number(run.totalGpssaEmployer ?? 0)
  const empCount      = run.employeeCount ?? 0

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="text-xs text-[var(--ink-3)]">
            <Link href="/payroll" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الرواتب' : 'Payroll'}</Link>
            {' / '}
            <Link href="/payroll/runs" className="hover:text-[var(--accent)]">{locale === 'ar' ? 'الدورات' : 'Runs'}</Link>
            {' / '}{run.runNumber}
          </nav>
          <PageTitle className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
            {run.runNumber}
          </PageTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPillClass(status)}`}>
              {PAYROLL_RUN_STATUS_LABELS[status] ?? status}
            </span>
            <span className="text-sm text-[var(--ink-3)]">
              {run.runType.replace(/_/g, ' ')} · {fmtDate(String(run.payPeriodStart))} – {fmtDate(String(run.payPeriodEnd))}
            </span>
          </div>
        </div>

        {/* Lifecycle Actions */}
        <PayrollRunActions runId={run.id} status={status} role={role} />
      </div>

      {/* Lifecycle progress */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{locale === 'ar' ? 'تقدم الدورة' : 'Run Progress'}</p>
        <div className="flex items-start justify-between gap-1">
          {LIFECYCLE_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-1 flex-1">
              <LifecycleStep step={step} current={status} />
              {i < LIFECYCLE_STEPS.length - 1 && (
                <div className={`mb-4 h-px flex-1 ${LIFECYCLE_STEPS.indexOf(status) > i ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Run Details */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: locale === 'ar' ? 'تاريخ الدفع' : 'Payment Date',  value: fmtDate(String(run.paymentDate)) },
          { label: locale === 'ar' ? 'الموعد النهائي لحماية الأجور' : 'WPS Deadline',  value: fmtDate(run.wpsDeadline ? String(run.wpsDeadline) : null) },
          { label: locale === 'ar' ? 'الموظفون' : 'Employees',     value: String(empCount) },
          { label: locale === 'ar' ? 'مرجع ملف SIF' : 'SIF Reference', value: run.sifFileReference ?? '—' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs text-[var(--ink-3)]">{item.label}</p>
            <p className="mt-0.5 font-medium text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      {empCount > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">{locale === 'ar' ? 'الملخص المالي' : 'Financial Summary'}</SectionTitle>
          </div>
          <div className="grid grid-cols-2 divide-x divide-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: locale === 'ar' ? 'إجمالي الراتب' : 'Gross Pay',    value: fmtMoney(totalGross),  highlight: false },
              { label: locale === 'ar' ? 'الاستقطاعات' : 'Deductions',   value: fmtMoney(totalDeduct), highlight: false },
              { label: locale === 'ar' ? 'صافي الراتب' : 'Net Pay',      value: fmtMoney(totalNet),    highlight: true  },
              { label: locale === 'ar' ? 'تكلفة صاحب العمل' : 'Employer Cost', value: fmtMoney(totalErCost), highlight: false },
              { label: locale === 'ar' ? 'مخصص نهاية الخدمة' : 'EOSB Provision', value: fmtMoney(totalEosb), highlight: false },
              { label: locale === 'ar' ? 'GPSSA (صاحب العمل)' : 'GPSSA (ER)',   value: fmtMoney(totalGpssa),  highlight: false },
            ].map(item => (
              <div key={item.label} className="p-4 text-center">
                <p className="text-xs text-[var(--ink-3)]">{item.label}</p>
                <p className={`mt-1 text-base font-semibold ${item.highlight ? 'text-[var(--accent)]' : 'text-[var(--ink-1)]'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variance Alerts */}
      {variances.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950/20">
          <SectionTitle className="mb-2 text-sm font-semibold text-yellow-800 dark:text-yellow-300">
            {locale === 'ar' ? 'تنبيهات التباين' : 'Variance Alerts'} ({variances.length}) — BR-PAY-001
          </SectionTitle>
          <div className="space-y-1">
            {variances.slice(0, 5).map(v => (
              <div key={v.personId} className="flex items-center justify-between text-sm">
                <span className="text-yellow-900 dark:text-yellow-200">{v.fullNameEn}</span>
                <span className={`font-mono font-semibold ${v.variancePct > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {v.variancePct > 0 ? '+' : ''}{(v.variancePct * 100).toFixed(1)}%
                </span>
              </div>
            ))}
            {variances.length > 5 && (
              <p className="text-xs text-yellow-700">+ {variances.length - 5} {locale === 'ar' ? 'المزيد…' : 'more…'}</p>
            )}
          </div>
        </div>
      )}

      {/* Employee Results Table */}
      {results.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <SectionTitle className="text-sm font-semibold text-[var(--ink-1)]">
              {locale === 'ar' ? 'نتائج رواتب الموظفين' : 'Employee Payroll Results'} ({results.length})
            </SectionTitle>
            {status === 'CONFIRMED' && (
              <Link href={`/payroll/wps?runId=${run.id}`}
                className="text-xs text-[var(--accent)] hover:underline">
                {locale === 'ar' ? 'عرض سجلات حماية الأجور ←' : 'View WPS Records →'}
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                  <th className="px-4 py-2 text-left">{locale === 'ar' ? 'القسم' : 'Department'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'الأساسي' : 'Basic'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'الإجمالي' : 'Gross'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'الاستقطاعات' : 'Deductions'}</th>
                  <th className="px-4 py-2 text-right">{locale === 'ar' ? 'صافي الراتب' : 'Net Pay'}</th>
                  <th className="px-4 py-2 text-right">EOSB</th>
                  <th className="px-4 py-2 text-center">{locale === 'ar' ? 'التباين' : 'Variance'}</th>
                  <th className="px-4 py-2 text-center">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {results.map(r => (
                  <tr key={r.id} className={`hover:bg-[var(--surface)] transition-colors ${r.isVarianceFlagged ? 'bg-yellow-50 dark:bg-yellow-950/10' : ''}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[var(--ink-1)]">{r.fullNameEn}</p>
                      {r.employeeNumber && (
                        <p className="text-xs font-mono text-[var(--ink-3)]">{r.employeeNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{r.departmentEn ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-1)]">{fmtMoney(r.basicSalary)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-1)]">{fmtMoney(r.totalGrossPay)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600">{fmtMoney(r.totalDeductions)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--ink-1)]">{fmtMoney(r.netPay)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--ink-2)]">{fmtMoney(r.eosbProvision)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.variancePct !== null ? (
                        <span className={`text-xs font-mono font-semibold ${
                          Math.abs(r.variancePct) >= 0.2
                            ? 'text-red-600'
                            : r.variancePct > 0 ? 'text-green-600' : 'text-[var(--ink-2)]'
                        }`}>
                          {r.variancePct > 0 ? '+' : ''}{(r.variancePct * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-4)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.paymentStatus === 'PAID'
                          ? 'bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]'
                          : 'bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]'
                      }`}>
                        {r.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Sticky totals footer */}
              <tfoot className="border-t-2 border-[var(--border)] bg-[var(--surface)]">
                <tr className="text-sm font-semibold">
                  <td className="px-4 py-3 text-[var(--ink-1)]">{locale === 'ar' ? 'الإجمالي' : 'Total'} ({empCount})</td>
                  <td />
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtMoney(results.reduce((s, r) => s + r.basicSalary, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMoney(totalGross)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{fmtMoney(totalDeduct)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--accent)]">{fmtMoney(totalNet)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMoney(totalEosb)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {run.notes && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--ink-3)]">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</p>
          <p className="mt-1 text-sm text-[var(--ink-2)]">{run.notes}</p>
        </div>
      )}
    </div>
  )
}
