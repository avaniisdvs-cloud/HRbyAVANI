'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { takeWorkflowAction } from '@/modules/workflow'
import { type Locale } from '@/lib/i18n'

interface DelegateCandidate {
  id:           string
  personNumber: string
  fullNameEn:   string | null
  fullNameAr:   string | null
}

interface Props {
  stepInstanceId:     string
  canDelegate:        boolean
  delegateCandidates: DelegateCandidate[]
  locale?:            Locale
}

export function WorkflowDecisionForm({
  stepInstanceId, canDelegate, delegateCandidates, locale = 'en',
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'APPROVE' | 'REJECT' | 'DELEGATE'>('APPROVE')
  const [comment, setComment] = useState('')
  const [delegateTo, setDelegateTo] = useState<string>('')

  const submit = () => {
    setError(null)
    if (mode === 'REJECT' && !comment.trim()) {
      setError(locale === 'ar' ? 'الرفض يتطلب تعليقًا' : 'Reject requires a comment')
      return
    }
    if (mode === 'DELEGATE') {
      if (!delegateTo) {
        setError(locale === 'ar' ? 'اختر شخصًا للتفويض إليه' : 'Pick a person to delegate to')
        return
      }
      if (!comment.trim()) {
        setError(locale === 'ar' ? 'التفويض يتطلب ملاحظة' : 'Delegation requires a note')
        return
      }
    }
    startTransition(async () => {
      const result = await takeWorkflowAction({
        stepInstanceId,
        actorPersonId:      'CURRENT_USER',
        decision:           mode,
        decisionNote:       comment.trim() || undefined,
        delegateToPersonId: mode === 'DELEGATE' ? delegateTo : undefined,
      })
      if (result.success) {
        router.push('/workflows')
        router.refresh()
      } else {
        setError(result.error ?? 'This action could not be completed. Please try again or contact IT support.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('APPROVE')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
            mode === 'APPROVE'
              ? 'bg-accent text-white'
              : 'border border-border bg-surface text-ink-2 hover:border-accent hover:text-accent'
          }`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden strokeWidth={2.5} />
          {locale === 'ar' ? 'موافقة' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => setMode('REJECT')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
            mode === 'REJECT'
              ? 'bg-destructive text-white'
              : 'border border-border bg-surface text-ink-2 hover:border-destructive hover:text-destructive'
          }`}
        >
          <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2.5} />
          {locale === 'ar' ? 'رفض' : 'Reject'}
        </button>
        {canDelegate && (
          <button
            type="button"
            onClick={() => setMode('DELEGATE')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              mode === 'DELEGATE'
                ? 'bg-status-warning-fg text-white'
                : 'border border-border bg-surface text-ink-2 hover:border-status-warning-fg hover:text-status-warning-fg'
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
            {locale === 'ar' ? 'تفويض' : 'Delegate'}
          </button>
        )}
      </div>

      {mode === 'DELEGATE' && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {locale === 'ar' ? 'تفويض إلى' : 'Delegate to'}
            <span className="ms-1 text-destructive">*</span>
          </Label>
          <Select value={delegateTo} onValueChange={setDelegateTo}>
            <SelectTrigger>
              <SelectValue placeholder={locale === 'ar' ? '— اختر شخصًا —' : '— Pick a person —'} />
            </SelectTrigger>
            <SelectContent>
              {delegateCandidates.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.personNumber} — {(locale === 'ar' ? p.fullNameAr : p.fullNameEn) ?? p.fullNameEn ?? p.fullNameAr ?? '—'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-3">
            The delegate becomes the sole approver for this instance until they act on it.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">
          {mode === 'APPROVE'
            ? (locale === 'ar' ? 'تعليق (اختياري)' : 'Comment (optional)')
            : mode === 'REJECT'
              ? (locale === 'ar' ? 'سبب الرفض' : 'Rejection reason')
              : (locale === 'ar' ? 'ملاحظة التفويض' : 'Delegation note')}
          {mode !== 'APPROVE' && <span className="ms-1 text-destructive">*</span>}
        </Label>
        <Textarea
          rows={3}
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={
            mode === 'APPROVE'
              ? 'Optional reviewer comment'
              : mode === 'REJECT'
                ? 'Why is this being rejected?'
                : 'Why are you delegating?'
          }
        />
      </div>

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={submit}
          disabled={pending}
          className={
            mode === 'REJECT'
              ? 'bg-destructive hover:bg-destructive/90'
              : mode === 'DELEGATE'
                ? 'bg-status-warning-fg hover:bg-status-warning-fg/90'
                : ''
          }
        >
          {pending ? (
            locale === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…'
          ) : mode === 'APPROVE' ? (
            <><Check className="me-1.5 h-3.5 w-3.5" aria-hidden strokeWidth={2.5} />{locale === 'ar' ? 'موافقة' : 'Approve'}</>
          ) : mode === 'REJECT' ? (
            <><X className="me-1.5 h-3.5 w-3.5" aria-hidden strokeWidth={2.5} />{locale === 'ar' ? 'رفض' : 'Reject'}</>
          ) : (
            <><ArrowRight className="me-1.5 h-3.5 w-3.5" aria-hidden strokeWidth={2} />{locale === 'ar' ? 'تفويض' : 'Delegate'}</>
          )}
        </Button>
      </div>
    </div>
  )
}
