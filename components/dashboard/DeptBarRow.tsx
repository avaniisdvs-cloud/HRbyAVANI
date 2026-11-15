'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface Props {
  id:       string
  name:     string
  count:    number
  entity:   string
  maxCount: number
  isLast:   boolean
}

export function DeptBarRow({ id, name, count, entity, maxCount, isLast }: Props) {
  const [hovered, setHovered] = useState(false)
  const pct = Math.round((count / maxCount) * 100)

  // The dashboard counts ACTIVE employees only, so the drill-down must apply the
  // same filters (departmentId + status=ACTIVE + isActive=1) for the People list
  // total to reconcile exactly with the count shown on this row.
  const href = `/persons?departmentId=${encodeURIComponent(id)}&status=ACTIVE&isActive=1`

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '10px 0',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    textDecoration: 'none',
  }

  const inner = (
    <>
      <div style={{
        width: 190, fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0,
      }}>
        {name}
      </div>
      <div style={{ flex: 1, height: 22, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent-700), var(--accent))',
          borderRadius: 4,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{
        fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 600,
        color: 'var(--ink-1)', minWidth: 20, textAlign: 'right', flexShrink: 0,
      }}>
        {count}
      </div>
      <div style={{
        fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'right',
        minWidth: 110, flexShrink: 0,
      }}>
        {entity}
      </div>
    </>
  )

  // 0-count departments are not clickable — there are no employees to drill into.
  // A muted dash sits where the drill-down chevron would be, so the row reads as
  // deliberately inert rather than broken.
  if (count === 0) {
    return (
      <div className="department-bar-row" style={{ ...rowStyle, cursor: 'default', opacity: 0.6 }} data-clickable="false">
        {inner}
        <span style={{ width: 16, textAlign: 'center', color: 'var(--ink-4)', flexShrink: 0 }}>–</span>
      </div>
    )
  }

  return (
    <Link
      className="department-bar-row"
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-clickable="true"
      style={{
        ...rowStyle,
        cursor: 'pointer',
        background: hovered ? 'var(--surface)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      {inner}
      {/* Persistent drill-down affordance — chevron is always visible, accent on hover. */}
      <ChevronRight
        size={16}
        strokeWidth={2}
        aria-hidden
        style={{
          color: hovered ? 'var(--brand-active)' : 'var(--ink-4)',
          transform: hovered ? 'translateX(2px)' : 'none',
          transition: 'color 0.15s, transform 0.15s',
          flexShrink: 0,
        }}
      />
    </Link>
  )
}
