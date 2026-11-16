'use client'

/**
 * HR-7 exception: This panel has a fixed dark background (#0F2E38 / --nav-bg).
 * All text/icon colors use rgba(255,255,255,X) or #FFFFFF directly because
 * CSS var(--ink-*) tokens are designed for the light theme and would be
 * unreadable on this dark surface. Only var(--accent) is used for brand teal,
 * which is safe as it's a high-contrast colour on dark backgrounds.
 */

import { BrandText } from '@/components/providers/BrandingProvider'
import {
  Home, CheckSquare, Bell, Users, BarChart3,
  GitBranch, Shield, BookOpen, FileText, ScrollText,
  Bot,
} from 'lucide-react'

export type AriaOSView =
  | 'home'
  | 'chat'
  | 'approvals'
  | 'alerts'
  | 'people'
  | 'reports'
  | 'workflows'
  | 'compliance'
  | 'uae-law'
  | 'company-policies'
  | 'audit-log'

interface NavEntry {
  id:      AriaOSView
  labelEn: string
  labelAr: string
  icon:    React.ElementType
  badge?:  number
}

interface NavSection {
  id:      string
  labelEn: string
  labelAr: string
  items:   NavEntry[]
}

function buildSections(pendingApprovals: number): NavSection[] {
  return [
    {
      id:      'work',
      labelEn: 'WORK',
      labelAr: 'العمل',
      items: [
        { id: 'home',       labelEn: 'Home',       labelAr: 'الرئيسية',  icon: Home        },
        { id: 'chat',       labelEn: 'ARIA',        labelAr: 'آريا',      icon: Bot         },
        { id: 'approvals',  labelEn: 'Approvals',   labelAr: 'الموافقات', icon: CheckSquare, badge: pendingApprovals },
        { id: 'alerts',     labelEn: 'Alerts',      labelAr: 'التنبيهات', icon: Bell        },
        { id: 'people',     labelEn: 'People',      labelAr: 'الأفراد',   icon: Users       },
        { id: 'reports',    labelEn: 'Reports',     labelAr: 'التقارير',  icon: BarChart3   },
        { id: 'workflows',  labelEn: 'Workflows',   labelAr: 'سير العمل', icon: GitBranch   },
        { id: 'compliance', labelEn: 'Compliance',  labelAr: 'الامتثال',  icon: Shield      },
      ],
    },
    {
      id:      'knowledge',
      labelEn: 'KNOWLEDGE',
      labelAr: 'المعرفة',
      items: [
        { id: 'uae-law',          labelEn: 'UAE Labour Law',   labelAr: 'قانون العمل الإماراتي', icon: BookOpen   },
        { id: 'company-policies', labelEn: 'Company Policies', labelAr: 'سياسات الشركة',         icon: FileText   },
        { id: 'audit-log',        labelEn: 'Audit Log',        labelAr: 'سجل التدقيق',           icon: ScrollText },
      ],
    },
  ]
}

interface Props {
  userName:          string
  userRole:          string
  locale:            'en' | 'ar'
  pendingApprovals?: number
  activeView:        AriaOSView
  onNavigate:        (view: AriaOSView) => void
}

export default function AriaOSSidebar({
  userName,
  userRole,
  locale,
  pendingApprovals = 0,
  activeView,
  onNavigate,
}: Props) {
  const isRtl    = locale === 'ar'
  const sections = buildSections(pendingApprovals)
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase().replace('_', ' ')

  return (
    <aside
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--nav-bg)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 22,
          fontWeight: 700,
          color: "var(--on-accent)",
          letterSpacing: '-0.5px',
          lineHeight: 1,
        }}>
          ARIA
        </div>
        <div style={{
          fontSize: 'var(--text-caption)',
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--brand-active)',
          marginTop: 2,
        }}>
          <BrandText>{"OS · AVANIIS HR\n        "}</BrandText></div>
      </div>

      {/* Nav sections */}
      <nav
        aria-label={isRtl ? 'قائمة ARIA OS' : 'ARIA OS navigation'}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {sections.map(section => (
          <div key={section.id}>
            <div style={{
              padding: '8px 16px 4px',
              fontSize: 'var(--text-caption)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
            }}>
              {locale === 'ar' ? section.labelAr : section.labelEn}
            </div>

            {section.items.map(entry => {
              const active = activeView === entry.id
              const Icon   = entry.icon

              return (
                <button
                  key={entry.id}
                  onClick={() => onNavigate(entry.id)}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '8px 16px',
                    width: '100%',
                    textAlign: isRtl ? 'right' : 'left',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                    borderInlineStart: active ? '3px solid var(--accent)' : '3px solid transparent',
                    background: active ? 'rgba(46,97,112,0.35)' : 'transparent',
                    color: active ? '#FFFFFF' : 'rgba(255,255,255,0.75)',
                    fontWeight: active ? 600 : 400,
                    fontSize: 'var(--text-body)',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.90)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
                    }
                  }}
                >
                  <Icon
                    size={14}
                    strokeWidth={active ? 2 : 1.75}
                    style={{ flexShrink: 0, color: active ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }}
                    aria-hidden
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {locale === 'ar' ? entry.labelAr : entry.labelEn}
                  </span>
                  {entry.id === 'chat' && (
                    <span style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--accent)',
                      color: "var(--on-accent)",
                      flexShrink: 0,
                    }}>
                      ON
                    </span>
                  )}
                  {entry.badge != null && entry.badge > 0 && (
                    <span style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 700,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: 'rgba(255,255,255,0.15)',
                      color: "var(--on-accent)",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: '0 4px',
                    }}>
                      {entry.badge > 99 ? '99+' : entry.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{
        padding: '14px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          color: "var(--on-accent)",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {userName}
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
          {roleLabel}
        </div>
      </div>
    </aside>
  )
}
