/**
 * Centralized key-based translation lookup — the ONE i18n strategy for shared
 * UI chrome. Plain dictionary lookup against `messages/{en,ar}.json`; safe to
 * import from BOTH Server and Client Components (no react-i18next, no Context).
 *
 * This replaces the previously-dormant react-i18next runtime. Two helpers serve
 * the whole app:
 *   • `t(locale, en, ar)`  (lib/locale-server.ts) — inline one-off bilingual strings
 *   • `tk(locale, key)`    (here)                 — shared/reused keys from the dictionaries
 *
 * Both read the same SSR-resolved `locale`, so there is a single rendering model.
 */
import en from '@/messages/en.json'
import ar from '@/messages/ar.json'
import type { Locale } from './i18n'

const DICTS: Record<Locale, Record<string, unknown>> = { en, ar }

function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  const val = key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    dict,
  )
  return typeof val === 'string' ? val : undefined
}

/**
 * Resolve a dot-path key (e.g. `common.save`) for the active locale.
 * Falls back to the English dictionary, then to `fallback`, then to the key
 * itself — so a missing Arabic key never renders blank or both languages.
 */
export function tk(locale: Locale | string, key: string, fallback?: string): string {
  const loc: Locale = locale === 'ar' ? 'ar' : 'en'
  return lookup(DICTS[loc], key) ?? lookup(DICTS.en, key) ?? fallback ?? key
}
