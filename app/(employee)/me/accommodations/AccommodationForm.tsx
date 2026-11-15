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
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { requestDisabilityParentalAccommodation } from '@/modules/absence'
import { DateInput } from '@/components/forms/DateInput'
import type { AccommodationRequestInput } from '@/modules/absence'

type RequestType = 'DISABILITY' | 'PARENTAL' | 'NURSING_BREAK'

const REQUEST_TYPE_OPTIONS: { value: RequestType; labelEn: string; labelAr: string }[] = [
  { value: 'DISABILITY',    labelEn: 'Disability Accommodation',  labelAr: 'تسهيلات الإعاقة' },
  { value: 'PARENTAL',      labelEn: 'Parental Accommodation',    labelAr: 'تسهيلات الوالدية' },
  { value: 'NURSING_BREAK', labelEn: 'Nursing Break',             labelAr: 'استراحة الرضاعة' },
]

const today = () => new Date().toISOString().slice(0, 10)

export function AccommodationForm() {
  const [requestType, setRequestType] = useState<RequestType>('DISABILITY')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [descriptionAr, setDescriptionAr] = useState('')
  const [requestedAdjustments, setRequestedAdjustments] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [endDate, setEndDate] = useState('')

  const [pending, start] = useTransition()
  const { toast } = useToast()
  const locale = useLocale()
  const router = useRouter()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const input: AccommodationRequestInput = {
      requestType,
      descriptionEn:        descriptionEn.trim(),
      descriptionAr:        descriptionAr.trim(),
      requestedAdjustments: requestedAdjustments.trim(),
      effectiveDate,
      endDate:              endDate || undefined,
    }

    start(async () => {
      try {
        const result = await requestDisabilityParentalAccommodation(input)
        toast({
          title: locale === 'ar' ? 'تم إرسال طلب التسهيلات' : 'Accommodation request submitted',
          description: locale === 'ar'
            ? `رقم الطلب ${result.requestId.slice(0, 8)}… أُرسل للموافقة.`
            : `Request ID ${result.requestId.slice(0, 8)}… sent for approval.`,
        })
        router.push('/me')
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'تعذّر إرسال الطلب' : 'Could not submit request',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">
          {locale === 'ar' ? 'نوع التسهيل' : 'Accommodation type'}<span className="ms-0.5 text-destructive">*</span>
        </Label>
        <Select value={requestType} onValueChange={v => setRequestType(v as RequestType)} disabled={pending}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {REQUEST_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.labelEn}
                <span className="ms-2 text-xs text-ink-3" dir="rtl" lang="ar">{o.labelAr}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descriptionEn" className="text-xs font-medium text-ink-2">
          {locale === 'ar' ? 'الوصف' : 'Description'}<span className="ms-0.5 text-destructive">*</span>
          <span className="ms-2 text-xs uppercase tracking-wide text-ink-3">EN</span>
        </Label>
        <Textarea
          id="descriptionEn"
          required
          rows={3}
          value={descriptionEn}
          onChange={e => setDescriptionEn(e.target.value)}
          placeholder={locale === 'ar' ? 'صِف التسهيل المطلوب (بالإنجليزية)…' : 'Describe the accommodation needed…'}
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descriptionAr" className="text-xs font-medium text-ink-2">
          {locale === 'ar' ? 'الوصف' : 'Description'}<span className="ms-0.5 text-destructive">*</span>
          <span className="ms-2 text-xs uppercase tracking-wide text-ink-3">AR</span>
        </Label>
        <Textarea
          id="descriptionAr"
          required
          dir="rtl"
          lang="ar"
          rows={3}
          value={descriptionAr}
          onChange={e => setDescriptionAr(e.target.value)}
          placeholder="صِف التسهيل المطلوب…"
          className="text-end"
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="adjustments" className="text-xs font-medium text-ink-2">
          {locale === 'ar' ? 'التعديلات المطلوبة' : 'Requested adjustments'}
        </Label>
        <Textarea
          id="adjustments"
          rows={2}
          value={requestedAdjustments}
          onChange={e => setRequestedAdjustments(e.target.value)}
          placeholder={locale === 'ar' ? 'مثال: وقت بدء مرن، موقف سيارة مخصص…' : 'e.g. flexible start time, dedicated parking space…'}
          disabled={pending}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="effectiveDate" className="text-xs font-medium text-ink-2">
            {locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}<span className="ms-0.5 text-destructive">*</span>
          </Label>
          <DateInput
            shadcn
            id="effectiveDate"
            required
            min={today()}
            value={effectiveDate}
            onChange={e => setEffectiveDate(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate" className="text-xs font-medium text-ink-2">
            {locale === 'ar' ? 'تاريخ الانتهاء' : 'End date'} <span className="text-ink-3">{locale === 'ar' ? '(اختياري)' : '(optional)'}</span>
          </Label>
          <DateInput
            shadcn
            id="endDate"
            min={effectiveDate}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push('/me')} disabled={pending}>
          {locale === 'ar' ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (locale === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…') : (locale === 'ar' ? 'إرسال الطلب' : 'Submit request')}
        </Button>
      </div>
    </form>
  )
}
