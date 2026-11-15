import { ConnectionNotice } from '@/components/layout/ConnectionNotice'
import type { Metadata } from 'next'
import { Inter, Fraunces, JetBrains_Mono, Noto_Sans_Arabic } from 'next/font/google'
import { and, eq, inArray } from 'drizzle-orm'
import { Toaster } from '@/components/ui/toaster'
import { direction } from '@/lib/i18n'
import { auth } from '@/lib/auth'
import { resolveLocale } from '@/lib/language-preference'
import { LocaleProvider } from '@/components/providers/LocaleProvider'
import { db } from '@/lib/db'
import { policySettings } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import './globals.css'

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const fontSerif = Fraunces({
  subsets: ['latin'],
  axes:    ['opsz'],
  variable: '--font-serif',
  display: 'swap',
})

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const fontArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    template: '%s — AVANIIS HR',
    default: 'AVANIIS HR',
  },
  description: 'Avaniis — Human Capital Management Platform',
}

// Inline script runs synchronously before first paint — no flash of unstyled content.
// Task 7e: restores data-accent and data-dark from localStorage on every page load.
const themeScript = `
(function(){
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return;
    var accent = localStorage.getItem('avaniis_accent');
    var dark   = localStorage.getItem('avaniis_dark');
    if (accent) document.documentElement.setAttribute('data-accent', accent);
    if (dark === 'true') document.documentElement.setAttribute('data-dark', 'true');
  } catch(e) {}
})();
`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // TD-04 — locale resolution applied to <html lang/dir> for RTL.
  // Single source of truth (cookie hint → persisted preference → 'en') so a
  // fresh login on a new device honors the saved language for <html dir> too.
  const session = await auth()
  const locale = await resolveLocale(session?.user?.personId)

  // Read UI appearance settings from policy_settings for SSR — no-flash theming.
  // Falls back to defaults if rows are absent (fresh install before seed).
  let accent = 'teal'
  let darkMode = 'false'
  let density = 'comfortable'
  try {
    const rows = await db
      .select({ k: policySettings.settingKey, v: policySettings.settingValue })
      .from(policySettings)
      .where(
        and(
          eq(policySettings.tenantId, TENANT_ID),
          inArray(policySettings.settingKey, [
            'UI_ACCENT_THEME',
            'UI_DARK_MODE',
            'UI_DENSITY',
          ]),
        ),
      )
    for (const row of rows) {
      if (row.k === 'UI_ACCENT_THEME') accent   = row.v
      if (row.k === 'UI_DARK_MODE')    darkMode  = row.v
      if (row.k === 'UI_DENSITY')      density   = row.v
    }
  } catch {
    // DB unavailable at build time or during static rendering — use defaults.
  }

  return (
    <html lang={locale} dir={direction(locale)} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        data-accent={accent}
        data-dark={darkMode}
        data-density={density}
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} ${fontArabic.variable} font-sans antialiased`}
      >
        <LocaleProvider locale={locale}>
          <ConnectionNotice />
          {children}
        </LocaleProvider>
        <Toaster />
      </body>
    </html>
  )
}
