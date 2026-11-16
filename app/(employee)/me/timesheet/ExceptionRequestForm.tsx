'use client'

import { useState, useTransition } from 'react'
import { submitExceptionRequest } from '@/modules/timesheets/actions'
import { DateInput } from '@/components/forms/DateInput'

const EXCEPTION_TYPES = [
  { value: 'LATE_COMING',     label: 'Late Coming'       },
  { value: 'EARLY_LEAVING',   label: 'Early Leaving'     },
  { value: 'MISS_PUNCH',      label: 'Miss Punch'        },
  { value: 'BUSINESS_MEETING', label: 'Business Meeting' },
  { value: 'OTHER',           label: 'Other'             },
]

function today(): string { return new Date().toISOString().slice(0, 10) }

export function ExceptionRequestForm() {
  const [form, setForm] = useState({
    exceptionDate:    today(),
    exceptionType:    'MISS_PUNCH',
    reason:           '',
    requestedTimeIn:  '',
    requestedTimeOut: '',
  })
  const [success,   setSuccess]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      try {
        await submitExceptionRequest({
          exceptionDate:    form.exceptionDate,
          exceptionType:    form.exceptionType,
          reason:           form.reason,
          requestedTimeIn:  form.requestedTimeIn  ? `${form.exceptionDate}T${form.requestedTimeIn}:00` : undefined,
          requestedTimeOut: form.requestedTimeOut ? `${form.exceptionDate}T${form.requestedTimeOut}:00` : undefined,
        })
        setSuccess(true)
        setForm(f => ({ ...f, reason: '', requestedTimeIn: '', requestedTimeOut: '' }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'This action could not be completed. Please try again.')
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '0.4rem 0.6rem',
    borderRadius: '0.375rem',
    border:       '1px solid var(--border)',
    background:   'var(--background)',
    color:        'var(--foreground)',
    fontSize:     '0.875rem',
    boxSizing:    'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.25rem',
    fontSize:      'var(--text-caption)',
    color:         'var(--muted-foreground)',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <label style={labelStyle}>
        Date
        <DateInput value={form.exceptionDate} onChange={field('exceptionDate')} style={inputStyle} required />
      </label>

      <label style={labelStyle}>
        Exception Type
        <select value={form.exceptionType} onChange={field('exceptionType')} style={inputStyle} required>
          {EXCEPTION_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Requested Time In
        <input type="time" value={form.requestedTimeIn} onChange={field('requestedTimeIn')} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Requested Time Out
        <input type="time" value={form.requestedTimeOut} onChange={field('requestedTimeOut')} style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Reason
        <textarea
          value={form.reason}
          onChange={field('reason')}
          required
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Explain the reason for your exception request…"
        />
      </label>

      {error && (
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)', fontSize: 'var(--text-caption)' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.375rem', background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)', fontSize: 'var(--text-caption)' }}>
          Exception request submitted successfully.
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          padding:      '0.5rem 1rem',
          borderRadius: '0.375rem',
          border:       'none',
          background:   'var(--accent)',
          color:        'var(--accent-foreground)',
          fontWeight:   600,
          cursor:       isPending ? 'not-allowed' : 'pointer',
          fontSize:     '0.875rem',
        }}
      >
        {isPending ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  )
}
