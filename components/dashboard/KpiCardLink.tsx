'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

interface Props {
  href:     string
  /** Accent treatment (e.g. Pending Approvals) — keeps the existing tinted look. */
  accent?:  boolean
  /** Short hint shown at the bottom on hover, e.g. "View employees →". */
  hint?:    string
  children: React.ReactNode
}

const base: React.CSSProperties = {
  background: 'var(--card)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  borderRadius: 12, padding: '22px 24px',
  display: 'flex', flexDirection: 'column', gap: 6,
  position: 'relative', cursor: 'pointer',
  transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
}

/**
 * Clickable KPI card with a PERSISTENT, visible drill-down affordance:
 *  - an always-visible ↗ arrow in the top-right corner (so it reads as
 *    interactive at a glance, not only on hover),
 *  - a hover lift + accent border,
 *  - an optional hover hint line.
 *
 * This is what makes the "cards are now clickable" change visually testable —
 * the arrow is rendered in the static HTML, independent of hover.
 */
export function KpiCardLink({ href, accent = false, hint, children }: Props) {
  const [hover, setHover] = useState(false)

  const style: React.CSSProperties = {
    ...base,
    ...(accent ? { background: 'var(--accent-050)', borderColor: 'var(--accent-200)' } : {}),
    ...(hover
      ? { borderColor: 'var(--accent)', transform: 'translateY(-2px)', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }
      : {}),
  }

  return (
    <Link
      href={href}
      style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={style} data-drilldown="true">
        <ArrowUpRight
          size={16}
          strokeWidth={2}
          aria-hidden
          style={{
            position: 'absolute', top: 14, right: 14,
            color: hover ? 'var(--brand-active)' : (accent ? 'var(--brand-active)' : 'var(--ink-4)'),
            transform: hover ? 'translate(1px, -1px)' : 'none',
            transition: 'color 0.15s, transform 0.15s',
          }}
        />
        {children}
        {hint && (
          <div style={{
            fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)',
            marginTop: 4, height: 14, opacity: hover ? 1 : 0,
            transition: 'opacity 0.15s',
          }}>
            {hint}
          </div>
        )}
      </div>
    </Link>
  )
}
