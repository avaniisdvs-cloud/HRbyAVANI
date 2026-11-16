'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createUserAccount, createNonEmployeeUserAccount } from '@/modules/auth/actions'
import { type PersonOption, type EntityOption, type KRole } from '@/modules/auth/config'
import { NationalitySelect, deriveNationalityCategory } from '@/components/forms/NationalitySelect'
import { DateInput } from '@/components/forms/DateInput'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'

// ── Design tokens (compact) ────────────────────────────────────────────────────
const INPUT: React.CSSProperties = {
  width: '100%', height: 34,
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "var(--border)",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "var(--border)",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "var(--border)",
  borderLeftWidth: "1px",
  borderLeftStyle: "solid",
  borderLeftColor: "var(--border)",
  borderRadius: 7,
  paddingTop: "0",
  paddingRight: "10px",
  paddingBottom: "0",
  paddingLeft: "10px", fontSize: 'var(--text-body)',
  background: 'var(--card)', color: 'var(--ink-1)',
  outline: 'none', boxSizing: 'border-box',
}
const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer',
paddingRight: 28 }
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-caption)', fontWeight: 700,
  color: 'var(--ink-3)', textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 4,
}

const USER_TYPES = [
  { value: 'CONTRACTOR',      label: '🔨 Contractor',                 labelAr: '🔨 مقاول' },
  { value: 'CONTINGENT',      label: '🔄 Contingent Worker',          labelAr: '🔄 عامل مؤقت' },
  { value: 'SERVICE_ACCOUNT', label: '⚙️ Service / System Account',   labelAr: '⚙️ حساب خدمة / نظام' },
]

type UserMode = 'employee' | 'non-employee'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
    </div>
  )
}

export function NewUserClient({
  persons,
  entities,
  roles,
  currentUserId: _,
}: {
  persons:       PersonOption[]
  entities:      EntityOption[]
  roles:         { value: KRole; label: string }[]
  currentUserId: string
}) {
  const router = useRouter()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<UserMode>('employee')
  const [error, setError] = useState<string | null>(null)

  // ── Employee mode ───────────────────────────────────────────────────────────
  const [empPersonId,  setEmpPersonId]  = useState('')
  const [empEmail,     setEmpEmail]     = useState('')
  const [empRole,      setEmpRole]      = useState('EMPLOYEE')
  const [empEntityId,  setEmpEntityId]  = useState(entities[0]?.id ?? '')

  // ── Non-employee mode ───────────────────────────────────────────────────────
  const [neFirst,    setNeFirst]    = useState('')
  const [neLast,     setNeLast]     = useState('')
  const [neNameAr,   setNeNameAr]   = useState('')
  const [neDob,      setNeDob]      = useState('')
  const [neGender,   setNeGender]   = useState('MALE')
  const [neNatCode,  setNeNatCode]  = useState('')
  const [neNatCat,   setNeNatCat]   = useState('EXPAT')
  const [neType,     setNeType]     = useState('CONTRACTOR')
  const [neEmail,    setNeEmail]    = useState('')
  const [neRole,     setNeRole]     = useState('EMPLOYEE')
  const [neEntityId, setNeEntityId] = useState(entities[0]?.id ?? '')

  // ── Shared — password ───────────────────────────────────────────────────────
  const [showPwdFields, setShowPwdFields] = useState(false)
  const [password,      setPassword]      = useState('')
  const [confirmPwd,    setConfirmPwd]    = useState('')

  function handlePersonChange(id: string) {
    setEmpPersonId(id)
    const person = persons.find(p => p.id === id)
    if (person) {
      const match = entities.find(e => e.id === person.legalEntityId)
      if (match) setEmpEntityId(match.id)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Password validation (shared)
    if (showPwdFields) {
      if (password.trim().length < 8) { setError(locale === 'ar' ? 'يجب أن تتكون كلمة المرور من ٨ أحرف على الأقل.' : 'Password must be at least 8 characters.'); return }
      if (password !== confirmPwd)    { setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'); return }
    }

    if (mode === 'employee') {
      if (!empPersonId)       { setError(locale === 'ar' ? 'يرجى اختيار شخص.' : 'Please select a person.'); return }
      if (!empEmail.trim())   { setError(locale === 'ar' ? 'بريد العمل مطلوب.' : 'Work email is required.'); return }
      if (!empEntityId)       { setError(locale === 'ar' ? 'يرجى اختيار الجهة القانونية.' : 'Please select a legal entity.'); return }
      startTransition(async () => {
        const res = await createUserAccount({
          personId: empPersonId, primaryEmail: empEmail.trim(),
          avaniisRole: empRole, primaryEntityId: empEntityId,
          initialPassword: showPwdFields ? password.trim() : undefined,
        })
        if (!res.success) setError(res.error ?? (locale === 'ar' ? 'تعذّر إنشاء الحساب.' : 'Failed to create account.'))
        else { router.push('/users'); router.refresh() }
      })
    } else {
      if (!neFirst.trim())  { setError(locale === 'ar' ? 'الاسم الأول مطلوب.' : 'First name is required.'); return }
      if (!neLast.trim())   { setError(locale === 'ar' ? 'اسم العائلة مطلوب.' : 'Last name is required.'); return }
      if (!neDob)           { setError(locale === 'ar' ? 'تاريخ الميلاد مطلوب.' : 'Date of birth is required.'); return }
      if (!neNatCode) {
        setError(locale === 'ar' ? 'الجنسية مطلوبة.' : 'Nationality is required.')
        return
      }
      if (!neEmail.trim())  { setError(locale === 'ar' ? 'بريد تسجيل الدخول مطلوب.' : 'Login email is required.'); return }
      if (!neEntityId)      { setError(locale === 'ar' ? 'يرجى اختيار الجهة القانونية.' : 'Please select a legal entity.'); return }
      startTransition(async () => {
        const res = await createNonEmployeeUserAccount({
          firstNameEn: neFirst.trim(), lastNameEn: neLast.trim(),
          fullNameAr: neNameAr.trim(), dateOfBirth: neDob,
          gender: neGender, nationalityCode: neNatCode,
          nationalityCategory: neNatCat, userType: neType,
          primaryEmail: neEmail.trim(), avaniisRole: neRole,
          primaryEntityId: neEntityId,
          initialPassword: showPwdFields ? password.trim() : undefined,
        })
        if (!res.success) setError(res.error ?? (locale === 'ar' ? 'تعذّر إنشاء الحساب.' : 'Failed to create account.'))
        else { router.push('/users'); router.refresh() }
      })
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
    }}>

      {/* ── Title bar ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '18px 24px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.3px' }}>
            {locale === 'ar' ? 'إضافة حساب مستخدم' : 'Add User Account'}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
          marginTop: 2 }}>
            {mode === 'employee'
              ? (locale === 'ar' ? 'ربط موظف حالي بحساب تسجيل دخول.' : 'Link an existing employee to a login account.')
              : (locale === 'ar' ? 'إنشاء حساب دخول للمقاولين أو العاملين المؤقتين أو حسابات النظام.' : 'Create a login for contractors, contingent staff, or system accounts.')}
          </div>
        </div>

        {/* Mode pills */}
        <div style={{
          display: 'flex', background: 'var(--surface)',
          borderRadius: 8, padding: 3, gap: 2, flexShrink: 0,
        }}>
          {([
            { v: 'employee',     icon: '👤', label: locale === 'ar' ? 'موظف' : 'Employee' },
            { v: 'non-employee', icon: '🔧', label: locale === 'ar' ? 'غير موظف' : 'Non-Employee' },
          ] as const).map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => { setMode(opt.v); setError(null) }}
              style={{
                padding: '6px 14px', fontSize: 'var(--text-caption)', fontWeight: mode === opt.v ? 700 : 400,
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: mode === opt.v ? 'var(--card)' : 'transparent',
                color: mode === opt.v ? 'var(--brand-active)' : 'var(--ink-3)',
                boxShadow: mode === opt.v ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0 0', flexShrink: 0 }} />

      {/* ── Form body ──────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 24px', display: 'flex', gap: 20 }}>

          {/* ── EMPLOYEE MODE ─────────────────────────────────────────────── */}
          {mode === 'employee' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 480 }}>
              <Field label={locale === 'ar' ? 'الشخص' : 'Person'}>
                {persons.length === 0 ? (
                  <div style={{
                    padding: '10px 12px', borderRadius: 7,
                    background: 'var(--surface)', fontSize: 'var(--text-body)', color: 'var(--ink-3)',
                    border: '1px solid var(--border)',
                  }}>
                    {locale === 'ar' ? 'جميع الموظفين النشطين لديهم حسابات بالفعل.' : 'All active employees already have accounts.'}{' '}
                    <button type="button" onClick={() => setMode('non-employee')}
                      style={{ color: 'var(--brand-active)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 600 }}>
                      {locale === 'ar' ? 'التبديل إلى غير موظف →' : 'Switch to Non-Employee →'}
                    </button>
                  </div>
                ) : (
                  <select value={empPersonId} onChange={e => handlePersonChange(e.target.value)} style={SELECT}>
                    <option value="">{locale === 'ar' ? '— اختر شخصًا —' : '— Select person —'}</option>
                    {persons.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.fullNameEn ?? p.id}{p.departmentNameEn ? ` · ${p.departmentNameEn}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={locale === 'ar' ? 'بريد العمل *' : 'Work Email *'}>
                <input type="email" value={empEmail} onChange={e => setEmpEmail(e.target.value)} placeholder="employee@company.com" style={INPUT} autoComplete="off" />
              </Field>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={locale === 'ar' ? 'دور النظام *' : 'System Role *'}>
                  <select value={empRole} onChange={e => setEmpRole(e.target.value)} style={SELECT}>
                    {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label={locale === 'ar' ? 'الجهة القانونية *' : 'Legal Entity *'}>
                  <select value={empEntityId} onChange={e => setEmpEntityId(e.target.value)} style={SELECT}>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.nameEn}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {/* ── NON-EMPLOYEE MODE: two-panel ──────────────────────────────── */}
          {mode === 'non-employee' && (
            <div style={{ display: 'flex', gap: 20, width: '100%' }}>

              {/* Left panel — Identity */}
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', gap: 10,
                paddingRight: 20, borderRight: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.7px',
                marginBottom: 2 }}>
                  {locale === 'ar' ? 'الهوية' : 'Identity'}
                </div>

                <Field label={locale === 'ar' ? 'نوع المستخدم *' : 'User Type *'}>
                  <select value={neType} onChange={e => setNeType(e.target.value)} style={SELECT}>
                    {USER_TYPES.map(t => <option key={t.value} value={t.value}>{locale === 'ar' ? t.labelAr : t.label}</option>)}
                  </select>
                </Field>

                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={locale === 'ar' ? 'الاسم الأول *' : 'First Name *'}>
                    <input value={neFirst} onChange={e => setNeFirst(e.target.value)} placeholder={locale === 'ar' ? 'الاسم الأول' : 'First'} style={INPUT} autoComplete="off" />
                  </Field>
                  <Field label={locale === 'ar' ? 'اسم العائلة *' : 'Last Name *'}>
                    <input value={neLast} onChange={e => setNeLast(e.target.value)} placeholder={locale === 'ar' ? 'اسم العائلة' : 'Last'} style={INPUT} autoComplete="off" />
                  </Field>
                </div>

                <Field label={locale === 'ar' ? 'الاسم بالعربية (اختياري)' : 'Arabic Name (optional)'}>
                  <input value={neNameAr} onChange={e => setNeNameAr(e.target.value)} placeholder="الاسم بالعربية"
                    style={{ ...INPUT, direction: 'rtl', textAlign: 'right' }} autoComplete="off" />
                </Field>

                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label={locale === 'ar' ? 'تاريخ الميلاد *' : 'Date of Birth *'}>
                    <DateInput value={neDob} onChange={e => setNeDob(e.target.value)} style={INPUT} />
                  </Field>
                  <Field label={locale === 'ar' ? 'الجنس *' : 'Gender *'}>
                    <select value={neGender} onChange={e => setNeGender(e.target.value)} style={SELECT}>
                      <option value="MALE">{locale === 'ar' ? 'ذكر' : 'Male'}</option>
                      <option value="FEMALE">{locale === 'ar' ? 'أنثى' : 'Female'}</option>
                      <option value="OTHER">{locale === 'ar' ? 'غير محدد' : 'Not Specified'}</option>
                    </select>
                  </Field>
                </div>

                <Field label={locale === 'ar' ? 'الجنسية *' : 'Nationality *'}>
                  <NationalitySelect
                    value={neNatCode || null}
                    onChange={(code) => {
                      setNeNatCode(code)
                      setNeNatCat(deriveNationalityCategory(code))
                    }}
                    required
                  />
                </Field>
              </div>

              {/* Right panel — Account */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.7px',
                marginBottom: 2 }}>
                  {locale === 'ar' ? 'الحساب' : 'Account'}
                </div>

                <Field label={locale === 'ar' ? 'بريد تسجيل الدخول *' : 'Login Email *'}>
                  <input type="email" value={neEmail} onChange={e => setNeEmail(e.target.value)}
                    placeholder="contractor@company.com" style={INPUT} autoComplete="off" />
                </Field>

                <Field label={locale === 'ar' ? 'دور النظام *' : 'System Role *'}>
                  <select value={neRole} onChange={e => setNeRole(e.target.value)} style={SELECT}>
                    {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>

                <Field label={locale === 'ar' ? 'الجهة القانونية *' : 'Legal Entity *'}>
                  <select value={neEntityId} onChange={e => setNeEntityId(e.target.value)} style={SELECT}>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.nameEn}</option>)}
                  </select>
                </Field>

                {/* Info note */}
                <div style={{
                  marginTop: 4, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--accent-100)', border: '1px solid var(--accent-200, var(--accent-100))',
                  fontSize: 'var(--text-caption)', color: 'var(--brand-active)',
                }}>
                  <div style={{ fontWeight: 700,
                  marginBottom: 3 }}>{locale === 'ar' ? 'ما الذي يتم إنشاؤه' : 'What gets created'}</div>
                  <div style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    {locale === 'ar'
                      ? 'سجل شخص مبسّط (غير مدرج في الرواتب) + حساب تسجيل دخول. مناسب للمقاولين والعاملين المؤقتين وحسابات النظام / الخدمة.'
                      : 'A minimal person stub (not on payroll) + a login account. Suitable for contractors, contingent staff, and system/service accounts.'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Password section (shared, below both panels) ────────────────────── */}
        <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          {/* Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => { setShowPwdFields(v => !v); setPassword(''); setConfirmPwd('') }}
              style={{
                width: 34, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.15s',
                background: showPwdFields ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: showPwdFields ? 16 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: "var(--card)", transition: 'left 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }} />
            </div>
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              {locale === 'ar' ? 'تعيين كلمة مرور أولية لتسجيل الدخول' : 'Set initial password for login'}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
              {locale === 'ar' ? '(اتركها فارغة للدخول عبر SSO / Microsoft Entra)' : '(leave off for SSO / Microsoft Entra login)'}
            </span>
          </label>

          {showPwdFields && (
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
            marginTop: 12 }}>
              <Field label={locale === 'ar' ? 'كلمة المرور *' : 'Password *'}>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={locale === 'ar' ? '٨ أحرف على الأقل' : 'Min. 8 characters'}
                  style={INPUT}
                  autoComplete="new-password"
                />
              </Field>
              <Field label={locale === 'ar' ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder={locale === 'ar' ? 'أعد إدخال كلمة المرور' : 'Repeat password'}
                  style={{
                    ...INPUT,
                    borderTopColor: confirmPwd && confirmPwd !== password ? 'var(--status-rejected-dot)' : 'var(--border)',
                    borderRightColor: confirmPwd && confirmPwd !== password ? 'var(--status-rejected-dot)' : 'var(--border)',
                    borderBottomColor: confirmPwd && confirmPwd !== password ? 'var(--status-rejected-dot)' : 'var(--border)',
                    borderLeftColor: confirmPwd && confirmPwd !== password ? 'var(--status-rejected-dot)' : 'var(--border)',
                  }}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          )}
        </div>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            margin: '0 24px', padding: '9px 14px', borderRadius: 7,
            background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
            fontSize: 'var(--text-body)', flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '12px 24px',
          borderTop: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          <button
            type="button"
            onClick={() => router.push('/users')}
            style={{
              height: 36, borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--ink-2)',
              padding: '0 18px', fontSize: 'var(--text-body)', cursor: 'pointer',
            }}
          >
            {tk(locale, 'common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isPending || (mode === 'employee' && persons.length === 0)}
            style={{
              height: 36, borderRadius: 7, border: 'none',
              background: 'var(--accent)', color: "var(--on-accent)",
              padding: '0 22px', fontSize: 'var(--text-body)', fontWeight: 600,
              cursor: isPending ? 'wait' : 'pointer', opacity: isPending ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isPending ? (locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…') : (locale === 'ar' ? 'إنشاء الحساب' : 'Create Account')}
          </button>
        </div>
      </form>
    </div>
  )
}
