'use client'

/**
 * WorkspaceRail — primary dark workspace navigation.
 *
 * Expanded: 208 px, shows icon + label + shortcut hint.
 * Compact:  60 px, shows icon only; toggle via ⌘\ or the collapse button.
 * Mode persists to localStorage per-role.
 *
 * Design ref: design/shell.jsx → Rail component
 * Phase 1 — shell scaffold (README §rollout step 1)
 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { pickLabel } from '@/lib/i18n'
import { getActiveWorkspaceId, getVisibleWorkspaces } from '@/config/workspace-nav'
import type { Workspace } from '@/config/workspace-nav'
import { SidebarUserCard } from '@/components/nav/SidebarUserCard'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the first live (non-comingSoon) route in a workspace, or '#'. */
function firstRoute(ws: Workspace): string {
  return ws.nav.flatMap(g => g.items).find(i => !i.comingSoon)?.route ?? ws.route ?? '#'
}

/** FIX 12 — role + feature filter (payroll workspace hidden unless enabled). */
function visibleWorkspaces(role: string): Workspace[] {
  return getVisibleWorkspaces(role)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RailItem({
  ws,
  isActive,
  isCompact,
  locale,
}: {
  ws: Workspace
  isActive: boolean
  isCompact: boolean
  locale: Locale
}) {
  const Icon  = ws.icon
  const label = pickLabel(ws, locale)
  const href  = firstRoute(ws)
  const isDeadLink = href === '#'

  // FIX 2 — render a <div> instead of <Link> when workspace is all-comingSoon
  const sharedStyle: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    gap:            10,
    padding:        isCompact ? '9px 0' : '7px 10px',
    borderRadius:   7,
    cursor:         isDeadLink ? 'default' : 'pointer',
    textDecoration: 'none',
    position:       'relative',
    justifyContent: isCompact ? 'center' : 'flex-start',
    background:     isActive ? 'var(--accent-050)' : 'transparent',
    color:          isActive ? 'var(--brand-active)' : 'var(--ink-2)',
    fontWeight:     isActive ? 600 : 400,
    boxShadow:      isActive && !isCompact ? 'inset 3px 0 0 var(--brand-active)' : undefined,
    transition:     'background 0.12s, color 0.12s',
    opacity:        isDeadLink ? 0.5 : 1,
  }

  const inner = (
    <>
      {/* Active notch (compact mode) */}
      {isActive && isCompact && (
        <span style={{
          position:     'absolute',
          left:         -6,
          top:          '50%',
          transform:    'translateY(-50%)',
          width:        3,
          height:       18,
          borderRadius: 3,
          background:   'var(--accent)',
          flexShrink:   0,
        }} />
      )}

      {/* Icon */}
      <Icon
        size={18}
        strokeWidth={isActive ? 2.1 : 1.65}
        aria-hidden
        style={{
          flexShrink: 0,
          color: isActive ? 'var(--brand-active)' : 'var(--ink-3)',
          transition: 'color 0.12s',
        }}
      />

      {/* Label + shortcut (expanded only) */}
      {!isCompact && (
        <>
          <span style={{
            flex:          1,
            fontSize:      'var(--text-body)',
            letterSpacing: '-0.003em',
            whiteSpace:    'nowrap',
            overflow:      'hidden',
            textOverflow:  'ellipsis',
          }}>
            {label}
          </span>
          {ws.shortcut && !isDeadLink && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   'var(--text-caption)',
              color:      'var(--ink-3)',
              opacity:    0.7,
              flexShrink: 0,
            }}>
              {ws.shortcut}
            </span>
          )}
          {isDeadLink && !isCompact && (
            <span style={{
              fontSize:      'var(--text-caption)',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color:         'var(--ink-3)',
              border:        '1px solid var(--border)',
              padding:       '1px 5px',
              borderRadius:  3,
              flexShrink:    0,
            }}>
              Soon
            </span>
          )}
        </>
      )}
    </>
  )

  if (isDeadLink) {
    return (
      <div
        title={`${label} ${locale === 'ar' ? '(قريباً)' : '(coming soon)'}`}
        aria-label={`${label} — ${locale === 'ar' ? 'قريباً' : 'coming soon'}`}
        style={sharedStyle}
      >
        {inner}
      </div>
    )
  }

  return (
    <Link
      href={href}
      title={label}
      aria-current={isActive ? 'page' : undefined}
      style={sharedStyle}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
          e.currentTarget.style.color = 'var(--ink-1)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--ink-2)'
        }
      }}
    >
      {inner}
    </Link>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface WorkspaceRailProps {
  role:            string
  locale?:         Locale
  userName?:       string
  initials?:       string
  photoUrl?:       string | null
  brandingLogoUrl?: string | null
}

export function WorkspaceRail({
  role,
  locale = 'en',
  userName = '',
  initials = '',
  photoUrl,
  brandingLogoUrl,
}: WorkspaceRailProps) {
  const pathname   = usePathname()
  const router     = useRouter()
  const workspaces = visibleWorkspaces(role)
  const activeId   = getActiveWorkspaceId(pathname, workspaces, role)

  // Expanded / compact mode — persisted to localStorage per-role
  const storageKey = `avaniis_rail_compact_${role}`
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) setIsCompact(saved === 'true')
    } catch { /* ignore */ }
  }, [storageKey])

  // Auto-compact below 1280 px
  useEffect(() => {
    function check() {
      if (window.innerWidth < 1280) setIsCompact(true)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // FIX 11 — ⌘\ toggle with [] dependency array (runs once on mount)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setIsCompact(prev => {
          const next = !prev
          try { localStorage.setItem(storageKey, String(next)) } catch { /* ignore */ }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [storageKey])

  // FIX 2 — ⌘1-⌘0 keyboard shortcut: skip navigation if workspace is all-comingSoon
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const num = parseInt(e.key, 10)
      if (isNaN(num)) return
      const idx = num === 0 ? 9 : num - 1
      const ws = workspaces[idx]
      if (!ws) return
      e.preventDefault()
      const dest = firstRoute(ws)
      if (dest === '#') return  // workspace has no live items — skip navigation
      router.push(dest)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workspaces, router])

  function toggle() {
    setIsCompact(prev => {
      const next = !prev
      try { localStorage.setItem(storageKey, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  const w = isCompact ? 60 : 208

  return (
    <aside className="workspace-rail"
      aria-label={locale === 'ar' ? 'تنقل مساحة العمل' : 'Workspace navigation'}
      style={{
        width:         w,
        flexShrink:    0,
        height:        '100vh',
        display:       'flex',
        flexDirection: 'column',
        background:    'var(--card)',
        borderRight:   '1px solid var(--border)',
        color:         'var(--ink-2)',
        transition:    'width 0.18s cubic-bezier(.2,.7,.3,1)',
        overflow:      'hidden',
        position:      'sticky',
        top:           0,
        zIndex:        20,
      }}
    >
      {/* ── Logo ─────────────────────────────────────────── */}
      <Link
        href="/dashboard"
        aria-label={locale === 'ar' ? 'أفانيس للموارد البشرية · الرئيسية' : 'AVANIIS HR · Home'}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: isCompact ? 'center' : 'flex-start',
          gap:            10,
          padding:        isCompact ? '14px 0' : '14px 12px 12px',
          borderBottom:   '1px solid var(--border)',
          textDecoration: 'none',
          flexShrink:     0,
        }}
      >
        {/* Brand logo only — no "K" monogram, no "Avaniis · Workspace" subtext. */}
        {brandingLogoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={brandingLogoUrl}
            alt="AVANIIS HR"
            style={{
              height:         isCompact ? 32 : 40,
              width:          isCompact ? 'auto' : '100%',
              maxWidth:       isCompact ? 44 : 184,
              objectFit:      'contain',
              objectPosition: isCompact ? 'center' : 'left',
            }}
          />
        ) : (
          <Image
            src="/avaniis-logo.png"
            height={isCompact ? 32 : 40}
            width={isCompact ? 32 : 40}
            alt="AVANIIS HR"
            style={{
              height:         isCompact ? 32 : 40,
              width:          'auto',
              maxWidth:       isCompact ? 44 : 184,
              objectFit:      'contain',
              objectPosition: isCompact ? 'center' : 'left',
            }}
            priority
          />
        )}
        {!isCompact && <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: 1 }}>AVANIIS</span>}
      </Link>

      {/* ── Workspace list ───────────────────────────────── */}
      <nav
        aria-label={locale === 'ar' ? 'مساحات العمل' : 'Workspaces'}
        style={{
          flex:          1,
          overflowY:     'auto',
          padding:       isCompact ? '8px 6px' : '8px 8px',
          display:       'flex',
          flexDirection: 'column',
          gap:           1,
        }}
      >
        {!isCompact && (
          <div style={{
            fontSize:      'var(--text-caption)',
            fontWeight:    600,
            color:         'var(--ink-3)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding:       '8px 10px 6px',
          }}>
            {/* FIX 18 — localized kicker */}
            {locale === 'ar' ? 'مساحات العمل' : 'Workspaces'}
          </div>
        )}

        {workspaces.map(ws => (
          <RailItem
            key={ws.id}
            ws={ws}
            isActive={activeId === ws.id}
            isCompact={isCompact}
            locale={locale}
          />
        ))}
      </nav>

      {/* ── Footer: collapse button + user ──────────────── */}
      <div style={{
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Collapse toggle */}
        <button
          onClick={toggle}
          title={isCompact ? 'Expand rail (⌘\\)' : 'Collapse rail (⌘\\)'}
          aria-label={isCompact ? 'Expand navigation' : 'Collapse navigation'}
          style={{
            all:            'unset',
            display:        'flex',
            alignItems:     'center',
            justifyContent: isCompact ? 'center' : 'flex-end',
            width:          '100%',
            padding:        isCompact ? '8px 0' : '6px 12px',
            cursor:         'pointer',
            color:          'var(--ink-3)',
            borderBottom:   '1px solid var(--border)',
            boxSizing:      'border-box',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink-2)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
        >
          {isCompact
            ? <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            : <ChevronLeft  size={14} strokeWidth={1.75} aria-hidden />
          }
        </button>

        {/* User identity + logout (shared footer block) */}
        <SidebarUserCard
          variant="light"
          compact={isCompact}
          withTopBorder={false}
          name={userName}
          role={role}
          initials={initials}
          photoUrl={photoUrl}
          locale={locale}
        />
      </div>
    </aside>
  )
}
