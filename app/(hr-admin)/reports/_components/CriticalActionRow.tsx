interface CriticalActionRowProps {
  severity: 'red' | 'amber' | 'neutral'
  message: string
  actionLabel?: string
  onAction?: () => void
}

export default function CriticalActionRow({
  severity,
  message,
  actionLabel,
  onAction,
}: CriticalActionRowProps) {
  const bgMap: Record<typeof severity, string> = {
    red: 'var(--status-rejected-bg)',
    amber: 'var(--status-pending-bg)',
    neutral: 'var(--card)',
  }

  const dotColorMap: Record<typeof severity, string> = {
    red: 'var(--status-rejected-text, #dc2626)',
    amber: 'var(--status-pending-text, #d97706)',
    neutral: 'var(--ink-3)',
  }

  return (
    <div
      style={{
        background: bgMap[severity],
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Dot */}
      <span
        style={{
          flexShrink: 0,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColorMap[severity],
          display: 'inline-block',
        }}
      />

      {/* Message */}
      <span
        style={{
          fontSize: 'var(--text-body)',
          color: 'var(--ink-1)',
          flex: 1,
        }}
      >
        {message}
      </span>

      {/* Action button */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            flexShrink: 0,
            fontSize: 'var(--text-caption)',
            padding: '3px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent)',
            background: 'transparent',
            color: 'var(--brand-active)',
            cursor: 'pointer',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
