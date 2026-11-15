'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Check, Palette, Moon, Sun, AlignJustify } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { updatePolicySetting } from '@/modules/config'
import { pickLabel, type Locale } from '@/lib/i18n'

const THEMES = [
  { id: 'teal',     hex: '#2E6170', labelEn: 'Teal',     labelAr: 'أزرق مخضر' },
  { id: 'forest',   hex: '#2F5D36', labelEn: 'Forest',   labelAr: 'أخضر غابة' },
  { id: 'midnight', hex: '#2B4890', labelEn: 'Midnight', labelAr: 'منتصف الليل' },
  { id: 'plum',     hex: '#6B3458', labelEn: 'Plum',     labelAr: 'بنفسجي' },
  { id: 'amber',    hex: '#8E5E18', labelEn: 'Amber',    labelAr: 'كهرماني' },
  { id: 'rose',     hex: '#A03868', labelEn: 'Rose',     labelAr: 'وردي' },
  { id: 'slate',    hex: '#365578', labelEn: 'Slate',    labelAr: 'رمادي أزرق' },
] as const

const DENSITIES = [
  { id: 'comfortable', labelEn: 'Comfortable', labelAr: 'مريح' },
  { id: 'compact',     labelEn: 'Compact',     labelAr: 'مضغوط' },
  { id: 'spacious',    labelEn: 'Spacious',    labelAr: 'فسيح' },
] as const

interface Props {
  legalEntityId:  string
  initialAccent:  string
  initialDark:    string
  initialDensity: string
  locale?:        Locale
}

export function AppearanceSettingsClient({
  legalEntityId,
  initialAccent,
  initialDark,
  initialDensity,
  locale = 'en',
}: Props) {
  const ar = locale === 'ar'
  const [accent,  setAccent]  = useState(initialAccent  || 'teal')
  const [dark,    setDark]    = useState(initialDark === 'true')
  const [density, setDensity] = useState(initialDensity || 'comfortable')
  const [pending, start]      = useTransition()
  const { toast }             = useToast()

  function applyAccent(id: string) {
    setAccent(id)
    document.body.setAttribute('data-accent', id)
    localStorage.setItem('avaniis_accent', id)
  }

  function applyDark(on: boolean) {
    setDark(on)
    document.body.setAttribute('data-dark', on ? 'true' : 'false')
    localStorage.setItem('avaniis_dark', on ? 'true' : 'false')
  }

  function applyDensity(d: string) {
    setDensity(d)
    document.body.setAttribute('data-density', d)
    localStorage.setItem('avaniis_density', d)
  }

  function onSave() {
    start(async () => {
      try {
        await Promise.all([
          updatePolicySetting('UI_ACCENT_THEME', legalEntityId, accent),
          updatePolicySetting('UI_DARK_MODE',    legalEntityId, dark ? 'true' : 'false'),
          updatePolicySetting('UI_DENSITY',      legalEntityId, density),
        ])
        toast({
          title:       ar ? 'تم حفظ المظهر' : 'Appearance saved',
          description: ar ? 'ستُطبّق التغييرات عند التحميل التالي للصفحة لجميع المستخدمين.' : 'Changes will apply on next page load for all users.',
        })
      } catch {
        // Show a readable message rather than the raw server error (which is
        // sanitized to an opaque digest in production builds).
        toast({
          title:       ar ? 'فشل الحفظ' : 'Save failed',
          description: ar ? 'حدث خطأ أثناء الحفظ. يرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني.' : 'Something went wrong while saving. Please try again or contact IT support.',
          variant:     'destructive',
        })
      }
    })
  }

  return (
    <div className="space-y-6">

      {/* ── Section A — Accent Theme Picker ────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <Palette className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="font-sans text-sm font-semibold text-ink-1">
            {ar ? 'لون المظهر' : 'Accent theme'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-4">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => applyAccent(t.id)}
              aria-label={pickLabel(t, locale)}
              aria-pressed={accent === t.id}
              title={pickLabel(t, locale)}
              className="group relative flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              style={{
                backgroundColor: t.hex,
                boxShadow:
                  accent === t.id
                    ? `0 0 0 2.5px white, 0 0 0 4.5px ${t.hex}`
                    : undefined,
              }}
            >
              {accent === t.id && (
                <Check
                  className="h-4 w-4 text-white"
                  aria-hidden
                  strokeWidth={2.5}
                />
              )}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-ink-3">
          {pickLabel(THEMES.find(t => t.id === accent) ?? THEMES[0], locale)}
        </p>
      </section>

      {/* ── Section B — Dark Mode Toggle ────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {dark
              ? <Moon className="h-5 w-5 text-accent" aria-hidden />
              : <Sun  className="h-5 w-5 text-accent" aria-hidden />
            }
            <div>
              <p className="font-sans text-sm font-semibold text-ink-1">
                {ar ? 'الوضع الداكن' : 'Dark mode'}
              </p>
              <p className="mt-0.5 text-xs text-ink-3">
                {dark ? (ar ? 'داكن' : 'Dark') : (ar ? 'فاتح' : 'Light')}
              </p>
            </div>
          </div>

          <button
            role="switch"
            aria-checked={dark}
            onClick={() => applyDark(!dark)}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
              'transition-colors focus:outline-none focus-visible:ring-2',
              'focus-visible:ring-accent focus-visible:ring-offset-2',
              dark ? 'bg-accent' : 'bg-ink-4',
            ].join(' ')}
          >
            <span
              className={[
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
                'transform transition-transform',
                dark ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')}
            />
          </button>
        </div>
      </section>

      {/* ── Section C — Density Toggle ──────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <AlignJustify className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="font-sans text-sm font-semibold text-ink-1">
            {ar ? 'كثافة العرض' : 'Display density'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          {DENSITIES.map(d => (
            <button
              key={d.id}
              onClick={() => applyDensity(d.id)}
              aria-pressed={density === d.id}
              className={[
                'rounded-lg border px-5 py-2.5 text-sm transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                density === d.id
                  ? 'border-accent bg-accent-050 font-medium text-accent-700'
                  : 'border-border bg-surface text-ink-2 hover:border-accent hover:text-ink-1',
              ].join(' ')}
            >
              <span className="block font-medium" {...(ar ? { dir: 'rtl' as const, lang: 'ar' } : {})}>{pickLabel(d, locale)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Section D — Logo (display only) ─────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-5 font-sans text-sm font-semibold text-ink-1">
          {ar ? 'الشعار' : 'Logo'}
        </h2>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-shrink-0 rounded-lg border border-border bg-surface p-4">
            <Image
              src="/avaniis-logo.png"
              height={48}
              width={160}
              alt={ar ? 'أفانيس للموارد البشرية' : 'AVANIIS HR'}
              className="object-contain"
            />
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            {ar ? (
              <span dir="rtl" lang="ar">لتحديث الشعار، استبدل الملف وأعد النشر.</span>
            ) : (
              <>
                To update the logo, replace{' '}
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-accent">
                  public/avaniis-logo.png
                </code>{' '}
                and redeploy.
              </>
            )}
          </p>
        </div>
      </section>

      {/* ── Save ─────────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onSave}
          disabled={pending}
          className={[
            'rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white',
            'transition-colors hover:bg-accent-700',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {pending
            ? (ar ? 'جاري الحفظ…' : 'Saving…')
            : (ar ? 'حفظ المظهر' : 'Save appearance')}
        </button>
      </div>
    </div>
  )
}
