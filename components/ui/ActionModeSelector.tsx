'use client'

/**
 * ActionModeSelector — date-effective change mode picker.
 *
 * Renders a two-option toggle (Update / Correction). When the caller passes
 * an effectiveDate that is after today the component automatically shows a
 * "Scheduled" banner — the caller is responsible for passing mode=FUTURE_DATED
 * to the server action in that case.
 *
 * Usage:
 *   <ActionModeSelector
 *     mode={mode}
 *     effectiveDate={effectiveDate}
 *     correctionNote={note}
 *     onModeChange={setMode}
 *     onNoteChange={setNote}
 *     canCorrect={session.role === 'HR_DIRECTOR' || session.role === 'SUPER_ADMIN'}
 *   />
 */

import { AlertTriangle, CalendarClock } from 'lucide-react'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { ActionMode } from '@/lib/action-mode'

interface Props {
  mode:           ActionMode
  /** ISO date string YYYY-MM-DD from the effectiveDate picker in the parent form. */
  effectiveDate?: string
  correctionNote: string
  onModeChange:   (mode: ActionMode) => void
  onNoteChange:   (note: string) => void
  /** Only HR_DIRECTOR / SUPER_ADMIN may see the Correction option. */
  canCorrect:     boolean
  disabled?:      boolean
}

function isFutureDate(date?: string): boolean {
  if (!date) return false
  const today = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10) // UAE UTC+4
  return date > today
}

export function ActionModeSelector({
  mode,
  effectiveDate,
  correctionNote,
  onModeChange,
  onNoteChange,
  canCorrect,
  disabled = false,
}: Props) {
  const locale   = useLocale()
  const isFuture = isFutureDate(effectiveDate)

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
        {locale === 'ar' ? 'وضع التغيير' : 'Change Mode'}
      </Label>

      {/* ── FUTURE_DATED banner (read-only, auto-set by date picker) ────────── */}
      {isFuture && mode !== 'CORRECTION' && (
        <div
          className="flex items-start gap-2 rounded-lg border px-4 py-3"
          style={{
            borderColor: 'var(--accent-200)',
            backgroundColor: 'var(--accent-050)',
          }}
        >
          <CalendarClock
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: 'var(--brand-active)' }}
          />
          <div className="text-sm" style={{ color: 'var(--ink-1)' }}>
            <span className="font-semibold">{locale === 'ar' ? 'تغيير مجدول' : 'Scheduled change'}</span>
            <span className="ml-1" style={{ color: 'var(--ink-2)' }}>
              {locale === 'ar' ? <>— سيسري هذا التغيير في{' '}</> : <>— this change will take effect on{' '}</>}
              <span className="font-mono">{effectiveDate}</span>
              {locale === 'ar' ? '. يبقى السجل الحالي نشطاً حتى ذلك الحين.' : '. The current record stays active until then.'}
            </span>
          </div>
        </div>
      )}

      {/* ── UPDATE / CORRECTION toggle ────────────────────────────────────── */}
      <div className="flex gap-3">
        {/* UPDATE option */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onModeChange('UPDATE')}
          className={[
            'flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2',
            mode === 'UPDATE'
              ? 'border-[var(--accent)] bg-[var(--accent-050)] text-[var(--ink-1)]'
              : 'border-[var(--border)] bg-[var(--card)] text-[var(--ink-2)] hover:border-[var(--accent-200)]',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          ].join(' ')}
        >
          <span className="block font-semibold">
            {isFuture
              ? (locale === 'ar' ? 'جدولة التحديث' : 'Schedule Update')
              : (locale === 'ar' ? 'تحديث' : 'Update')}
          </span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--ink-3)' }}>
            {isFuture
              ? (locale === 'ar' ? 'تحميل هذا التغيير مسبقاً — يسري في التاريخ المحدد' : 'Pre-load this change — it takes effect on the selected date')
              : (locale === 'ar' ? 'تسجيل حدث وظيفي جديد — يُنشئ سجلاً جديداً في السجل التاريخي' : 'Record a new business event — creates a new history row')}
          </span>
        </button>

        {/* CORRECTION option — restricted to HR_DIRECTOR / SUPER_ADMIN */}
        {canCorrect && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onModeChange('CORRECTION')}
            className={[
              'flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
              mode === 'CORRECTION'
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--ink-2)] hover:border-amber-300',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            ].join(' ')}
          >
            <span className="block font-semibold">{locale === 'ar' ? 'تصحيح' : 'Correction'}</span>
            <span className="mt-0.5 block text-xs" style={{ color: 'var(--ink-3)' }}>
              {locale === 'ar'
                ? 'تصحيح خطأ في إدخال البيانات — يُحدِّث السجل الحالي دون إنشاء سجل تاريخي جديد'
                : 'Fix a data-entry error — updates existing record, no new history row'}
            </span>
          </button>
        )}
      </div>

      {/* ── Correction Mode warning + mandatory note ───────────────────────── */}
      {mode === 'CORRECTION' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">
              {locale === 'ar' ? (
                <>
                  <strong>وضع التصحيح:</strong> سيؤدي هذا إلى تحديث السجل التاريخي
                  الحالي في مكانه. ولن يظهر كحدث جديد في الخط الزمني للموظف. ويلزم
                  إدخال ملاحظة تصحيح تُحفظ في سجل التدقيق.
                </>
              ) : (
                <>
                  <strong>Correction Mode:</strong> This will update the existing
                  historical record in-place. It will not appear as a new event in
                  the employee&apos;s timeline. A correction note is required and
                  stored in the audit trail.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="correctionNote" className="text-xs font-medium text-amber-900">
              {locale === 'ar' ? 'ملاحظة التصحيح' : 'Correction Note'} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="correctionNote"
              rows={2}
              placeholder={locale === 'ar' ? 'اشرح ما كان غير صحيح وسبب تصحيحه…' : 'Describe what was incorrect and why it is being corrected…'}
              value={correctionNote}
              onChange={e => onNoteChange(e.target.value)}
              disabled={disabled}
              className="text-xs resize-none border-amber-300 focus:border-amber-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
