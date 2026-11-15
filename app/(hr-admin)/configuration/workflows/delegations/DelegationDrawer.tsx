'use client'

import { useState, useTransition } from 'react'
import { X, Info } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { createDelegationRule } from '@/modules/workflow/actions'
import { DateInput } from '@/components/forms/DateInput'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function DelegationDrawer({ onClose, onCreated }: Props) {
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [delegatorId, setDelegatorId] = useState('')
  const [delegateId, setDelegateId] = useState('')
  const [delegationFrom, setDelegationFrom] = useState('')
  const [delegationTo, setDelegationTo] = useState('')
  const [reason, setReason] = useState('')
  const [limitWorkflows, setLimitWorkflows] = useState(false)
  const [workflowCodesRaw, setWorkflowCodesRaw] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const workflowCodes = limitWorkflows
      ? workflowCodesRaw.split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    startTransition(async () => {
      const result = await createDelegationRule({
        delegatorId: delegatorId.trim(),
        delegateId: delegateId.trim(),
        delegationFrom,
        delegationTo,
        workflowCodes,
        delegationReason: reason.trim() || undefined,
      })

      if (result.success) {
        onCreated()
      } else {
        setError(result.error ?? 'Failed to create delegation rule.')
      }
    })
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-caption)',
    fontWeight: 600,
    color: 'var(--ink-2)',
    marginBottom: 4,
    display: 'block',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: 'var(--text-body)',
    color: 'var(--ink-1)',
    background: 'var(--card)',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-mono)',
  }

  const fieldStyle: React.CSSProperties = { marginBottom: 16 }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100 }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100%', width: 420,
        background: 'var(--card)', zIndex: 101, display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'قاعدة تفويض جديدة' : 'New Delegation Rule'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          <div style={fieldStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'معرّف الشخص المُفوِّض' : 'Delegator Person ID'}</label>
            <input
              type="text"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={delegatorId}
              onChange={e => setDelegatorId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'معرّف الشخص المُفوَّض إليه' : 'Delegate Person ID'}</label>
            <input
              type="text"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={delegateId}
              onChange={e => setDelegateId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'من' : 'From'}</label>
              <DateInput
                required
                value={delegationFrom}
                onChange={e => setDelegationFrom(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'إلى' : 'To'}</label>
              <DateInput
                required
                value={delegationTo}
                onChange={e => setDelegationTo(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'inherit' }}
              />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'السبب (اختياري)' : 'Reason (optional)'}</label>
            <textarea
              rows={3}
              placeholder="e.g. Annual leave coverage"
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', color: 'var(--ink-1)' }}>
              <input
                type="checkbox"
                checked={limitWorkflows}
                onChange={e => setLimitWorkflows(e.target.checked)}
                style={{ width: 14, height: 14 }}
              />
              {locale === 'ar' ? 'تقييد على مسارات عمل محددة' : 'Limit to specific workflows'}
            </label>
          </div>

          {limitWorkflows && (
            <div style={fieldStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'رموز مسارات العمل (مفصولة بفواصل)' : 'Workflow Codes (comma-separated)'}</label>
              <input
                type="text"
                placeholder="WF_ANNUAL_LEAVE,WF_SICK_LEAVE"
                value={workflowCodesRaw}
                onChange={e => setWorkflowCodesRaw(e.target.value)}
                style={inputStyle}
              />
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 4 }}>
                {locale === 'ar' ? 'أدخل رموز مسارات العمل مفصولة بفواصل.' : 'Enter workflow codes separated by commas.'}
              </p>
            </div>
          )}

          {error && (
            <div style={{
              background: 'var(--danger-050, #fef2f2)',
              border: '1px solid var(--danger-200, #fecaca)',
              borderRadius: 'var(--radius)',
              padding: '10px 12px',
              fontSize: 'var(--text-body)',
              color: 'var(--danger-700, #b91c1c)',
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* Circular chain note */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 20,
          }}>
            <Info size={14} style={{ color: 'var(--ink-3)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0 }}>
              {locale === 'ar'
                ? 'يتم التحقق من التفويضات بحثًا عن السلاسل الدائرية. غير مسموح بـ A → B → A.'
                : 'Delegations are verified for circular chains. A → B → A is not permitted.'}
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: '100%',
              padding: '10px',
              background: isPending ? 'var(--accent-300, #93c5fd)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: 14,
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ قاعدة التفويض' : 'Save Delegation Rule')}
          </button>
        </form>
      </div>
    </>
  )
}
