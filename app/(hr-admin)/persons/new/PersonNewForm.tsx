'use client'

import React, { useState, useTransition, useEffect, useRef, type FormEvent } from 'react'
import { FormErrorSummary } from '@/components/forms/FormErrorSummary'
import { useRouter } from 'next/navigation'
import {
  User, CreditCard, Briefcase, ShieldCheck, AlertTriangle, Clock,
  Hash, AlertCircle, Check,
} from 'lucide-react'
import {
  CalendarDate, toCalendar, IslamicUmalquraCalendar, GregorianCalendar, parseDate,
} from '@internationalized/date'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { DateInput } from '@/components/forms/DateInput'
import { NationalitySelect, deriveNationalityCategory } from '@/components/forms/NationalitySelect'
import { DraftSaveIndicator } from '@/components/ui/DraftRestoreBanner'
import { useDraftSave } from '@/hooks/useDraftSave'
import { createPerson, upsertPersonEmergencyContact, upsertPersonHomeAddress, upsertPersonEducation, uploadProfilePhoto } from '@/modules/core-hr'
import { triggerBackdatedHireApproval } from '@/modules/workflow/actions'
import { diffDays, addMonths, countUaeWorkingDays, monthsUntil } from '@/lib/person-form-helpers'
import type { CreatePersonInput } from '@/modules/core-hr'
import type { FieldDefinition, FormConfig } from '@/lib/config-resolver'

// ── Picklist row shapes (server-fetched in page.tsx) ───────────────────────

type LegalEntityOpt = { id: string; code: string; nameEn: string; nameAr: string }
type DepartmentOpt  = { id: string; legalEntityId: string; code: string; nameEn: string; nameAr: string }
type JobOpt         = { id: string; code: string; titleEn: string; titleAr: string | null; isEmiratisationTarget: boolean }
type PositionOpt    = { id: string; departmentId: string | null; jobId: string | null; code: string; titleEn: string; titleAr: string | null; isOccupied: boolean }
type GradeOpt       = { id: string; legalEntityId: string | null; code: string; nameEn: string; nameAr: string | null; level: number | null }
type LocationOpt    = { id: string; legalEntityId: string; code: string; nameEn: string; nameAr: string | null }
type ManagerOpt     = { id: string; personNumber: string; fullNameEn: string | null; legalEntityId: string; departmentNameEn: string | null }
type ProjectOpt     = { id: string; code: string; nameEn: string; nameAr: string | null }

// ME-4: prefill data from an approved hiring_request
export interface HiringRequestPrefill {
  hiringRequestId: string
  positionId:      string
  departmentId:    string
  positionTitle:   string
  departmentName:  string
}

interface Props {
  defaultLegalEntityId: string
  legalEntities: LegalEntityOpt[]
  departments:   DepartmentOpt[]
  jobs:          JobOpt[]
  positions:     PositionOpt[]
  grades:        GradeOpt[]
  locations:     LocationOpt[]
  managers:      ManagerOpt[]
  projects:      ProjectOpt[]
  formConfig:    FormConfig
  customFields:  FieldDefinition[]
  currentUserId: string   // for draft key scoping
  hiringRequestPrefill?: HiringRequestPrefill
}

// Match the union in validations.ts
type EmploymentType      = 'FULL_TIME' | 'PART_TIME' | 'TEMPORARY' | 'TASK_BASED' | 'FLEXIBLE' | 'REMOTE' | 'SHARED'
type WorkerCategory      = 'FTE' | 'CONTINGENT' | 'CONTRACTOR'
type Gender              = 'MALE' | 'FEMALE' | 'NOT_SPECIFIED'
type MaritalStatus       = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'NOT_SPECIFIED'
type NationalityCategory = 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT'
type VisaStatus          = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED'

// ── Helpers ───────────────────────────────────────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10)

/** Format a Gregorian ISO string to Hijri YYYY-MM-DD */
function toHijriIso(gregorianIso: string): string {
  try {
    const g = parseDate(gregorianIso)
    const h = toCalendar(g, new IslamicUmalquraCalendar())
    return `${String(h.year).padStart(4, '0')}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`
  } catch {
    return ''
  }
}

/** Format YYYY-MM-DD → "01 Nov 2026" */
function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return iso }
}

// ── Passport number validation ────────────────────────────────────────────

const PASSPORT_RE = /^[A-Z0-9]+$/i

// ── Initial state ─────────────────────────────────────────────────────────

interface FormState {
  // Identity
  firstNameEn:  string
  middleNameEn: string
  lastNameEn:   string
  fullNameAr:   string
  preferredName: string
  salutation:   string
  dateOfBirth:  string
  gender:       Gender
  maritalStatus: MaritalStatus
  numberOfDependents: number
  // Nationality
  nationalityCode:     string
  nationalityCategory: NationalityCategory
  religion:            string
  religionConsentGiven: boolean
  bloodType:           string
  // PII — DO NOT draft-save (PII_FIELDS in useDraftSave)
  emiratesId:        string
  emiratesIdExpiry:  string
  passportNumber:    string
  passportCountry:   string
  passportIssueDate: string
  passportExpiry:    string
  visaNumber:    string
  visaType:      string
  visaIssueDate: string
  visaExpiry:    string
  visaStatus:    VisaStatus | ''
  labourCardNumber:        string
  labourCardExpiry:        string
  mohreLabourPermitNumber: string
  familyBookNumber:        string
  nafisRegistrationNumber: string
  // Employment
  legalEntityId:          string
  employmentType:         EmploymentType
  workerCategory:         WorkerCategory | ''
  employeeCode:           string
  contractedHoursPerWeek: number
  hireDate:               string
  probationMonths:        number   // 1–6; drives probationEndDate
  noticePeriodDays:       number
  currentDepartmentId:  string
  currentPositionId:    string
  currentJobId:         string
  currentLocationId:    string
  currentGradeId:       string
  lineManagerId:         string
  dottedLineManagerId:   string
  projectId:             string
  allocationPercentage:  string
  // Backdating reason (optional)
  backdatingReason: string
  // PDPL consent
  pdplConsentGiven:     boolean
  sensitiveDataConsent: boolean
  // Custom fields
  extraData: Record<string, unknown>
  // Additional Info — Emergency Contact
  ecName:         string
  ecRelationship: string
  ecPhone:        string
  // Additional Info — Home Address
  haLine1:      string
  haLine2:      string
  haCity:       string
  haState:      string
  haCountry:    string
  haPostalCode: string
  haPoBox:      string
  // Additional Info — Highest Qualification
  eduInstitution: string
  eduDegree:      string
  eduField:       string
  eduCountry:     string
  eduStartYear:   string
  eduGradYear:    string
  eduIsHighest:   boolean
}

const initialState = (
  defaultLegalEntityId: string,
  prefill?: HiringRequestPrefill,
): FormState => ({
  firstNameEn: '', middleNameEn: '', lastNameEn: '', fullNameAr: '',
  preferredName: '', salutation: '', dateOfBirth: '', gender: 'NOT_SPECIFIED',
  maritalStatus: 'NOT_SPECIFIED', numberOfDependents: 0,
  nationalityCode: 'ARE', nationalityCategory: 'UAE_NATIONAL',
  religion: '', religionConsentGiven: false, bloodType: '',
  emiratesId: '', emiratesIdExpiry: '',
  passportNumber: '', passportCountry: 'ARE', passportIssueDate: '', passportExpiry: '',
  visaNumber: '', visaType: '', visaIssueDate: '', visaExpiry: '', visaStatus: '',
  labourCardNumber: '', labourCardExpiry: '', mohreLabourPermitNumber: '',
  familyBookNumber: '', nafisRegistrationNumber: '',
  legalEntityId: defaultLegalEntityId,
  employmentType: 'FULL_TIME', workerCategory: '', employeeCode: '',
  contractedHoursPerWeek: 48,
  hireDate: todayIso(), probationMonths: 6, noticePeriodDays: 30,
  // ME-4: pre-fill position/department from approved hiring request
  currentDepartmentId: prefill?.departmentId ?? '',
  currentPositionId:   prefill?.positionId   ?? '',
  currentJobId: '',
  currentLocationId: '', currentGradeId: '', lineManagerId: '',
  dottedLineManagerId: '',
  projectId: '', allocationPercentage: '',
  backdatingReason: '',
  pdplConsentGiven: false,
  sensitiveDataConsent: false,
  extraData: {},
  ecName: '', ecRelationship: '', ecPhone: '',
  haLine1: '', haLine2: '', haCity: '', haState: '', haCountry: '', haPostalCode: '', haPoBox: '',
  eduInstitution: '', eduDegree: '', eduField: '', eduCountry: '', eduStartYear: '', eduGradYear: '', eduIsHighest: true,
})

// ── Pending success state ─────────────────────────────────────────────────

interface PendingApprovalInfo {
  personId:        string
  personNumber:    string
  personFullName:  string
  lineManagerName: string | null
  hrHodFound:      boolean
  instanceId:      string
}

// ── Section wrapper helpers ───────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card)',
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "var(--border)",
      borderRightWidth: "1px",
      borderRightStyle: "solid",
      borderRightColor: "var(--border)",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--border)",
      borderLeftWidth: "4px",
      borderLeftStyle: "solid",
      borderLeftColor: "var(--accent)",
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon, title, arabic, badge }: {
  icon: React.ReactNode
  title: string
  arabic?: string
  badge?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      paddingBottom: 10,
      marginBottom: 12,
      borderBottom: '1px solid var(--border)',
    }}>
      {icon}
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{title}</span>
      {arabic && (
        <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>· {arabic}</span>
      )}
      {badge}
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)',
    marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
      <AlertCircle size={11} /> {message}
    </div>
  )
}

const inputStyle = (hasError?: boolean): React.CSSProperties => ({
  width: '100%', height: 40, boxSizing: 'border-box',
  border: `1px solid ${hasError ? 'var(--status-rejected-fg)' : 'var(--border)'}`,
  borderRadius: 8, padding: '0 12px', fontSize: 'var(--text-body)',
  color: 'var(--ink-1)', background: 'var(--card)', outline: 'none',
})

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-1)',
  marginBottom: 6,
}

// ── Stepper config ────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Personal Info',    labelAr: 'البيانات الشخصية' },
  { label: 'Employment',       labelAr: 'التوظيف' },
  { label: 'Documents',        labelAr: 'الوثائق' },
  { label: 'Additional Info',  labelAr: 'معلومات إضافية' },
  { label: 'Review & Consent', labelAr: 'المراجعة والموافقة' },
] as const

// ── Main component ────────────────────────────────────────────────────────

export function PersonNewForm({
  defaultLegalEntityId, legalEntities, departments, jobs, positions, grades,
  locations, managers, projects, formConfig, customFields, currentUserId,
  hiringRequestPrefill,
}: Props) {
  const [state, setState]   = useState<FormState>(initialState(defaultLegalEntityId, hiringRequestPrefill))
  const [pending, start]    = useTransition()
  const { toast }           = useToast()
  const locale              = useLocale()
  const router              = useRouter()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // Photo upload — stored outside FormState (File is not serialisable for draft-save)
  const photoFileRef              = useRef<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>('')

  // Auto-set category indicator pill
  const [autoSetLabel, setAutoSetLabel] = useState<string | null>(null)
  const autoSetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pending approval success state
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalInfo | null>(null)

  // Stepper
  const [step, setStep]       = useState(0)
  const [visited, setVisited] = useState<Set<number>>(new Set([0]))

  // Draft save
  const draft = useDraftSave(
    `new-employee:${currentUserId}`,
    state,
    currentUserId,
    { expiryHours: 48 },
  )
  const [bannerVisible, setBannerVisible] = useState(false)
  useEffect(() => {
    if (draft.hasDraft) setBannerVisible(true)
  }, [draft.hasDraft])

  // Unsaved changes warning
  const [isDirty, setIsDirty] = useState(false)
  useEffect(() => {
    if (!isDirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // ── Scope-filtered lists ───────────────────────────────────────────────

  const scoped             = state.legalEntityId
  const visibleDepartments = departments.filter(d => d.legalEntityId === scoped)
  const visibleLocations   = locations.filter(l   => l.legalEntityId === scoped)
  const visibleGrades      = grades.filter(g => !g.legalEntityId || g.legalEntityId === scoped)
  const visiblePositions   = positions.filter(p =>
    // Department filter: show all if no dept selected, or match selected dept.
    (!state.currentDepartmentId || p.departmentId === state.currentDepartmentId) &&
    // M7: cross-check against visibleDepartments so positions from departments
    // that are no longer in scope (stale page load, deactivated dept) are excluded.
    (!p.departmentId || visibleDepartments.some(d => d.id === p.departmentId)),
  )
  // Only show managers from the selected legal entity so the new-hire and edit
  // forms are consistent — prevents selecting a cross-entity manager that would
  // then fail to appear in edit mode (which always filters by entity).
  const visibleManagers    = managers.filter(m => m.legalEntityId === scoped)

  // ── Computed values ────────────────────────────────────────────────────

  // Project is stored on worker_assignments (not persons). A worker_assignment
  // row is only created when BOTH currentPositionId AND currentDepartmentId are
  // present (departmentId is NOT NULL in the schema). Without both, project
  // selection is meaningless — the value would be silently discarded at save.
  const projectEnabled = !!state.currentPositionId && !!state.currentDepartmentId

  const probationEndDate = state.hireDate
    ? addMonths(state.hireDate, state.probationMonths)
    : ''

  const probationHijri = probationEndDate ? toHijriIso(probationEndDate) : ''

  const probationWorkingDays = state.hireDate && probationEndDate
    ? countUaeWorkingDays(state.hireDate, probationEndDate)
    : 0

  const backdatingDays   = state.hireDate ? diffDays(state.hireDate) : 0
  const requiresApproval = backdatingDays > 30

  const passportExpiryMonths = state.passportExpiry ? monthsUntil(state.passportExpiry) : null
  const passportExpired      = passportExpiryMonths !== null && passportExpiryMonths < 0
  const passportCritical     = passportExpiryMonths !== null && passportExpiryMonths >= 0 && passportExpiryMonths < 6
  const passportWarning      = passportExpiryMonths !== null && passportExpiryMonths >= 6 && passportExpiryMonths < 12

  const passportRequired  = state.nationalityCode !== 'ARE'

  const lineManagerName = managers.find(m => m.id === state.lineManagerId)?.fullNameEn ?? null

  // ── Patch helpers ──────────────────────────────────────────────────────

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState(s => ({ ...s, [key]: value }))
    setIsDirty(true)
  }

  function patchExtra(key: string, value: unknown) {
    setState(s => ({ ...s, extraData: { ...s.extraData, [key]: value } }))
    setIsDirty(true)
  }

  // ── Stepper navigation ─────────────────────────────────────────────────

  function validateStep(s: number): Record<string, string> {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!state.firstNameEn.trim()) e.firstNameEn = locale === 'ar' ? 'مطلوب' : 'Required'
      if (!state.lastNameEn.trim())  e.lastNameEn  = locale === 'ar' ? 'مطلوب' : 'Required'
      // fullNameAr is auto-populated by server translation; only block submit if
      // the field is still blank AND translation was not in progress
      if (!state.fullNameAr.trim() && !arTranslating)
        e.fullNameAr = locale === 'ar' ? 'الاسم بالعربية مطلوب — أدخله يدوياً إذا تعذّرت الترجمة التلقائية' : 'Arabic name required — enter manually if auto-translation is unavailable'
      if (!state.dateOfBirth)        e.dateOfBirth  = locale === 'ar' ? 'مطلوب' : 'Required'
    }
    if (s === 1) {
      if (!state.hireDate)      e.hireDate      = locale === 'ar' ? 'مطلوب' : 'Required'
      if (!state.lineManagerId) e.lineManagerId = locale === 'ar' ? 'مطلوب — لا يمكن توجيه طلبات الإجازة بدون مدير مباشر' : 'Required — leave requests cannot be routed without a line manager'
      // Project is stored on the worker assignment row, which requires both
      // Position and Department. Block the step if the user has selected a
      // project but the required assignment context is missing.
      if (state.projectId && !projectEnabled) {
        e.projectId = locale === 'ar' ? 'يجب اختيار منصب وقسم قبل تعيين مشروع' : 'A position and department must be selected before assigning a project'
      }
    }
    return e
  }

  function goNext() {
    const stepErrors = validateStep(step)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})
    const next = step + 1
    setStep(next)
    setVisited(v => new Set([...v, next]))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goBack() {
    setErrors({})
    setStep(s => s - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Nationality select handler ─────────────────────────────────────────

  function onNationalityChange(code: string) {
    const category = deriveNationalityCategory(code)
    const catLabel = category === 'UAE_NATIONAL' ? (locale === 'ar' ? 'مواطن إماراتي' : 'UAE National')
      : category === 'GCC_NATIONAL' ? (locale === 'ar' ? 'مواطن خليجي' : 'GCC National')
      : (locale === 'ar' ? 'وافد' : 'Expat')

    setState(s => ({
      ...s,
      nationalityCode:     code,
      nationalityCategory: category,
      passportCountry: s.passportCountry === '' || s.passportCountry === s.nationalityCode
        ? code
        : s.passportCountry,
    }))
    setIsDirty(true)

    if (autoSetTimerRef.current) clearTimeout(autoSetTimerRef.current)
    setAutoSetLabel(locale === 'ar' ? `تعيين تلقائي: ${catLabel}` : `Auto-set to ${catLabel}`)
    autoSetTimerRef.current = setTimeout(() => setAutoSetLabel(null), 3_000)
  }

  // ── Passport number auto-uppercase ────────────────────────────────────

  function onPassportNumberChange(raw: string) {
    patch('passportNumber', raw.toUpperCase())
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    const nextErrors: Record<string, string> = {}

    if (passportRequired && !state.passportNumber.trim()) {
      nextErrors['passportNumber'] = locale === 'ar' ? 'رقم جواز السفر مطلوب لغير مواطني الإمارات' : 'Passport number is required for non-UAE nationals'
    } else if (state.passportNumber && !PASSPORT_RE.test(state.passportNumber)) {
      nextErrors['passportNumber'] = locale === 'ar' ? 'يُسمح بالأحرف والأرقام فقط' : 'Only letters and numbers allowed'
    }

    if (state.passportNumber && !state.passportExpiry) {
      nextErrors['passportExpiry'] = locale === 'ar' ? 'تاريخ انتهاء جواز السفر مطلوب' : 'Passport expiry date is required'
    }

    if (state.passportExpiry && passportExpired) {
      nextErrors['passportExpiry'] = locale === 'ar' ? 'انتهت صلاحية جواز السفر — قد لا يكون الموظف مؤهلاً للعمل' : 'Passport has expired — employee may not be eligible to work'
    }

    if (!state.pdplConsentGiven) {
      nextErrors['pdplConsentGiven'] = locale === 'ar' ? 'يجب الحصول على موافقة الموظف قبل إنشاء السجل (المادة 11 من قانون حماية البيانات الإماراتي)' : 'Employee consent must be obtained before creating a record (UAE PDPL Article 11)'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    const undefIfEmpty = <T,>(v: T | '' | undefined | null) =>
      v === '' || v == null ? undefined : v

    // BR-HIRE: new hires always start as PENDING_HIRE regardless of approval routing
    const assignmentStatus = 'PENDING_HIRE'
    const fullNameEn = [state.firstNameEn, state.middleNameEn, state.lastNameEn]
      .filter(Boolean).join(' ')

    const input: CreatePersonInput = {
      firstNameEn:   state.firstNameEn,
      middleNameEn:  undefIfEmpty(state.middleNameEn),
      lastNameEn:    state.lastNameEn,
      fullNameAr:    state.fullNameAr,
      preferredName: undefIfEmpty(state.preferredName),
      salutation:    undefIfEmpty(state.salutation),
      dateOfBirth:   state.dateOfBirth,
      gender:        state.gender,
      maritalStatus: state.maritalStatus,
      numberOfDependents: state.numberOfDependents,
      nationalityCode:      state.nationalityCode.toUpperCase(),
      nationalityCategory:  state.nationalityCategory,
      religion:             undefIfEmpty(state.religion),
      religionConsentGiven: state.religionConsentGiven,
      bloodType:            (undefIfEmpty(state.bloodType) as CreatePersonInput['bloodType']) ?? null,
      emiratesId:        undefIfEmpty(state.emiratesId),
      emiratesIdExpiry:  undefIfEmpty(state.emiratesIdExpiry),
      passportNumber:    undefIfEmpty(state.passportNumber),
      passportCountry:   undefIfEmpty(state.passportCountry?.toUpperCase()),
      passportIssueDate: undefIfEmpty(state.passportIssueDate),
      passportExpiry:    undefIfEmpty(state.passportExpiry),
      visaNumber:    undefIfEmpty(state.visaNumber),
      visaType:      undefIfEmpty(state.visaType),
      visaIssueDate: undefIfEmpty(state.visaIssueDate),
      visaExpiry:    undefIfEmpty(state.visaExpiry),
      visaStatus:    undefIfEmpty(state.visaStatus) as CreatePersonInput['visaStatus'],
      labourCardNumber:        undefIfEmpty(state.labourCardNumber),
      labourCardExpiry:        undefIfEmpty(state.labourCardExpiry),
      mohreLabourPermitNumber: undefIfEmpty(state.mohreLabourPermitNumber),
      familyBookNumber:        undefIfEmpty(state.familyBookNumber),
      nafisRegistrationNumber: undefIfEmpty(state.nafisRegistrationNumber),
      legalEntityId:          state.legalEntityId,
      employmentType:         state.employmentType,
      workerCategory:         (undefIfEmpty(state.workerCategory) as CreatePersonInput['workerCategory']) ?? null,
      employeeCode:           undefIfEmpty(state.employeeCode) ?? null,
      contractedHoursPerWeek: state.contractedHoursPerWeek,
      assignmentStatus,
      hireDate:                state.hireDate,
      probationEndDate:        undefIfEmpty(probationEndDate),
      probationMonthsGranted:  state.probationMonths,
      noticePeriodDays:        state.noticePeriodDays,
      currentDepartmentId:     undefIfEmpty(state.currentDepartmentId),
      currentPositionId:       undefIfEmpty(state.currentPositionId),
      currentJobId:            undefIfEmpty(state.currentJobId),
      currentLocationId:       undefIfEmpty(state.currentLocationId),
      currentGradeId:          undefIfEmpty(state.currentGradeId),
      lineManagerId:           undefIfEmpty(state.lineManagerId),
      dottedLineManagerId:     undefIfEmpty(state.dottedLineManagerId),
      projectId:               undefIfEmpty(state.projectId),
      allocationPercentage:    state.allocationPercentage !== '' ? Number(state.allocationPercentage) : undefined,
      preferredLanguage:       'en',
      notificationChannel:     'PUSH_AND_EMAIL',
      pdplConsentGiven:        state.pdplConsentGiven,
      sensitiveDataConsent:    state.sensitiveDataConsent,
      extraData: state.extraData,
    }

    start(async () => {
      try {
        const result = await createPerson(input)
        draft.clearDraft()
        setIsDirty(false)

        // ── Post-creation: save additional-info records using the new personId ──

        // Photo upload (non-blocking — person is already saved if this fails)
        if (photoFileRef.current) {
          try {
            const fd = new FormData()
            fd.append('photo', photoFileRef.current)
            await uploadProfilePhoto(result.id, fd)
          } catch (photoErr) {
            console.warn('[PersonNewForm] Photo upload failed (non-fatal):', photoErr)
            toast({ title: locale === 'ar' ? 'لم يتم رفع الصورة' : 'Photo not uploaded', description: locale === 'ar' ? 'تم إنشاء الموظف — يمكن إضافة الصورة عبر نموذج التعديل.' : 'Employee created — photo can be added via the edit form.', variant: 'destructive' })
          }
        }

        // Emergency contact
        if (state.ecName.trim() && state.ecPhone.trim()) {
          const ecRes = await upsertPersonEmergencyContact(result.id, {
            contactNameEn: state.ecName.trim(),
            relationship:  state.ecRelationship || 'OTHER',
            phonePrimary:  state.ecPhone.trim(),
          })
          if (!ecRes.success) console.warn('[PersonNewForm] Emergency contact save failed:', ecRes.error)
        }

        // Home address
        if (state.haLine1.trim() && state.haCity.trim() && state.haCountry.trim()) {
          const haRes = await upsertPersonHomeAddress(result.id, {
            addressLine1: state.haLine1.trim(),
            addressLine2: state.haLine2.trim() || null,
            city:         state.haCity.trim(),
            stateEmirate: state.haState.trim() || null,
            country:      state.haCountry.trim().toUpperCase(),
            postalCode:   state.haPostalCode.trim() || null,
            poBox:        state.haPoBox.trim() || null,
          })
          if (!haRes.success) console.warn('[PersonNewForm] Home address save failed:', haRes.error)
        }

        // Education
        if (state.eduInstitution.trim()) {
          const eduRes = await upsertPersonEducation(result.id, {
            institutionName: state.eduInstitution.trim(),
            degreeType:      state.eduDegree.trim() || null,
            fieldOfStudy:    state.eduField.trim() || null,
            country:         state.eduCountry.trim().toUpperCase() || null,
            startYear:       state.eduStartYear ? parseInt(state.eduStartYear, 10) : null,
            graduationYear:  state.eduGradYear  ? parseInt(state.eduGradYear,  10) : null,
            isHighestDegree: state.eduIsHighest,
          })
          if (!eduRes.success) console.warn('[PersonNewForm] Education save failed:', eduRes.error)
        }

        if (requiresApproval) {
          const wfResult = await triggerBackdatedHireApproval({
            personId:       result.id,
            personNumber:   result.personNumber,
            personFullName: fullNameEn,
            hireDate:       state.hireDate,
            legalEntityId:  state.legalEntityId,
            lineManagerId:  undefIfEmpty(state.lineManagerId) ?? null,
            backdatingDays,
            reason:         undefIfEmpty(state.backdatingReason),
          })

          setPendingApproval({
            personId:        result.id,
            personNumber:    result.personNumber,
            personFullName:  fullNameEn,
            lineManagerName: wfResult.lineManagerName,
            hrHodFound:      wfResult.hrHodFound,
            instanceId:      wfResult.instanceId,
          })
        } else {
          toast({
            title: locale === 'ar' ? 'تم إنشاء الموظف' : 'Person created',
            description: locale === 'ar'
              ? `تم حفظ ${result.personNumber}. حقول البيانات الشخصية مُشفّرة.`
              : `${result.personNumber} saved. PII fields encrypted.`,
          })
          router.push(`/persons/${result.id}`)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')
        console.error('[PersonNewForm] createPerson failed:', err)
        toast({
          title: locale === 'ar' ? 'تعذّر إنشاء الموظف' : 'Could not create person',
          description: message,
          variant: 'destructive',
        })
        if (message.startsWith('[')) {
          try {
            const issues = JSON.parse(message) as Array<{ path: string[]; message: string }>
            const next: Record<string, string> = {}
            for (const i of issues) next[i.path.join('.')] = i.message
            setErrors(next)
          } catch (parseErr) {
            console.error('[PersonNewForm] Failed to parse Zod error JSON:', parseErr)
          }
        }
      }
    })
  }

  // ── Pending approval success screen ───────────────────────────────────

  if (pendingApproval) {
    const { personNumber, personFullName, lineManagerName: mgr, hrHodFound } = pendingApproval
    return (
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 32px',
        maxWidth: 560,
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent-050)',
          display: 'grid', placeItems: 'center',
          margin: '0 auto 20px',
          color: 'var(--brand-active)',
        }}>
          <Clock size={24} strokeWidth={1.75} />
        </div>
        <h2 style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500,
          color: 'var(--ink-1)', margin: '0 0 8px',
        }}>
          {locale === 'ar' ? 'قيد الموافقة' : 'Pending Approval'}
        </h2>
        <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)',
        marginBottom: 24 }}>
          <strong>{personFullName}</strong> — {personNumber}
          <span style={{
            display: 'inline-block',
            marginLeft: 8,
            background: 'var(--status-draft-bg)', color: 'var(--status-draft-fg)',
            border: '1px solid var(--border)',
            borderRadius: 999, padding: '2px 8px',
            fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
          }}>
            {locale === 'ar' ? 'قيد الموافقة' : 'Pending Approval'}
          </span>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '16px 20px',
          textAlign: 'left',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.8px',
          marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
            {locale === 'ar' ? 'بانتظار الموافقة من' : 'Awaiting approval from'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
              <Clock size={14} style={{ color: 'var(--brand-active)' }} />
              {mgr
                ? (locale === 'ar' ? `${mgr} (المدير المباشر) — تم الإشعار` : `${mgr} (Line Manager) — notified`)
                : (locale === 'ar' ? 'المدير المباشر — تم الإشعار' : 'Line Manager — notified')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
              <Clock size={14} style={{ color: 'var(--brand-active)' }} />
              {hrHodFound
                ? (locale === 'ar' ? 'مدير الموارد البشرية — تم الإشعار' : 'HR Head of Department — notified')
                : (locale === 'ar' ? 'مسؤول الموارد البشرية (لا يوجد مدير موارد بشرية مُهيّأ) — تم الإشعار' : 'HR Admin (no HR HOD configured) — notified')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Button variant="outline" onClick={() => router.push(`/persons/${pendingApproval.personId}`)}>
            {locale === 'ar' ? 'عرض السجل' : 'View Record'}
          </Button>
          <Button onClick={() => { setPendingApproval(null); setState(initialState(defaultLegalEntityId)) }}>
            {locale === 'ar' ? 'إضافة موظف آخر' : 'Add Another Employee'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Custom fields section renderer ─────────────────────────────────────

  const customFieldsBySection = customFields.reduce<Record<string, FieldDefinition[]>>(
    (acc, f) => {
      const key = f.sectionCode ?? 'CUSTOM'
      acc[key] ??= []
      acc[key].push(f)
      return acc
    },
    {},
  )

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
      <FormErrorSummary errors={errors} />

      {/* ── ME-4: hiring request prefill notice ────────────────────────── */}
      {hiringRequestPrefill && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px',
          marginBottom: 10,
          background: 'var(--accent-050)', border: '1px solid var(--accent-200)', borderRadius: 7,
          fontSize: 'var(--text-caption)', color: 'var(--ink-2)',
        }}>
          <span style={{ flex: 1 }}>
            {locale === 'ar'
              ? <>مُعبّأ مسبقاً من طلب توظيف معتمد · <strong>{hiringRequestPrefill.positionTitle}</strong> في <strong>{hiringRequestPrefill.departmentName}</strong></>
              : <>Pre-filled from approved hiring request · <strong>{hiringRequestPrefill.positionTitle}</strong> in <strong>{hiringRequestPrefill.departmentName}</strong></>}
          </span>
        </div>
      )}

      {/* ── Compact draft banner ───────────────────────────────────────── */}
      {bannerVisible && draft.hasDraft && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 14px',
          marginBottom: 10,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
          fontSize: 'var(--text-caption)', color: 'var(--ink-2)',
        }}>
          <span style={{ flex: 1 }}>{locale === 'ar' ? 'مسودة غير محفوظة' : 'Unsaved draft'} · {draft.relativeTime}</span>
          <button type="button" onClick={() => { const saved = draft.restoreDraft(); if (saved) setState(s => ({ ...s, ...saved })); setBannerVisible(false) }}
            style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)', background: 'none', border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 10px', cursor: 'pointer' }}>
            {locale === 'ar' ? 'استعادة' : 'Restore'}
          </button>
          <button type="button" onClick={() => { draft.clearDraft(); setBannerVisible(false) }}
            style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
            {locale === 'ar' ? 'تجاهل' : 'Discard'}
          </button>
        </div>
      )}

      {/* ── Stepper + employee number badge ────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: i <= step ? 'var(--accent)' : 'var(--surface)',
                  border: `2px solid ${i <= step ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'grid', placeItems: 'center',
                  color: i <= step ? 'var(--card)' : 'var(--ink-4)',
                  fontSize: 'var(--text-caption)', fontWeight: 700,
                }}>
                  {i < step ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                </div>
                <span style={{
                  fontSize: 'var(--text-caption)', whiteSpace: 'nowrap',
                  color: i === step ? 'var(--brand-active)' : i < step ? 'var(--ink-2)' : 'var(--ink-4)',
                  fontWeight: i === step ? 600 : 400,
                }}>
                  {locale === 'ar' ? s.labelAr : s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2,
                  marginTop: 13,
                  marginLeft: 4,
                  marginRight: 4,
                  background: i < step ? 'var(--accent)' : 'var(--border)',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 6,
          background: 'var(--accent-050, var(--surface))',
          border: '1px solid var(--accent-200, var(--border))',
        }}>
          <Hash size={11} color="var(--accent)" strokeWidth={2} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)' }}>{locale === 'ar' ? 'يُعيَّن تلقائياً عند الحفظ' : 'Auto-assigned on save'}</span>
        </div>
      </div>

      {/* ── Step content — padded so the sticky footer never covers the last field */}
      <div style={{ paddingBottom: 80 }}>

      {/* ════════════════════════════════════════════════════════════════
          STEP 0 — Personal Information
          ════════════════════════════════════════════════════════════════ */}
      {step === 0 && (
        <SectionCard>
          <SectionHeader
            icon={<User size={16} color="var(--accent)" strokeWidth={1.75} />}
            title={locale === 'ar' ? 'المعلومات الشخصية' : 'Personal Information'}
            arabic={locale === 'ar' ? 'Personal Information' : 'المعلومات الشخصية'}
          />

          {/* Names EN — 3-col; onBlur triggers EN→AR auto-translation */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor="firstNameEn" style={labelStyle}>{locale === 'ar' ? 'الاسم الأول' : 'First Name'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span> <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>EN</span></label>
              <input id="firstNameEn" required value={state.firstNameEn}
                onChange={e => patch('firstNameEn', e.target.value)}
                onBlur={async () => {
                  const full = [state.firstNameEn, state.middleNameEn, state.lastNameEn].filter(Boolean).join(' ')
                  if (full && !state.fullNameAr) {
                    const ar = await autoTranslate(full)
                    if (ar) patch('fullNameAr', ar)
                  }
                }}
                disabled={pending} style={inputStyle(!!errors.firstNameEn)} />
              <FieldError message={errors.firstNameEn} />
            </div>
            <div>
              <label htmlFor="middleNameEn" style={labelStyle}>{locale === 'ar' ? 'الاسم الأوسط' : 'Middle Name'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span> <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>EN</span></label>
              <input id="middleNameEn" value={state.middleNameEn} onChange={e => patch('middleNameEn', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <div>
              <label htmlFor="lastNameEn" style={labelStyle}>{locale === 'ar' ? 'اسم العائلة' : 'Last Name'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span> <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>EN</span></label>
              <input id="lastNameEn" required value={state.lastNameEn}
                onChange={e => patch('lastNameEn', e.target.value)}
                onBlur={async () => {
                  const full = [state.firstNameEn, state.middleNameEn, state.lastNameEn].filter(Boolean).join(' ')
                  if (full && !state.fullNameAr) {
                    const ar = await autoTranslate(full)
                    if (ar) patch('fullNameAr', ar)
                  }
                }}
                disabled={pending} style={inputStyle(!!errors.lastNameEn)} />
              <FieldError message={errors.lastNameEn} />
            </div>
          </div>

          {/* Full Name AR — auto-populated from English name on blur */}
          <div style={{ marginTop: 16 }}>
            <label htmlFor="fullNameAr" style={labelStyle}>
              {locale === 'ar' ? 'الاسم الكامل' : 'Full Name'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span>{' '}
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>AR</span>
              {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginLeft: 8 }}>{locale === 'ar' ? 'جارٍ الترجمة التلقائية…' : 'Auto-translating…'}</span>}
            </label>
            <input id="fullNameAr" dir="rtl" lang="ar" required placeholder="سارة أحمد"
              value={state.fullNameAr} onChange={e => patch('fullNameAr', e.target.value)} disabled={pending || arTranslating}
              style={{ ...inputStyle(!!errors.fullNameAr), textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }} />
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
            marginTop: 3 }}>
              {locale === 'ar' ? 'يُملأ تلقائياً من الاسم بالإنجليزية — يمكنك التعديل مباشرة.' : 'Auto-populated from English name — you may edit directly.'}
            </div>
            <FieldError message={errors.fullNameAr} />
          </div>

          {/* DOB / Gender / Marital Status */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <HijriDatePicker label={locale === 'ar' ? 'تاريخ الميلاد' : 'Date of Birth'} required value={state.dateOfBirth} onChange={v => patch('dateOfBirth', v)} disabled={pending} />
              <FieldError message={errors.dateOfBirth} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الجنس' : 'Gender'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
              <Select value={state.gender} onValueChange={v => patch('gender', v as Gender)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{locale === 'ar' ? 'ذكر' : 'Male'}</SelectItem>
                  <SelectItem value="FEMALE">{locale === 'ar' ? 'أنثى' : 'Female'}</SelectItem>
                  <SelectItem value="NOT_SPECIFIED">{locale === 'ar' ? 'غير محدد' : 'Not specified'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الحالة الاجتماعية' : 'Marital Status'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
              <Select value={state.maritalStatus} onValueChange={v => patch('maritalStatus', v as MaritalStatus)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">{locale === 'ar' ? 'أعزب' : 'Single'}</SelectItem>
                  <SelectItem value="MARRIED">{locale === 'ar' ? 'متزوج' : 'Married'}</SelectItem>
                  <SelectItem value="DIVORCED">{locale === 'ar' ? 'مطلّق' : 'Divorced'}</SelectItem>
                  <SelectItem value="WIDOWED">{locale === 'ar' ? 'أرمل' : 'Widowed'}</SelectItem>
                  <SelectItem value="NOT_SPECIFIED">{locale === 'ar' ? 'غير محدد' : 'Not specified'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Nationality / Category / Dependents */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الجنسية' : 'Nationality'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
              <NationalitySelect id="nationalityCode" value={state.nationalityCode || null} onChange={onNationalityChange} required disabled={pending} error={errors['nationalityCode']} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 6 }}>
                <label style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)', margin: 0 }}>
                  {locale === 'ar' ? 'فئة الجنسية' : 'Nationality Category'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span>
                </label>
                {autoSetLabel && (
                  <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)', background: 'var(--accent-050)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{autoSetLabel}</span>
                )}
              </div>
              <Select value={state.nationalityCategory} onValueChange={v => { patch('nationalityCategory', v as NationalityCategory); setAutoSetLabel(null) }} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UAE_NATIONAL">{locale === 'ar' ? 'مواطن إماراتي' : 'UAE National'}</SelectItem>
                  <SelectItem value="GCC_NATIONAL">{locale === 'ar' ? 'مواطن خليجي' : 'GCC National'}</SelectItem>
                  <SelectItem value="EXPAT">{locale === 'ar' ? 'وافد' : 'Expat'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="numberOfDependents" style={labelStyle}>{locale === 'ar' ? 'عدد المعالين' : 'No. of Dependents'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
              <input id="numberOfDependents" type="number" min={0} max={20} value={state.numberOfDependents} onChange={e => patch('numberOfDependents', Number(e.target.value))} disabled={pending} style={inputStyle()} />
            </div>
          </div>

          {/* Preferred Name / Salutation */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="preferredName" style={labelStyle}>{locale === 'ar' ? 'الاسم المفضّل' : 'Preferred Name'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
              <input id="preferredName" value={state.preferredName} onChange={e => patch('preferredName', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'اللقب' : 'Salutation'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
              <Select value={state.salutation || undefined} onValueChange={v => patch('salutation', v)} disabled={pending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mr">Mr</SelectItem>
                  <SelectItem value="Ms">Ms</SelectItem>
                  <SelectItem value="Mrs">Mrs</SelectItem>
                  <SelectItem value="Dr">Dr</SelectItem>
                  <SelectItem value="Prof">Prof</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Religion + consent */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="religion" style={labelStyle}>{locale === 'ar' ? 'الديانة' : 'Religion'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
              <input id="religion" value={state.religion} onChange={e => patch('religion', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-end', gap: 8,
            paddingBottom: 8, fontSize: 'var(--text-caption)', color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={state.religionConsentGiven} onChange={e => patch('religionConsentGiven', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
              {locale === 'ar' ? 'تم الحصول على موافقة الديانة (PDPL — مطلوبة عند تسجيل الديانة)' : 'Religion consent given (PDPL — required if religion is recorded)'}
            </label>
          </div>

          {/* Blood Type — PDPL-sensitive; only saves when sensitive data consent is given */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'فصيلة الدم' : 'Blood Type'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري · حساسة وفق PDPL' : 'optional · PDPL-sensitive'})</span></label>
              <Select value={state.bloodType || undefined} onValueChange={v => patch('bloodType', v)} disabled={pending}>
                <SelectTrigger style={inputStyle()}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A_POS">A+</SelectItem>
                  <SelectItem value="A_NEG">A−</SelectItem>
                  <SelectItem value="B_POS">B+</SelectItem>
                  <SelectItem value="B_NEG">B−</SelectItem>
                  <SelectItem value="AB_POS">AB+</SelectItem>
                  <SelectItem value="AB_NEG">AB−</SelectItem>
                  <SelectItem value="O_POS">O+</SelectItem>
                  <SelectItem value="O_NEG">O−</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', alignSelf: 'flex-end',
            paddingBottom: 8, lineHeight: 1.4 }}>
              {locale === 'ar'
                ? 'يتطلب «موافقة البيانات الحساسة» في خطوة المراجعة. تُخزَّن فصيلة الدم ولكن لا تُعرض في القوائم العامة.'
                : 'Requires “Sensitive data consent” on the Review step. Blood type is stored but never shown in broad lists.'}
            </p>
          </div>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 1 — Employment Details
          ════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <>
          <SectionCard>
            <SectionHeader
              icon={<Briefcase size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'التوظيف' : 'Employment Details'}
              arabic={locale === 'ar' ? 'Employment Details' : 'التوظيف'}
            />

            {/* Legal Entity / Department */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'الجهة القانونية' : 'Legal Entity'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
                <Select value={state.legalEntityId} onValueChange={v => { patch('legalEntityId', v); patch('currentDepartmentId', ''); patch('currentPositionId', ''); patch('currentLocationId', ''); patch('currentGradeId', ''); patch('projectId', ''); patch('allocationPercentage', '') }} disabled={pending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {legalEntities.map(e => (<SelectItem key={e.id} value={e.id}>{e.code} — {e.nameEn}{e.nameAr ? ` · ${e.nameAr}` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'القسم' : 'Department'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select value={state.currentDepartmentId || undefined} onValueChange={v => { patch('currentDepartmentId', v); patch('currentPositionId', ''); patch('projectId', ''); patch('allocationPercentage', '') }} disabled={pending || visibleDepartments.length === 0}>
                  <SelectTrigger><SelectValue placeholder={visibleDepartments.length ? (locale === 'ar' ? 'اختر القسم' : 'Select department') : (locale === 'ar' ? 'لا توجد أقسام لهذه الجهة' : 'No departments for this entity')} /></SelectTrigger>
                  <SelectContent>
                    {visibleDepartments.map(d => (<SelectItem key={d.id} value={d.id}>{d.code} — {d.nameEn}{d.nameAr ? ` · ${d.nameAr}` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
                {visibleDepartments.length === 0 && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                  marginTop: 4 }}>
                    {locale === 'ar' ? 'لا توجد أقسام مُهيّأة لهذه الجهة.' : 'No departments configured for this entity.'}{' '}
                    <a href="/config/departments" style={{ color: 'var(--brand-active)', textDecoration: 'underline' }}>
                      {locale === 'ar' ? 'أنشئ الأقسام في البيانات الرئيسية ←' : 'Create departments in MDM →'}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Position / Grade */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginTop: 10 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'المنصب' : 'Position'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select value={state.currentPositionId || undefined} onValueChange={v => { patch('currentPositionId', v); const pos = positions.find(p => p.id === v); patch('currentJobId', pos?.jobId ?? ''); patch('projectId', ''); patch('allocationPercentage', '') }} disabled={pending || visiblePositions.length === 0}>
                  <SelectTrigger><SelectValue placeholder={visiblePositions.length ? (locale === 'ar' ? 'اختر المنصب' : 'Select position') : (locale === 'ar' ? 'لا توجد مناصب' : 'No positions')} /></SelectTrigger>
                  <SelectContent>
                    {visiblePositions.map(p => (<SelectItem key={p.id} value={p.id}>{p.code} — {p.titleEn}{p.isOccupied ? ' (occupied)' : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'الدرجة' : 'Grade'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select value={state.currentGradeId || undefined} onValueChange={v => patch('currentGradeId', v)} disabled={pending || visibleGrades.length === 0}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {visibleGrades.map(g => (<SelectItem key={g.id} value={g.id}>{g.code} — {g.nameEn}{g.nameAr ? ` · ${g.nameAr}` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line Manager / Location */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginTop: 10 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'المدير المباشر' : 'Line Manager'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
                <Select value={state.lineManagerId || undefined} onValueChange={v => patch('lineManagerId', v)} disabled={pending || visibleManagers.length === 0}>
                  <SelectTrigger style={{ borderColor: errors.lineManagerId ? 'var(--status-rejected-fg)' : undefined }}>
                    <SelectValue placeholder={visibleManagers.length ? (locale === 'ar' ? 'اختر المدير المباشر' : 'Select line manager') : (locale === 'ar' ? 'لا يوجد مدراء متاحون' : 'No managers available')} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleManagers.map(m => {
                      const name  = m.fullNameEn ?? m.personNumber
                      const label = m.departmentNameEn
                        ? `${name} — ${m.personNumber} — ${m.departmentNameEn}`
                        : `${name} — ${m.personNumber}`
                      return <SelectItem key={m.id} value={m.id}>{label}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
                <FieldError message={errors.lineManagerId} />
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'موقع العمل' : 'Work Location'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select value={state.currentLocationId || undefined} onValueChange={v => patch('currentLocationId', v)} disabled={pending || visibleLocations.length === 0}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {visibleLocations.map(l => (<SelectItem key={l.id} value={l.id}>{l.code} — {l.nameEn}{l.nameAr ? ` · ${l.nameAr}` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Project / Allocation */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16,
            marginTop: 10 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'المشروع' : 'Project'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select
                  value={state.projectId || undefined}
                  onValueChange={v => patch('projectId', v)}
                  disabled={pending || projects.length === 0 || !projectEnabled}
                >
                  <SelectTrigger style={{ borderColor: errors.projectId ? 'var(--status-rejected-fg)' : undefined }}>
                    <SelectValue placeholder={
                      !projectEnabled
                        ? (locale === 'ar' ? 'اختر المنصب والقسم أولاً' : 'Select position and department first')
                        : projects.length
                          ? (locale === 'ar' ? 'اختر المشروع' : 'Select project')
                          : (locale === 'ar' ? 'لا توجد مشاريع نشطة' : 'No active projects')
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (<SelectItem key={p.id} value={p.id}>{p.code} — {p.nameEn}{p.nameAr ? ` · ${p.nameAr}` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
                {!projectEnabled && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                  marginTop: 4 }}>
                    {locale === 'ar' ? 'يتطلب اختيار منصب وقسم' : 'Requires a position and department to be selected'}
                  </div>
                )}
                <FieldError message={errors.projectId} />
              </div>
              <div>
                <label htmlFor="allocationPercentage" style={labelStyle}>{locale === 'ar' ? 'نسبة التخصيص %' : 'Allocation %'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>(0–100)</span></label>
                <input id="allocationPercentage"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  disabled={pending || !state.projectId || !projectEnabled}
                  value={state.allocationPercentage}
                  onChange={e => patch('allocationPercentage', e.target.value)}
                  placeholder="100"
                  style={{
                    width: '100%', border: '1.5px solid var(--border)', borderRadius: 8,
                    padding: '10px 12px', fontSize: 14, background: 'var(--card)',
                    color: 'var(--ink-1)', outline: 'none', boxSizing: 'border-box' as const,
                    opacity: (!state.projectId || !projectEnabled) ? 0.5 : 1,
                  }}
                />
              </div>
            </div>

            {/* Functional Manager / Worker Category */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginTop: 10 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'المدير الوظيفي' : 'Functional Manager'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select value={state.dottedLineManagerId || undefined} onValueChange={v => patch('dottedLineManagerId', v)} disabled={pending || visibleManagers.length === 0}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر المدير الوظيفي' : 'Select functional manager'} /></SelectTrigger>
                  <SelectContent>
                    {visibleManagers.map(m => {
                      const name  = m.fullNameEn ?? m.personNumber
                      const label = m.departmentNameEn
                        ? `${name} — ${m.personNumber} — ${m.departmentNameEn}`
                        : `${name} — ${m.personNumber}`
                      return <SelectItem key={m.id} value={m.id}>{label}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                marginTop: 3 }}>{locale === 'ar' ? 'تبعية إدارية غير مباشرة؛ لا تؤثر على اعتمادات الإجازات' : 'Dotted-line reporting; no impact on leave approvals'}</div>
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'فئة العامل' : 'Worker Category'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <Select value={state.workerCategory || undefined} onValueChange={v => patch('workerCategory', v as WorkerCategory)} disabled={pending}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر الفئة' : 'Select category'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FTE">{locale === 'ar' ? 'FTE — موظف بدوام كامل' : 'FTE — Full-time Employee'}</SelectItem>
                    <SelectItem value="CONTINGENT">{locale === 'ar' ? 'عامل مؤقت' : 'Contingent Worker'}</SelectItem>
                    <SelectItem value="CONTRACTOR">{locale === 'ar' ? 'متعاقد' : 'Contractor'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Employee Code */}
            <div style={{ marginTop: 10 }}>
              <label htmlFor="employeeCode" style={labelStyle}>{locale === 'ar' ? 'رمز الموظف' : 'Employee Code'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري — رمز أعمال للموارد البشرية، منفصل عن رقم الموظف' : 'optional — HR business code, separate from employee number'})</span></label>
              <input id="employeeCode"
                type="text"
                maxLength={50}
                value={state.employeeCode}
                onChange={e => patch('employeeCode', e.target.value)}
                disabled={pending}
                placeholder="e.g. Avaniis-EMP-4421"
                style={inputStyle()}
              />
            </div>

            {/* Hire Date / Employment Type */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginTop: 10 }}>
              <div>
                <HijriDatePicker label={locale === 'ar' ? 'تاريخ التعيين' : 'Hire Date'} required value={state.hireDate} onChange={v => patch('hireDate', v)} disabled={pending} showToggle={false} />
                {requiresApproval && (
                  <div style={{ marginTop: 8, background: 'var(--surface)',
                  borderTopWidth: "1px",
                  borderTopStyle: "solid",
                  borderTopColor: "var(--border)",
                  borderRightWidth: "1px",
                  borderRightStyle: "solid",
                  borderRightColor: "var(--border)",
                  borderBottomWidth: "1px",
                  borderBottomStyle: "solid",
                  borderBottomColor: "var(--border)",
                  borderLeftWidth: "4px",
                  borderLeftStyle: "solid",
                  borderLeftColor: "var(--ink-2)", borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 6 }}>
                      <AlertTriangle size={14} style={{ color: 'var(--ink-2)', flexShrink: 0 }} />
                      <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'تعيين بأثر رجعي — يتطلب موافقة' : 'Backdated Hire — Approval Required'}</span>
                    </div>
                    <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', margin: '0 0 8px', lineHeight: 1.6 }}>
                      {locale === 'ar'
                        ? `تاريخ التعيين هذا في الماضي بـ ${backdatingDays} يوماً. سيتطلب إنشاء هذا الموظف موافقة من:`
                        : `This hire date is ${backdatingDays} days in the past. Creating this employee will require approval from:`}
                    </p>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.8 }}>
                      <li>{lineManagerName ? `${lineManagerName} (${locale === 'ar' ? 'المدير المباشر' : 'Line Manager'})` : (locale === 'ar' ? 'المدير المباشر (اختر أعلاه)' : 'Line Manager (select above)')}</li>
                      <li>{locale === 'ar' ? 'مدير الموارد البشرية' : 'HR Head of Department'}</li>
                    </ul>
                  </div>
                )}
                <FieldError message={errors.hireDate} />
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'نوع التوظيف' : 'Employment Type'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
                <Select value={state.employmentType} onValueChange={v => patch('employmentType', v as EmploymentType)} disabled={pending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">{locale === 'ar' ? 'دوام كامل' : 'Full-time'}</SelectItem>
                    <SelectItem value="PART_TIME">{locale === 'ar' ? 'دوام جزئي' : 'Part-time'}</SelectItem>
                    <SelectItem value="TEMPORARY">{locale === 'ar' ? 'مؤقت' : 'Temporary'}</SelectItem>
                    <SelectItem value="TASK_BASED">{locale === 'ar' ? 'حسب المهمة' : 'Task-based'}</SelectItem>
                    <SelectItem value="FLEXIBLE">{locale === 'ar' ? 'مرن' : 'Flexible'}</SelectItem>
                    <SelectItem value="REMOTE">{locale === 'ar' ? 'عن بُعد' : 'Remote'}</SelectItem>
                    <SelectItem value="SHARED">{locale === 'ar' ? 'مشترك' : 'Shared'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Probation / Notice Period */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginTop: 10 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'فترة الاختبار' : 'Probation Period'}</label>
                <select value={state.probationMonths} onChange={e => patch('probationMonths', Number(e.target.value))} disabled={!state.hireDate || pending}
                  style={{ width: '100%', height: 40, boxSizing: 'border-box', padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontFamily: 'var(--font-sans)', outline: 'none', cursor: !state.hireDate ? 'not-allowed' : 'pointer', opacity: !state.hireDate ? 0.6 : 1 }}>
                  {!state.hireDate && <option value="" disabled>{locale === 'ar' ? 'اختر تاريخ التعيين أولاً' : 'Select hire date first'}</option>}
                  {[1,2,3,4,5,6].map(m => (<option key={m} value={m}>{locale === 'ar' ? (m === 6 ? `${m} أشهر (الحد الأقصى — قانون الإمارات)` : `${m} ${m > 1 ? 'أشهر' : 'شهر'}`) : (m === 6 ? `${m} Months (Max — UAE Law)` : `${m} Month${m > 1 ? 's' : ''}`)}</option>))}
                </select>
                {state.hireDate && probationEndDate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                  marginTop: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    <Clock size={12} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                    <span>{locale === 'ar' ? 'تنتهي:' : 'Ends:'} <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{fmtDate(probationEndDate)}</strong>
                      {probationHijri && <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>· {probationHijri}</span>}
                      <span style={{ marginLeft: 4, color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>({probationWorkingDays} {locale === 'ar' ? 'يوم عمل' : 'working days'})</span>
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="noticePeriodDays" style={labelStyle}>{locale === 'ar' ? 'أيام فترة الإشعار' : 'Notice Period Days'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="noticePeriodDays" type="number" min={0} max={180} value={state.noticePeriodDays} onChange={e => patch('noticePeriodDays', Number(e.target.value))} disabled={pending} style={inputStyle()} />
              </div>
            </div>

            {/* Backdating reason */}
            {requiresApproval && (
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>{locale === 'ar' ? 'سبب التأريخ الرجعي' : 'Reason for backdating'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري — يُعرض للمعتمدين' : 'optional — shown to approvers'})</span></label>
                <Textarea value={state.backdatingReason} onChange={e => patch('backdatingReason', e.target.value)} placeholder={locale === 'ar' ? 'مثال: بدأ الموظف العمل قبل إعداد نظام الموارد البشرية' : 'e.g. Employee started working before HR system was set up'} rows={2} disabled={pending} />
              </div>
            )}
          </SectionCard>

          {/* Custom fields (if any) */}
          {customFields.length > 0 && (
            <SectionCard>
              <div style={{ paddingBottom: 16,
              marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'حقول مخصّصة' : 'Custom Fields'}</span>
              </div>
              {formConfig.sections.length > 0
                ? formConfig.sections.map(section => {
                    const fieldsInSection = customFieldsBySection[section.sectionCode] ?? []
                    if (fieldsInSection.length === 0) return null
                    return (
                      <div key={section.sectionCode}>
                        <h3 style={{ marginBottom: 12, fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)' }}>{section.labelEn} <span style={{ color: 'var(--ink-3)' }}>/ {section.labelAr}</span></h3>
                        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          {fieldsInSection.map(f => renderCustomField(f, state.extraData, patchExtra, pending))}
                        </div>
                      </div>
                    )
                  })
                : (
                  <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {customFields.map(f => renderCustomField(f, state.extraData, patchExtra, pending))}
                  </div>
                )}
            </SectionCard>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 2 — Identity Documents
          ════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <SectionCard>
          <SectionHeader
            icon={<CreditCard size={16} color="var(--accent)" strokeWidth={1.75} />}
            title={locale === 'ar' ? 'وثائق الهوية' : 'Identity Documents'}
            arabic={locale === 'ar' ? 'Identity Documents' : 'وثائق الهوية'}
            badge={<span style={{ marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)', background: 'var(--accent-050)', borderRadius: 999, padding: '2px 8px' }}>{locale === 'ar' ? 'PDPL · مُشفّر' : 'PDPL · encrypted'}</span>}
          />

          {/* Emirates ID */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor="emiratesId" style={labelStyle}>{locale === 'ar' ? 'الهوية الإماراتية' : 'Emirates ID'}</label>
              <input id="emiratesId" value={state.emiratesId} onChange={e => patch('emiratesId', e.target.value)} placeholder="784-XXXX-XXXXXXX-X" disabled={pending} style={{ ...inputStyle(!!errors.emiratesId), fontFamily: 'var(--font-mono)' }} />
              <FieldError message={errors.emiratesId} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'انتهاء الهوية الإماراتية' : 'Emirates ID Expiry'}</label>
              <DateInput value={state.emiratesIdExpiry} onChange={e => patch('emiratesIdExpiry', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
          </div>

          {/* Passport Number / Expiry */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="passportNumber" style={labelStyle}>
                {locale === 'ar' ? 'رقم جواز السفر' : 'Passport Number'}
                {passportRequired && <span style={{ color: 'var(--status-rejected-fg)' }}> *</span>}
                {!passportRequired && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}> ({locale === 'ar' ? 'اختياري لمواطني الإمارات' : 'optional for UAE nationals'})</span>}
              </label>
              <input id="passportNumber" value={state.passportNumber} onChange={e => onPassportNumberChange(e.target.value)} minLength={state.passportNumber ? 5 : undefined} maxLength={20} disabled={pending} style={{ ...inputStyle(!!errors.passportNumber), fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }} />
              <FieldError message={errors.passportNumber} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'انتهاء جواز السفر' : 'Passport Expiry'}</label>
              <DateInput value={state.passportExpiry} onChange={e => patch('passportExpiry', e.target.value)} disabled={pending} style={inputStyle(!!errors.passportExpiry)} />
              <FieldError message={errors.passportExpiry} />
              {state.passportExpiry && !passportExpired && passportCritical && (
                <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} />
                  {locale === 'ar'
                    ? `ينتهي جواز السفر خلال ${passportExpiryMonths! < 1 ? 'أقل من شهر' : `${passportExpiryMonths} أشهر`} — قد يؤثر على أهلية العمل في الإمارات`
                    : `Passport expires in ${passportExpiryMonths! < 1 ? 'less than 1 month' : `${passportExpiryMonths} months`} — may affect UAE work eligibility`}
                </div>
              )}
              {state.passportExpiry && !passportExpired && passportWarning && (
                <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} />
                  {locale === 'ar'
                    ? `ينتهي جواز السفر في ${fmtDate(state.passportExpiry)} — قد يلزم التجديد قريباً`
                    : `Passport expires ${fmtDate(state.passportExpiry)} — renewal may be needed soon`}
                </div>
              )}
              {state.passportNumber && state.passportExpiry && !passportExpired && !passportCritical && !passportWarning && (
                <div style={{ marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {locale === 'ar'
                    ? `صالح لمدة ${passportExpiryMonths} ${passportExpiryMonths === 1 ? 'شهر' : 'أشهر'} أخرى · ينتهي ${fmtDate(state.passportExpiry)}`
                    : `Valid for ${passportExpiryMonths} more month${passportExpiryMonths === 1 ? '' : 's'} · Expires ${fmtDate(state.passportExpiry)}`}
                </div>
              )}
            </div>
          </div>

          {/* Passport Country / Issue Date */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'دولة إصدار جواز السفر' : 'Passport Issuing Country'}</label>
              <NationalitySelect value={state.passportCountry || null} onChange={v => patch('passportCountry', v)} disabled={pending} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'تاريخ إصدار جواز السفر' : 'Passport Issue Date'}</label>
              <DateInput value={state.passportIssueDate} onChange={e => patch('passportIssueDate', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
          </div>

          {/* Visa Number / Expiry */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="visaNumber" style={labelStyle}>{locale === 'ar' ? 'رقم التأشيرة' : 'Visa Number'}</label>
              <input id="visaNumber" value={state.visaNumber} onChange={e => patch('visaNumber', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'انتهاء التأشيرة' : 'Visa Expiry'}</label>
              <DateInput value={state.visaExpiry} onChange={e => patch('visaExpiry', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
          </div>

          {/* Visa Type / Status */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="visaType" style={labelStyle}>{locale === 'ar' ? 'نوع التأشيرة' : 'Visa Type'}</label>
              <input id="visaType" value={state.visaType} onChange={e => patch('visaType', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'حالة التأشيرة' : 'Visa Status'}</label>
              <Select value={state.visaStatus || undefined} onValueChange={v => patch('visaStatus', v as VisaStatus)} disabled={pending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VALID">{locale === 'ar' ? 'سارية' : 'Valid'}</SelectItem>
                  <SelectItem value="EXPIRING">{locale === 'ar' ? 'قاربت الانتهاء' : 'Expiring'}</SelectItem>
                  <SelectItem value="EXPIRED">{locale === 'ar' ? 'منتهية' : 'Expired'}</SelectItem>
                  <SelectItem value="CANCELLED">{locale === 'ar' ? 'ملغاة' : 'Cancelled'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Labour Card / Expiry */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="labourCardNumber" style={labelStyle}>{locale === 'ar' ? 'رقم بطاقة العمل' : 'Labour Card #'}</label>
              <input id="labourCardNumber" value={state.labourCardNumber} onChange={e => patch('labourCardNumber', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'انتهاء بطاقة العمل' : 'Labour Card Expiry'}</label>
              <DateInput value={state.labourCardExpiry} onChange={e => patch('labourCardExpiry', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
          </div>

          {/* MoHRE / Family Book */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
          marginTop: 10 }}>
            <div>
              <label htmlFor="mohreLabourPermitNumber" style={labelStyle}>{locale === 'ar' ? 'رقم تصريح وزارة الموارد البشرية' : 'MoHRE Permit #'}</label>
              <input id="mohreLabourPermitNumber" value={state.mohreLabourPermitNumber} onChange={e => patch('mohreLabourPermitNumber', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
            <div>
              <label htmlFor="familyBookNumber" style={labelStyle}>{locale === 'ar' ? 'رقم خلاصة القيد' : 'Family Book #'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'مواطنو الإمارات' : 'UAE Nationals'})</span></label>
              <input id="familyBookNumber" value={state.familyBookNumber} onChange={e => patch('familyBookNumber', e.target.value)} disabled={pending} style={inputStyle()} />
            </div>
          </div>

          {/* Nafis */}
          {state.nationalityCategory === 'UAE_NATIONAL' && (
            <div style={{ marginTop: 16 }}>
              <label htmlFor="nafisRegistrationNumber" style={labelStyle}>{locale === 'ar' ? 'رقم تسجيل نافس' : 'Nafis Registration #'}</label>
              <input id="nafisRegistrationNumber" value={state.nafisRegistrationNumber} onChange={e => patch('nafisRegistrationNumber', e.target.value)} disabled={pending} style={inputStyle()} />
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
              marginTop: 3 }}>{locale === 'ar' ? 'مطلوب لتقارير التوطين.' : 'Required for Emiratisation reporting.'}</div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 3 — Additional Info (Emergency Contact, Address, Education, Photo)
          ════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <>
          {/* Profile Photo */}
          <SectionCard>
            <SectionHeader
              icon={<User size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'الصورة الشخصية' : 'Profile Photo'}
              arabic={locale === 'ar' ? 'Profile Photo' : 'الصورة الشخصية'}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {/* Preview circle */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'var(--surface)', border: '2px dashed var(--border)',
                overflow: 'hidden', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {photoPreview
                  ? <img src={photoPreview} alt={locale === 'ar' ? 'معاينة' : 'Preview'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <User size={28} color="var(--ink-4)" />
                }
              </div>
              <div>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)',
                }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null
                      photoFileRef.current = file
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = ev => setPhotoPreview(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      } else {
                        setPhotoPreview('')
                      }
                    }}
                  />
                  {photoPreview ? (locale === 'ar' ? 'تغيير الصورة' : 'Change photo') : (locale === 'ar' ? 'اختيار صورة' : 'Choose photo')}
                </label>
                <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                marginTop: 6 }}>
                  {locale === 'ar' ? 'اختياري · JPEG، PNG، WebP · بحد أقصى 2 ميجابايت · تُرفع بعد إنشاء الموظف' : 'Optional · JPEG, PNG, WebP · max 2 MB · uploaded after employee is created'}
                </p>
                {photoPreview && (
                  <button type="button" onClick={() => { photoFileRef.current = null; setPhotoPreview('') }}
                    style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                    {locale === 'ar' ? 'إزالة' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Emergency Contact */}
          <SectionCard>
            <SectionHeader
              icon={<AlertTriangle size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'جهة الاتصال في حالات الطوارئ' : 'Emergency Contact'}
              arabic={locale === 'ar' ? 'Emergency Contact' : 'جهة الاتصال في حالات الطوارئ'}
            />
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginBottom: 12 }}>{locale === 'ar' ? 'اختياري — يمكن إضافته أو تحديثه لاحقاً عبر نموذج التعديل.' : 'Optional — can be added or updated later via the edit form.'}</p>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="ecName" style={labelStyle}>{locale === 'ar' ? 'الاسم' : 'Name'}</label>
                <input id="ecName" value={state.ecName} onChange={e => patch('ecName', e.target.value)} disabled={pending} style={inputStyle()} placeholder={locale === 'ar' ? 'الاسم الكامل' : 'Full name'} />
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'صلة القرابة' : 'Relationship'}</label>
                <Select value={state.ecRelationship || undefined} onValueChange={v => patch('ecRelationship', v)} disabled={pending}>
                  <SelectTrigger style={inputStyle()}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SPOUSE">{locale === 'ar' ? 'الزوج/الزوجة' : 'Spouse'}</SelectItem>
                    <SelectItem value="PARENT">{locale === 'ar' ? 'أحد الوالدين' : 'Parent'}</SelectItem>
                    <SelectItem value="SIBLING">{locale === 'ar' ? 'أخ/أخت' : 'Sibling'}</SelectItem>
                    <SelectItem value="CHILD">{locale === 'ar' ? 'ابن/ابنة' : 'Child'}</SelectItem>
                    <SelectItem value="FRIEND">{locale === 'ar' ? 'صديق' : 'Friend'}</SelectItem>
                    <SelectItem value="OTHER">{locale === 'ar' ? 'أخرى' : 'Other'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="ecPhone" style={labelStyle}>{locale === 'ar' ? 'الهاتف' : 'Phone'}</label>
                <input id="ecPhone" value={state.ecPhone} onChange={e => patch('ecPhone', e.target.value)} disabled={pending} style={inputStyle()} placeholder="+971 50 000 0000" />
              </div>
            </div>
          </SectionCard>

          {/* Home Address */}
          <SectionCard>
            <SectionHeader
              icon={<Hash size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'عنوان البلد الأصلي' : 'Home Country Address'}
              arabic={locale === 'ar' ? 'Home Country Address' : 'عنوان البلد الأصلي'}
            />
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginBottom: 12 }}>{locale === 'ar' ? 'اختياري — يمكن إضافته أو تحديثه لاحقاً عبر نموذج التعديل.' : 'Optional — can be added or updated later via the edit form.'}</p>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="haLine1" style={labelStyle}>{locale === 'ar' ? 'العنوان السطر 1' : 'Address Line 1'}</label>
                <input id="haLine1" value={state.haLine1} onChange={e => patch('haLine1', e.target.value)} disabled={pending} style={inputStyle()} placeholder={locale === 'ar' ? 'الشارع / المبنى' : 'Street / Building'} />
              </div>
              <div>
                <label htmlFor="haLine2" style={labelStyle}>{locale === 'ar' ? 'العنوان السطر 2' : 'Address Line 2'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="haLine2" value={state.haLine2} onChange={e => patch('haLine2', e.target.value)} disabled={pending} style={inputStyle()} placeholder={locale === 'ar' ? 'الشقة / الطابق' : 'Apartment / Floor'} />
              </div>
              <div>
                <label htmlFor="haCity" style={labelStyle}>{locale === 'ar' ? 'المدينة' : 'City'}</label>
                <input id="haCity" value={state.haCity} onChange={e => patch('haCity', e.target.value)} disabled={pending} style={inputStyle()} />
              </div>
              <div>
                <label htmlFor="haState" style={labelStyle}>{locale === 'ar' ? 'الولاية / المحافظة' : 'State / Province'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="haState" value={state.haState} onChange={e => patch('haState', e.target.value)} disabled={pending} style={inputStyle()} />
              </div>
              <div>
                <label htmlFor="haCountry" style={labelStyle}>{locale === 'ar' ? 'الدولة (ISO-3)' : 'Country (ISO-3)'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>{locale === 'ar' ? 'مثال ARE' : 'e.g. ARE'}</span></label>
                <input id="haCountry" value={state.haCountry} onChange={e => patch('haCountry', e.target.value.toUpperCase())} maxLength={3} disabled={pending} style={{ ...inputStyle(), textTransform: 'uppercase' }} />
              </div>
              <div>
                <label htmlFor="haPostalCode" style={labelStyle}>{locale === 'ar' ? 'الرمز البريدي' : 'Postal / ZIP Code'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="haPostalCode" value={state.haPostalCode} onChange={e => patch('haPostalCode', e.target.value)} maxLength={20} disabled={pending} style={inputStyle()} />
              </div>
              <div>
                <label htmlFor="haPoBox" style={labelStyle}>{locale === 'ar' ? 'صندوق البريد' : 'P.O. Box'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="haPoBox" value={state.haPoBox} onChange={e => patch('haPoBox', e.target.value)} maxLength={20} disabled={pending} style={inputStyle()} />
              </div>
            </div>
          </SectionCard>

          {/* Highest Qualification */}
          <SectionCard>
            <SectionHeader
              icon={<Check size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'أعلى مؤهل' : 'Highest Qualification'}
              arabic={locale === 'ar' ? 'Highest Qualification' : 'أعلى مؤهل'}
            />
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginBottom: 12 }}>{locale === 'ar' ? 'اختياري — يمكن إضافته أو تحديثه لاحقاً عبر نموذج التعديل.' : 'Optional — can be added or updated later via the edit form.'}</p>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="eduInstitution" style={labelStyle}>{locale === 'ar' ? 'المؤسسة التعليمية' : 'Institution'}</label>
                <input id="eduInstitution" value={state.eduInstitution} onChange={e => patch('eduInstitution', e.target.value)} disabled={pending} style={inputStyle()} placeholder={locale === 'ar' ? 'اسم الجامعة / الكلية' : 'University / College name'} />
              </div>
              <div>
                <label htmlFor="eduDegree" style={labelStyle}>{locale === 'ar' ? 'نوع الدرجة' : 'Degree Type'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="eduDegree" value={state.eduDegree} onChange={e => patch('eduDegree', e.target.value)} disabled={pending} style={inputStyle()} placeholder={locale === 'ar' ? 'مثال: بكالوريوس العلوم' : 'e.g. Bachelor of Science'} />
              </div>
              <div>
                <label htmlFor="eduField" style={labelStyle}>{locale === 'ar' ? 'مجال الدراسة' : 'Field of Study'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="eduField" value={state.eduField} onChange={e => patch('eduField', e.target.value)} disabled={pending} style={inputStyle()} placeholder={locale === 'ar' ? 'مثال: هندسة الحاسوب' : 'e.g. Computer Engineering'} />
              </div>
              <div>
                <label htmlFor="eduCountry" style={labelStyle}>{locale === 'ar' ? 'الدولة (ISO-3)' : 'Country (ISO-3)'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="eduCountry" value={state.eduCountry} onChange={e => patch('eduCountry', e.target.value.toUpperCase())} maxLength={3} disabled={pending} style={{ ...inputStyle(), textTransform: 'uppercase' }} placeholder={locale === 'ar' ? 'مثال: GBR' : 'e.g. GBR'} />
              </div>
              <div>
                <label htmlFor="eduStartYear" style={labelStyle}>{locale === 'ar' ? 'سنة البدء' : 'Start Year'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="eduStartYear" type="number" min={1950} max={new Date().getFullYear()} value={state.eduStartYear}
                  onChange={e => patch('eduStartYear', e.target.value)} disabled={pending} style={inputStyle()} />
              </div>
              <div>
                <label htmlFor="eduGradYear" style={labelStyle}>{locale === 'ar' ? 'سنة التخرّج' : 'Graduation Year'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400 }}>({locale === 'ar' ? 'اختياري' : 'optional'})</span></label>
                <input id="eduGradYear" type="number" min={1950} max={new Date().getFullYear()} value={state.eduGradYear}
                  onChange={e => patch('eduGradYear', e.target.value)} disabled={pending} style={inputStyle()} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 12, fontSize: 'var(--text-caption)', color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={state.eduIsHighest} onChange={e => patch('eduIsHighest', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
              {locale === 'ar' ? 'وضع علامة كأعلى مؤهل مسجّل' : 'Mark as highest qualification on record'}
            </label>
          </SectionCard>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 4 — Review & Consent
          ════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <>
          {/* Personal summary */}
          <SectionCard>
            <SectionHeader icon={<User size={16} color="var(--accent)" strokeWidth={1.75} />} title={locale === 'ar' ? 'المعلومات الشخصية' : 'Personal Information'} arabic={locale === 'ar' ? 'Personal Information' : 'المعلومات الشخصية'} />
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الاسم (EN)' : 'Name (EN)'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{[state.firstNameEn, state.middleNameEn, state.lastNameEn].filter(Boolean).join(' ') || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الاسم (AR)' : 'Name (AR)'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500, direction: 'rtl' }}>{state.fullNameAr || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'تاريخ الميلاد' : 'Date of Birth'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.dateOfBirth ? fmtDate(state.dateOfBirth) : '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الجنس' : 'Gender'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.gender === 'NOT_SPECIFIED' ? (locale === 'ar' ? 'غير محدد' : 'Not specified') : state.gender === 'MALE' ? (locale === 'ar' ? 'ذكر' : 'Male') : (locale === 'ar' ? 'أنثى' : 'Female')}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الجنسية' : 'Nationality'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.nationalityCode} · {state.nationalityCategory.replace(/_/g, ' ')}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الحالة الاجتماعية' : 'Marital Status'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.maritalStatus.replace(/_/g, ' ')}</div></div>
            </div>
            <button type="button" onClick={() => { setStep(0); setErrors({}) }} style={{ marginTop: 14, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button>
          </SectionCard>

          {/* Employment summary */}
          <SectionCard>
            <SectionHeader icon={<Briefcase size={16} color="var(--accent)" strokeWidth={1.75} />} title={locale === 'ar' ? 'التوظيف' : 'Employment Details'} arabic={locale === 'ar' ? 'Employment Details' : 'التوظيف'} />
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الجهة القانونية' : 'Legal Entity'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{legalEntities.find(e => e.id === state.legalEntityId)?.nameEn || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'القسم' : 'Department'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{departments.find(d => d.id === state.currentDepartmentId)?.nameEn || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'تاريخ التعيين' : 'Hire Date'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.hireDate ? fmtDate(state.hireDate) : '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'نوع التوظيف' : 'Employment Type'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.employmentType.replace(/_/g, '-')}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'فئة العامل' : 'Worker Category'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.workerCategory || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'رمز الموظف' : 'Employee Code'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.employeeCode || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'المدير المباشر' : 'Line Manager'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{lineManagerName || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'فترة الاختبار' : 'Probation'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.probationMonths} {locale === 'ar' ? (state.probationMonths !== 1 ? 'أشهر' : 'شهر') : `month${state.probationMonths !== 1 ? 's' : ''}`}{probationEndDate ? ` · ${locale === 'ar' ? 'تنتهي' : 'ends'} ${fmtDate(probationEndDate)}` : ''}</div></div>
            </div>
            {requiresApproval && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface)',
              borderTopWidth: "1px",
              borderTopStyle: "solid",
              borderTopColor: "var(--border)",
              borderRightWidth: "1px",
              borderRightStyle: "solid",
              borderRightColor: "var(--border)",
              borderBottomWidth: "1px",
              borderBottomStyle: "solid",
              borderBottomColor: "var(--border)",
              borderLeftWidth: "4px",
              borderLeftStyle: "solid",
              borderLeftColor: "var(--ink-2)", borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={13} style={{ color: 'var(--ink-2)', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? `تعيين بأثر رجعي (${backdatingDays} يوماً) — سيتطلب موافقة بعد الحفظ` : `Backdated hire (${backdatingDays} days) — will require approval after save`}</span>
              </div>
            )}
            <button type="button" onClick={() => { setStep(1); setErrors({}) }} style={{ marginTop: 14, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button>
          </SectionCard>

          {/* Identity documents summary */}
          <SectionCard>
            <SectionHeader
              icon={<CreditCard size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'وثائق الهوية' : 'Identity Documents'}
              arabic={locale === 'ar' ? 'Identity Documents' : 'وثائق الهوية'}
              badge={<span style={{ marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)', background: 'var(--accent-050)', borderRadius: 999, padding: '2px 8px' }}>{locale === 'ar' ? 'PDPL · مُشفّر' : 'PDPL · encrypted'}</span>}
            />
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'الهوية الإماراتية' : 'Emirates ID'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{state.emiratesId || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'انتهاء الهوية' : 'EID Expiry'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.emiratesIdExpiry ? fmtDate(state.emiratesIdExpiry) : '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'جواز السفر' : 'Passport'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{state.passportNumber || '—'}</div></div>
              <div><div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'انتهاء جواز السفر' : 'Passport Expiry'}</div><div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{state.passportExpiry ? fmtDate(state.passportExpiry) : '—'}</div></div>
            </div>
            <button type="button" onClick={() => { setStep(2); setErrors({}) }} style={{ marginTop: 14, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{locale === 'ar' ? 'تعديل' : 'Edit'}</button>
          </SectionCard>

          {/* PDPL Consent */}
          <div style={{ background: 'var(--accent-050, var(--surface))',
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: "var(--accent-200, var(--border))",
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "var(--accent-200, var(--border))",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "var(--accent-200, var(--border))",
          borderLeftWidth: "4px",
          borderLeftStyle: "solid",
          borderLeftColor: "var(--accent)", borderRadius: 12, padding: 24,
          marginBottom: 20 }}>
            <SectionHeader
              icon={<ShieldCheck size={16} color="var(--accent)" strokeWidth={1.75} />}
              title={locale === 'ar' ? 'موافقة حماية البيانات' : 'Data Protection Consent'}
              arabic={locale === 'ar' ? 'Data Protection Consent' : 'موافقة حماية البيانات'}
              badge={<span style={{ marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)', background: 'var(--accent-050)', borderRadius: 999, padding: '2px 8px' }}>UAE PDPL</span>}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={state.pdplConsentGiven} onChange={e => patch('pdplConsentGiven', e.target.checked)} disabled={pending} style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0,
                marginTop: 2 }} />
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'تم الحصول على موافقة الموظف' : 'Employee consent obtained'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></span>
                  <span style={{ color: 'var(--ink-3)' }}>{locale === 'ar' ? ' — المادة 11 من قانون حماية البيانات الإماراتي: يشكّل عقد العمل أساساً قانونياً. يؤكّد التحديد الحصول على الموافقة شفهياً أو كتابياً قبل إدخال البيانات.' : ' — UAE PDPL Article 11: employment contract constitutes legal basis. Check confirms consent was verbally or in writing obtained before data entry.'}</span>
                  <span style={{ display: 'block',
                  marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">تم الحصول على موافقة الموظف — المادة 11 من قانون حماية البيانات الشخصية الإماراتي</span>
                </span>
              </label>
              {errors.pdplConsentGiven && (
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)', display: 'flex', alignItems: 'center', gap: 4,
                marginTop: -8 }}>
                  <AlertCircle size={11} /> {errors.pdplConsentGiven}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={state.sensitiveDataConsent} onChange={e => patch('sensitiveDataConsent', e.target.checked)} disabled={pending} style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0,
                marginTop: 2 }} />
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'تم الحصول على موافقة البيانات الحساسة' : 'Sensitive data consent obtained'}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{locale === 'ar' ? ' — الديانة والقياسات الحيوية والبيانات الصحية. حدّد فقط إذا وافق الموظف صراحةً وكتابياً.' : ' — Religion, biometrics, health data. Only check if employee has explicitly consented in writing.'}</span>
                  <span style={{ display: 'block',
                  marginTop: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">تم الحصول على موافقة البيانات الحساسة — الدين والقياسات الحيوية والصحة</span>
                </span>
              </label>
            </div>
          </div>
        </>
      )}

      </div>{/* end step content wrapper */}

      {/* ── Sticky Footer ─────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 10,
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <DraftSaveIndicator status={draft.saveIndicator} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => router.push('/persons')}
            disabled={pending}
            style={{ height: 40, padding: '0 20px', fontSize: 'var(--text-body)', fontWeight: 500, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--ink-2)', cursor: 'pointer' }}
          >
            {locale === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              disabled={pending}
              style={{ height: 40, padding: '0 20px', fontSize: 'var(--text-body)', fontWeight: 500, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--ink-2)', cursor: 'pointer' }}
            >
              {locale === 'ar' ? '→ رجوع' : '← Back'}
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={pending}
              style={{ height: 40, padding: '0 24px', fontSize: 'var(--text-body)', fontWeight: 600, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--card)', cursor: 'pointer' }}
            >
              {locale === 'ar' ? 'التالي →' : 'Next →'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              style={{ height: 40, padding: '0 24px', fontSize: 'var(--text-body)', fontWeight: 600, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--card)', cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {pending
                ? (requiresApproval ? (locale === 'ar' ? 'جارٍ الإرسال للموافقة…' : 'Submitting for approval…') : (locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…'))
                : (requiresApproval ? (locale === 'ar' ? 'إرسال للموافقة' : 'Submit for Approval') : (locale === 'ar' ? 'حفظ ومتابعة →' : 'Save & Continue →'))}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

// ── Custom-field renderer (unchanged) ────────────────────────────────────────

function renderCustomField(
  f:        FieldDefinition,
  values:   Record<string, unknown>,
  set:      (key: string, value: unknown) => void,
  disabled: boolean,
) {
  const id      = `cf-${f.apiName}`
  const value   = values[f.apiName]
  const options = (f.validationRules?.options as Array<{ value: string; labelEn: string }> | undefined) ?? []

  switch (f.dataType) {
    case 'CHECKBOX':
      return (
        <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            id={id}
            checked={!!value}
            onChange={e => set(f.apiName, e.target.checked)}
            disabled={disabled}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
          />
          {f.labelEn} {f.labelAr ? <span style={{ color: 'var(--ink-3)' }}>/ {f.labelAr}</span> : null}
        </label>
      )
    case 'PICKLIST':
      return (
        <div key={f.id}>
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">
            {f.labelEn}{f.isRequired && <span className="ms-0.5 text-destructive">*</span>}
          </Label>
          <Select value={(value as string) ?? undefined}
            onValueChange={v => set(f.apiName, v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {options.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.labelEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    case 'LONG_TEXT':
      return (
        <div key={f.id} style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Textarea id={id} value={(value as string) ?? ''}
            onChange={e => set(f.apiName, e.target.value)} disabled={disabled} />
        </div>
      )
    case 'NUMBER':
    case 'CURRENCY':
      return (
        <div key={f.id}>
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Input id={id} type="number" value={(value as number | string) ?? ''}
            onChange={e => set(f.apiName, e.target.value === '' ? null : Number(e.target.value))}
            disabled={disabled} />
        </div>
      )
    case 'DATE':
      return (
        <HijriDatePicker
          key={f.id}
          label={f.labelEn}
          value={(value as string) ?? ''}
          onChange={v => set(f.apiName, v)}
          disabled={disabled}
        />
      )
    case 'URL':
      return (
        <div key={f.id}>
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Input id={id} type="url" value={(value as string) ?? ''}
            onChange={e => set(f.apiName, e.target.value)} disabled={disabled} />
        </div>
      )
    case 'TEXT':
    default:
      return (
        <div key={f.id}>
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Input id={id} value={(value as string) ?? ''}
            onChange={e => set(f.apiName, e.target.value)} disabled={disabled} />
        </div>
      )
  }
}
