'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Clock, Users, User, Bot, Network, FileText, FolderOpen, HeartPulse, ClipboardCheck, ClipboardList } from 'lucide-react'
import { SidebarUserCard } from '@/components/nav/SidebarUserCard'
import { pickLabel } from '@/lib/i18n'

const NAV_ITEMS = [
  { href: '/me',              labelEn: 'Home',               labelAr: 'الرئيسية',          Icon: Home       },
  { href: '/me/profile',      labelEn: 'My Profile',         labelAr: 'ملفي الشخصي',      Icon: User       },
  { href: '/absence/my',      labelEn: 'My Leave',           labelAr: 'إجازتي',            Icon: Calendar   },
  { href: '/me/requests',     labelEn: 'My Requests',        labelAr: 'طلباتي',            Icon: ClipboardList },
  { href: '/approvals',       labelEn: 'Approvals',          labelAr: 'الموافقات',         Icon: ClipboardCheck },
  { href: '/me/timesheet',    labelEn: 'Timesheet',          labelAr: 'جدول الدوام',       Icon: Clock      },
  { href: '/me/insurance',    labelEn: 'My Insurance',       labelAr: 'تأميني الطبي',     Icon: HeartPulse },
  { href: '/me/documents',    labelEn: 'My Documents',       labelAr: 'وثائقي',            Icon: FolderOpen },
  { href: '/me/letters',      labelEn: 'My Letters',         labelAr: 'خطاباتي',           Icon: FileText   },
  { href: '/me/directory',    labelEn: 'Directory',          labelAr: 'الدليل',            Icon: Users      },
  { href: '/me/accommodations', labelEn: 'Accommodation Request', labelAr: 'طلب التسهيلات', Icon: ClipboardList },
  { href: '/me/requests/probation', labelEn: 'My Probation', labelAr: 'فترة تجربتي', Icon: ClipboardCheck },
  { href: '/me/aria',         labelEn: 'ARIA',               labelAr: 'آريا',               Icon: Bot        },
  { href: '/org-chart',       labelEn: 'Employee Organization Structure', labelAr: 'الهيكل التنظيمي للموظفين',  Icon: Network    },
]

interface Props {
  userName:        string
  userRole:        string
  initials:        string
  avatarColor:     string
  locale?:         'en' | 'ar'
  photoUrl?:       string | null
  brandingLogoUrl?: string | null
}

export function EmployeeSidebar({ userName, userRole, initials, locale = 'en', photoUrl, brandingLogoUrl }: Props) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/me') return pathname === '/me'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isRtl = locale === 'ar'

  return (
    <aside className="role-sidebar"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        width: 240, flexShrink: 0,
        background: 'var(--card)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0,
        borderInlineEnd: '1px solid var(--border)',
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <Link
        href="/me"
        aria-label={locale === 'ar' ? 'أفانيس للموارد البشرية · الرئيسية' : 'AVANIIS HR · Home'}
        style={{
          height: 64, padding: '0 16px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border)',
          textDecoration: 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {brandingLogoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={brandingLogoUrl}
            alt="AVANIIS HR"
            style={{ height: 40, width: 'auto', maxWidth: 184, objectFit: 'contain' }}
          />
        ) : (
          <Image
            src="/avaniis-logo.png"
            height={40}
            width={40}
            alt="AVANIIS HR"
            style={{ height: 40, width: 'auto', maxWidth: 184, objectFit: 'contain' }}
            priority
          />
        )}
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-1)', letterSpacing: 1 }}>AVANIIS</span>
      </Link>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav
        aria-label={isRtl ? 'القائمة الرئيسية' : 'Main navigation'}
        style={{
          flex: 1, padding: '10px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
          overflowY: 'auto',
        }}
      >
        {NAV_ITEMS.map(({ href, labelEn, labelAr, Icon }) => {
          const active       = isActive(href)
          const primaryLabel = pickLabel({ labelEn, labelAr }, locale)

          return (
            <div key={href}>
              {href === '/me/aria' && (
                <>
                  <div style={{
                    height:     1,
                    background: 'var(--border)',
                    margin:     '6px 4px',
                    opacity:    0.7,
                  }} />
                  <div style={{
                    fontSize:      'var(--text-caption)',
                    fontWeight:    700,
                    letterSpacing: '0.08em',
                    color:         'var(--brand-active)',
                    textTransform: 'uppercase',
                    padding:       '8px 12px 4px',
                    fontFamily:    'var(--font-sans)',
                  }}>
                    {locale === 'ar' ? 'المساعد الذكي' : 'AI ASSISTANT'}
                  </div>
                </>
              )}
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)',
                transition: 'background 0.15s, color 0.15s',
                borderInlineStart: active ? '3px solid var(--accent)' : '3px solid transparent',
                paddingInlineStart: active ? '10px' : '12px',
                background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                color: active ? 'var(--brand-active)' : 'var(--ink-2)',
              }}
              onMouseEnter={e => {
                if (!active) {
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
              <Icon
                size={17}
                strokeWidth={active ? 2 : 1.75}
                style={{ flexShrink: 0, color: active ? 'var(--brand-active)' : 'inherit' }}
                aria-hidden
              />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
                {href === '/me/aria' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-body)', fontWeight: active ? 600 : 500 }}>
                    {primaryLabel}
                    <span style={{
                      fontSize: 'var(--text-caption)', fontWeight: 700,
                      padding: '1px 6px', borderRadius: 4,
                      background: 'var(--accent)', color: "var(--on-accent)",
                      marginLeft: 2, lineHeight: 1.6, flexShrink: 0,
                    }}>AI</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: active ? 600 : 500 }}>{primaryLabel}</span>
                )}
              </span>
            </Link>
            </div>
          )
        })}
      </nav>

      {/* ── User footer (shared identity + logout block) ─────────────── */}
      <SidebarUserCard
        variant="light"
        name={userName}
        role={userRole}
        initials={initials}
        photoUrl={photoUrl}
        locale={locale}
      />
    </aside>
  )
}
