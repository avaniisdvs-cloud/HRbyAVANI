'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronDown } from 'lucide-react'
import { LocaleSwitcher } from '@/components/forms/LocaleSwitcher'
import { NotificationBell } from '@/components/topbar/NotificationBell'
import { ProfileMenu } from '@/components/topbar/ProfileMenu'
import type { Locale } from '@/lib/i18n'
import type { SearchResult } from '@/app/api/search/route'

type RouteEntry = { en: string; ar: string }
const ROUTE_LABELS: Record<string, RouteEntry> = {
  '/me':         { en: 'Home',           ar: 'الرئيسية' },
  '/absence':    { en: 'My Leave',       ar: 'إجازتي' },
  '/timesheet':  { en: 'Timesheet',      ar: 'جدول الدوام' },
  '/directory':  { en: 'Directory',      ar: 'الدليل' },
  '/me/profile': { en: 'My Profile',     ar: 'ملفي الشخصي' },
  '/me/aria':    { en: 'ARIA Assistant', ar: 'مساعد ARIA' },
}

interface Props {
  userName:     string
  userRole:     string
  initials:     string
  avatarColor?: string
  locale:       Locale
  personId?:    string
  tenantId?:    string
  ssoProvider?: string
  photoUrl?:    string | null
}

export function EmployeeTopbar({ userName, userRole, initials, locale, personId, tenantId = '', ssoProvider, photoUrl }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const isHome   = pathname === '/me'

  // ── Search state ─────────────────────────────────────────────────────────────
  const searchRef       = useRef<HTMLInputElement>(null)
  const searchWrapRef   = useRef<HTMLDivElement>(null)
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  // ── Profile menu ──────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false)

  // ── ⌘K global shortcut ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Close dropdown on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!searchOpen) return
    function onClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [searchOpen])

  // ── Debounced fetch ───────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([])
      setSearchOpen(false)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: 'same-origin' })
      const data = await res.json() as SearchResult[]
      setSearchResults(Array.isArray(data) ? data : [])
      setSearchOpen(true)
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setSearchResults([]); setSearchOpen(false); return }
    debounceRef.current = setTimeout(() => void runSearch(value), 300)
  }

  function handleClearSearch() {
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)
    searchRef.current?.focus()
  }

  function handleResultClick(result: SearchResult) {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    // Employees navigate to the directory — deep-linking to a person's public profile
    router.push(`/directory/${result.id}`)
  }

  // ── Route label ───────────────────────────────────────────────────────────────
  const exactEntry = ROUTE_LABELS[pathname]
  const entry = exactEntry ?? (
    Object.entries(ROUTE_LABELS).find(([k]) => pathname.startsWith(k + '/'))?.[1]
  ) ?? { en: 'Home', ar: 'الرئيسية' }
  const primaryLabel   = locale === 'ar' ? entry.ar : entry.en
  const secondaryLabel = locale === 'ar' ? entry.en : entry.ar
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()

  function handleBack() {
    if (window.history.length > 1) router.back()
    else router.push('/me')
  }

  return (
    <header className="app-topbar" style={{
      height: 56, flexShrink: 0,
      background: 'var(--card)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
    }}>
      {/* Left: back button + org icon + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {!isHome && (
          <button
            onClick={handleBack}
            title={locale === 'ar' ? 'رجوع' : 'Go back'}
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              color: 'var(--ink-3)', flexShrink: 0,
              transition: 'background 120ms, color 120ms',
            }}
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
        )}
        <div style={{ color: 'var(--ink-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="5" rx="1"/>
            <rect x="2" y="16" width="6" height="5" rx="1"/>
            <rect x="9" y="16" width="6" height="5" rx="1"/>
            <rect x="16" y="16" width="6" height="5" rx="1"/>
            <path d="M12 8v3M5 16v-2h14v2M12 11v5"/>
          </svg>
        </div>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{
            fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
            fontFamily: 'var(--font-sans)', letterSpacing: '-0.1px', lineHeight: 1.15,
          }}>
            {primaryLabel}
          </span>
          <span style={{
            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', lineHeight: 1.2,
            fontFamily: 'var(--font-sans)',
          }} dir={locale === 'ar' ? 'ltr' : 'rtl'} lang={locale === 'ar' ? 'en' : 'ar'}>
            {secondaryLabel}
          </span>
        </span>
      </div>

      {/* Centre: search */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div ref={searchWrapRef} style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
          <div
            onClick={() => searchRef.current?.focus()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface)',
              border: `1px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '7px 12px',
              cursor: 'text', transition: 'border-color 0.15s',
            }}
          >
            <svg
              width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--ink-4)', flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => {
                setSearchFocused(true)
                if (searchResults.length > 0) setSearchOpen(true)
              }}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={e => {
                if (e.key === 'Escape') { handleClearSearch(); e.currentTarget.blur() }
              }}
              placeholder="Search people, employees…"
              autoComplete="off"
              style={{
                flex: 1, fontSize: 'var(--text-body)', color: 'var(--ink-1)',
                background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {searchLoading && (
              <div style={{
                width: 14, height: 14,
                borderTopWidth: "2px",
                borderTopStyle: "solid",
                borderRightWidth: "2px",
                borderRightStyle: "solid",
                borderRightColor: "var(--border)",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: "var(--border)",
                borderLeftWidth: "2px",
                borderLeftStyle: "solid",
                borderLeftColor: "var(--border)",
                borderTopColor: 'var(--accent)', borderRadius: '50%',
                flexShrink: 0, animation: 'spin 0.6s linear infinite',
              }} />
            )}
            {searchQuery && !searchLoading && (
              <button
                onClick={handleClearSearch}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--ink-4)', display: 'flex', alignItems: 'center', flexShrink: 0,
                }}
                aria-label={locale === 'ar' ? 'مسح البحث' : 'Clear search'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            {!searchQuery && (
              <kbd style={{
                fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-4)',
                background: 'var(--border)', padding: '1px 5px',
                borderRadius: 4, flexShrink: 0, fontFamily: 'var(--font-mono)',
              }}>⌘K</kbd>
            )}
          </div>

          {/* Results dropdown */}
          {searchOpen && (
            <div style={{
              position:     'absolute',
              top:          '100%',
              left:         0,
              right:        0,
              marginTop:    4,
              background:   'var(--card)',
              border:       '1px solid var(--border)',
              borderRadius: 8,
              boxShadow:    '0 4px 20px rgba(0,0,0,0.13)',
              zIndex:       200,
              overflow:     'hidden',
            }}>
              {searchResults.length === 0 ? (
                <div style={{
                  padding: '12px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-3)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  No results for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                searchResults.map(result => (
                  <button
                    key={result.id}
                    onMouseDown={e => { e.preventDefault(); handleResultClick(result) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', background: 'none',
                      borderTopWidth: "0px",
                      borderTopStyle: "none",
                      borderTopColor: "currentColor",
                      borderRightWidth: "0px",
                      borderRightStyle: "none",
                      borderRightColor: "currentColor",
                      borderLeftWidth: "0px",
                      borderLeftStyle: "none",
                      borderLeftColor: "currentColor",
                      borderBottomWidth: "1px",
                      borderBottomStyle: "solid",
                      borderBottomColor: "var(--border)", cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--accent-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--brand-active)',
                      flexShrink: 0, overflow: 'hidden',
                    }}>
                      {result.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={result.photoUrl} alt="" width={32} height={32} style={{ objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        result.nameEn.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
                      )}
                    </div>
                    {/* Text */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
                        fontFamily: 'var(--font-sans)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {result.nameEn}
                      </div>
                      <div style={{
                        fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                        fontFamily: 'var(--font-sans)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {result.jobTitleEn ?? result.personNumber ?? ''}
                      </div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-4)', flexShrink: 0 }}>
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: bell + locale switcher + divider + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {personId && (
          <NotificationBell
            initialCount={0}
            personId={personId}
            tenantId={tenantId}
          />
        )}

        <LocaleSwitcher current={locale} />

        <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

        {/* User button */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={locale === 'ar' ? 'قائمة المستخدم' : 'User menu'}
            aria-expanded={menuOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '4px 6px', borderRadius: 8,
              transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                aria-hidden
                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--accent)', color: 'var(--card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-caption)', fontWeight: 700, fontFamily: 'var(--font-sans)',
              }}>
                {initials}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.2 }}>{userName}</span>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', letterSpacing: '0.02em', lineHeight: 1.2 }}>{roleLabel}</span>
            </div>
            <ChevronDown
              size={13}
              style={{
                color: 'var(--ink-4)',
                transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                flexShrink: 0,
              }}
            />
          </button>

          {menuOpen && (
            <ProfileMenu
              userName={userName}
              userRole={userRole}
              initials={initials}
              personId={personId}
              isEmployee={true}
              ssoProvider={ssoProvider}
              photoUrl={photoUrl}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </header>
  )
}
