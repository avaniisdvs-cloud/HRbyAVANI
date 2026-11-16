'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function HrAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[hr-admin error boundary]', error)
  }, [error])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: 'calc(100vh - 104px)', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--status-rejected-bg)', display: 'grid',
        placeItems: 'center', color: 'var(--status-rejected-fg)',
      }}>
        <AlertTriangle size={22} strokeWidth={1.75} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 'var(--text-lead)', fontWeight: 600, color: 'var(--ink-1)', marginBottom: 6 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', marginBottom: 20 }}>
          {error.message ?? 'An unexpected error occurred loading this page.'}
        </div>
        <button
          onClick={reset}
          style={{
            background: 'var(--accent)', color: 'var(--card)',
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
