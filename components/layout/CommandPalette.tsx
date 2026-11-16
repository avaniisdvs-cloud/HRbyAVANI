'use client'

/**
 * CommandPalette — ⌘K global command palette.
 *
 * Three result groups:
 *   Navigate — all non-comingSoon workspace nav items
 *   Settings — all non-comingSoon settings hub items
 *   Actions  — hardcoded common actions (always shown when no query)
 *
 * Keyboard: ↑↓ move, Enter navigate, Esc close, ⌘K toggle.
 * Phase 3 — replaces AdminTopbar's ⌘K → search-focus.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft } from 'lucide-react'
import { getVisibleWorkspaces } from '@/config/workspace-nav'
import { SETTINGS_HUB } from '@/config/settings-hub'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { Locale } from '@/lib/i18n'

// ── Flat result item ──────────────────────────────────────────────────────────

interface PaletteItem {
  id:    string
  label: string
  hint:  string
  route: string
  /** Stable group key (English) used for grouping/keys — never displayed raw. */
  group: string
}

// Display label for a group key, localized.
function groupLabel(group: string, locale: Locale | string): string {
  if (locale !== 'ar') return group
  switch (group) {
    case 'Navigate': return 'التنقل'
    case 'Settings': return 'الإعدادات'
    case 'Actions':  return 'إجراءات'
    default:         return group
  }
}

// ── Build searchable corpus — role-filtered ───────────────────────────────────

function buildCorpus(role: string, locale: Locale | string): PaletteItem[] {
  const ar = locale === 'ar'
  const items: PaletteItem[] = []

  // Workspace nav items — role + feature filtered (payroll hidden unless enabled)
  for (const ws of getVisibleWorkspaces(role)) {
    for (const group of ws.nav) {
      for (const item of group.items) {
        if (item.comingSoon) continue
        items.push({
          id:    `nav-${item.id}`,
          label: ar ? (item.labelAr || item.labelEn) : item.labelEn,
          hint:  ar ? (ws.labelAr || ws.labelEn) : ws.labelEn,
          route: item.route,
          group: 'Navigate',
        })
      }
    }
  }

  // Settings hub items
  for (const cat of SETTINGS_HUB) {
    for (const item of cat.items) {
      if (item.comingSoon) continue
      items.push({
        id:    `settings-${item.id}`,
        label: ar ? (item.labelAr || item.labelEn) : item.labelEn,
        hint:  ar ? (cat.labelAr || cat.labelEn) : cat.labelEn,
        route: item.route,
        group: 'Settings',
      })
    }
  }

  return items
}

interface ActionDef {
  id: string; labelEn: string; labelAr: string
  hintEn: string; hintAr: string; route: string
}

const ACTION_DEFS: ActionDef[] = [
  { id: 'action-new-employee', labelEn: 'Add new employee',       labelAr: 'إضافة موظف جديد',     hintEn: 'People',    hintAr: 'الأفراد',     route: '/persons/new' },
  { id: 'action-import',       labelEn: 'Import employees CSV',   labelAr: 'استيراد الموظفين CSV', hintEn: 'People',    hintAr: 'الأفراد',     route: '/persons/import' },
  { id: 'action-approvals',    labelEn: 'View pending approvals', labelAr: 'عرض الموافقات المعلّقة', hintEn: 'Overview',  hintAr: 'نظرة عامة',   route: '/approvals' },
  { id: 'action-letters',      labelEn: 'Generate employee letter', labelAr: 'إنشاء خطاب موظف',    hintEn: 'Documents', hintAr: 'المستندات',   route: '/employee-letters' },
]

function buildActions(locale: Locale | string): PaletteItem[] {
  const ar = locale === 'ar'
  return ACTION_DEFS.map(a => ({
    id:    a.id,
    label: ar ? a.labelAr : a.labelEn,
    hint:  ar ? a.hintAr : a.hintEn,
    route: a.route,
    group: 'Actions',
  }))
}

// ── Search ────────────────────────────────────────────────────────────────────

function search(query: string, corpus: PaletteItem[], actions: PaletteItem[]): PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...actions, ...corpus.slice(0, 8)]

  const matched = corpus.filter(
    item =>
      item.label.toLowerCase().includes(q) ||
      item.hint.toLowerCase().includes(q),
  )
  const actionMatched = actions.filter(
    item =>
      item.label.toLowerCase().includes(q) ||
      item.hint.toLowerCase().includes(q),
  )
  return [...actionMatched, ...matched].slice(0, 20)
}

// ── Group results ─────────────────────────────────────────────────────────────

function groupResults(items: PaletteItem[]): { label: string; items: PaletteItem[] }[] {
  const map = new Map<string, PaletteItem[]>()
  for (const item of items) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  role?: string
}

export function CommandPalette({ role = '' }: CommandPaletteProps) {
  const router   = useRouter()
  const locale   = useLocale()
  const inputRef = useRef<HTMLInputElement>(null)

  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const [cursor, setCursor] = useState(0)

  // Build corpus memoised by role + locale — filters superAdminOnly workspaces
  const corpus  = useMemo(() => buildCorpus(role, locale), [role, locale])
  const actions = useMemo(() => buildActions(locale), [locale])

  const results = useMemo(() => search(query, corpus, actions), [query, corpus, actions])
  const groups  = groupResults(results)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
  }, [])

  // ⌘K toggle + Esc close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => {
          if (prev) { setQuery(''); setCursor(0) }
          return !prev
        })
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  // Keyboard navigation within palette
  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[cursor]
      if (item) { router.push(item.route); close() }
    }
  }

  if (!open) return null

  // Compute flat index offset for cursor
  let flatIndex = 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position:       'fixed',
          inset:          0,
          zIndex:         50,
          background:     'rgba(13, 17, 23, 0.45)',
          backdropFilter: 'blur(2px)',
        }}
        aria-hidden
      />

      {/* Palette panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={locale === 'ar' ? 'لوحة الأوامر' : 'Command palette'}
        style={{
          position:     'fixed',
          top:          '10vh',
          left:         '50%',
          transform:    'translateX(-50%)',
          width:        640,
          maxWidth:     'calc(100vw - 32px)',
          maxHeight:    'calc(100vh - 80px)',
          zIndex:       51,
          background:   'var(--surface)',
          borderRadius: 14,
          border:       '1px solid var(--border)',
          boxShadow:    '0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow:     'hidden',
        }}
      >
        {/* Search input row */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          12,
          padding:      '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <Search size={18} strokeWidth={1.6} style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onInputKey}
            placeholder={locale === 'ar' ? 'ابحث في مساحات العمل والإعدادات والإجراءات…' : 'Search workspaces, settings, actions…'}
            style={{
              all:        'unset',
              flex:       1,
              fontSize:   'var(--text-body)',
              color:      'var(--ink-1)',
              fontFamily: 'inherit',
            }}
            aria-label={locale === 'ar' ? 'بحث لوحة الأوامر' : 'Command palette search'}
            autoComplete="off"
          />
          {results.length > 0 && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', flexShrink: 0 }}>
              {locale === 'ar'
                ? `${results.length} نتيجة`
                : `${results.length} result${results.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Results */}
        <div style={{ maxHeight: 'min(420px, calc(100vh - 220px))', overflowY: 'auto', padding: 6 }}>
          {results.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
              {locale === 'ar' ? `لا نتائج لـ «${query}»` : <>No results for &ldquo;{query}&rdquo;</>}
            </div>
          ) : (
            groups.map(group => {
              const groupStartIndex = flatIndex
              flatIndex += group.items.length
              return (
                <div key={group.label}>
                  <div style={{
                    fontSize:      'var(--text-caption)',
                    fontWeight:    600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color:         'var(--ink-3)',
                    padding:       '10px 12px 4px',
                  }}>
                    {groupLabel(group.label, locale)}
                  </div>
                  {group.items.map((item, ii) => {
                    const itemIndex = groupStartIndex + ii
                    const isActive  = itemIndex === cursor
                    return (
                      <button
                        key={item.id}
                        onClick={() => { router.push(item.route); close() }}
                        onMouseEnter={() => setCursor(itemIndex)}
                        style={{
                          all:           'unset',
                          display:       'flex',
                          alignItems:    'center',
                          gap:           10,
                          width:         '100%',
                          padding:       '8px 12px',
                          borderRadius:  7,
                          cursor:        'pointer',
                          background:    isActive ? 'var(--accent-050)' : 'transparent',
                          boxSizing:     'border-box',
                          transition:    'background 0.08s',
                        }}
                      >
                        {/* Icon chip */}
                        <span style={{
                          width:        26,
                          height:       26,
                          borderRadius: 6,
                          background:   'var(--card)',
                          border:       '1px solid var(--border)',
                          display:      'grid',
                          placeItems:   'center',
                          flexShrink:   0,
                          fontSize:     'var(--text-caption)',
                          fontWeight:   600,
                          color:        'var(--ink-2)',
                          fontFamily:   'var(--font-mono)',
                        }}>
                          {item.label.charAt(0).toUpperCase()}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize:     'var(--text-body)',
                            fontWeight:   isActive ? 600 : 500,
                            color:        'var(--ink-1)',
                            whiteSpace:   'nowrap',
                            overflow:     'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                            {item.hint}
                          </div>
                        </div>

                        {isActive && (
                          <CornerDownLeft size={13} strokeWidth={1.6} style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-hidden />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <footer style={{
          display:      'flex',
          gap:          16,
          alignItems:   'center',
          padding:      '8px 14px',
          borderTop:    '1px solid var(--border)',
          background:   'var(--surface)',
          fontSize:     'var(--text-caption)',
          color:        'var(--ink-3)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Kbd>↑</Kbd><Kbd>↓</Kbd> {locale === 'ar' ? 'تنقّل' : 'navigate'}
          </span>
          <span><Kbd>↵</Kbd> {locale === 'ar' ? 'فتح' : 'open'}</span>
          <span style={{ flex: 1 }} />
          <span><Kbd>esc</Kbd> {locale === 'ar' ? 'إغلاق' : 'close'}</span>
        </footer>
      </div>
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      fontFamily:   'var(--font-mono)',
      fontSize:     'var(--text-caption)',
      padding:      '2px 5px',
      borderRadius: 4,
      background:   'var(--card)',
      border:       '1px solid var(--border)',
      color:        'var(--ink-2)',
      display:      'inline-block',
    }}>
      {children}
    </kbd>
  )
}
