const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  borderRadius: 6,
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span style={{ ...badgeBase, background: 'var(--accent-100)', color: 'var(--brand-active)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-700)', flexShrink: 0 }} />
      Active
    </span>
  ) : (
    <span style={{ ...badgeBase, background: 'var(--surface)', color: 'var(--ink-3)', border: '1px solid var(--border)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink-4)', flexShrink: 0 }} />
      Inactive
    </span>
  )
}

// Re-export for convenience
export default StatusBadge
