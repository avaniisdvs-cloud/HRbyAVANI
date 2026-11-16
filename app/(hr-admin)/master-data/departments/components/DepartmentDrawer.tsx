'use client'

import { useState, useEffect, useTransition } from 'react'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import {
  createDepartment,
  updateDepartment,
  correctDepartment,
} from './DepartmentActions'
import { ActionModeSelector } from '@/components/ui/ActionModeSelector'
import { PersonSelect, type PersonOption } from '@/components/forms/PersonSelect'
import { resolveDefaultScheduleId, type ScheduleOption } from './schedule-default'
import type { ActionMode } from '@/lib/action-mode'

export type { ScheduleOption }

// ── Types ────────────────────────────────────────────────────────────────────

export interface DepartmentRow {
  id:                 string
  legalEntityId:      string
  businessUnitId:     string
  code:               string
  nameEn:             string
  nameAr:             string
  departmentType:     string | null
  parentDepartmentId: string | null
  approvedHeadcount:  number
  costCentreCode:     string | null
  glAccountCode:      string | null
  headPersonId:       string | null
  headPersonName:     string | null
  workScheduleId:     string | null
  workScheduleName:   string | null
  workScheduleCode:   string | null
  isActive:           boolean
  entityName?:        string
}


interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface BusinessUnitOption {
  id:            string
  legalEntityId: string
  nameEn:        string
}

interface DepartmentOption {
  id:            string
  legalEntityId: string
  nameEn:        string
  code:          string
}

interface DepartmentDrawerProps {
  open:           boolean
  onClose:        () => void
  editRecord:     DepartmentRow | null
  legalEntities:  LegalEntityOption[]
  businessUnits:  BusinessUnitOption[]
  departments:    DepartmentOption[]
  personOptions:  PersonOption[]
  scheduleOptions: ScheduleOption[]
  onSaved:        () => void
  canCorrect?:    boolean
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

const selectStyle: React.CSSProperties = {
  width:        '100%',
  height:       42,
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

const DEPT_TYPES = [
  'Sales', 'Finance', 'HR', 'IT', 'Legal', 'Operations', 'Executive', 'PRO',
]

// ── Component ────────────────────────────────────────────────────────────────

export function DepartmentDrawer({
  open,
  onClose,
  editRecord,
  legalEntities,
  businessUnits,
  departments,
  personOptions,
  scheduleOptions,
  onSaved,
  canCorrect = false,
}: DepartmentDrawerProps) {
  const isEdit = editRecord !== null
  const locale = useLocale()

  // ── Form state
  const [legalEntityId,      setLegalEntityId]      = useState('')
  const [businessUnitId,     setBusinessUnitId]      = useState('')
  const [code,               setCode]               = useState('')
  const [nameEn,             setNameEn]             = useState('')
  const [nameAr,             setNameAr]             = useState('')
  const [departmentType,     setDepartmentType]     = useState('')
  const [parentDepartmentId, setParentDepartmentId] = useState('')
  const [approvedHeadcount,  setApprovedHeadcount]  = useState('0')
  const [costCentreCode,     setCostCentreCode]     = useState('')
  const [glAccountCode,      setGlAccountCode]      = useState('')
  const [headPersonId,       setHeadPersonId]       = useState('')
  const [workScheduleId,     setWorkScheduleId]     = useState('')

  // ── Auto-translation (EN → AR only)
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // ── UI state
  const [error,                  setError]                  = useState<string | null>(null)
  const [fieldErrors,            setFieldErrors]            = useState<Record<string, string>>({})
  const [changeReasonOpen,       setChangeReasonOpen]       = useState(false)
  const [pendingFormData,        setPendingFormData]        = useState<FormData | null>(null)
  const [isPending,              startTransition]           = useTransition()
  const [mode,                   setMode]                   = useState<ActionMode>('UPDATE')
  const [correctionNote,         setCorrectionNote]         = useState('')

  // Populate form when editing
  useEffect(() => {
    if (open) {
      setError(null)
      setFieldErrors({})
      setMode('UPDATE')
      setCorrectionNote('')
      if (editRecord) {
        setLegalEntityId(editRecord.legalEntityId)
        setBusinessUnitId(editRecord.businessUnitId)
        setCode(editRecord.code)
        setNameEn(editRecord.nameEn)
        setNameAr(editRecord.nameAr)
        setDepartmentType(editRecord.departmentType ?? '')
        setParentDepartmentId(editRecord.parentDepartmentId ?? '')
        setApprovedHeadcount(String(editRecord.approvedHeadcount))
        setCostCentreCode(editRecord.costCentreCode ?? '')
        setGlAccountCode(editRecord.glAccountCode ?? '')
        setHeadPersonId(editRecord.headPersonId ?? '')
        setWorkScheduleId(editRecord.workScheduleId ?? '')
      } else {
        setLegalEntityId('')
        setBusinessUnitId('')
        setCode('')
        setNameEn('')
        setNameAr('')
        setDepartmentType('')
        setParentDepartmentId('')
        setApprovedHeadcount('0')
        setCostCentreCode('')
        setGlAccountCode('')
        setHeadPersonId('')
        setWorkScheduleId('')
      }
    }
  }, [open, editRecord])

  const filteredBUs = businessUnits.filter(bu => !legalEntityId || bu.legalEntityId === legalEntityId)
  const filteredParents = departments.filter(
    d => (!legalEntityId || d.legalEntityId === legalEntityId) && d.id !== editRecord?.id,
  )
  // Head candidates scoped to the selected legal entity.
  const filteredPersons = personOptions.filter(p => !legalEntityId || p.legalEntityId === legalEntityId)
  // Schedules: entity-specific OR tenant-global (no entity).
  const filteredSchedules = scheduleOptions.filter(
    s => !s.legalEntityId || !legalEntityId || s.legalEntityId === legalEntityId,
  )

  // When the legal entity changes, reset entity-scoped pickers. On CREATE, default
  // the Work Schedule to the entity's active default schedule.
  function onLegalEntityChange(nextEntityId: string) {
    setLegalEntityId(nextEntityId)
    setBusinessUnitId('')
    setParentDepartmentId('')
    setHeadPersonId('')
    if (!isEdit) {
      setWorkScheduleId(resolveDefaultScheduleId(scheduleOptions, nextEntityId))
    }
    setFieldErrors(fe => ({ ...fe, legalEntityId: '', businessUnitId: '', headPersonId: '' }))
  }

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId',      legalEntityId)
    fd.set('businessUnitId',     businessUnitId)
    fd.set('code',               code)
    fd.set('nameEn',             nameEn)
    fd.set('nameAr',             nameAr)
    fd.set('departmentType',     departmentType)
    fd.set('parentDepartmentId', parentDepartmentId)
    fd.set('approvedHeadcount',  approvedHeadcount)
    fd.set('costCentreCode',     costCentreCode)
    fd.set('glAccountCode',      glAccountCode)
    fd.set('headPersonId',       headPersonId)
    fd.set('workScheduleId',     workScheduleId)
    return fd
  }

  function validateFields(): boolean {
    const errs: Record<string, string> = {}
    if (!legalEntityId)  errs.legalEntityId  = locale === 'ar' ? 'الكيان القانوني مطلوب' : 'Legal entity is required'
    if (!businessUnitId) errs.businessUnitId = locale === 'ar' ? 'وحدة العمل مطلوبة' : 'Business unit is required'
    if (!code.trim())    errs.code           = locale === 'ar' ? 'الرمز مطلوب' : 'Code is required'
    if (!nameEn.trim())  errs.nameEn         = locale === 'ar' ? 'الاسم الإنجليزي مطلوب' : 'English name is required'
    // Department Head is mandatory on CREATE only (legacy departments may have a
    // NULL head and must remain editable without forcing a head selection).
    if (!isEdit && !headPersonId) errs.headPersonId = locale === 'ar' ? 'رئيس القسم مطلوب.' : 'Department Head is required.'
    // Arabic is auto-translated server-side; no client-side required check
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validateFields()) return
    const fd = buildFormData()

    if (isEdit && mode === 'CORRECTION') {
      if (!correctionNote.trim()) { setError(locale === 'ar' ? 'ملاحظة التصحيح مطلوبة.' : 'Correction note is required.'); return }
      startTransition(async () => {
        const result = await correctDepartment(editRecord!.id, fd, correctionNote)
        if (result.error) {
          setError(result.error)
        } else {
          onSaved()
          onClose()
        }
      })
    } else if (isEdit) {
      // require change reason for edits
      setPendingFormData(fd)
      setChangeReasonOpen(true)
    } else {
      startTransition(async () => {
        const result = await createDepartment(fd)
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
      const result = await updateDepartment(editRecord.id, pendingFormData, reason)
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
        form="dept-form"
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
        {isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : isEdit ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes') : (locale === 'ar' ? 'إنشاء القسم' : 'Create Department')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Department — ${editRecord?.code}` : 'New Department'}
        titleAr={isEdit ? 'تعديل القسم' : 'قسم جديد'}
        footer={footer}
        width={600}
      >
        <form id="dept-form" onSubmit={handleSubmit}>

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

          {/* Section: Legal Structure */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الهيكل القانوني' : 'Legal Structure'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'} <span style={{ color: '#C62828' }}>*</span>
            </label>
            <select
              style={{ ...selectStyle, borderTopColor: fieldErrors.legalEntityId ? '#C62828' : 'var(--border)',
              borderRightColor: fieldErrors.legalEntityId ? '#C62828' : 'var(--border)',
              borderBottomColor: fieldErrors.legalEntityId ? '#C62828' : 'var(--border)',
              borderLeftColor: fieldErrors.legalEntityId ? '#C62828' : 'var(--border)' }}
              value={legalEntityId}
              onChange={e => onLegalEntityChange(e.target.value)}
              required
            >
              <option value="">{locale === 'ar' ? 'اختر الكيان القانوني…' : 'Select legal entity…'}</option>
              {legalEntities.map(le => (
                <option key={le.id} value={le.id}>{le.nameEn}</option>
              ))}
            </select>
            {fieldErrors.legalEntityId && <div style={{ fontSize: 'var(--text-caption)', color: '#C62828',
            marginTop: 4 }}>{fieldErrors.legalEntityId}</div>}
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'وحدة العمل' : 'Business Unit'} <span style={{ color: '#C62828' }}>*</span>
            </label>
            <select
              style={{ ...selectStyle, borderTopColor: fieldErrors.businessUnitId ? '#C62828' : 'var(--border)',
              borderRightColor: fieldErrors.businessUnitId ? '#C62828' : 'var(--border)',
              borderBottomColor: fieldErrors.businessUnitId ? '#C62828' : 'var(--border)',
              borderLeftColor: fieldErrors.businessUnitId ? '#C62828' : 'var(--border)' }}
              value={businessUnitId}
              onChange={e => { setBusinessUnitId(e.target.value); setFieldErrors(fe => ({ ...fe, businessUnitId: '' })) }}
              required
              disabled={!legalEntityId}
            >
              <option value="">{locale === 'ar' ? 'اختر وحدة العمل…' : 'Select business unit…'}</option>
              {filteredBUs.map(bu => (
                <option key={bu.id} value={bu.id}>{bu.nameEn}</option>
              ))}
            </select>
            {fieldErrors.businessUnitId && <div style={{ fontSize: 'var(--text-caption)', color: '#C62828',
            marginTop: 4 }}>{fieldErrors.businessUnitId}</div>}
            {legalEntityId && filteredBUs.length === 0 && (
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginTop: 4 }}>
                {locale === 'ar' ? 'لا توجد وحدات عمل لهذا الكيان.' : 'No business units for this entity.'}{' '}
                <a href="/config/business-units" style={{ color: 'var(--brand-active)', textDecoration: 'underline' }}>{locale === 'ar' ? 'إنشاء في البيانات الرئيسية ←' : 'Create in MDM →'}</a>
              </div>
            )}
          </div>

          {/* Section: Identification */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التعريف' : 'Identification'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الرمز' : 'Code'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <input
                style={inputStyle}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. FIN-01"
                maxLength={30}
                required
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'نوع القسم' : 'Department Type'}
              </label>
              <select
                style={selectStyle}
                value={departmentType}
                onChange={e => setDepartmentType(e.target.value)}
              >
                <option value="">{locale === 'ar' ? '— بدون —' : '— None —'}</option>
                {DEPT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bilingual name fields — Arabic auto-populates from English on blur */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span style={{ color: '#C62828' }}>*</span>
                <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>EN</span>
              </label>
              <input
                style={inputStyle}
                value={nameEn}
                onChange={e => setNameEn(e.target.value)}
                onBlur={async () => {
                  if (nameEn.trim() && (!nameAr.trim() || nameEn !== editRecord?.nameEn)) {
                    const ar = await autoTranslate(nameEn)
                    if (ar) setNameAr(ar)
                  }
                }}
                placeholder="Finance Department"
                maxLength={200}
                required
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={{ ...labelStyle, textAlign: 'right' }}>
                <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>AR</span>
                الاسم (عربي)
                {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                marginRight: 6 }}> جاري الترجمة…</span>}
              </label>
              <input
                style={{ ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                placeholder="قسم المالية"
                maxLength={200}
                disabled={arTranslating}
                dir="rtl"
                lang="ar"
              />
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
              marginTop: 3, textAlign: 'right' }}>
                يتم الترجمة تلقائياً من الاسم الإنجليزي
              </div>
            </div>
          </div>

          {/* Section: Organisation */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التنظيم' : 'Organisation'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'القسم الأصل' : 'Parent Department'}</label>
            <select
              style={selectStyle}
              value={parentDepartmentId}
              onChange={e => setParentDepartmentId(e.target.value)}
              disabled={!legalEntityId}
            >
              <option value="">{locale === 'ar' ? '— بدون (قسم رئيسي) —' : '— None (top-level department) —'}</option>
              {filteredParents.map(d => (
                <option key={d.id} value={d.id}>{d.code} — {d.nameEn}</option>
              ))}
            </select>
          </div>

          {/* Department Head — mandatory on create (future workflow actor) */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'رئيس القسم' : 'Department Head'} {!isEdit && <span style={{ color: '#C62828' }}>*</span>}
            </label>
            <PersonSelect
              value={headPersonId || null}
              valueLabel={editRecord?.headPersonName ?? null}
              options={filteredPersons}
              onChange={id => { setHeadPersonId(id); setFieldErrors(fe => ({ ...fe, headPersonId: '' })) }}
              placeholder={legalEntityId ? (locale === 'ar' ? 'ابحث عن موظف نشط…' : 'Search active employee…') : (locale === 'ar' ? 'اختر كياناً قانونياً أولاً…' : 'Select a legal entity first…')}
              disabled={!legalEntityId}
              required={!isEdit}
              error={fieldErrors.headPersonId}
            />
          </div>

          {/* Department Work Schedule — defaults to the entity's default schedule */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'جدول العمل' : 'Work Schedule'}</label>
            <select
              style={selectStyle}
              value={workScheduleId}
              onChange={e => setWorkScheduleId(e.target.value)}
              disabled={!legalEntityId}
            >
              <option value="">{locale === 'ar' ? '— موروث (الافتراضي للكيان / النظام) —' : '— Inherit (entity / system default) —'}</option>
              {filteredSchedules.map(s => (
                <option key={s.id} value={s.id}>
                  {s.scheduleCode} — {s.scheduleNameEn}{s.isDefault ? (locale === 'ar' ? ' (افتراضي)' : ' (default)') : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'العدد المعتمد للموظفين' : 'Approved Headcount'} <span style={{ color: '#C62828' }}>*</span>
            </label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              step={1}
              value={approvedHeadcount}
              onChange={e => setApprovedHeadcount(e.target.value)}
              required
            />
          </div>

          {/* Section: Finance */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'المالية' : 'Finance'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'رمز مركز التكلفة' : 'Cost Centre Code'}</label>
              <input
                style={inputStyle}
                value={costCentreCode}
                onChange={e => setCostCentreCode(e.target.value)}
                placeholder="e.g. CC-1001"
                maxLength={50}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'رمز حساب الأستاذ العام' : 'GL Account Code'}
                <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  {locale === 'ar' ? '(4–10 أرقام)' : '(4–10 digits)'}
                </span>
              </label>
              <input
                style={inputStyle}
                value={glAccountCode}
                onChange={e => setGlAccountCode(e.target.value)}
                placeholder="e.g. 100100"
                maxLength={50}
                pattern="[0-9]{4,10}"
                title={locale === 'ar' ? '4–10 أرقام فقط' : '4–10 numeric digits only'}
              />
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
