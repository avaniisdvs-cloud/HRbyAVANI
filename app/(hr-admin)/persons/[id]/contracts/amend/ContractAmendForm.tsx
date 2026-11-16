'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
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
import { amendContract } from '@/modules/core-hr'
import type { AmendContractInput } from '@/modules/core-hr'

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'TEMPORARY' | 'TASK_BASED' | 'FLEXIBLE' | 'REMOTE' | 'SHARED'
type WorkLocation   = 'OFFICE' | 'REMOTE' | 'HYBRID' | 'FIELD'

interface CurrentContract {
  id:                  string
  contractNumber:      string
  startDate:           string
  endDate:             string
  employmentType:      EmploymentType | string
  workingHoursPerWeek: number
  workLocation:        WorkLocation | string
  noticePeriodDays:    number
  notes:               string | null
  renewalCount:        number
}

interface Props {
  personId: string
  contract: CurrentContract
}

// BR-CT-002 — three-year cap from the *original* startDate, not the
// amend effective date. Keep this aligned with contracts/actions.ts.
function maxAmendEndDate(startDate: string): string {
  const d = new Date(startDate)
  d.setFullYear(d.getFullYear() + 3)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ContractAmendForm({ personId, contract }: Props) {
  const ceilingEndDate = useMemo(() => maxAmendEndDate(contract.startDate), [contract.startDate])

  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [reason,        setReason]        = useState('')
  const [newEndDate,    setNewEndDate]    = useState(contract.endDate)
  const [newEmploymentType, setNewEmploymentType] = useState<EmploymentType | ''>('')
  const [newWorkingHoursPerWeek, setNewWorkingHoursPerWeek] = useState<number | ''>('')
  const [newWorkLocation, setNewWorkLocation] = useState<WorkLocation | ''>('')
  const [newNoticePeriodDays, setNewNoticePeriodDays] = useState<number | ''>('')
  const [notes, setNotes] = useState('')

  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const locale = useLocale()
  const router = useRouter()

  // Inline guard: surface BR-CT-002 before the user submits.
  const exceedsThreeYears = newEndDate > ceilingEndDate
  const endBeforeStart    = newEndDate < contract.startDate
  const effectiveBeforeStart = effectiveDate < contract.startDate

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    if (!reason.trim()) {
      setErrors({ reason: locale === 'ar' ? 'السبب مطلوب' : 'Reason is required' })
      return
    }
    if (exceedsThreeYears) {
      setErrors({ newEndDate: locale === 'ar' ? 'BR-CT-002: تتجاوز المدة المعدّلة 3 سنوات من تاريخ البداية الأصلي' : 'BR-CT-002: amended term exceeds 3 years from original start' })
      return
    }
    if (endBeforeStart) {
      setErrors({ newEndDate: locale === 'ar' ? 'لا يمكن أن يسبق تاريخ النهاية الجديد تاريخ البداية الأصلي' : 'newEndDate cannot precede the original start date' })
      return
    }
    if (effectiveBeforeStart) {
      setErrors({ effectiveDate: locale === 'ar' ? 'لا يمكن أن يسبق تاريخ السريان تاريخ البداية الأصلي' : 'effectiveDate cannot precede the original start date' })
      return
    }

    const input: AmendContractInput = {
      contractId:    contract.id,
      effectiveDate,
      reason:        reason.trim(),
      newEndDate:    newEndDate !== contract.endDate ? newEndDate : undefined,
      newEmploymentType: newEmploymentType || undefined,
      newWorkingHoursPerWeek: newWorkingHoursPerWeek === '' ? undefined : Number(newWorkingHoursPerWeek),
      newWorkLocation: newWorkLocation || undefined,
      newNoticePeriodDays: newNoticePeriodDays === '' ? undefined : Number(newNoticePeriodDays),
      notes: notes.trim() ? notes.trim() : undefined,
    }

    start(async () => {
      try {
        const result = await amendContract(input)
        toast({
          title: locale === 'ar' ? 'تم تعديل العقد' : 'Contract amended',
          description: locale === 'ar'
            ? `أُغلق ${contract.contractNumber} · فُتح ${result.newContractNumber} (تجديد رقم ${contract.renewalCount + 1}).`
            : `${contract.contractNumber} closed · ${result.newContractNumber} opened (renewal #${contract.renewalCount + 1}).`,
        })
        router.push(`/persons/${personId}`)
        router.refresh()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل التعديل' : 'Amend failed')
        toast({ title: locale === 'ar' ? 'تعذّر التعديل' : 'Could not amend', description: message, variant: 'destructive' })
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
      {/* Current state — read-only summary */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'العقد الحالي' : 'Current contract'}
            <Badge className="ms-2 align-middle" variant="secondary">{contract.contractNumber}</Badge>
            <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? `تجديد رقم ${contract.renewalCount}` : `renewal #${contract.renewalCount}`}</Badge>
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <dl className="grid gap-y-2 text-sm sm:grid-cols-2">
            <Row k={locale === 'ar' ? 'تاريخ البداية' : 'Start date'}          v={contract.startDate} />
            <Row k={locale === 'ar' ? 'تاريخ النهاية' : 'End date'}            v={contract.endDate} />
            <Row k={locale === 'ar' ? 'نوع التوظيف' : 'Employment type'}     v={contract.employmentType} />
            <Row k={locale === 'ar' ? 'ساعات العمل/أسبوع' : 'Working hours/week'}  v={String(contract.workingHoursPerWeek)} />
            <Row k={locale === 'ar' ? 'موقع العمل' : 'Work location'}       v={contract.workLocation} />
            <Row k={locale === 'ar' ? 'فترة الإشعار (أيام)' : 'Notice period (days)'} v={String(contract.noticePeriodDays)} />
          </dl>
        </div>
      </div>

      {/* Amendment details */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'التعديل' : 'Amendment'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <HijriDatePicker
                label={locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}
                required
                value={effectiveDate}
                onChange={setEffectiveDate}
                disabled={pending}
                helpText={errors['effectiveDate']
                  ? undefined
                  : (locale === 'ar' ? 'يُغلق العقد الحالي في اليوم السابق لهذا التاريخ؛ ويُفتح العقد الجديد هنا.' : 'The current contract closes on the day before this; the new contract opens here.')}
              />
              {errors['effectiveDate'] && (
                <p className="mt-1 text-xs text-destructive">{errors['effectiveDate']}</p>
              )}
            </div>
            <div>
              <HijriDatePicker
                label={locale === 'ar' ? 'تاريخ النهاية الجديد' : 'New end date'}
                required
                value={newEndDate}
                onChange={setNewEndDate}
                disabled={pending}
                helpText={errors['newEndDate']
                  ? undefined
                  : (locale === 'ar'
                    ? `BR-CT-002: بحد أقصى 3 سنوات من تاريخ البداية الأصلي. الحد = ${ceilingEndDate}.`
                    : `BR-CT-002: max 3 years from original start. Cap = ${ceilingEndDate}.`)}
              />
              {errors['newEndDate'] && (
                <p className="mt-1 text-xs text-destructive">{errors['newEndDate']}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'السبب' : 'Reason'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Textarea id="reason" required rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: تجديد المدة، تغيير الدور، تعديل الساعات' : 'e.g. Renewed term, role change, hours adjustment'}
              disabled={pending} />
            {errors['reason'] && <p className="text-xs text-destructive">{errors['reason']}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'نوع التوظيف الجديد (اختياري)' : 'New employment type (optional)'}</Label>
              <Select value={newEmploymentType || undefined}
                onValueChange={v => setNewEmploymentType(v as EmploymentType)}
                disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? `الإبقاء: ${contract.employmentType}` : `Keep: ${contract.employmentType}`} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_TIME">{locale === 'ar' ? 'دوام كامل' : 'Full-time'}</SelectItem>
                  <SelectItem value="PART_TIME">{locale === 'ar' ? 'دوام جزئي' : 'Part-time'}</SelectItem>
                  <SelectItem value="TEMPORARY">{locale === 'ar' ? 'مؤقت' : 'Temporary'}</SelectItem>
                  <SelectItem value="TASK_BASED">{locale === 'ar' ? 'حسب المهمة' : 'Task-based'}</SelectItem>
                  <SelectItem value="FLEXIBLE">{locale === 'ar' ? 'مرن' : 'Flexible'}</SelectItem>
                  <SelectItem value="REMOTE">{locale === 'ar' ? 'عن بُعد' : 'Remote'}</SelectItem>
                  <SelectItem value="SHARED">{locale === 'ar' ? 'مشترك' : 'Shared'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'موقع العمل الجديد (اختياري)' : 'New work location (optional)'}</Label>
              <Select value={newWorkLocation || undefined}
                onValueChange={v => setNewWorkLocation(v as WorkLocation)}
                disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? `الإبقاء: ${contract.workLocation}` : `Keep: ${contract.workLocation}`} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFFICE">{locale === 'ar' ? 'مكتب' : 'Office'}</SelectItem>
                  <SelectItem value="REMOTE">{locale === 'ar' ? 'عن بُعد' : 'Remote'}</SelectItem>
                  <SelectItem value="HYBRID">{locale === 'ar' ? 'هجين' : 'Hybrid'}</SelectItem>
                  <SelectItem value="FIELD">{locale === 'ar' ? 'ميداني' : 'Field'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="newWorkingHoursPerWeek" className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'ساعات العمل/أسبوع الجديدة (اختياري)' : 'New working hours/week (optional)'}
              </Label>
              <Input id="newWorkingHoursPerWeek" type="number" min={1} max={48}
                value={newWorkingHoursPerWeek}
                onChange={e => setNewWorkingHoursPerWeek(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={locale === 'ar' ? `الإبقاء: ${contract.workingHoursPerWeek}` : `Keep: ${contract.workingHoursPerWeek}`}
                disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newNoticePeriodDays" className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'فترة الإشعار الجديدة (أيام، اختياري)' : 'New notice period (days, optional)'}
              </Label>
              <Input id="newNoticePeriodDays" type="number" min={0} max={180}
                value={newNoticePeriodDays}
                onChange={e => setNewNoticePeriodDays(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={locale === 'ar' ? `الإبقاء: ${contract.noticePeriodDays}` : `Keep: ${contract.noticePeriodDays}`}
                disabled={pending} />
              <p className="text-xs text-ink-3">{locale === 'ar' ? 'BR-NP-001: تُشتق من مدة الخدمة؛ تجاوزها هنا للحالات الخاصة.' : 'BR-NP-001: derived from tenure; override here for ad-hoc cases.'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
            <Textarea id="notes" rows={3} value={notes}
              onChange={e => setNotes(e.target.value)} disabled={pending} />
          </div>
        </div>
      </div>

      {/* BR rule strip */}
      <div className="rounded-md border border-border bg-surface p-3 text-xs text-ink-3">
        <p className="font-medium text-ink-2">{locale === 'ar' ? 'قواعد العمل المطبّقة من جهة الخادم' : 'Business rules enforced server-side'}</p>
        <ul className="mt-1 list-disc ps-5">
          <li>{locale === 'ar' ? 'BR-CT-001: العقود محددة المدة فقط — تُحفظ عند التعديل.' : 'BR-CT-001: contracts are FIXED_TERM only — preserved on amend.'}</li>
          <li>{locale === 'ar' ? 'BR-CT-002: إجمالي المدة ≤ 3 سنوات من تاريخ البداية الأصلي (الحد معروض أعلاه).' : 'BR-CT-002: total term ≤ 3 years from original start (cap shown above).'}</li>
          <li>{locale === 'ar' ? 'BR-PR-003: لا تُعاد فترة الاختبار عند التجديد — يُفتح الصف الجديد دون فترة اختبار.' : 'BR-PR-003: probation does not reset on renewal — new row opens with no probation.'}</li>
          <li>{locale === 'ar' ? 'القاعدة الصارمة 3: يُغلق الصف الحالي (الحالة = RENEWED) ولا يُحذف؛ يُحفظ مسار تدقيق كامل.' : 'Hard Rule 3: current row is closed (status = RENEWED), not deleted; full audit trail kept.'}</li>
        </ul>
      </div>

      <div className="flex items-center justify-end gap-3 pb-8">
        <Button type="button" variant="outline" onClick={() => router.push(`/persons/${personId}`)} disabled={pending}>
          {locale === 'ar' ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={pending || exceedsThreeYears || endBeforeStart || effectiveBeforeStart}>
          {pending ? (locale === 'ar' ? 'جارٍ التعديل…' : 'Amending…') : (locale === 'ar' ? 'تعديل العقد' : 'Amend contract')}
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
