'use client'

/**
 * LocaleProvider — distributes the ALREADY-RESOLVED active locale to Client
 * Components so they can localize toasts/placeholders/validation without
 * prop-drilling `locale` through every layer.
 *
 * IMPORTANT: this is locale DISTRIBUTION, not a translation library. The
 * locale value still comes exclusively from the server resolver
 * (`lib/language-preference.ts` → cookie/DB), passed in once at the
 * authenticated shell. Translation itself still uses the single strategy:
 * `t(locale, en, ar)`, `tk(locale, key)`, and `pickLabel(item, locale)`.
 * No react-i18next, no second source of truth.
 */
import { createContext, useContext } from 'react'
import type { Locale } from '@/lib/i18n'

const LocaleContext = createContext<Locale>('en')

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** Read the active locale inside any Client Component. Defaults to 'en'. */
export function useLocale(): Locale {
  return useContext(LocaleContext)
}
