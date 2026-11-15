'use client'

/**
 * components/org-chart/ViewBySelector.tsx
 *
 * Engine-switching pill selector for the OrgChartShell topbar.
 *
 * Renders only the engines available to the viewer's role:
 *   EMPLOYEE    → hidden (employees always see My Team — no choice)
 *   MANAGER     → Position + Reporting + My Team
 *   HR_ADMIN    → Position + Reporting (full control)
 *   EXECUTIVE   → Position + Reporting
 *
 * Sessions 4/5 will add Department and My Team to the visible set by
 * simply adding entries to ENGINE_OPTIONS — the component needs no changes.
 */

import type { HierarchyEngine } from '@/lib/org-chart/engines/engine-types'
import type { OrgViewerRole }   from '@/lib/org-chart/types'

// ── Engine options config ─────────────────────────────────────────────────────

interface EngineOption {
  key:      HierarchyEngine
  labelEn:  string
  labelAr:  string
  icon:     React.ReactNode
  roles:    OrgViewerRole[]
}

// Inline SVG icons — no external dependency
const PositionIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="5" rx="1"/>
    <rect x="2" y="16" width="6" height="5" rx="1"/>
    <rect x="9" y="16" width="6" height="5" rx="1"/>
    <rect x="16" y="16" width="6" height="5" rx="1"/>
    <path d="M12 8v3M5 16v-2h14v2M12 11v5"/>
  </svg>
)

const ReportingIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="2"/>
    <circle cx="5"  cy="19" r="2"/>
    <circle cx="19" cy="19" r="2"/>
    <path d="M12 7v4M12 11l-7 6M12 11l7 6"/>
  </svg>
)

const DepartmentIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)

const MyTeamIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8"  r="3"/>
    <circle cx="5"  cy="18" r="2"/>
    <circle cx="12" cy="18" r="2"/>
    <circle cx="19" cy="18" r="2"/>
    <path d="M12 11v4M12 15l-7 1M12 15l7 1"/>
  </svg>
)

const ENGINE_OPTIONS: EngineOption[] = [
  {
    key:     'position',
    labelEn: 'Position Hierarchy',
    labelAr: 'التسلسل الوظيفي',
    icon:    <PositionIcon />,
    // Hidden from the view selector for all roles — Reporting Manager is the
    // canonical view. The position engine still exists and can be re-enabled by
    // restoring roles here; nothing else references this option for navigation.
    roles:   [],
  },
  {
    key:     'reporting',
    labelEn: 'Reporting Manager',
    labelAr: 'المدير المباشر',
    icon:    <ReportingIcon />,
    roles:   ['HR_ADMIN', 'EXECUTIVE', 'MANAGER'],
  },
  {
    key:     'department',
    labelEn: 'Department',
    labelAr: 'الأقسام',
    icon:    <DepartmentIcon />,
    roles:   ['HR_ADMIN', 'EXECUTIVE'],   // Managers see Reporting + Position only
  },
  {
    key:     'my-team',
    labelEn: 'My Team',
    labelAr: 'فريقي',
    icon:    <MyTeamIcon />,
    roles:   ['HR_ADMIN', 'EXECUTIVE', 'MANAGER'],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface ViewBySelectorProps {
  active:     HierarchyEngine
  viewerRole: OrgViewerRole
  onChange:   (engine: HierarchyEngine) => void
  disabled?:  boolean
  locale?:    'en' | 'ar'
}

export function ViewBySelector({
  active,
  viewerRole,
  onChange,
  disabled = false,
  locale = 'en',
}: ViewBySelectorProps) {
  const visible = ENGINE_OPTIONS.filter(o => o.roles.includes(viewerRole))

  // EMPLOYEE role has no engine choice — My Team is locked server-side
  if (visible.length === 0) return null

  return (
    <div
      role="group"
      aria-label={locale === 'ar' ? 'عرض التسلسل الهرمي حسب' : 'View hierarchy by'}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          2,
        background:   'var(--surface)',
        borderRadius: 8,
        padding:      3,
        border:       '1px solid var(--border)',
        flexShrink:   0,
      }}
    >
      {visible.map(opt => {
        const isActive = active === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => !disabled && onChange(opt.key)}
            aria-pressed={isActive}
            disabled={disabled}
            title={locale === 'ar' ? opt.labelAr : opt.labelEn}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          5,
              padding:      '5px 11px',
              borderRadius: 6,
              border:       'none',
              fontSize:     'var(--text-caption)',
              fontWeight:   isActive ? 600 : 500,
              cursor:       disabled ? 'not-allowed' : 'pointer',
              fontFamily:   'var(--font-sans)',
              background:   isActive ? 'var(--accent)'   : 'transparent',
              color:        isActive ? 'var(--card)'      : 'var(--ink-2)',
              transition:   'background 150ms, color 150ms',
              opacity:      disabled ? 0.55 : 1,
              whiteSpace:   'nowrap' as const,
            }}
            onMouseEnter={e => {
              if (!isActive && !disabled)
                (e.currentTarget as HTMLElement).style.background = 'var(--border)'
            }}
            onMouseLeave={e => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            {opt.icon}
            {locale === 'ar' ? opt.labelAr : opt.labelEn}
          </button>
        )
      })}
    </div>
  )
}
