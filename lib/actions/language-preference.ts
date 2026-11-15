'use server'

/**
 * Server action: set the active UI language. Single entry point for BOTH
 * language controls (header toggle + self-service preference) so they share
 * one source of truth.
 *
 * Behavior:
 *   • Always writes the `avaniis_locale` cookie (immediate, per-device hint).
 *   • When authenticated, also persists persons.preferred_language inside a
 *     transaction paired with an audit row (ADR-001 Hard Rule 1).
 *
 * Authorization: any authenticated user may change THEIR OWN language. This
 * is a self-scoped preference write — it touches only the caller's person row
 * and never elevates privilege, so no HIGH_PRIVILEGE_ROLES / requireRole gate
 * applies. Guests (no session) get the cookie only.
 */
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { LOCALE_COOKIE, isSupported, type Locale } from '@/lib/i18n'

const ONE_YEAR = 60 * 60 * 24 * 365

export async function setLanguagePreference(
  locale: Locale,
): Promise<{ ok: true; locale: Locale } | { ok: false; error: string }> {
  // Validate — never trust the client. Falls back to a hard error, not a guess.
  if (!isSupported(locale)) {
    return { ok: false, error: 'UNSUPPORTED_LOCALE' }
  }

  // 1. Cookie — device hint, applied on the next render (no PII, no httpOnly).
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    path:     '/',
    maxAge:   ONE_YEAR,
    sameSite: 'lax',
  })

  // 2. Persist to the authenticated user's person row (DB = durable, cross-device).
  const session = await auth()
  const user = session?.user
  if (user?.personId) {
    try {
      await db.transaction(async tx => {
        const [before] = await tx
          .select({
            pref:          persons.preferredLanguage,
            legalEntityId: persons.legalEntityId,
          })
          .from(persons)
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, user.personId!)))
          .limit(1)

        // No-op if unchanged — avoid a redundant write + audit row.
        if (!before || before.pref === locale) return

        await tx
          .update(persons)
          .set({ preferredLanguage: locale })
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, user.personId!)))

        // BR-AUDIT-001 — paired audit row in the SAME transaction.
        await writeAuditLog(
          {
            actorId:       user.id,
            actorName:     user.name ?? user.email ?? 'user',
            actorRole:     user.role,
            actorEntityId: before.legalEntityId ?? undefined,
            channel:       'WEB',
            eventType:     'PERSON.PREFERENCE.LANGUAGE_CHANGED',
            resourceType:  'persons',
            resourceId:    user.personId!,
            entityId:      before.legalEntityId ?? undefined,
            changedFields: ['preferredLanguage'],
            oldValues:     { preferredLanguage: before.pref },
            newValues:     { preferredLanguage: locale },
            description:   `Language preference changed to ${locale}`,
          },
          tx,
        )
      })
    } catch {
      // DB write failed — the cookie still applies so the UI switches; the
      // durable preference simply isn't updated this time. Don't block the user.
      return { ok: true, locale }
    }
  }

  // Re-render server tree so <html dir>, nav, and chrome pick up the new locale.
  revalidatePath('/', 'layout')
  return { ok: true, locale }
}
