/**
 * Server-only locale helper. Import only from Server Components and
 * Route Handlers — uses `next/headers` which is not available client-side.
 */
import { auth } from './auth'
import { resolveLocale } from './language-preference'
import type { Locale } from './i18n'

export async function getLocale(): Promise<Locale> {
  const session = await auth()
  return resolveLocale(session?.user?.personId)
}

/**
 * Inline bilingual helper: returns the correct string for the active
 * locale. Usage: `t(locale, 'English text', 'النص العربي')`
 */
export function t(locale: Locale, en: string, ar: string): string {
  return locale === 'ar' ? ar : en
}
