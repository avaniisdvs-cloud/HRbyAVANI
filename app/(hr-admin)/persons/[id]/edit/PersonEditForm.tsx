'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { NationalitySelect, deriveNationalityCategory } from '@/components/forms/NationalitySelect'
import { updatePerson, upsertPersonContacts, updatePersonProject, upsertPersonEmergencyContact, upsertPersonHomeAddress, upsertPersonEducation, assignWorkSchedule } from '@/modules/core-hr'
import { PhotoUploadWidget } from '@/app/(hr-admin)/persons/[id]/PhotoUploadWidget'
import type { PersonView, UpdatePersonInput } from '@/modules/core-hr'
import type { FieldDefinition, FormConfig } from '@/lib/config-resolver'

// ── Enum unions (kept inline so the client bundle never imports zod) ──────

type Gender         = 'MALE' | 'FEMALE' | 'NOT_SPECIFIED'
type MaritalStatus  = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'NOT_SPECIFIED'
type NationalityCategory = 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT'
type VisaStatus     = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED'
type PreferredLang  = 'en' | 'ar'
type NotifyChannel  = 'EMAIL' | 'PUSH' | 'PUSH_AND_EMAIL' | 'NONE'
type InsuranceStatus =
  | 'ENROLLED' | 'PENDING_ENROLMENT' | 'RENEWAL_DUE'
  | 'EXPIRED'  | 'CANCELLED'         | 'NOT_ENROLLED'

interface ContactRow {
  id:           string
  contactType:  string
  contactValue: string
  isPrimary:    boolean
}
interface AddressRow {
  id:            string
  addressType:   string
  addressLine1:  string | null
  addressLine2:  string | null
  city:          string | null
  stateEmirate:  string | null
  country:       string
  postalCode:    string | null
  poBox:         string | null
}

interface EmergencyContactRow {
  id:            string
  contactNameEn: string
  relationship:  string
  phonePrimary:  string
}

interface EducationRow {
  id:             string
  institutionName: string
  degreeType:     string | null
  fieldOfStudy:   string | null
  country:        string | null
  startYear:      number | null
  graduationYear: number | null
  isHighestDegree: boolean
}

interface PicklistItem { id: string; titleEn?: string; nameEn?: string | null; gradeNameEn?: string; gradeCode?: string; positionCode?: string; fullNameEn?: string | null; personNumber?: string; departmentNameEn?: string | null; code?: string; nameAr?: string | null }

// Imperative handle exposed by each sub-editor to the parent's global save.
interface EditorHandle {
  isDirty(): boolean
  save(): Promise<{ success: boolean; description?: string; error?: string }>
}

interface Props {
  person:              PersonView
  contacts:            ContactRow[]
  addresses:           AddressRow[]
  emergencyContact:    EmergencyContactRow | null
  education:           EducationRow | null
  formConfig:          FormConfig
  customFields:        FieldDefinition[]
  positionOptions:     PicklistItem[]
  departmentOptions:   PicklistItem[]
  gradeOptions:        PicklistItem[]
  locationOptions:     PicklistItem[]
  managerOptions:      PicklistItem[]
  projectOptions:      PicklistItem[]
  currentProjectId:    string | null
  currentAllocationPct: string | null
  // When false, the current worker_assignment row does not exist for this person.
  // updatePersonProject would silently return { noAssignment: true } — the field
  // is disabled upfront so the user sees a clear explanation rather than a
  // post-save destructive toast.
  hasWorkerAssignment: boolean
  scheduleOptions:       { id: string; scheduleNameEn: string; scheduleCode: string; isDefault: boolean }[]
  currentWorkScheduleId: string | null
  legalEntityId:         string
}

// ── Form state ────────────────────────────────────────────────────────────

interface FormState {
  // Identity
  firstNameEn:   string
  middleNameEn:  string
  lastNameEn:    string
  fullNameAr:    string
  preferredName: string
  salutation:    string
  dateOfBirth:   string
  gender:        Gender
  maritalStatus: MaritalStatus
  numberOfDependents: number
  // Nationality
  nationalityCode:      string
  nationalityCategory:  NationalityCategory
  religion:             string
  religionConsentGiven: boolean
  bloodType:            string
  // PII
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
  // Insurance
  insuranceCardNumber:    string
  insuranceMemberId:      string
  insuranceProviderName:  string
  insuranceNetwork:       string
  insuranceCategory:      string
  insuranceEffectiveDate: string
  insuranceExpiryDate:    string
  insuranceStatus:        InsuranceStatus | ''
  // Employment snapshot
  assignmentStatus:    string
  currentPositionId:   string
  currentDepartmentId: string
  currentGradeId:      string
  currentLocationId:   string
  lineManagerId:       string
  dottedLineManagerId: string
  noticePeriodDays:    string
  workerCategory:      string
  employeeCode:        string
  projectId:           string
  allocationPct:       string
  workScheduleId:      string
  // Preferences
  preferredLanguage:   PreferredLang
  notificationChannel: NotifyChannel
  // Custom fields (extra_data)
  extraData: Record<string, unknown>
}

const str = (v: string | null | undefined) => v ?? ''

function initialState(p: PersonView, projectId: string | null, allocationPct: string | null, workScheduleId: string | null): FormState {
  return {
    firstNameEn:   str(p.firstNameEn),
    middleNameEn:  str(p.middleNameEn),
    lastNameEn:    str(p.lastNameEn),
    fullNameAr:    str(p.fullNameAr),
    preferredName: str(p.preferredName),
    salutation:    str(p.salutation),
    dateOfBirth:   str(p.dateOfBirth),
    gender:        (p.gender ?? 'NOT_SPECIFIED') as Gender,
    maritalStatus: (p.maritalStatus ?? 'NOT_SPECIFIED') as MaritalStatus,
    numberOfDependents: p.numberOfDependents ?? 0,

    nationalityCode:      str(p.nationalityCode),
    nationalityCategory:  (p.nationalityCategory ?? 'EXPAT') as NationalityCategory,
    religion:             str(p.religion),
    religionConsentGiven: !!p.religionConsentGiven,
    bloodType:            str((p as Record<string, unknown>).bloodType as string | null),

    emiratesId:        str(p.emiratesId),
    emiratesIdExpiry:  str(p.emiratesIdExpiry),
    passportNumber:    str(p.passportNumber),
    passportCountry:   str(p.passportCountry),
    passportIssueDate: str(p.passportIssueDate),
    passportExpiry:    str(p.passportExpiry),
    visaNumber:    str(p.visaNumber),
    visaType:      str(p.visaType),
    visaIssueDate: str(p.visaIssueDate),
    visaExpiry:    str(p.visaExpiry),
    visaStatus:    (p.visaStatus as VisaStatus | null) ?? '',
    labourCardNumber:        str(p.labourCardNumber),
    labourCardExpiry:        str(p.labourCardExpiry),
    mohreLabourPermitNumber: str(p.mohreLabourPermitNumber),
    familyBookNumber:        str(p.familyBookNumber),
    nafisRegistrationNumber: str(p.nafisRegistrationNumber),

    insuranceCardNumber:    str(p.insuranceCardNumber),
    insuranceMemberId:      str(p.insuranceMemberId),
    insuranceProviderName:  str(p.insuranceProviderName),
    insuranceNetwork:       str(p.insuranceNetwork),
    insuranceCategory:      str(p.insuranceCategory),
    insuranceEffectiveDate: str(p.insuranceEffectiveDate),
    insuranceExpiryDate:    str(p.insuranceExpiryDate),
    insuranceStatus:        (p.insuranceStatus as InsuranceStatus | null) ?? '',

    assignmentStatus:    str(p.assignmentStatus),
    currentPositionId:   str(p.currentPositionId),
    currentDepartmentId: str(p.currentDepartmentId),
    currentGradeId:      str(p.currentGradeId),
    currentLocationId:   str(p.currentLocationId),
    lineManagerId:       str(p.lineManagerId),
    dottedLineManagerId: str((p as Record<string, unknown>).dottedLineManagerId as string | null),
    noticePeriodDays:    String((p as Record<string, unknown>).noticePeriodDays ?? '30'),
    workerCategory:      str((p as Record<string, unknown>).workerCategory as string | null),
    employeeCode:        str((p as Record<string, unknown>).employeeCode as string | null),
    projectId:           projectId    ?? '',
    allocationPct:       allocationPct ?? '',
    workScheduleId:      workScheduleId ?? '',

    preferredLanguage:   (p.preferredLanguage ?? 'en') as PreferredLang,
    notificationChannel: (p.notificationChannel ?? 'PUSH_AND_EMAIL') as NotifyChannel,

    extraData: (p.extraData as Record<string, unknown>) ?? {},
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function PersonEditForm({ person, contacts, addresses, emergencyContact, education, formConfig, customFields, positionOptions, departmentOptions, gradeOptions, locationOptions, managerOptions, projectOptions, currentProjectId, currentAllocationPct, hasWorkerAssignment, scheduleOptions, currentWorkScheduleId, legalEntityId }: Props) {
  const initial = useMemo(() => initialState(person, currentProjectId, currentAllocationPct, currentWorkScheduleId), [person, currentProjectId, currentAllocationPct, currentWorkScheduleId])
  const [state, setState] = useState<FormState>(initial)
  const [pending, start]  = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()
  const router    = useRouter()

  // ── Sub-editor dirty tracking ─────────────────────────────────────────────
  const [contactsDirty,  setContactsDirty]  = useState(false)
  const [emergencyDirty, setEmergencyDirty] = useState(false)
  const [addressDirty,   setAddressDirty]   = useState(false)
  const [educationDirty, setEducationDirty] = useState(false)
  // Tracks that the photo was persisted during this edit session.
  // Photo uploads immediately on select; this prevents "Nothing to save" from
  // appearing if the user only changed the photo and clicks "Save Changes".
  const [photoJustSaved, setPhotoJustSaved] = useState(false)

  // Refs to trigger imperative saves on sub-editors from the global save.
  const contactsRef  = useRef<EditorHandle>(null)
  const emergencyRef = useRef<EditorHandle>(null)
  const addressRef   = useRef<EditorHandle>(null)
  const educationRef = useRef<EditorHandle>(null)

  // PII is masked when `getPerson` returned a `*` placeholder rather than the
  // decrypted plaintext. The role gate above (HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN)
  // means this should normally be false — but we lock the inputs defensively
  // so a masked literal never round-trips back through encryption.
  const piiLocked = person.piiMasked

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState(s => ({ ...s, [key]: value }))
  }

  function patchExtra(key: string, value: unknown) {
    setState(s => ({ ...s, extraData: { ...s.extraData, [key]: value } }))
  }

  // FR-CH-16: UAE_NATIONAL implies nationalityCode = ARE.
  function setNationalityCategory(next: NationalityCategory) {
    setState(s => ({
      ...s,
      nationalityCategory: next,
      nationalityCode: next === 'UAE_NATIONAL' ? 'ARE' : s.nationalityCode,
    }))
  }

  // ── Diff against initial state — only changed fields go in the patch ──
  function buildPatch(): UpdatePersonInput {
    const patch: Record<string, unknown> = {}

    const stringField = <K extends keyof FormState>(k: K, allowEmpty = false) => {
      if (state[k] === initial[k]) return
      const v = state[k]
      if (typeof v !== 'string') return
      patch[k as string] = v === '' ? (allowEmpty ? null : undefined) : v
    }
    const enumField = <K extends keyof FormState>(k: K) => {
      if (state[k] === initial[k]) return
      const v = state[k]
      if (v === '' || v == null) return // leave unchanged when cleared
      patch[k as string] = v
    }
    const numField = <K extends keyof FormState>(k: K) => {
      if (state[k] === initial[k]) return
      patch[k as string] = state[k]
    }
    const boolField = <K extends keyof FormState>(k: K) => {
      if (state[k] === initial[k]) return
      patch[k as string] = state[k]
    }

    // Identity
    stringField('firstNameEn')
    stringField('middleNameEn', true)
    stringField('lastNameEn')
    stringField('fullNameAr')
    stringField('preferredName', true)
    stringField('salutation', true)
    stringField('dateOfBirth')
    enumField('gender')
    enumField('maritalStatus')
    numField('numberOfDependents')

    // Nationality
    stringField('nationalityCode')
    enumField('nationalityCategory')
    stringField('religion', true)
    boolField('religionConsentGiven')
    enumField('bloodType')

    // PII — only send if not locked AND the field actually changed.
    if (!piiLocked) {
      stringField('emiratesId',        true)
      stringField('emiratesIdExpiry',  true)
      stringField('passportNumber',    true)
      stringField('passportCountry',   true)
      stringField('passportIssueDate', true)
      stringField('passportExpiry',    true)
    }
    stringField('visaNumber',    true)
    stringField('visaType',      true)
    stringField('visaIssueDate', true)
    stringField('visaExpiry',    true)
    enumField('visaStatus')
    stringField('labourCardNumber',        true)
    stringField('labourCardExpiry',        true)
    stringField('mohreLabourPermitNumber', true)
    stringField('familyBookNumber',        true)
    stringField('nafisRegistrationNumber', true)

    // Insurance
    stringField('insuranceCardNumber',    true)
    stringField('insuranceMemberId',      true)
    stringField('insuranceProviderName',  true)
    stringField('insuranceNetwork',       true)
    stringField('insuranceCategory',      true)
    stringField('insuranceEffectiveDate', true)
    stringField('insuranceExpiryDate',    true)
    enumField('insuranceStatus')

    // Assignment-sensitive fields are read-only in this generic edit form.
    // Department/position/grade/location/manager/status changes must create
    // effective-dated worker assignment history via Employment Actions.
    // Task 2C — employment classification fields
    if (state.workerCategory      !== initial.workerCategory)      (patch as Record<string, unknown>).workerCategory      = state.workerCategory      || null
    if (state.employeeCode        !== initial.employeeCode)        (patch as Record<string, unknown>).employeeCode        = state.employeeCode        || null
    if (state.noticePeriodDays    !== initial.noticePeriodDays) {
      const days = parseInt(state.noticePeriodDays, 10)
      if (!isNaN(days) && days >= 0 && days <= 180) (patch as Record<string, unknown>).noticePeriodDays = days
    }

    // Preferences
    enumField('preferredLanguage')
    enumField('notificationChannel')

    // Custom-field bag
    if (JSON.stringify(state.extraData) !== JSON.stringify(initial.extraData)) {
      patch.extraData = state.extraData
    }

    return patch as UpdatePersonInput
  }

  // Derived dirty state — placed after buildPatch so piiLocked (used inside
  // buildPatch) is fully initialized before the first call.
  const mainFormDirty = Object.keys(buildPatch()).length > 0
  const anyDirty = mainFormDirty || contactsDirty || emergencyDirty || addressDirty || educationDirty

  // Warn before closing/navigating away when there are unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!anyDirty) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [anyDirty])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    const patch         = buildPatch()
    const hasMainChange = Object.keys(patch).length > 0
    const hasSubChange  = contactsDirty || emergencyDirty || addressDirty || educationDirty

    if (!hasMainChange && !hasSubChange) {
      if (photoJustSaved) {
        toast({
          title:       locale === 'ar' ? 'تم حفظ الصورة بالفعل' : 'Photo already saved',
          description: locale === 'ar'
            ? 'تم حفظ صورة الملف الشخصي عند رفعها. لا توجد تغييرات أخرى للحفظ.'
            : 'Profile photo was saved when you uploaded it. No other changes to save.',
        })
      } else {
        toast({ title: locale === 'ar' ? 'لا توجد تغييرات' : 'No changes', description: locale === 'ar' ? 'لا شيء لحفظه.' : 'Nothing to save.' })
      }
      return
    }

    start(async () => {
      const savedSections: string[] = []
      const failedSections: string[] = []

      // ── 1. Main form (person record + project + schedule) ──────────────
      if (hasMainChange) {
        try {
          const result = await updatePerson(person.id, patch)

          const projectChanged = state.projectId !== initial.projectId || state.allocationPct !== initial.allocationPct
          if (projectChanged) {
            const alloc = state.allocationPct !== '' ? Number(state.allocationPct) : null
            const projResult = await updatePersonProject(person.id, state.projectId || null, alloc)
            if (projResult.noAssignment) {
              failedSections.push(locale === 'ar' ? 'المشروع (لا يوجد تعيين عمل — استخدم إجراءات التوظيف لإنشاء واحد)' : 'Project (no worker assignment found — use Employment Actions to create one)')
            } else if (projResult.error) {
              failedSections.push(`${locale === 'ar' ? 'المشروع' : 'Project'}: ${projResult.error}`)
            }
          }

          const scheduleChanged = state.workScheduleId && state.workScheduleId !== initial.workScheduleId
          if (scheduleChanged) {
            const schedResult = await assignWorkSchedule({
              personId:           person.id,
              legalEntityId:      legalEntityId,
              workScheduleId:     state.workScheduleId,
              effectiveStartDate: new Date().toISOString().split('T')[0],
              assignmentReason:   'HR_ADMIN_UPDATE',
            })
            if (schedResult.error) failedSections.push(`${locale === 'ar' ? 'جدول العمل' : 'Work Schedule'}: ${schedResult.error}`)
          }

          savedSections.push(
            result.changedFields.length > 0
              ? (locale === 'ar'
                ? `${result.changedFields.length} ${result.changedFields.length === 1 ? 'حقل موظف' : 'حقول موظف'}`
                : `${result.changedFields.length} person field${result.changedFields.length === 1 ? '' : 's'}`)
              : (locale === 'ar' ? 'سجل الموظف' : 'person record'),
          )
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')
          failedSections.push(`${locale === 'ar' ? 'سجل الموظف' : 'Person record'}: ${message}`)
          if (message.startsWith('[')) {
            try {
              const issues = JSON.parse(message) as Array<{ path: string[]; message: string }>
              const next: Record<string, string> = {}
              for (const i of issues) next[i.path.join('.')] = i.message
              setErrors(next)
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // ── 2. Contacts ────────────────────────────────────────────────────
      if (contactsDirty) {
        const r = await contactsRef.current?.save()
        if (r?.success) savedSections.push(locale === 'ar' ? 'جهات الاتصال' : 'contacts')
        else if (r?.error) failedSections.push(`${locale === 'ar' ? 'جهات الاتصال' : 'Contacts'}: ${r.error}`)
      }

      // ── 3. Emergency contact ───────────────────────────────────────────
      if (emergencyDirty) {
        const r = await emergencyRef.current?.save()
        if (r?.success) savedSections.push(locale === 'ar' ? 'جهة اتصال الطوارئ' : 'emergency contact')
        else if (r?.error) failedSections.push(`${locale === 'ar' ? 'جهة اتصال الطوارئ' : 'Emergency contact'}: ${r.error}`)
      }

      // ── 4. Home address ────────────────────────────────────────────────
      if (addressDirty) {
        const r = await addressRef.current?.save()
        if (r?.success) savedSections.push(locale === 'ar' ? 'عنوان السكن' : 'home address')
        else if (r?.error) failedSections.push(`${locale === 'ar' ? 'عنوان السكن' : 'Home address'}: ${r.error}`)
      }

      // ── 5. Qualification ───────────────────────────────────────────────
      if (educationDirty) {
        const r = await educationRef.current?.save()
        if (r?.success) savedSections.push(locale === 'ar' ? 'المؤهل' : 'qualification')
        else if (r?.error) failedSections.push(`${locale === 'ar' ? 'المؤهل' : 'Qualification'}: ${r.error}`)
      }

      // ── Result ──────────────────────────────────────────────────────────
      if (failedSections.length > 0) {
        toast({
          title:       locale === 'ar'
            ? (failedSections.length === 1 ? 'فشل حفظ قسم واحد' : `فشل حفظ ${failedSections.length} أقسام`)
            : (failedSections.length === 1 ? '1 section failed to save' : `${failedSections.length} sections failed`),
          description: failedSections.join('\n'),
          variant:     'destructive',
        })
        // Stay on edit page; refresh server state for sections that did save.
        router.refresh()
      } else {
        const desc = savedSections.length > 0
          ? savedSections.join(', ') + (locale === 'ar' ? ' تم التحديث. تم تسجيل سجل التدقيق.' : ' updated. Audit row written.')
          : (locale === 'ar' ? 'لم تتغيّر أي حقول.' : 'No fields changed.')
        toast({ title: locale === 'ar' ? 'تم حفظ جميع التغييرات' : 'All changes saved', description: desc })
        setPhotoJustSaved(false)
        router.push(`/persons/${person.id}`)
        router.refresh()
      }
    })
  }

  // Group custom fields by section for the same layout used by the create form.
  const customFieldsBySection = customFields.reduce<Record<string, FieldDefinition[]>>(
    (acc, f) => {
      const key = f.sectionCode ?? 'CUSTOM'
      acc[key] ??= []
      acc[key].push(f)
      return acc
    },
    {},
  )

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ── Profile Photo ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'الصورة الشخصية' : 'Profile Photo'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <PhotoUploadWidget
            personId={person.id}
            currentPhotoUrl={person.profilePhotoUrl ?? null}
            initials={`${person.firstNameEn?.[0] ?? ''}${person.lastNameEn?.[0] ?? ''}`.toUpperCase() || undefined}
            onSaved={() => setPhotoJustSaved(true)}
          />
        </div>
      </div>

      {/* ── Personal Info ──────────────────────────────────────────────── */}
      {/* overflow:visible so NationalitySelect's position:absolute dropdown isn't clipped */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'المعلومات الشخصية' : 'Personal Information'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="firstNameEn" label={locale === 'ar' ? 'الاسم الأول' : 'First name'} required suffix="EN" error={errors['firstNameEn']}>
              <Input id="firstNameEn" required value={state.firstNameEn}
                onChange={e => patch('firstNameEn', e.target.value)}
                onBlur={async () => {
                  const full = [state.firstNameEn, state.middleNameEn, state.lastNameEn].filter(Boolean).join(' ')
                  if (full) {
                    const ar = await autoTranslate(full)
                    if (ar) patch('fullNameAr', ar)
                  }
                }}
                disabled={pending} />
            </Field>
            <Field id="middleNameEn" label={locale === 'ar' ? 'الاسم الأوسط' : 'Middle name'} suffix="EN">
              <Input id="middleNameEn" value={state.middleNameEn}
                onChange={e => patch('middleNameEn', e.target.value)} disabled={pending} />
            </Field>
            <Field id="lastNameEn" label={locale === 'ar' ? 'اسم العائلة' : 'Last name'} required suffix="EN" error={errors['lastNameEn']}>
              <Input id="lastNameEn" required value={state.lastNameEn}
                onChange={e => patch('lastNameEn', e.target.value)}
                onBlur={async () => {
                  const full = [state.firstNameEn, state.middleNameEn, state.lastNameEn].filter(Boolean).join(' ')
                  if (full) {
                    const ar = await autoTranslate(full)
                    if (ar) patch('fullNameAr', ar)
                  }
                }}
                disabled={pending} />
            </Field>
          </div>

          <Field id="fullNameAr" label={locale === 'ar' ? 'الاسم الكامل' : 'Full name'} required suffix="AR" error={errors['fullNameAr']}
            help={arTranslating ? (locale === 'ar' ? 'جارٍ الترجمة التلقائية…' : 'Auto-translating…') : (locale === 'ar' ? 'يُملأ تلقائياً من الاسم بالإنجليزية — يمكنك التعديل مباشرة.' : 'Auto-populated from English name — you may edit directly.')}>
            <Input id="fullNameAr" dir="rtl" lang="ar" required className="text-end"
              value={state.fullNameAr}
              onChange={e => patch('fullNameAr', e.target.value)}
              placeholder="سارة أحمد" disabled={pending || arTranslating}
              style={{ opacity: arTranslating ? 0.6 : undefined }} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="preferredName" label={locale === 'ar' ? 'الاسم المفضّل' : 'Preferred name'}>
              <Input id="preferredName" value={state.preferredName}
                onChange={e => patch('preferredName', e.target.value)} disabled={pending} />
            </Field>
            <Field id="salutation" label={locale === 'ar' ? 'اللقب' : 'Salutation'}>
              <Input id="salutation" value={state.salutation}
                onChange={e => patch('salutation', e.target.value)} disabled={pending} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ الميلاد' : 'Date of birth'}
              required
              value={state.dateOfBirth}
              onChange={v => patch('dateOfBirth', v)}
              disabled={pending}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="gender" label={locale === 'ar' ? 'الجنس' : 'Gender'} required>
              <Select value={state.gender} onValueChange={v => patch('gender', v as Gender)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{locale === 'ar' ? 'ذكر' : 'Male'}</SelectItem>
                  <SelectItem value="FEMALE">{locale === 'ar' ? 'أنثى' : 'Female'}</SelectItem>
                  <SelectItem value="NOT_SPECIFIED">{locale === 'ar' ? 'غير محدد' : 'Not specified'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="maritalStatus" label={locale === 'ar' ? 'الحالة الاجتماعية' : 'Marital status'}>
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
            </Field>
            <Field id="numberOfDependents" label={locale === 'ar' ? 'عدد المعالين' : 'Number of dependents'}>
              <Input id="numberOfDependents" type="number" min={0} max={20}
                value={state.numberOfDependents}
                onChange={e => patch('numberOfDependents', Number(e.target.value))}
                disabled={pending} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="nationalityCode" label={locale === 'ar' ? 'الجنسية' : 'Nationality'} required>
              <NationalitySelect
                id="nationalityCode"
                value={state.nationalityCode || null}
                onChange={code => {
                  const category = deriveNationalityCategory(code)
                  setState(s => ({ ...s, nationalityCode: code, nationalityCategory: category }))
                }}
                required
                disabled={pending}
              />
            </Field>
            <Field id="nationalityCategory" label={locale === 'ar' ? 'فئة الجنسية' : 'Nationality category'} required
              help={state.nationalityCategory === 'UAE_NATIONAL' ? (locale === 'ar' ? 'مُعيّنة تلقائياً من الجنسية.' : 'Auto-set from nationality.') : undefined}>
              <Select value={state.nationalityCategory}
                onValueChange={v => setNationalityCategory(v as NationalityCategory)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UAE_NATIONAL">{locale === 'ar' ? 'مواطن إماراتي' : 'UAE National'}</SelectItem>
                  <SelectItem value="GCC_NATIONAL">{locale === 'ar' ? 'مواطن خليجي' : 'GCC National'}</SelectItem>
                  <SelectItem value="EXPAT">{locale === 'ar' ? 'وافد' : 'Expat'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="religion" label={locale === 'ar' ? 'الديانة (اختياري)' : 'Religion (optional)'}>
              <Input id="religion" value={state.religion}
                onChange={e => patch('religion', e.target.value)} disabled={pending} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={state.religionConsentGiven}
              onChange={e => patch('religionConsentGiven', e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent" disabled={pending} />
            {locale === 'ar' ? 'تم الحصول على موافقة الديانة (PDPL — مطلوبة عند تسجيل الديانة)' : 'Religion consent given (PDPL — required if religion is recorded)'}
          </label>

          {/* Blood Type — PDPL-sensitive */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="bloodType" label={locale === 'ar' ? 'فصيلة الدم' : 'Blood Type'}
              help={locale === 'ar' ? 'حساسة وفق PDPL — تتطلب موافقة البيانات الحساسة. لا تُعرض في القوائم العامة.' : 'PDPL-sensitive — requires sensitive data consent. Never shown in broad lists.'}>
              <Select value={state.bloodType || undefined}
                onValueChange={v => patch('bloodType', v)} disabled={pending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
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
            </Field>
          </div>
        </div>
      </div>

      {/* ── PII / Identity Documents ───────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'الوثائق الرسمية' : 'Identity Documents'}
            <Badge className="ms-2 align-middle" variant="secondary">{locale === 'ar' ? 'PDPL · مُشفّر' : 'PDPL · encrypted'}</Badge>
            {piiLocked && <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? 'للقراءة فقط · مُخفاة' : 'read-only · masked'}</Badge>}
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-5">
          {piiLocked && (
            <p className="rounded-md bg-surface p-3 text-xs text-ink-3">
              {locale === 'ar'
                ? 'البيانات الشخصية مُخفاة للمستخدم الحالي. لا يمكن تعديل المعرّفات الحساسة حتى يكون للمستخدم دور HR_ADMIN أو HR_DIRECTOR أو SUPER_ADMIN. يبقى هذا القسم للقراءة فقط.'
                : 'PII is masked for the current viewer. Sensitive identifiers cannot be edited until the caller has HR_ADMIN, HR_DIRECTOR, or SUPER_ADMIN. This block stays read-only.'}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="emiratesId" label={locale === 'ar' ? 'الهوية الإماراتية' : 'Emirates ID'} error={errors['emiratesId']}
              help={locale === 'ar' ? 'الصيغة: 784-XXXX-XXXXXXX-X' : 'Format: 784-XXXX-XXXXXXX-X'}>
              <Input id="emiratesId" value={state.emiratesId}
                onChange={e => patch('emiratesId', e.target.value)}
                placeholder="784-XXXX-XXXXXXX-X" className="font-mono"
                disabled={pending || piiLocked} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'انتهاء الهوية الإماراتية' : 'Emirates ID expiry'}
              value={state.emiratesIdExpiry}
              onChange={v => patch('emiratesIdExpiry', v)}
              disabled={pending || piiLocked}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field id="passportNumber" label={locale === 'ar' ? 'رقم جواز السفر' : 'Passport number'} className="sm:col-span-2">
              <Input id="passportNumber" value={state.passportNumber}
                onChange={e => patch('passportNumber', e.target.value)} className="font-mono"
                disabled={pending || piiLocked} />
            </Field>
            <Field id="passportCountry" label={locale === 'ar' ? 'دولة الإصدار (ISO-3)' : 'Issuing country (ISO-3)'}>
              <Input id="passportCountry" maxLength={3} value={state.passportCountry}
                onChange={e => patch('passportCountry', e.target.value.toUpperCase())}
                className="uppercase" disabled={pending || piiLocked} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'انتهاء جواز السفر' : 'Passport expiry'}
              value={state.passportExpiry}
              onChange={v => patch('passportExpiry', v)}
              disabled={pending || piiLocked}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field id="visaNumber" label={locale === 'ar' ? 'رقم التأشيرة' : 'Visa number'}>
              <Input id="visaNumber" value={state.visaNumber}
                onChange={e => patch('visaNumber', e.target.value)} disabled={pending} />
            </Field>
            <Field id="visaType" label={locale === 'ar' ? 'نوع التأشيرة' : 'Visa type'}>
              <Input id="visaType" value={state.visaType}
                onChange={e => patch('visaType', e.target.value)} disabled={pending} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'انتهاء التأشيرة' : 'Visa expiry'}
              value={state.visaExpiry}
              onChange={v => patch('visaExpiry', v)}
              disabled={pending}
            />
            <Field id="visaStatus" label={locale === 'ar' ? 'حالة التأشيرة' : 'Visa status'}>
              <Select value={state.visaStatus || undefined}
                onValueChange={v => patch('visaStatus', v as VisaStatus)} disabled={pending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VALID">{locale === 'ar' ? 'سارية' : 'Valid'}</SelectItem>
                  <SelectItem value="EXPIRING">{locale === 'ar' ? 'قاربت الانتهاء' : 'Expiring'}</SelectItem>
                  <SelectItem value="EXPIRED">{locale === 'ar' ? 'منتهية' : 'Expired'}</SelectItem>
                  <SelectItem value="CANCELLED">{locale === 'ar' ? 'ملغاة' : 'Cancelled'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="labourCardNumber" label={locale === 'ar' ? 'رقم بطاقة العمل' : 'Labour card #'}>
              <Input id="labourCardNumber" value={state.labourCardNumber}
                onChange={e => patch('labourCardNumber', e.target.value)} disabled={pending} />
            </Field>
            <Field id="mohreLabourPermitNumber" label={locale === 'ar' ? 'رقم تصريح وزارة الموارد البشرية' : 'MoHRE permit #'}>
              <Input id="mohreLabourPermitNumber" value={state.mohreLabourPermitNumber}
                onChange={e => patch('mohreLabourPermitNumber', e.target.value)} disabled={pending} />
            </Field>
            <Field id="familyBookNumber" label={locale === 'ar' ? 'رقم خلاصة القيد (مواطنو الإمارات)' : 'Family book # (UAE Nationals)'}>
              <Input id="familyBookNumber" value={state.familyBookNumber}
                onChange={e => patch('familyBookNumber', e.target.value)} disabled={pending} />
            </Field>
          </div>

          {state.nationalityCategory === 'UAE_NATIONAL' && (
            <Field id="nafisRegistrationNumber" label={locale === 'ar' ? 'رقم تسجيل نافس' : 'Nafis registration #'}
              help={locale === 'ar' ? 'مطلوب لتقارير التوطين.' : 'Required for Emiratisation reporting.'}>
              <Input id="nafisRegistrationNumber" value={state.nafisRegistrationNumber}
                onChange={e => patch('nafisRegistrationNumber', e.target.value)} disabled={pending} />
            </Field>
          )}
        </div>
      </div>

      {/* ── Insurance ──────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'التأمين' : 'Insurance'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="insuranceProviderName" label={locale === 'ar' ? 'المزوّد' : 'Provider'}>
              <Input id="insuranceProviderName" value={state.insuranceProviderName}
                onChange={e => patch('insuranceProviderName', e.target.value)} disabled={pending} />
            </Field>
            <Field id="insuranceCardNumber" label={locale === 'ar' ? 'رقم البطاقة' : 'Card #'}>
              <Input id="insuranceCardNumber" value={state.insuranceCardNumber}
                onChange={e => patch('insuranceCardNumber', e.target.value)} disabled={pending} />
            </Field>
            <Field id="insuranceMemberId" label={locale === 'ar' ? 'معرّف العضو' : 'Member ID'}>
              <Input id="insuranceMemberId" value={state.insuranceMemberId}
                onChange={e => patch('insuranceMemberId', e.target.value)} disabled={pending} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field id="insuranceNetwork" label={locale === 'ar' ? 'الشبكة' : 'Network'}>
              <Input id="insuranceNetwork" value={state.insuranceNetwork}
                onChange={e => patch('insuranceNetwork', e.target.value)} disabled={pending} />
            </Field>
            <Field id="insuranceCategory" label={locale === 'ar' ? 'الفئة' : 'Category'}>
              <Input id="insuranceCategory" value={state.insuranceCategory}
                onChange={e => patch('insuranceCategory', e.target.value)} disabled={pending} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}
              value={state.insuranceEffectiveDate}
              onChange={v => patch('insuranceEffectiveDate', v)}
              disabled={pending}
            />
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry date'}
              value={state.insuranceExpiryDate}
              onChange={v => patch('insuranceExpiryDate', v)}
              disabled={pending}
            />
          </div>
          <Field id="insuranceStatus" label={locale === 'ar' ? 'الحالة' : 'Status'}>
            <Select value={state.insuranceStatus || undefined}
              onValueChange={v => patch('insuranceStatus', v as InsuranceStatus)} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ENROLLED">{locale === 'ar' ? 'مُسجَّل' : 'Enrolled'}</SelectItem>
                <SelectItem value="PENDING_ENROLMENT">{locale === 'ar' ? 'قيد التسجيل' : 'Pending enrolment'}</SelectItem>
                <SelectItem value="RENEWAL_DUE">{locale === 'ar' ? 'مستحق التجديد' : 'Renewal due'}</SelectItem>
                <SelectItem value="EXPIRED">{locale === 'ar' ? 'منتهٍ' : 'Expired'}</SelectItem>
                <SelectItem value="CANCELLED">{locale === 'ar' ? 'ملغى' : 'Cancelled'}</SelectItem>
                <SelectItem value="NOT_ENROLLED">{locale === 'ar' ? 'غير مُسجَّل' : 'Not enrolled'}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* ── Employment Assignment ──────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'تعيين العمل' : 'Employment Assignment'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="currentPositionId" label={locale === 'ar' ? 'المنصب' : 'Position'}>
              <Select value={state.currentPositionId || '__none__'}
                onValueChange={v => patch('currentPositionId', v === '__none__' ? '' : v)}
                disabled>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— اختر المنصب —' : '— select position —'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                  {positionOptions.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titleEn} {p.positionCode ? `(${p.positionCode})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="currentDepartmentId" label={locale === 'ar' ? 'القسم' : 'Department'}>
              <Select value={state.currentDepartmentId || '__none__'}
                onValueChange={v => patch('currentDepartmentId', v === '__none__' ? '' : v)}
                disabled>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— اختر القسم —' : '— select department —'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                  {departmentOptions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nameEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="currentGradeId" label={locale === 'ar' ? 'الدرجة' : 'Grade'}>
              <Select value={state.currentGradeId || '__none__'}
                onValueChange={v => patch('currentGradeId', v === '__none__' ? '' : v)}
                disabled>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— اختر الدرجة —' : '— select grade —'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                  {gradeOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.gradeCode} — {g.gradeNameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="currentLocationId" label={locale === 'ar' ? 'موقع العمل' : 'Work location'}>
              <Select value={state.currentLocationId || '__none__'}
                onValueChange={v => patch('currentLocationId', v === '__none__' ? '' : v)}
                disabled>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— اختر الموقع —' : '— select location —'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                  {locationOptions.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} — {l.nameEn}{l.nameAr ? ` · ${l.nameAr}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field id="lineManagerId" label={locale === 'ar' ? 'المدير المباشر' : 'Line manager'}>
            <Select value={state.lineManagerId || '__none__'}
              onValueChange={v => patch('lineManagerId', v === '__none__' ? '' : v)}
              disabled>
              <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— اختر المدير —' : '— select manager —'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                {managerOptions.map(m => {
                  const name  = m.fullNameEn ?? m.personNumber ?? m.id
                  const label = m.personNumber && m.departmentNameEn
                    ? `${name} — ${m.personNumber} — ${m.departmentNameEn}`
                    : m.personNumber
                      ? `${name} — ${m.personNumber}`
                      : name
                  return <SelectItem key={m.id} value={m.id}>{label}</SelectItem>
                })}
              </SelectContent>
            </Select>
          </Field>
          <Field id="assignmentStatus" label={locale === 'ar' ? 'حالة التعيين' : 'Assignment status'}>
            <Select value={state.assignmentStatus || '__none__'}
              onValueChange={v => patch('assignmentStatus', v === '__none__' ? '' : v)}
              disabled>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{locale === 'ar' ? 'نشط' : 'Active'}</SelectItem>
                <SelectItem value="PENDING_HIRE">{locale === 'ar' ? 'قيد التوظيف' : 'Pending hire'}</SelectItem>
                <SelectItem value="INACTIVE">{locale === 'ar' ? 'غير نشط' : 'Inactive'}</SelectItem>
                <SelectItem value="TERMINATED">{locale === 'ar' ? 'منتهٍ' : 'Terminated'}</SelectItem>
                <SelectItem value="ON_LEAVE">{locale === 'ar' ? 'في إجازة' : 'On leave'}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {/* Task 2C — Functional Manager */}
          <Field id="dottedLineManagerId" label={locale === 'ar' ? 'المدير الوظيفي (تبعية غير مباشرة)' : 'Functional manager (dotted-line)'}>
            <Select value={state.dottedLineManagerId || '__none__'}
              onValueChange={v => patch('dottedLineManagerId', v === '__none__' ? '' : v)}
              disabled>
              <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— بلا —' : '— none —'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                {managerOptions.map(m => {
                  const name  = m.fullNameEn ?? m.personNumber ?? m.id
                  const label = m.personNumber && m.departmentNameEn
                    ? `${name} — ${m.personNumber} — ${m.departmentNameEn}`
                    : m.personNumber ? `${name} — ${m.personNumber}` : name
                  return <SelectItem key={m.id} value={m.id}>{label}</SelectItem>
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-3 mt-1">{locale === 'ar' ? 'تبعية إدارية غير مباشرة — لا تؤثر على اعتمادات الإجازات أو سير العمل' : 'Dotted-line reporting — no impact on leave or workflow approvals'}</p>
          </Field>
          {/* Task 2C — Worker Category + Employee Code + Notice Period */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="workerCategory" label={locale === 'ar' ? 'فئة العامل' : 'Worker category'}>
              <Select value={state.workerCategory || '__none__'}
                onValueChange={v => patch('workerCategory', v === '__none__' ? '' : v)}
                disabled={pending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                  <SelectItem value="FTE">FTE</SelectItem>
                  <SelectItem value="CONTINGENT">{locale === 'ar' ? 'عامل مؤقت' : 'Contingent'}</SelectItem>
                  <SelectItem value="CONTRACTOR">{locale === 'ar' ? 'متعاقد' : 'Contractor'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="employeeCode" label={locale === 'ar' ? 'رمز الموظف' : 'Employee code'}>
              <Input id="employeeCode" type="text" maxLength={50}
                value={state.employeeCode}
                onChange={e => patch('employeeCode', e.target.value)}
                disabled={pending}
                placeholder="e.g. Avaniis-EMP-4421" />
            </Field>
            <Field id="noticePeriodDays" label={locale === 'ar' ? 'فترة الإشعار (أيام)' : 'Notice period (days)'}>
              <Input id="noticePeriodDays" type="number" min={0} max={180}
                value={state.noticePeriodDays}
                onChange={e => patch('noticePeriodDays', e.target.value)}
                disabled={pending}
                placeholder="30" />
            </Field>
          </div>
          {/* Task 2D — Working Schedule */}
          <Field id="workScheduleId" label={locale === 'ar' ? 'جدول العمل' : 'Working schedule'}>
            <Select value={state.workScheduleId || '__none__'}
              onValueChange={v => patch('workScheduleId', v === '__none__' ? '' : v)}
              disabled={pending}>
              <SelectTrigger><SelectValue placeholder={locale === 'ar' ? '— الافتراضي للجهة —' : '— entity default —'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{locale === 'ar' ? '— الافتراضي للجهة —' : '— entity default —'}</SelectItem>
                {scheduleOptions.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.scheduleCode} — {s.scheduleNameEn}{s.isDefault ? (locale === 'ar' ? ' (افتراضي)' : ' (default)') : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-3 mt-1">{locale === 'ar' ? 'اتركه على الافتراضي للجهة لوراثة الجدول الافتراضي للجهة' : 'Leave at entity default to inherit the entity’s default schedule'}</p>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="projectId" label={locale === 'ar' ? 'المشروع' : 'Project'}>
              <Select value={state.projectId || '__none__'}
                onValueChange={v => patch('projectId', v === '__none__' ? '' : v)}
                disabled={pending || !hasWorkerAssignment}>
                <SelectTrigger>
                  <SelectValue placeholder={hasWorkerAssignment ? (locale === 'ar' ? '— بلا مشروع —' : '— no project —') : (locale === 'ar' ? 'لا يوجد سجل تعيين نشط' : 'No active assignment record')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{locale === 'ar' ? '— بلا —' : '— none —'}</SelectItem>
                  {projectOptions.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nameEn}{p.nameAr ? ` · ${p.nameAr}` : ''}{p.code ? ` (${p.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!hasWorkerAssignment && (
                <p className="text-xs text-ink-3 mt-1">
                  {locale === 'ar'
                    ? 'يتطلب المشروع وجود تعيين عمل. أُنشئ هذا الموظف بدون منصب وقسم — استخدم إجراءات التوظيف لإنشاء تعيين أولاً.'
                    : 'Project requires a worker assignment. This employee was created without a position and department — use employment actions to create an assignment first.'}
                </p>
              )}
            </Field>
            <Field id="allocationPct" label={locale === 'ar' ? 'نسبة التخصيص %' : 'Allocation %'}>
              <Input id="allocationPct" type="number" min={0} max={100}
                value={state.allocationPct}
                onChange={e => patch('allocationPct', e.target.value)}
                disabled={pending || !state.projectId || !hasWorkerAssignment}
                placeholder="100" />
            </Field>
          </div>
        </div>
      </div>

      {/* ── Preferences ────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'التفضيلات' : 'Preferences'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="preferredLanguage" label={locale === 'ar' ? 'اللغة المفضّلة' : 'Preferred language'}>
              <Select value={state.preferredLanguage}
                onValueChange={v => patch('preferredLanguage', v as PreferredLang)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="notificationChannel" label={locale === 'ar' ? 'قناة الإشعارات' : 'Notification channel'}>
              <Select value={state.notificationChannel}
                onValueChange={v => patch('notificationChannel', v as NotifyChannel)} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUSH_AND_EMAIL">{locale === 'ar' ? 'إشعار فوري وبريد' : 'Push and email'}</SelectItem>
                  <SelectItem value="EMAIL">{locale === 'ar' ? 'بريد فقط' : 'Email only'}</SelectItem>
                  <SelectItem value="PUSH">{locale === 'ar' ? 'إشعار فوري فقط' : 'Push only'}</SelectItem>
                  <SelectItem value="NONE">{locale === 'ar' ? 'بلا' : 'None'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      </div>

      {/* ── Custom fields (extra_data) ─────────────────────────────────── */}
      {customFields.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'حقول مخصّصة' : 'Custom Fields'}
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }} className="space-y-5">
            {formConfig.sections.length > 0
              ? formConfig.sections.map(section => {
                  const fieldsInSection = customFieldsBySection[section.sectionCode] ?? []
                  if (fieldsInSection.length === 0) return null
                  return (
                    <div key={section.sectionCode}>
                      <h3 className="mb-3 text-sm font-medium text-ink-2">
                        {section.labelEn} <span className="text-ink-3">/ {section.labelAr}</span>
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fieldsInSection.map(f => renderCustomField(f, state.extraData, patchExtra, pending))}
                      </div>
                    </div>
                  )
                })
              : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customFields.map(f => renderCustomField(f, state.extraData, patchExtra, pending))}
                </div>
              )}
          </div>
        </div>
      )}

      {/* ── Contacts (editable) ───────────────────────────────────────── */}
      <ContactsEditor
        ref={contactsRef}
        personId={person.id}
        personName={person.fullNameEn ?? person.personNumber ?? ''}
        initialContacts={contacts}
        onDirtyChange={setContactsDirty}
      />

      {/* ── Emergency Contact ─────────────────────────────────────────── */}
      <EmergencyContactEditor
        ref={emergencyRef}
        personId={person.id}
        initial={emergencyContact}
        onDirtyChange={setEmergencyDirty}
      />

      {/* ── Home Address ──────────────────────────────────────────────── */}
      <HomeAddressEditor
        ref={addressRef}
        personId={person.id}
        initial={addresses.find(a => a.addressType === 'HOME_COUNTRY') ?? null}
        otherAddresses={addresses.filter(a => a.addressType !== 'HOME_COUNTRY')}
        onDirtyChange={setAddressDirty}
      />

      {/* ── Education / Qualification ─────────────────────────────────── */}
      <EducationEditor
        ref={educationRef}
        personId={person.id}
        initial={education}
        onDirtyChange={setEducationDirty}
      />

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button type="button" variant="outline" onClick={() => router.push(`/persons/${person.id}`)} disabled={pending}>
          {locale === 'ar' ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={pending} variant={anyDirty ? 'default' : 'secondary'}>
          {pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : anyDirty ? (locale === 'ar' ? 'حفظ التغييرات ●' : 'Save changes ●') : (locale === 'ar' ? 'حفظ التغييرات' : 'Save changes')}
        </Button>
      </div>
    </form>
  )
}

// ── Contacts editor ────────────────────────────────────────────────────────

const CONTACT_META: Array<{
  type:        string
  label:       string
  labelAr:     string
  placeholder: string
  inputType:   'email' | 'tel' | 'text'
  required?:   boolean
}> = [
  { type: 'WORK_EMAIL',       label: 'Work Email',          labelAr: 'البريد الإلكتروني للعمل',     placeholder: 'employee@company.com',    inputType: 'email', required: true },
  { type: 'PERSONAL_EMAIL',   label: 'Personal Email',      labelAr: 'البريد الإلكتروني الشخصي',    placeholder: 'personal@gmail.com',      inputType: 'email' },
  { type: 'MOBILE_PRIMARY',   label: 'Mobile (Primary)',    labelAr: 'الجوال (الأساسي)',            placeholder: '+971 50 000 0000',         inputType: 'tel' },
  { type: 'MOBILE_SECONDARY', label: 'Mobile (Secondary)',  labelAr: 'الجوال (الثانوي)',            placeholder: '+971 50 000 0000',         inputType: 'tel' },
  { type: 'WORK_PHONE',       label: 'Work Phone / Ext.',   labelAr: 'هاتف العمل / التحويلة',       placeholder: '+971 4 000 0000',          inputType: 'tel' },
  { type: 'HOME_PHONE',       label: 'Home Phone',          labelAr: 'هاتف المنزل',                 placeholder: '+971 4 000 0000',          inputType: 'tel' },
  { type: 'WHATSAPP',         label: 'WhatsApp',            labelAr: 'واتساب',                      placeholder: '+971 50 000 0000',         inputType: 'tel' },
]

const ContactsEditor = forwardRef<EditorHandle, {
  personId:        string
  personName:      string
  initialContacts: ContactRow[]
  onDirtyChange?:  (dirty: boolean) => void
}>(function ContactsEditor({ personId, personName, initialContacts, onDirtyChange }, ref) {
  const locale = useLocale()
  const initMap = Object.fromEntries(
    CONTACT_META.map(m => [
      m.type,
      initialContacts.find(c => c.contactType === m.type)?.contactValue ?? '',
    ]),
  )

  const [values,  setValues] = useState<Record<string, string>>(initMap)
  const [saved,   setSaved]  = useState(false)
  const [error,   setError]  = useState<string | null>(null)

  const hasWorkEmail = values['WORK_EMAIL']?.trim().length > 0
  const dirty        = CONTACT_META.some(m => values[m.type] !== initMap[m.type])

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    save: async () => {
      setError(null)
      setSaved(false)
      const entries = CONTACT_META.map(m => ({ type: m.type, value: values[m.type] ?? '' }))
      try {
        const result = await upsertPersonContacts(personId, entries)
        const total = result.inserted + result.updated + result.removed
        setSaved(true)
        return {
          success:     true,
          description: total === 0
            ? (locale === 'ar' ? 'لم تُكتشف أي تغييرات على جهات الاتصال.' : 'No contact changes detected.')
            : (locale === 'ar'
              ? `${result.inserted} مُضافة · ${result.updated} مُحدّثة · ${result.removed} مُزالة`
              : `${result.inserted} added · ${result.updated} updated · ${result.removed} removed`),
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')
        setError(msg)
        return { success: false, error: msg }
      }
    },
  }), [dirty, values, personId, locale])

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'جهات الاتصال' : 'Contacts'}
          {dirty && <span style={{ marginLeft: 8, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontWeight: 500 }}>{locale === 'ar' ? '● غير محفوظة' : '● unsaved'}</span>}
        </h3>
        {saved && !dirty && (
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-approved-fg)', fontWeight: 500 }}>{locale === 'ar' ? '✓ تم الحفظ' : '✓ Saved'}</span>
        )}
      </div>

      <div style={{ padding: '16px 20px' }} className="space-y-4">

        {/* ── WORK_EMAIL missing warning ────────────────────────────────── */}
        {!hasWorkEmail && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-border)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--status-warning-fg)' }}>
                {locale === 'ar' ? `البريد الإلكتروني للعمل مفقود لـ ${personName || 'هذا الموظف'}` : `Work Email is missing for ${personName || 'this employee'}`}
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 'var(--text-caption)', color: 'var(--status-warning-fg)', lineHeight: 1.5 }}>
                {locale === 'ar'
                  ? 'بدون بريد إلكتروني للعمل لا يمكن للموظف استلام إشعارات الخطابات أو توقيع المستندات أو استخدام ميزات الخدمة الذاتية.'
                  : 'Without a Work Email the employee cannot receive letter notifications, sign documents, or use self-service features.'}
              </p>
              <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--status-warning-fg)', lineHeight: 1.6 }}>
                {locale === 'ar' ? (
                  <>
                    <strong>كيفية الإصلاح:</strong><br />
                    1. أدخل البريد الإلكتروني للعمل في حقل <strong>البريد الإلكتروني للعمل</strong> أدناه.<br />
                    2. انقر على <strong>حفظ التغييرات</strong> في أسفل الصفحة.<br />
                    3. سيسري البريد فوراً — لا حاجة لإعادة التشغيل.
                  </>
                ) : (
                  <>
                    <strong>How to fix:</strong><br />
                    1. Enter the employee&apos;s work email in the <strong>Work Email</strong> field below.<br />
                    2. Click <strong>Save changes</strong> at the bottom of the page.<br />
                    3. The email will take effect immediately — no restart required.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Contact fields grid ───────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          {CONTACT_META.map(m => (
            <div key={m.type} className="space-y-1.5">
              <Label htmlFor={`contact-${m.type}`} className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? m.labelAr : m.label}
                {m.required && <span className="ms-0.5 text-destructive">*</span>}
              </Label>
              <Input
                id={`contact-${m.type}`}
                type={m.inputType}
                value={values[m.type] ?? ''}
                onChange={e => {
                  setValues(v => ({ ...v, [m.type]: e.target.value }))
                  setSaved(false)
                }}
                placeholder={m.placeholder}
                style={
                  m.type === 'WORK_EMAIL' && !hasWorkEmail
                    ? { borderColor: 'var(--status-warning)', background: 'var(--status-warning-bg)' }
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        {error && (
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)', background: 'var(--status-rejected-bg)', padding: '8px 12px', borderRadius: 6, margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
})

// ── Field wrapper ──────────────────────────────────────────────────────────

function Field({
  id, label, required, suffix, error, help, className, children,
}: {
  id:        string
  label:     string
  required?: boolean
  suffix?:   string
  error?:    string
  help?:     string
  className?: string
  children:  React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id} className="text-xs font-semibold text-ink-1">
        {label}{required && <span className="ms-0.5 text-destructive">*</span>}
        {suffix && <span className="ms-2 text-xs font-normal uppercase tracking-wide text-ink-3">{suffix}</span>}
      </Label>
      {children}
      {error
        ? <p className="text-xs text-destructive">{error}</p>
        : help ? <p className="text-xs text-ink-3">{help}</p> : null}
    </div>
  )
}

// ── Custom-field renderer (parity with PersonNewForm) ─────────────────────

function renderCustomField(
  f:        FieldDefinition,
  values:   Record<string, unknown>,
  set:      (key: string, value: unknown) => void,
  disabled: boolean,
) {
  const id = `cf-${f.apiName}`
  const value = values[f.apiName]
  const options = (f.validationRules?.options as Array<{ value: string; labelEn: string }> | undefined) ?? []

  switch (f.dataType) {
    case 'CHECKBOX':
      return (
        <label key={f.id} className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" id={id} checked={!!value}
            onChange={e => set(f.apiName, e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-border accent-accent" />
          {f.labelEn} {f.labelAr ? <span className="text-ink-3">/ {f.labelAr}</span> : null}
        </label>
      )
    case 'PICKLIST':
      return (
        <div key={f.id} className="space-y-1.5">
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
        <div key={f.id} className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Textarea id={id} value={(value as string) ?? ''}
            onChange={e => set(f.apiName, e.target.value)} disabled={disabled} />
        </div>
      )
    case 'NUMBER':
    case 'CURRENCY':
      return (
        <div key={f.id} className="space-y-1.5">
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
        <div key={f.id} className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Input id={id} type="url" value={(value as string) ?? ''}
            onChange={e => set(f.apiName, e.target.value)} disabled={disabled} />
        </div>
      )
    case 'TEXT':
    default:
      return (
        <div key={f.id} className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium text-ink-2">{f.labelEn}</Label>
          <Input id={id} value={(value as string) ?? ''}
            onChange={e => set(f.apiName, e.target.value)} disabled={disabled} />
        </div>
      )
  }
}

// ── Emergency Contact Editor ───────────────────────────────────────────────

const RELATIONSHIP_OPTIONS = [
  { value: 'SPOUSE',  label: 'Spouse',  labelAr: 'الزوج/الزوجة' },
  { value: 'PARENT',  label: 'Parent',  labelAr: 'أحد الوالدين' },
  { value: 'SIBLING', label: 'Sibling', labelAr: 'أخ/أخت' },
  { value: 'CHILD',   label: 'Child',   labelAr: 'ابن/ابنة' },
  { value: 'FRIEND',  label: 'Friend',  labelAr: 'صديق' },
  { value: 'OTHER',   label: 'Other',   labelAr: 'أخرى' },
]

const EmergencyContactEditor = forwardRef<EditorHandle, {
  personId:       string
  initial:        EmergencyContactRow | null
  onDirtyChange?: (dirty: boolean) => void
}>(function EmergencyContactEditor({ personId, initial, onDirtyChange }, ref) {
  const locale = useLocale()
  const [name,         setName]  = useState(initial?.contactNameEn ?? '')
  const [relationship, setRel]   = useState(initial?.relationship  ?? '')
  const [phone,        setPhone] = useState(initial?.phonePrimary  ?? '')
  const [saved, setSaved]        = useState(false)

  const dirty = name !== (initial?.contactNameEn ?? '')
    || relationship !== (initial?.relationship ?? '')
    || phone        !== (initial?.phonePrimary  ?? '')

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    save: async () => {
      if (!name.trim()) return { success: false, error: locale === 'ar' ? 'الاسم مطلوب' : 'Name is required' }
      const result = await upsertPersonEmergencyContact(personId, {
        contactNameEn: name,
        relationship:  relationship || 'OTHER',
        phonePrimary:  phone,
      })
      if (result.success) { setSaved(true); return { success: true } }
      return { success: false, error: result.error }
    },
  }), [dirty, name, relationship, phone, personId, locale])

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'جهة اتصال الطوارئ' : 'Emergency Contact'}
          {dirty && <span style={{ marginLeft: 8, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontWeight: 500 }}>{locale === 'ar' ? '● غير محفوظة' : '● unsaved'}</span>}
        </h3>
        {saved && !dirty && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-approved-fg)', fontWeight: 500 }}>{locale === 'ar' ? '✓ تم الحفظ' : '✓ Saved'}</span>}
      </div>
      <div style={{ padding: '16px 20px' }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ec-name" label={locale === 'ar' ? 'الاسم' : 'Name'} required>
            <Input id="ec-name" value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field id="ec-rel" label={locale === 'ar' ? 'صلة القرابة' : 'Relationship'}>
            <Select value={relationship || undefined} onValueChange={setRel}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field id="ec-phone" label={locale === 'ar' ? 'الهاتف' : 'Phone'}>
            <Input id="ec-phone" value={phone} onChange={e => setPhone(e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  )
})

// ── Home Address Editor ────────────────────────────────────────────────────

const HomeAddressEditor = forwardRef<EditorHandle, {
  personId:       string
  initial:        AddressRow | null
  otherAddresses: AddressRow[]
  onDirtyChange?: (dirty: boolean) => void
}>(function HomeAddressEditor({ personId, initial, otherAddresses, onDirtyChange }, ref) {
  const locale = useLocale()
  const [line1,      setLine1]      = useState(initial?.addressLine1 ?? '')
  const [line2,      setLine2]      = useState(initial?.addressLine2 ?? '')
  const [city,       setCity]       = useState(initial?.city         ?? '')
  const [addrState,  setAddrState]  = useState(initial?.stateEmirate ?? '')
  const [country,    setCountry]    = useState(initial?.country      ?? '')
  const [postalCode, setPostalCode] = useState(initial?.postalCode   ?? '')
  const [poBox,      setPoBox]      = useState(initial?.poBox        ?? '')
  const [saved, setSaved]           = useState(false)

  const dirty = line1      !== (initial?.addressLine1 ?? '')
    || line2      !== (initial?.addressLine2 ?? '')
    || city       !== (initial?.city         ?? '')
    || addrState  !== (initial?.stateEmirate ?? '')
    || country    !== (initial?.country      ?? '')
    || postalCode !== (initial?.postalCode   ?? '')
    || poBox      !== (initial?.poBox        ?? '')

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    save: async () => {
      if (!line1.trim() || !city.trim() || !country.trim())
        return { success: false, error: locale === 'ar' ? 'العنوان السطر 1 والمدينة والدولة مطلوبة' : 'Address line 1, city and country are required' }
      const result = await upsertPersonHomeAddress(personId, {
        addressLine1: line1,
        addressLine2: line2 || null,
        city,
        stateEmirate: addrState || null,
        country,
        postalCode:   postalCode || null,
        poBox:        poBox || null,
      })
      if (result.success) { setSaved(true); return { success: true } }
      return { success: false, error: result.error }
    },
  }), [dirty, line1, line2, city, addrState, country, postalCode, poBox, personId, locale])

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'عنوان البلد الأصلي' : 'Home Country Address'}
          {dirty && <span style={{ marginLeft: 8, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontWeight: 500 }}>{locale === 'ar' ? '● غير محفوظة' : '● unsaved'}</span>}
        </h3>
        {saved && !dirty && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-approved-fg)', fontWeight: 500 }}>{locale === 'ar' ? '✓ تم الحفظ' : '✓ Saved'}</span>}
      </div>
      <div style={{ padding: '16px 20px' }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ha-line1" label={locale === 'ar' ? 'العنوان السطر 1' : 'Address line 1'} required>
            <Input id="ha-line1" value={line1} onChange={e => setLine1(e.target.value)} />
          </Field>
          <Field id="ha-line2" label={locale === 'ar' ? 'العنوان السطر 2' : 'Address line 2'}>
            <Input id="ha-line2" value={line2} onChange={e => setLine2(e.target.value)} />
          </Field>
          <Field id="ha-city" label={locale === 'ar' ? 'المدينة' : 'City'} required>
            <Input id="ha-city" value={city} onChange={e => setCity(e.target.value)} />
          </Field>
          <Field id="ha-state" label={locale === 'ar' ? 'الولاية / المحافظة' : 'State / Province'}>
            <Input id="ha-state" value={addrState} onChange={e => setAddrState(e.target.value)} />
          </Field>
          <Field id="ha-country" label={locale === 'ar' ? 'الدولة (ISO-3)' : 'Country (ISO-3)'} required>
            <Input id="ha-country" maxLength={3} className="uppercase" value={country}
              onChange={e => setCountry(e.target.value.toUpperCase())} />
          </Field>
          <Field id="ha-postal" label={locale === 'ar' ? 'الرمز البريدي' : 'Postal / ZIP code'}>
            <Input id="ha-postal" maxLength={20} value={postalCode} onChange={e => setPostalCode(e.target.value)} />
          </Field>
          <Field id="ha-pobox" label={locale === 'ar' ? 'صندوق البريد' : 'P.O. Box'}>
            <Input id="ha-pobox" maxLength={20} value={poBox} onChange={e => setPoBox(e.target.value)} />
          </Field>
        </div>
        {otherAddresses.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'عناوين أخرى مسجلة' : 'Other addresses on file'}</p>
            <ul className="space-y-2 text-sm">
              {otherAddresses.map(a => (
                <li key={a.id}>
                  <span className="text-xs uppercase text-ink-3">{a.addressType.replace(/_/g, ' ')}</span>
                  {' · '}{a.addressLine1}{a.city ? `, ${a.city}` : ''}, {a.country}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
})

// ── Education / Qualification Editor ──────────────────────────────────────

const EducationEditor = forwardRef<EditorHandle, {
  personId:       string
  initial:        EducationRow | null
  onDirtyChange?: (dirty: boolean) => void
}>(function EducationEditor({ personId, initial, onDirtyChange }, ref) {
  const locale = useLocale()
  const [institution,  setInstitution]  = useState(initial?.institutionName         ?? '')
  const [degreeType,   setDegreeType]   = useState(initial?.degreeType              ?? '')
  const [fieldOfStudy, setFieldOfStudy] = useState(initial?.fieldOfStudy            ?? '')
  const [country,      setEduCountry]   = useState(initial?.country                 ?? '')
  const [startYear,    setStartYear]    = useState(initial?.startYear?.toString()    ?? '')
  const [gradYear,     setGradYear]     = useState(initial?.graduationYear?.toString() ?? '')
  const [isHighest,    setIsHighest]    = useState(initial?.isHighestDegree ?? true)
  const [saved, setSaved]               = useState(false)

  const dirty = institution !== (initial?.institutionName         ?? '')
    || degreeType   !== (initial?.degreeType                      ?? '')
    || fieldOfStudy !== (initial?.fieldOfStudy                    ?? '')
    || country      !== (initial?.country                         ?? '')
    || startYear    !== (initial?.startYear?.toString()           ?? '')
    || gradYear     !== (initial?.graduationYear?.toString()      ?? '')
    || isHighest    !== (initial?.isHighestDegree ?? true)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    save: async () => {
      if (!institution.trim()) return { success: false, error: locale === 'ar' ? 'اسم المؤسسة التعليمية مطلوب' : 'Institution name is required' }
      const result = await upsertPersonEducation(personId, {
        institutionName: institution,
        degreeType:      degreeType   || null,
        fieldOfStudy:    fieldOfStudy || null,
        country:         country      || null,
        startYear:       startYear    ? parseInt(startYear, 10) : null,
        graduationYear:  gradYear     ? parseInt(gradYear,  10) : null,
        isHighestDegree: isHighest,
      })
      if (result.success) { setSaved(true); return { success: true } }
      return { success: false, error: result.error }
    },
  }), [dirty, institution, degreeType, fieldOfStudy, country, startYear, gradYear, isHighest, personId, locale])

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'أعلى مؤهل' : 'Highest Qualification'}
          {dirty && <span style={{ marginLeft: 8, fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontWeight: 500 }}>{locale === 'ar' ? '● غير محفوظ' : '● unsaved'}</span>}
        </h3>
        {saved && !dirty && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-approved-fg)', fontWeight: 500 }}>{locale === 'ar' ? '✓ تم الحفظ' : '✓ Saved'}</span>}
      </div>
      <div style={{ padding: '16px 20px' }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="edu-inst" label={locale === 'ar' ? 'المؤسسة التعليمية' : 'Institution'} required>
            <Input id="edu-inst" value={institution} onChange={e => setInstitution(e.target.value)} />
          </Field>
          <Field id="edu-degree" label={locale === 'ar' ? 'نوع الدرجة' : 'Degree type'}>
            <Input id="edu-degree" value={degreeType} onChange={e => setDegreeType(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: بكالوريوس العلوم' : 'e.g. Bachelor of Science'} />
          </Field>
          <Field id="edu-field" label={locale === 'ar' ? 'مجال الدراسة' : 'Field of study'}>
            <Input id="edu-field" value={fieldOfStudy} onChange={e => setFieldOfStudy(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: هندسة الحاسوب' : 'e.g. Computer Engineering'} />
          </Field>
          <Field id="edu-country" label={locale === 'ar' ? 'الدولة (ISO-3)' : 'Country (ISO-3)'}>
            <Input id="edu-country" maxLength={3} className="uppercase" value={country}
              onChange={e => setEduCountry(e.target.value.toUpperCase())} placeholder={locale === 'ar' ? 'مثال: ARE' : 'e.g. ARE'} />
          </Field>
          <Field id="edu-start" label={locale === 'ar' ? 'سنة البدء' : 'Start year'}>
            <Input id="edu-start" type="number" min={1950} max={new Date().getFullYear()}
              value={startYear} onChange={e => setStartYear(e.target.value)} />
          </Field>
          <Field id="edu-year" label={locale === 'ar' ? 'سنة التخرّج' : 'Graduation year'}>
            <Input id="edu-year" type="number" min={1950} max={new Date().getFullYear()}
              value={gradYear} onChange={e => setGradYear(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
          <input type="checkbox" checked={isHighest} onChange={e => setIsHighest(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-accent" />
          {locale === 'ar' ? 'وضع علامة كأعلى مؤهل مسجّل' : 'Mark as highest qualification on record'}
        </label>
      </div>
    </div>
  )
})
