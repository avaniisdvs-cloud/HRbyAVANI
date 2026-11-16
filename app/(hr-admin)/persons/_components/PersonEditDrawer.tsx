'use client'

import { useState, useTransition, useEffect } from 'react'
import { MdmDrawer }          from '@/components/mdm/MdmDrawer'
import { useToast }           from '@/hooks/use-toast'
import { useLocale }          from '@/components/providers/LocaleProvider'
import { NationalitySelect, deriveNationalityCategory } from '@/components/forms/NationalitySelect'
import { DateInput } from '@/components/forms/DateInput'
import { updatePersonFromEdit, getPerson, getPersonPicklists, updatePersonProject, getPersonCurrentProject } from '@/modules/core-hr'
import type { PicklistOption } from '@/modules/core-hr'
import { isExpiringSoon, isExpired } from '@/lib/utils/index'
import type { PersonListRow } from '@/modules/core-hr/types'

interface Props {
  open:    boolean
  person:  PersonListRow | null
  onClose: () => void
  onSaved: (personId: string) => void
}

type Tab = 'personal' | 'employment' | 'documents'

// ── Style helpers ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', fontSize: 'var(--text-body)',
  background: 'var(--card)', color: 'var(--ink-1)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle, background: 'var(--surface)', color: 'var(--ink-3)', cursor: 'not-allowed',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
  color: 'var(--ink-3)', letterSpacing: '0.6px',
  marginBottom: 6, display: 'block',
}

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const gridStyle:  React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

// ── Expiry warning ───────────────────────────────────────────────────────────

function ExpiryWarning({ value }: { value: string }) {
  const locale = useLocale()
  if (!value) return null
  if (isExpired(value))
    return <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)',
    marginTop: 2 }}>⚠️ {locale === 'ar' ? 'منتهية' : 'Expired'}</span>
  if (isExpiringSoon(value, 90))
    return <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-pending-fg)',
    marginTop: 2 }}>⚠️ {locale === 'ar' ? 'قاربت الانتهاء' : 'Expiring soon'}</span>
  return null
}

// ── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const locale = useLocale()
  const tabs: { key: Tab; label: string }[] = [
    { key: 'personal',   label: locale === 'ar' ? 'شخصي'    : 'Personal'   },
    { key: 'employment', label: locale === 'ar' ? 'التوظيف' : 'Employment' },
    { key: 'documents',  label: locale === 'ar' ? 'الوثائق' : 'Documents'  },
  ]
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)',
    marginBottom: 24 }}>
      {tabs.map(t => (
        <button key={t.key} type="button" onClick={() => onChange(t.key)} style={{
          padding: '10px 18px', fontSize: 'var(--text-body)',
          fontWeight:   active === t.key ? 600 : 400,
          color:        active === t.key ? 'var(--brand-active)' : 'var(--ink-3)',
          background:   'transparent',
          borderTopWidth: "0px",
          borderTopStyle: "none",
          borderTopColor: "currentColor",
          borderRightWidth: "0px",
          borderRightStyle: "none",
          borderRightColor: "currentColor",
          borderLeftWidth: "0px",
          borderLeftStyle: "none",
          borderLeftColor: "currentColor",
          borderBottomWidth: "2px",
          borderBottomStyle: "solid",
          borderBottomColor: (active === t.key) ? "var(--accent)" : "transparent",
          cursor: 'pointer',
          marginBottom: -1,
          transition: 'color 120ms, border-color 120ms',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Select helper ────────────────────────────────────────────────────────────

function PickSelect({
  label, value, onChange, options, placeholder, disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: PicklistOption[]
  placeholder?: string
  disabled?: boolean
}) {
  const locale = useLocale()
  const resolvedPlaceholder = placeholder ?? (locale === 'ar' ? '— اختر —' : '— Select —')
  return (
    <div style={fieldStyle}>
      <label style={sectionLabelStyle}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={disabled ? readOnlyInputStyle : inputStyle}
      >
        <option value="">{resolvedPlaceholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PersonEditDrawer({ open, person, onClose, onSaved }: Props) {
  const { toast }                    = useToast()
  const locale                       = useLocale()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab]    = useState<Tab>('personal')
  const [isLoading, setIsLoading]    = useState(false)

  // ── Picklist options ─────────────────────────────────────────────────────
  const [positionOptions,   setPositionOptions]   = useState<PicklistOption[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<PicklistOption[]>([])
  const [gradeOptions,      setGradeOptions]      = useState<PicklistOption[]>([])
  const [locationOptions,   setLocationOptions]   = useState<PicklistOption[]>([])
  const [managerOptions,    setManagerOptions]    = useState<PicklistOption[]>([])

  // ── Personal ─────────────────────────────────────────────────────────────
  const [firstNameEn,       setFirstNameEn]       = useState('')
  const [lastNameEn,        setLastNameEn]        = useState('')
  const [preferredName,     setPreferredName]     = useState('')
  const [dateOfBirth,       setDateOfBirth]       = useState('')
  const [gender,            setGender]            = useState('')
  const [maritalStatus,     setMaritalStatus]     = useState('')
  const [nationalityCode,   setNationalityCode]   = useState('')
  const [religion,          setReligion]          = useState('')

  // ── Employment ───────────────────────────────────────────────────────────
  const [assignmentStatus,    setAssignmentStatus]    = useState('')
  const [currentPositionId,   setCurrentPositionId]   = useState('')
  const [currentDepartmentId, setCurrentDepartmentId] = useState('')
  const [currentGradeId,      setCurrentGradeId]      = useState('')
  const [currentLocationId,   setCurrentLocationId]   = useState('')
  const [lineManagerId,       setLineManagerId]       = useState('')
  const [projectId,           setProjectId]           = useState('')
  const [allocationPercentage, setAllocationPercentage] = useState('')
  const [projectOptions,      setProjectOptions]      = useState<PicklistOption[]>([])
  // Track whether the user explicitly changed the project field so we never
  // silently clear a previously-saved project when only other fields are saved.
  const [projectChanged, setProjectChanged] = useState(false)

  // ── Documents ────────────────────────────────────────────────────────────
  const [emiratesId,       setEmiratesId]       = useState('')
  const [emiratesIdExpiry, setEmiratesIdExpiry] = useState('')
  const [passportNumber,   setPassportNumber]   = useState('')
  const [passportExpiry,   setPassportExpiry]   = useState('')
  const [visaNumber,       setVisaNumber]       = useState('')
  const [visaExpiry,       setVisaExpiry]       = useState('')
  const [labourCardNumber, setLabourCardNumber] = useState('')
  const [labourCardExpiry, setLabourCardExpiry] = useState('')

  // ── Load person detail + picklists when drawer opens ─────────────────────
  useEffect(() => {
    if (!person?.id) return

    setIsLoading(true)
    setActiveTab('personal')

    // Clear stale state immediately
    setFirstNameEn(''); setLastNameEn(''); setPreferredName('')
    setDateOfBirth(''); setGender(''); setMaritalStatus('')
    setNationalityCode(''); setReligion('')
    setAssignmentStatus(''); setCurrentPositionId(''); setCurrentDepartmentId('')
    setCurrentGradeId(''); setCurrentLocationId(''); setLineManagerId('')
    setProjectId(''); setAllocationPercentage(''); setProjectChanged(false)
    setEmiratesId(''); setEmiratesIdExpiry('')
    setPassportNumber(''); setPassportExpiry('')
    setVisaNumber(''); setVisaExpiry('')
    setLabourCardNumber(''); setLabourCardExpiry('')

    Promise.all([
      getPerson(person.id),
      getPersonPicklists(person.legalEntityId, person.id),
      getPersonCurrentProject(person.id),
    ])
      .then(([detail, picklists, currentProject]) => {
        if (!detail) return
        // Personal
        setFirstNameEn(detail.firstNameEn     ?? '')
        setLastNameEn(detail.lastNameEn       ?? '')
        setPreferredName(detail.preferredName ?? '')
        setDateOfBirth(detail.dateOfBirth     ?? '')
        setGender(detail.gender               ?? '')
        setMaritalStatus(detail.maritalStatus ?? '')
        setNationalityCode(detail.nationalityCode ?? '')
        setReligion(detail.religion           ?? '')
        // Employment
        setAssignmentStatus(detail.assignmentStatus    ?? '')
        setCurrentPositionId(detail.currentPositionId  ?? '')
        setCurrentDepartmentId(detail.currentDepartmentId ?? '')
        setCurrentGradeId(detail.currentGradeId        ?? '')
        setCurrentLocationId(detail.currentLocationId  ?? '')
        setLineManagerId(detail.lineManagerId           ?? '')
        // Project
        setProjectId(currentProject.projectId ?? '')
        setAllocationPercentage(currentProject.allocationPercentage ?? '')
        // Documents
        setEmiratesIdExpiry(detail.emiratesIdExpiry ?? '')
        setPassportExpiry(detail.passportExpiry     ?? '')
        setVisaNumber(detail.visaNumber             ?? '')
        setVisaExpiry(detail.visaExpiry             ?? '')
        setLabourCardNumber(detail.labourCardNumber ?? '')
        setLabourCardExpiry(detail.labourCardExpiry ?? '')
        // Picklists
        setPositionOptions(picklists.positions)
        setDepartmentOptions(picklists.departments)
        setGradeOptions(picklists.grades)
        setLocationOptions(picklists.locations)
        setManagerOptions(picklists.managers)
        setProjectOptions(picklists.projects)
      })
      .catch(err => {
        console.error('[PersonEditDrawer] load failed:', err)
        toast({ title: locale === 'ar' ? 'تعذّر تحميل بيانات الموظف' : 'Could not load employee data', description: err instanceof Error ? err.message : (locale === 'ar' ? 'يرجى الإغلاق والمحاولة مرة أخرى.' : 'Please close and try again.'), variant: 'destructive' })
      })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id])

  if (!person) return null

  // ── Save ─────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!person) return
    startTransition(async () => {
      const payload: Record<string, string | null | undefined> = {}

      if (firstNameEn.trim())   payload.firstNameEn   = firstNameEn.trim()
      if (lastNameEn.trim())    payload.lastNameEn    = lastNameEn.trim()
      if (preferredName.trim()) payload.preferredName = preferredName.trim()
      if (dateOfBirth)          payload.dateOfBirth   = dateOfBirth
      if (gender)               payload.gender        = gender
      if (maritalStatus)        payload.maritalStatus = maritalStatus
      if (nationalityCode)      payload.nationalityCode = nationalityCode.toUpperCase()
      if (religion.trim())      payload.religion      = religion.trim()

      // Assignment-sensitive fields are visible in this drawer but are not
      // patched here. Effective-dated changes go through lifecycle actions.

      payload.emiratesId       = emiratesId.trim()     || null
      payload.emiratesIdExpiry = emiratesIdExpiry      || null
      payload.passportNumber   = passportNumber.trim() || null
      payload.passportExpiry   = passportExpiry        || null
      payload.visaNumber       = visaNumber.trim()     || null
      payload.visaExpiry       = visaExpiry            || null
      payload.labourCardNumber = labourCardNumber.trim() || null
      payload.labourCardExpiry = labourCardExpiry      || null

      const [editResult, projectResult] = await Promise.all([
        updatePersonFromEdit(person.id, payload as Parameters<typeof updatePersonFromEdit>[1]),
        // Only send a project update if the user explicitly changed the field.
        // This prevents silently clearing a previously-saved project when only
        // unrelated fields (name, documents, etc.) are being saved.
        projectChanged
          ? updatePersonProject(
              person.id,
              projectId || null,
              allocationPercentage !== '' ? Number(allocationPercentage) : null,
            )
          : Promise.resolve({ success: true as const }),
      ])

      const editFailed = editResult && 'success' in editResult && editResult.success === false
      if (editFailed) {
        toast({ title: locale === 'ar' ? 'فشل الحفظ' : 'Save failed', description: (editResult as { error: string }).error, variant: 'destructive' })
        return
      }

      if (projectResult && 'error' in projectResult && projectResult.error) {
        toast({ title: locale === 'ar' ? 'فشل الحفظ' : 'Save failed', description: projectResult.error, variant: 'destructive' })
        return
      }

      if (projectResult && 'noAssignment' in projectResult && projectResult.noAssignment) {
        toast({
          title: locale === 'ar' ? 'تم تحديث الموظف' : 'Employee updated',
          description: locale === 'ar'
            ? 'تم حفظ التغييرات الأخرى. يتطلب تعيين المشروع وجود تعيين عمل نشط — أكمل إجراء التوظيف أولاً.'
            : 'Other changes saved. Project assignment requires an active work assignment — complete the Hire action first.',
          variant: 'destructive',
        })
        onSaved(person.id)
        return
      }

      toast({ title: locale === 'ar' ? 'تم تحديث الموظف' : 'Employee updated', description: locale === 'ar' ? `تم حفظ التغييرات لـ ${person.fullNameEn ?? person.personNumber}.` : `Changes saved for ${person.fullNameEn ?? person.personNumber}.` })
      onSaved(person.id)
    })
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button type="button" onClick={onClose} disabled={isPending} style={{
        padding: '9px 18px', fontSize: 'var(--text-body)', fontWeight: 500, borderRadius: 8,
        border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--ink-2)',
        cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.5 : 1,
      }}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      <button type="button" onClick={handleSave} disabled={isPending} style={{
        padding: '9px 18px', fontSize: 'var(--text-body)', fontWeight: 600, borderRadius: 8,
        border: 'none', background: 'var(--accent)', color: 'var(--card)',
        cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1, minWidth: 80,
      }}>{isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ' : 'Save')}</button>
    </div>
  )

  function ReadOnlyField({ label, value }: { label: string; value: string }) {
    return (
      <div style={fieldStyle}>
        <label style={sectionLabelStyle}>{label}</label>
        <input value={value} readOnly style={readOnlyInputStyle} tabIndex={-1} />
      </div>
    )
  }

  // ── Tab: Personal ────────────────────────────────────────────────────────
  const personalTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'الاسم الأول (EN)' : 'First Name (EN)'}</label>
          <input value={firstNameEn} onChange={e => setFirstNameEn(e.target.value)} placeholder={locale === 'ar' ? 'مثال: محمد' : 'e.g. Mohammed'} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'اسم العائلة (EN)' : 'Last Name (EN)'}</label>
          <input value={lastNameEn} onChange={e => setLastNameEn(e.target.value)} placeholder={locale === 'ar' ? 'مثال: المنصوري' : 'e.g. Al Mansouri'} style={inputStyle} />
        </div>
      </div>

      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'الاسم المفضّل' : 'Preferred Name'}</label>
          <input value={preferredName} onChange={e => setPreferredName(e.target.value)} placeholder={locale === 'ar' ? 'اسم العرض / اللقب' : 'Display / nickname'} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'تاريخ الميلاد' : 'Date of Birth'}</label>
          <DateInput value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'الجنس' : 'Gender'}</label>
          <select value={gender} onChange={e => setGender(e.target.value)} style={inputStyle}>
            <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
            <option value="MALE">{locale === 'ar' ? 'ذكر' : 'Male'}</option>
            <option value="FEMALE">{locale === 'ar' ? 'أنثى' : 'Female'}</option>
            <option value="OTHER">{locale === 'ar' ? 'أخرى' : 'Other'}</option>
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'الحالة الاجتماعية' : 'Marital Status'}</label>
          <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} style={inputStyle}>
            <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
            <option value="SINGLE">{locale === 'ar' ? 'أعزب' : 'Single'}</option>
            <option value="MARRIED">{locale === 'ar' ? 'متزوج' : 'Married'}</option>
            <option value="DIVORCED">{locale === 'ar' ? 'مطلّق' : 'Divorced'}</option>
            <option value="WIDOWED">{locale === 'ar' ? 'أرمل' : 'Widowed'}</option>
          </select>
        </div>
      </div>

      <div style={gridStyle}>
        <div style={{ ...fieldStyle, position: 'relative' }}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'الجنسية' : 'Nationality'}</label>
          <NationalitySelect
            value={nationalityCode || null}
            onChange={code => {
              setNationalityCode(code)
              // Auto-derive category (not stored in drawer state but sent via full edit if needed)
              void deriveNationalityCategory(code)
            }}
          />
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'الديانة' : 'Religion'}</label>
          <input value={religion} onChange={e => setReligion(e.target.value)} placeholder={locale === 'ar' ? 'مثال: الإسلام' : 'e.g. Islam'} style={inputStyle} />
        </div>
      </div>

      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'رقم الجوال' : 'Mobile Number'}</label>
          <input value="" readOnly placeholder={locale === 'ar' ? 'يُدار عبر وحدة جهات الاتصال' : 'Managed via Contacts module'} style={readOnlyInputStyle} tabIndex={-1} />
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'البريد الإلكتروني الشخصي' : 'Personal Email'}</label>
          <input value="" readOnly placeholder={locale === 'ar' ? 'يُدار عبر وحدة جهات الاتصال' : 'Managed via Contacts module'} style={readOnlyInputStyle} tabIndex={-1} />
        </div>
      </div>

      <div style={{ marginTop: 8, padding: '14px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ ...sectionLabelStyle, marginBottom: 0 }}>{locale === 'ar' ? 'حقول للقراءة فقط' : 'Read-only Fields'}</span>
        <div style={gridStyle}>
          <ReadOnlyField label={locale === 'ar' ? 'رقم الموظف' : 'Employee Number'} value={person.personNumber ?? '—'} />
          <ReadOnlyField label={locale === 'ar' ? 'تاريخ التعيين' : 'Hire Date'}        value={person.hireDate ?? '—'}     />
        </div>
      </div>
    </div>
  )

  // ── Tab: Employment ──────────────────────────────────────────────────────
  const employmentTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={fieldStyle}>
        <label style={sectionLabelStyle}>{locale === 'ar' ? 'حالة التعيين' : 'Assignment Status'}</label>
        <select value={assignmentStatus} onChange={e => setAssignmentStatus(e.target.value)} disabled style={readOnlyInputStyle}>
          <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
          <option value="ACTIVE">{locale === 'ar' ? 'نشط' : 'Active'}</option>
          <option value="ON_LEAVE">{locale === 'ar' ? 'في إجازة' : 'On Leave'}</option>
          <option value="SUSPENDED">{locale === 'ar' ? 'موقوف' : 'Suspended'}</option>
          <option value="PENDING_HIRE">{locale === 'ar' ? 'قيد التوظيف' : 'Pending Hire'}</option>
          <option value="TERMINATED">{locale === 'ar' ? 'منتهٍ' : 'Terminated'}</option>
          <option value="INACTIVE">{locale === 'ar' ? 'غير نشط' : 'Inactive'}</option>
        </select>
      </div>

      <div style={gridStyle}>
        <PickSelect label={locale === 'ar' ? 'المنصب' : 'Position'}   value={currentPositionId}   onChange={setCurrentPositionId}   options={positionOptions}   placeholder={locale === 'ar' ? '— اختر المنصب —' : '— Select position —'} disabled />
        <PickSelect label={locale === 'ar' ? 'القسم' : 'Department'} value={currentDepartmentId} onChange={setCurrentDepartmentId} options={departmentOptions} placeholder={locale === 'ar' ? '— اختر القسم —' : '— Select department —'} disabled />
      </div>
      <div style={gridStyle}>
        <PickSelect label={locale === 'ar' ? 'الدرجة' : 'Grade'}          value={currentGradeId}    onChange={setCurrentGradeId}    options={gradeOptions}    placeholder={locale === 'ar' ? '— اختر الدرجة —' : '— Select grade —'} disabled />
        <PickSelect label={locale === 'ar' ? 'موقع العمل' : 'Work Location'}  value={currentLocationId} onChange={setCurrentLocationId} options={locationOptions} placeholder={locale === 'ar' ? '— اختر الموقع —' : '— Select location —'} disabled />
      </div>
      <PickSelect label={locale === 'ar' ? 'المدير المباشر' : 'Line Manager'} value={lineManagerId} onChange={setLineManagerId} options={managerOptions} placeholder={locale === 'ar' ? '— اختر المدير —' : '— Select manager —'} disabled />
      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'المشروع' : 'Project'} <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
          <select value={projectId} onChange={e => { setProjectId(e.target.value); setProjectChanged(true) }} style={inputStyle}>
            <option value="">{locale === 'ar' ? '— بلا مشروع —' : '— No project —'}</option>
            {projectOptions.map(p => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{locale === 'ar' ? 'نسبة التخصيص %' : 'Allocation %'} <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>(0–100)</span></label>
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            value={allocationPercentage}
            onChange={e => { setAllocationPercentage(e.target.value); setProjectChanged(true) }}
            disabled={!projectId}
            placeholder="100"
            style={{ ...inputStyle, opacity: !projectId ? 0.5 : 1 }}
          />
        </div>
      </div>
    </div>
  )

  // ── Tab: Documents ───────────────────────────────────────────────────────
  function DocRow({
    label1, label2, value1, setValue1, value2, setValue2,
    isDateField2 = false, isExpiry2 = false,
  }: {
    label1: string; label2: string
    value1: string; setValue1: (v: string) => void
    value2: string; setValue2: (v: string) => void
    isDateField2?: boolean; isExpiry2?: boolean
  }) {
    return (
      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{label1}</label>
          <input value={value1} onChange={e => setValue1(e.target.value)} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label style={sectionLabelStyle}>{label2}</label>
          <input type={isDateField2 ? 'date' : 'text'} value={value2} onChange={e => setValue2(e.target.value)} style={inputStyle} />
          {isExpiry2 && value2 && <ExpiryWarning value={value2} />}
        </div>
      </div>
    )
  }

  const documentsTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DocRow label1={locale === 'ar' ? 'الهوية الإماراتية' : 'Emirates ID'} label2={locale === 'ar' ? 'انتهاء الهوية الإماراتية' : 'Emirates ID Expiry'} value1={emiratesId} setValue1={setEmiratesId} value2={emiratesIdExpiry} setValue2={setEmiratesIdExpiry} isDateField2 isExpiry2 />
      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '-8px 0 0' }}>{locale === 'ar' ? 'الهوية الإماراتية مشفّرة. اتركها فارغة للإبقاء على الحالية؛ أدخل قيمة جديدة للتحديث.' : 'Emirates ID is encrypted. Leave blank to keep existing; enter new value to update.'}</p>
      <DocRow label1={locale === 'ar' ? 'رقم جواز السفر' : 'Passport Number'} label2={locale === 'ar' ? 'انتهاء جواز السفر' : 'Passport Expiry'} value1={passportNumber} setValue1={setPassportNumber} value2={passportExpiry} setValue2={setPassportExpiry} isDateField2 isExpiry2 />
      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '-8px 0 0' }}>{locale === 'ar' ? 'رقم جواز السفر مشفّر. اتركه فارغاً للإبقاء على الحالي؛ أدخل قيمة جديدة للتحديث.' : 'Passport number is encrypted. Leave blank to keep existing; enter new value to update.'}</p>
      <DocRow label1={locale === 'ar' ? 'رقم التأشيرة' : 'Visa Number'} label2={locale === 'ar' ? 'انتهاء التأشيرة' : 'Visa Expiry'} value1={visaNumber} setValue1={setVisaNumber} value2={visaExpiry} setValue2={setVisaExpiry} isDateField2 isExpiry2 />
      <DocRow label1={locale === 'ar' ? 'رقم بطاقة العمل' : 'Labour Card #'} label2={locale === 'ar' ? 'انتهاء بطاقة العمل' : 'Labour Card Expiry'} value1={labourCardNumber} setValue1={setLabourCardNumber} value2={labourCardExpiry} setValue2={setLabourCardExpiry} isDateField2 isExpiry2 />
    </div>
  )

  // ── Loading skeleton ──────────────────────────────────────────────────────
  const loadingSkeleton = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
      {[1, 2, 3, 4].map(n => (
        <div data-responsive-grid="true" key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[0, 1].map(c => (
            <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ height: 11, width: '40%', borderRadius: 4, background: 'var(--border)', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <div style={{ height: 40, borderRadius: 8, background: 'var(--surface)', border: '1.5px solid var(--border)' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <MdmDrawer
      open={open}
      onClose={onClose}
      titleEn={`Edit — ${person.fullNameEn ?? person.personNumber}`}
      titleAr={`تعديل — ${person.fullNameAr ?? person.personNumber}`}
      footer={isLoading ? undefined : footer}
      width={600}
    >
      {isLoading ? loadingSkeleton : (
        <>
          <TabBar active={activeTab} onChange={setActiveTab} />
          {activeTab === 'personal'   && personalTab}
          {activeTab === 'employment' && employmentTab}
          {activeTab === 'documents'  && documentsTab}
        </>
      )}
    </MdmDrawer>
  )
}
