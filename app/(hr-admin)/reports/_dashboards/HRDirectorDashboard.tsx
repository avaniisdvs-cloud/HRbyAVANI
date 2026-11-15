'use client'

import type { HRDirectorDashboardData } from '@/modules/reports'
import { useLocale } from '@/components/providers/LocaleProvider'
import KPICard from '../_components/KPICard'
import SectionHeader from '../_components/SectionHeader'
import CSSBarChart from '../_components/CSSBarChart'

interface Props {
  data: HRDirectorDashboardData
}

// Pill color by doc type
function docTypePillStyle(docType: string): { background: string; color: string } {
  const upper = docType.toUpperCase()
  if (upper === 'VISA') {
    return {
      background: 'var(--status-rejected-bg)',
      color: 'var(--status-rejected-text, #dc2626)',
    }
  }
  if (upper === 'PASSPORT') {
    return {
      background: 'var(--status-pending-bg)',
      color: 'var(--status-pending-text, #d97706)',
    }
  }
  return {
    background: 'var(--status-approved-bg, rgba(22,163,74,0.08))',
    color: 'var(--status-approved-text, #16a34a)',
  }
}

export function HRDirectorDashboard({ data }: Props) {
  const locale = useLocale()
  const today = new Date().toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Derive a total expiringDocsCount for compliance score
  const expiringDocsCount = data.expiringDocs.reduce((sum, d) => sum + d.count, 0)
  const complianceScore = Math.max(0, 100 - expiringDocsCount)

  return (
    <div className="page-in" style={{ padding: 0 }}>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink-1)',
            marginTop: 0,
            marginRight: 0,
            marginLeft: 0,
            marginBottom: 4,
          }}
        >
          {locale === 'ar' ? 'تحليلات الموارد البشرية' : 'People Analytics'}
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
          {locale === 'ar' ? 'نظرة استراتيجية على القوى العاملة' : 'Strategic workforce overview'} · {today}
        </p>
      </div>

      {/* ── KPI row (6 cards, 3-col grid) ────────────────────────────────────── */}
      <div
        data-responsive-grid="true" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KPICard
          title={locale === 'ar' ? 'إجمالي عدد الموظفين' : 'Total Headcount'}
          value={data.headcount}
          subtitle={locale === 'ar' ? 'الموظفون النشطون' : 'Active employees'}
        />
        <KPICard
          title={locale === 'ar' ? 'التعيينات الجديدة منذ بداية العام' : 'New Hires YTD'}
          value={data.newHiresYtd}
          subtitle={locale === 'ar' ? 'منذ بداية العام' : 'Year to date'}
          trendDir="up"
        />
        <KPICard
          title={locale === 'ar' ? 'إنهاءات الخدمة منذ بداية العام' : 'Terminations YTD'}
          value={data.terminationsYtd}
          subtitle={locale === 'ar' ? 'منذ بداية العام' : 'Year to date'}
          trendDir="down"
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
        />
        <KPICard
          title={locale === 'ar' ? 'عقود قاربت على الانتهاء' : 'Expiring Contracts'}
          value={data.expiringContracts}
          subtitle={locale === 'ar' ? 'خلال 30 يوماً' : 'Within 30 days'}
          color={data.expiringContracts > 0 ? 'var(--status-pending-text, #d97706)' : undefined}
        />
      </div>

      {/* ── Charts 2×2 grid ───────────────────────────────────────────────────── */}
      <div
        data-responsive-grid="true" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        {/* Top-left: Headcount by Department */}
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

        {/* Top-right: Nationality Mix */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'توزيع الجنسيات' : 'Nationality Mix'} />
          <CSSBarChart
            items={data.byNationality.map((d) => ({ label: d.category, value: d.count }))}
            color="var(--accent-2, var(--accent))"
          />
        </div>

        {/* Bottom-left: Document Expiries */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'انتهاء صلاحية الوثائق (30 يوماً)' : 'Document Expiries (30 days)'} />
          {data.expiringDocs.length === 0 ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
              {locale === 'ar' ? 'لا توجد وثائق تنتهي صلاحيتها خلال 30 يوماً القادمة' : 'No expiring documents in the next 30 days'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.expiringDocs.map((doc) => {
                const pillStyle = docTypePillStyle(doc.docType)
                return (
                  <div
                    key={doc.docType}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                      {doc.docType}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        fontWeight: 600,
                        padding: '2px 10px',
                        borderRadius: 20,
                        background: pillStyle.background,
                        color: pillStyle.color,
                      }}
                    >
                      {doc.count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom-right: Compliance Health */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <SectionHeader title={locale === 'ar' ? 'سلامة الامتثال' : 'Compliance Health'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Documents current */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>
                  {locale === 'ar' ? 'الوثائق سارية' : 'Documents current'}
                </span>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
                  {locale === 'ar' ? 'بناءً على نافذة انتهاء صلاحية 30 يوماً' : 'Based on 30-day expiry window'}
                </span>
              </div>
              <span
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 700,
                  color:
                    complianceScore >= 90
                      ? 'var(--status-approved-text, #16a34a)'
                      : complianceScore < 70
                        ? 'var(--status-rejected-text, #dc2626)'
                        : 'var(--status-pending-text, #d97706)',
                  flexShrink: 0,
                }}
              >
                {complianceScore}/100
              </span>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Contracts active */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>
                  {locale === 'ar' ? 'العقود سارية' : 'Contracts active'}
                </span>
                {data.expiringContracts > 0 && (
                  <span
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--status-pending-text, #d97706)',
                    }}
                  >
                    {locale === 'ar'
                      ? `${data.expiringContracts} تنتهي خلال 30 يوماً`
                      : `${data.expiringContracts} expiring within 30 days`}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 600,
                  color:
                    data.expiringContracts > 0
                      ? 'var(--status-pending-text, #d97706)'
                      : 'var(--status-approved-text, #16a34a)',
                  flexShrink: 0,
                }}
              >
                {data.expiringContracts > 0
                  ? (locale === 'ar' ? `${data.expiringContracts} في خطر` : `${data.expiringContracts} at risk`)
                  : (locale === 'ar' ? 'سليم' : 'OK')}
              </span>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Pending approvals */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>
                  {locale === 'ar' ? 'الموافقات المعلقة' : 'Pending approvals'}
                </span>
                {data.pendingApprovals > 5 && (
                  <span
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--status-pending-text, #d97706)',
                    }}
                  >
                    {locale === 'ar' ? 'حجم مرتفع — يُنصح بمراجعة القائمة' : 'High volume — consider reviewing queue'}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 600,
                  color:
                    data.pendingApprovals > 5
                      ? 'var(--status-pending-text, #d97706)'
                      : 'var(--ink-2)',
                  flexShrink: 0,
                }}
              >
                {data.pendingApprovals}
              </span>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
