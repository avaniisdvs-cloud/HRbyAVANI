'use client'

import { PageTitle } from '@/components/ui/typography'
import { useRouter } from 'next/navigation'
import type { HRAdminDashboardData } from '@/modules/reports'
import { useLocale } from '@/components/providers/LocaleProvider'
import KPICard from '../_components/KPICard'
import SectionHeader from '../_components/SectionHeader'
import CriticalActionRow from '../_components/CriticalActionRow'
import CSSBarChart from '../_components/CSSBarChart'

interface Props {
  data: HRAdminDashboardData
}

export function HRAdminDashboard({ data }: Props) {
  const router = useRouter()
  const locale = useLocale()

  const today = new Date().toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const complianceScore = Math.max(0, 100 - data.expiringDocsCount)
  const complianceTrendDir: 'up' | 'down' | 'neutral' =
    complianceScore >= 90 ? 'up' : complianceScore < 70 ? 'down' : 'neutral'

  // Critical action items
  const visaDoc = data.expiringDocs.find((d) => d.docType === 'VISA' && d.count > 0)
  const hasCriticalActions =
    !!visaDoc || data.expiringContracts > 0 || data.sickOver14Days > 0

  return (
    <div className="page-in" style={{ padding: 0 }}>
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <PageTitle
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          {locale === 'ar' ? 'التقارير والتحليلات' : 'Reports & Analytics'}
        </PageTitle>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{today}</span>
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
          title={locale === 'ar' ? 'الموظفون النشطون' : 'Active Employees'}
          value={data.headcount}
          subtitle={locale === 'ar' ? 'إجمالي القوى العاملة' : 'Total workforce'}
        />
        <KPICard
          title={locale === 'ar' ? 'في إجازة اليوم' : 'On Leave Today'}
          value={data.onLeaveToday}
          subtitle={locale === 'ar' ? 'إجازات معتمدة' : 'Approved absences'}
        />
        <KPICard
          title={locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
          value={data.pendingApprovals}
          subtitle={locale === 'ar' ? 'بانتظار الإجراء' : 'Awaiting action'}
          color="var(--accent)"
          onClick={() => router.push('/workflows')}
        />
        <KPICard
          title={locale === 'ar' ? 'درجة الامتثال' : 'Compliance Score'}
          value={`${complianceScore}`}
          subtitle={locale === 'ar' ? 'سلامة الوثائق /100' : 'Document health /100'}
          trendDir={complianceTrendDir}
        />
      </div>

      {/* ── Critical Actions ─────────────────────────────────────────────────── */}
      {hasCriticalActions && (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'إجراءات حرجة' : 'Critical Actions'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visaDoc && (
              <CriticalActionRow
                severity="red"
                message={locale === 'ar'
                  ? `تأشيرات منتهية أو قاربت على الانتهاء: ${visaDoc.count} موظف`
                  : `Visa expired or expiring: ${visaDoc.count} employees`}
              />
            )}
            {data.expiringContracts > 0 && (
              <CriticalActionRow
                severity="amber"
                message={locale === 'ar'
                  ? `عقود تنتهي خلال 30 يوماً: ${data.expiringContracts}`
                  : `Contracts expiring in 30 days: ${data.expiringContracts}`}
              />
            )}
            {data.sickOver14Days > 0 && (
              <CriticalActionRow
                severity="amber"
                message={locale === 'ar'
                  ? `إجازات مرضية تتجاوز 14 يوماً، قد تتطلب شهادة طبية: ${data.sickOver14Days}`
                  : `Sick leave > 14 days, medical cert may be required: ${data.sickOver14Days}`}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Charts row ───────────────────────────────────────────────────────── */}
      <div
        data-responsive-grid="true" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Left: Headcount by Department */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'التوزيع حسب القسم' : 'Headcount by Department'} />
          <CSSBarChart
            items={data.byDepartment.map((d) => ({ label: d.dept, value: d.count }))}
          />
        </div>

        {/* Right: Absence Today */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'الغياب اليوم' : 'Absence Today'} />
          {data.absenceToday.length === 0 ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
              {locale === 'ar' ? 'لا يوجد غياب اليوم' : 'No absences today'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.absenceToday.map((item) => (
                <div
                  key={item.typeName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                    {item.typeName}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 600,
                      padding: '2px 10px',
                      borderRadius: 20,
                      background: 'var(--status-approved-bg, rgba(22,163,74,0.08))',
                      color: 'var(--status-approved-text, #16a34a)',
                    }}
                  >
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Leave Trend placeholder ───────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <SectionHeader title={locale === 'ar' ? 'اتجاه الإجازات (آخر 6 أشهر)' : 'Leave Trend (Last 6 Months)'} />
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
          {locale === 'ar'
            ? 'الرسم البياني متاح — تتراكم البيانات التاريخية بمرور الوقت'
            : 'Chart visualization available — historical data accumulates over time'}
        </p>
      </div>
    </div>
  )
}
