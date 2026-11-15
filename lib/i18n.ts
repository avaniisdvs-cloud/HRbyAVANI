/**
 * Pure i18n helpers — safe to import from BOTH Server Components and
 * Client Components. No react-i18next, no React Context.
 *
 * Single i18n strategy (SSR-first): the locale is resolved server-side
 * (`lib/language-preference.ts` → cookie/DB) and applied to <html dir>.
 * UI strings are rendered via `t(locale, en, ar)` (lib/locale-server.ts,
 * inline one-offs) and `tk(locale, key)` (lib/i18n-messages.ts, shared keys
 * from messages/{en,ar}.json). The former react-i18next runtime was retired.
 */
export const SUPPORTED_LOCALES = ['en', 'ar'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const RTL_LOCALES: Locale[] = ['ar']
export const LOCALE_COOKIE = 'avaniis_locale'

export function isRtl(locale: Locale | string): boolean {
  return RTL_LOCALES.includes(locale as Locale)
}

export function direction(locale: Locale | string): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr'
}

export function isSupported(locale: string): locale is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
}

/**
 * Pure DB-first locale priority resolver (no DB / no cookies — testable):
 *   authenticated persisted preference → cookie fallback → 'en'.
 * The authenticated user's stored preference is authoritative; a stale
 * browser cookie must never override it. See `lib/language-preference.ts`.
 */
export function chooseLocale(dbPref?: string | null, cookieVal?: string | null): Locale {
  if (dbPref && isSupported(dbPref)) return dbPref
  if (cookieVal && isSupported(cookieVal)) return cookieVal
  return 'en'
}

export function getDisplayName(
  record: { name_en: string; name_ar: string },
  lang: string,
): string {
  if (lang === 'AR' || lang === 'ar') return record.name_ar || record.name_en
  return record.name_en || record.name_ar
}

/**
 * Single source of truth for picking ONE navigation/menu label for the active
 * locale. Used by every nav shell (rail, sidebars, secondary nav, mobile bar)
 * so language-selection logic is never duplicated or drifts per role.
 *
 * Enterprise rule: English mode → English only, Arabic mode → Arabic only.
 * Never concatenate both languages. Falls back to the other language only if
 * the active-language label is missing, to avoid rendering an empty label.
 */
export function pickLabel(
  item: { labelEn?: string | null; labelAr?: string | null; label?: string | null },
  locale: Locale | string,
): string {
  const en = item.labelEn ?? item.label ?? ''
  const ar = item.labelAr ?? ''
  return locale === 'ar' ? (ar || en) : (en || ar)
}
