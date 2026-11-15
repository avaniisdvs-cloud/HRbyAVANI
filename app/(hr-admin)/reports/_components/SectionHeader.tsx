import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export default function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        paddingBottom: 8,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 'var(--text-caption)',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--ink-3)',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--ink-4)',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  )
}
