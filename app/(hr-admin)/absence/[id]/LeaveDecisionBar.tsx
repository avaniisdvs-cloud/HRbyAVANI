'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  submitLeaveRequest, cancelLeaveRequest, decideLeaveRequest,
} from '@/modules/absence'
import { type Locale } from '@/lib/i18n'

interface Props {
  requestId:  string
  status:     string
  canSubmit:  boolean
  canDecide:  boolean
  canCancel:  boolean
  locale?:    Locale
}

/**
 * S5-08 — Approve / Reject / Cancel / Submit bar (Client Component).
 * Wires UI controls back to modules/absence Server Actions; refresh after
 * each successful action so the page picks up the new status.
 */
export function LeaveDecisionBar({ requestId, status, canSubmit, canDecide, canCancel, locale = 'en' }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [comment,          setComment]          = useState('')
  const [error,            setError]            = useState<string | null>(null)
  const [confirmingApprove, setConfirmingApprove] = useState(false)

  if (!canSubmit && !canDecide && !canCancel) return null

  const onSubmit = () => {
    setError(null)
    startTransition(async () => {
      try {
        await submitLeaveRequest(requestId)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'تعذّر إرسال هذا الطلب. يرجى المحاولة مرة أخرى.' : 'Unable to submit this request. Please try again.'))
      }
    })
  }
  const onApprove = () => {
    setError(null)
    setConfirmingApprove(false)
    startTransition(async () => {
      try {
        await decideLeaveRequest({ requestId, action: 'APPROVE', comment: comment || undefined })
        setComment('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'تعذّرت الموافقة على هذا الطلب. يرجى المحاولة مرة أخرى.' : 'Unable to approve this request. Please try again.'))
      }
    })
  }
  const onReject = () => {
    if (!comment.trim()) {
      setError(locale === 'ar' ? 'يرجى تقديم سبب قبل رفض طلب الإجازة.' : 'Please provide a reason before rejecting this leave request.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await decideLeaveRequest({ requestId, action: 'REJECT', comment })
        setComment('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'تعذّر رفض هذا الطلب. يرجى المحاولة مرة أخرى.' : 'Unable to reject this request. Please try again.'))
      }
    })
  }
  const onCancel = () => {
    if (!comment.trim()) {
      setError(locale === 'ar' ? 'يرجى تقديم سبب قبل إلغاء طلب الإجازة.' : 'Please provide a reason before cancelling this leave request.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await cancelLeaveRequest({ requestId, reason: comment })
        setComment('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'تعذّر إلغاء هذا الطلب. يرجى المحاولة مرة أخرى.' : 'Unable to cancel this request. Please try again.'))
      }
    })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'اتخذ إجراء' : 'Take action'}</h3>
      </div>
      <div style={{ padding: '16px 20px' }} className="space-y-3">
        {(canDecide || canCancel) && (
          <div>
            <label className="text-xs text-ink-3" htmlFor="leave-comment">
              {locale === 'ar' ? 'تعليق / سبب' : 'Comment / reason'} {canCancel || canDecide ? (locale === 'ar' ? '(مطلوب للرفض / الإلغاء)' : '(required for reject / cancel)') : ''}
            </label>
            <Textarea
              id="leave-comment"
              placeholder={locale === 'ar' ? 'مثال: رصيد غير كافٍ · يتعارض مع موعد التسليم' : 'e.g., Insufficient balance · Conflicts with sprint cut'}
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
            />
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-destructive">{locale === 'ar' ? 'تعذّر إكمال الإجراء' : 'Action could not be completed'}</p>
            <p className="mt-0.5 text-destructive/90">{error}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <Button onClick={onSubmit} disabled={pending}>
              {pending
                ? (locale === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…')
                : (locale === 'ar'
                    ? (status === 'REJECTED' ? 'إعادة إرسال الطلب' : 'إرسال الطلب')
                    : `Submit ${status === 'REJECTED' ? 're-request' : 'request'}`)}
            </Button>
          )}
          {canDecide && (
            <>
              {confirmingApprove ? (
                <>
                  <Button onClick={onApprove} disabled={pending}>
                    {pending ? '…' : (locale === 'ar' ? 'تأكيد الموافقة' : 'Confirm approval')}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmingApprove(false)} disabled={pending}>
                    {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                </>
              ) : (
                <Button onClick={() => { setError(null); setConfirmingApprove(true) }} disabled={pending}>
                  {locale === 'ar' ? 'موافقة' : 'Approve'}
                </Button>
              )}
              <Button variant="outline" onClick={onReject} disabled={pending}>
                {pending ? '…' : (locale === 'ar' ? 'رفض' : 'Reject')}
              </Button>
            </>
          )}
          {canCancel && (
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              {pending ? '…' : (locale === 'ar' ? 'إلغاء الطلب' : 'Cancel request')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
