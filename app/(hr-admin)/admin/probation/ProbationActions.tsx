'use client'

import { useState, useTransition } from 'react'
import { confirmProbation } from '@/modules/core-hr'
import { CheckCircle2, Clock, XCircle, ChevronDown } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { ProbationEmployee } from './page'

interface Props {
  employee: ProbationEmployee
}

type Decision = 'CONFIRMED' | 'EXTENDED' | 'FAILED'

export function ProbationActions({ employee }: Props) {
  const locale = useLocale()
  const [open,     setOpen]     = useState(false)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [newDate,  setNewDate]  = useState('')
  const [reason,   setReason]   = useState('')
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  start]       = useTransition()

  function openPanel(d: Decision) {
    setDecision(d)
    setOpen(true)
    setError(null)
  }

  function cancel() {
    setOpen(false)
    setDecision(null)
    setNewDate('')
    setReason('')
    setError(null)
  }

  function submit() {
    if (!decision) return
    if (decision === 'EXTENDED' && !newDate) {
      setError(locale === 'ar' ? 'تاريخ الانتهاء الجديد مطلوب عند تمديد فترة الاختبار.' : 'New end date is required when extending probation.')
      return
    }
    setError(null)
    start(async () => {
      try {
        await confirmProbation({
          personId: employee.id,
          decision,
          newEndDate: decision === 'EXTENDED' ? newDate : undefined,
          reason:    reason || undefined,
        })
        setDone(true)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما.' : 'Something went wrong.'))
      }
    })
  }

  if (done) {
    const cfg: Record<Decision, { label: string; color: string }> = {
      CONFIRMED: { label: locale === 'ar' ? 'تم التثبيت' : 'Confirmed',  color: '#16a34a' },
      EXTENDED:  { label: locale === 'ar' ? 'تم التمديد' : 'Extended',   color: '#d97706' },
      FAILED:    { label: locale === 'ar' ? 'لم ينجح'     : 'Failed',     color: '#dc2626' },
    }
    const c = cfg[decision!]
    return (
      <span style={{
        fontSize: 'var(--text-caption)', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
        background: `${c.color}18`, color: c.color,
      }}>
        {c.label}
      </span>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Action buttons row */}
      {!open && (
        <div style={{ display: 'flex', gap: 6 }}>
          <ActionButton
            label={locale === 'ar' ? 'تثبيت' : 'Confirm'}
            color="#16a34a"
            bg="rgba(22,163,74,0.1)"
            icon={<CheckCircle2 size={13} strokeWidth={2} />}
            onClick={() => openPanel('CONFIRMED')}
          />
          <ActionButton
            label={locale === 'ar' ? 'تمديد' : 'Extend'}
            color="#d97706"
            bg="rgba(217,119,6,0.1)"
            icon={<Clock size={13} strokeWidth={2} />}
            onClick={() => openPanel('EXTENDED')}
          />
          <ActionButton
            label={locale === 'ar' ? 'عدم التثبيت' : 'Fail'}
            color="#dc2626"
            bg="rgba(220,38,38,0.1)"
            icon={<XCircle size={13} strokeWidth={2} />}
            onClick={() => openPanel('FAILED')}
          />
        </div>
      )}

      {/* Inline confirmation panel */}
      {open && decision && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)',
        }}>
          <div
            style={{
              background: 'var(--card)', borderRadius: 12,
              border: '1px solid var(--border)',
              padding: 24, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
              {decision === 'CONFIRMED' ? (locale === 'ar' ? 'تثبيت فترة الاختبار' : 'Confirm Probation')
               : decision === 'EXTENDED' ? (locale === 'ar' ? 'تمديد فترة الاختبار' : 'Extend Probation')
               : (locale === 'ar' ? 'عدم تثبيت فترة الاختبار' : 'Fail Probation')}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
              {employee.fullNameEn} · {employee.personNumber}
            </p>

            {decision === 'EXTENDED' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>
                  {locale === 'ar' ? 'تاريخ انتهاء فترة الاختبار الجديد *' : 'New Probation End Date *'}
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  disabled={pending}
                  style={{
                    width: '100%', height: 38, boxSizing: 'border-box',
                    border: '1px solid var(--border)', borderRadius: 7,
                    padding: '0 10px', fontSize: 'var(--text-body)', color: 'var(--ink-1)',
                    background: 'var(--card)', outline: 'none',
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>
                {locale === 'ar' ? 'السبب / ملاحظات' : 'Reason / Notes'} <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>{locale === 'ar' ? '(اختياري)' : '(optional)'}</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={pending}
                maxLength={500}
                rows={3}
                placeholder={locale === 'ar' ? 'أضف أي ملاحظات لهذا القرار…' : 'Add any notes for this decision…'}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  border: '1px solid var(--border)', borderRadius: 7,
                  padding: '8px 10px', fontSize: 'var(--text-body)', color: 'var(--ink-1)',
                  background: 'var(--card)', outline: 'none',
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 'var(--text-caption)', color: '#dc2626', margin: '0 0 12px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={submit}
                disabled={pending}
                style={{
                  flex: 1, height: 38, borderRadius: 7, border: 'none',
                  background: decision === 'CONFIRMED' ? '#16a34a'
                    : decision === 'EXTENDED' ? '#d97706' : '#dc2626',
                  color: '#fff', fontSize: 'var(--text-body)', fontWeight: 600,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
                  : decision === 'CONFIRMED' ? (locale === 'ar' ? 'تثبيت فترة الاختبار' : 'Confirm Probation')
                  : decision === 'EXTENDED'  ? (locale === 'ar' ? 'تمديد فترة الاختبار' : 'Extend Probation')
                  : (locale === 'ar' ? 'عدم تثبيت فترة الاختبار' : 'Fail Probation')}
              </button>
              <button
                onClick={cancel}
                disabled={pending}
                style={{
                  height: 38, padding: '0 16px', borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--ink-2)',
                  fontSize: 'var(--text-body)', cursor: 'pointer',
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

function ActionButton({
  label, color, bg, icon, onClick,
}: {
  label: string; color: string; bg: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 28, padding: '0 10px', borderRadius: 6, border: 'none',
        background: bg, color, fontSize: 'var(--text-caption)', fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
