'use client'

import { useState, useEffect, useTransition } from 'react'
import { Info } from 'lucide-react'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createGrade, updateGrade } from './GradeActions'
import type { GradeFieldErrors } from './GradeActions'
import type { Grade } from '@/drizzle/schema'

// ── Types ──────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface GradeDrawerProps {
  open:           boolean
  onClose:        () => void
  onSuccess:      () => void
  editRow?:       Grade | null
  legalEntities:  LegalEntityOption[]
}

// ── Style helpers ──────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  margin: '24px 0 12px',
  paddingBottom: 6,
  borderBottom: '1px solid var(--border)',
}

const fieldWrap: React.CSSProperties = { marginBottom: 16 }

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-body)',
  fontWeight: 500,
  color: 'var(--ink-2)',
  marginBottom: 6,
}

const requiredStar: React.CSSProperties = { color: '#C62828' }

const inputBase: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const errorText: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: '#C62828',
  marginTop: 4,
}

const readonlyInput: React.CSSProperties = {
  ...inputBase,
  background: 'var(--surface)',
  color: 'var(--ink-3)',
  cursor: 'not-allowed',
}

// ── Component ──────────────────────────────────────────────────────────────

export function GradeDrawer({
  open,
  onClose,
  onSuccess,
  editRow,
  legalEntities,
}: GradeDrawerProps) {
  const isEdit = !!editRow
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // Form state
  const [legalEntityId,    setLegalEntityId]    = useState('')
  const [gradeCode,        setGradeCode]        = useState('')
  const [gradeNameEn,      setGradeNameEn]      = useState('')
  const [gradeNameAr,      setGradeNameAr]      = useState('')
  const [gradeLevel,       setGradeLevel]       = useState('1')
  const [minSalary,        setMinSalary]        = useState('')
  const [maxSalary,        setMaxSalary]        = useState('')
  const [noticePeriodDays, setNoticePeriodDays] = useState('30')

  // UI state
  const [fieldErrors,  setFieldErrors]  = useState<GradeFieldErrors>({})
  const [serverError,  setServerError]  = useState<string | null>(null)
  const [showReason,   setShowReason]   = useState(false)
  const [pendingFd,    setPendingFd]    = useState<FormData | null>(null)
  const [isPending,    startTransition] = useTransition()

  // Computed midpoint (BR-GRADE: auto-calculated)
  const computedMid = (() => {
    const min = parseFloat(minSalary)
    const max = parseFloat(maxSalary)
    if (!isNaN(min) && !isNaN(max) && min > 0 && max > min) {
      return ((min + max) / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return null
  })()

  // Populate form when editing
  useEffect(() => {
    if (open && editRow) {
      setLegalEntityId(editRow.legalEntityId ?? '')
      setGradeCode(editRow.gradeCode)
      setGradeNameEn(editRow.gradeNameEn)
      setGradeNameAr(editRow.gradeNameAr ?? '')
      setGradeLevel(String(editRow.gradeLevel))
      setMinSalary(editRow.minSalary ? String(editRow.minSalary) : '')
      setMaxSalary(editRow.maxSalary ? String(editRow.maxSalary) : '')
      setNoticePeriodDays(String(editRow.noticePeriodDays))
    } else if (open && !editRow) {
      setLegalEntityId('')
      setGradeCode('')
      setGradeNameEn('')
      setGradeNameAr('')
      setGradeLevel('1')
      setMinSalary('')
      setMaxSalary('')
      setNoticePeriodDays('30')
    }
    setFieldErrors({})
    setServerError(null)
  }, [open, editRow])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId',    legalEntityId)
    fd.set('gradeCode',        gradeCode)
    fd.set('gradeNameEn',      gradeNameEn)
    fd.set('gradeNameAr',      gradeNameAr)
    fd.set('gradeLevel',       gradeLevel)
    fd.set('minSalary',        minSalary)
    fd.set('maxSalary',        maxSalary)
    fd.set('noticePeriodDays', noticePeriodDays)
    return fd
  }

  function handleSubmit() {
    setFieldErrors({})
    setServerError(null)
    const fd = buildFormData()

    if (isEdit) {
      // Show change reason modal first
      setPendingFd(fd)
      setShowReason(true)
    } else {
      startTransition(async () => {
        const result = await createGrade(fd)
        if (result.success) {
          onSuccess()
          onClose()
        } else {
          setServerError(result.error)
          if ('fieldErrors' in result && result.fieldErrors) {
            setFieldErrors(result.fieldErrors)
          }
        }
      })
    }
  }

  function handleConfirmReason(reason: string) {
    if (!pendingFd) return
    setShowReason(false)
    startTransition(async () => {
      const result = await updateGrade(editRow!.id, pendingFd, reason)
      if (result.success) {
        onSuccess()
        onClose()
      } else {
        setServerError(result.error)
        if ('fieldErrors' in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
        }
      }
    })
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        style={{
          height: 36, padding: '0 16px',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          background: 'transparent',
          color: 'var(--ink-2)',
          fontSize: 'var(--text-body)', fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {tk(locale, 'common.cancel')}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        style={{
          height: 36, padding: '0 20px',
          border: 'none',
          borderRadius: 10,
          background: isPending ? 'var(--border)' : 'var(--accent)',
          color: isPending ? 'var(--ink-4)' : '#fff',
          fontSize: 'var(--text-body)', fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending
          ? tk(locale, 'common.saving')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء درجة' : 'Create Grade')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Grade — ${editRow?.gradeCode}` : 'New Grade'}
        titleAr={isEdit ? 'تعديل الدرجة' : 'درجة جديدة'}
        footer={footer}
        width={600}
      >
        {serverError && (
          <div style={{
            background: '#FBE9E9',
            border: '1px solid #FFCDD2',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 'var(--text-body)',
            color: '#C62828',
          }}>
            {serverError}
          </div>
        )}

        {/* ── Organisation ───────────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'المؤسسة' : 'Organisation'}</div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'}</label>
          <select
            value={legalEntityId}
            onChange={e => setLegalEntityId(e.target.value)}
            style={inputBase}
          >
            <option value="">{locale === 'ar' ? 'على مستوى المؤسسة (جميع الكيانات)' : 'Enterprise-wide (all entities)'}</option>
            {legalEntities.map(le => (
              <option key={le.id} value={le.id}>{le.nameEn}</option>
            ))}
          </select>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>
            {locale === 'ar' ? 'اتركه فارغاً لتطبيق هذه الدرجة على جميع الكيانات.' : 'Leave blank to apply this grade across all entities.'}
          </div>
        </div>

        {/* ── Grade Identity ──────────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'هوية الدرجة' : 'Grade Identity'}</div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={fieldLabel}>
              {locale === 'ar' ? 'رمز الدرجة' : 'Grade Code'} <span style={requiredStar}>*</span>
            </label>
            <input
              type="text"
              value={gradeCode}
              onChange={e => setGradeCode(e.target.value.toUpperCase())}
              placeholder="G1 – G10"
              maxLength={20}
              disabled={isEdit} // code is immutable after creation
              style={isEdit ? readonlyInput : inputBase}
            />
            {fieldErrors.gradeCode && <div style={errorText}>{fieldErrors.gradeCode}</div>}
            {isEdit && (
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>{locale === 'ar' ? 'رمز الدرجة ثابت.' : 'Grade code is immutable.'}</div>
            )}
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>
              {locale === 'ar' ? 'مستوى الدرجة' : 'Grade Level'} <span style={requiredStar}>*</span>
            </label>
            <input
              type="number"
              value={gradeLevel}
              onChange={e => setGradeLevel(e.target.value)}
              min={1}
              max={20}
              style={inputBase}
            />
            {fieldErrors.gradeLevel && <div style={errorText}>{fieldErrors.gradeLevel}</div>}
          </div>
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>
            {locale === 'ar' ? 'اسم الدرجة (إنجليزي)' : 'Grade Name (English)'} <span style={requiredStar}>*</span>
          </label>
          <input
            type="text"
            value={gradeNameEn}
            onChange={e => setGradeNameEn(e.target.value)}
            onBlur={async () => {
              if (gradeNameEn.trim() && (!gradeNameAr.trim() || gradeNameEn !== editRow?.gradeNameEn)) {
                const ar = await autoTranslate(gradeNameEn)
                if (ar) setGradeNameAr(ar)
              }
            }}
            placeholder="e.g. Junior Associate"
            maxLength={100}
            style={inputBase}
          />
          {fieldErrors.gradeNameEn && <div style={errorText}>{fieldErrors.gradeNameEn}</div>}
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>
            {locale === 'ar' ? 'اسم الدرجة (عربي)' : 'Grade Name (Arabic)'}
            {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginLeft: 6, fontStyle: 'italic' }}>جاري الترجمة…</span>}
          </label>
          <input
            type="text"
            value={gradeNameAr}
            onChange={e => setGradeNameAr(e.target.value)}
            dir="rtl"
            lang="ar"
            placeholder="مثال: مساعد مبتدئ"
            maxLength={100}
            disabled={arTranslating}
            style={{ ...inputBase, textAlign: 'right', fontFamily: 'var(--font-sans)', opacity: arTranslating ? 0.6 : 1 }}
          />
          {fieldErrors.gradeNameAr && <div style={errorText}>{fieldErrors.gradeNameAr}</div>}
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>يتم الترجمة تلقائياً من الاسم الإنجليزي</div>
        </div>

        {/* ── Compensation ────────────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'نطاق الأجر (درهم)' : 'Compensation Band (AED)'}</div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الحد الأدنى للراتب (درهم)' : 'Minimum Salary (AED)'}</label>
            <input
              type="number"
              value={minSalary}
              onChange={e => setMinSalary(e.target.value)}
              placeholder="e.g. 8000"
              min={0}
              step="0.01"
              style={inputBase}
            />
            {fieldErrors.minSalary && <div style={errorText}>{fieldErrors.minSalary}</div>}
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الحد الأقصى للراتب (درهم)' : 'Maximum Salary (AED)'}</label>
            <input
              type="number"
              value={maxSalary}
              onChange={e => setMaxSalary(e.target.value)}
              placeholder="e.g. 15000"
              min={0}
              step="0.01"
              style={inputBase}
            />
            {fieldErrors.maxSalary && <div style={errorText}>{fieldErrors.maxSalary}</div>}
          </div>
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'الراتب الأوسط (درهم)' : 'Midpoint Salary (AED)'}</label>
          <div style={{ ...readonlyInput, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: computedMid ? 'var(--ink-1)' : 'var(--ink-4)', fontSize: 14 }}>
              {computedMid ? `AED ${computedMid}` : (locale === 'ar' ? 'يُحسب تلقائياً من الحد الأدنى والأقصى' : 'Auto-calculated from min & max')}
            </span>
            {computedMid && (
              <span style={{
                fontSize: 'var(--text-caption)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: 'var(--brand-active)',
                background: 'var(--accent-100)',
                padding: '2px 6px',
                borderRadius: 4,
              }}>
                {locale === 'ar' ? 'محسوب' : 'Calculated'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>
            {locale === 'ar' ? 'يُحسب تلقائياً كـ (الحد الأدنى + الحد الأقصى) ÷ 2' : 'Automatically calculated as (Min + Max) ÷ 2'}
          </div>
          {fieldErrors.salaryRange && (
            <div style={{ ...errorText, marginTop: 6 }}>{fieldErrors.salaryRange}</div>
          )}
        </div>

        {/* ── Notice Period ───────────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'فترة الإشعار' : 'Notice Period'}</div>

        <div style={fieldWrap}>
          <label style={{ ...fieldLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
            {locale === 'ar' ? 'فترة الإشعار (أيام)' : 'Notice Period (Days)'} <span style={requiredStar}>*</span>
            <span title="Per UAE Labour Law: &lt;1yr service = 30 days, 1–5yr = 60 days, &gt;5yr = 90 days" style={{ cursor: 'help', color: 'var(--ink-4)', lineHeight: 1 }}>
              <Info size={13} />
            </span>
          </label>
          <select
            value={noticePeriodDays}
            onChange={e => setNoticePeriodDays(e.target.value)}
            style={inputBase}
          >
            <option value="30">{locale === 'ar' ? '30 يوماً — خدمة أقل من سنة' : '30 days — Less than 1 year service'}</option>
            <option value="60">{locale === 'ar' ? '60 يوماً — خدمة من 1 إلى 5 سنوات' : '60 days — 1 to 5 years service'}</option>
            <option value="90">{locale === 'ar' ? '90 يوماً — خدمة أكثر من 5 سنوات' : '90 days — More than 5 years service'}</option>
          </select>
          {fieldErrors.noticePeriodDays && <div style={errorText}>{fieldErrors.noticePeriodDays}</div>}
          <div style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--accent-100)',
            borderRadius: 6,
            fontSize: 'var(--text-caption)',
            color: 'var(--brand-active)',
            lineHeight: 1.5,
          }}>
            <strong>BR-GRADE-003 — {locale === 'ar' ? 'قانون العمل الإماراتي' : 'UAE Labour Law'}:</strong> {locale === 'ar'
              ? 'تُحدَّد فترات الإشعار بموجب القانون بناءً على مدة الخدمة — أقل من سنة: 30 يوماً · 1–5 سنوات: 60 يوماً · أكثر من 5 سنوات: 90 يوماً.'
              : <>Notice periods are set by law based on length of
            service — &lt;1 yr: 30 days · 1–5 yrs: 60 days · &gt;5 yrs: 90 days.</>}
          </div>
        </div>
      </MdmDrawer>

      {/* Change reason modal (edit only) */}
      <ChangeReasonModal
        open={showReason}
        onClose={() => setShowReason(false)}
        onConfirm={handleConfirmReason}
        isPending={isPending}
        changeSummary={isEdit ? `Editing grade ${editRow?.gradeCode} — ${editRow?.gradeNameEn}` : undefined}
      />
    </>
  )
}
