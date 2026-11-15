'use client'

import { Search, X } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

interface MdmFilterBarProps {
  search:          string
  onSearchChange:  (v: string) => void
  status:          StatusFilter
  onStatusChange:  (v: StatusFilter) => void
  entityId?:       string
  entities?:       { id: string; nameEn: string }[]
  onEntityChange?: (v: string) => void
  /** Additional filter controls rendered in the same row after entity select */
  extra?:          React.ReactNode
}

export function MdmFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  entityId,
  entities,
  onEntityChange,
  extra,
}: MdmFilterBarProps) {
  const locale = useLocale()
  const STATUS_LABELS: Record<StatusFilter, string> = {
    ALL:      locale === 'ar' ? 'الكل'    : 'All',
    ACTIVE:   locale === 'ar' ? 'نشط'     : 'Active',
    INACTIVE: locale === 'ar' ? 'غير نشط' : 'Inactive',
  }
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      marginBottom: 16,
      flexWrap: 'wrap',
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <Search
          size={15}
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--ink-4)', pointerEvents: 'none',
          }}
        />
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={locale === 'ar' ? 'بحث…' : 'Search…'}
          style={{
            width: '100%',
            height: 36,
            paddingLeft: 32,
            paddingRight: search ? 32 : 12,
            border: '1.5px solid var(--border)',
            borderRadius: 8,
            fontSize: 'var(--text-body)',
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-1)',
            background: 'var(--card)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-4)', padding: 2,
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 0, border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {(['ALL', 'ACTIVE', 'INACTIVE'] as StatusFilter[]).map((s, i) => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            style={{
              height: 36,
              padding: '0 12px',
              borderTopWidth: "0px",
              borderTopStyle: "none",
              borderTopColor: "currentColor",
              borderRightWidth: "0px",
              borderRightStyle: "none",
              borderRightColor: "currentColor",
              borderBottomWidth: "0px",
              borderBottomStyle: "none",
              borderBottomColor: "currentColor",
              borderLeftWidth: (i > 0) ? "1px" : "0px",
              borderLeftStyle: (i > 0) ? "solid" : "none",
              borderLeftColor: (i > 0) ? "var(--border)" : "currentColor",
              background: status === s ? 'var(--accent)' : 'var(--card)',
              color: status === s ? '#fff' : 'var(--ink-2)',
              fontSize: 'var(--text-caption)',
              fontWeight: status === s ? 600 : 400,
              cursor: 'pointer',
              transition: 'background 0.12s',
            }}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Entity filter (optional) */}
      {entities && entities.length > 0 && onEntityChange && (
        <select
          value={entityId ?? ''}
          onChange={e => onEntityChange(e.target.value)}
          style={{
            height: 36,
            padding: '0 10px',
            border: '1.5px solid var(--border)',
            borderRadius: 8,
            fontSize: 'var(--text-body)',
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-1)',
            background: 'var(--card)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">{locale === 'ar' ? 'كل الكيانات' : 'All entities'}</option>
          {entities.map(e => (
            <option key={e.id} value={e.id}>{e.nameEn}</option>
          ))}
        </select>
      )}

      {/* Extra controls (e.g. statutory toggle) rendered in-line */}
      {extra}
    </div>
  )
}
