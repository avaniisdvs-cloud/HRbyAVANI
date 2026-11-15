'use client'

import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff, Moon, Sun } from 'lucide-react'
import type { CarouselImage } from '@/modules/config/actions/page-personalization'
import AriaLoginWidget from '@/components/aria/AriaLoginWidget'
import type { AriaLoginConfig } from '@/lib/aria/login-config'

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CAROUSEL = [
  '/avaniis_img1_office.jpg',
  '/avaniis_img2_pool.jpg',
  '/avaniis_img3_villa.jpg',
]


const STRINGS = {
  en: {
    welcomeBack:      'Welcome back',
    signInContinue:   'Sign in to continue to AVANIIS HR',
    signInMs:         'Sign in with Microsoft',
    or:               'or',
    emailPlaceholder: 'you@avaniis.example',
    passwordLabel:    'Password',
    signIn:           'Sign In',
    signingIn:        'Signing in…',
    footer:           '© 2026 Avaniis',
    appName:          'AVANIIS HR',
    dark:             'Dark',
    light:            'Light',
  },
  ar: {
    welcomeBack:      'مرحباً بعودتك',
    signInContinue:   'تسجيل الدخول للمتابعة إلى أفانيس HR',
    signInMs:         'تسجيل الدخول عبر Microsoft',
    or:               'أو',
    emailPlaceholder: 'you@avaniis.example',
    passwordLabel:    'كلمة المرور',
    signIn:           'تسجيل الدخول',
    signingIn:        'جارٍ تسجيل الدخول…',
    footer:           '© 2026 أفانيس',
    appName:          'أفانيس HR',
    dark:             'داكن',
    light:            'فاتح',
  },
}

// ── Icons ──────────────────────────────────────────────────────────────────

const MicrosoftLogo = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" fill="none" aria-hidden>
    <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
    <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
)

// ── Error messages ─────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  // Custom errors from signIn callback in lib/auth.ts
  domain_not_allowed:
    'Your email domain is not authorised. Contact IT support.',
  no_email:
    'Could not read your email from Microsoft. Contact IT support.',
  account_disabled:
    'Your account is disabled. Contact HR Admin.',
  auth_error:
    'Authentication error. Please try again.',
  // Auth.js v5 standard error codes
  CredentialsSignin:
    'Incorrect email or password.',
  OAuthSignin:
    'Could not start Microsoft sign-in. Check the Azure App Registration redirect URI.',
  OAuthCallback:
    'Microsoft sign-in failed. Ensure the redirect URI is registered in Azure Portal.',
  OAuthCallbackError:
    'Microsoft sign-in failed. Ensure the redirect URI is registered in Azure Portal.',
  Callback:
    'Sign-in callback error. Contact IT support.',
  Configuration:
    'Auth configuration error. Contact IT support.',
  AccessDenied:
    'Access denied. Your account may not have permission to access this app.',
  Verification:
    'Verification failed. Please try again.',
}

// ── Props ──────────────────────────────────────────────────────────────────

export type LoginPersonalization = {
  topBannerText:     string
  topBannerVisible:  boolean
  tickerText:        string
  tickerVisible:     boolean
  tickerSpeed:       number
  carouselImages:    CarouselImage[]
  logoUrl:           string | null
  carouselHeightPct: number
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoginClient({
  personalization,
  ariaConfig,
  initialError,
  previewAccountsEnabled = false,
}: {
  personalization: LoginPersonalization
  ariaConfig: AriaLoginConfig
  initialError?: string
  previewAccountsEnabled?: boolean
}) {
  const [lang, setLang]           = useState<'en' | 'ar'>('en')
  const [isDark, setIsDark]       = useState(false)
  const [activeSlide, setSlide]   = useState(0)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(
    initialError ? (ERROR_MESSAGES[initialError] ?? 'Sign-in failed. Please try again.') : '',
  )

  const t     = STRINGS[lang]
  const isRtl = lang === 'ar'

  // Ignore carousel entries with a missing/empty URL so we never render a
  // broken <img> (and never crash next/image on an empty src). The default
  // carousel is used only when there are no valid uploaded images.
  const validCarouselUrls = [...personalization.carouselImages]
    .filter(img => typeof img.url === 'string' && img.url.trim() !== '')
    .sort((a, b) => a.order - b.order)
    .map(img => img.url)

  const carouselUrls = validCarouselUrls.length > 0 ? validCarouselUrls : DEFAULT_CAROUSEL

  const logoSrc = personalization.logoUrl && personalization.logoUrl.trim() !== ''
    ? personalization.logoUrl
    : '/avaniis-logo.png'

  useEffect(() => {
    try {
      const m = document.cookie.match(/(?:^|;\s*)avaniis_locale=([^;]+)/)
      if (m?.[1] === 'ar') setLang('ar')
    } catch {}
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-dark', isDark ? 'true' : 'false')
  }, [isDark])

  const advance = useCallback(() => setSlide(s => (s + 1) % carouselUrls.length), [carouselUrls.length])

  useEffect(() => {
    if (carouselPaused || carouselUrls.length < 2) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    const timer = window.setInterval(advance, 6500)
    return () => window.clearInterval(timer)
  }, [advance, carouselPaused, carouselUrls.length])

  async function handleSubmit(emailVal: string, passwordVal: string) {
    setLoading(true)
    setError('')
    try {
      const csrfRes = await fetch('/api/auth/csrf')
      const { csrfToken } = await csrfRes.json() as { csrfToken: string }

      const body = new URLSearchParams({
        email:       emailVal,
        password:    passwordVal,
        csrfToken,
        callbackUrl: `${window.location.origin}/dashboard`,
        json:        'true',
      })

      await fetch('/api/auth/callback/credentials', {
        method:   'POST',
        headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:     body.toString(),
        redirect: 'manual',
      })

      // Check if the session cookie was actually set (success vs failure both return opaque 0)
      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json() as { user?: { email: string } } | null
      if (session?.user?.email) {
        window.location.href = '/dashboard'
      } else {
        setError(lang === 'ar' ? 'بريد إلكتروني أو كلمة مرور غير صحيحة' : 'Invalid email or password')
        setLoading(false)
      }
    } catch {
      setError(lang === 'ar' ? 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.' : 'Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    await handleSubmit(email, password)
  }


  const panelBg     = 'var(--card)'
  const textPrimary = 'var(--ink-1)'
  const textMuted   = 'var(--ink-3)'
  const borderColor = 'var(--border)'
  const surfaceBg   = 'var(--surface)'

  return (
    <div className="login-layout" style={{
      display: 'flex', width: '100vw', height: '100vh',
      overflow: 'hidden',
      direction: isRtl ? 'rtl' : 'ltr',
      fontFamily: 'var(--font-sans, sans-serif)',
    }}>

      {/* LEFT — full-height carousel */}
      <div className="login-carousel" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Brand area stays outside the photographs, including during transitions. */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 156,
          display: 'flex', alignItems: 'center', gap: 24, padding: '12px 32px',
          background: 'var(--surface)', color: 'var(--ink-1)', zIndex: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="AVANIIS" style={{ height: 128, width: 136, objectFit: 'contain', flexShrink: 0 }} />
          {personalization.topBannerVisible && personalization.topBannerText && (
            <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              fontSize: 19, lineHeight: 1.4 }}>{personalization.topBannerText}</p>
          )}
        </div>

        {carouselUrls.map((src, i) => (
          <div key={i} style={{
            position: 'absolute', top: 156, bottom: 0, left: 0, right: 0,
            opacity: i === activeSlide ? 1 : 0,
            transition: 'opacity 2s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {/* Plain <img> (not next/image) so DB-backed base64 data: URLs render. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ))}

        <div style={{
          position: 'absolute', top: 156, bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, rgba(6,12,20,0.88) 0%, rgba(6,12,20,0.15) 50%, rgba(6,12,20,0.28) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Branding */}
        <div style={{
          position: 'absolute', bottom: 52,
          [isRtl ? 'right' : 'left']: 44,
          color: 'white', zIndex: 10,
        }}>
          <p style={{ fontSize: 38, fontFamily: 'var(--font-serif, serif)', letterSpacing: '-0.9px', margin: '4px 0 0', fontWeight: 400, lineHeight: 1.1 }}>{t.appName}</p>
        </div>

        {/* Slide dots */}
        <div style={{
          position: 'absolute', bottom: 20,
          [isRtl ? 'right' : 'left']: 44,
          display: 'flex', gap: 6, width: 200, zIndex: 10,
        }}>
          {carouselUrls.map((_, i) => (
            <button key={i} onClick={() => { setCarouselPaused(true); setSlide(i) }} aria-current={i === activeSlide ? 'true' : undefined} aria-label={isRtl ? `شريحة ${i + 1}` : `Slide ${i + 1}`}
              style={{
                flex: i === activeSlide ? 3 : 1, height: 3, borderRadius: 99,
                background: 'white',
                opacity: i === activeSlide ? 1 : 0.3,
                border: 'none', cursor: 'pointer',
                transition: 'flex 0.4s, opacity 0.4s', padding: 0,
              }}
            />
          ))}
          <button onClick={() => setCarouselPaused(p => !p)}
            aria-label={isRtl ? (carouselPaused ? 'تشغيل عرض الصور' : 'إيقاف عرض الصور مؤقتاً') : (carouselPaused ? 'Play slideshow' : 'Pause slideshow')}
            style={{ color: 'white', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', alignSelf: 'center', fontSize: 14, lineHeight: 1 }}>
            {carouselPaused ? '▶' : 'Ⅱ'}
          </button>
        </div>

        {/* Ticker */}
        {personalization.tickerVisible && personalization.tickerText && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.55)', overflow: 'hidden',
            zIndex: 20, padding: '10px 0',
          }}>
            <span style={{
              display: 'inline-block', whiteSpace: 'nowrap',
              color: 'rgba(255,255,255,0.92)', fontSize: 19,
              fontFamily: 'var(--font-sans)',
              animation: 'none',
              paddingLeft: '100%',
            }}>
              {personalization.tickerText}&nbsp;&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;&nbsp;
              {personalization.tickerText}&nbsp;&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;&nbsp;
              {personalization.tickerText}
            </span>
          </div>
        )}
      </div>

      {/* RIGHT — Login panel */}
      <div className="login-panel" style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: panelBg,
        boxShadow: isRtl ? '8px 0 60px rgba(0,0,0,0.25)' : '-8px 0 60px rgba(0,0,0,0.25)',
        padding: '32px 40px 88px', overflowY: 'auto',
      }}>

        {/* Top bar — lang + dark toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', background: surfaceBg }}>
            {(['en', 'ar'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                aria-pressed={lang === l}
                style={{
                  padding: '5px 12px', fontSize: 'var(--text-caption)', fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: lang === l ? 'var(--accent)' : 'transparent',
                  color: lang === l ? 'white' : textMuted,
                  transition: 'background 0.2s',
                }}>
                {l === 'en' ? 'EN' : 'عربي'}
              </button>
            ))}
          </div>
          <button onClick={() => setIsDark(d => !d)}
            aria-pressed={isDark}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              border: `1px solid ${borderColor}`, background: 'transparent',
              cursor: 'pointer', fontSize: 'var(--text-caption)', color: textMuted,
            }}>
            {isDark
              ? <Sun  width={14} height={14} aria-hidden strokeWidth={2} />
              : <Moon width={14} height={14} aria-hidden strokeWidth={2} />}
            {isDark ? t.light : t.dark}
          </button>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif, serif)', fontSize: 26, fontWeight: 400,
            margin: 0, color: textPrimary, letterSpacing: '-0.3px',
          }}>
            {t.welcomeBack}
          </h1>
          <p style={{ marginTop: 6, fontSize: 14, color: textMuted }}>{t.signInContinue}</p>
        </div>

        {/* Microsoft SSO button */}
        <button
          onClick={async () => {
            setLoading(true)
            setError('')
            try {
              const csrfRes = await fetch('/api/auth/csrf')
              const { csrfToken } = await csrfRes.json() as { csrfToken: string }
              const res = await fetch('/api/auth/signin/microsoft-entra-id', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'X-Auth-Return-Redirect': '1',
                },
                body: new URLSearchParams({ csrfToken, callbackUrl: '/dashboard' }).toString(),
              })
              const data = await res.json() as { url?: string }
              if (data.url) {
                window.location.href = data.url
              } else {
                setError(lang === 'ar' ? 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.' : 'Sign-in failed. Please try again.')
                setLoading(false)
              }
            } catch {
              setError(lang === 'ar' ? 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.' : 'Sign-in failed. Please try again.')
              setLoading(false)
            }
          }}
          disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, height: 44, borderRadius: 9, border: `1.5px solid ${borderColor}`,
            background: 'var(--card)', fontSize: 14, fontWeight: 600, color: textPrimary,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
          <MicrosoftLogo />
          {t.signInMs}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{
            fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ink-3)', whiteSpace: 'nowrap',
          }}>
            {lang === 'ar' ? 'بيانات المستخدم' : 'User Credentials'}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Error */}
        {error && (
          <p role="alert" aria-live="polite" style={{
            fontSize: 'var(--text-body)', color: 'var(--destructive)',
            background: 'var(--surface)', border: '1px solid var(--destructive)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 14,
          }}>
            {error}
          </p>
        )}

        {/* Credentials form */}
        <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label htmlFor="login-email" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            {lang === 'ar' ? 'البريد الإلكتروني' : 'Email address'}
          </label>
          <input
            id="login-email"
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder} required autoComplete="email"
            disabled={loading}
            className="login-field"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ position: 'relative' }}>
            <label htmlFor="login-password" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
              {lang === 'ar' ? 'كلمة المرور' : 'Password'}
            </label>
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t.passwordLabel} required autoComplete="current-password"
              disabled={loading}
              className="login-field"
              style={{ width: '100%', boxSizing: 'border-box', paddingInlineEnd: 42 }}
            />
            <button
              type="button" onClick={() => setShowPw(v => !v)} tabIndex={0}
              style={{
                position: 'absolute', [isRtl ? 'left' : 'right']: 12, top: '50%',
                transform: 'translateY(-50%)', background: 'none', border: 'none',
                cursor: 'pointer', color: textMuted, padding: 0,
                display: 'flex', alignItems: 'center',
              }}
              aria-label={showPw ? (isRtl ? 'إخفاء كلمة المرور' : 'Hide password') : (isRtl ? 'إظهار كلمة المرور' : 'Show password')}>
              {showPw
                ? <EyeOff width={18} height={18} aria-hidden strokeWidth={2} />
                : <Eye    width={18} height={18} aria-hidden strokeWidth={2} />}
            </button>
          </div>
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', height: 44, borderRadius: 9, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, marginTop: 4,
            }}>
            {loading ? t.signingIn : t.signIn}
          </button>
        </form>

        {/* Super Admin only note */}
        <p style={{
          fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textAlign: 'center', margin: '8px 0 0',
        }}>
          {previewAccountsEnabled
            ? (lang === 'ar' ? 'بيئة تجريبية محلية · كلمة مرور الحسابات التجريبية: demo' : 'Local preview · Demo account password: demo')
            : (lang === 'ar' ? 'استخدم حساب تسجيل الدخول المعتمد لك.' : 'Use your approved sign-in account.')}
        </p>


        {/* Footer */}
        <p style={{ marginTop: 24, fontSize: 'var(--text-caption)', textAlign: 'center', color: 'var(--ink-3)', lineHeight: 1.5 }}>
          {t.footer}
        </p>
      </div>

      <AriaLoginWidget lang={lang} ariaConfig={ariaConfig} />

      <style>{`
        @keyframes ticker-ltr {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        /* Login panel — responsive */
        .login-panel {
          width: 440px;
          min-width: 340px;
          flex-shrink: 0;
        }
        /* Narrow viewports: stack carousel behind, panel full-width */
        @media (max-width: 820px) {
          .login-layout { flex-direction: column !important; height: auto !important; min-height: 100vh !important; }
          .login-carousel { display: none !important; }
          .login-panel { width: 100% !important; min-width: 0 !important; max-width: 100% !important; box-shadow: none !important; padding: 32px 24px 88px !important; }
        }
        @media (max-width: 480px) {
          .login-panel { padding: 24px 20px 88px !important; }
        }
      `}</style>
    </div>
  )
}
