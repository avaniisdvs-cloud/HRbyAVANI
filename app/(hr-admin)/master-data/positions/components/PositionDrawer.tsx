'use client'

import { useState, useEffect, useTransition } from 'react'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createPosition, updatePosition, correctPosition } from './PositionActions'
import { ActionModeSelector } from '@/components/ui/ActionModeSelector'
import type { ActionMode } from '@/lib/action-mode'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PositionRow {
  id:                  string
  legalEntityId:       string
  departmentId:        string
  jobId:               string
  positionCode:        string
  positionTitleEn:     string
  positionTitleAr:     string | null
  gradeId:             string | null
  locationId:          string | null
  fteCount:            string
  isOccupied:          boolean
  reportsToPositionId: string | null
  budgetAmount:        string | null
  isActive:            boolean
  // Joined display names
  departmentName?: string
  jobTitleEn?:     string
  gradeCode?:      string
  locationName?:   string
}

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface DepartmentOption {
  id:            string
  legalEntityId: string
  nameEn:        string
  code:          string
}

interface JobOption {
  id:          string
  jobCode:     string
  jobTitleEn:  string
}

interface GradeOption {
  id:        string
  gradeCode: string
  gradeNameEn: string
}

interface LocationOption {
  id:     string
  nameEn: string
  code:   string
}

interface PositionDrawerProps {
  open:          boolean
  onClose:       () => void
  editRecord:    PositionRow | null
  legalEntities: LegalEntityOption[]
  departments:   DepartmentOption[]
  jobs:          JobOption[]
  grades:        GradeOption[]
  locations:     LocationOption[]
  allPositions:  { id: string; positionCode: string; positionTitleEn: string }[]
  onSaved:       () => void
  canCorrect?:   boolean
}

// ── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        '100%',
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '10px 12px',
  fontSize:     'var(--text-body)',
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  outline:      'none',
  boxSizing:    'border-box',
}

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--surface)',
  color:      'var(--ink-3)',
  cursor:     'not-allowed',
}

const selectStyle: React.CSSProperties = {
  width:        '100%',
  height:       42,
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '0 12px',
  fontSize:     'var(--text-body)',
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  cursor:       'pointer',
  outline:      'none',
}

const labelStyle: React.CSSProperties = {
  display:      'block',
  fontSize:     'var(--text-body)',
  fontWeight:   500,
  color:        'var(--ink-2)',
  marginBottom: 6,
}

const fieldWrapStyle: React.CSSProperties = { marginBottom: 16 }

const sectionDividerStyle: React.CSSProperties = {
  fontSize:        'var(--text-caption)',
  fontWeight:      700,
  textTransform:   'uppercase',
  letterSpacing:   '0.06em',
  color:           'var(--ink-3)',
  margin:          '24px 0 12px',
  paddingBottom:   6,
  borderBottom:    '1px solid var(--border)',
}

const FTE_OPTIONS = [
  { value: '0.25', label: '0.25 FTE — Part-time (25%)',      labelAr: '0.25 معادل دوام كامل — دوام جزئي (25%)' },
  { value: '0.50', label: '0.50 FTE — Half-time (50%)',      labelAr: '0.50 معادل دوام كامل — نصف دوام (50%)' },
  { value: '0.75', label: '0.75 FTE — Three-quarter (75%)',  labelAr: '0.75 معادل دوام كامل — ثلاثة أرباع (75%)' },
  { value: '1.00', label: '1.00 FTE — Full-time (100%)',     labelAr: '1.00 معادل دوام كامل — دوام كامل (100%)' },
]

// ── Component ────────────────────────────────────────────────────────────────

export function PositionDrawer({
  open,
  onClose,
  editRecord,
  legalEntities,
  departments,
  jobs,
  grades,
  locations,
  allPositions,
  onSaved,
  canCorrect = false,
}: PositionDrawerProps) {
  const isEdit = editRecord !== null
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // ── Form state
  const [legalEntityId,       setLegalEntityId]       = useState('')
  const [departmentId,        setDepartmentId]        = useState('')
  const [jobId,               setJobId]               = useState('')
  const [positionCode,        setPositionCode]        = useState('')
  const [positionTitleEn,     setPositionTitleEn]     = useState('')
  const [positionTitleAr,     setPositionTitleAr]     = useState('')
  const [gradeId,             setGradeId]             = useState('')
  const [locationId,          setLocationId]          = useState('')
  const [fteCount,            setFteCount]            = useState('1.00')
  const [reportsToPositionId, setReportsToPositionId] = useState('')
  const [budgetAmount,        setBudgetAmount]        = useState('')

  // ── UI state
  const [error,            setError]            = useState<string | null>(null)
  const [changeReasonOpen, setChangeReasonOpen] = useState(false)
  const [pendingFormData,  setPendingFormData]  = useState<FormData | null>(null)
  const [isPending,        startTransition]     = useTransition()
  const [mode,             setMode]             = useState<ActionMode>('UPDATE')
  const [correctionNote,   setCorrectionNote]   = useState('')

  // Populate form when editing
  useEffect(() => {
    if (open) {
      setError(null)
      setMode('UPDATE')
      setCorrectionNote('')
      if (editRecord) {
        setLegalEntityId(editRecord.legalEntityId)
        setDepartmentId(editRecord.departmentId)
        setJobId(editRecord.jobId)
        setPositionCode(editRecord.positionCode) // immutable in edit
        setPositionTitleEn(editRecord.positionTitleEn)
        setPositionTitleAr(editRecord.positionTitleAr ?? '')
        setGradeId(editRecord.gradeId ?? '')
        setLocationId(editRecord.locationId ?? '')
        // Normalise FTE to 2dp
        const fte = parseFloat(editRecord.fteCount).toFixed(2)
        setFteCount(FTE_OPTIONS.find(o => o.value === fte) ? fte : '1.00')
        setReportsToPositionId(editRecord.reportsToPositionId ?? '')
        setBudgetAmount(editRecord.budgetAmount ?? '')
      } else {
        setLegalEntityId('')
        setDepartmentId('')
        setJobId('')
        setPositionCode('')
        setPositionTitleEn('')
        setPositionTitleAr('')
        setGradeId('')
        setLocationId('')
        setFteCount('1.00')
        setReportsToPositionId('')
        setBudgetAmount('')
      }
    }
  }, [open, editRecord])

  const filteredDepts = departments.filter(d => !legalEntityId || d.legalEntityId === legalEntityId)
  const reportsToOptions = allPositions.filter(p => p.id !== editRecord?.id)

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId',       legalEntityId)
    fd.set('departmentId',        departmentId)
    fd.set('jobId',               jobId)
    fd.set('positionCode',        positionCode)
    fd.set('positionTitleEn',     positionTitleEn)
    fd.set('positionTitleAr',     positionTitleAr)
    fd.set('gradeId',             gradeId)
    fd.set('locationId',          locationId)
    fd.set('fteCount',            fteCount)
    fd.set('reportsToPositionId', reportsToPositionId)
    fd.set('budgetAmount',        budgetAmount)
    return fd
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = buildFormData()

    if (isEdit && mode === 'CORRECTION') {
      if (!correctionNote.trim()) { setError(locale === 'ar' ? 'ملاحظة التصحيح مطلوبة.' : 'Correction note is required.'); return }
      startTransition(async () => {
        const result = await correctPosition(editRecord!.id, fd, correctionNote)
        if (result.error) {
          setError(result.error)
        } else {
          onSaved()
          onClose()
        }
      })
    } else if (isEdit) {
      setPendingFormData(fd)
      setChangeReasonOpen(true)
    } else {
      startTransition(async () => {
        const result = await createPosition(fd)
        if (result.error) {
          setError(result.error)
        } else {
          onSaved()
          onClose()
        }
      })
    }
  }

  function handleChangeReasonConfirm(reason: string) {
    if (!pendingFormData || !editRecord) return
    setChangeReasonOpen(false)
    startTransition(async () => {
      const result = await updatePosition(editRecord.id, pendingFormData, reason)
      if (result.error) {
        setError(result.error)
      } else {
        onSaved()
        onClose()
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
          border: '1.5px solid var(--border)', borderRadius: 10,
          background: 'transparent', color: 'var(--ink-2)',
          fontSize: 'var(--text-body)', fontWeight: 500, cursor: 'pointer',
        }}
      >
        {locale === 'ar' ? 'إلغاء' : 'Cancel'}
      </button>
      <button
        type="submit"
        form="pos-form"
        disabled={isPending}
        style={{
          height: 36, padding: '0 20px',
          border: 'none', borderRadius: 10,
          background: isPending ? 'var(--border)' : 'var(--accent)',
          color: isPending ? 'var(--ink-4)' : '#fff',
          fontSize: 'var(--text-body)', fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : isEdit ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes') : (locale === 'ar' ? 'إنشاء المنصب' : 'Create Position')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Position — ${editRecord?.positionCode}` : 'New Position'}
        titleAr={isEdit ? 'تعديل المنصب' : 'منصب جديد'}
        footer={footer}
        width={620}
      >
        <form id="pos-form" onSubmit={handleSubmit}>

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: '#FBE9E9',
              border: '1px solid #FFCDD2',
              borderRadius: 8,
              fontSize: 'var(--text-body)',
              color: '#C62828',
            }}>
              {error}
            </div>
          )}

          {isEdit && (
            <div style={{ marginBottom: 20 }}>
              <ActionModeSelector
                mode={mode}
                correctionNote={correctionNote}
                onModeChange={setMode}
                onNoteChange={setCorrectionNote}
                canCorrect={canCorrect}
                disabled={isPending}
              />
            </div>
          )}

          {/* Section: Organisation */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التنظيم' : 'Organisation'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'} <span style={{ color: '#C62828' }}>*</span>
            </label>
            <select
              style={selectStyle}
              value={legalEntityId}
              onChange={e => { setLegalEntityId(e.target.value); setDepartmentId('') }}
              required
            >
              <option value="">{locale === 'ar' ? 'اختر الكيان القانوني…' : 'Select legal entity…'}</option>
              {legalEntities.map(le => (
                <option key={le.id} value={le.id}>{le.nameEn}</option>
              ))}
            </select>
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'القسم' : 'Department'} <span style={{ color: '#C62828' }}>*</span>
            </label>
            <select
              style={selectStyle}
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              required
              disabled={!legalEntityId}
            >
              <option value="">{locale === 'ar' ? 'اختر القسم…' : 'Select department…'}</option>
              {filteredDepts.map(d => (
                <option key={d.id} value={d.id}>{d.code} — {d.nameEn}</option>
              ))}
            </select>
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'الوظيفة' : 'Job'} <span style={{ color: '#C62828' }}>*</span>
            </label>
            <select
              style={selectStyle}
              value={jobId}
              onChange={e => setJobId(e.target.value)}
              required
            >
              <option value="">{locale === 'ar' ? 'اختر الوظيفة…' : 'Select job…'}</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.jobCode} — {j.jobTitleEn}</option>
              ))}
            </select>
          </div>

          {/* Section: Position Identity */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'هوية المنصب' : 'Position Identity'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'رمز المنصب' : 'Position Code'} <span style={{ color: '#C62828' }}>*</span>
                {isEdit && (
                  <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400, textTransform: 'none' }}>
                    {locale === 'ar' ? '(مقفل)' : '(locked)'}
                  </span>
                )}
              </label>
              <input
                style={isEdit ? disabledInputStyle : inputStyle}
                value={positionCode}
                onChange={e => !isEdit && setPositionCode(e.target.value.toUpperCase())}
                placeholder="e.g. POS-001"
                maxLength={30}
                required
                readOnly={isEdit}
                disabled={isEdit}
                title={isEdit ? (locale === 'ar' ? 'BR-POS-001: رمز المنصب غير قابل للتغيير بعد الإنشاء' : 'BR-POS-001: Position code is immutable after creation') : undefined}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'معادل الدوام الكامل' : 'FTE Count'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <select
                style={selectStyle}
                value={fteCount}
                onChange={e => setFteCount(e.target.value)}
                required
              >
                {FTE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{locale === 'ar' ? opt.labelAr : opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bilingual title */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'العنوان (إنجليزي)' : 'Title (English)'} <span style={{ color: '#C62828' }}>*</span>
                <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>EN</span>
              </label>
              <input
                style={inputStyle}
                value={positionTitleEn}
                onChange={e => setPositionTitleEn(e.target.value)}
                onBlur={async () => {
                  if (positionTitleEn.trim() && (!positionTitleAr.trim() || positionTitleEn !== editRecord?.positionTitleEn)) {
                    const ar = await autoTranslate(positionTitleEn)
                    if (ar) setPositionTitleAr(ar)
                  }
                }}
                placeholder="Property Consultant"
                maxLength={200}
                required
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={{ ...labelStyle, textAlign: 'right' }}>
                <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>AR</span>
                العنوان (عربي)
                {arTranslating && <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
              </label>
              <input
                style={{ ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
                value={positionTitleAr}
                onChange={e => setPositionTitleAr(e.target.value)}
                placeholder="مستشار عقاري"
                maxLength={200}
                dir="rtl"
                lang="ar"
                disabled={arTranslating}
              />
            </div>
          </div>

          {/* Section: Assignment */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التعيين والتعويضات' : 'Assignment & Compensation'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الدرجة' : 'Grade'}</label>
              <select
                style={selectStyle}
                value={gradeId}
                onChange={e => setGradeId(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— بدون —' : '— None —'}</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>{g.gradeCode} — {g.gradeNameEn}</option>
                ))}
              </select>
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الموقع' : 'Location'}</label>
              <select
                style={selectStyle}
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— بدون —' : '— None —'}</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.code} — {l.nameEn}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'يرفع تقاريره إلى منصب' : 'Reports To Position'}</label>
            <select
              style={selectStyle}
              value={reportsToPositionId}
              onChange={e => setReportsToPositionId(e.target.value)}
            >
              <option value="">{locale === 'ar' ? '— بدون —' : '— None —'}</option>
              {reportsToOptions.map(p => (
                <option key={p.id} value={p.id}>{p.positionCode} — {p.positionTitleEn}</option>
              ))}
            </select>
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'مبلغ الميزانية (درهم)' : 'Budget Amount (AED)'}
            </label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step={0.01}
              value={budgetAmount}
              onChange={e => setBudgetAmount(e.target.value)}
              placeholder="e.g. 120000.00"
            />
          </div>

        </form>
      </MdmDrawer>

      <ChangeReasonModal
        open={changeReasonOpen}
        onClose={() => setChangeReasonOpen(false)}
        onConfirm={handleChangeReasonConfirm}
        isPending={isPending}
      />
    </>
  )
}
