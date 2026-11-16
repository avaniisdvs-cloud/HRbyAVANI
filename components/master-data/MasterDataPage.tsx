import { PageTitle } from '@/components/ui/typography'
import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'
import Link from 'next/link'

/**
 * Reusable scaffold for Master Data list pages.
 * Each master data section renders this component configured for its entity.
 * As real CRUD is added per entity, replace the empty state with a data table.
 */

interface Column {
  label: string
  width?: string
}

interface MasterDataPageProps {
  title:       string
  titleAr:     string
  description: string
  icon:        LucideIcon
  color:       string
  addHref?:    string
  addLabel?:   string
  columns?:    Column[]
  children?:   React.ReactNode   // for future data table rows
  count?:      number
}

export function MasterDataPage({
  title,
  titleAr,
  description,
  icon:  Icon,
  color,
  addHref,
  addLabel = `Add ${title}`,
  columns,
  children,
  count,
}: MasterDataPageProps) {
  const defaultColumns: Column[] = columns ?? [
    { label: 'Name', width: '40%' },
    { label: 'Code' },
    { label: 'Status' },
    { label: 'Last updated' },
    { label: '', width: '80px' },
  ]

  const isEmpty = !children

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Colored icon badge */}
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: `${color}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={22} strokeWidth={1.75} style={{ color }} aria-hidden />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <PageTitle style={{
                fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500,
                letterSpacing: '-0.4px', color: 'var(--ink-1)', margin: 0,
              }}>
                {title}
              </PageTitle>
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', fontFamily: 'var(--font-arabic)', direction: 'rtl' }}>
                {titleAr}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
              {count != null
                ? `${count} ${count === 1 ? 'record' : 'records'} · ${description}`
                : description}
            </p>
          </div>
        </div>

        {addHref && (
          <Link
            href={addHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: color, color: "var(--on-accent)", flexShrink: 0,
              borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
              fontWeight: 600, textDecoration: 'none',
            }}
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            {addLabel}
          </Link>
        )}
      </div>

      {/* ── Table scaffold ───────────────────────────────────────── */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 10,
        overflow: 'hidden', background: 'var(--card)',
      }}>
        {/* Column headers */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px', height: 40,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          {defaultColumns.map((col, i) => (
            <div
              key={i}
              style={{
                flex: col.width ? `0 0 ${col.width}` : 1,
                fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: 'var(--ink-4)',
              }}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Rows / empty state */}
        {isEmpty ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '64px 24px', gap: 12,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: `${color}10`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={26} strokeWidth={1.5} style={{ color: `${color}80` }} aria-hidden />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)', margin: '0 0 4px' }}>
                No {title.toLowerCase()} configured yet
              </p>
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
                {addHref
                  ? `Add your first record using the "${addLabel}" button above.`
                  : 'This module is being configured — check back shortly.'}
              </p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
