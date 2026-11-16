'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// Known user-facing message patterns — safe to display as-is
const SAFE_MESSAGE_PATTERN = /^[A-Z][^{}<>[\]`|\\]*\.?$/

function isSafeForDisplay(msg: string): boolean {
  // AppError messages are plain English sentences without technical symbols
  return msg.length > 0 && msg.length < 400 && SAFE_MESSAGE_PATTERN.test(msg)
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Full technical detail stays on the server/console — never shown to user
    console.error('[AVANIIS global error boundary]', error)
  }, [error])

  const userMessage = isSafeForDisplay(error.message)
    ? error.message
    : 'An unexpected error occurred. Our team has been notified.'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
      fontFamily: 'system-ui, sans-serif', padding: '0 24px',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: '#FBE9E9', display: 'grid',
        placeItems: 'center', color: '#8A1F1F',
      }}>
        <AlertTriangle size={22} strokeWidth={1.75} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 'var(--text-lead)', fontWeight: 600, color: '#151A22', marginBottom: 6 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 'var(--text-body)', color: '#6E7885', marginBottom: 4, lineHeight: 1.6 }}>
          {userMessage}
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: '#9EA8B5', marginBottom: 20 }}>
          If this keeps happening, contact IT support and describe what you were doing.
          {error.digest ? ` Reference: ${error.digest}` : ''}
        </div>
        <button
          onClick={reset}
          style={{
            background: '#2E6170', color: "var(--on-accent)",
            border: 'none', borderRadius: 7, padding: '9px 20px',
            fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
