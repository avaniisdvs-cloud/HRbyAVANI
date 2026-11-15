'use client'

import { useState, useEffect, useTransition } from 'react'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createProject, updateProject } from './ProjectActions'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProjectRow {
  id:            string
  legalEntityId: string | null
  code:          string
  nameEn:        string
  nameAr:        string | null
  projectType:   string | null
  glMappingCode: string | null
  description:   string | null
  startDate:     string | null
  endDate:       string | null
  isActive:      boolean
  entityName?:   string
}

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface ProjectDrawerProps {
  open:          boolean
  onClose:       () => void
  editRecord:    ProjectRow | null
  legalEntities: LegalEntityOption[]
  onSaved:       () => void
}

// ── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        '100%',
  borderTopWidth: "1.5px",
  borderTopStyle: "solid",
  borderTopColor: "var(--border)",
  borderRightWidth: "1.5px",
  borderRightStyle: "solid",
  borderRightColor: "var(--border)",
  borderBottomWidth: "1.5px",
  borderBottomStyle: "solid",
  borderBottomColor: "var(--border)",
  borderLeftWidth: "1.5px",
  borderLeftStyle: "solid",
  borderLeftColor: "var(--border)",
  borderRadius: 8,
  padding:      '10px 12px',
  fontSize:     14,
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  outline:      'none',
  boxSizing:    'border-box',
}

const selectStyle: React.CSSProperties = {
  width:        '100%',
  height:       42,
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '0 12px',
  fontSize:     14,
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

const PROJECT_TYPES = ['INTERNAL', 'EXTERNAL', 'CAPITAL', 'MAINTENANCE', 'RESEARCH', 'OTHER']

const PROJECT_TYPE_LABELS_AR: Record<string, string> = {
  INTERNAL:    'داخلي',
  EXTERNAL:    'خارجي',
  CAPITAL:     'رأسمالي',
  MAINTENANCE: 'صيانة',
  RESEARCH:    'بحثي',
  OTHER:       'أخرى',
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProjectDrawer({
  open,
  onClose,
  editRecord,
  legalEntities,
  onSaved,
}: ProjectDrawerProps) {
  const isEdit = editRecord !== null
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  const [legalEntityId, setLegalEntityId] = useState('')
  const [code,          setCode]          = useState('')
  const [nameEn,        setNameEn]        = useState('')
  const [nameAr,        setNameAr]        = useState('')
  const [projectType,   setProjectType]   = useState('')
  const [glMappingCode, setGlMappingCode] = useState('')
  const [description,   setDescription]   = useState('')
  const [startDate,     setStartDate]     = useState('')
  const [endDate,       setEndDate]       = useState('')

  const [error,            setError]            = useState<string | null>(null)
  const [fieldErrors,      setFieldErrors]      = useState<Record<string, string>>({})
  const [changeReasonOpen, setChangeReasonOpen] = useState(false)
  const [pendingFormData,  setPendingFormData]  = useState<FormData | null>(null)
  const [isPending,        startTransition]     = useTransition()

  useEffect(() => {
    if (open) {
      setError(null)
      setFieldErrors({})
      if (editRecord) {
        setLegalEntityId(editRecord.legalEntityId ?? '')
        setCode(editRecord.code)
        setNameEn(editRecord.nameEn)
        setNameAr(editRecord.nameAr ?? '')
        setProjectType(editRecord.projectType ?? '')
        setGlMappingCode(editRecord.glMappingCode ?? '')
        setDescription(editRecord.description ?? '')
        setStartDate(editRecord.startDate ?? '')
        setEndDate(editRecord.endDate ?? '')
      } else {
        setLegalEntityId('')
        setCode('')
        setNameEn('')
        setNameAr('')
        setProjectType('')
        setGlMappingCode('')
        setDescription('')
        setStartDate('')
        setEndDate('')
      }
    }
  }, [open, editRecord])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId', legalEntityId)
    fd.set('code',          code)
    fd.set('nameEn',        nameEn)
    fd.set('nameAr',        nameAr)
    fd.set('projectType',   projectType)
    fd.set('glMappingCode', glMappingCode)
    fd.set('description',   description)
    fd.set('startDate',     startDate)
    fd.set('endDate',       endDate)
    return fd
  }

  function validateFields(): boolean {
    const errs: Record<string, string> = {}
    if (!code.trim())   errs.code   = 'Code is required'
    if (!nameEn.trim()) errs.nameEn = 'English name is required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validateFields()) return
    const fd = buildFormData()

    if (isEdit) {
      setPendingFormData(fd)
      setChangeReasonOpen(true)
    } else {
      startTransition(async () => {
        const result = await createProject(fd)
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
      const result = await updateProject(editRecord.id, pendingFormData, reason)
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
        {tk(locale, 'common.cancel')}
      </button>
      <button
        type="submit"
        form="project-form"
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
        {isPending
          ? tk(locale, 'common.saving')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء مشروع' : 'Create Project')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Project — ${editRecord?.code}` : 'New Project'}
        titleAr={isEdit ? 'تعديل المشروع' : 'مشروع جديد'}
        footer={footer}
        width={600}
      >
        <form id="project-form" onSubmit={handleSubmit}>

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

          {/* Section: Legal Structure */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الهيكل القانوني' : 'Legal Structure'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>{locale === 'ar' ? '(اختياري — اتركه فارغاً للمشاريع المشتركة)' : '(optional — leave blank for cross-entity)'}</span></label>
            <select
              style={selectStyle}
              value={legalEntityId}
              onChange={e => setLegalEntityId(e.target.value)}
            >
              <option value="">{locale === 'ar' ? '— جميع الكيانات —' : '— All entities —'}</option>
              {legalEntities.map(le => (
                <option key={le.id} value={le.id}>{le.nameEn}</option>
              ))}
            </select>
          </div>

          {/* Section: Identification */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التعريف' : 'Identification'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الرمز' : 'Code'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <input
                style={{ ...inputStyle, borderTopColor: fieldErrors.code ? '#C62828' : 'var(--border)',
                borderRightColor: fieldErrors.code ? '#C62828' : 'var(--border)',
                borderBottomColor: fieldErrors.code ? '#C62828' : 'var(--border)',
                borderLeftColor: fieldErrors.code ? '#C62828' : 'var(--border)' }}
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setFieldErrors(fe => ({ ...fe, code: '' })) }}
                placeholder="e.g. PROJ-001"
                maxLength={30}
                required
              />
              {fieldErrors.code && <div style={{ fontSize: 'var(--text-caption)', color: '#C62828',
              marginTop: 4 }}>{fieldErrors.code}</div>}
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'نوع المشروع' : 'Project Type'}</label>
              <select
                style={selectStyle}
                value={projectType}
                onChange={e => setProjectType(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— بلا —' : '— None —'}</option>
                {PROJECT_TYPES.map(t => (
                  <option key={t} value={t}>{locale === 'ar' ? (PROJECT_TYPE_LABELS_AR[t] ?? t) : t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bilingual names */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span style={{ color: '#C62828' }}>*</span>
                <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>EN</span>
              </label>
              <input
                style={{ ...inputStyle, borderTopColor: fieldErrors.nameEn ? '#C62828' : 'var(--border)',
                borderRightColor: fieldErrors.nameEn ? '#C62828' : 'var(--border)',
                borderBottomColor: fieldErrors.nameEn ? '#C62828' : 'var(--border)',
                borderLeftColor: fieldErrors.nameEn ? '#C62828' : 'var(--border)' }}
                value={nameEn}
                onChange={e => { setNameEn(e.target.value); setFieldErrors(fe => ({ ...fe, nameEn: '' })) }}
                onBlur={async () => {
                  if (nameEn.trim() && (!nameAr.trim() || nameEn !== editRecord?.nameEn)) {
                    const ar = await autoTranslate(nameEn)
                    if (ar) setNameAr(ar)
                  }
                }}
                placeholder="Downtown Development Phase 1"
                maxLength={200}
                required
              />
              {fieldErrors.nameEn && <div style={{ fontSize: 'var(--text-caption)', color: '#C62828',
              marginTop: 4 }}>{fieldErrors.nameEn}</div>}
            </div>
            <div style={fieldWrapStyle}>
              <label style={{ ...labelStyle, textAlign: 'right' }}>
                <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>AR</span>
                الاسم (عربي)
                {arTranslating && <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
              </label>
              <input
                style={{ ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                placeholder="مشروع وسط المدينة"
                maxLength={200}
                dir="rtl"
                lang="ar"
                disabled={arTranslating}
              />
            </div>
          </div>

          {/* Section: Finance */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'المالية' : 'Finance'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'رمز ربط دفتر الأستاذ العام' : 'GL Mapping Code'}</label>
            <input
              style={inputStyle}
              value={glMappingCode}
              onChange={e => setGlMappingCode(e.target.value)}
              placeholder="e.g. GL-PROJ-001"
              maxLength={50}
            />
          </div>

          {/* Section: Timeline */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الجدول الزمني' : 'Timeline'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'تاريخ البدء' : 'Start Date'}</label>
              <input
                type="date"
                style={inputStyle}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</label>
              <input
                type="date"
                style={inputStyle}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'الوصف' : 'Description'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>{locale === 'ar' ? '(اختياري)' : '(optional)'}</span></label>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={locale === 'ar' ? 'وصف موجز للمشروع…' : 'Brief project description…'}
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
