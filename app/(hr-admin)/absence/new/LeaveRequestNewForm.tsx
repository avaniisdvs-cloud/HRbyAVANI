'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { DraftRestoreBanner, DraftSaveIndicator } from '@/components/ui/DraftRestoreBanner'
import { useDraftSave } from '@/hooks/useDraftSave'
import { createLeaveRequest, submitLeaveRequest } from '@/modules/absence'
import { daysBetween } from '@/lib/effective-date'
import { type Locale } from '@/lib/i18n'

interface PersonRow { id: string; personNumber: string; fullNameEn: string | null; fullNameAr: string; legalEntityId: string }
interface TypeRow   { id: string; typeCode: string; typeNameEn: string; typeNameAr: string | null; legalEntityId: string | null; requiresMedicalCert: boolean }

interface Props {
  persons:               PersonRow[]
  absenceTypes:          TypeRow[]
  currentRole:           string
  currentLegalEntityId:  string
  currentPersonId:       string | null
  currentUserId:         string
  lockToSelf?:           boolean
  certThresholdDays:     number
  onTypeChange?:         (typeCode: string) => void
  locale?:               Locale
}

// Roles that may submit on behalf of others
const HR_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

export function LeaveRequestNewForm({
  persons, absenceTypes, currentRole, currentLegalEntityId, currentPersonId,
  currentUserId, lockToSelf, certThresholdDays, onTypeChange, locale = 'en',
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,          setError]          = useState<string | null>(null)
  const [dateOrderError, setDateOrderError] = useState<string | null>(null)
  const [createdId,      setCreatedId]      = useState<string | null>(null)
  const [isDirty,        setIsDirty]        = useState(false)

  // ── Person selection mode (MANAGER only) ────────────────────────────────
  // 'self'        → apply for the manager themselves
  // 'team_member' → pick a team member from the scoped dropdown
  const isManager  = currentRole === 'MANAGER'
  const isEmployee = currentRole === 'EMPLOYEE'
  const isHrRole   = HR_ROLES.has(currentRole)

  // Self-service entry (?scope=self from the personal profile): the applicant is
  // forced to the logged-in user and the person picker / manager toggle is hidden.
  // Only meaningful when the session actually has a person record.
  const selfLocked = lockToSelf === true && !!currentPersonId

  const [personMode, setPersonMode] = useState<'self' | 'team_member'>('self')

  const defaultPersonId = currentPersonId ?? persons[0]?.id ?? ''

  const [personId,            setPersonId]            = useState(defaultPersonId)
  const [absenceTypeId,       setAbsenceTypeId]       = useState(absenceTypes[0]?.id ?? '')
  const [startDate,           setStartDate]           = useState('')
  const [endDate,             setEndDate]             = useState('')
  const [isHalfDay,           setIsHalfDay]           = useState(false)
  const [halfDayPeriod,       setHalfDayPeriod]       = useState<'AM' | 'PM'>('AM')
  const [notes,               setNotes]               = useState('')
  const [medicalCertRequired, setMedicalCertRequired] = useState(false)
  const [bannerVisible,       setBannerVisible]       = useState(false)
  const [confirmingSubmit,    setConfirmingSubmit]    = useState(false)

  // When MANAGER switches to "Apply for myself" lock personId to self
  useEffect(() => {
    if (isManager && personMode === 'self' && currentPersonId) {
      setPersonId(currentPersonId)
    }
  }, [isManager, personMode, currentPersonId])

  // ── Draft save ──────────────────────────────────────────────────────────

  const draftState = useMemo(() => ({
    personId, absenceTypeId, startDate, endDate,
    isHalfDay, halfDayPeriod, notes, medicalCertRequired,
  }), [personId, absenceTypeId, startDate, endDate, isHalfDay, halfDayPeriod, notes, medicalCertRequired])

  const draft = useDraftSave(
    `leave-request:${currentUserId}`,
    draftState,
    currentUserId,
    { expiryHours: 24 },
  )

  useEffect(() => { if (draft.hasDraft) setBannerVisible(true) }, [draft.hasDraft])

  function applyDraft() {
    const saved = draft.restoreDraft()
    if (!saved) return
    if (saved.personId)      setPersonId(saved.personId as string)
    if (saved.absenceTypeId) setAbsenceTypeId(saved.absenceTypeId as string)
    if (saved.startDate)     setStartDate(saved.startDate as string)
    if (saved.endDate)       setEndDate(saved.endDate as string)
    if (saved.isHalfDay !== undefined) setIsHalfDay(saved.isHalfDay as boolean)
    if (saved.halfDayPeriod) setHalfDayPeriod(saved.halfDayPeriod as 'AM' | 'PM')
    if (saved.notes)         setNotes(saved.notes as string)
    if (saved.medicalCertRequired !== undefined) setMedicalCertRequired(saved.medicalCertRequired as boolean)
    setBannerVisible(false)
  }

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setIsDirty(true) }
  }

  // ── Computed ────────────────────────────────────────────────────────────

  const computedDays = useMemo(() => {
    if (!startDate || !endDate) return 0
    if (isHalfDay) return 0.5
    // BR-AL-002 — do not compute positive duration for an inverted date range
    if (endDate < startDate) return 0
    return daysBetween(startDate, endDate) + 1
  }, [startDate, endDate, isHalfDay])

  const selectedType     = absenceTypes.find(t => t.id === absenceTypeId)
  const selectedTypeCode = selectedType?.typeCode ?? ''
  const isSickSelected   = selectedTypeCode === 'SICK'
  // Medical cert eligibility is driven by the absence type's requiresMedicalCert flag (DB config).
  // The checkbox is shown only when the selected type requires a cert — not for Annual Leave.
  const certEligible     = selectedType?.requiresMedicalCert === true
  // The threshold warning panel is SICK-specific: shows when days exceed the entity policy.
  const certPanelVisible = certEligible && isSickSelected && computedDays > certThresholdDays

  // M3: keep the medicalCertRequired checkbox in sync with policy-driven cert gate.
  // When certPanelVisible flips true the server will set medicalCertRequired=true
  // regardless — auto-check the box so the form visually matches the stored value.
  useEffect(() => {
    if (certPanelVisible) setMedicalCertRequired(true)
  }, [certPanelVisible])

  // Team members list (all persons except self, for MANAGER team_member mode)
  const teamMembers = useMemo(
    () => persons.filter(p => p.id !== currentPersonId),
    [persons, currentPersonId],
  )

  // ── Submit ──────────────────────────────────────────────────────────────

  const onSave = (thenSubmit: boolean) => {
    setError(null)
    setConfirmingSubmit(false)

    // H3: block manager submit when team_member mode has no available reports.
    if (isManager && personMode === 'team_member' && teamMembers.length === 0) {
      setError(locale === 'ar'
        ? 'لا يوجد أعضاء فريق — التبديل إلى "التقديم لنفسي" أو التواصل مع الموارد البشرية'
        : 'No team members found — switch to "Apply for myself" or contact HR')
      return
    }
    const person = persons.find(p => p.id === personId)
    if (!person)        { setError(locale === 'ar' ? 'يرجى اختيار الموظف قبل الحفظ' : 'Select a person before saving'); return }
    if (!absenceTypeId) { setError(locale === 'ar' ? 'يرجى اختيار نوع الإجازة' : 'Select a leave type'); return }
    if (!startDate || !endDate) {
      setError(locale === 'ar' ? 'تاريخ البدء وتاريخ الانتهاء مطلوبان' : 'Start date and end date are required')
      return
    }
    if (!isHalfDay && endDate < startDate) {
      setError(locale === 'ar' ? 'يجب أن يكون تاريخ الانتهاء في أو بعد تاريخ البدء' : 'End date must be on or after start date')
      return
    }
    if (computedDays <= 0) {
      setError(locale === 'ar' ? 'النطاق الزمني المحدد ينتج صفر أيام تقويمية' : 'The selected date range results in zero calendar days')
      return
    }

    startTransition(async () => {
      // Track ID in closure so catch block can redirect to draft if submit fails.
      let savedId: string | null = null
      try {
        const created = await createLeaveRequest({
          personId,
          legalEntityId: person.legalEntityId,
          absenceTypeId,
          startDate,
          endDate: isHalfDay ? startDate : endDate,
          durationDays: computedDays,
          isHalfDay,
          halfDayPeriod: isHalfDay ? halfDayPeriod : undefined,
          submittedVia: 'PORTAL',
          notes: notes || undefined,
          medicalCertRequired,
        })
        savedId = created.id
        setCreatedId(created.id)
        draft.clearDraft()
        setIsDirty(false)
        if (thenSubmit) {
          await submitLeaveRequest(created.id)
          router.push(`/absence/${created.id}?submitted=true`)
        } else {
          router.push(`/absence/${created.id}`)
        }
      } catch (e) {
        const rawMsg = e instanceof Error ? e.message : 'Could not save'
        // In production, Next.js sanitises server action errors to a generic RSC message.
        // When that happens and a draft was already created, redirect there so the user
        // can see their draft and retry submission from the decision bar.
        const isSanitised = rawMsg.includes('An error occurred in the Server Components render')
        if (isSanitised && savedId) {
          router.push(`/absence/${savedId}`)
          return
        }
        setError(isSanitised
          ? (locale === 'ar'
              ? 'حدث خطأ أثناء تقديم طلبك. ربما تم حفظ المسودة — راجع الإجازات والوقت ← طلبات الإجازة.'
              : 'Something went wrong while submitting your request. Your draft may have been saved — check Leave & Time → Leave Requests.')
          : rawMsg
        )
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {bannerVisible && draft.hasDraft && (
        <DraftRestoreBanner
          relativeTime={draft.relativeTime}
          onRestore={applyDraft}
          onDiscard={() => { draft.clearDraft(); setBannerVisible(false) }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">

        {/* ── Person selection ─────────────────────────────────────────── */}
        {selfLocked ? (
          // Self-service entry (?scope=self) — read-only, always the logged-in user,
          // for any role. Hides the manager team-member toggle / HR picker.
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الموظف' : 'Person'}</Label>
            <div
              className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-ink-2"
              aria-readonly="true"
            >
              {(() => {
                const self = persons.find(p => p.id === currentPersonId) ?? persons[0]
                return self
                  ? `${self.personNumber} — ${self.fullNameEn ?? self.fullNameAr}`
                  : '—'
              })()}
            </div>
            <p className="text-xs text-ink-3">
              {locale === 'ar' ? 'التقديم لنفسك' : 'Applying for yourself'}
            </p>
          </div>
        ) : isEmployee ? (
          // EMPLOYEE — read-only, always self
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الموظف' : 'Person'}</Label>
            <div
              className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-ink-2"
              aria-readonly="true"
            >
              {persons[0]
                ? `${persons[0].personNumber} — ${persons[0].fullNameEn ?? persons[0].fullNameAr}`
                : '—'}
            </div>
            <p className="text-xs text-ink-3">
              {locale === 'ar' ? 'يُسمح فقط بالتقديم لنفسك' : 'Employees may only request leave for themselves'}
            </p>
          </div>
        ) : isManager ? (
          // MANAGER — toggle: myself / team member
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">{locale === 'ar' ? 'التقديم لـ' : 'Applying for'}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={personMode === 'self' ? 'default' : 'outline'}
                onClick={() => {
                  setPersonMode('self')
                  if (currentPersonId) { setPersonId(currentPersonId); setIsDirty(true) }
                }}
              >
                {locale === 'ar' ? 'لنفسي' : 'Apply for myself'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={personMode === 'team_member' ? 'default' : 'outline'}
                onClick={() => {
                  setPersonMode('team_member')
                  const first = teamMembers[0]
                  if (first) { setPersonId(first.id); setIsDirty(true) }
                }}
              >
                {locale === 'ar' ? 'لأحد أعضاء الفريق' : 'Apply for team member'}
              </Button>
            </div>

            {personMode === 'team_member' && (
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs">{locale === 'ar' ? 'عضو الفريق' : 'Team member'}</Label>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا يوجد مرؤوسون مباشرون أو غير مباشرين.' : 'No direct or indirect reports found.'}</p>
                ) : (
                  <Select value={personId} onValueChange={mark(setPersonId)}>
                    <SelectTrigger aria-label={locale === 'ar' ? 'عضو الفريق' : 'Team member'}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {teamMembers.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.personNumber} — {p.fullNameEn ?? p.fullNameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {personMode === 'self' && currentPersonId && (
              <div
                className="mt-1 flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-ink-2"
                aria-readonly="true"
              >
                {(() => {
                  const self = persons.find(p => p.id === currentPersonId)
                  return self ? `${self.personNumber} — ${self.fullNameEn ?? self.fullNameAr}` : '—'
                })()}
              </div>
            )}
          </div>
        ) : (
          // HR roles — full unrestricted picker
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الموظف' : 'Person'}</Label>
            <Select value={personId} onValueChange={mark(setPersonId)}>
              <SelectTrigger aria-label={locale === 'ar' ? 'الموظف' : 'Person'}><SelectValue /></SelectTrigger>
              <SelectContent>
                {persons.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.personNumber} — {p.fullNameEn ?? '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── Absence type ─────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs">{locale === 'ar' ? 'نوع الإجازة' : 'Absence type'}</Label>
          <Select
            value={absenceTypeId}
            onValueChange={v => {
              mark(setAbsenceTypeId)(v)
              const code = absenceTypes.find(t => t.id === v)?.typeCode ?? ''
              if (code) onTypeChange?.(code)
            }}
          >
            <SelectTrigger aria-label={locale === 'ar' ? 'نوع الإجازة' : 'Absence type'}><SelectValue /></SelectTrigger>
            <SelectContent>
              {absenceTypes.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.typeCode} — {t.typeNameEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <HijriDatePicker
          label={locale === 'ar' ? 'تاريخ البدء' : 'Start date'}
          value={startDate}
          onChange={v => {
            setStartDate(v)
            setIsDirty(true)
            if (endDate && v > endDate && !isHalfDay) {
              setDateOrderError(locale === 'ar' ? 'يجب أن يكون تاريخ الانتهاء في أو بعد تاريخ البدء' : 'End date must be on or after start date')
            } else {
              setDateOrderError(null)
            }
          }}
          required
          helpText="BR-AL-002 — calendar days, both endpoints inclusive."
        />
        <div className="space-y-1">
          <HijriDatePicker
            label={locale === 'ar' ? 'تاريخ الانتهاء' : 'End date'}
            value={endDate}
            onChange={v => {
              setEndDate(v)
              setIsDirty(true)
              if (startDate && v < startDate && !isHalfDay) {
                setDateOrderError(locale === 'ar' ? 'يجب أن يكون تاريخ الانتهاء في أو بعد تاريخ البدء' : 'End date must be on or after start date')
              } else {
                setDateOrderError(null)
              }
            }}
            required
            disabled={isHalfDay}
          />
          {dateOrderError && (
            <p className="text-xs text-destructive" role="alert">
              {dateOrderError}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            aria-label={locale === 'ar' ? 'نصف يوم' : 'Half-day'}
            className="h-4 w-4 rounded border-border accent-accent"
            checked={isHalfDay}
            onChange={e => {
              setIsHalfDay(e.target.checked)
              if (e.target.checked) setEndDate(startDate)
              setIsDirty(true)
            }}
          />
          {locale === 'ar' ? 'نصف يوم' : 'Half-day'}
        </label>
        {isHalfDay && (
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'فترة نصف اليوم' : 'Half-day period'}</Label>
            <Select value={halfDayPeriod} onValueChange={v => { setHalfDayPeriod(v as 'AM' | 'PM'); setIsDirty(true) }} disabled={pending}>
              <SelectTrigger aria-label={locale === 'ar' ? 'فترة نصف اليوم' : 'Half-day period'}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">{locale === 'ar' ? 'صباحاً' : 'AM'}</SelectItem>
                <SelectItem value="PM">{locale === 'ar' ? 'مساءً' : 'PM'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">{locale === 'ar' ? 'السبب / ملاحظات' : 'Reason / notes'}</Label>
          <Textarea rows={3} aria-label={locale === 'ar' ? 'السبب / ملاحظات' : 'Reason / notes'} value={notes} onChange={e => { setNotes(e.target.value); setIsDirty(true) }} />
        </div>

        {certEligible && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              aria-label={locale === 'ar' ? 'شهادة طبية مطلوبة' : 'Medical certificate required'}
              className="h-4 w-4 rounded border-border accent-accent"
              checked={medicalCertRequired}
              onChange={e => { setMedicalCertRequired(e.target.checked); setIsDirty(true) }}
            />
            {locale === 'ar' ? 'شهادة طبية مطلوبة' : 'Medical certificate required'} (BR-SL-002)
          </label>
        )}
      </div>

      {certPanelVisible && (
        <div
          role="alert"
          className="rounded-md border border-status-warning-border bg-status-warning-bg p-3 text-sm"
        >
          <p className="font-medium text-status-warning-fg">
            {locale === 'ar' ? 'الشهادة الطبية مطلوبة' : 'Medical Certificate Required'}
          </p>
          <p className="mt-1 text-status-warning-fg">
            {certThresholdDays === 0
              ? 'Your organisation requires a medical certificate from Day 1 for sick leave. Please upload before submitting.'
              : `Your organisation requires a medical certificate for sick leave exceeding ${certThresholdDays} day(s). Please upload before submitting.`}
          </p>
          <p className="mt-1 text-xs text-status-warning-fg/80">
            BR-SL-002 · Article 31 FDL 33/2021 · PDF or image, max 5 MB.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-accent-200 bg-accent-050 p-3 text-sm">
        <span className="font-medium text-accent-700">Calendar days requested:</span>
        <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
          {computedDays || '—'}
        </span>
        <span className="text-xs text-ink-3">Calculated from your start/end dates · BR-AL-002.</span>
      </div>

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(() => {
            // Strip server-side error code prefix (e.g. "MEDICAL_CERT_REQUIRED: "),
            // then, if the message is still bilingual "EN · AR", render only the
            // active locale's half (single-language UI).
            const clean = error.replace(/^[A-Z_]+:\s*/, '')
            const sep   = clean.indexOf(' · ')
            if (sep === -1) return <span>{clean}</span>
            const en = clean.slice(0, sep)
            const ar = clean.slice(sep + 3)
            return locale === 'ar'
              ? <span dir="rtl" lang="ar">{ar}</span>
              : <span>{en}</span>
          })()}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {confirmingSubmit ? (
          <div className="rounded-lg border border-accent-200 bg-accent-050 p-3">
            <p className="mb-2 text-sm font-medium text-accent-700">
              {locale === 'ar' ? 'هل تريد تقديم الطلب للموافقة؟' : 'Submit for approval?'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => { setConfirmingSubmit(false); onSave(true) }}
                disabled={pending}
              >
                {pending
                  ? (locale === 'ar' ? 'جاري التقديم…' : 'Submitting…')
                  : (locale === 'ar' ? 'نعم، قدِّم' : 'Yes — submit')}
              </Button>
              <Button variant="outline" onClick={() => setConfirmingSubmit(false)} disabled={pending}>
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onSave(false)} disabled={pending}>
              {pending ? 'Saving…' : 'Save as DRAFT'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmingSubmit(true)} disabled={pending}>
              Save & submit for approval
            </Button>
          </div>
        )}
        <DraftSaveIndicator status={draft.saveIndicator} />
      </div>

      {createdId && !pending && (
        <p className="text-sm text-ink-2">Created. Redirecting…</p>
      )}

      <input type="hidden" value={currentLegalEntityId} />
    </div>
  )
}
