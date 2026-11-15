'use client'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { SortDirection } from '@/hooks/useTableSort'

type Props = {
  label:           string
  column:          string
  activeColumn:    string | null
  direction:       SortDirection
  onSort:          (column: string) => void
  align?:          'left' | 'right'
  onResizeStart?:  (e: React.MouseEvent) => void
}

export function SortableHeader({
  label, column, activeColumn, direction, onSort, align = 'left', onResizeStart,
}: Props) {
  const isActive = activeColumn === column

  return (
    <th
      aria-sort={
        !isActive         ? 'none'
        : direction === 'asc'  ? 'ascending'
        : direction === 'desc' ? 'descending'
        : 'none'
      }
      style={{
        position: 'relative',
        cursor: 'pointer', userSelect: 'none',
        padding: '12px 20px', textAlign: align,
        fontSize: 'var(--text-caption)', fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        color: isActive ? 'var(--brand-active)' : 'var(--ink-3)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        whiteSpace: 'nowrap',
        transition: 'color 0.15s ease',
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)' }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--ink-3)' }}
    >
      <button type="button" onClick={() => onSort(column)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 0, padding: '4px 0', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer' }}>
        {label}
        <span style={{
          display: 'inline-flex', flexDirection: 'column',
          color: isActive ? 'var(--brand-active)' : 'var(--ink-4)',
          transition: 'color 0.15s ease',
        }}>
          {!isActive && direction === null && (
            <ChevronsUpDown size={13} strokeWidth={1.8} />
          )}
          {isActive && direction === 'asc' && (
            <ChevronUp size={13} strokeWidth={2.2} />
          )}
          {isActive && direction === 'desc' && (
            <ChevronDown size={13} strokeWidth={2.2} />
          )}
          {!isActive && direction !== null && (
            <ChevronsUpDown size={13} strokeWidth={1.8} />
          )}
        </span>
      </button>

      {onResizeStart && (
        <div
          onMouseDown={e => { e.stopPropagation(); onResizeStart(e) }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 6, cursor: 'col-resize', zIndex: 1,
            background: 'transparent',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-200)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        />
      )}
    </th>
  )
}
