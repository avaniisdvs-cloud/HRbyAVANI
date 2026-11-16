'use client'

/**
 * WorkspaceSecondaryNav — contextual 232 px secondary navigation panel.
 *
 * Shows the child items for whichever workspace is currently active,
 * derived from the pathname. No props required; all state comes from
 * usePathname() + WORKSPACE_NAV config.
 *
 * Design ref: design/shell.jsx → SecondaryNav component
 * Phase 1 — shell scaffold (README §rollout step 1)
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { pickLabel } from '@/lib/i18n'
import {
  getActiveWorkspaceId,
  getVisibleWorkspaces,
} from '@/config/workspace-nav'
import type { WorkspaceItem } from '@/config/workspace-nav'

// Workspaces whose secondary-nav panel is suppressed to keep navigation ≤ 2
// levels — either destination landings with their own in-page selector
// ('admin', 'reports') or single-function workspaces ('ai', 'documents',
// 'dataops'). The rail opens each workspace's page directly.
const SUPPRESS_SECONDARY_NAV = new Set(['admin', 'ai', 'reports', 'documents', 'dataops', 'migration'])

// ── Active item helper ────────────────────────────────────────────────────────

export function isItemActive(pathname: string, item: WorkspaceItem): boolean {
  if (item.comingSoon) return false
  const prefix = item.match ?? item.route
  if (prefix === '/dashboard') return pathname === '/dashboard'
  if (prefix === '/absence') {
    // /absence itself but not sub-paths owned by other items
    return (
      pathname === '/absence' ||
      (pathname.startsWith('/absence/') &&
        !pathname.startsWith('/absence/balances') &&
        !pathname.startsWith('/absence/calendar') &&
        !pathname.startsWith('/absence/my') &&
        !pathname.startsWith('/absence/rules'))
    )
  }
  if (prefix === '/timesheets') {
    // /timesheets itself but not /timesheets/team (owns its own item)
    return pathname === '/timesheets' || (
      pathname.startsWith('/timesheets/') &&
      !pathname.startsWith('/timesheets/team')
    )
  }
  if (prefix === '/configuration/workflows') {
    // workflow builder but not sub-routes owned by their own items
    return (
      pathname === '/configuration/workflows' ||
      (pathname.startsWith('/configuration/workflows/') &&
        !pathname.startsWith('/configuration/workflows/groups') &&
        !pathname.startsWith('/configuration/workflows/delegations'))
    )
  }
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

// ── Main component ────────────────────────────────────────────────────────────

interface WorkspaceSecondaryNavProps {
  role?:   string
  locale?: Locale
}

export function WorkspaceSecondaryNav({
  role   = '',
  locale = 'en',
}: WorkspaceSecondaryNavProps) {
  const pathname = usePathname()

  const allWorkspaces = getVisibleWorkspaces(role)

  const activeId = getActiveWorkspaceId(pathname, allWorkspaces, role)
  // FIX 7 — fallback to 'overview' workspace so the shell always shows some secondary nav
  const found = allWorkspaces.find(w => w.id === activeId)
  const workspace = found ?? allWorkspaces.find(w => w.id === 'overview') ?? null

  if (!workspace) return null

  // Suppress the intermediate secondary-nav panel for workspaces that would
  // otherwise create a 3rd level — so the rail opens the workspace's page
  // directly (max 2 levels). Two categories:
  //   • Destination landings whose page provides its own L2 selector:
  //       'admin'   → HR Configuration grouped landing
  //       'reports' → /reports has its own role-filtered report left-nav
  //   • Single-function workspaces (the lone secondary-nav item was redundant):
  //       'ai'        → /aria
  //       'documents' → /employee-letters
  //       'dataops'   → /admin/dataops (Super Admin)
  // The rail's firstRoute already targets the correct page; pages/routes/RBAC
  // are untouched. Every other workspace keeps its secondary nav.
  if (SUPPRESS_SECONDARY_NAV.has(workspace.id)) return null

  const WorkspaceIcon = workspace.icon
  const wsLabel = pickLabel(workspace, locale)

  return (
    <nav className="workspace-secondary-nav"
      aria-label={`${wsLabel} navigation`}
      style={{
        width:         232,
        flexShrink:    0,
        height:        '100vh',
        display:       'flex',
        flexDirection: 'column',
        background:    'var(--surface)',
        borderRight:   '1px solid var(--border)',
        fontSize:      'var(--text-body)',
        position:      'sticky',
        top:           0,
        zIndex:        15,
        overflow:      'hidden',
      }}
    >
      {/* ── Workspace header ─────────────────────────────── */}
      <div style={{
        padding:    '16px 16px 12px',
        display:    'flex',
        alignItems: 'center',
        gap:        9,
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          width:        26,
          height:       26,
          borderRadius: 6,
          background:   'var(--card)',
          border:       '1px solid var(--border)',
          display:      'grid',
          placeItems:   'center',
          color:        'var(--ink-2)',
          flexShrink:   0,
        }}>
          <WorkspaceIcon size={14} strokeWidth={1.75} aria-hidden />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
          <span style={{
            fontSize:    'var(--text-body)',
            fontWeight:  600,
            color:       'var(--ink-1)',
            letterSpacing: '-0.005em',
            whiteSpace:  'nowrap',
            overflow:    'hidden',
            textOverflow:'ellipsis',
          }}>
            {wsLabel}
          </span>
          <span style={{
            fontSize:      'var(--text-caption)',
            color:         'var(--ink-4)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {/* FIX 18 — localized "WORKSPACE" kicker */}
            {locale === 'ar' ? 'مساحة العمل' : 'WORKSPACE'}
          </span>
        </div>
      </div>

      {/* ── Nav groups ───────────────────────────────────── */}
      <div style={{
        flex:          1,
        overflowY:     'auto',
        padding:       '6px 8px 16px',
        display:       'flex',
        flexDirection: 'column',
        gap:           2,
      }}>
        {workspace.nav.map((group, gi) => {
          const groupLabel = pickLabel(group, locale)
          // RBAC: hide SUPER_ADMIN-only items (e.g. Feature Permissions) from everyone
          // else, and honor per-item allowedRoles (SUPER_ADMIN always sees all).
          const items = group.items.filter(item =>
            (role === 'SUPER_ADMIN' || !item.superAdminOnly) &&
            (role === 'SUPER_ADMIN' || !item.allowedRoles || item.allowedRoles.includes(role)),
          )
          if (items.length === 0) return null
          return (
            <div key={gi} style={{ marginTop: gi > 0 ? 6 : 0 }}>
              {groupLabel && (
                <div style={{
                  fontSize:      'var(--text-caption)',
                  color:         'var(--ink-3)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding:       '8px 10px 4px',
                  fontWeight:    600,
                }}>
                  {groupLabel}
                </div>
              )}

              {items.map(item => {
                const active = isItemActive(pathname, item)
                const label  = pickLabel(item, locale)
                const href   = item.comingSoon ? '#' : item.route

                return (
                  <Link
                    key={item.id}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    aria-disabled={item.comingSoon}
                    tabIndex={item.comingSoon ? -1 : undefined}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      gap:            8,
                      padding:        '6px 10px',
                      borderRadius:   6,
                      cursor:         item.comingSoon ? 'default' : 'pointer',
                      textDecoration: 'none',
                      opacity:        item.comingSoon ? 0.45 : 1,
                      background:     active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                      color:          active ? 'var(--brand-active)' : 'var(--ink-2)',
                      fontWeight:     active ? 600 : 450,
                      boxShadow:      active ? 'inset 3px 0 0 var(--brand-active)' : 'none',
                      transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
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
                    <span style={{
                      flex:         1,
                      fontSize:     'var(--text-body)',
                      letterSpacing: '-0.003em',
                      whiteSpace:   'nowrap',
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {label}
                    </span>

                    {item.isNew && !item.comingSoon && (
                      <span style={{
                        fontSize:      'var(--text-caption)',
                        fontWeight:    700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color:         "var(--on-accent)",
                        background:    'var(--accent)',
                        padding:       '2px 5px',
                        borderRadius:  4,
                        flexShrink:    0,
                      }}>
                        NEW
                      </span>
                    )}

                    {item.comingSoon && (
                      <span style={{
                        fontSize:      'var(--text-caption)',
                        fontWeight:    600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color:         'var(--ink-4)',
                        border:        '1px solid var(--border)',
                        padding:       '2px 5px',
                        borderRadius:  4,
                        flexShrink:    0,
                      }}>
                        SOON
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* ── Footer hint ──────────────────────────────────── */}
      <div style={{
        padding:    '10px 16px',
        borderTop:  '1px solid var(--border)',
        display:    'flex',
        alignItems: 'center',
        gap:        8,
        fontSize:   'var(--text-caption)',
        color:      'var(--ink-3)',
        flexShrink: 0,
      }}>
        <HelpCircle size={13} strokeWidth={1.6} aria-hidden />
        {/* FIX 17 — localized footer hint */}
        <span style={{ flex: 1 }}>{locale === 'ar' ? 'ما الذي يتضمنه هذا الفضاء؟' : "What's in this workspace?"}</span>
      </div>
    </nav>
  )
}
