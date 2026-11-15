'use client'

import { useState, useTransition } from 'react'
import { useRouter }  from 'next/navigation'
import { createPayrollRun } from '@/modules/payroll/actions'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Props {
  definitions: Array<{ id: string; payrollCode: string; payrollNameEn: string; currency: string }>
  legalEntityId: string
}

// Compute default period: first and last day of current month
function defaultPeriod() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // Payment day: 25th of the month, or last day if month is short
  const payDay = new Date(year, month, 25)
  return { periodStart: fmt(first), periodEnd: fmt(last), paymentDate: fmt(payDay) }
}

export function NewPayrollRunForm({ definitions, legalEntityId }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const defaults = defaultPeriod()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createPayrollRun({
        payrollId:      fd.get('payrollId') as string,
        legalEntityId,
        runType:        (fd.get('runType') as string) as 'REGULAR' | 'OFF_CYCLE' | 'CORRECTION' | 'FINAL_SETTLEMENT',
        payPeriodStart: fd.get('payPeriodStart') as string,
        payPeriodEnd:   fd.get('payPeriodEnd') as string,
        paymentDate:    fd.get('paymentDate') as string,
        notes:          fd.get('notes') as string || null,
      })

      if (result.success && result.runId) {
        router.push(`/payroll/runs/${result.runId}`)
      } else {
        setError(result.error ?? (locale === 'ar' ? 'تعذّر إنشاء دورة الرواتب' : 'Failed to create payroll run'))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      {/* Payroll Definition */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink-1)]">{locale === 'ar' ? 'تعريف الرواتب' : 'Payroll Definition'} *</label>
        <select name="payrollId" required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
          <option value="">{locale === 'ar' ? '— اختر تعريف الرواتب —' : '— Select payroll definition —'}</option>
          {definitions.map(d => (
            <option key={d.id} value={d.id}>
              {d.payrollCode} — {d.payrollNameEn} ({d.currency})
            </option>
          ))}
        </select>
      </div>

      {/* Run Type */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink-1)]">{locale === 'ar' ? 'نوع الدورة' : 'Run Type'} *</label>
        <select name="runType" defaultValue="REGULAR" required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]">
          <option value="REGULAR">{locale === 'ar' ? 'شهري عادي' : 'Regular Monthly'}</option>
          <option value="OFF_CYCLE">{locale === 'ar' ? 'خارج الدورة' : 'Off-Cycle'}</option>
          <option value="CORRECTION">{locale === 'ar' ? 'تصحيح' : 'Correction'}</option>
          <option value="FINAL_SETTLEMENT">{locale === 'ar' ? 'التسوية النهائية' : 'Final Settlement'}</option>
        </select>
      </div>

      {/* Period dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--ink-1)]">{locale === 'ar' ? 'بداية الفترة' : 'Period Start'} *</label>
          <input type="date" name="payPeriodStart" required defaultValue={defaults.periodStart}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--ink-1)]">{locale === 'ar' ? 'نهاية الفترة' : 'Period End'} *</label>
          <input type="date" name="payPeriodEnd" required defaultValue={defaults.periodEnd}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </div>
      </div>

      {/* Payment date */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink-1)]">{locale === 'ar' ? 'تاريخ الدفع' : 'Payment Date'} *</label>
        <input type="date" name="paymentDate" required defaultValue={defaults.paymentDate}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        <p className="mt-1 text-xs text-[var(--ink-3)]">{locale === 'ar' ? 'سيُحدد الموعد النهائي لـ WPS في اليوم التالي (BR-WPS-001)' : 'WPS deadline will be set to the following day (BR-WPS-001)'}</p>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-[var(--ink-1)]">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</label>
        <textarea name="notes" rows={3} placeholder={locale === 'ar' ? 'ملاحظات اختيارية...' : 'Optional notes...'}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-1)] placeholder:text-[var(--ink-4)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <a href="/payroll/runs"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--surface)] transition-colors">
          {locale === 'ar' ? 'إلغاء' : 'Cancel'}
        </a>
        <button type="submit" disabled={isPending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-700)] disabled:opacity-50 transition-colors">
          {isPending ? (locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…') : (locale === 'ar' ? 'إنشاء دورة الرواتب' : 'Create Payroll Run')}
        </button>
      </div>
    </form>
  )
}
