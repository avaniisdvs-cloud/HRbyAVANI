'use client'

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { Search, Check, ChevronDown } from 'lucide-react'
import { PINNED_COUNTRIES, REST_COUNTRIES, getCountryByCode, type Country } from '@/lib/data/countries'

export interface NationalitySelectProps {
  value:     string | null         // ISO-3 code e.g. "ARE"
  onChange:  (code: string) => void
  error?:    string
  required?: boolean
  disabled?: boolean
  id?:       string
}

const GCC_CODES = new Set(['SAU', 'KWT', 'QAT', 'BHR', 'OMN'])

function filterCountries(countries: Country[], query: string): Country[] {
  const q = query.toLowerCase()
  return countries.filter(c =>
    c.nameEn.toLowerCase().includes(q) ||
    c.code.toLowerCase().startsWith(q) ||
    c.nameAr.includes(query),
  )
}

export function NationalitySelect({
  value, onChange, error, required, disabled, id,
}: NationalitySelectProps) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const containerRef  = useRef<HTMLDivElement>(null)
  const searchRef     = useRef<HTMLInputElement>(null)
  const listRef       = useRef<HTMLDivElement>(null)

  const selected = value ? getCountryByCode(value) : null

  // Visible list when searching — collapse sections into one flat list
  const searching = query.length > 0
  const visiblePinned = searching ? [] : PINNED_COUNTRIES
  const visibleRest   = searching
    ? filterCountries([...PINNED_COUNTRIES, ...REST_COUNTRIES], query)
    : REST_COUNTRIES
  const flatList: Country[] = searching ? visibleRest : [...visiblePinned, ...visibleRest]

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

  const selectCountry = useCallback((country: Country) => {
    onChange(country.code)
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

  // Keyboard navigation on the trigger
  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      openDropdown()
    }
  }

  // Keyboard navigation inside dropdown
  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatList[highlighted]) selectCountry(flatList[highlighted])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
    } else if (e.key === 'Tab') {
      closeDropdown()
    }
  }

  // Scroll highlighted row into view
  useEffect(() => {
    if (!listRef.current) return
    const rows = listRef.current.querySelectorAll<HTMLDivElement>('[data-row]')
    rows[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const triggerBorder = error
    ? '1px solid #B33A3A'
    : open
    ? '1px solid var(--accent)'
    : '1px solid var(--border)'

  const triggerShadow = error
    ? '0 0 0 3px rgba(179,58,58,0.15)'
    : open
    ? '0 0 0 3px var(--accent-100)'
    : 'none'

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          background: 'var(--card)',
          border: triggerBorder,
          borderRadius: 7,
          boxShadow: triggerShadow,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 120ms, box-shadow 120ms',
          outline: 'none',
          textAlign: 'left',
        }}
      >
        {selected ? (
          <>
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{selected.flag}</span>
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', flex: 1, fontFamily: 'var(--font-sans)' }}>
              {selected.nameEn}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {selected.code}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', flex: 1, fontFamily: 'var(--font-sans)' }}>
            {required ? 'Select nationality…' : 'Select country…'}
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

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 100,
            overflow: 'hidden',
            maxHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 150ms ease',
          }}
        >
          {/* Search */}
          <div style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}>
            <Search size={14} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
              onKeyDown={onSearchKeyDown}
              placeholder="Type to search countries…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                font: '13px var(--font-sans)',
                color: 'var(--ink-1)',
              }}
            />
          </div>

          {/* Country list */}
          <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
            {!searching && visiblePinned.length > 0 && (
              <>
                <div style={{
                  padding: '6px 12px 2px',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 700,
                  color: 'var(--ink-4)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                }}>
                  Common
                </div>
                {visiblePinned.map((country, idx) => (
                  <CountryRow
                    key={country.code}
                    country={country}
                    isSelected={country.code === value}
                    isHighlighted={idx === highlighted}
                    onSelect={selectCountry}
                    dataIndex={idx}
                  />
                ))}
                <div style={{
                  padding: '6px 12px 2px',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 700,
                  color: 'var(--ink-4)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  borderTop: '1px solid var(--border)',
                  marginTop: 2,
                }}>
                  All Countries
                </div>
              </>
            )}

            {flatList.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
                No countries found for &ldquo;{query}&rdquo;
              </div>
            ) : (
              (searching ? flatList : visibleRest).map((country, idx) => {
                const absIdx = searching ? idx : visiblePinned.length + idx
                return (
                  <CountryRow
                    key={country.code}
                    country={country}
                    isSelected={country.code === value}
                    isHighlighted={absIdx === highlighted}
                    onSelect={selectCountry}
                    dataIndex={absIdx}
                  />
                )
              })
            )}
          </div>
        </div>
      )}

      {error && (
        <p style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: '#B33A3A' }}>{error}</p>
      )}
    </div>
  )
}

// ── Country Row ───────────────────────────────────────────────────────────────

interface RowProps {
  country:       Country
  isSelected:    boolean
  isHighlighted: boolean
  onSelect:      (c: Country) => void
  dataIndex:     number
}

function CountryRow({ country, isSelected, isHighlighted, onSelect, dataIndex }: RowProps) {
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
      onClick={() => onSelect(country)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        cursor: 'pointer',
        background: bg,
        transition: 'background 100ms',
      }}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = isSelected ? 'var(--accent-050)' : 'transparent'
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{country.flag}</span>
      <span style={{
        fontSize: 'var(--text-body)',
        color: isSelected ? 'var(--brand-active)' : 'var(--ink-1)',
        flex: 1,
        fontFamily: 'var(--font-sans)',
      }}>
        {country.nameEn}
      </span>
      <span style={{
        fontSize: 'var(--text-caption)',
        color: isSelected ? 'var(--brand-active)' : 'var(--ink-4)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        marginLeft: 'auto',
      }}>
        {country.code}
      </span>
      {isSelected && (
        <Check size={14} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
      )}
    </div>
  )
}

/**
 * Derives the nationalityCategory from an ISO-3 code.
 * ARE → UAE_NATIONAL | GCC → GCC_NATIONAL | else → EXPAT
 */
export function deriveNationalityCategory(
  code: string,
): 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT' {
  if (code === 'ARE') return 'UAE_NATIONAL'
  if (GCC_CODES.has(code)) return 'GCC_NATIONAL'
  return 'EXPAT'
}
