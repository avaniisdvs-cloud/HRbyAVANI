'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronRight, Search, X, Mic } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { pickLabel }    from '@/lib/i18n'
import { ADMIN_NAV }    from '@/config/admin-nav'
import { MANAGER_NAV }  from '@/config/manager-nav'
import { EMPLOYEE_NAV } from '@/config/employee-nav'
import type { NavConfig, NavGroup, NavItem } from '@/config/admin-nav'
import { SidebarUserCard } from '@/components/nav/SidebarUserCard'

/**
 * AdminSidebar — grouped, collapsible, searchable navigation.
 *
 * Design:
 *   • All groups collapsed on first visit; state persisted to localStorage.
 *   • Active group auto-expands on navigation.
 *   • Groups separated by 1 px dividers with colored left-bar when active.
 *   • Items connected by a subtle vertical rail line inside each open group.
 */

const ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']

function getNavConfig(role?: string): NavConfig {
  if (role === 'MANAGER')                       return MANAGER_NAV
  if (role && ADMIN_ROLES.includes(role)) {
    // SUPER_ADMIN sees all groups; other admin roles see non-superAdminOnly groups
    return role === 'SUPER_ADMIN'
      ? ADMIN_NAV
      : ADMIN_NAV.filter(g => !g.superAdminOnly)
  }
  if (role === 'EMPLOYEE')                      return EMPLOYEE_NAV
  return EMPLOYEE_NAV
}

// ── Active-state helpers ────────────────────────────────────────────────────

function isItemActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false
  const prefix = item.match ?? item.route
  if (prefix === '/dashboard') return pathname === '/dashboard'
  if (prefix === '/absence/my') {
    return pathname === '/absence/my' || pathname.startsWith('/absence/my/')
  }
  if (prefix === '/absence') {
    return (
      pathname === '/absence' ||
      (pathname.startsWith('/absence/') &&
        !pathname.startsWith('/absence/my') &&
        !pathname.startsWith('/absence/calendar') &&
        !pathname.startsWith('/absence/balances') &&
        !pathname.startsWith('/absence/rules'))
    )
  }
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

function isGroupActive(pathname: string | null, group: NavGroup): boolean {
  return group.items.some(item => isItemActive(pathname, item))
}

// ── Collapsed icon view (w-16) ──────────────────────────────────────────────

function CollapsedGroupIcon({ group, active, locale }: { group: NavGroup; active: boolean; locale: Locale }) {
  const Icon      = group.icon
  const firstItem = group.items.find(i => !i.comingSoon)
  const href      = firstItem?.route ?? '#'
  const label     = pickLabel(group, locale)

  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        borderRadius:   8,
        padding:        8,
        margin:         '2px 0',
        cursor:         firstItem ? 'pointer' : 'default',
        color:          active ? 'var(--brand-active)' : 'var(--ink-3)',
        background:     active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
        borderInlineStart: active ? '3px solid var(--accent)' : '3px solid transparent',
        transition:     'background 0.15s',
        textDecoration: 'none',
      }}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.75} aria-hidden />
    </Link>
  )
}

// ── Nav item link ────────────────────────────────────────────────────────────

function NavItemLink({
  item,
  group,
  locale,
  pathname,
  isLast,
}: {
  item:     NavItem
  group:    NavGroup
  locale:   Locale
  pathname: string | null
  isLast:   boolean
}) {
  const Icon   = item.icon
  const active = isItemActive(pathname, item)
  const label  = pickLabel(item, locale)

  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {/* Vertical rail + dot connector */}
      <div style={{
        width:       20,
        flexShrink:  0,
        display:     'flex',
        flexDirection: 'column',
        alignItems:  'center',
        paddingTop:  6,
      }}>
        {/* Vertical line */}
        <div style={{
          width:      1,
          flex:       1,
          background: isLast ? 'transparent' : 'var(--border)',
          marginTop:  0,
        }} />
        {/* Dot on the rail */}
        <div style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   active ? 'var(--accent)' : 'var(--border)',
          flexShrink:   0,
          marginTop:    -3,
          zIndex:       1,
          transition:   'background 0.15s',
        }} />
        {/* Bottom of rail */}
        <div style={{
          width:      1,
          flex:       1,
          background: isLast ? 'transparent' : 'var(--border)',
        }} />
      </div>

      {/* The actual link */}
      <Link
        href={item.comingSoon ? '#' : item.route}
        aria-current={active ? 'page' : undefined}
        aria-disabled={item.comingSoon}
        tabIndex={item.comingSoon ? -1 : undefined}
        title={label}
        style={{
          flex:           1,
          display:        'flex',
          alignItems:     'center',
          gap:            8,
          padding:        '5px 10px 5px 6px',
          margin:         '1px 0',
          borderRadius:   7,
          textDecoration: 'none',
          cursor:         item.comingSoon ? 'default' : 'pointer',
          opacity:        item.comingSoon ? 0.45 : 1,
          background:     active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
          color:          active ? 'var(--brand-active)' : 'var(--ink-2)',
          fontWeight:     active ? 600 : 400,
          transition:     'background 0.12s, color 0.12s',
          borderLeft:     active ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onMouseEnter={e => {
          if (!active && !item.comingSoon) {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
            e.currentTarget.style.color = 'var(--ink-1)'
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--ink-2)'
          }
        }}
      >
        <Icon size={14} strokeWidth={active ? 2.2 : 1.75} style={{ flexShrink: 0 }} aria-hidden />
        <span style={{ display: 'flex', flex: 1, flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
          {item.id === 'aria' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-body)' }}>
              {label}
              <Mic size={10} style={{ color: 'var(--brand-active)', opacity: 0.8, flexShrink: 0 }} aria-hidden />
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </span>
          )}
        </span>

        {/* Badges */}
        {item.isNew && (
          <span style={{
            fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'white', flexShrink: 0,
            background: 'var(--accent)', padding: '2px 5px', borderRadius: 4,
          }}>NEW</span>
        )}
        {item.comingSoon && (
          <span style={{
            fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--ink-4)', flexShrink: 0,
            border: '1px solid var(--border)', padding: '2px 5px', borderRadius: 4,
          }}>SOON</span>
        )}
        {item.badge != null && (
          <span style={{
            fontSize: 'var(--text-caption)', fontWeight: 600, color: 'white', flexShrink: 0,
            background: 'var(--accent)', minWidth: 18, textAlign: 'center',
            padding: '1px 5px', borderRadius: 20,
          }}>
            {item.badge}
          </span>
        )}
      </Link>
    </div>
  )
}

// ── Collapsible group section ────────────────────────────────────────────────

function NavGroupSection({
  group,
  locale,
  pathname,
  isOpen,
  onToggle,
  isFirst,
}: {
  group:    NavGroup
  locale:   Locale
  pathname: string | null
  isOpen:   boolean
  onToggle: () => void
  isFirst:  boolean
}) {
  const GroupIcon = group.icon
  const hasActive = isGroupActive(pathname, group)

  return (
    <>
      {/* Divider between groups (not before first) */}
      {!isFirst && (
        <div style={{
          height:     1,
          background: 'var(--border)',
          margin:     '3px 10px',
          opacity:    0.7,
        }} />
      )}

      <div>
        {/* Group header button */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            8,
            width:          '100%',
            padding:        '6px 10px 6px 8px',
            borderRadius:   8,
            borderTopWidth: "0px",
            borderTopStyle: "none",
            borderTopColor: "currentColor",
            borderRightWidth: "0px",
            borderRightStyle: "none",
            borderRightColor: "currentColor",
            borderBottomWidth: "0px",
            borderBottomStyle: "none",
            borderBottomColor: "currentColor",
            background:     hasActive && !isOpen
              ? 'color-mix(in srgb, var(--accent) 6%, transparent)'
              : 'transparent',
            cursor:         'pointer',
            textAlign:      'left',
            transition:     'background 0.12s',
            // Colored left bar when group has active item
            borderLeftWidth: "3px",
            borderLeftStyle: "solid",
            borderLeftColor: (hasActive) ? "var(--accent)" : "transparent",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = (hasActive && !isOpen) ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent'
          }}
        >
          {/* Group icon */}
          <GroupIcon
            size={13}
            strokeWidth={hasActive ? 2.2 : 1.75}
            style={{
              flexShrink: 0,
              color:      hasActive ? 'var(--brand-active)' : 'var(--ink-4)',
              transition: 'color 0.12s',
            }}
            aria-hidden
          />

          {/* Group label */}
          <span style={{
            flex:          1,
            fontSize:      'var(--text-caption)',
            fontWeight:    700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         group.id === 'ai-assistant'
              ? 'var(--brand-active)'
              : hasActive ? 'var(--brand-active)' : 'var(--ink-3)',
            transition:    'color 0.12s',
            fontFamily:    'var(--font-sans)',
          }}>
            {pickLabel(group, locale)}
          </span>

          {/* Chevron */}
          <ChevronRight
            size={12}
            style={{
              flexShrink:  0,
              color:       'var(--ink-4)',
              transform:   isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition:  'transform 0.2s ease',
            }}
            aria-hidden
          />
        </button>

        {/* Items — animated expand */}
        <div style={{
          overflow:   'hidden',
          maxHeight:  isOpen ? `${group.items.length * 54}px` : '0px',
          transition: 'max-height 0.22s ease-in-out',
        }}>
          <div style={{ padding: '2px 6px 4px 14px' }}>
            {group.items.map((item, idx) => (
              <NavItemLink
                key={item.id}
                item={item}
                group={group}
                locale={locale}
                pathname={pathname}
                isLast={idx === group.items.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface AdminSidebarProps {
  role?:            string
  locale?:          Locale
  userName?:        string
  initials?:        string
  photoUrl?:        string | null
  brandingLogoUrl?: string | null
}

export function AdminSidebar({ role, locale = 'en', userName = '', initials = '', photoUrl, brandingLogoUrl }: AdminSidebarProps = {}) {
  const pathname  = usePathname()
  const navConfig = getNavConfig(role)

  const [search, setSearch] = useState('')

  // v2 key — bumped so old "all-open" localStorage is ignored on first load.
  // All groups collapsed by default; only the group containing the current
  // page auto-opens. User's subsequent toggles are persisted under the v2 key.
  const storageKey    = `avaniis_nav_open_v2_${role ?? 'default'}`
  const oldStorageKey = `avaniis_nav_open_${role ?? 'default'}`

  // Initial state: open only the group that contains the current page
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {}
    navConfig.forEach(group => {
      defaults[group.id] = group.defaultOpen || isGroupActive(pathname, group)
    })
    return defaults
  })

  // Load persisted state from localStorage once on mount
  useEffect(() => {
    try {
      localStorage.removeItem(oldStorageKey)
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved: Record<string, boolean> = JSON.parse(raw)
        // Apply saved values; the pathname effect below will re-open the active group
        setOpenGroups(prev => ({ ...prev, ...saved }))
      }
    } catch { /* ignore corrupt storage */ }
  }, [storageKey, oldStorageKey])

  // Whenever the page changes, ensure the active group is open
  useEffect(() => {
    const activeGroup = navConfig.find(g => isGroupActive(pathname, g))
    if (!activeGroup) return
    setOpenGroups(prev => {
      if (prev[activeGroup.id]) return prev // already open — no re-render
      const next = { ...prev, [activeGroup.id]: true }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [pathname, navConfig, storageKey])

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const filteredGroups = search.trim()
    ? navConfig
        .map(group => ({
          ...group,
          items: group.items.filter(item =>
            item.labelEn.toLowerCase().includes(search.toLowerCase()) ||
            item.labelAr.includes(search),
          ),
        }))
        .filter(group => group.items.length > 0)
    : navConfig

  const collapsedItems = navConfig.map(group => ({
    group,
    active: isGroupActive(pathname, group),
  }))

  return (
    <aside
      aria-label={locale === 'ar' ? 'التنقل الإداري' : 'Admin navigation'}
      style={{
        position:    'sticky',
        top:         0,
        zIndex:      10,
        display:     'flex',
        flexDirection: 'column',
        height:      '100vh',
        width:       'clamp(64px, 16vw, 240px)',
        flexShrink:  0,
        borderInlineEnd: '1px solid var(--border)',
        background:  'var(--card)',
        transition:  'width 0.2s',
      }}
      className="role-sidebar w-16 lg:w-60"
    >
      {/* ── Brand logo ───────────────────────────────────────────── */}
      <Link
        href="/dashboard"
        aria-label={locale === 'ar' ? 'أفانيس للموارد البشرية · الرئيسية' : 'AVANIIS HR · Home'}
        style={{
          display:        'flex',
          height:         60,
          alignItems:     'center',
          justifyContent: 'center',
          borderBottom:   '1px solid var(--border)',
          padding:        '0 12px',
          textDecoration: 'none',
          flexShrink:     0,
        }}
        className="lg:justify-start"
      >
        {/* Collapsed (w-16): contained logo (no "K" monogram) */}
        <span className="lg:hidden">
          {brandingLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={brandingLogoUrl}
              alt="AVANIIS HR"
              style={{ height: 32, width: 'auto', maxWidth: 44, objectFit: 'contain' }}
            />
          ) : (
            <Image
              src="/avaniis-logo.jpg"
              height={32}
              width={32}
              alt="AVANIIS HR"
              style={{ height: 32, width: 'auto', maxWidth: 44, objectFit: 'contain' }}
              priority
            />
          )}
        </span>
        {/* Expanded (lg+): full logo at the Employee size (height 40) */}
        <span className="hidden lg:flex lg:items-center lg:gap-3">
          {brandingLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={brandingLogoUrl}
              alt="AVANIIS HR"
              style={{ height: 40, width: 'auto', maxWidth: 184, objectFit: 'contain' }}
            />
          ) : (
            <Image
              src="/avaniis-logo.jpg"
              height={40}
              width={40}
              alt="AVANIIS HR"
              style={{ height: 40, width: 'auto', maxWidth: 184, objectFit: 'contain' }}
              priority
            />
          )}
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: 1 }}>AVANIIS</span>
        </span>
      </Link>

      {/* ── Search bar (expanded only) ───────────────────────────── */}
      <div
        className="hidden lg:block"
        style={{
          borderBottom: '1px solid var(--border)',
          padding:      '10px 10px',
          flexShrink:   0,
        }}
      >
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            strokeWidth={1.75}
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }}
            aria-hidden
          />
          <input
            type="text"
            placeholder={locale === 'ar' ? 'بحث…' : 'Search…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label={locale === 'ar' ? 'البحث في التنقل' : 'Search navigation'}
            style={{
              width:        '100%',
              borderRadius: 8,
              border:       '1px solid var(--border)',
              background:   'var(--surface)',
              padding:      '6px 28px 6px 28px',
              fontSize:     'var(--text-caption)',
              color:        'var(--ink-1)',
              outline:      'none',
              boxSizing:    'border-box',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={locale === 'ar' ? 'مسح البحث' : 'Clear search'}
              style={{
                position:  'absolute',
                right:     8,
                top:       '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border:    'none',
                cursor:    'pointer',
                color:     'var(--ink-4)',
                padding:   0,
                display:   'flex',
              }}
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* ── Collapsed nav (icon-only, w-16) ─────────────────────── */}
      <nav
        className="flex flex-col overflow-y-auto p-2 lg:hidden"
        style={{ flex: 1 }}
        aria-label={locale === 'ar' ? 'مجموعات التنقل' : 'Navigation groups'}
      >
        {collapsedItems.map(({ group, active }) => (
          <CollapsedGroupIcon key={group.id} group={group} active={active} locale={locale} />
        ))}
      </nav>

      {/* ── Expanded nav (lg+) ──────────────────────────────────── */}
      <nav
        className="hidden lg:flex flex-col overflow-y-auto"
        style={{ flex: 1, padding: '8px 6px', gap: 0 }}
        aria-label={locale === 'ar' ? 'التنقل' : 'Navigation'}
      >
        {search.trim() && filteredGroups.length === 0 && (
          <p style={{ textAlign: 'center', padding: '16px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
            No results
          </p>
        )}
        {filteredGroups.map((group, idx) => (
          <NavGroupSection
            key={group.id}
            group={group}
            locale={locale}
            pathname={pathname}
            isOpen={search.trim() ? true : (openGroups[group.id] ?? group.defaultOpen ?? false)}
            onToggle={() => toggleGroup(group.id)}
            isFirst={idx === 0}
          />
        ))}
      </nav>

      {/* ── User footer (shared identity + logout block) ─────────────── */}
      {/* Wrappers control responsive visibility (display:none beats the card's
          inline display). Collapsed (w-16) below lg → icon-only; lg+ → full. */}
      <div className="lg:hidden" style={{ flexShrink: 0 }}>
        <SidebarUserCard
          variant="light"
          compact
          name={userName}
          role={role ?? ''}
          initials={initials}
          photoUrl={photoUrl}
          locale={locale}
        />
      </div>
      <div className="hidden lg:block" style={{ flexShrink: 0 }}>
        <SidebarUserCard
          variant="light"
          name={userName}
          role={role ?? ''}
          initials={initials}
          photoUrl={photoUrl}
          locale={locale}
        />
      </div>
    </aside>
  )
}
