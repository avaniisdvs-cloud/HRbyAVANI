'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface DisableConfirmDialogProps {
  open:            boolean
  onClose:         () => void
  onConfirm:       (reason: string) => void
  entityName:      string
  warningMessage?: string
  isPending?:      boolean
}

export function DisableConfirmDialog({
  open,
  onClose,
  onConfirm,
  entityName,
  warningMessage = 'Existing assignments are unaffected.',
  isPending = false,
}: DisableConfirmDialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  if (!open) return null

  const canConfirm = reason.trim().length >= 10 && !isPending

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
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
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#FBE9E9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={20} color="#C62828" />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink-1)', margin: '0 0 4px' }}>
              Disable Record
            </h3>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
              This will deactivate <strong style={{ color: 'var(--ink-2)' }}>{entityName}</strong>. {warningMessage}
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>
            Reason for disabling <span style={{ color: '#C62828' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Describe why this record is being disabled (min. 10 characters)…"
            rows={3}
            style={{
              width: '100%',
              border: '1.5px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 'var(--text-body)',
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
          <span style={{ fontSize: 'var(--text-caption)', color: reason.trim().length < 10 ? '#C62828' : 'var(--ink-4)', marginTop: 4, display: 'block' }}>
            {reason.trim().length < 10 ? `${10 - reason.trim().length} more characters required` : 'Minimum length met ✓'}
          </span>
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
              border: canConfirm ? '1.5px solid #E57373' : 'none',
              borderRadius: 10,
              background: canConfirm ? 'transparent' : 'var(--border)',
              color: canConfirm ? '#C62828' : 'var(--ink-4)',
              fontSize: 'var(--text-body)',
              fontWeight: 600,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {isPending ? 'Disabling…' : 'Disable Record'}
          </button>
        </div>
      </div>
    </div>
  )
}
