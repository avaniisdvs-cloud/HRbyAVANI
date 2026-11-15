'use client'

import { useEffect } from 'react'

interface Props {
  preferences: Record<string, string>
}

/**
 * Applies user preferences from the DB to DOM attributes on mount / preference change.
 *
 * Attribute map (must match globals.css selectors):
 *   theme   → data-dark="true"   on <body>   ([data-dark="true"] in globals.css)
 *   density → data-density="..."  on <html>   ([data-density="compact"])
 *   lang    → html.lang + html.dir            (RTL for Arabic)
 *   dateFmt → stored in DB, consumed by date-formatting utilities
 *
 * This runs after SSR hydration so preferences are applied before the first paint.
 */
export function PreferencesApplier({ preferences }: Props) {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    // ── Language + RTL direction ──────────────────────────────────────────────
    if (preferences.lang) {
      html.lang = preferences.lang.toLowerCase()
      html.dir  = preferences.lang === 'AR' ? 'rtl' : 'ltr'
    }

    // ── Density — CSS: [data-density="compact"] { --density: 0.85 } ─────────
    if (preferences.density) {
      html.setAttribute('data-density', preferences.density)
    } else {
      html.removeAttribute('data-density')
    }

    // ── Dark mode — CSS: [data-dark="true"] on <body> ────────────────────────
    const theme = preferences.theme
    if (theme === 'dark') {
      body.setAttribute('data-dark', 'true')
    } else if (theme === 'light') {
      body.removeAttribute('data-dark')
    } else if (theme === 'system') {
      // Respect OS preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        body.setAttribute('data-dark', 'true')
      } else {
        body.removeAttribute('data-dark')
      }
    } else {
      body.removeAttribute('data-dark')
    }
    html.removeAttribute('data-dark')
  }, [preferences])

  return null
}
