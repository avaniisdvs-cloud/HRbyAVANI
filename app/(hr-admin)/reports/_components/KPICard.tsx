interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: string
  trendDir?: 'up' | 'down' | 'neutral'
  color?: string
  onClick?: () => void
}

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendDir = 'neutral',
  color,
  onClick,
}: KPICardProps) {
  const trendIcon = trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→'
  const trendColor =
    trendDir === 'up'
      ? 'var(--status-approved-text, #16a34a)'
      : trendDir === 'down'
        ? 'var(--status-rejected-text, #dc2626)'
        : 'var(--ink-3)'

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px',
        cursor: onClick ? 'pointer' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Title */}
      <span
        style={{
          fontSize: 'var(--text-caption)',
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 600,
        }}
      >
        {title}
      </span>

      {/* Value */}
      <span
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: color ?? 'var(--ink-1)',
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {value}
      </span>

      {/* Subtitle */}
      {subtitle && (
        <span
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--ink-3)',
          }}
        >
          {subtitle}
        </span>
      )}

      {/* Trend */}
      {trend && (
        <span
          style={{
            fontSize: 'var(--text-caption)',
            color: trendColor,
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>{trendIcon}</span>
          <span>{trend}</span>
        </span>
      )}
    </div>
  )
}
