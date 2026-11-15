'use client'

import { useState, useCallback, useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { HolidayCalendarGrid } from './HolidayCalendarGrid'
import type { Holiday } from './HolidayCalendarGrid'
import { DateInput } from '@/components/forms/DateInput'
import { createHoliday, updateHoliday, deleteHoliday } from './HolidayActions'

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityRef = { id: string; nameEn: string }

interface HolidayClientProps {
  initialData:   Holiday[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: EntityRef[]
}

// NOTE: A hardcoded "UAE 2026 pre-seeded holidays" quick-add list used to live
// here. It was removed because it injected GUESSED floating-holiday dates (e.g.
// Eid Al Adha on 06 Jun 2026) into the live calendar, which then surfaced on the
// dashboard as if they were configured. Holidays must be entered with their
// real, confirmed dates via the "Add Holiday" form only — no hardcoded/guessed
// holiday data anywhere in the app.

// ── Style helpers ─────────────────────────────────────────────────────────────

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

const fieldWrapper = (
  label: React.ReactNode,
  input: React.ReactNode,
  error?: string | null,
  hint?: React.ReactNode,
) => (
  <div style={{ marginBottom: 14 }}>
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

// ── Holiday entry form state ───────────────────────────────────────────────────

interface HolidayFormState {
  legalEntityId:  string
  holidayCode:    string
  holidayNameEn:  string
  holidayNameAr:  string
  holidayDate:    string
  durationDays:   string
  isFloating:     boolean
  isConfirmed:    boolean
  appliesTo:      string
  announcedDate:  string
  emirate:        string
}

type HolidayFormErrors = Partial<Record<keyof HolidayFormState, string>>

function emptyHolidayForm(year: number, date?: string): HolidayFormState {
  return {
    legalEntityId:  '',
    holidayCode:    '',
    holidayNameEn:  '',
    holidayNameAr:  '',
    holidayDate:    date ?? `${year}-01-01`,
    durationDays:   '1',
    isFloating:     false,
    isConfirmed:    false,
    appliesTo:      'ALL',
    announcedDate:  '',
    emirate:        '',
  }
}

function holidayToForm(h: Holiday): HolidayFormState {
  return {
    legalEntityId:  h.legalEntityId ?? '',
    holidayCode:    h.holidayCode,
    holidayNameEn:  h.holidayNameEn,
    holidayNameAr:  h.holidayNameAr,
    holidayDate:    h.holidayDate,
    durationDays:   String(h.durationDays),
    isFloating:     h.isFloating,
    isConfirmed:    h.isConfirmed,
    appliesTo:      h.appliesTo,
    announcedDate:  '',
    emirate:        '',
  }
}

function buildHolidayChangeSummary(holiday: Holiday, form: HolidayFormState): string {
  const changes: string[] = []
  if (form.holidayNameEn !== holiday.holidayNameEn) changes.push(`Name EN: "${holiday.holidayNameEn}" → "${form.holidayNameEn}"`)
  if (form.holidayDate !== holiday.holidayDate) changes.push(`Date: ${holiday.holidayDate} → ${form.holidayDate}`)
  if (form.durationDays !== String(holiday.durationDays)) changes.push(`Duration: ${holiday.durationDays}d → ${form.durationDays}d`)
  if (form.isConfirmed !== holiday.isConfirmed) changes.push(`Confirmed: ${holiday.isConfirmed} → ${form.isConfirmed}`)
  return changes.length > 0 ? changes.join('; ') : 'Holiday details changed'
}

// ── Holiday Entry Drawer ──────────────────────────────────────────────────────

interface HolidayEntryDrawerProps {
  open:          boolean
  onClose:       () => void
  holiday?:      Holiday | null
  year:          number
  prefillDate?:  string
  legalEntities: EntityRef[]
  onSaved:       () => void
}

function HolidayEntryDrawer({
  open,
  onClose,
  holiday,
  year,
  prefillDate,
  legalEntities,
  onSaved,
}: HolidayEntryDrawerProps) {
  const isEdit = Boolean(holiday)
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()
  const [form, setForm]               = useState<HolidayFormState>(() => emptyHolidayForm(year, prefillDate))
  const [errors, setErrors]           = useState<HolidayFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, setIsPending]     = useState(false)
  const [showReason, setShowReason]   = useState(false)

  useEffect(() => {
    if (open) {
      setForm(holiday ? holidayToForm(holiday) : emptyHolidayForm(year, prefillDate))
      setErrors({})
      setServerError(null)
      setIsPending(false)
    }
  }, [open, holiday, year, prefillDate])

  const set = useCallback(<K extends keyof HolidayFormState>(key: K, value: HolidayFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }, [])

  function validate(): boolean {
    const errs: HolidayFormErrors = {}
    if (!form.holidayCode.trim())   errs.holidayCode   = 'Holiday code is required.'
    if (!form.holidayNameEn.trim()) errs.holidayNameEn = 'English name is required.'
    if (!form.holidayDate)          errs.holidayDate   = 'Date is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function buildFormData(): FormData {
    const fd = new FormData()
    if (form.legalEntityId) fd.set('legalEntityId', form.legalEntityId)
    fd.set('holidayYear',   String(year))
    fd.set('holidayCode',   form.holidayCode)
    fd.set('holidayNameEn', form.holidayNameEn)
    fd.set('holidayNameAr', form.holidayNameAr)
    fd.set('holidayDate',   form.holidayDate)
    fd.set('durationDays',  form.durationDays)
    fd.set('isFloating',    String(form.isFloating))
    fd.set('isConfirmed',   String(form.isConfirmed))
    fd.set('appliesTo',     form.appliesTo)
    if (form.announcedDate) fd.set('announcedDate', form.announcedDate)
    if (form.emirate)       fd.set('emirate', form.emirate)
    return fd
  }

  async function handleCreate() {
    if (!validate()) return
    setIsPending(true)
    setServerError(null)
    try {
      const result = await createHoliday(buildFormData())
      if (result.error) {
        setServerError(result.error)
      } else {
        onSaved()
        onClose()
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
    if (!holiday) return
    setIsPending(true)
    setServerError(null)
    try {
      const result = await updateHoliday(holiday.id, buildFormData(), reason)
      if (result.error) {
        setServerError(result.error)
        setShowReason(false)
      } else {
        setShowReason(false)
        onSaved()
        onClose()
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
          height: 38, padding: '0 18px',
          border: '1.5px solid var(--border)', borderRadius: 10,
          background: 'transparent', color: 'var(--ink-2)',
          fontSize: 'var(--text-body)', fontWeight: 500, cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {tk(locale, 'common.cancel')}
      </button>
      <button
        onClick={isEdit ? handleEditSave : handleCreate}
        disabled={isPending}
        style={{
          height: 38, padding: '0 18px',
          border: 'none', borderRadius: 10,
          background: isPending ? 'var(--border)' : 'var(--accent)',
          color: isPending ? 'var(--ink-4)' : '#fff',
          fontSize: 'var(--text-body)', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending
          ? tk(locale, 'common.saving')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إضافة إجازة رسمية' : 'Add Holiday')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit — ${holiday?.holidayNameEn}` : `Add Holiday — ${year}`}
        titleAr={isEdit ? 'تعديل إجازة' : 'إضافة إجازة رسمية'}
        footer={footer}
        width={540}
      >
        {serverError && (
          <div style={{
            marginBottom: 14, padding: '10px 14px',
            background: '#FBE9E9', borderRadius: 8, border: '1px solid #E57373',
            fontSize: 'var(--text-body)', color: '#C62828',
          }}>
            {serverError}
          </div>
        )}

        {/* Legal Entity */}
        {fieldWrapper(
          locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity',
          <select value={form.legalEntityId} onChange={e => set('legalEntityId', e.target.value)} style={selectStyle}>
            <option value="">{locale === 'ar' ? 'جميع الكيانات' : 'All entities'}</option>
            {legalEntities.map(le => <option key={le.id} value={le.id}>{le.nameEn}</option>)}
          </select>,
        )}

        {/* Holiday Code */}
        {fieldWrapper(
          <><span>{locale === 'ar' ? 'رمز الإجازة الرسمية' : 'Holiday Code'}</span> <span style={{ color: '#C62828' }}>*</span></>,
          <input
            value={form.holidayCode}
            onChange={e => set('holidayCode', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
            placeholder="e.g. EID_FITR_2026"
            maxLength={30}
            style={inputStyle}
          />,
          errors.holidayCode,
        )}

        {/* Name EN */}
        {fieldWrapper(
          <><span>{locale === 'ar' ? 'اسم الإجازة الرسمية (إنجليزي)' : 'Holiday Name (English)'}</span> <span style={{ color: '#C62828' }}>*</span></>,
          <input
            value={form.holidayNameEn}
            onChange={e => set('holidayNameEn', e.target.value)}
            onBlur={async () => {
              if (form.holidayNameEn.trim() && (!form.holidayNameAr.trim() || form.holidayNameEn !== holiday?.holidayNameEn)) {
                const ar = await autoTranslate(form.holidayNameEn)
                if (ar) set('holidayNameAr', ar)
              }
            }}
            placeholder="e.g. Eid Al Fitr"
            maxLength={200}
            style={inputStyle}
          />,
          errors.holidayNameEn,
        )}

        {/* Name AR */}
        {fieldWrapper(
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {locale === 'ar' ? 'اسم الإجازة الرسمية (عربي)' : 'Holiday Name (Arabic)'}
            {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
          </span>,
          <input
            value={form.holidayNameAr}
            onChange={e => set('holidayNameAr', e.target.value)}
            placeholder="مثال: عيد الفطر"
            maxLength={200}
            dir="rtl"
            disabled={arTranslating}
            style={{ ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
          />,
          errors.holidayNameAr,
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
          marginTop: 4 }}>يتم الترجمة تلقائياً من الاسم الإنجليزي</p>,
        )}

        {/* Date */}
        {fieldWrapper(
          <><span>{locale === 'ar' ? 'التاريخ' : 'Date'}</span> <span style={{ color: '#C62828' }}>*</span></>,
          <DateInput
            value={form.holidayDate}
            onChange={e => set('holidayDate', e.target.value)}
            style={inputStyle}
          />,
          errors.holidayDate,
        )}

        {/* Duration */}
        {fieldWrapper(
          locale === 'ar' ? 'المدة (أيام)' : 'Duration (days)',
          <input
            type="number"
            value={form.durationDays}
            onChange={e => set('durationDays', e.target.value)}
            min={1}
            max={5}
            style={{ ...inputStyle, width: 100 }}
          />,
        )}

        {/* Is Floating */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={form.isFloating}
              onChange={e => {
                set('isFloating', e.target.checked)
                // Floating holidays default to unconfirmed
                if (e.target.checked) set('isConfirmed', false)
              }}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            {locale === 'ar' ? 'متغير (هجري — التاريخ تقريبي)' : 'Floating (Hijri-based — date is approximate)'}
          </label>
          {/* BR-HOL-002 */}
          {form.isFloating && (
            <div style={{
              marginTop: 8, padding: '8px 12px',
              background: '#FFF3E0', border: '1px solid #FFCC80',
              borderRadius: 7, fontSize: 'var(--text-caption)', color: '#E65100',
            }}>
              <strong>BR-HOL-002:</strong> {locale === 'ar'
                ? 'إجازة هجرية — التاريخ تقريبي. ضع علامة "مؤكد" بمجرد إعلان وزارة الموارد البشرية للتاريخ الرسمي.'
                : 'Hijri-based holiday — date is approximate. Mark confirmed once MoHRE announces the official date.'}
            </div>
          )}
        </div>

        {/* Is Confirmed */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={form.isConfirmed}
              onChange={e => set('isConfirmed', e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            {locale === 'ar' ? 'مؤكد (تم إعلان التاريخ الرسمي)' : 'Confirmed (official date announced)'}
          </label>
        </div>

        {/* Announced Date — shown when floating and confirmed */}
        {form.isFloating && form.isConfirmed && fieldWrapper(
          locale === 'ar' ? 'تاريخ إعلان وزارة الموارد البشرية (MoHRE)' : 'MoHRE Announced Date',
          <DateInput
            value={form.announcedDate}
            onChange={e => set('announcedDate', e.target.value)}
            style={inputStyle}
          />,
        )}

        {/* Applies To */}
        {fieldWrapper(
          locale === 'ar' ? 'ينطبق على' : 'Applies To',
          <select value={form.appliesTo} onChange={e => set('appliesTo', e.target.value)} style={selectStyle}>
            <option value="ALL">{locale === 'ar' ? 'جميع الموظفين' : 'All employees'}</option>
            <option value="MUSLIMS_ONLY">{locale === 'ar' ? 'المسلمون فقط' : 'Muslims only'}</option>
            <option value="PUBLIC_SECTOR_ONLY">{locale === 'ar' ? 'القطاع العام فقط' : 'Public sector only'}</option>
          </select>,
        )}

        {/* Emirate (optional) */}
        {fieldWrapper(
          locale === 'ar' ? 'الإمارة (اتركها فارغة للإجازات الاتحادية)' : 'Emirate (leave blank for federal)',
          <input
            value={form.emirate}
            onChange={e => set('emirate', e.target.value)}
            placeholder="e.g. Dubai, Abu Dhabi"
            maxLength={50}
            style={inputStyle}
          />,
        )}
      </MdmDrawer>

      {isEdit && holiday && (
        <ChangeReasonModal
          open={showReason}
          onClose={() => { if (!isPending) setShowReason(false) }}
          onConfirm={handleConfirmReason}
          changeSummary={buildHolidayChangeSummary(holiday, form)}
          isPending={isPending}
        />
      )}
    </>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function HolidayClient({
  initialData,
  auditHistory,
  legalEntities,
}: HolidayClientProps) {
  const locale = useLocale()
  const CURRENT_YEAR = new Date().getFullYear()

  const [data, setData]                 = useState<Holiday[]>(initialData)
  const [year, setYear]                 = useState(CURRENT_YEAR)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [editTarget, setEditTarget]     = useState<Holiday | null>(null)
  const [prefillDate, setPrefillDate]   = useState<string | undefined>(undefined)
  const [deleteError,    setDeleteError]    = useState<string | null>(null)
  const [deletePending,  setDeletePending]  = useState(false)
  const [historyRecord,  setHistoryRecord]  = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const totalCount    = data.length
  const activeCount   = totalCount
  const inactiveCount = 0

  function handleAddHoliday(date?: string) {
    setEditTarget(null)
    setPrefillDate(date)
    setDrawerOpen(true)
  }

  function handleEditHoliday(holiday: Holiday) {
    setEditTarget(holiday)
    setPrefillDate(undefined)
    setDrawerOpen(true)
  }

  async function handleDeleteHoliday(id: string) {
    if (!confirm(locale === 'ar' ? 'إزالة هذه الإجازة الرسمية من التقويم؟ يتم تدقيق هذا الإجراء.' : 'Remove this holiday from the calendar? This action is audited.')) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      const result = await deleteHoliday(id)
      if (result.error) {
        setDeleteError(result.error)
      } else {
        setData(prev => prev.filter(h => h.id !== id))
      }
    } finally {
      setDeletePending(false)
    }
  }

  function handleSaved() {
    window.location.reload()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <MdmPageHeader
        titleEn="Holiday Calendars"
        titleAr="تقويمات الإجازات الرسمية"
        icon={CalendarDays}
        totalCount={totalCount + inactiveCount}
        activeCount={totalCount}
        inactiveCount={inactiveCount}
        onNew={() => handleAddHoliday()}
        newLabel="Add Holiday"
      />

      {/* Delete error */}
      {deleteError && (
        <div style={{
          marginBottom: 12, padding: '10px 14px',
          background: '#FBE9E9', borderRadius: 8, border: '1px solid #E57373',
          fontSize: 'var(--text-body)', color: '#C62828',
        }}>
          {deleteError}
        </div>
      )}

      {/* ── Calendar grid ─────────────────────────────────────────────── */}
      <HolidayCalendarGrid
        holidays={data}
        year={year}
        onYearChange={setYear}
        onAddHoliday={handleAddHoliday}
        onEditHoliday={handleEditHoliday}
        onDeleteHoliday={handleDeleteHoliday}
        onHistoryHoliday={(h) => setHistoryRecord({ id: h.id, nameEn: h.holidayNameEn, nameAr: h.holidayNameAr })}
      />

      {/* ── Audit history ─────────────────────────────────────────────── */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="public_holidays"
        initialCollapsed
      />

      {/* ── Entry drawer ──────────────────────────────────────────────── */}
      <HolidayEntryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        holiday={editTarget}
        year={year}
        prefillDate={prefillDate}
        legalEntities={legalEntities}
        onSaved={handleSaved}
      />

      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="public_holidays"
      />
    </div>
  )
}
