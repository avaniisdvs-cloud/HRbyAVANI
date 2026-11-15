'use client'

/**
 * SidebarUserCard — shared sidebar footer identity block.
 *
 * Renders a consistent footer across all role sidebars (WorkspaceRail,
 * AdminSidebar, EmployeeSidebar): avatar/photo (or initials), display name,
 * role title, and a logout action. Logout REUSES the existing /sign-out route
 * (which calls signOut({ callbackUrl: '/sign-in' })) — no auth-provider change.
 *
 * Variants:
 *   light → light sidebars (Employee, Manager)
 *   dark  → WorkspaceRail (dark rail)
 * compact → icon-only (avatar + logout) for collapsed rails; no name/role.
 */
import Link from 'next/link'
import { LogOut } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:      'Employee',
  MANAGER:       'Manager',
  HR_ADMIN:      'HR Admin',
  HR_DIRECTOR:   'HR Director',
  PAYROLL_ADMIN: 'Payroll Admin',
  FINANCE:       'Finance',
  SUPER_ADMIN:   'Super Admin',
}

/** Consistent role label across every sidebar footer. */
export function formatRoleLabel(role: string): string {
  return ROLE_LABELS[role]
    ?? role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

interface SidebarUserCardProps {
  name:           string
  role:           string
  initials:       string
  photoUrl?:      string | null
  variant?:       'light' | 'dark'
  compact?:       boolean
  showLogout?:    boolean
  withTopBorder?: boolean
  locale?:        'en' | 'ar'
  /** Passthrough for responsive show/hide (e.g. AdminSidebar lg breakpoint). */
  className?:     string
}

export function SidebarUserCard({
  name,
  role,
  initials,
  photoUrl,
  variant = 'light',
  compact = false,
  showLogout = true,
  withTopBorder = true,
  locale = 'en',
  className,
}: SidebarUserCardProps) {
  const isDark = variant === 'dark'
  const isRtl  = locale === 'ar'
  const signOutLabel = isRtl ? 'تسجيل الخروج' : 'Sign out'

  const nameColor   = isDark ? 'white' : 'var(--ink-1)'
  const roleColor   = isDark ? 'var(--rail-fg-mute)' : 'var(--ink-3)'
  const borderColor = isDark ? 'var(--rail-divider)' : 'var(--border)'
  const bg          = isDark ? 'transparent' : 'var(--surface)'
  const idleLogout  = isDark ? 'var(--rail-fg-mute)' : 'var(--ink-4)'

  const avatar = photoUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={photoUrl}
      alt=""
      aria-hidden
      style={{
        width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
        boxShadow: isDark ? 'none' : '0 0 0 2px var(--card)',
      }}
    />
  ) : (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: isDark ? 'linear-gradient(135deg, var(--accent), var(--accent-700))' : 'var(--accent)',
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 'var(--text-caption)', fontWeight: 700, fontFamily: 'var(--font-sans)',
      boxShadow: isDark ? 'none' : '0 0 0 2px var(--card)',
    }}>
      {initials}
    </div>
  )

  const logoutBtn = showLogout ? (
    <Link
      href="/sign-out"
      aria-label={signOutLabel}
      title={signOutLabel}
      style={{
        color: idleLogout, display: 'grid', placeItems: 'center', flexShrink: 0,
        width: 28, height: 28, borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: isDark ? 'transparent' : 'var(--card)',
        transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--status-rejected-fg, #dc2626)'
        e.currentTarget.style.borderColor = 'var(--status-rejected-fg, #dc2626)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = idleLogout
        e.currentTarget.style.borderColor = borderColor
      }}
    >
      <LogOut size={14} strokeWidth={1.75} aria-hidden />
    </Link>
  ) : null

  // Compact (collapsed rail): avatar + logout icon, stacked & centered.
  if (compact) {
    return (
      <div
        className={className}
        style={{
          borderTop: withTopBorder ? `1px solid ${borderColor}` : undefined,
          background: bg, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '10px 0',
        }}
      >
        {avatar}
        {logoutBtn}
      </div>
    )
  }

  // Full: avatar + name/role + logout.
  return (
    <div
      className={className}
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        borderTop: withTopBorder ? `1px solid ${borderColor}` : undefined,
        background: bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
      }}
    >
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-body)', fontWeight: 600, color: nameColor,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: roleColor, marginTop: 1 }}>
          {formatRoleLabel(role)}
        </div>
      </div>
      {logoutBtn}
    </div>
  )
}
