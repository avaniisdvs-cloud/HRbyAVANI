/**
 * Server-only locale resolution — the SINGLE source of truth for the active
 * UI language. Import only from Server Components / Route Handlers (uses
 * `next/headers` + the Drizzle pool).
 *
 * Resolution order (enterprise model — see docs/audits/i18n-remediation-*):
 *   1. persons.preferred_language — the AUTHENTICATED user's stored preference
 *      is authoritative. A stale browser cookie must never override it.
 *   2. `avaniis_locale` cookie    — fallback for guests / unauthenticated /
 *      first load / when the DB preference is unavailable.
 *   3. 'en'                       — safe default.
 *
 * The header toggle + self-service card both call `setLanguagePreference`,
 * which writes the cookie AND persists the DB column, so after any explicit
 * switch the two agree. Because the DB is authoritative for authenticated
 * users, an explicit toggle is the only way to change their language.
 */
import { cache } from 'react'
import { cookies } from 'next/headers'
import { eq, and } from 'drizzle-orm'
import { db } from './db'
import { persons } from '@/drizzle/schema'
import { TENANT_ID } from './constants'
import { LOCALE_COOKIE, chooseLocale, type Locale } from './i18n'

/**
 * Read the persisted language for a person. `cache()`-wrapped so the root
 * layout and the matching child layout share a single query per render.
 * Returns null on DB error (build/static render) so callers fall back safely.
 */
const getStoredLanguage = cache(async (personId: string): Promise<string | null> => {
  try {
    const [row] = await db
      .select({ pref: persons.preferredLanguage })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)
    return row?.pref ?? null
  } catch {
    return null
  }
})

/**
 * Resolve the effective locale for the current request.
 * @param personId  Optional `session.user.personId`. When supplied, the
 *                   persisted preference wins over any (possibly stale) cookie.
 */
export async function resolveLocale(personId?: string | null): Promise<Locale> {
  const dbPref = personId ? await getStoredLanguage(personId) : null
  const cookieVal = (await cookies()).get(LOCALE_COOKIE)?.value ?? null
  return chooseLocale(dbPref, cookieVal)
}
