'use client'

import { useState, useTransition } from 'react'
import { completeOffboardingItem, waiveOffboardingItem } from '@/modules/core-hr'
import { CheckCircle2, MinusCircle } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Props {
  itemId:      string
  status:      string
  isMandatory: boolean
}

export function ExitClearanceItemActions({ itemId, status: initialStatus, isMandatory }: Props) {
  const locale                      = useLocale()
  const [status,     setStatus]     = useState(initialStatus)
  const [modal,      setModal]      = useState<'complete' | 'waive' | null>(null)
  const [notes,      setNotes]      = useState('')
  const [reason,     setReason]     = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [pending,    start]         = useTransition()

  const isDone = status === 'COMPLETED' || status === 'WAIVED'

  if (isDone) {
    return (
      <span style={{
        fontSize: 'var(--text-caption)', fontWeight: 600,
        color: status === 'COMPLETED' ? '#16a34a' : '#6366f1',
        whiteSpace: 'nowrap',
      }}>
        {status === 'COMPLETED' ? (locale === 'ar' ? '✓ مكتمل' : '✓ Done') : (locale === 'ar' ? '○ تم التنازل' : '○ Waived')}
      </span>
    )
  }

  function submitComplete() {
    setError(null)
    start(async () => {
      try {
        await completeOffboardingItem({ itemId, notes: notes || undefined })
        setStatus('COMPLETED')
        setModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما.' : 'Something went wrong.'))
      }
    })
  }

  function submitWaive() {
    if (!reason.trim()) { setError(locale === 'ar' ? 'يرجى تقديم سبب للتنازل.' : 'Please provide a reason for waiving.'); return }
    setError(null)
    start(async () => {
      try {
        await waiveOffboardingItem({ itemId, reason })
        setStatus('WAIVED')
        setModal(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما.' : 'Something went wrong.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
      <button
        onClick={() => { setModal('complete'); setError(null) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 26, padding: '0 10px', borderRadius: 6, border: 'none',
          background: 'rgba(22,163,74,0.1)', color: '#16a34a',
          fontSize: 'var(--text-caption)', fontWeight: 600, cursor: 'pointer',
        }}
      >
        <CheckCircle2 size={12} strokeWidth={2} /> {locale === 'ar' ? 'إكمال' : 'Complete'}
      </button>

      {!isMandatory && (
        <button
          onClick={() => { setModal('waive'); setError(null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 26, padding: '0 10px', borderRadius: 6, border: 'none',
            background: 'rgba(99,102,241,0.1)', color: '#6366f1',
            fontSize: 'var(--text-caption)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <MinusCircle size={12} strokeWidth={2} /> {locale === 'ar' ? 'تنازل' : 'Waive'}
        </button>
      )}

      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)',
        }}>
          <div
            style={{
              background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
              padding: 24, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 'var(--text-lead)', fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
              {modal === 'complete' ? (locale === 'ar' ? 'تعليم كمكتمل' : 'Mark as Complete') : (locale === 'ar' ? 'التنازل عن البند' : 'Waive Item')}
            </h3>

            {modal === 'complete' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>
                  {locale === 'ar' ? 'ملاحظات' : 'Notes'} <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>{locale === 'ar' ? '(اختياري)' : '(optional)'}</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={pending}
                  rows={3}
                  maxLength={500}
                  placeholder={locale === 'ar' ? 'أي ملاحظات حول الإنجاز…' : 'Any notes about completion…'}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    border: '1px solid var(--border)', borderRadius: 7,
                    padding: '8px 10px', fontSize: 'var(--text-body)', color: 'var(--ink-1)',
                    background: 'var(--card)', outline: 'none',
                  }}
                />
              </div>
            )}

            {modal === 'waive' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>
                  {locale === 'ar' ? 'السبب *' : 'Reason *'}
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={pending}
                  rows={3}
                  maxLength={500}
                  placeholder={locale === 'ar' ? 'اذكر سبب التنازل عن هذا البند…' : 'Provide a reason for waiving this item…'}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    border: '1px solid var(--border)', borderRadius: 7,
                    padding: '8px 10px', fontSize: 'var(--text-body)', color: 'var(--ink-1)',
                    background: 'var(--card)', outline: 'none',
                  }}
                />
              </div>
            )}

            {error && (
              <p style={{ fontSize: 'var(--text-caption)', color: '#dc2626', margin: '0 0 12px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={modal === 'complete' ? submitComplete : submitWaive}
                disabled={pending}
                style={{
                  flex: 1, height: 38, borderRadius: 7, border: 'none',
                  background: modal === 'complete' ? '#16a34a' : '#6366f1',
                  color: "var(--on-accent)", fontSize: 'var(--text-body)', fontWeight: 600,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : modal === 'complete' ? (locale === 'ar' ? 'تعليم كمكتمل' : 'Mark Complete') : (locale === 'ar' ? 'تأكيد التنازل' : 'Confirm Waive')}
              </button>
              <button
                onClick={() => { setModal(null); setError(null) }}
                disabled={pending}
                style={{
                  height: 38, padding: '0 16px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--ink-2)', fontSize: 'var(--text-body)', cursor: 'pointer',
                }}
              >
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
