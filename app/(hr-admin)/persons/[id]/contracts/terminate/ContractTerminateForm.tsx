'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { terminateContract } from '@/modules/core-hr'
import type { TerminateContractInput } from '@/modules/core-hr'

interface CurrentContract {
  id:             string
  contractNumber: string
  startDate:      string
  endDate:        string
  employmentType: string
  status:         string
}

interface Props {
  personId: string
  contract: CurrentContract
}

const TERMINATION_REASONS = [
  'RESIGNATION',
  'END_OF_FIXED_TERM',
  'TERMINATION_BY_EMPLOYER',
  'TERMINATION_FOR_CAUSE',
  'MUTUAL_AGREEMENT',
  'RETIREMENT',
  'DEATH',
  'BUSINESS_CLOSURE',
  'OTHER',
] as const
type TerminationReasonCode = (typeof TERMINATION_REASONS)[number]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plus14DaysIso(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

export function ContractTerminateForm({ personId, contract }: Props) {
  const [terminationDate,   setTerminationDate]   = useState(todayIso())
  const [reasonCode,        setReasonCode]        = useState<TerminationReasonCode | ''>('')
  const [reasonDetail,      setReasonDetail]      = useState('')
  const [notes,             setNotes]             = useState('')
  const [acknowledgedFinal, setAcknowledgedFinal] = useState(false)

  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const locale = useLocale()
  const router    = useRouter()

  const beforeStart = terminationDate < contract.startDate

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    if (!reasonCode) {
      setErrors({ reasonCode: locale === 'ar' ? 'السبب مطلوب' : 'Reason is required' })
      return
    }
    if (beforeStart) {
      setErrors({ terminationDate: locale === 'ar' ? 'لا يمكن أن يسبق تاريخ الإنهاء تاريخ بداية العقد' : 'terminationDate cannot precede the contract start date' })
      return
    }
    if (!acknowledgedFinal) {
      setErrors({ acknowledgedFinal: locale === 'ar' ? 'BR-EOSB-PAY-001: أكّد الالتزام بالتسوية النهائية خلال 14 يوماً' : 'BR-EOSB-PAY-001: confirm 14-day final-payment commitment' })
      return
    }

    // Compose the audit-friendly reason string: code + free text.
    const composedReason = reasonDetail.trim()
      ? `${reasonCode} — ${reasonDetail.trim()}`
      : reasonCode

    const input: TerminateContractInput = {
      contractId:        contract.id,
      terminationDate,
      terminationReason: composedReason,
      notes:             notes.trim() ? notes.trim() : undefined,
    }

    start(async () => {
      try {
        await terminateContract(input)
        toast({
          title: locale === 'ar' ? 'تم إنهاء العقد' : 'Contract terminated',
          description: locale === 'ar'
            ? `تم وضع علامة "منتهٍ" على ${contract.contractNumber} بتاريخ ${terminationDate}. تُستحق التسوية النهائية بحلول ${plus14DaysIso(terminationDate)} (BR-EOSB-PAY-001).`
            : `${contract.contractNumber} marked TERMINATED on ${terminationDate}. Final settlement due by ${plus14DaysIso(terminationDate)} (BR-EOSB-PAY-001).`,
        })
        router.push(`/persons/${personId}`)
        router.refresh()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الإنهاء' : 'Termination failed')
        toast({ title: locale === 'ar' ? 'تعذّر الإنهاء' : 'Could not terminate', description: message, variant: 'destructive' })
        if (message.startsWith('[')) {
          try {
            const issues = JSON.parse(message) as Array<{ path: string[]; message: string }>
            const next: Record<string, string> = {}
            for (const i of issues) next[i.path.join('.')] = i.message
            setErrors(next)
          } catch { /* ignore */ }
        }
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Current state */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'العقد الجاري إنهاؤه' : 'Contract being terminated'}
            <Badge className="ms-2 align-middle" variant="secondary">{contract.contractNumber}</Badge>
            <Badge className="ms-2 align-middle" variant="outline">{contract.status}</Badge>
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <dl className="grid gap-y-2 text-sm sm:grid-cols-2">
            <Row k={locale === 'ar' ? 'تاريخ البداية' : 'Start date'}      v={contract.startDate} />
            <Row k={locale === 'ar' ? 'تاريخ النهاية' : 'End date'}        v={contract.endDate} />
            <Row k={locale === 'ar' ? 'نوع التوظيف' : 'Employment type'} v={contract.employmentType} />
          </dl>
        </div>
      </div>

      {/* Termination details */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'تفاصيل الإنهاء' : 'Termination details'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <HijriDatePicker
                label={locale === 'ar' ? 'تاريخ الإنهاء' : 'Termination date'}
                required
                value={terminationDate}
                onChange={setTerminationDate}
                disabled={pending}
                helpText={errors['terminationDate']
                  ? undefined
                  : (locale === 'ar'
                    ? `تُستحق التسوية النهائية بحلول ${plus14DaysIso(terminationDate)} (BR-EOSB-PAY-001 — 14 يوماً بعد الإنهاء).`
                    : `Final settlement due by ${plus14DaysIso(terminationDate)} (BR-EOSB-PAY-001 — 14 days post-termination).`)}
              />
              {errors['terminationDate'] && (
                <p className="mt-1 text-xs text-destructive">{errors['terminationDate']}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'السبب' : 'Reason'}<span className="ms-0.5 text-destructive">*</span>
              </Label>
              <Select value={reasonCode || undefined}
                onValueChange={v => setReasonCode(v as TerminationReasonCode)}
                disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر السبب' : 'Select reason'} /></SelectTrigger>
                <SelectContent>
                  {TERMINATION_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors['reasonCode'] && <p className="text-xs text-destructive">{errors['reasonCode']}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasonDetail" className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'تفاصيل السبب (اختياري)' : 'Reason detail (optional)'}
            </Label>
            <Textarea id="reasonDetail" rows={2}
              value={reasonDetail}
              onChange={e => setReasonDetail(e.target.value)}
              placeholder={locale === 'ar' ? 'سياق نصي حر — يُضاف إلى رمز السبب في سجل التدقيق.' : 'Free-text context — appended to the reason code in the audit row.'}
              maxLength={150}
              disabled={pending} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
            <Textarea id="notes" rows={3} value={notes}
              onChange={e => setNotes(e.target.value)} disabled={pending} />
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-xs text-ink-2">
            <input type="checkbox" checked={acknowledgedFinal}
              onChange={e => setAcknowledgedFinal(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
            <span>
              {locale === 'ar'
                ? <>أؤكّد أن التسوية النهائية (البدل عن مدة الإشعار، مكافأة نهاية الخدمة، الإجازات غير المستخدمة) ستُصرف خلال <strong>14 يوماً</strong> من تاريخ الإنهاء وفق BR-EOSB-PAY-001. ستُظهر وحدة الرواتب ذلك في دورة الصرف التالية.</>
                : <>I confirm the final settlement (salary in lieu, EOSB, untaken leave) will be dispatched within <strong>14 days</strong> of the termination date per BR-EOSB-PAY-001. The Payroll module will surface this on the next pay run.</>}
            </span>
          </label>
          {errors['acknowledgedFinal'] && <p className="text-xs text-destructive">{errors['acknowledgedFinal']}</p>}
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-3 text-xs text-ink-3">
        <p className="font-medium text-ink-2">{locale === 'ar' ? 'قواعد العمل المطبّقة من جهة الخادم' : 'Business rules enforced server-side'}</p>
        <ul className="mt-1 list-disc ps-5">
          <li>{locale === 'ar' ? 'القاعدة الصارمة 3: يُحفظ صف العقد (تتحول الحالة إلى TERMINATED) — ولا يُحذف أبداً.' : 'Hard Rule 3: contract row preserved (status flips to TERMINATED) — never deleted.'}</li>
          <li>{locale === 'ar' ? 'BR-EOSB-PAY-001: التسوية النهائية خلال 14 يوماً؛ تظهر في دورة الرواتب التالية.' : 'BR-EOSB-PAY-001: final settlement within 14 days; surfaced on next payroll run.'}</li>
          <li>{locale === 'ar' ? 'التدقيق: تُكتب صفوف PERSON.TERMINATED + CONTRACT.TERMINATED في نفس المعاملة.' : 'Audit: PERSON.TERMINATED + CONTRACT.TERMINATED rows written in same transaction.'}</li>
        </ul>
      </div>

      <div className="flex items-center justify-end gap-3 pb-8">
        <Button type="button" variant="outline" onClick={() => router.push(`/persons/${personId}`)} disabled={pending}>
          {locale === 'ar' ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={pending} variant="destructive">
          {pending ? (locale === 'ar' ? 'جارٍ الإنهاء…' : 'Terminating…') : (locale === 'ar' ? 'إنهاء العقد' : 'Terminate contract')}
        </Button>
      </div>
    </form>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-ink-1">{v}</dd>
    </div>
  )
}
