'use client'

/**
 * InitiateReviewButton — triggers initiateProbationReview server action.
 * Shows spinner while pending; success message on resolve; error on reject.
 */

import { useState, useTransition } from 'react'
import { initiateProbationReview } from '@/modules/core-hr/probation/workflow-actions'

export function InitiateReviewButton({ personId }: { personId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  function handleClick() {
    setResult('idle')
    setErrorMsg('')
    startTransition(async () => {
      try {
        await initiateProbationReview({ personId, initiatedByChannel: 'EMPLOYEE' })
        setResult('success')
      } catch (err: unknown) {
        setResult('error')
        setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.')
      }
    })
  }

  if (result === 'success') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: 'var(--accent-050)',
        border: '1px solid var(--accent-200)',
        borderRadius: 10,
        padding: '16px 20px',
      }}>
        {/* Tick icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="10" cy="10" r="10" fill="var(--accent)" />
          <path d="M6 10l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--brand-active)', marginBottom: 4 }}>
            Review request submitted
          </div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Your review request has been submitted. Your Line Manager will be notified.
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 4 }} dir="rtl" lang="ar">
            تم تقديم طلب المراجعة. سيتم إخطار مديرك المباشر.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 22px',
          background: isPending ? 'var(--accent-100)' : 'var(--accent)',
          color: "var(--on-accent)",
          border: 'none',
          borderRadius: 8,
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-sans)',
          transition: 'background 0.15s',
        }}
        aria-busy={isPending}
      >
        {isPending && (
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ animation: 'spin 0.75s linear infinite' }}
          >
            <circle cx="8" cy="8" r="6" stroke="#fff" strokeWidth="2" strokeOpacity="0.3" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </svg>
        )}
        {isPending ? 'Submitting…' : 'Request Probation Review'}
      </button>
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginLeft: 12 }} dir="rtl" lang="ar">
        طلب مراجعة فترة التجربة
      </span>

      {result === 'error' && (
        <div style={{
          marginTop: 12,
          background: 'var(--status-rejected-bg)',
          border: '1px solid var(--status-rejected-dot)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 'var(--text-body)',
          color: 'var(--status-rejected-fg)',
        }}>
          {errorMsg || 'Unable to submit review request. Please try again or contact HR.'}
        </div>
      )}
    </div>
  )
}
