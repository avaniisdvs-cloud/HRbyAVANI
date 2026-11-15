interface LeaveBalanceBarProps {
  label: string
  available: number
  total: number
  color?: string
}

export default function LeaveBalanceBar({
  label,
  available,
  total,
  color,
}: LeaveBalanceBarProps) {
  const ratio = total === 0 ? 0 : Math.min(available / total, 1)
  const pct = Math.round(ratio * 100)

  const barColor =
    color ??
    (ratio > 0.5
      ? 'var(--status-approved-text, #16a34a)'
      : ratio >= 0.2
        ? 'var(--status-pending-text, #d97706)'
        : 'var(--status-rejected-text, #dc2626)')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* Label row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{label}</span>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>
          {available}/{total} days
        </span>
      </div>

      {/* Bar track */}
      <div
        style={{
          width: '100%',
          height: 6,
          borderRadius: 3,
          background: 'var(--border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 3,
            background: barColor,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}
