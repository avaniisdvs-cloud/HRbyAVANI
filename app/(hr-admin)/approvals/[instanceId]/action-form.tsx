'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, GitBranch, ChevronDown } from 'lucide-react'
import { takeWorkflowAction } from '@/modules/workflow'
import { decideLeaveRequest } from '@/modules/absence'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Props {
  stepInstanceId: string
  isFyiOnly: boolean
  canDelegate: boolean
  resourceType: string
  resourceId: string
}

export function WorkflowActionForm({ stepInstanceId, isFyiOnly, canDelegate, resourceType, resourceId }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [comment, setComment] = useState('')
  const [delegateTo, setDelegateTo] = useState('')
  const [showDelegate, setShowDelegate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(decision: 'APPROVE' | 'REJECT' | 'DELEGATE') {
    setError(null)

    if (decision === 'DELEGATE' && !delegateTo.trim()) {
      setError(locale === 'ar' ? 'أدخل معرّف الشخص أو البريد الإلكتروني للتفويض إليه.' : 'Enter the person ID or email to delegate to.')
      return
    }

    startTransition(async () => {
      // Leave decisions must also finalize the absence balance and decision metadata.
      // The generic workflow action alone only mirrors the request status.
      if (resourceType === 'absence_entries' && decision !== 'DELEGATE' && !isFyiOnly) {
        try {
          await decideLeaveRequest({ requestId: resourceId, action: decision, comment: comment.trim() || undefined })
          router.push('/approvals')
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الإجراء. يرجى المحاولة مرة أخرى.' : 'Action failed. Please try again.'))
        }
        return
      }
      const result = await takeWorkflowAction({
        stepInstanceId,
        actorPersonId: 'CURRENT_USER',   // server action resolves from session
        decision,
        decisionNote:         comment.trim() || undefined,
        delegateToPersonId:   decision === 'DELEGATE' ? delegateTo.trim() : undefined,
      })

      if (result.success) {
        router.push('/approvals')
        router.refresh()
      } else {
        setError(result.error ?? (locale === 'ar' ? 'فشل الإجراء. يرجى المحاولة مرة أخرى.' : 'Action failed. Please try again.'))
      }
    })
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px',
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
        {isFyiOnly ? (locale === 'ar' ? 'إقرار' : 'Acknowledge') : (locale === 'ar' ? 'قرارك' : 'Your decision')}
      </h3>

      {/* Comment */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
          {isFyiOnly ? (locale === 'ar' ? 'ملاحظة (اختياري)' : 'Note (optional)') : (locale === 'ar' ? 'تعليق' : 'Comment')}
          {!isFyiOnly && <span style={{ color: 'var(--ink-4)', fontWeight: 400, marginLeft: 4 }}>{locale === 'ar' ? 'اختياري' : 'optional'}</span>}
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          placeholder={isFyiOnly ? (locale === 'ar' ? 'أضف ملاحظة…' : 'Add a note…') : (locale === 'ar' ? 'أضف تعليقاً (مرئي في سجل التدقيق)…' : 'Add a comment (visible in audit log)…')}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 12px', fontSize: 'var(--text-body)', lineHeight: 1.5,
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--surface)', color: 'var(--ink-1)',
            resize: 'vertical', minHeight: 72, outline: 'none',
          }}
        />
      </div>

      {/* Delegate expand */}
      {canDelegate && !isFyiOnly && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setShowDelegate(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', padding: 0,
            }}
          >
            <GitBranch size={13} strokeWidth={2} aria-hidden />
            {locale === 'ar' ? 'تفويض إلى شخص آخر' : 'Delegate to another person'}
            <ChevronDown
              size={12}
              strokeWidth={2}
              style={{ transform: showDelegate ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
            />
          </button>

          {showDelegate && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                value={delegateTo}
                onChange={e => setDelegateTo(e.target.value)}
                placeholder={locale === 'ar' ? 'معرّف الشخص أو البريد الإلكتروني' : 'Person ID or email'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '7px 11px', fontSize: 'var(--text-body)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  background: 'var(--surface)', color: 'var(--ink-1)',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginBottom: 14, padding: '8px 12px', borderRadius: 7,
          background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
          fontSize: 'var(--text-caption)', fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isFyiOnly ? (
          <button
            onClick={() => submit('APPROVE')}
            disabled={isPending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: "var(--on-accent)", border: 'none',
              borderRadius: 7, padding: '8px 18px', fontSize: 'var(--text-body)', fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
            }}
          >
            <CheckCircle2 size={14} strokeWidth={2.5} aria-hidden />
            {isPending ? (locale === 'ar' ? 'جارٍ المعالجة…' : 'Processing…') : (locale === 'ar' ? 'إقرار' : 'Acknowledge')}
          </button>
        ) : (
          <>
            <button
              onClick={() => submit('APPROVE')}
              disabled={isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--status-approved-fg, #16a34a)', color: "var(--on-accent)", border: 'none',
                borderRadius: 7, padding: '8px 18px', fontSize: 'var(--text-body)', fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
              }}
            >
              <CheckCircle2 size={14} strokeWidth={2.5} aria-hidden />
              {locale === 'ar' ? 'موافقة' : 'Approve'}
            </button>

            <button
              onClick={() => submit('REJECT')}
              disabled={isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--status-rejected-fg)', color: "var(--on-accent)", border: 'none',
                borderRadius: 7, padding: '8px 18px', fontSize: 'var(--text-body)', fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
              }}
            >
              <XCircle size={14} strokeWidth={2.5} aria-hidden />
              {locale === 'ar' ? 'رفض' : 'Reject'}
            </button>

            {canDelegate && showDelegate && delegateTo.trim() && (
              <button
                onClick={() => submit('DELEGATE')}
                disabled={isPending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--surface)', color: 'var(--ink-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 7, padding: '8px 18px', fontSize: 'var(--text-body)', fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                }}
              >
                <GitBranch size={14} strokeWidth={2} aria-hidden />
                {locale === 'ar' ? 'تفويض' : 'Delegate'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
