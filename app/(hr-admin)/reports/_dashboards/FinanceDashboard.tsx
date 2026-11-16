'use client'

import { PageTitle } from '@/components/ui/typography'
import type { FinanceDashboardData } from '@/modules/reports'
import { useLocale } from '@/components/providers/LocaleProvider'
import KPICard from '../_components/KPICard'
import SectionHeader from '../_components/SectionHeader'

interface Props {
  data: FinanceDashboardData
}

function formatAED(val: string | number | undefined): string {
  if (val === undefined || val === null) return 'AED 0'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return 'AED 0'
  return `AED ${num.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function FinanceDashboard({ data }: Props) {
  const locale = useLocale()
  const today = new Date().toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const runStatusSteps = locale === 'ar'
    ? [
        'تأكيد عناصر الراتب',
        'تطبيق خصومات الغياب',
        'احتساب مخصص نهاية الخدمة',
        'بانتظار موافقة المالية',
        'بانتظار ملف حماية الأجور',
      ]
    : [
        'Elements confirmed',
        'Absence deductions applied',
        'EOSB provision calculated',
        'Finance approval pending',
        'WPS SIF pending',
      ]

  return (
    <div className="page-in" style={{ padding: 0 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <PageTitle
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--ink-1)',
              margin: 0,
            }}
          >
            {locale === 'ar' ? 'نظرة عامة على الرواتب' : 'Payroll Overview'}
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0' }}>
            {today}
          </p>
        </div>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div
        data-responsive-grid="true" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KPICard
          title={locale === 'ar' ? 'الموظفون المعالَجون' : 'Employees Processed'}
          value={data.latestRun?.employeeCount ?? 0}
        />
        <KPICard
          title={locale === 'ar' ? 'إجمالي صافي الأجور' : 'Total Net Pay'}
          value={formatAED(data.latestRun?.totalNetPay)}
        />
        <KPICard
          title={locale === 'ar' ? 'إجمالي تكلفة صاحب العمل' : 'Total Employer Cost'}
          value={formatAED(data.latestRun?.totalEmployerCost)}
        />
        <KPICard
          title={locale === 'ar' ? 'فترة الدفع' : 'Pay Period'}
          value={data.latestRun?.payPeriodEnd ?? (locale === 'ar' ? 'لا توجد دورة بعد' : 'No run yet')}
        />
      </div>

      {/* ── No run notice ────────────────────────────────────────────────────── */}
      {data.latestRun === null && (
        <div
          style={{
            background: 'var(--status-pending-bg, rgba(217,119,6,0.08))',
            border: '1px solid var(--status-pending-text, #d97706)',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 'var(--text-lead)' }}>⏳</span>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)' }}>
            {locale === 'ar' ? 'لم يتم العثور على دورات رواتب. محرك الرواتب قادم في الدورة 12.' : 'No payroll runs found. Payroll engine coming in Sprint 12.'}
          </span>
        </div>
      )}

      {/* ── Two-column layout for breakdown + run status ─────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: data.latestRun ? '1fr 320px' : '1fr',
          gap: 16,
        }}
      >
        {/* Left: Cost Breakdown */}
        {data.latestRun && (
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <SectionHeader title={locale === 'ar' ? 'تفصيل التكلفة' : 'Cost Breakdown'} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: locale === 'ar' ? 'الرواتب الأساسية'        : 'Basic Salaries',     value: data.costBreakdown.basicSalary },
                { label: locale === 'ar' ? 'بدلات السكن'            : 'Housing Allowances', value: data.costBreakdown.housingAllowance },
                { label: locale === 'ar' ? 'بدل المواصلات'          : 'Transport',          value: data.costBreakdown.transportAllowance },
                { label: locale === 'ar' ? 'بدلات أخرى'             : 'Other Allowances',   value: data.costBreakdown.otherAllowances },
                { label: locale === 'ar' ? 'التأمينات (صاحب العمل)' : 'GPSSA (Employer)',   value: data.costBreakdown.gpssaEmployer },
                { label: locale === 'ar' ? 'مخصص نهاية الخدمة'      : 'EOSB Provision',     value: data.costBreakdown.eosbProvision },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{row.label}</span>
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>
                    {formatAED(row.value)}
                  </span>
                </div>
              ))}

              {/* Divider */}
              <div
                style={{
                  borderTop: '2px solid var(--border)',
                  margin: '8px 0',
                }}
              />

              {/* Total Net Pay */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {locale === 'ar' ? 'إجمالي صافي الأجور' : 'TOTAL NET PAY'}
                </span>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>
                  {formatAED(data.costBreakdown.totalNetPay)}
                </span>
              </div>

              {/* Total Employer Cost */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                }}
              >
                <span
                  style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {locale === 'ar' ? 'إجمالي تكلفة صاحب العمل' : 'TOTAL EMPLOYER COST'}
                </span>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--brand-active)' }}>
                  {formatAED(data.costBreakdown.totalEmployerCost)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Right: Run Status */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'حالة الدورة' : 'Run Status'} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {runStatusSteps.map((step) => (
              <div
                key={step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 'var(--text-body)' }}>⏳</span>
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', flex: 1 }}>{step}</span>
                <span
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: 'var(--status-pending-bg, rgba(217,119,6,0.08))',
                    color: 'var(--status-pending-text, #d97706)',
                  }}
                >
                  {locale === 'ar' ? 'قيد الانتظار' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
