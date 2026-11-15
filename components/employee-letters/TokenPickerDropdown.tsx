'use client'

import { useState, useRef } from 'react'
import { ChevronDown, Hash } from 'lucide-react'

interface Token {
  tokenKey: string
  labelEn:  string
  category: string
}

interface Props {
  tokens:      Token[]
  onInsert:    (token: string) => void
}

export function TokenPickerDropdown({ tokens, onInsert }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const categories = [...new Set(tokens.map(t => t.category))]
  const filtered   = tokens.filter(
    t => !search || t.tokenKey.includes(search.toLowerCase()) || t.labelEn.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--card)', padding: '5px 10px',
          fontSize: 'var(--text-caption)', cursor: 'pointer', color: 'var(--ink-2)',
        }}
      >
        <Hash size={13} />
        Insert token
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          width: 260, maxHeight: 320, overflowY: 'auto', zIndex: 100,
        }}>
          <div style={{ padding: 8 }}>
            <input
              autoFocus
              placeholder="Search tokens..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '5px 8px', fontSize: 'var(--text-caption)',
                border: '1px solid var(--border)', borderRadius: 5,
                background: 'var(--bg)', color: 'var(--ink-1)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {categories.map(cat => {
            const catTokens = filtered.filter(t => t.category === cat)
            if (catTokens.length === 0) return null
            return (
              <div key={cat}>
                <div style={{ padding: '4px 10px', fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                  {cat}
                </div>
                {catTokens.map(t => (
                  <button
                    key={t.tokenKey}
                    type="button"
                    onClick={() => { onInsert(`{{${t.tokenKey}}}`); setOpen(false); setSearch('') }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 12px', border: 'none', background: 'none',
                      cursor: 'pointer', fontSize: 'var(--text-caption)', color: 'var(--ink-1)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--brand-active)' }}>
                      {`{{${t.tokenKey}}}`}
                    </div>
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 1 }}>{t.labelEn}</div>
                  </button>
                ))}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ padding: '12px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'center' }}>
              No tokens found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
