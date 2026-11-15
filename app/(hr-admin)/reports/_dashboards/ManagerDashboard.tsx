'use client'

import type { ManagerDashboardData } from '@/modules/reports'
import { useLocale } from '@/components/providers/LocaleProvider'
import KPICard from '../_components/KPICard'
import SectionHeader from '../_components/SectionHeader'

interface Props {
  data: ManagerDashboardData
  managerName?: string
}

export function ManagerDashboard({ data, managerName }: Props) {
  const locale = useLocale()
  const today = new Date().toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const coverage = Math.round(
    ((data.teamSize - data.onLeaveToday) / Math.max(data.teamSize, 1)) * 100,
  )

  // ARIA recommendation helper
  function getRecommendation(approval: ManagerDashboardData['pendingApprovals'][number]): {
    label: string
    color: string
  } {
    // Balance check takes priority
    if (approval.balanceAfterDays !== null && parseFloat(approval.balanceAfterDays) < 0) {
      return {
        label: locale === 'ar' ? '✗ الرصيد غير كافٍ' : '✗ Insufficient balance',
        color: 'var(--status-rejected-text, #dc2626)',
      }
    }
    // Coverage check
    if (coverage >= 70) {
      return {
        label: locale === 'ar' ? '✓ يُوصى بالموافقة' : '✓ Recommend Approve',
        color: 'var(--status-approved-text, #16a34a)',
      }
    }
    return {
      label: locale === 'ar' ? '⚠ مراجعة — تغطية الفريق منخفضة' : '⚠ Review — team coverage low',
      color: 'var(--status-pending-text, #d97706)',
    }
  }

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
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--ink-1)',
              margin: 0,
            }}
          >
            {locale === 'ar' ? 'فريقك' : 'Your Team'}{managerName ? ` · ${managerName}` : ''}
          </h1>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0' }}>
            {locale === 'ar' ? 'لوحة المرؤوسين المباشرين' : 'Direct reports dashboard'} · {today}
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
        <KPICard title={locale === 'ar' ? 'أعضاء الفريق' : 'Team Members'} value={data.teamSize} />
        <KPICard title={locale === 'ar' ? 'في إجازة اليوم' : 'On Leave Today'} value={data.onLeaveToday} />
        <KPICard
          title={locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
          value={data.pendingApprovals.length}
          color={data.pendingApprovals.length > 0 ? 'var(--accent)' : undefined}
        />
        <KPICard
          title={locale === 'ar' ? 'الفريق المتاح اليوم' : 'Team Available Today'}
          value={`${coverage}%`}
          subtitle={locale === 'ar'
            ? `${data.teamSize - data.onLeaveToday} من ${data.teamSize} حاضرون`
            : `${data.teamSize - data.onLeaveToday} of ${data.teamSize} in`}
        />
      </div>

      {/* ── Pending Approvals ────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <SectionHeader title={locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'} />

        {data.pendingApprovals.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
            {locale === 'ar' ? 'لا توجد موافقات معلقة' : 'No pending approvals'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.pendingApprovals.map((approval) => {
              const rec = getRecommendation(approval)
              return (
                <div
                  key={approval.id}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 2,
                  }}
                >
                  {/* Row 1: Name + type pill */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-1)' }}>
                      {approval.personName ?? '—'}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        fontWeight: 600,
                        padding: '2px 10px',
                        borderRadius: 20,
                        background: 'var(--status-pending-bg, rgba(217,119,6,0.08))',
                        color: 'var(--status-pending-text, #d97706)',
                      }}
                    >
                      {approval.typeName}
                    </span>
                  </div>

                  {/* Row 2: Dates + duration */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                      {approval.startDate} → {approval.endDate}
                    </span>
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                      {approval.durationDays} {locale === 'ar' ? 'يوم' : 'days'}
                    </span>
                  </div>

                  {/* Row 3: ARIA recommendation */}
                  <div style={{ marginBottom: 10 }}>
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        fontWeight: 500,
                        color: rec.color,
                      }}
                    >
                      {rec.label}
                    </span>
                  </div>

                  {/* Row 4: Action buttons */}
                  {/* TODO: Wire up actual approval/rejection — calls to workflow API in a future sprint */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      onClick={() => {}}
                      style={{
                        border: '1px solid var(--status-approved-text, #16a34a)',
                        color: 'var(--status-approved-text, #16a34a)',
                        background: 'var(--status-approved-bg, rgba(22,163,74,0.08))',
                        borderRadius: 6,
                        fontSize: 'var(--text-caption)',
                        padding: '4px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      {locale === 'ar' ? 'موافقة' : 'Approve'}
                    </button>
                    <button
                      onClick={() => {}}
                      style={{
                        border: '1px solid var(--status-rejected-text, #dc2626)',
                        color: 'var(--status-rejected-text, #dc2626)',
                        background: 'var(--status-rejected-bg, rgba(239,68,68,0.08))',
                        borderRadius: 6,
                        fontSize: 'var(--text-caption)',
                        padding: '4px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      {locale === 'ar' ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Team On Leave Today ───────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <SectionHeader title={locale === 'ar' ? 'الفريق في إجازة اليوم' : 'Team On Leave Today'} />

        {data.teamOnLeaveToday.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {locale === 'ar' ? 'الجميع حاضرون اليوم 🟢' : 'Everyone is in today 🟢'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.teamOnLeaveToday.map((person, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom:
                    idx < data.teamOnLeaveToday.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {person.personName ?? '—'}
                  </span>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    {person.typeName}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {locale === 'ar' ? 'العودة' : 'Returns'}: {person.endDate}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
