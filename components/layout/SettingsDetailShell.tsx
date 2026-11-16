'use client'

/**
 * SettingsDetailShell — auto-generates the breadcrumb kicker + serif-title + description
 * page header for every /settings/* sub-page.
 *
 * Skips rendering the header on /settings (the hub has its own header).
 * Derives category name + item name (en + ar) + hint from SETTINGS_HUB config
 * using the current pathname. Falls back to a capitalised slug title if not found.
 * The category kicker is a clickable Link back to /settings for breadcrumb navigation.
 */

import { PageTitle } from '@/components/ui/typography'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SETTINGS_HUB } from '@/config/settings-hub'

function slugToTitle(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function SettingsDetailShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Hub page has its own full header — skip wrapper header there
  if (pathname === '/settings') return <>{children}</>

  let categoryName   = 'Administration'
  let categoryNameAr = 'الإدارة'
  let itemName       = ''
  let itemNameAr     = ''
  let itemHint       = ''

  outer: for (const cat of SETTINGS_HUB) {
    for (const item of cat.items) {
      if (
        pathname === item.route ||
        pathname.startsWith(item.route + '/')
      ) {
        categoryName   = cat.labelEn
        categoryNameAr = cat.labelAr
        itemName       = item.labelEn
        itemNameAr     = item.labelAr
        itemHint       = item.hint
        break outer
      }
    }
  }

  // Fallback: derive title from the last pathname segment
  if (!itemName) {
    const slug = pathname.split('/').filter(Boolean).pop() ?? ''
    itemName = slugToTitle(slug)
  }

  return (
    <>
      {/* Page header: breadcrumb kicker + bilingual serif title + description */}
      <div style={{
        marginBottom:  28,
        paddingBottom: 20,
        borderBottom:  '1px solid var(--border)',
      }}>
        <div style={{
          fontSize:      'var(--text-caption)',
          fontWeight:    600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color:         'var(--ink-3)',
          marginBottom:  4,
          display:       'flex',
          alignItems:    'center',
          gap:           4,
          flexWrap:      'wrap',
        }}>
          <Link
            href="/settings"
            style={{
              color:          'var(--ink-3)',
              textDecoration: 'none',
              transition:     'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
          >
            Settings
          </Link>
          <span aria-hidden style={{ opacity: 0.5 }}>/</span>
          <span>{categoryName}</span>
          {categoryNameAr && (
            <span dir="rtl" lang="ar" style={{ marginInlineStart: 4, fontWeight: 400, opacity: 0.7 }}>
              {categoryNameAr}
            </span>
          )}
        </div>

        <PageTitle style={{
          fontFamily:    'var(--font-serif)',
          fontSize:      26,
          fontWeight:    400,
          letterSpacing: '-0.015em',
          color:         'var(--ink-1)',
          marginTop: 0,
          marginRight: 0,
          marginLeft: 0,
          marginBottom:  itemHint ? 6 : 0,
          lineHeight:    1.2,
        }}>
          {itemName}
          {itemNameAr && (
            <>
              {' · '}
              <span dir="rtl" lang="ar" style={{ fontWeight: 400 }}>{itemNameAr}</span>
            </>
          )}
        </PageTitle>

        {itemHint && (
          <p style={{
            fontSize:   'var(--text-body)',
            color:      'var(--ink-2)',
            margin:     0,
            lineHeight: 1.55,
          }}>
            {itemHint}
          </p>
        )}
      </div>

      {children}
    </>
  )
}
