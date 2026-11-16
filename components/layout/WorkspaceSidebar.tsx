'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CompanyLogo } from '@/components/providers/BrandingProvider'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getActiveWorkspaceId, getVisibleWorkspaces } from '@/config/workspace-nav'
import { isItemActive } from './WorkspaceSecondaryNav'
import { SidebarUserCard } from '@/components/nav/SidebarUserCard'
import { pickLabel, type Locale } from '@/lib/i18n'

/** Presentation-only shell. Uses the existing workspace/feature/item visibility rules. */
export function WorkspaceSidebar({ role, locale, userName, initials, photoUrl, brandingLogoUrl }: {
  role: string; locale: Locale; userName: string; initials: string
  photoUrl?: string | null; brandingLogoUrl?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const workspaces = getVisibleWorkspaces(role)
  const activeId = getActiveWorkspaceId(pathname, workspaces, role)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const storageKey = `avaniis_sidebar_${role}`
  useEffect(() => {
    try { setCompact(localStorage.getItem(storageKey) === 'compact') } catch { /* optional preference */ }
  }, [storageKey])
  function toggleCompact() {
    setCompact(value => {
      try { localStorage.setItem(storageKey, value ? 'expanded' : 'compact') } catch { /* optional preference */ }
      return !value
    })
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === '\\') { event.preventDefault(); toggleCompact(); return }
      const num = parseInt(event.key, 10)
      if (Number.isNaN(num)) return
      const workspace = workspaces[num === 0 ? 9 : num - 1]
      const route = workspace?.nav.flatMap(group => group.items).find(item => !item.comingSoon)?.route ?? workspace?.route
      if (route && route !== '#') { event.preventDefault(); router.push(route) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [role, router, storageKey]) // Config is static; role selects the existing visibility rules.

  return <aside className={`workspace-rail unified-sidebar${compact ? ' is-compact' : ''}`} aria-label={locale === 'ar' ? 'التنقل في التطبيق' : 'Application navigation'} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <Link className="unified-brand" href="/dashboard" aria-label="HR · Home">
      <CompanyLogo width={compact ? 38 : 64} height={compact ? 38 : 64} alt="" style={{ objectFit: 'contain', width: 'auto', maxWidth: '100%' }} />
      {!compact && <span>HR</span>}
    </Link>
    <button type="button" className="unified-collapse" onClick={toggleCompact} aria-label={compact ? (locale === 'ar' ? 'توسيع التنقل' : 'Expand navigation') : (locale === 'ar' ? 'طي التنقل' : 'Collapse navigation')} title="⌘ / Ctrl + \">
      {compact ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
    </button>
    <nav className="unified-workspaces" aria-label={locale === 'ar' ? 'مساحات العمل' : 'Workspaces'}>{workspaces.map(workspace => {
        const label = pickLabel(workspace, locale)
        const visibleGroups = workspace.nav.map(group => ({ ...group, items: group.items.filter(item =>
          (role === 'SUPER_ADMIN' || !item.superAdminOnly) &&
          (role === 'SUPER_ADMIN' || !item.allowedRoles || item.allowedRoles.includes(role)),
        ) })).filter(group => group.items.length)
        const liveItems = visibleGroups.flatMap(group => group.items).filter(item => !item.comingSoon)
        const Icon = workspace.icon
        const open = !compact && (expanded === workspace.id || (expanded === null && activeId === workspace.id))
        const direct = liveItems.length === 1
        const firstRoute = workspace.nav.flatMap(group => group.items).find(item => !item.comingSoon)?.route ?? workspace.route ?? '#'
        return <div key={workspace.id} className="unified-group">
          {direct && !compact ? <Link className="unified-group-toggle" href={firstRoute} aria-current={activeId === workspace.id ? 'page' : undefined}>
            <Icon size={18} aria-hidden /><span>{label}</span>
          </Link> : <button type="button" className="unified-group-toggle" data-active={activeId === workspace.id || undefined} aria-expanded={open} aria-controls={`workspace-${workspace.id}`} aria-label={label} title={compact ? label : undefined}
            onClick={() => { if (compact) setCompact(false); setExpanded(open ? '' : workspace.id) }}>
            <Icon size={18} aria-hidden />{!compact && <><span>{label}</span><ChevronDown size={14} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} /></>}
          </button>}
          <div id={`workspace-${workspace.id}`} hidden={!open || direct} className="unified-children">
            {visibleGroups.map((group, index) => <div key={index}>
              {group.label && <p className="unified-section">{pickLabel(group, locale)}</p>}
              {group.items.map(item => item.comingSoon ? <span key={item.id} className="unified-link" aria-disabled="true">{pickLabel(item, locale)}</span> :
                <Link key={item.id} className="unified-link" href={item.route} aria-current={isItemActive(pathname, item) ? 'page' : undefined} onClick={() => setExpanded(null)}>{pickLabel(item, locale)}</Link>)}
            </div>)}
          </div>
        </div>
      })}
    </nav>
    <SidebarUserCard name={userName} role={role} initials={initials} photoUrl={photoUrl} locale={locale} compact={compact} />
  </aside>
}
