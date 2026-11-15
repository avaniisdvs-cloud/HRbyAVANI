'use client'

import { useState, useTransition } from 'react'
import { CreditCard, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { selfServiceUpdateBankDetails } from '@/modules/core-hr'
import { useLocale } from '@/components/providers/LocaleProvider'

type ExistingDetails = {
  id:           string | null
  bankName:     string | null
  bankCode:     string | null
  iban:         string | null
  ibanMasked:   boolean
  accountName:  string | null
  isWpsAccount: boolean
} | null

interface Props {
  existing: ExistingDetails
}

type Outcome = 'UPDATED' | 'PENDING_APPROVAL' | null

const inputStyle = (err?: boolean): React.CSSProperties => ({
  width: '100%', height: 40, boxSizing: 'border-box',
  border: `1px solid ${err ? 'var(--status-rejected-fg, #dc2626)' : 'var(--border)'}`,
  borderRadius: 8, padding: '0 12px', fontSize: 'var(--text-body)',
  color: 'var(--ink-1)', background: 'var(--card)', outline: 'none',
})
const label: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)',
  marginBottom: 6,
}

export function BankDetailsForm({ existing }: Props) {
  const locale = useLocale()
  const [bankName,    setBankName]    = useState(existing?.bankName    ?? '')
  const [bankCode,    setBankCode]    = useState(existing?.bankCode    ?? '')
  const [iban,        setIban]        = useState('')      // never pre-fill IBAN for security
  const [accountName, setAccountName] = useState(existing?.accountName ?? '')
  const [accountType, setAccountType] = useState<'CURRENT' | 'SAVINGS' | 'SALARY'>('SALARY')
  const [isWps,       setIsWps]       = useState(existing?.isWpsAccount ?? true)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [outcome,     setOutcome]     = useState<Outcome>(null)
  const [wfId,        setWfId]        = useState<string | null>(null)
  const [pending, start] = useTransition()

  function validate() {
    const e: Record<string, string> = {}
    if (!bankName.trim())    e.bankName    = 'Required'
    if (!bankCode.trim())    e.bankCode    = 'Required'
    if (!accountName.trim()) e.accountName = 'Required'
    if (!iban.trim())        e.iban        = 'Required'
    else if (!/^AE\d{21}$/.test(iban)) e.iban = 'Must be AE + 21 digits (e.g. AE070331234567890123456)'
    return e
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})

    start(async () => {
      try {
        const result = await selfServiceUpdateBankDetails({
          bankName, bankCode, iban, accountName, accountType, isWpsAccount: isWps,
        })
        setOutcome(result.outcome)
        if (result.outcome === 'PENDING_APPROVAL') setWfId(result.workflowInstanceId)
      } catch (err) {
        setErrors({ _root: err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما' : 'Something went wrong') })
      }
    })
  }

  // ── Success states ────────────────────────────────────────────────────────

  if (outcome === 'UPDATED') {
    return (
      <div
        style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 32, textAlign: 'center',
        }}
      >
        <CheckCircle2 size={36} color="#16a34a" strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--ink-1)', margin: '0 0 8px' }}>
          {locale === 'ar' ? 'تم تحديث التفاصيل المصرفية' : 'Bank details updated'}
        </h2>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
          {locale === 'ar'
            ? <>تم حفظ حسابك المصرفي الجديد ({bankCode} · {iban.slice(-4).padStart(iban.length, '·')}). سيتم توجيه دفعة راتبك القادمة إلى هذا الحساب.</>
            : <>Your new bank account ({bankCode} · {iban.slice(-4).padStart(iban.length, '·')}) has been saved.
          Your next salary payment will be directed to this account.</>}
        </p>
      </div>
    )
  }

  if (outcome === 'PENDING_APPROVAL') {
    return (
      <div
        style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 32, textAlign: 'center',
        }}
      >
        <Clock size={36} color="var(--accent)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--ink-1)', margin: '0 0 8px' }}>
          {locale === 'ar' ? 'تم إرسال التغيير للموافقة' : 'Change submitted for approval'}
        </h2>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0, maxWidth: 380, marginInline: 'auto' }}>
          {locale === 'ar'
            ? 'تم إصدار خطاب تحويل راتب خلال الـ 30 يوماً الماضية، لذا يتطلب تغيير تفاصيلك المصرفية موافقة مسؤول الموارد البشرية قبل أن يصبح ساري المفعول. تم إخطار الموارد البشرية.'
            : <>A Salary Transfer Letter was issued in the past 30 days, so your bank details change
          requires HR Admin approval before taking effect. HR has been notified.</>}
        </p>
        {wfId && (
          <p style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
            {locale === 'ar' ? 'المرجع' : 'Ref'}: {wfId.slice(0, 8).toUpperCase()}
          </p>
        )}
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Current account info */}
      {existing?.id && (
        <div
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <CreditCard size={20} color="var(--ink-3)" strokeWidth={1.5} />
          <div>
            <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
              {existing.bankName ?? '—'} · {existing.bankCode ?? '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              {existing.iban ?? '—'}{existing.ibanMasked ? ' (masked)' : ''}
            </div>
          </div>
          <span
            style={{
              marginLeft: 'auto', fontSize: 'var(--text-caption)', fontWeight: 700,
              padding: '2px 8px', borderRadius: 20,
              background: 'rgba(22,163,74,0.08)', color: '#16a34a',
            }}
          >
            {locale === 'ar' ? 'الحالي' : 'CURRENT'}
          </span>
        </div>
      )}

      {/* STL notice */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px',
          marginBottom: 20,
          background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 8,
        }}
      >
        <AlertTriangle size={14} color="#d97706" strokeWidth={1.75} style={{ flexShrink: 0,
        marginTop: 1 }} />
        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', margin: 0 }}>
          {locale === 'ar'
            ? 'إذا تم إصدار خطاب تحويل راتب خلال الـ 30 يوماً الماضية، فسيتم تعليق تغييرك للحصول على موافقة مسؤول الموارد البشرية قبل أن يصبح ساري المفعول.'
            : <>If a Salary Transfer Letter was issued in the last 30 days, your change will be
          held for HR Admin approval before taking effect.</>}
        </p>
      </div>

      <div
        style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>{locale === 'ar' ? 'اسم البنك *' : 'Bank Name *'}</label>
            <input value={bankName} onChange={e => setBankName(e.target.value)} disabled={pending} style={inputStyle(!!errors.bankName)} placeholder="e.g. Emirates NBD" />
            {errors.bankName && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg, #dc2626)', margin: '4px 0 0' }}>{errors.bankName}</p>}
          </div>
          <div>
            <label style={label}>{locale === 'ar' ? 'رمز البنك / سويفت *' : 'Bank Code / SWIFT *'}</label>
            <input value={bankCode} onChange={e => setBankCode(e.target.value.toUpperCase())} disabled={pending} style={inputStyle(!!errors.bankCode)} placeholder="e.g. EBILAEAD" />
            {errors.bankCode && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg, #dc2626)', margin: '4px 0 0' }}>{errors.bankCode}</p>}
          </div>
        </div>

        <div>
          <label style={label}>{locale === 'ar' ? 'اسم الحساب *' : 'Account Name *'}</label>
          <input value={accountName} onChange={e => setAccountName(e.target.value)} disabled={pending} style={inputStyle(!!errors.accountName)} placeholder={locale === 'ar' ? 'الاسم الكامل كما في الحساب المصرفي' : 'Full name as on bank account'} />
          {errors.accountName && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg, #dc2626)', margin: '4px 0 0' }}>{errors.accountName}</p>}
        </div>

        <div>
          <label style={label}>{locale === 'ar' ? 'رقم الآيبان الإماراتي *' : 'UAE IBAN *'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 400 }}>{locale === 'ar' ? 'AE + 21 رقماً' : 'AE + 21 digits'}</span></label>
          <input
            value={iban}
            onChange={e => setIban(e.target.value.toUpperCase().replace(/\s/g, ''))}
            disabled={pending}
            style={{ ...inputStyle(!!errors.iban), fontFamily: 'var(--font-mono)' }}
            placeholder="AE070331234567890123456"
            maxLength={23}
          />
          {errors.iban && <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg, #dc2626)', margin: '4px 0 0' }}>{errors.iban}</p>}
        </div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>{locale === 'ar' ? 'نوع الحساب' : 'Account Type'}</label>
            <select
              value={accountType}
              onChange={e => setAccountType(e.target.value as typeof accountType)}
              disabled={pending}
              style={{ ...inputStyle(), appearance: 'none' }}
            >
              <option value="SALARY">{locale === 'ar' ? 'حساب الراتب' : 'Salary Account'}</option>
              <option value="CURRENT">{locale === 'ar' ? 'حساب جاري' : 'Current Account'}</option>
              <option value="SAVINGS">{locale === 'ar' ? 'حساب توفير' : 'Savings Account'}</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
          paddingTop: 22 }}>
            <input
              type="checkbox"
              id="isWps"
              checked={isWps}
              onChange={e => setIsWps(e.target.checked)}
              disabled={pending}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <label htmlFor="isWps" style={{ ...label, marginTop: 0,
            marginRight: 0,
            marginBottom: 0,
            marginLeft: 0, cursor: 'pointer' }}>
              {locale === 'ar' ? 'حساب راتب نظام حماية الأجور (WPS)' : 'WPS salary account'}
            </label>
          </div>
        </div>

        {errors._root && (
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg, #dc2626)', margin: 0 }}>{errors._root}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            height: 40, borderRadius: 8, border: 'none',
            background: pending ? 'var(--border)' : 'var(--accent)',
            color: pending ? 'var(--ink-3)' : '#fff',
            fontSize: 'var(--text-body)', fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'تحديث التفاصيل المصرفية' : 'Update Bank Details')}
        </button>
      </div>
    </form>
  )
}
