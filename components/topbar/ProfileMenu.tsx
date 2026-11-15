'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  User, Calendar, Palette, KeyRound, LogOut,
  ChevronRight, Settings,
} from 'lucide-react'
import { getPreferences, updatePreferences } from '@/modules/notification'
import { useLocale } from '@/components/providers/LocaleProvider'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:    'Super Admin',
  HR_ADMIN:       'HR Admin',
  HR_DIRECTOR:    'HR Director',
  LINE_MANAGER:   'Line Manager',
  FINANCE_ADMIN:  'Finance Admin',
  EMPLOYEE:       'Employee',
  MANAGER:        'Line Manager',
  PAYROLL_ADMIN:  'Payroll Admin',
}

interface Props {
  userName:    string
  userRole:    string
  initials:    string
  personId?:   string
  isEmployee?: boolean
  ssoProvider?: string
  photoUrl?:   string | null
  onClose:     () => void
}

type SubPanel = 'leave-rules' | 'personalisation' | null

export function ProfileMenu({
  userName,
  userRole,
  initials,
  personId,
  isEmployee,
  ssoProvider,
  photoUrl,
  onClose,
}: Props) {
  const router         = useRouter()
  const locale         = useLocale()
  const [sub, setSub]  = useState<SubPanel>(null)

  const roleLabel = ROLE_LABELS[userRole] ?? userRole

  const isMsProvider = ssoProvider === 'MICROSOFT_AD'

  function goToProfile() {
    onClose()
    if (isEmployee) {
      router.push('/me/profile')
    } else if (userRole === 'MANAGER') {
      // MANAGER role: always show personal ESS profile within the admin shell.
      // Routing to /me/profile would be intercepted by (employee)/layout.tsx and
      // redirected to /dashboard. /my-profile renders the same ProfilePageClient
      // but stays inside the hr-admin layout.
      router.push('/my-profile')
    } else if (personId) {
      router.push(`/persons/${personId}`)
    } else {
      router.push('/me/profile')
    }
  }

  function handleSignOut() {
    onClose()
    signOut({ callbackUrl: '/sign-in' })
  }

  return (
    <div
      role="dialog"
      aria-label={locale === 'ar' ? 'قائمة الملف الشخصي' : 'Profile menu'}
      style={{
        position:     'fixed',
        top:          60,
        right:        16,
        width:        260,
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 14,
        boxShadow:    '0 8px 32px rgba(0,0,0,0.16)',
        zIndex:       150,
        overflow:     'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding:      '14px 14px 12px',
        borderBottom: '1px solid var(--border)',
        display:      'flex', alignItems: 'center', gap: 10,
      }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            aria-hidden
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--accent)', color: 'var(--card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)', flexShrink: 0,
          }}>
            {initials}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)',
            fontFamily: 'var(--font-sans)', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {userName}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', marginTop: 1 }}>
            {roleLabel}
          </div>
        </div>
      </div>

      {/* Menu items */}
      {sub === null && (
        <div style={{ padding: 6 }}>
          <MenuItem
            icon={<User size={14} />}
            label={locale === 'ar' ? 'ملفي الشخصي' : 'My Profile'}
            onClick={goToProfile}
          />
          {['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE'].includes(userRole) && (
            <MenuItem
              icon={<Settings size={14} />}
              label={locale === 'ar' ? 'الإعدادات' : 'Settings'}
              onClick={() => { onClose(); router.push('/settings') }}
            />
          )}
          <MenuItem
            icon={<Calendar size={14} />}
            label={locale === 'ar' ? 'قواعد الإجازات والاستحقاقات' : 'Leave Rules & Entitlements'}
            hasArrow
            onClick={() => setSub('leave-rules')}
          />
          <MenuItem
            icon={<Palette size={14} />}
            label={locale === 'ar' ? 'التخصيص' : 'Personalisation'}
            hasArrow
            onClick={() => setSub('personalisation')}
          />

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />

          <MenuItem
            icon={<KeyRound size={14} />}
            label={locale === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
            onClick={() => {
              if (isMsProvider) {
                window.open('https://aka.ms/sspr', '_blank', 'noopener')
              } else {
                alert(locale === 'ar' ? 'تم إرسال رابط إعادة التعيين إلى عنوان بريدك الإلكتروني.' : 'Reset link sent to your email address.')
              }
            }}
          />

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 10px', borderRadius: 7,
              background: 'transparent', border: 'none', cursor: 'pointer',
              textAlign: 'left', transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--status-rejected-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ color: 'var(--status-rejected-fg)', display: 'flex', flexShrink: 0 }}>
              <LogOut size={14} />
            </span>
            <div>
              <div style={{ fontSize: 'var(--text-body)', color: 'var(--status-rejected-fg)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                {locale === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
              </div>
            </div>
          </button>
        </div>
      )}

      {sub === 'leave-rules' && (
        <LeaveRulesPanel onBack={() => setSub(null)} />
      )}

      {sub === 'personalisation' && (
        <PersonalisationPanel onBack={() => setSub(null)} />
      )}
    </div>
  )
}

function MenuItem({
  icon, label, hasArrow, onClick,
}: {
  icon:      React.ReactNode
  label:     string
  hasArrow?: boolean
  onClick:   () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 10px', borderRadius: 7,
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', transition: 'background 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: 'var(--ink-3)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)', fontWeight: 500, lineHeight: 1.3 }}>
          {label}
        </div>
      </div>
      {hasArrow && <ChevronRight size={12} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />}
    </button>
  )
}

function LeaveRulesPanel({ onBack }: { onBack: () => void }) {
  const locale = useLocale()
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', padding: 0,
          }}
        >
          <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
          {locale === 'ar' ? 'قواعد الإجازات' : 'Leave Rules'}
        </span>
      </div>
      <div style={{
        maxHeight: 360, overflowY: 'auto', padding: '8px 12px 12px',
        fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', lineHeight: 1.6,
      }}>
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)', padding: '8px 0', textAlign: 'center' }}>
          {locale === 'ar' ? (
            <>تُحمَّل تفاصيل استحقاقات الإجازات من إعدادات الموارد البشرية الخاصة بك. انتقل إلى <strong>الإجازات</strong> في القائمة الرئيسية للاطلاع على كامل التفاصيل.</>
          ) : (
            <>Leave entitlement details are loaded from your HR configuration.
          Visit <strong>Leave</strong> in the main menu for full details.</>
          )}
        </div>
        <LeaveCard
          nameEn="Annual Leave"
          nameAr="إجازة سنوية"
          entitlement="30 days/year"
          accrual="2.5 days/month"
          carryForward="Yes (max 30 days)"
          notice="7 days"
          ref_="BR-AL-001"
        />
        <LeaveCard
          nameEn="Sick Leave"
          nameAr="إجازة مرضية"
          entitlement="90 days/year"
          accrual="N/A"
          carryForward="No"
          notice="Same day"
          ref_="BR-SL-001"
        />
        <LeaveCard
          nameEn="Maternity Leave"
          nameAr="إجازة أمومة"
          entitlement="60 days"
          accrual="N/A"
          carryForward="No"
          notice="4 weeks"
          ref_="UAE Labour Law Art 30"
        />
      </div>
    </div>
  )
}

function LeaveCard({
  nameEn, nameAr, entitlement, accrual, carryForward, notice, ref_,
}: {
  nameEn:      string
  nameAr:      string
  entitlement: string
  accrual:     string
  carryForward: string
  notice:      string
  ref_:        string
}) {
  const locale = useLocale()
  return (
    <div style={{
      marginTop: 10, padding: '10px 12px',
      border: '1px solid var(--border)', borderRadius: 8,
      background: 'var(--surface)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--ink-1)', fontSize: 'var(--text-caption)' }}>{locale === 'ar' ? nameAr : nameEn}</div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          [locale === 'ar' ? 'الاستحقاق' : 'Entitlement', entitlement],
          [locale === 'ar' ? 'التراكم' : 'Accrual', accrual],
          [locale === 'ar' ? 'الترحيل' : 'Carry forward', carryForward],
          [locale === 'ar' ? 'الإشعار المطلوب' : 'Notice required', notice],
          [locale === 'ar' ? 'المرجع القانوني' : 'Law reference', ref_],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', minWidth: 90, flexShrink: 0 }}>{k}:</span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PersonalisationPanel({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const locale = useLocale()

  const [lang,         setLang]         = useState<'EN' | 'AR'>('EN')
  const [theme,        setTheme]        = useState<'light' | 'dark' | 'system'>('system')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saveErr,      setSaveErr]      = useState<string | null>(null)
  const [savedOk,      setSavedOk]      = useState(false)
  const [initialLoad,  setInitialLoad]  = useState(true)
  const [, startTransition]             = useTransition()

  // Load saved preferences from DB on mount
  useEffect(() => {
    getPreferences().then(prefs => {
      if (prefs.lang  && ['EN','AR'].includes(prefs.lang))                  setLang(prefs.lang as 'EN' | 'AR')
      if (prefs.theme && ['light','dark','system'].includes(prefs.theme))  setTheme(prefs.theme as 'light' | 'dark' | 'system')
      setLoading(false)
      setInitialLoad(false)
    }).catch(() => { setLoading(false); setInitialLoad(false) })
  }, [])

  // Live preview: apply theme immediately on selection
  useEffect(() => {
    if (initialLoad) return
    const body = document.body
    if (theme === 'dark') {
      body.setAttribute('data-dark', 'true')
    } else if (theme === 'light') {
      body.removeAttribute('data-dark')
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) body.setAttribute('data-dark', 'true')
      else             body.removeAttribute('data-dark')
    }
  }, [theme, initialLoad])

  // Live preview: apply language + RTL immediately on selection, then refresh server components
  useEffect(() => {
    if (initialLoad) return
    const html = document.documentElement
    html.lang = lang.toLowerCase()
    html.dir  = lang === 'AR' ? 'rtl' : 'ltr'
    // Write cookie now so router.refresh() SSR picks up the new locale
    const maxAge = 365 * 24 * 60 * 60
    document.cookie = `avaniis_locale=${lang.toLowerCase()};path=/;max-age=${maxAge};SameSite=Lax`
    // Soft-refresh server components — they re-render with name_ar / name_en
    startTransition(() => { router.refresh() })
  }, [lang, initialLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  async function applyAndSave() {
    setSaveErr(null)
    setSaving(true)

    // ── Persist to DB ────────────────────────────────────────────────────────
    const result = await updatePreferences('', { lang, theme })
    setSaving(false)

    if (result?.success === false) {
      setSaveErr(result.error ?? (locale === 'ar' ? 'تعذّر الحفظ. يرجى المحاولة مرة أخرى.' : 'Failed to save. Please try again.'))
      return
    }

    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 2500)

    startTransition(() => { router.refresh() })
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', padding: 0,
          }}
        >
          <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
          {locale === 'ar' ? 'التخصيص' : 'Personalisation'}
        </span>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PrefRow label={locale === 'ar' ? 'اللغة' : 'Language'}>
          <ToggleGroup
            options={[{ value: 'EN', label: 'EN' }, { value: 'AR', label: 'AR' }]}
            value={lang}
            onChange={v => setLang(v as 'EN' | 'AR')}
          />
        </PrefRow>

        <PrefRow label={locale === 'ar' ? 'السمة' : 'Theme'}>
          <ToggleGroup
            options={[
              { value: 'light',  label: locale === 'ar' ? 'فاتح' : 'Light' },
              { value: 'dark',   label: locale === 'ar' ? 'داكن' : 'Dark'  },
              { value: 'system', label: locale === 'ar' ? 'تلقائي' : 'Auto'  },
            ]}
            value={theme}
            onChange={v => setTheme(v as 'light' | 'dark' | 'system')}
          />
        </PrefRow>

        {saveErr && (
          <div style={{
            fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)',
            background: 'var(--status-rejected-bg)',
            border: '1px solid var(--status-rejected-fg)',
            borderRadius: 6, padding: '5px 8px', marginBottom: 4,
            fontFamily: 'var(--font-sans)', lineHeight: 1.4,
          }}>
            {saveErr}
          </div>
        )}
        <button
          type="button"
          onClick={applyAndSave}
          disabled={loading || saving}
          style={{
            marginTop: 4,
            padding: '8px 0', borderRadius: 8, border: 'none',
            cursor: (loading || saving) ? 'default' : 'pointer',
            background: savedOk
              ? 'var(--status-approved-bg)'
              : saveErr
              ? 'var(--status-rejected-bg)'
              : 'var(--accent)',
            color: savedOk
              ? 'var(--status-approved-fg)'
              : saveErr
              ? 'var(--status-rejected-fg)'
              : 'var(--card)',
            fontSize: 'var(--text-body)', fontWeight: 600, fontFamily: 'var(--font-sans)',
            transition: 'background 200ms',
            opacity: (loading || saving) ? 0.65 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {saving && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )}
          {saving
            ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
            : savedOk
            ? (locale === 'ar' ? 'تم الحفظ ✓' : 'Saved ✓')
            : saveErr
            ? (locale === 'ar' ? 'إعادة المحاولة' : 'Retry')
            : (locale === 'ar' ? 'حفظ التفضيلات' : 'Save preferences')}
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ToggleGroup({
  options, value, onChange,
}: {
  options: { value: string; label: string }[]
  value:   string
  onChange: (v: string) => void
}) {
  return (
    <div style={{
      display: 'flex', gap: 4,
      background: 'var(--surface)', borderRadius: 7,
      padding: 3, border: '1px solid var(--border)',
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1, padding: '4px 6px', borderRadius: 5, border: 'none',
            cursor: 'pointer', fontSize: 'var(--text-caption)', fontFamily: 'var(--font-sans)',
            fontWeight: value === opt.value ? 600 : 400,
            background: value === opt.value ? 'var(--card)' : 'transparent',
            color:      value === opt.value ? 'var(--ink-1)' : 'var(--ink-3)',
            boxShadow:  value === opt.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 120ms',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
