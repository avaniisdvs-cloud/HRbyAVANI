'use client'

import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'

interface MdmPageHeaderProps {
  titleEn:       string
  titleAr:       string
  icon:          LucideIcon
  totalCount:    number
  activeCount:   number
  inactiveCount: number
  onNew:         () => void
  newLabel?:     string
}

export function MdmPageHeader({
  titleEn,
  titleAr,
  icon: Icon,
  totalCount,
  activeCount,
  inactiveCount,
  onNew,
  newLabel,
}: MdmPageHeaderProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--accent-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={22} strokeWidth={1.75} style={{ color: 'var(--brand-active)' }} aria-hidden />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.3px',
                color: 'var(--ink-1)',
                margin: 0,
              }}>
                {titleEn}
              </h1>
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', direction: 'rtl', fontFamily: 'var(--font-sans)' }}>
                {titleAr}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onNew}
          style={{
            height: 36,
            padding: '0 16px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 'var(--text-body)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          {newLabel ?? `New ${titleEn}`}
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 20 }}>
        {[
          { label: 'Total',    value: totalCount,    color: 'var(--ink-2)' },
          { label: 'Active',   value: activeCount,   color: 'var(--brand-active)' },
          { label: 'Inactive', value: inactiveCount, color: 'var(--ink-4)' },
        ].map(stat => (
          <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: stat.color }}>
              {stat.value}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
