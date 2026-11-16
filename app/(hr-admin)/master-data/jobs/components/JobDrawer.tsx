'use client'

import { useState, useEffect, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createJob, updateJob, correctJob } from './JobActions'
import { ActionModeSelector } from '@/components/ui/ActionModeSelector'
import type { ActionMode } from '@/lib/action-mode'

// ── Types ────────────────────────────────────────────────────────────────────

export interface JobRow {
  id:                   string
  legalEntityId:        string | null
  jobCode:              string
  jobTitleEn:           string
  jobTitleAr:           string | null
  jobFamily:            string | null
  jobFunction:          string | null
  minGradeId:           string | null
  maxGradeId:           string | null
  isEmiratisationTarget: boolean
  isManagementRole:     boolean
  isExemptFromOvertime: boolean
  jobDescriptionEn:     string | null
  jobDescriptionAr:     string | null
  isActive:             boolean
  // Joined
  minGradeCode?:        string
  maxGradeCode?:        string
  minGradeLevel?:       number
  maxGradeLevel?:       number
}

interface GradeOption {
  id:         string
  gradeCode:  string
  gradeLevel: number
}

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface JobDrawerProps {
  open:          boolean
  onClose:       () => void
  editRecord:    JobRow | null
  grades:        GradeOption[]
  legalEntities: LegalEntityOption[]
  onSaved:       () => void
  canCorrect?:   boolean
}

// ── Shared styles ─────────────────────────────────────────────────────────────

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

const inputDisabledStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--surface)',
  color:      'var(--ink-3)',
  cursor:     'not-allowed',
}

const textareaStyle: React.CSSProperties = {
  width:        '100%',
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '10px 12px',
  fontSize:     'var(--text-body)',
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  outline:      'none',
  resize:       'vertical',
  boxSizing:    'border-box',
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
  fontSize:      'var(--text-caption)',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color:         'var(--ink-3)',
  margin:        '24px 0 12px',
  paddingBottom: 6,
  borderBottom:  '1px solid var(--border)',
}

const JOB_FAMILIES = [
  'Technology', 'Finance', 'HR', 'Sales', 'Operations', 'Legal', 'Executive', 'PRO',
]

// ── Component ─────────────────────────────────────────────────────────────────

export function JobDrawer({
  open,
  onClose,
  editRecord,
  grades,
  legalEntities,
  onSaved,
  canCorrect = false,
}: JobDrawerProps) {
  const isEdit = editRecord !== null
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // ── Form state
  const [legalEntityId,         setLegalEntityId]         = useState('')
  const [jobCode,               setJobCode]               = useState('')
  const [jobTitleEn,            setJobTitleEn]            = useState('')
  const [jobTitleAr,            setJobTitleAr]            = useState('')
  const [jobFamily,             setJobFamily]             = useState('')
  const [jobFunction,           setJobFunction]           = useState('')
  const [minGradeId,            setMinGradeId]            = useState('')
  const [maxGradeId,            setMaxGradeId]            = useState('')
  const [isEmiratisationTarget, setIsEmiratisationTarget] = useState(false)
  const [isManagementRole,      setIsManagementRole]      = useState(false)
  const [isExemptFromOvertime,  setIsExemptFromOvertime]  = useState(false)
  const [jobDescriptionEn,      setJobDescriptionEn]      = useState('')
  const [jobDescriptionAr,      setJobDescriptionAr]      = useState('')

  // ── UI state
  const [error,            setError]            = useState<string | null>(null)
  const [gradeWarning,     setGradeWarning]     = useState<string | null>(null)
  const [br005Warning,     setBr005Warning]     = useState(false)
  const [changeReasonOpen, setChangeReasonOpen] = useState(false)
  const [pendingFormData,  setPendingFormData]  = useState<FormData | null>(null)
  const [isPending,        startTransition]     = useTransition()
  const [mode,             setMode]             = useState<ActionMode>('UPDATE')
  const [correctionNote,   setCorrectionNote]   = useState('')

  // Populate form on open
  useEffect(() => {
    if (open) {
      setError(null)
      setGradeWarning(null)
      setBr005Warning(false)
      setMode('UPDATE')
      setCorrectionNote('')
      if (editRecord) {
        setLegalEntityId(editRecord.legalEntityId ?? '')
        setJobCode(editRecord.jobCode)
        setJobTitleEn(editRecord.jobTitleEn)
        setJobTitleAr(editRecord.jobTitleAr ?? '')
        setJobFamily(editRecord.jobFamily ?? '')
        setJobFunction(editRecord.jobFunction ?? '')
        setMinGradeId(editRecord.minGradeId ?? '')
        setMaxGradeId(editRecord.maxGradeId ?? '')
        setIsEmiratisationTarget(editRecord.isEmiratisationTarget)
        setIsManagementRole(editRecord.isManagementRole)
        setIsExemptFromOvertime(editRecord.isExemptFromOvertime)
        setJobDescriptionEn(editRecord.jobDescriptionEn ?? '')
        setJobDescriptionAr(editRecord.jobDescriptionAr ?? '')
        // Check BR-005 on load for existing edits
        setBr005Warning(editRecord.isExemptFromOvertime && !editRecord.isManagementRole)
      } else {
        setLegalEntityId('')
        setJobCode('')
        setJobTitleEn('')
        setJobTitleAr('')
        setJobFamily('')
        setJobFunction('')
        setMinGradeId('')
        setMaxGradeId('')
        setIsEmiratisationTarget(false)
        setIsManagementRole(false)
        setIsExemptFromOvertime(false)
        setJobDescriptionEn('')
        setJobDescriptionAr('')
      }
    }
  }, [open, editRecord])

  // Validate grade range BR-JOB-002
  useEffect(() => {
    if (!minGradeId || !maxGradeId) {
      setGradeWarning(null)
      return
    }
    const minG = grades.find(g => g.id === minGradeId)
    const maxG = grades.find(g => g.id === maxGradeId)
    if (minG && maxG && maxG.gradeLevel < minG.gradeLevel) {
      setGradeWarning(`BR-JOB-002: Max grade level (${maxG.gradeLevel}) must be ≥ min grade level (${minG.gradeLevel}).`)
    } else {
      setGradeWarning(null)
    }
  }, [minGradeId, maxGradeId, grades])

  // BR-JOB-005
  useEffect(() => {
    setBr005Warning(isExemptFromOvertime && !isManagementRole)
  }, [isExemptFromOvertime, isManagementRole])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId',         legalEntityId)
    fd.set('jobCode',               jobCode)
    fd.set('jobTitleEn',            jobTitleEn)
    fd.set('jobTitleAr',            jobTitleAr)
    fd.set('jobFamily',             jobFamily)
    fd.set('jobFunction',           jobFunction)
    fd.set('minGradeId',            minGradeId)
    fd.set('maxGradeId',            maxGradeId)
    fd.set('isEmiratisationTarget', String(isEmiratisationTarget))
    fd.set('isManagementRole',      String(isManagementRole))
    fd.set('isExemptFromOvertime',  String(isExemptFromOvertime))
    fd.set('jobDescriptionEn',      jobDescriptionEn)
    fd.set('jobDescriptionAr',      jobDescriptionAr)
    return fd
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (gradeWarning) {
      setError(gradeWarning)
      return
    }

    const fd = buildFormData()

    if (isEdit && mode === 'CORRECTION') {
      if (!correctionNote.trim()) { setError(locale === 'ar' ? 'ملاحظة التصحيح مطلوبة.' : 'Correction note is required.'); return }
      startTransition(async () => {
        const result = await correctJob(editRecord!.id, fd, correctionNote)
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
        const result = await createJob(fd)
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
      const result = await updateJob(editRecord.id, pendingFormData, reason)
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
        form="job-form"
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
        {isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : isEdit ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes') : (locale === 'ar' ? 'إنشاء الوظيفة' : 'Create Job')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Job — ${editRecord?.jobCode}` : 'New Job'}
        titleAr={isEdit ? 'تعديل الوظيفة' : 'وظيفة جديدة'}
        footer={footer}
        width={640}
      >
        <form id="job-form" onSubmit={handleSubmit}>

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

          {/* BR-JOB-005 warning */}
          {br005Warning && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: '#FFF8E1',
              border: '1px solid #FFE082',
              borderRadius: 8,
              fontSize: 'var(--text-body)',
              color: '#F57F17',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>BR-JOB-005:</strong> {locale === 'ar' ? 'دور غير إداري مُعفى من العمل الإضافي — تأكّد من الشؤون القانونية قبل الحفظ.' : 'Non-management role exempted from overtime — confirm with Legal before saving.'}
              </span>
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

          {/* ── Section: Identification ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التعريف' : 'Identification'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'رمز الوظيفة' : 'Job Code'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <input
                style={isEdit ? inputDisabledStyle : inputStyle}
                value={jobCode}
                onChange={e => setJobCode(e.target.value.toUpperCase())}
                placeholder="JOB-HR-001"
                maxLength={30}
                required
                disabled={isEdit}
                readOnly={isEdit}
              />
              {isEdit && (
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4, display: 'block' }}>
                  {locale === 'ar' ? 'BR-JOB-001: لا يمكن تغيير رمز الوظيفة بعد الإنشاء.' : 'BR-JOB-001: Job code cannot be changed after creation.'}
                </span>
              )}
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'}</label>
              <select
                style={selectStyle}
                value={legalEntityId}
                onChange={e => setLegalEntityId(e.target.value)}
              >
                <option value="">{locale === 'ar' ? 'جميع الكيانات (عام)' : 'All Entities (global)'}</option>
                {legalEntities.map(le => (
                  <option key={le.id} value={le.id}>{le.nameEn}</option>
                ))}
              </select>
            </div>
          </div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'المسمى الوظيفي (إنجليزي)' : 'Job Title (English)'} <span style={{ color: '#C62828' }}>*</span>
                <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>EN</span>
              </label>
              <input
                style={inputStyle}
                value={jobTitleEn}
                onChange={e => setJobTitleEn(e.target.value)}
                onBlur={async () => {
                  if (jobTitleEn.trim() && (!jobTitleAr.trim() || jobTitleEn !== editRecord?.jobTitleEn)) {
                    const ar = await autoTranslate(jobTitleEn)
                    if (ar) setJobTitleAr(ar)
                  }
                }}
                placeholder="HR Business Partner"
                maxLength={200}
                required
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={{ ...labelStyle, textAlign: 'right' }}>
                <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>AR</span>
                المسمى الوظيفي (عربي)
                {arTranslating && <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
              </label>
              <input
                style={{ ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
                value={jobTitleAr}
                onChange={e => setJobTitleAr(e.target.value)}
                placeholder="شريك أعمال الموارد البشرية"
                maxLength={200}
                dir="rtl"
                lang="ar"
                disabled={arTranslating}
              />
            </div>
          </div>

          {/* ── Section: Classification ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التصنيف' : 'Classification'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'عائلة الوظيفة' : 'Job Family'}</label>
              <select
                style={selectStyle}
                value={jobFamily}
                onChange={e => setJobFamily(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— بدون —' : '— None —'}</option>
                {JOB_FAMILIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الوظيفة الفرعية' : 'Job Function'}</label>
              <input
                style={inputStyle}
                value={jobFunction}
                onChange={e => setJobFunction(e.target.value)}
                placeholder="e.g. Talent Acquisition"
                maxLength={100}
              />
            </div>
          </div>

          {/* ── Section: Grade Range ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'نطاق الدرجات' : 'Grade Range'}</div>

          {gradeWarning && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: '#FFF8E1',
              border: '1px solid #FFE082',
              borderRadius: 8,
              fontSize: 'var(--text-caption)',
              color: '#F57F17',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              {gradeWarning}
            </div>
          )}

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الحد الأدنى للدرجة' : 'Minimum Grade'}</label>
              <select
                style={selectStyle}
                value={minGradeId}
                onChange={e => setMinGradeId(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— غير محدّد —' : '— Not set —'}</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.gradeCode} (L{g.gradeLevel})
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الحد الأقصى للدرجة' : 'Maximum Grade'}</label>
              <select
                style={selectStyle}
                value={maxGradeId}
                onChange={e => setMaxGradeId(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— غير محدّد —' : '— Not set —'}</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.gradeCode} (L{g.gradeLevel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Section: Attributes ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'السمات' : 'Attributes'}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="job-emiratisation"
              checked={isEmiratisationTarget}
              onChange={e => setIsEmiratisationTarget(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="job-emiratisation" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer' }}>
              {locale === 'ar' ? 'هدف التوطين' : 'Emiratisation Target'} <span style={{ marginLeft: 4 }}>🇦🇪</span>
              <span style={{
                marginLeft: 6, fontSize: 'var(--text-caption)', fontWeight: 700, padding: '1px 5px',
                background: 'var(--accent-100)', color: 'var(--brand-active)',
                borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>Nafis</span>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="job-management"
              checked={isManagementRole}
              onChange={e => setIsManagementRole(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="job-management" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer' }}>
              {locale === 'ar' ? 'دور إداري' : 'Is Management Role'}
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="job-overtime-exempt"
              checked={isExemptFromOvertime}
              onChange={e => setIsExemptFromOvertime(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="job-overtime-exempt" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer' }}>
              {locale === 'ar' ? 'معفى من العمل الإضافي' : 'Exempt from Overtime'}
            </label>
          </div>

          {/* ── Section: Description ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الوصف الوظيفي' : 'Job Description'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'الوصف (إنجليزي)' : 'Description (English)'}
              <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>EN</span>
            </label>
            <textarea
              style={textareaStyle}
              value={jobDescriptionEn}
              onChange={e => setJobDescriptionEn(e.target.value)}
              onBlur={async () => {
                if (jobDescriptionEn.trim() && (!jobDescriptionAr.trim() || jobDescriptionEn !== editRecord?.jobDescriptionEn)) {
                  const ar = await autoTranslate(jobDescriptionEn)
                  if (ar) setJobDescriptionAr(ar)
                }
              }}
              rows={4}
              maxLength={2000}
              placeholder={locale === 'ar' ? 'صف الدور والمسؤوليات والمؤهلات المطلوبة…' : 'Describe the role, responsibilities, and required qualifications…'}
            />
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4, display: 'block' }}>
              {jobDescriptionEn.length}/2000
            </span>
          </div>

          <div style={fieldWrapStyle}>
            <label style={{ ...labelStyle, textAlign: 'right' }}>
              <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>AR</span>
              وصف الوظيفة (عربي)
              {arTranslating && <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
            </label>
            <textarea
              style={{ ...textareaStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
              value={jobDescriptionAr}
              onChange={e => setJobDescriptionAr(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="وصف الدور والمسؤوليات والمؤهلات المطلوبة…"
              dir="rtl"
              lang="ar"
              disabled={arTranslating}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
                {jobDescriptionAr.length}/2000
              </span>
            </div>
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
