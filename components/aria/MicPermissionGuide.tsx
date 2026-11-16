'use client'
import { useState } from 'react'
import type { MicGuideType } from './useMicPermission'

// ─── Types ────────────────────────────────────────────────────────────────────

type Browser = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other'

export interface MicPermissionGuideProps {
  type:       Exclude<MicGuideType, null>
  onTryAgain: () => void
  onUseText:  () => void
  isRtl?:     boolean
  /** Compact mode for use inside the fixed-height chat widget */
  compact?:   boolean
}

// ─── Browser detection ────────────────────────────────────────────────────────

function detectBrowser(): Browser {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (ua.includes('Edg/'))     return 'edge'
  if (ua.includes('Chrome'))   return 'chrome'
  if (ua.includes('Firefox'))  return 'firefox'
  if (ua.includes('Safari'))   return 'safari'
  return 'other'
}

// ─── Browser step data ────────────────────────────────────────────────────────

const BROWSER_LABEL: Record<Browser, { en: string; ar: string }> = {
  chrome:  { en: 'Chrome',   ar: 'كروم' },
  safari:  { en: 'Safari',   ar: 'سفاري' },
  firefox: { en: 'Firefox',  ar: 'فايرفوكس' },
  edge:    { en: 'Edge',     ar: 'إيدج' },
  other:   { en: 'Other',    ar: 'أخرى' },
}

const BROWSER_STEPS: Record<Browser, { name: string; steps: { en: string; ar: string }[] }> = {
  chrome: {
    name: 'Google Chrome',
    steps: [
      { en: 'Click the 🔒 lock icon left of the address bar', ar: 'انقر على أيقونة 🔒 يسار شريط العنوان' },
      { en: 'Click "Site settings"',                          ar: 'انقر على "إعدادات الموقع"' },
      { en: 'Find "Microphone" and change to "Allow"',        ar: 'ابحث عن "الميكروفون" وغيّره إلى "السماح"' },
      { en: 'Refresh the page and try again',                  ar: 'أعد تحميل الصفحة وحاول مرة أخرى' },
    ],
  },
  safari: {
    name: 'Safari',
    steps: [
      { en: 'Go to Safari menu → Settings (or Preferences)',    ar: 'اذهب إلى قائمة Safari ← الإعدادات' },
      { en: 'Click "Websites" → "Microphone"',                  ar: 'انقر على "المواقع" ← "الميكروفون"' },
      { en: 'Find this site and set to "Allow"',                ar: 'ابحث عن هذا الموقع وغيّره إلى "السماح"' },
      { en: 'Return to this page and try again',                ar: 'ارجع إلى هذه الصفحة وحاول مرة أخرى' },
    ],
  },
  firefox: {
    name: 'Firefox',
    steps: [
      { en: 'Click the 🔒 lock icon in the address bar',                ar: 'انقر على أيقونة 🔒 في شريط العنوان' },
      { en: 'Click the arrow next to "Connection Secure"',              ar: 'انقر على السهم بجانب "الاتصال آمن"' },
      { en: 'Click "More Information" → "Permissions"',                 ar: 'انقر على "معلومات إضافية" ← "الأذونات"' },
      { en: 'Find "Use the Microphone" and uncheck "Block"',            ar: 'ابحث عن "استخدام الميكروفون" وألغِ تحديد "حظر"' },
      { en: 'Refresh the page and try again',                           ar: 'أعد تحميل الصفحة وحاول مرة أخرى' },
    ],
  },
  edge: {
    name: 'Microsoft Edge',
    steps: [
      { en: 'Click the 🔒 lock icon in the address bar',      ar: 'انقر على أيقونة 🔒 في شريط العنوان' },
      { en: 'Click "Permissions for this site"',              ar: 'انقر على "أذونات هذا الموقع"' },
      { en: 'Find "Microphone" and change to "Allow"',        ar: 'ابحث عن "الميكروفون" وغيّره إلى "السماح"' },
      { en: 'Refresh the page and try again',                  ar: 'أعد تحميل الصفحة وحاول مرة أخرى' },
    ],
  },
  other: {
    name: 'Your browser',
    steps: [
      { en: 'Look for a 🔒 or ⚠️ icon in the address bar',           ar: 'ابحث عن أيقونة 🔒 أو ⚠️ في شريط العنوان' },
      { en: 'Click it and look for "Microphone" or "Permissions"',   ar: 'انقر عليها وابحث عن "الميكروفون" أو "الأذونات"' },
      { en: 'Change microphone from "Blocked" to "Allowed"',         ar: 'غيّر الميكروفون من "محظور" إلى "مسموح"' },
      { en: 'Refresh the page and try again',                         ar: 'أعد تحميل الصفحة وحاول مرة أخرى' },
    ],
  },
}

const BROWSERS: Browser[] = ['chrome', 'safari', 'firefox', 'edge', 'other']

// ─── Design tokens (matching AVANIIS system) ──────────────────────────────────
const ARIA_GOLD   = '#A6803A'
const RED_FG      = 'var(--status-rejected-fg, #A32D2D)'
const AMBER_FG    = 'var(--status-pending-fg, #8A5A0B)'

// ─── Component ────────────────────────────────────────────────────────────────

export default function MicPermissionGuide({
  type,
  onTryAgain,
  onUseText,
  isRtl   = false,
  compact = false,
}: MicPermissionGuideProps) {
  const [activeBrowser, setActiveBrowser] = useState<Browser>(detectBrowser)

  const canRetry = type === 'denied' || type === 'no-device' || type === 'in-use'

  // ── i18n strings ────────────────────────────────────────────────────────────
  const t = isRtl ? {
    titles: {
      denied:          'مطلوب إذن الميكروفون',
      'no-device':     'لم يُعثر على ميكروفون',
      'in-use':        'الميكروفون مشغول',
      'https-required':'مطلوب اتصال آمن',
      'not-supported': 'المتصفح لا يدعم الإدخال الصوتي',
    },
    subs: {
      denied:
        'للاستخدام الصوتي مع آريا، يرجى السماح بالوصول إلى الميكروفون في متصفحك.',
      'no-device':
        'يبدو أن جهازك لا يحتوي على ميكروفون أو أنه غير متصل.',
      'in-use':
        'يستخدم تطبيق آخر الميكروفون حالياً (مثل مكالمة فيديو أو تطبيق تسجيل). أغلق التطبيق الآخر وحاول مرة أخرى.',
      'https-required':
        'الإدخال الصوتي يتطلب اتصال HTTPS. يرجى التواصل مع مسؤول النظام.',
      'not-supported':
        'متصفحك لا يدعم الإدخال الصوتي. استخدم Chrome أو Edge أو Safari.',
    },
    noDeviceHints: [
      'قم بتوصيل سماعة رأس أو ميكروفون خارجي',
      'تحقق من إعدادات الصوت في جهازك',
      'على سطح المكتب: تأكد من توصيل ميكروفون',
    ],
    tryAgain: 'حاول مرة أخرى',
    useText:  'استخدم النص بدلاً ←',
  } : {
    titles: {
      denied:           'Microphone access needed',
      'no-device':      'No microphone detected',
      'in-use':         'Microphone is busy',
      'https-required': 'Secure connection required',
      'not-supported':  'Browser not supported',
    },
    subs: {
      denied:
        'To use voice with ARIA, allow microphone access in your browser.',
      'no-device':
        "Your device doesn't appear to have a microphone, or it's not connected yet.",
      'in-use':
        'Another application is currently using your microphone (e.g. a video call, recording app). Close it and try again.',
      'https-required':
        'Voice input requires a secure connection (HTTPS). Contact your administrator.',
      'not-supported':
        "Your browser doesn't support voice input. Try Chrome, Edge, or Safari.",
    },
    noDeviceHints: [
      'Connect a headset or external microphone',
      "Check your device's audio settings",
      'On desktop: check if a mic is plugged in',
    ],
    tryAgain: 'Try again',
    useText:  'Use text instead →',
  }

  const headerColor = (type === 'denied') ? RED_FG : AMBER_FG

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        background:          'var(--card)',
        border:              '1px solid var(--border)',
        borderInlineStart:   `4px solid ${ARIA_GOLD}`,
        borderRadius:        12,
        padding:             compact ? '12px 14px' : '20px',
        margin:              compact ? '0 0 8px' : '12px 0',
        animation:           'micGuide-in 200ms ease both',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 18, flexShrink: 0, color: headerColor }}>🎤</span>
        <div>
          <p style={{
            margin: 0, fontSize: 'var(--text-body)', fontWeight: 600,
            color: 'var(--ink-1)', fontFamily: 'var(--font-serif, serif)',
          }}>
            {t.titles[type]}
          </p>
          <p style={{
            margin: '3px 0 0', fontSize: 'var(--text-caption)',
            color: 'var(--ink-3)', lineHeight: 1.5,
          }}>
            {t.subs[type]}
          </p>
        </div>
      </div>

      {/* ── Denied: browser tab picker + step list ── */}
      {type === 'denied' && (
        <>
          {/* Browser pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {BROWSERS.map(b => (
              <button
                key={b}
                onClick={() => setActiveBrowser(b)}
                style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 'var(--text-caption)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  background: activeBrowser === b ? ARIA_GOLD : 'var(--surface)',
                  color:      activeBrowser === b ? 'white'    : 'var(--ink-3)',
                  border:     `1px solid ${activeBrowser === b ? ARIA_GOLD : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {BROWSER_LABEL[b][isRtl ? 'ar' : 'en']}
              </button>
            ))}
          </div>

          {/* Step card */}
          <div style={{
            background: 'var(--surface)',
            border:     '1px solid var(--border)',
            borderRadius: 8,
            padding:    '10px 12px',
            marginBottom: 12,
          }}>
            <p style={{
              margin: '0 0 8px', fontSize: 'var(--text-caption)', fontWeight: 700,
              color: 'var(--ink-3)', letterSpacing: '0.07em', textTransform: 'uppercase',
            }}>
              {BROWSER_STEPS[activeBrowser].name}
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {BROWSER_STEPS[activeBrowser].steps.map((step, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                    background: `${ARIA_GOLD}22`, color: ARIA_GOLD,
                    fontSize: 'var(--text-caption)', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {step[isRtl ? 'ar' : 'en']}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* ── No device: hint bullets ── */}
      {type === 'no-device' && (
        <ul style={{
          margin: '0 0 12px', padding: 0, listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          {t.noDeviceHints.map((hint, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
              <span style={{ color: ARIA_GOLD, flexShrink: 0 }}>•</span>
              {hint}
            </li>
          ))}
        </ul>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canRetry && (
          <button
            onClick={onTryAgain}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 'var(--text-caption)', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              background: 'var(--accent)', color: "var(--on-accent)", border: 'none',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {t.tryAgain}
          </button>
        )}
        <button
          onClick={onUseText}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 'var(--text-caption)',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            background: 'transparent', color: 'var(--ink-2)',
            border: '1px solid var(--border)',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = ARIA_GOLD)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          {t.useText}
        </button>
      </div>

      <style>{`
        @keyframes micGuide-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
