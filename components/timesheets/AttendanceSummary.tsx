'use client'

import type { AttendanceSummaryData } from '@/modules/timesheets/actions'

interface Props {
  summary: AttendanceSummaryData
}

export function AttendanceSummary({ summary }: Props) {
  const cards = [
    {
      label: 'Present',
      value: summary.presentDays,
      unit:  'days',
      style: { background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)' },
    },
    {
      label: 'Absent',
      value: summary.absentDays,
      unit:  'days',
      style: { background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)' },
    },
    {
      label: 'Late',
      value: summary.lateDays,
      unit:  'days',
      style: { background: 'var(--status-draft-bg)', color: 'var(--status-draft-fg)' },
    },
    {
      label: 'On Leave',
      value: summary.leaveDays,
      unit:  'days',
      style: { background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)' },
    },
    {
      label: 'Worked',
      value: summary.totalWorked.toFixed(1),
      unit:  'hrs',
      style: { background: 'var(--muted)', color: 'var(--foreground)' },
    },
    {
      label: 'Overtime',
      value: summary.totalOT.toFixed(1),
      unit:  'hrs',
      style: { background: 'var(--muted)', color: 'var(--foreground)' },
    },
  ]

  return (
    <div
      data-responsive-grid="true" style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap:                 '0.75rem',
        marginBottom:        '1.25rem',
      }}
    >
      {cards.map(card => (
        <div
          key={card.label}
          style={{
            ...card.style,
            borderRadius: '0.5rem',
            padding:      '0.875rem 1rem',
          }}
        >
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 500, opacity: 0.75 }}>{card.label}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>
            {card.value}
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 400, marginLeft: '0.25rem' }}>
              {card.unit}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
