'use client'

interface DraftRestoreBannerProps {
  relativeTime: string
  onRestore:    () => void
  onDiscard:    () => void
}

export function DraftRestoreBanner({ relativeTime, onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      background: 'var(--accent-050)',
      border: '1px solid var(--accent-200)',
      borderRadius: 8,
      padding: '10px 16px',
      marginBottom: 16,
      animation: 'fadeIn 200ms ease',
    }}>
      <div>
        <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
          You have an unsaved draft
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
          Last saved {relativeTime}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onRestore}
          style={{
            padding: '5px 12px',
            fontSize: 'var(--text-caption)',
            fontWeight: 600,
            background: 'var(--accent)',
            color: "var(--on-accent)",
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-700)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
        >
          Restore
        </button>
        <button
          type="button"
          onClick={onDiscard}
          style={{
            padding: '5px 12px',
            fontSize: 'var(--text-caption)',
            fontWeight: 600,
            background: 'var(--card)',
            color: 'var(--ink-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'border-color 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--ink-4)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          Discard
        </button>
      </div>
    </div>
  )
}

// ── Auto-save indicator (sticky bottom of form) ───────────────────────────────

interface DraftIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error'
}

export function DraftSaveIndicator({ status }: DraftIndicatorProps) {
  if (status === 'idle') return null

  const label = status === 'saving' ? 'Saving draft…'
    : status === 'saved'  ? '✓ Draft saved'
    : '⚠ Draft save failed'

  const color = status === 'error' ? '#B33A3A' : 'var(--ink-4)'

  return (
    <div style={{
      fontSize: 'var(--text-caption)',
      color,
      fontFamily: 'var(--font-sans)',
      opacity: status === 'saved' ? 1 : 0.8,
      transition: 'opacity 300ms',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      {label}
    </div>
  )
}
