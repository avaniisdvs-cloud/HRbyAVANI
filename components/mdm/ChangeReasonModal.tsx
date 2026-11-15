'use client'

import { useState, useEffect } from 'react'

interface ChangeReasonModalProps {
  open:           boolean
  onClose:        () => void
  onConfirm:      (reason: string) => void
  changeSummary?: string
  isPending?:     boolean
}

export function ChangeReasonModal({
  open,
  onClose,
  onConfirm,
  changeSummary,
  isPending = false,
}: ChangeReasonModalProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  if (!open) return null

  const canConfirm = reason.trim().length >= 10 && !isPending

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />
      <div style={{
        position: 'relative',
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--card)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        padding: '24px',
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink-1)', margin: '0 0 6px' }}>
          Reason for Change
        </h3>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '0 0 16px' }}>
          This record will be updated and the reason logged in the audit trail.
        </p>

        {changeSummary && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 16,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', fontSize: 'var(--text-caption)', letterSpacing: '0.04em' }}>
              Changes
            </span>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>{changeSummary}</p>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>
            Reason for change <span style={{ color: '#C62828' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Describe why this change is being made (min. 10 characters)…"
            rows={3}
            style={{
              width: '100%',
              border: '1.5px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 14,
              fontFamily: 'var(--font-sans)',
              color: 'var(--ink-1)',
              background: 'var(--card)',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            maxLength={500}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 'var(--text-caption)', color: reason.trim().length < 10 ? '#C62828' : 'var(--ink-4)' }}>
              {reason.trim().length < 10 ? `${10 - reason.trim().length} more characters required` : 'Minimum length met ✓'}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{reason.length}/500</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              height: 36, padding: '0 16px',
              border: '1.5px solid var(--border)',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--ink-2)',
              fontSize: 'var(--text-body)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => canConfirm && onConfirm(reason.trim())}
            disabled={!canConfirm}
            style={{
              height: 36, padding: '0 16px',
              border: 'none',
              borderRadius: 10,
              background: canConfirm ? 'var(--accent)' : 'var(--border)',
              color: canConfirm ? '#fff' : 'var(--ink-4)',
              fontSize: 'var(--text-body)',
              fontWeight: 600,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isPending ? 'Saving…' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </div>
  )
}
