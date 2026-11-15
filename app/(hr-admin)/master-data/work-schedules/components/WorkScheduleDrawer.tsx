'use client'

import { useState, useEffect, useCallback } from 'react'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { DayHoursGrid, DEFAULT_UAE_SCHEDULE } from './DayHoursGrid'
import type { DayHoursValue } from './DayHoursGrid'
import { createWorkSchedule, updateWorkSchedule } from './WorkScheduleActions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkSchedule = {
  id:                  string
  legalEntityId:       string | null
  scheduleCode:        string
  scheduleNameEn:      string
  scheduleNameAr:      string | null
  scheduleType:        string
  mondayStart:         string | null
  mondayEnd:           string | null
  tuesdayStart:        string | null
  tuesdayEnd:          string | null
  wednesdayStart:      string | null
  wednesdayEnd:        string | null
  thursdayStart:       string | null
  thursdayEnd:         string | null
  fridayStart:         string | null
  fridayEnd:           string | null
  saturdayStart:       string | null
  saturdayEnd:         string | null
  sundayStart:         string | null
  sundayEnd:           string | null
  totalHoursPerWeek:   string | null
  breakMinutes:        number
  isRamadanSchedule:   boolean
  ramadanHoursPerDay:  string | null
  isDefault:           boolean
  isActive:            boolean
}

type EntityRef = { id: string; nameEn: string }

interface WorkScheduleDrawerProps {
  open:          boolean
  onClose:       () => void
  schedule?:     WorkSchedule | null
  legalEntities: EntityRef[]
  onSaved:       () => void
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const sectionDivider = (label: string) => (
  <div style={{
    fontSize: 'var(--text-caption)',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--ink-3)',
    marginBottom: 12,
    marginTop: 24,
    paddingBottom: 6,
    borderBottom: '1px solid var(--border)',
  }}>
    {label}
  </div>
)

const fieldWrapper = (
  label: React.ReactNode,
  input: React.ReactNode,
  error?: string | null,
  hint?: React.ReactNode,
) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)',
    marginBottom: 6 }}>
      {label}
    </label>
    {input}
    {hint}
    {error && <p style={{ fontSize: 'var(--text-caption)', color: '#C62828',
    marginTop: 4 }}>{error}</p>}
  </div>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  paddingTop: "10px",
  paddingRight: "12px",
  paddingBottom: "10px",
  paddingLeft: "12px",
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
  backgroundColor: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  legalEntityId:      string
  scheduleCode:       string
  scheduleNameEn:     string
  scheduleNameAr:     string
  scheduleType:       string
  breakMinutes:       string
  isRamadanSchedule:  boolean
  ramadanHoursPerDay: string
  isDefault:          boolean
  days:               DayHoursValue
}

type FormErrors = Partial<Record<keyof Omit<FormState, 'days'>, string>>

function emptyForm(): FormState {
  return {
    legalEntityId:      '',
    scheduleCode:       '',
    scheduleNameEn:     '',
    scheduleNameAr:     '',
    scheduleType:       'STANDARD',
    breakMinutes:       '60',
    isRamadanSchedule:  false,
    ramadanHoursPerDay: '6',
    isDefault:          false,
    days:               { ...DEFAULT_UAE_SCHEDULE },
  }
}

function scheduleToForm(s: WorkSchedule): FormState {
  return {
    legalEntityId:      s.legalEntityId ?? '',
    scheduleCode:       s.scheduleCode,
    scheduleNameEn:     s.scheduleNameEn,
    scheduleNameAr:     s.scheduleNameAr ?? '',
    scheduleType:       s.scheduleType,
    breakMinutes:       String(s.breakMinutes ?? 60),
    isRamadanSchedule:  s.isRamadanSchedule,
    ramadanHoursPerDay: s.ramadanHoursPerDay ?? '6',
    isDefault:          s.isDefault,
    days: {
      mon: { on: Boolean(s.mondayStart),    start: s.mondayStart    ?? '', end: s.mondayEnd    ?? '' },
      tue: { on: Boolean(s.tuesdayStart),   start: s.tuesdayStart   ?? '', end: s.tuesdayEnd   ?? '' },
      wed: { on: Boolean(s.wednesdayStart), start: s.wednesdayStart ?? '', end: s.wednesdayEnd ?? '' },
      thu: { on: Boolean(s.thursdayStart),  start: s.thursdayStart  ?? '', end: s.thursdayEnd  ?? '' },
      fri: { on: Boolean(s.fridayStart),    start: s.fridayStart    ?? '', end: s.fridayEnd    ?? '' },
      sat: { on: Boolean(s.saturdayStart),  start: s.saturdayStart  ?? '', end: s.saturdayEnd  ?? '' },
      sun: { on: Boolean(s.sundayStart),    start: s.sundayStart    ?? '', end: s.sundayEnd    ?? '' },
    },
  }
}

function buildChangeSummary(schedule: WorkSchedule, form: FormState): string {
  const changes: string[] = []
  if (form.scheduleNameEn !== schedule.scheduleNameEn) changes.push(`Name EN: "${schedule.scheduleNameEn}" → "${form.scheduleNameEn}"`)
  if (form.scheduleType !== schedule.scheduleType) changes.push(`Type: ${schedule.scheduleType} → ${form.scheduleType}`)
  if ((form.scheduleNameAr ?? '') !== (schedule.scheduleNameAr ?? '')) changes.push('Name AR changed')
  if ((form.legalEntityId || null) !== schedule.legalEntityId) changes.push('Legal entity changed')
  return changes.length > 0 ? changes.join('; ') : 'Schedule timing or hours changed'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkScheduleDrawer({
  open,
  onClose,
  schedule,
  legalEntities,
  onSaved,
}: WorkScheduleDrawerProps) {
  const isEdit = Boolean(schedule)
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  const [form, setForm]               = useState<FormState>(emptyForm)
  const [errors, setErrors]           = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverWarning, setServerWarning] = useState<string | null>(null)
  const [isPending, setIsPending]     = useState(false)
  const [showReason, setShowReason]   = useState(false)

  useEffect(() => {
    if (open) {
      setForm(schedule ? scheduleToForm(schedule) : emptyForm())
      setErrors({})
      setServerError(null)
      setServerWarning(null)
      setIsPending(false)
    }
  }, [open, schedule])

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }, [])

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!form.scheduleCode.trim())   errs.scheduleCode   = 'Schedule code is required.'
    if (!form.scheduleNameEn.trim()) errs.scheduleNameEn = 'English name is required.'
    if (!form.scheduleType)          errs.scheduleType   = 'Schedule type is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function buildFormData(): FormData {
    const fd = new FormData()
    if (form.legalEntityId) fd.set('legalEntityId', form.legalEntityId)
    fd.set('scheduleCode',   form.scheduleCode)
    fd.set('scheduleNameEn', form.scheduleNameEn)
    if (form.scheduleNameAr) fd.set('scheduleNameAr', form.scheduleNameAr)
    fd.set('scheduleType',   form.scheduleType)
    fd.set('breakMinutes',   form.breakMinutes)
    fd.set('isRamadanSchedule', String(form.isRamadanSchedule))
    if (form.isRamadanSchedule && form.ramadanHoursPerDay) {
      fd.set('ramadanHoursPerDay', form.ramadanHoursPerDay)
    }
    fd.set('isDefault', String(form.isDefault))
    // Days
    const dayMap: Array<[string, keyof DayHoursValue]> = [
      ['monday',    'mon'],
      ['tuesday',   'tue'],
      ['wednesday', 'wed'],
      ['thursday',  'thu'],
      ['friday',    'fri'],
      ['saturday',  'sat'],
      ['sunday',    'sun'],
    ]
    for (const [full, key] of dayMap) {
      const day = form.days[key]
      if (day.on && day.start) fd.set(`${full}Start`, day.start)
      if (day.on && day.end)   fd.set(`${full}End`,   day.end)
    }
    return fd
  }

  async function handleCreate() {
    if (!validate()) return
    setIsPending(true)
    setServerError(null)
    setServerWarning(null)
    try {
      const result = await createWorkSchedule(buildFormData())
      if (result.error) {
        setServerError(result.error)
      } else {
        if (result.warning) setServerWarning(result.warning)
        onSaved()
        if (!result.warning) onClose()
      }
    } finally {
      setIsPending(false)
    }
  }

  function handleEditSave() {
    if (!validate()) return
    setShowReason(true)
  }

  async function handleConfirmReason(reason: string) {
    if (!schedule) return
    setIsPending(true)
    setServerError(null)
    setServerWarning(null)
    try {
      const result = await updateWorkSchedule(schedule.id, buildFormData(), reason)
      if (result.error) {
        setServerError(result.error)
        setShowReason(false)
      } else {
        if (result.warning) setServerWarning(result.warning)
        setShowReason(false)
        onSaved()
        if (!result.warning) onClose()
      }
    } finally {
      setIsPending(false)
    }
  }

  const footer = (
    <>
      <button
        onClick={onClose}
        disabled={isPending}
        style={{
          height: 38,
          padding: '0 18px',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          background: 'transparent',
          color: 'var(--ink-2)',
          fontSize: 'var(--text-body)',
          fontWeight: 500,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {tk(locale, 'common.cancel')}
      </button>
      <button
        onClick={isEdit ? handleEditSave : handleCreate}
        disabled={isPending}
        style={{
          height: 38,
          padding: '0 18px',
          border: 'none',
          borderRadius: 10,
          background: isPending ? 'var(--border)' : 'var(--accent)',
          color: isPending ? 'var(--ink-4)' : '#fff',
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending
          ? tk(locale, 'common.saving')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء جدول' : 'Create Schedule')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit — ${schedule?.scheduleCode}` : 'New Work Schedule'}
        titleAr={isEdit ? 'تعديل جدول العمل' : 'جدول عمل جديد'}
        footer={footer}
        width={680}
      >
        {/* Server error */}
        {serverError && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: '#FBE9E9',
            borderRadius: 8,
            border: '1px solid #E57373',
            fontSize: 'var(--text-body)',
            color: '#C62828',
          }}>
            {serverError}
          </div>
        )}

        {/* Server warning */}
        {serverWarning && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: '#FFF3E0',
            borderRadius: 8,
            border: '1px solid #FFCC80',
            fontSize: 'var(--text-body)',
            color: '#E65100',
          }}>
            {serverWarning}
          </div>
        )}

        {/* ── Section 1: Identity ───────────────────────────────────────── */}
        {sectionDivider(locale === 'ar' ? 'الهوية' : 'Identity')}

        {/* Legal Entity */}
        {fieldWrapper(
          locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity',
          <select
            value={form.legalEntityId}
            onChange={e => set('legalEntityId', e.target.value)}
            style={selectStyle}
          >
            <option value="">{locale === 'ar' ? 'جميع الكيانات' : 'All entities'}</option>
            {legalEntities.map(le => (
              <option key={le.id} value={le.id}>{le.nameEn}</option>
            ))}
          </select>,
          null,
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
          marginTop: 4 }}>
            {locale === 'ar' ? 'اتركه فارغاً لتطبيقه على جميع الكيانات القانونية' : 'Leave blank to apply to all legal entities'}
          </p>,
        )}

        {/* Schedule Code */}
        {fieldWrapper(
          <><span>{locale === 'ar' ? 'رمز الجدول' : 'Schedule Code'}</span> <span style={{ color: '#C62828' }}>*</span></>,
          <input
            value={form.scheduleCode}
            onChange={e => set('scheduleCode', e.target.value.toUpperCase())}
            disabled={isEdit}
            placeholder="e.g. STD-UAE-48"
            maxLength={30}
            style={isEdit
              ? { ...inputStyle, backgroundColor: 'var(--surface)', color: 'var(--ink-3)', cursor: 'not-allowed' }
              : inputStyle}
          />,
          errors.scheduleCode,
          isEdit ? <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
          marginTop: 4 }}>{locale === 'ar' ? 'الرمز ثابت بعد الحفظ' : 'Code is immutable once saved'}</p> : null,
        )}

        {/* Schedule Name EN */}
        {fieldWrapper(
          <><span>{locale === 'ar' ? 'اسم الجدول (إنجليزي)' : 'Schedule Name (English)'}</span> <span style={{ color: '#C62828' }}>*</span></>,
          <input
            value={form.scheduleNameEn}
            onChange={e => set('scheduleNameEn', e.target.value)}
            onBlur={async () => {
              if (form.scheduleNameEn.trim() && (!form.scheduleNameAr.trim() || form.scheduleNameEn !== schedule?.scheduleNameEn)) {
                const ar = await autoTranslate(form.scheduleNameEn)
                if (ar) set('scheduleNameAr', ar)
              }
            }}
            placeholder="e.g. Standard UAE 48h — Sun to Thu"
            maxLength={200}
            style={inputStyle}
          />,
          errors.scheduleNameEn,
        )}

        {/* Schedule Name AR */}
        {fieldWrapper(
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {locale === 'ar' ? 'اسم الجدول (عربي)' : 'Schedule Name (Arabic)'}
            {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
          </span>,
          <input
            value={form.scheduleNameAr}
            onChange={e => set('scheduleNameAr', e.target.value)}
            placeholder="مثال: جدول الإمارات القياسي"
            maxLength={200}
            dir="rtl"
            disabled={arTranslating}
            style={{ ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
          />,
          null,
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
          marginTop: 4 }}>يتم الترجمة تلقائياً من الاسم الإنجليزي</p>,
        )}

        {/* Schedule Type */}
        {fieldWrapper(
          <><span>{locale === 'ar' ? 'نوع الجدول' : 'Schedule Type'}</span> <span style={{ color: '#C62828' }}>*</span></>,
          <select
            value={form.scheduleType}
            onChange={e => set('scheduleType', e.target.value)}
            style={selectStyle}
          >
            <option value="STANDARD">{locale === 'ar' ? 'قياسي' : 'Standard'}</option>
            <option value="RAMADAN">{locale === 'ar' ? 'رمضان' : 'Ramadan'}</option>
            <option value="SHIFT">{locale === 'ar' ? 'مناوبة' : 'Shift'}</option>
            <option value="FLEXIBLE">{locale === 'ar' ? 'مرن' : 'Flexible'}</option>
            <option value="PART_TIME">{locale === 'ar' ? 'دوام جزئي' : 'Part-Time'}</option>
          </select>,
          errors.scheduleType,
        )}

        {/* ── Section 2: Weekly Hours ───────────────────────────────────── */}
        {sectionDivider(locale === 'ar' ? 'ساعات العمل الأسبوعية' : 'Weekly Hours')}

        <div style={{ marginBottom: 16 }}>
          <DayHoursGrid
            value={form.days}
            onChange={days => set('days', days)}
          />
        </div>

        {/* Break duration */}
        {fieldWrapper(
          locale === 'ar' ? 'فترة الاستراحة الافتراضية (دقائق)' : 'Default Break (minutes)',
          <input
            type="number"
            value={form.breakMinutes}
            onChange={e => set('breakMinutes', e.target.value)}
            min={0}
            max={120}
            placeholder="60"
            style={{ ...inputStyle, width: 100 }}
          />,
          null,
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
          marginTop: 4 }}>
            {locale === 'ar'
              ? 'تُخصم الاستراحة بالفعل من حساب الساعات اليومية أعلاه إذا تجاوزت المناوبة 5 ساعات'
              : 'Break is already deducted from the daily hours calculation above if shift > 5h'}
          </p>,
        )}

        {/* Is Default */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => set('isDefault', e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            {locale === 'ar' ? 'تعيين كجدول افتراضي' : 'Mark as default schedule'}
          </label>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{locale === 'ar' ? '(يُستخدم عند عدم تعيين جدول محدد)' : '(used when no specific schedule is assigned)'}</span>
        </div>

        {/* ── Section 3: Ramadan Settings ───────────────────────────────── */}
        {sectionDivider(locale === 'ar' ? 'إعدادات رمضان' : 'Ramadan Settings')}

        {/* Is Ramadan Schedule toggle */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={form.isRamadanSchedule}
              onChange={e => set('isRamadanSchedule', e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            {locale === 'ar' ? 'هذا جدول رمضان بساعات مخفضة' : 'This is a Ramadan reduced-hours schedule'}
          </label>
        </div>

        {/* Ramadan Hours / Day — shown only when isRamadanSchedule is ON */}
        {form.isRamadanSchedule && (
          <div style={{
            padding: '14px 16px',
            background: 'var(--accent-100)',
            border: '1px solid var(--accent-100)',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            {fieldWrapper(
              <><span>{locale === 'ar' ? 'ساعات رمضان / اليوم' : 'Ramadan Hours / Day'}</span> <span style={{ color: '#C62828' }}>*</span></>,
              <input
                type="number"
                value={form.ramadanHoursPerDay}
                onChange={e => set('ramadanHoursPerDay', e.target.value)}
                min={1}
                max={6}
                step={0.5}
                placeholder="6"
                style={{ ...inputStyle, width: 100, backgroundColor: 'var(--card)' }}
              />,
              null,
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--brand-active)',
              marginTop: 4 }}>
                {locale === 'ar'
                  ? 'يشترط قانون العمل حداً أقصى 6 ساعات يومياً خلال رمضان للموظفين المسلمين'
                  : 'Labour Law requires a maximum of 6h/day during Ramadan for Muslim employees'}
              </p>,
            )}
          </div>
        )}
      </MdmDrawer>

      {/* Change reason modal — edit mode only */}
      {isEdit && schedule && (
        <ChangeReasonModal
          open={showReason}
          onClose={() => { if (!isPending) setShowReason(false) }}
          onConfirm={handleConfirmReason}
          changeSummary={buildChangeSummary(schedule, form)}
          isPending={isPending}
        />
      )}
    </>
  )
}
