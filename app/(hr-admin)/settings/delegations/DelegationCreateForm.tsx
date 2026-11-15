'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createApprovalDelegation } from '@/modules/config'
import { DateInput } from '@/components/forms/DateInput'
import { type Locale } from '@/lib/i18n'

const TRIGGER_EVENTS = [
  'HIRE', 'TRANSFER', 'LEAVE_REQUEST', 'LEAVE', 'SALARY_REVISION',
  'TERMINATION', 'DEPENDENT_ADD', 'DOCUMENT_VERIFY', 'OVERTIME', 'EXIT_CLEARANCE',
] as const

interface DelegateCandidate {
  id:           string
  personNumber: string
  fullNameEn:   string | null
  fullNameAr:   string | null
}

interface Props {
  delegateCandidates: DelegateCandidate[]
  locale?: Locale
}

/**
 * S9-04 — Create an ongoing approval delegation.
 *
 * Pre-arranged delegation for a date window — typically while the approver
 * is on leave. Different from S9-03 per-instance delegation.
 *
 * Hard Rule 5: bilingual labels. Hard Rule 7: token-based colours.
 */
export function DelegationCreateForm({ delegateCandidates, locale = 'en' }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [delegateId, setDelegateId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [scopeMode, setScopeMode] = useState<'ALL' | 'CUSTOM'>('ALL')
  const [scopes, setScopes] = useState<string[]>([])
  const [reason, setReason] = useState('')

  const toggleScope = (e: string) => {
    setScopes(prev => prev.includes(e) ? prev.filter(s => s !== e) : [...prev, e])
  }

  const submit = () => {
    setError(null)
    if (!delegateId)        return setError(locale === 'ar' ? 'اختر المُفوَّض إليه' : 'Pick a delegate')
    if (!from || !to)       return setError(locale === 'ar' ? 'اختر نطاق التواريخ' : 'Pick a date range')
    if (from > to)          return setError(locale === 'ar' ? 'تاريخ النهاية بعد البداية' : 'End date must be on or after start')
    if (scopeMode === 'CUSTOM' && scopes.length === 0) {
      return setError(locale === 'ar' ? 'اختر نطاقًا واحدًا على الأقل' : 'Pick at least one scope')
    }

    startTransition(async () => {
      try {
        await createApprovalDelegation({
          delegateId,
          delegationFrom: from,
          delegationTo:   to,
          scopeTypes:     scopeMode === 'ALL' ? [] : scopes,
          reason:         reason.trim() || undefined,
        })
        // Reset form + refresh list
        setDelegateId(''); setFrom(''); setTo('')
        setScopeMode('ALL'); setScopes([]); setReason('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to save. Please try again or contact IT support.')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">
          {locale === 'ar' ? 'المُفوَّض إليه' : 'Delegate to'} <span className="ms-1 text-destructive">*</span>
        </Label>
        <Select value={delegateId} onValueChange={setDelegateId}>
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">
            {locale === 'ar' ? 'من' : 'From'} <span className="ms-1 text-destructive">*</span>
          </Label>
          <DateInput shadcn value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            {locale === 'ar' ? 'إلى' : 'To'} <span className="ms-1 text-destructive">*</span>
          </Label>
          <DateInput shadcn value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{locale === 'ar' ? 'النطاق' : 'Scope'}</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScopeMode('ALL')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              scopeMode === 'ALL'
                ? 'bg-accent text-white'
                : 'border border-border bg-surface text-ink-2 hover:border-accent'
            }`}
          >
            {locale === 'ar' ? 'جميع المعاملات' : 'All transactions'}
          </button>
          <button
            type="button"
            onClick={() => setScopeMode('CUSTOM')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              scopeMode === 'CUSTOM'
                ? 'bg-accent text-white'
                : 'border border-border bg-surface text-ink-2 hover:border-accent'
            }`}
          >
            {locale === 'ar' ? 'حدد الأنواع' : 'Pick types'}
          </button>
        </div>
        {scopeMode === 'CUSTOM' && (
          <div className="mt-2 flex flex-wrap gap-2">
            {TRIGGER_EVENTS.map(t => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                  scopes.includes(t)
                    ? 'border-accent bg-accent-100 text-accent-700'
                    : 'border-border bg-surface text-ink-2'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-accent"
                  checked={scopes.includes(t)}
                  onChange={() => toggleScope(t)}
                />
                {t}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{locale === 'ar' ? 'السبب (اختياري)' : 'Reason (optional)'}</Label>
        <Textarea
          rows={2}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="On annual leave 5–12 May"
        />
      </div>

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button onClick={submit} disabled={pending}>
        {pending
          ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
          : (locale === 'ar' ? 'إنشاء التفويض' : 'Create delegation')}
      </Button>
    </div>
  )
}
