'use client'

/**
 * PersonSelect — a searchable single-select for picking an employee/person.
 *
 * Stores and emits the person id only (never display text). Designed to be fed
 * a pre-loaded, server-scoped options array (active candidates), so search is a
 * fast client-side filter. Accepts an optional `valueLabel` fallback so an
 * already-saved value that is NOT in the current options list (e.g. a head who
 * has since become inactive) still renders correctly on edit — preventing a
 * silent wipe of the saved value.
 *
 * Rendered in-container (no body portal) so it stays inside the MdmDrawer focus
 * trap. Mirrors the interaction model of NationalitySelect.
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { Search, Check, ChevronDown } from 'lucide-react'

export interface PersonOption {
  id:            string
  label:         string          // e.g. "Dorab Kethari — AVN-000123"
  sublabel?:     string          // e.g. job title / department
  legalEntityId?: string | null
}

export interface PersonSelectProps {
  value:        string | null
  valueLabel?:  string | null    // fallback label when value is not in options
  options:      PersonOption[]
  onChange:     (id: string) => void
  placeholder?: string
  error?:       string
  required?:    boolean
  disabled?:    boolean
  id?:          string
  // Optional label overrides so this generic id/label/sublabel select can be
  // reused for non-person entities (e.g. approval groups). Default to the
  // person-oriented wording for backward compatibility.
  searchPlaceholder?: string
  emptyText?:         string                  // shown when there are no options at all
  noMatchText?:       (query: string) => string // shown when the query matches nothing
}

function filterOptions(options: PersonOption[], query: string): PersonOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(o =>
    o.label.toLowerCase().includes(q) ||
    (o.sublabel?.toLowerCase().includes(q) ?? false),
  )
}

export function PersonSelect({
  value, valueLabel, options, onChange, placeholder, error, required, disabled, id,
  searchPlaceholder, emptyText, noMatchText,
}: PersonSelectProps) {
  const [open, setOpen]               = useState(false)
  const [query, setQuery]             = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLDivElement>(null)

  const selected = value ? options.find(o => o.id === value) ?? null : null
  const selectedLabel = selected?.label ?? (value ? valueLabel ?? null : null)

  const list = filterOptions(options, query)

  const openDropdown = useCallback(() => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setHighlighted(0)
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [disabled])

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const selectOption = useCallback((o: PersonOption) => {
    onChange(o.id)
    closeDropdown()
  }, [onChange, closeDropdown])

  // Outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, closeDropdown])

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      openDropdown()
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (list[highlighted]) selectOption(list[highlighted])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
    } else if (e.key === 'Tab') {
      closeDropdown()
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    const rows = listRef.current.querySelectorAll<HTMLDivElement>('[data-row]')
    rows[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const triggerBorder = error
    ? '1.5px solid #C62828'
    : open
    ? '1.5px solid var(--accent)'
    : '1.5px solid var(--border)'

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width:       '100%',
          height:      42,
          display:     'flex',
          alignItems:  'center',
          gap:         8,
          padding:     '0 12px',
          background:  'var(--card)',
          border:      triggerBorder,
          borderRadius: 8,
          cursor:      disabled ? 'not-allowed' : 'pointer',
          opacity:     disabled ? 0.6 : 1,
          outline:     'none',
          textAlign:   'left',
        }}
      >
        {selectedLabel ? (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', flex: 1, fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedLabel}
          </span>
        ) : (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', flex: 1, fontFamily: 'var(--font-sans)' }}>
            {placeholder ?? (required ? 'Search employee…' : 'Select employee…')}
          </span>
        )}
        <ChevronDown
          size={14}
          style={{
            color: 'var(--ink-4)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms',
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position:     'absolute',
            top:          'calc(100% + 4px)',
            left:         0,
            right:        0,
            background:   'var(--card)',
            border:       '1px solid var(--border)',
            borderRadius: 10,
            boxShadow:    '0 8px 32px rgba(0,0,0,0.12)',
            zIndex:       100,
            overflow:     'hidden',
            maxHeight:    320,
            display:      'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{
            padding:      '10px 12px',
            borderBottom: '1px solid var(--border)',
            background:   'var(--surface)',
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            flexShrink:   0,
          }}>
            <Search size={14} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder ?? 'Type a name or employee number…'}
              style={{
                flex:       1,
                border:     'none',
                outline:    'none',
                background: 'transparent',
                font:       '13px var(--font-sans)',
                color:      'var(--ink-1)',
              }}
            />
          </div>

          <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
            {list.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
                {options.length === 0
                  ? (emptyText ?? 'No active employees available')
                  : (noMatchText ? noMatchText(query) : `No employees match “${query}”`)}
              </div>
            ) : (
              list.map((o, idx) => (
                <PersonRow
                  key={o.id}
                  option={o}
                  isSelected={o.id === value}
                  isHighlighted={idx === highlighted}
                  onSelect={selectOption}
                  dataIndex={idx}
                />
              ))
            )}
          </div>
        </div>
      )}

      {error && (
        <p style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: '#C62828' }}>{error}</p>
      )}
    </div>
  )
}

interface RowProps {
  option:        PersonOption
  isSelected:    boolean
  isHighlighted: boolean
  onSelect:      (o: PersonOption) => void
  dataIndex:     number
}

function PersonRow({ option, isSelected, isHighlighted, onSelect, dataIndex }: RowProps) {
  const bg = isSelected
    ? 'var(--accent-050)'
    : isHighlighted
    ? 'var(--surface)'
    : 'transparent'

  return (
    <div
      data-row={dataIndex}
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(option)}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        padding:    '9px 12px',
        cursor:     'pointer',
        background: bg,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)' }}
      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--accent-050)' : 'transparent' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-body)',
          color:    isSelected ? 'var(--brand-active)' : 'var(--ink-1)',
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {option.label}
        </div>
        {option.sublabel && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {option.sublabel}
          </div>
        )}
      </div>
      {isSelected && <Check size={14} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />}
    </div>
  )
}
