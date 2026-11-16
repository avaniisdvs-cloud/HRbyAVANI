'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Globe, Loader2 } from 'lucide-react'
import { type Locale } from '@/lib/i18n'
import { setLanguagePreference } from '@/lib/actions/language-preference'

/**
 * Self-service language preference card. Same backend path as the header
 * toggle (setLanguagePreference → cookie + persons.preferred_language), so
 * there is exactly one source of truth. Reachable by every role.
 *
 * Title/copy follow the active locale so the card itself is never mixed-language.
 */
export function LanguagePreferenceCard({ current }: { current: Locale }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState<Locale | null>(null)

  const ar = current === 'ar'
  const OPTIONS: { value: Locale; label: string; hint: string }[] = [
    { value: 'en', label: 'English', hint: ar ? 'الإنجليزية' : 'Default' },
    { value: 'ar', label: 'العربية', hint: ar ? 'العربية (RTL)' : 'Arabic (RTL)' },
  ]

  const choose = (locale: Locale) => {
    if (locale === current || isPending) return
    startTransition(async () => {
      const res = await setLanguagePreference(locale)
      if (res.ok) {
        setSaved(locale)
        router.refresh()
      }
    })
  }

  return (
    <section
      aria-label={ar ? 'تفضيل اللغة' : 'Language preference'}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        maxWidth: 520,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Globe size={16} style={{ color: 'var(--brand-active)' }} aria-hidden />
        <SectionTitle style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
          {ar ? 'اللغة' : 'Language'}
        </SectionTitle>
      </header>
      <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', marginBottom: 14 }}>
        {ar
          ? 'اختر لغة الواجهة. ينطبق هذا الإعداد على حسابك على جميع الأجهزة.'
          : 'Choose your interface language. This applies to your account across devices.'}
      </p>

      <div role="radiogroup" aria-label={ar ? 'اللغة' : 'Language'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OPTIONS.map(opt => {
          const active = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isPending}
              onClick={() => choose(opt.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 9,
                cursor: active || isPending ? 'default' : 'pointer',
                textAlign: 'start',
                border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)',
                color: 'var(--ink-1)',
                opacity: isPending && !active ? 0.6 : 1,
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 500 }}>{opt.label}</span>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{opt.hint}</span>
              </span>
              {isPending && saved === opt.value
                ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--brand-active)' }} aria-hidden />
                : active
                  ? <Check size={16} style={{ color: 'var(--brand-active)' }} aria-hidden />
                  : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
