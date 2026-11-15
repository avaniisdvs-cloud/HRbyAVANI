'use client'

/**
 * ProbationStatusCard — bilingual (EN/AR) horizontal timeline card.
 * Shows hire date, today, probation end date, and 6-month cap.
 * Warns in amber (--status-warning) if within 14 days of end; red if overdue.
 */

import { formatDMY } from '@/lib/utils/date-format'
import type { Locale } from '@/lib/i18n'

export type ProbationStatusCardProps = {
  hireDate: string
  probationEndDate: string
  probationStatus: string
  maxExtensionDate: string // hire_date + 182 days
  locale?: Locale
}

function parseDate(s: string): Date {
  // Parse YYYY-MM-DD into local midnight to avoid UTC-offset day slippage
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function msPerDay(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function ProbationStatusCard({
  hireDate,
  probationEndDate,
  probationStatus,
  maxExtensionDate,
  locale = 'en',
}: ProbationStatusCardProps) {
  const ar = locale === 'ar'
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const hireDt  = parseDate(hireDate)
  const endDt   = parseDate(probationEndDate)
  const capDt   = parseDate(maxExtensionDate)

  const daysToEnd   = msPerDay(today, endDt)
  const totalDays   = msPerDay(hireDt, endDt)
  const elapsedDays = msPerDay(hireDt, today)
  const progressPct = Math.min(100, Math.max(0, totalDays > 0 ? (elapsedDays / totalDays) * 100 : 100))

  const isOverdue = daysToEnd < 0
  const isWarning = !isOverdue && daysToEnd <= 14

  // Timeline marker positions as % of hire→cap span
  const totalSpan = msPerDay(hireDt, capDt)
  const todayPct  = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsedDays / totalSpan) * 100)) : 0
  // reuse totalDays (= hire→end) to avoid recomputing the same span
  const endPct    = totalSpan > 0 ? Math.min(100, Math.max(0, (totalDays / totalSpan) * 100)) : 80

  const barColor    = isOverdue ? 'var(--status-rejected-fg)' : isWarning ? 'var(--status-warning-fg)' : 'var(--accent)'
  const borderColor = isOverdue ? 'var(--status-rejected-dot)' : isWarning ? 'var(--status-warning-fg)' : 'var(--border)'

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      padding: '24px 28px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
          {ar ? 'حالة التجربة' : 'Probation Status'}
        </h2>

        <span style={{
          marginLeft: 'auto',
          fontSize: 'var(--text-caption)',
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: 99,
          background: isOverdue ? 'var(--status-rejected-bg)' : isWarning ? 'var(--status-warning-bg)' : 'var(--accent-050)',
          color: isOverdue ? 'var(--status-rejected-fg)' : isWarning ? 'var(--status-warning-fg)' : 'var(--brand-active)',
        }}>
          {probationStatus}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ height: 8, background: 'var(--surface)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: barColor,
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }} />
        </div>

        <div style={{ marginTop: 8, fontSize: 'var(--text-body)' }}>
          {isOverdue ? (
            <span style={{ color: 'var(--status-rejected-fg)', fontWeight: 600 }}>
              {ar
                ? `متأخر بـ ${Math.abs(daysToEnd)} يوم`
                : `Overdue by ${Math.abs(daysToEnd)} day${Math.abs(daysToEnd) !== 1 ? 's' : ''}`}
            </span>
          ) : isWarning ? (
            <span style={{ color: 'var(--status-warning-fg)', fontWeight: 600 }}>
              {ar
                ? `متبقي ${daysToEnd} يوم — استحقاق المراجعة قريب`
                : `${daysToEnd} day${daysToEnd !== 1 ? 's' : ''} remaining — review due soon`}
            </span>
          ) : (
            <span style={{ color: 'var(--ink-2)' }}>
              {ar
                ? `متبقي ${daysToEnd} يوم`
                : `${daysToEnd} day${daysToEnd !== 1 ? 's' : ''} remaining`}
            </span>
          )}
        </div>
      </div>

      {/* Horizontal timeline */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, position: 'relative', margin: '0 0 32px' }}>
          <TimelineDot pct={0} label="Hire Date" labelAr="تاريخ التعيين" dateStr={hireDate} color="var(--ink-3)" locale={locale} />
          <TimelineDot
            pct={todayPct}
            label="Today"
            labelAr="اليوم"
            dateStr={today.toISOString().split('T')[0]}
            color={barColor}
            isToday
            locale={locale}
          />
          <TimelineDot
            pct={endPct}
            label="Probation End"
            labelAr="نهاية التجربة"
            dateStr={probationEndDate}
            color={isOverdue ? 'var(--status-rejected-fg)' : 'var(--ink-2)'}
            locale={locale}
          />
          <TimelineDot pct={100} label="6-Month Cap" labelAr="الحد الأقصى ٦ أشهر" dateStr={maxExtensionDate} color="var(--ink-4)" locale={locale} />
        </div>
      </div>

      {/* Summary row */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 8 }}>
        <SummaryItem labelEn="Hire Date" labelAr="تاريخ التعيين" value={formatDMY(hireDate)} locale={locale} />
        <SummaryItem
          labelEn="Probation End"
          labelAr="نهاية التجربة"
          value={formatDMY(probationEndDate)}
          highlight={isOverdue || isWarning}
          highlightColor={isOverdue ? 'var(--status-rejected-fg)' : 'var(--status-warning-fg)'}
          locale={locale}
        />
        <SummaryItem labelEn="6-Month Cap" labelAr="الحد الأقصى" value={formatDMY(maxExtensionDate)} locale={locale} />
      </div>
    </div>
  )
}

function TimelineDot({
  pct,
  label,
  labelAr,
  dateStr,
  color,
  isToday = false,
  locale = 'en',
}: {
  pct: number
  label: string
  labelAr: string
  dateStr: string
  color: string
  isToday?: boolean
  locale?: Locale
}) {
  const display = formatDMY(dateStr)

  return (
    <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}>
      <div style={{
        width: isToday ? 12 : 8,
        height: isToday ? 12 : 8,
        borderRadius: '50%',
        background: color,
        border: '2px solid var(--card)',
        boxShadow: isToday ? `0 0 0 2px ${color}` : undefined,
        position: 'relative',
        zIndex: 1,
      }} />
      <div style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: 8,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>
        <div
          style={{ fontSize: 'var(--text-caption)', fontWeight: isToday ? 700 : 500, color, lineHeight: 1.3 }}
          {...(locale === 'ar' ? { dir: 'rtl' as const, lang: 'ar' } : {})}
        >
          {locale === 'ar' ? labelAr : label}
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{display}</div>
      </div>
    </div>
  )
}

function SummaryItem({
  labelEn,
  labelAr,
  value,
  highlight = false,
  highlightColor = 'var(--status-rejected-fg)',
  locale = 'en',
}: {
  labelEn: string
  labelAr: string
  value: string
  highlight?: boolean
  highlightColor?: string
  locale?: Locale
}) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginBottom: 4 }} {...(locale === 'ar' ? { dir: 'rtl' as const, lang: 'ar' } : {})}>
        {locale === 'ar' ? labelAr : labelEn}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: highlight ? highlightColor : 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  )
}
