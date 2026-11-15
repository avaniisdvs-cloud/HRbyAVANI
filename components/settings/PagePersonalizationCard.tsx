'use client'

import { useState, useRef, useTransition } from 'react'
import { Layers, Upload, X } from 'lucide-react'
import {
  updatePagePersonalization,
  uploadBrandingLogo,
  uploadCarouselImage,
  deleteCarouselImage,
  reorderCarouselImages,
  type CarouselImage,
} from '@/modules/config/actions/page-personalization'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { Locale } from '@/lib/i18n'

/** A carousel image is renderable only if it has a non-empty URL. */
function isValidCarouselImage(img: CarouselImage): boolean {
  return typeof img.url === 'string' && img.url.trim() !== ''
}

// ── Types ──────────────────────────────────────────────────────────────────

type Personalization = {
  entityId:          string | null
  topBannerText:     string
  topBannerVisible:  boolean
  tickerText:        string
  tickerVisible:     boolean
  tickerSpeed:       number
  carouselImages:    CarouselImage[]
  logoUrl:           string | null
  carouselHeightPct: number
}

type Props = {
  entityId: string
  initial:  Personalization
}

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(message: string, tone: 'success' | 'warn' = 'success') {
  const el = document.createElement('div')
  el.textContent = message
  Object.assign(el.style, {
    position:     'fixed',
    bottom:       '32px',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   tone === 'success' ? '#1E5B38' : '#8A5A0B',
    color:        '#fff',
    padding:      '12px 20px',
    borderRadius: '10px',
    fontSize:     '13px',
    fontWeight:   '600',
    zIndex:       '9999',
    boxShadow:    '0 8px 24px rgba(0,0,0,0.18)',
    whiteSpace:   'nowrap',
    transition:   'opacity 0.3s',
  })
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 300)
  }, 3200)
}

// ── Sub-section label ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
      textTransform: 'uppercase', letterSpacing: '0.8px',
      fontFamily: 'var(--font-mono)',
    }}>
      {children}
    </span>
  )
}

// ── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative', width: 36, height: 20, borderRadius: 999,
          background: checked ? 'var(--accent)' : 'var(--border)',
          transition: 'background 150ms', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: checked ? 19 : 3,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          transition: 'left 150ms', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </div>
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', fontWeight: 500, userSelect: 'none' }}>
        {label}
      </span>
    </label>
  )
}

// ── Divider ────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '0' }} />
}

// ── Speed labels ───────────────────────────────────────────────────────────

const SPEED_OPTIONS = [
  { label: 'Slow',   value: 60 },
  { label: 'Normal', value: 30 },
  { label: 'Fast',   value: 15 },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function PagePersonalizationCard({ entityId, initial }: Props) {
  const locale = useLocale()
  const [form, setForm] = useState<Personalization>({ ...initial, entityId })
  const [saving, startSave] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  function patch<K extends keyof Personalization>(key: K, value: Personalization[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleSave() {
    startSave(async () => {
      try {
        await updatePagePersonalization(entityId, {
          top_banner_text:     form.topBannerText,
          top_banner_visible:  form.topBannerVisible,
          ticker_text:         form.tickerText,
          ticker_visible:      form.tickerVisible,
          ticker_speed:        form.tickerSpeed,
          carousel_height_pct: form.carouselHeightPct,
          logo_url:            form.logoUrl,
        })
        showToast(locale === 'ar' ? 'تم حفظ تخصيص الصفحة' : 'Page personalization saved')
      } catch {
        showToast(locale === 'ar' ? 'فشل الحفظ — يرجى المحاولة مرة أخرى' : 'Failed to save — please try again', 'warn')
      }
    })
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoError('')
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setLogoError(locale === 'ar' ? 'الملف كبير جداً (الحد الأقصى 2 ميجابايت)' : 'File too large (max 2 MB)'); return }
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) { setLogoError(locale === 'ar' ? 'نوع ملف غير صالح (استخدم PNG أو SVG أو JPG أو WebP)' : 'Invalid file type (use PNG, SVG, JPG, or WebP)'); return }

    // Snapshot the previously-saved logo so we can revert if the upload fails.
    const previousLogo = form.logoUrl

    // Instant optimistic preview (data: URL) — replaced by the persistent URL on success.
    const reader = new FileReader()
    reader.onload = ev => patch('logoUrl', ev.target?.result as string)
    reader.readAsDataURL(file)

    // Upload + persist to page_personalization.logo_url (no separate Save needed).
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadBrandingLogo(entityId, fd)
      if ('error' in result) {
        patch('logoUrl', previousLogo)   // revert the optimistic preview
        setLogoError(result.error)
        showToast(result.error, 'warn')
      } else {
        patch('logoUrl', result.logoUrl) // replace preview with the persisted data URL
        showToast(locale === 'ar' ? 'تم تحديث الشعار' : 'Logo updated')
      }
    } catch (err: unknown) {
      patch('logoUrl', previousLogo)     // revert the optimistic preview
      const msg = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل رفع الشعار' : 'Logo upload failed')
      setLogoError(msg)
      showToast(msg, 'warn')
    } finally {
      setUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleRemoveLogo() {
    patch('logoUrl', null)
    try {
      await updatePagePersonalization(entityId, { logo_url: null })
      showToast(locale === 'ar' ? 'تمت إزالة الشعار' : 'Logo removed')
    } catch {
      showToast(locale === 'ar' ? 'فشلت إزالة الشعار' : 'Failed to remove logo', 'warn')
    }
  }

  async function handleDeleteCarouselImage(imgId: string) {
    try {
      const next = await deleteCarouselImage(entityId, imgId)
      patch('carouselImages', next)
      showToast(locale === 'ar' ? 'تمت إزالة الصورة' : 'Image removed')
    } catch {
      showToast(locale === 'ar' ? 'فشلت إزالة الصورة' : 'Failed to remove image', 'warn')
    }
  }

  // Only count / render carousel entries that have a usable URL. Broken or
  // legacy-polluted entries (empty url) are ignored, never shown as valid.
  const validCarouselImages = form.carouselImages.filter(isValidCarouselImage)

  const tickerPreviewStyle: React.CSSProperties = {
    background:   'var(--accent-900)',
    color:        'rgba(255,255,255,0.85)',
    padding:      '10px 0',
    overflow:     'hidden',
    whiteSpace:   'nowrap',
    borderRadius: 4,
    fontSize:     19,
    fontFamily:   'var(--font-sans)',
    position:     'relative',
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      {/* Card header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Layers size={16} strokeWidth={1.75} style={{ color: 'var(--brand-active)' }} aria-hidden />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3 }}>
              {locale === 'ar' ? 'تخصيص الصفحة' : 'Page Personalization'}
            </div>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginTop: 1 }}>
              {locale === 'ar' ? 'يتحكّم في مظهر ومحتوى صفحة تسجيل الدخول' : 'Controls the sign-in page appearance and content'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 7,
            padding: '9px 16px', fontSize: 'var(--text-body)', fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'background 120ms',
          }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'var(--accent-700)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
        >
          {saving ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" aria-hidden
                style={{ animation: 'spin 0.7s linear infinite' }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              {locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…'}
            </>
          ) : (locale === 'ar' ? 'حفظ التغييرات' : 'Save changes')}
        </button>
      </div>

      {/* ── Sub-section 1: Top Banner ── */}
      <div style={{ padding: '16px 20px' }}>
        <SectionLabel>{locale === 'ar' ? 'الشريط العلوي' : 'Top Banner'}</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16,
        marginTop: 12 }}>
          <Toggle
            checked={form.topBannerVisible}
            onChange={v => patch('topBannerVisible', v)}
            label={locale === 'ar' ? 'إظهار الشريط العلوي' : 'Show top banner'}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.3px', textTransform: 'uppercase',
            marginBottom: 4 }}>
              {locale === 'ar' ? 'نص الشريط' : 'Banner text'}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={form.topBannerText}
                maxLength={120}
                placeholder="AI Driven HR System"
                onChange={e => patch('topBannerText', e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 12px', border: '1px solid var(--border)',
                  borderRadius: 7, fontSize: 'var(--text-body)', fontFamily: 'var(--font-sans)',
                  color: 'var(--ink-1)', background: 'var(--card)', outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-100)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '' }}
              />
              <span style={{
                position: 'absolute', right: 10, bottom: 10,
                fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
              }}>
                {form.topBannerText.length} / 120
              </span>
            </div>
          </div>
        </div>

        {/* Preview strip */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            background: form.topBannerVisible ? 'rgba(0,0,0,0.55)' : 'var(--surface)',
            color: form.topBannerVisible ? '#fff' : 'var(--ink-4)',
            padding: '10px 30px',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 19,
            textAlign: 'center',
            borderRadius: 4,
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            {!form.topBannerVisible && (
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', fontStyle: 'normal' }}>
                {locale === 'ar' ? 'مخفي ·' : 'HIDDEN ·'}
              </span>
            )}
            {form.topBannerText || 'AI Driven HR System'}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Sub-section 2: Ticker ── */}
      <div style={{ padding: '16px 20px' }}>
        <SectionLabel>{locale === 'ar' ? 'الشريط المتحرّك' : 'Scrolling Ticker'}</SectionLabel>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <Toggle
            checked={form.tickerVisible}
            onChange={v => patch('tickerVisible', v)}
            label={locale === 'ar' ? 'إظهار الشريط المتحرّك' : 'Show ticker'}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.3px', textTransform: 'uppercase',
            marginBottom: 4 }}>
              {locale === 'ar' ? 'رسالة الشريط المتحرّك' : 'Ticker message'}
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                value={form.tickerText}
                maxLength={500}
                rows={2}
                placeholder="AVANIIS Stock Price 100$ · Founder — Visionary Leader…"
                onChange={e => patch('tickerText', e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  padding: '9px 12px', border: '1px solid var(--border)',
                  borderRadius: 7, fontSize: 'var(--text-body)', fontFamily: 'var(--font-sans)',
                  color: 'var(--ink-1)', background: 'var(--card)', outline: 'none',
                  lineHeight: 1.5,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-100)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '' }}
              />
              <span style={{
                position: 'absolute', right: 10, bottom: 10,
                fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
              }}>
                {form.tickerText.length} / 500
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '4px 0 0' }}>
              {locale === 'ar'
                ? 'استخدم · (النقطة الوسطى) للفصل بين العناصر. يتحرّك هذا باستمرار على صفحة تسجيل الدخول.'
                : 'Use · (middle dot) to separate items. This scrolls continuously on the sign-in page.'}
            </p>
          </div>
        </div>

        {/* Speed control */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', fontWeight: 500, flexShrink: 0 }}>{locale === 'ar' ? 'سرعة التمرير' : 'Scroll speed'}</span>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            {SPEED_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => patch('tickerSpeed', opt.value)}
                style={{
                  padding: '6px 14px',
                  borderTopWidth: "0px",
                  borderTopStyle: "none",
                  borderTopColor: "currentColor",
                  borderBottomWidth: "0px",
                  borderBottomStyle: "none",
                  borderBottomColor: "currentColor",
                  borderLeftWidth: "0px",
                  borderLeftStyle: "none",
                  borderLeftColor: "currentColor", cursor: 'pointer',
                  fontSize: 'var(--text-body)', fontWeight: 600,
                  background: form.tickerSpeed === opt.value ? 'var(--accent)' : 'var(--card)',
                  color:      form.tickerSpeed === opt.value ? '#fff'           : 'var(--ink-2)',
                  transition: 'background 120ms, color 120ms',
                  borderRightWidth: "1px",
                  borderRightStyle: "solid",
                  borderRightColor: "var(--border)",
                }}
              >
                {locale === 'ar'
                  ? (opt.value === 60 ? 'بطيء' : opt.value === 30 ? 'عادي' : 'سريع')
                  : opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ticker preview */}
        <div style={{ ...tickerPreviewStyle, marginTop: 12 }}>
          <span style={{
            display:    'inline-block',
            whiteSpace: 'nowrap',
            animation:  `ticker-scroll ${form.tickerSpeed}s linear infinite`,
            paddingLeft: '100%',
          }}>
            {form.tickerText || (locale === 'ar' ? 'ستظهر رسالة الشريط المتحرّك هنا…' : 'Your ticker message will appear here…')}
            &nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;
            {form.tickerText || (locale === 'ar' ? 'ستظهر رسالة الشريط المتحرّك هنا…' : 'Your ticker message will appear here…')}
          </span>
          {!form.tickerVisible && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4,
            }}>
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                {locale === 'ar' ? 'مخفي' : 'HIDDEN'}
              </span>
            </div>
          )}
        </div>
      </div>

      <Divider />

      {/* ── Sub-section 3: Logo ── */}
      <div style={{ padding: '16px 20px' }}>
        <SectionLabel>{locale === 'ar' ? 'شعار العلامة التجارية' : 'Brand Logo'}</SectionLabel>
        <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Current logo preview */}
          <div style={{
            width: 120, flexShrink: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 80,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.logoUrl ?? '/avaniis-logo.jpg'}
              alt={locale === 'ar' ? 'الشعار الحالي' : 'Current logo'}
              style={{ maxWidth: '100%', maxHeight: 56, objectFit: 'contain' }}
            />
          </div>

          {/* Upload area */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              onClick={() => logoInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)', borderRadius: 8, padding: '20px',
                textAlign: 'center', cursor: 'pointer',
                transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-050)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '' }}
            >
              <Upload size={24} strokeWidth={1.5} style={{ color: 'var(--ink-4)', margin: '0 auto 8px' }} aria-hidden />
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0, fontWeight: 500 }}>
                {uploading ? (locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…') : (locale === 'ar' ? 'انقر لرفع الشعار' : 'Click to upload logo')}
              </p>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '4px 0 0', lineHeight: 1.5 }}>
                {locale === 'ar'
                  ? 'يُفضّل PNG أو SVG · الحد الأقصى 2 ميجابايت · سيحلّ محل الشعار الحالي في صفحة تسجيل الدخول'
                  : 'PNG or SVG recommended · Max 2 MB · Will replace existing logo on sign-in page'}
              </p>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept=".png,.svg,.jpg,.jpeg,.webp"
              onChange={handleLogoSelect}
              style={{ display: 'none' }}
            />
            {logoError && (
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg, #7A2E2E)', margin: '6px 0 0' }}>
                {logoError}
              </p>
            )}
            {form.logoUrl && (
              <button
                onClick={handleRemoveLogo}
                style={{
                  marginTop: 8, background: 'none', border: 'none',
                  fontSize: 'var(--text-caption)', color: 'var(--brand-active)', cursor: 'pointer', padding: 0,
                  fontWeight: 600,
                }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = ''}
              >
                {locale === 'ar' ? 'إزالة الشعار' : 'Remove logo'}
              </button>
            )}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Sub-section 4: Carousel Images ── */}
      <div style={{ padding: '16px 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6 }}>
          <SectionLabel>{locale === 'ar' ? 'صور العرض الدوّار' : 'Carousel Images'}</SectionLabel>
          {validCarouselImages.length > 0 && (
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)',
              background: 'var(--accent-050)', borderRadius: 20,
              padding: '2px 8px', fontFamily: 'var(--font-mono)',
            }}>
              {locale === 'ar' ? `${validCarouselImages.length} صورة` : `${validCarouselImages.length} image${validCarouselImages.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
          {locale === 'ar'
            ? 'الصور المعروضة في اللوحة اليسرى من صفحة تسجيل الدخول. إذا لم يتم رفع أي صور، تُستخدم صور عقارات أفانيس الافتراضية.'
            : 'Images shown on the left panel of the sign-in page. If none are uploaded, the default AVANIIS property images are used.'}
        </p>

        {/* Existing images grid */}
        {validCarouselImages.length > 0 ? (
          <div data-responsive-grid="true" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}>
            {[...validCarouselImages]
              .sort((a, b) => a.order - b.order)
              .map((img, idx) => (
                <div key={img.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt || (locale === 'ar' ? `صورة العرض الدوّار ${idx + 1}` : `Carousel image ${idx + 1}`)}
                    style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }}
                  />
                  {/* Order badge */}
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    background: 'rgba(0,0,0,0.55)', borderRadius: 4,
                    padding: '1px 6px', fontSize: 'var(--text-caption)', color: '#fff',
                    fontFamily: 'var(--font-mono)', fontWeight: 700,
                  }}>
                    {idx + 1}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteCarouselImage(img.id)}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0, color: '#fff',
                    }}
                    title={locale === 'ar' ? 'إزالة الصورة' : 'Remove image'}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                  {/* Alt text label */}
                  {img.alt && (
                    <div style={{
                      padding: '4px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                      background: 'var(--surface)', borderTop: '1px solid var(--border)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {img.alt}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : (
          /* Empty state */
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 8,
            padding: '20px 16px', textAlign: 'center',
            marginBottom: 16,
            background: 'var(--surface)',
          }}>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0, fontWeight: 500 }}>
              {locale === 'ar' ? 'لم يتم رفع أي صور للعرض الدوّار بعد' : 'No carousel images uploaded yet'}
            </p>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '4px 0 0' }}>
              {locale === 'ar' ? 'ستستخدم صفحة تسجيل الدخول صور عقارات أفانيس الافتراضية.' : 'The sign-in page will use the default AVANIIS property images.'}
            </p>
          </div>
        )}

        <CarouselImageUploader entityId={entityId} onUploaded={images => {
          patch('carouselImages', images)
        }} />
      </div>

      {/* Keyframes for spinner and ticker */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

// ── Carousel image uploader sub-component ──────────────────────────────────

function CarouselImageUploader({
  entityId,
  onUploaded,
}: {
  entityId:   string
  onUploaded: (images: CarouselImage[]) => void
}) {
  const locale = useLocale()
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError(locale === 'ar' ? 'الملف كبير جداً (الحد الأقصى 2 ميجابايت)' : 'File too large (max 2 MB)'); return }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type)) { setError(locale === 'ar' ? 'استخدم PNG أو JPG أو WebP أو SVG' : 'Use PNG, JPG, WebP, or SVG'); return }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadCarouselImage(entityId, fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      onUploaded(result.images)
      showToast(locale === 'ar' ? 'تم رفع الصورة' : 'Image uploaded')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الرفع' : 'Upload failed'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      {error && (
        <p style={{
          fontSize: 'var(--text-caption)', color: '#7A2E2E', margin: '0 0 8px',
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 6, padding: '6px 10px',
        }}>
          {error}
        </p>
      )}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          border: '2px dashed var(--border)', borderRadius: 8, padding: '14px 20px',
          textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'border-color 150ms, background 150ms',
          opacity: uploading ? 0.6 : 1,
        }}
        onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-050)' } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '' }}
      >
        <Upload size={16} strokeWidth={1.75} style={{ color: uploading ? 'var(--brand-active)' : 'var(--ink-4)' }} aria-hidden />
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontWeight: uploading ? 600 : 400 }}>
          {uploading ? (locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…') : (locale === 'ar' ? 'إضافة صورة للعرض الدوّار' : 'Add carousel image')}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg"
        onChange={handleSelect}
        style={{ display: 'none' }}
        disabled={uploading}
      />
    </div>
  )
}
