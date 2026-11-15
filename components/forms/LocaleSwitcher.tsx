'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { type Locale } from '@/lib/i18n'
import { setLanguagePreference } from '@/lib/actions/language-preference'

/**
 * Two-button EN/AR switcher. Calls the `setLanguagePreference` server action —
 * the single source of truth — which writes the `avaniis_locale` cookie AND
 * (when authenticated) persists persons.preferred_language with an audit row.
 * Then refreshes so Server Components re-resolve `<html dir>` and chrome.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const switchTo = useCallback(
    (locale: Locale) => {
      if (locale === current) return
      startTransition(async () => {
        await setLanguagePreference(locale)
        router.refresh()
      })
    },
    [current, router],
  )

  return (
    <div className="flex overflow-hidden rounded-md border border-border text-xs">
      {(['en', 'ar'] as Locale[]).map(loc => (
        <button
          key={loc}
          type="button"
          onClick={() => switchTo(loc)}
          disabled={isPending}
          className={`px-2.5 py-1 transition-colors disabled:opacity-60 ${
            current === loc
              ? 'bg-accent text-primary-foreground'
              : 'bg-card text-ink-2 hover:bg-accent-100 hover:text-accent-700'
          }`}
          aria-pressed={current === loc}
        >
          {loc === 'en' ? 'EN' : 'عربي'}
        </button>
      ))}
    </div>
  )
}
