'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
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
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { hire, transfer, promotion, gradeChange } from '@/modules/core-hr'

// ── Picklist option shapes ────────────────────────────────────────────────

export type DeptOpt    = { id: string; code: string; nameEn: string; nameAr: string | null }
export type LocOpt     = { id: string; code: string; nameEn: string; nameAr: string | null }
export type ManagerOpt = { id: string; personNumber: string; fullNameEn: string | null }
export type GradeOpt   = { id: string; code: string; nameEn: string; nameAr: string | null; level: number | null }
export type PosOpt     = { id: string; code: string; titleEn: string; isOccupied: boolean }
export type JobOpt     = { id: string; code: string; titleEn: string }
export type ProjectOpt = { id: string; code: string; nameEn: string; nameAr: string | null }

interface Props {
  personId:         string
  personLabel:      string
  legalEntityId:    string
  assignmentStatus?: string
  current: {
    departmentId:  string | null
    locationId:    string | null
    lineManagerId: string | null
    gradeId:       string | null
    positionId:    string | null
    jobId:         string | null
    projectId:     string | null
  }
  picklists: {
    departments: DeptOpt[]
    locations:   LocOpt[]
    managers:    ManagerOpt[]
    grades:      GradeOpt[]
    positions:   PosOpt[]
    jobs:        JobOpt[]
    projects:    ProjectOpt[]
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// Helper shown in place of a Select when its (legal-entity-filtered) option
// list is empty — prevents a blank, non-selectable dropdown from opening.
function EmptyLovHint({ message }: { message: string }) {
  return (
    <div className="flex min-h-[40px] items-center rounded-md border border-dashed border-border bg-surface px-3 py-2 text-xs text-ink-3">
      {message}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Top-level grouping — three buttons + three dialogs.
// ══════════════════════════════════════════════════════════════════════════

export function EmploymentActionDialogs({ personId, personLabel, legalEntityId, assignmentStatus, current, picklists }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {assignmentStatus === 'PENDING_HIRE' && (
        <HireDialog personId={personId} personLabel={personLabel} legalEntityId={legalEntityId} current={current} picklists={picklists} />
      )}
      <TransferDialog    personId={personId} personLabel={personLabel} legalEntityId={legalEntityId} assignmentStatus={assignmentStatus} current={current} picklists={picklists} />
      <PromotionDialog   personId={personId} personLabel={personLabel} legalEntityId={legalEntityId} assignmentStatus={assignmentStatus} current={current} picklists={picklists} />
      <GradeChangeDialog personId={personId} personLabel={personLabel} legalEntityId={legalEntityId} assignmentStatus={assignmentStatus} current={current} picklists={picklists} />
    </div>
  )
}

// ── Hire ──────────────────────────────────────────────────────────────────

function HireDialog({ personId, personLabel, legalEntityId, current, picklists }: Props) {
  const [open, setOpen]                         = useState(false)
  const [pending, start]                        = useTransition()
  const [effectiveDate, setEffectiveDate]       = useState(todayIso())
  const [departmentId, setDepartmentId]         = useState(current.departmentId ?? '')
  const [positionId, setPositionId]             = useState(current.positionId ?? '')
  const [jobId, setJobId]                       = useState(current.jobId ?? '')
  const [locationId, setLocationId]             = useState(current.locationId ?? '')
  const [gradeId, setGradeId]                   = useState(current.gradeId ?? '')
  const [lineManagerId, setLineManagerId]       = useState(current.lineManagerId ?? '')
  const [employmentType, setEmploymentType]     = useState<string>('FULL_TIME')
  const [contractedHours, setContractedHours]   = useState<number>(48)
  const [reasonText, setReasonText]             = useState('')
  const { toast } = useToast()
  const locale = useLocale()
  const router = useRouter()

  function reset() {
    setEffectiveDate(todayIso())
    setDepartmentId(current.departmentId ?? '')
    setPositionId(current.positionId ?? '')
    setJobId(current.jobId ?? '')
    setLocationId(current.locationId ?? '')
    setGradeId(current.gradeId ?? '')
    setLineManagerId(current.lineManagerId ?? '')
    setEmploymentType('FULL_TIME')
    setContractedHours(48)
    setReasonText('')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!departmentId) {
      toast({ title: locale === 'ar' ? 'القسم مطلوب' : 'Department required', description: locale === 'ar' ? 'اختر قسمًا لإكمال التوظيف.' : 'Select a department to complete the hire.', variant: 'destructive' })
      return
    }
    start(async () => {
      try {
        await hire({
          personId,
          legalEntityId,
          effectiveStartDate:     effectiveDate,
          departmentId,
          positionId:             positionId  || undefined,
          jobId:                  jobId       || undefined,
          locationId:             locationId  || undefined,
          gradeId:                gradeId     || undefined,
          lineManagerId:          lineManagerId || undefined,
          employmentType:         employmentType as 'FULL_TIME' | 'PART_TIME' | 'TEMPORARY' | 'TASK_BASED' | 'FLEXIBLE' | 'REMOTE' | 'SHARED',
          contractedHoursPerWeek: contractedHours,
          reasonText:             reasonText.trim() || undefined,
        })
        toast({ title: locale === 'ar' ? 'اكتمل التوظيف' : 'Hire completed', description: locale === 'ar' ? `تم إنشاء تعيين العامل. سارٍ من ${effectiveDate}.` : `Worker assignment created. Effective ${effectiveDate}.` })
        setOpen(false)
        reset()
        router.refresh()
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشل التوظيف' : 'Hire failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">{locale === 'ar' ? 'إتمام التوظيف' : 'Complete Hire'}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{locale === 'ar' ? `إتمام التوظيف — ${personLabel}` : `Complete hire — ${personLabel}`}</DialogTitle>
          <DialogDescription>
            {locale === 'ar'
              ? 'ينشئ أول صف تعيين عمل وينقل الشخص من PENDING_HIRE إلى ACTIVE. القسم ونوع التوظيف مطلوبان.'
              : 'Creates the first worker assignment row and moves the person from PENDING_HIRE to ACTIVE. Department and employment type are required.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {picklists.departments.length === 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {locale === 'ar'
                ? 'لا توجد أقسام نشطة مُهيّأة للجهة القانونية لهذا الشخص، لذا لا يمكن إتمام التوظيف. أضف قسماً لهذه الجهة من البيانات الرئيسية ← الأقسام، ثم أعد فتح هذه النافذة.'
                : 'This person’s legal entity has no active departments configured, so the hire cannot be completed. Add a department for this entity under Master Data → Departments, then reopen this dialog.'}
            </div>
          )}

          <HijriDatePicker
            label={locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}
            required
            value={effectiveDate}
            onChange={setEffectiveDate}
            disabled={pending}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'القسم' : 'Department'}<span className="ms-0.5 text-destructive">*</span>
              </Label>
              {picklists.departments.length === 0 ? (
                <EmptyLovHint message={locale === 'ar' ? 'لا توجد أقسام نشطة لهذه الجهة القانونية.' : 'No active departments for this legal entity.'} />
              ) : (
                <Select value={departmentId || undefined} onValueChange={setDepartmentId} disabled={pending}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر القسم' : 'Select department'} /></SelectTrigger>
                  <SelectContent>
                    {picklists.departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.code} — {d.nameEn}{d.nameAr ? ` · ${d.nameAr}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'المنصب (اختياري)' : 'Position (optional)'}</Label>
              <Select value={positionId || undefined} onValueChange={setPositionId} disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'بلا' : 'None'} /></SelectTrigger>
                <SelectContent>
                  {picklists.positions.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.titleEn}{p.isOccupied ? ' (occupied)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الوظيفة (اختياري)' : 'Job (optional)'}</Label>
              <Select value={jobId || undefined} onValueChange={setJobId} disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'بلا' : 'None'} /></SelectTrigger>
                <SelectContent>
                  {picklists.jobs.map(j => (
                    <SelectItem key={j.id} value={j.id}>{j.code} — {j.titleEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الموقع (اختياري)' : 'Location (optional)'}</Label>
              {picklists.locations.length === 0 ? (
                <EmptyLovHint message={locale === 'ar' ? 'لا توجد مواقع نشطة لهذه الجهة القانونية.' : 'No active locations for this legal entity.'} />
              ) : (
                <Select value={locationId || undefined} onValueChange={setLocationId} disabled={pending}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'بلا' : 'None'} /></SelectTrigger>
                  <SelectContent>
                    {picklists.locations.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.code} — {l.nameEn}{l.nameAr ? ` · ${l.nameAr}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الدرجة (اختياري)' : 'Grade (optional)'}</Label>
              <Select value={gradeId || undefined} onValueChange={setGradeId} disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'بلا' : 'None'} /></SelectTrigger>
                <SelectContent>
                  {picklists.grades.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.code} — {g.nameEn}{g.level != null ? ` (lvl ${g.level})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'المدير المباشر (اختياري)' : 'Line manager (optional)'}</Label>
              {picklists.managers.length === 0 ? (
                <EmptyLovHint message={locale === 'ar' ? 'لا يوجد مدراء مؤهلون في هذه الجهة القانونية.' : 'No eligible managers in this legal entity.'} />
              ) : (
                <Select value={lineManagerId || undefined} onValueChange={setLineManagerId} disabled={pending}>
                  <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'بلا' : 'None'} /></SelectTrigger>
                  <SelectContent>
                    {picklists.managers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.personNumber} — {m.fullNameEn ?? '—'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'نوع التوظيف' : 'Employment type'}<span className="ms-0.5 text-destructive">*</span>
              </Label>
              <Select value={employmentType} onValueChange={setEmploymentType} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['FULL_TIME','PART_TIME','TEMPORARY','TASK_BASED','FLEXIBLE','REMOTE','SHARED'] as const).map(t => (
                    <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'ساعات العقد/أسبوع' : 'Contracted hrs/week'}</Label>
              <Input
                type="number" min={1} max={48} step={0.5}
                value={contractedHours}
                onChange={e => setContractedHours(Math.min(48, Math.max(1, Number(e.target.value))))}
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="h-reason" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
            <Textarea id="h-reason" rows={2}
              value={reasonText} onChange={e => setReasonText(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: إتمام إعداد التوظيف بعد قبول العرض' : 'e.g. Completing hire setup after offer acceptance'}
              disabled={pending} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={pending}>{pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'إتمام التوظيف' : 'Complete hire')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Transfer ──────────────────────────────────────────────────────────────

function TransferDialog({ personId, personLabel, current, picklists }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [effectiveDate, setEffectiveDate]      = useState(todayIso())
  const [newDepartmentId, setNewDepartmentId]  = useState(current.departmentId ?? '')
  const [newLocationId, setNewLocationId]      = useState(current.locationId ?? '')
  const [newLineManagerId, setNewLineManagerId] = useState(current.lineManagerId ?? '')
  const [newProjectId, setNewProjectId]        = useState(current.projectId ?? '')
  const [newProjectAllocationPct, setNewProjectAllocationPct] = useState<number>(100)
  const [reasonText, setReasonText]            = useState('')
  const { toast } = useToast()
  const locale = useLocale()
  const router = useRouter()

  // Only send fields that actually changed.
  function diffFromCurrent() {
    return {
      newDepartmentId:  newDepartmentId  !== (current.departmentId  ?? '') ? newDepartmentId  : undefined,
      newLocationId:    newLocationId    !== (current.locationId    ?? '') ? newLocationId    : undefined,
      newLineManagerId: newLineManagerId !== (current.lineManagerId ?? '') ? newLineManagerId : undefined,
      newProjectId:     newProjectId     !== (current.projectId     ?? '') ? newProjectId     : undefined,
      newProjectAllocationPct: newProjectId !== (current.projectId ?? '') ? newProjectAllocationPct : undefined,
    }
  }

  function reset() {
    setEffectiveDate(todayIso())
    setNewDepartmentId(current.departmentId ?? '')
    setNewLocationId(current.locationId ?? '')
    setNewLineManagerId(current.lineManagerId ?? '')
    setNewProjectId(current.projectId ?? '')
    setNewProjectAllocationPct(100)
    setReasonText('')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!reasonText.trim()) {
      toast({ title: locale === 'ar' ? 'السبب مطلوب' : 'Reason required', description: locale === 'ar' ? 'أضف سببًا للنقل.' : 'Add a reason for the transfer.', variant: 'destructive' })
      return
    }
    const delta = diffFromCurrent()
    if (!delta.newDepartmentId && !delta.newLocationId && !delta.newLineManagerId && !delta.newProjectId) {
      toast({ title: locale === 'ar' ? 'لا يوجد تغيير' : 'No change', description: locale === 'ar' ? 'اختر قسمًا أو موقعًا أو مديرًا أو مشروعًا مختلفًا.' : 'Pick a different department, location, manager, or project.', variant: 'destructive' })
      return
    }
    start(async () => {
      try {
        await transfer({
          personId,
          effectiveDate,
          reasonText: reasonText.trim(),
          newDepartmentId:  delta.newDepartmentId  || undefined,
          newLocationId:    delta.newLocationId    || undefined,
          newLineManagerId: delta.newLineManagerId || undefined,
          newProjectId:     delta.newProjectId     || undefined,
          newProjectAllocationPct: delta.newProjectAllocationPct,
        })
        toast({ title: locale === 'ar' ? 'تم تسجيل النقل' : 'Transfer recorded', description: locale === 'ar' ? `سارٍ من ${effectiveDate}. تم إغلاق تعيين العامل وإعادة فتحه.` : `Effective ${effectiveDate}. Worker assignment closed-and-reopened.` })
        setOpen(false)
        reset()
        router.refresh()
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشل النقل' : 'Transfer failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{locale === 'ar' ? 'نقل' : 'Transfer'}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{locale === 'ar' ? `نقل ${personLabel}` : `Transfer ${personLabel}`}</DialogTitle>
          <DialogDescription>
            {locale === 'ar'
              ? 'تغيير القسم أو الموقع أو المدير المباشر. يُغلق تعيين العمل الحالي ويفتح صفاً جديداً مؤرّخاً بالسريان (القاعدة الصارمة 3). يُعاد احتساب فترة الإشعار BR-NP-001 من إجمالي مدة الخدمة.'
              : 'Department, location, or line manager change. Closes the current worker assignment and opens a new effective-dated row (Hard Rule 3). BR-NP-001 notice period is recomputed from total service.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <HijriDatePicker
            label={locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}
            required
            value={effectiveDate}
            onChange={setEffectiveDate}
            disabled={pending}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'القسم الجديد' : 'New department'}</Label>
              <Select value={newDepartmentId || undefined}
                onValueChange={setNewDepartmentId} disabled={pending || picklists.departments.length === 0}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'الإبقاء على الحالي' : 'Keep current'} /></SelectTrigger>
                <SelectContent>
                  {picklists.departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.code} — {d.nameEn}{d.nameAr ? ` · ${d.nameAr}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الموقع الجديد' : 'New location'}</Label>
              <Select value={newLocationId || undefined}
                onValueChange={setNewLocationId} disabled={pending || picklists.locations.length === 0}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'الإبقاء على الحالي' : 'Keep current'} /></SelectTrigger>
                <SelectContent>
                  {picklists.locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} — {l.nameEn}{l.nameAr ? ` · ${l.nameAr}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'المدير المباشر الجديد' : 'New line manager'}</Label>
            <Select value={newLineManagerId || undefined}
              onValueChange={setNewLineManagerId} disabled={pending || picklists.managers.length === 0}>
              <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'الإبقاء على الحالي' : 'Keep current'} /></SelectTrigger>
              <SelectContent>
                {picklists.managers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.personNumber} — {m.fullNameEn ?? '—'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'المشروع الجديد' : 'New project'}</Label>
              <Select value={newProjectId || undefined}
                onValueChange={v => { setNewProjectId(v); setNewProjectAllocationPct(100) }}
                disabled={pending || picklists.projects.length === 0}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'الإبقاء على الحالي' : 'Keep current'} /></SelectTrigger>
                <SelectContent>
                  {picklists.projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.nameEn}{p.nameAr ? ` · ${p.nameAr}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'نسبة التخصيص %' : 'Allocation %'}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={newProjectAllocationPct}
                onChange={e => setNewProjectAllocationPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                disabled={pending || !newProjectId}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-reason" className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'السبب' : 'Reason'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Textarea id="t-reason" required rows={2}
              value={reasonText} onChange={e => setReasonText(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: نُقل إلى فريق المالية لسد نقص في عدد الموظفين' : 'e.g. Moved to Finance team to cover headcount gap'}
              disabled={pending} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={pending}>{pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'تسجيل النقل' : 'Record transfer')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Promotion ─────────────────────────────────────────────────────────────

function PromotionDialog({ personId, personLabel, current, picklists }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [newGradeId, setNewGradeId]       = useState('')
  const [newPositionId, setNewPositionId] = useState('')
  const [newJobId, setNewJobId]           = useState('')
  const [reasonText, setReasonText]       = useState('')
  const { toast } = useToast()
  const locale = useLocale()
  const router = useRouter()

  // Show grades that are higher than current as the obvious promote target.
  const currentGrade = picklists.grades.find(g => g.id === current.gradeId)
  const higherGrades = currentGrade?.level == null
    ? picklists.grades
    : picklists.grades.filter(g => (g.level ?? 0) > (currentGrade?.level ?? 0))

  function reset() {
    setEffectiveDate(todayIso())
    setNewGradeId('')
    setNewPositionId('')
    setNewJobId('')
    setReasonText('')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newGradeId) {
      toast({ title: locale === 'ar' ? 'الدرجة مطلوبة' : 'Grade required', description: locale === 'ar' ? 'اختر الدرجة الجديدة.' : 'Pick the new grade.', variant: 'destructive' })
      return
    }
    if (newGradeId === current.gradeId) {
      toast({ title: locale === 'ar' ? 'نفس الدرجة' : 'Same grade', description: locale === 'ar' ? 'اختر درجة مختلفة أو استخدم تغيير الدرجة.' : 'Pick a different grade or use Grade Change.', variant: 'destructive' })
      return
    }
    if (!reasonText.trim()) {
      toast({ title: locale === 'ar' ? 'السبب مطلوب' : 'Reason required', description: locale === 'ar' ? 'أضف سببًا للترقية.' : 'Add a reason for the promotion.', variant: 'destructive' })
      return
    }
    start(async () => {
      try {
        await promotion({
          personId,
          effectiveDate,
          reasonText:    reasonText.trim(),
          newGradeId,
          newPositionId: newPositionId || undefined,
          newJobId:      newJobId || undefined,
        })
        toast({ title: locale === 'ar' ? 'تم تسجيل الترقية' : 'Promotion recorded', description: locale === 'ar' ? `سارٍ من ${effectiveDate}. تمت كتابة صفوف تعيين العامل + employment_action.` : `Effective ${effectiveDate}. Worker assignment + employment_action rows written.` })
        setOpen(false)
        reset()
        router.refresh()
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشلت الترقية' : 'Promotion failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{locale === 'ar' ? 'ترقية' : 'Promote'}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{locale === 'ar' ? `ترقية ${personLabel}` : `Promote ${personLabel}`}</DialogTitle>
          <DialogDescription>
            {locale === 'ar'
              ? 'يسجّل إجراء توظيف PROMOTION ويفتح صف تعيين عمل جديداً بالدرجة الأعلى. استخدم تغيير الدرجة للنقل الجانبي أو الهبوطي.'
              : 'Records a PROMOTION employment_action and opens a new worker assignment row with the higher grade. Use Grade Change for lateral or downward moves.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}
              required
              value={effectiveDate}
              onChange={setEffectiveDate}
              disabled={pending}
            />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'الدرجة الحالية' : 'Current grade'}
              </Label>
              <Input value={currentGrade ? `${currentGrade.code} — ${currentGrade.nameEn}${currentGrade.nameAr ? ` · ${currentGrade.nameAr}` : ''}` : '—'} readOnly disabled />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'الدرجة الجديدة' : 'New grade'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Select value={newGradeId || undefined}
              onValueChange={setNewGradeId} disabled={pending || higherGrades.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={higherGrades.length ? (locale === 'ar' ? 'اختر درجة أعلى' : 'Select higher grade') : (locale === 'ar' ? 'لا توجد درجة أعلى متاحة' : 'No higher grade available')} />
              </SelectTrigger>
              <SelectContent>
                {higherGrades.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.code} — {g.nameEn}{g.nameAr ? ` · ${g.nameAr}` : ''}{g.level != null ? ` (lvl ${g.level})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'المنصب الجديد (اختياري)' : 'New position (optional)'}</Label>
              <Select value={newPositionId || undefined}
                onValueChange={setNewPositionId} disabled={pending || picklists.positions.length === 0}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'الإبقاء على الحالي' : 'Keep current'} /></SelectTrigger>
                <SelectContent>
                  {picklists.positions.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.titleEn}{p.isOccupied ? ' (occupied)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الوظيفة الجديدة (اختياري)' : 'New job (optional)'}</Label>
              <Select value={newJobId || undefined}
                onValueChange={setNewJobId} disabled={pending || picklists.jobs.length === 0}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'الإبقاء على الحالي' : 'Keep current'} /></SelectTrigger>
                <SelectContent>
                  {picklists.jobs.map(j => (
                    <SelectItem key={j.id} value={j.id}>{j.code} — {j.titleEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-reason" className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'السبب' : 'Reason'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Textarea id="p-reason" required rows={2}
              value={reasonText} onChange={e => setReasonText(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: تمت الترقية بعد معايرة دورة 2026' : 'e.g. Promoted following 2026 cycle calibration'}
              disabled={pending} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={pending}>{pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'تسجيل الترقية' : 'Record promotion')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Grade Change ──────────────────────────────────────────────────────────

function GradeChangeDialog({ personId, personLabel, current, picklists }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [newGradeId, setNewGradeId]       = useState('')
  const [reasonText, setReasonText]       = useState('')
  const { toast } = useToast()
  const locale = useLocale()
  const router = useRouter()

  const currentGrade = picklists.grades.find(g => g.id === current.gradeId)
  const otherGrades = picklists.grades.filter(g => g.id !== current.gradeId)

  // Inline derivation of action type — server is authoritative; this is just UX.
  const candidate = picklists.grades.find(g => g.id === newGradeId)
  const derivedKind: 'PROMOTION' | 'DEMOTION' | 'LATERAL' | null =
    !candidate || !currentGrade || candidate.level == null || currentGrade.level == null
      ? null
      : candidate.level > currentGrade.level
        ? 'PROMOTION'
        : candidate.level < currentGrade.level
          ? 'DEMOTION'
          : 'LATERAL'

  function reset() {
    setEffectiveDate(todayIso())
    setNewGradeId('')
    setReasonText('')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newGradeId) {
      toast({ title: locale === 'ar' ? 'الدرجة مطلوبة' : 'Grade required', description: locale === 'ar' ? 'اختر الدرجة الجديدة.' : 'Pick the new grade.', variant: 'destructive' })
      return
    }
    if (!reasonText.trim()) {
      toast({ title: locale === 'ar' ? 'السبب مطلوب' : 'Reason required', description: locale === 'ar' ? 'أضف سببًا لتغيير الدرجة.' : 'Add a reason for the grade change.', variant: 'destructive' })
      return
    }
    start(async () => {
      try {
        await gradeChange({
          personId,
          effectiveDate,
          reasonText: reasonText.trim(),
          newGradeId,
        })
        toast({ title: locale === 'ar' ? 'تم تسجيل تغيير الدرجة' : 'Grade change recorded', description: locale === 'ar' ? `سارٍ من ${effectiveDate}.` : `Effective ${effectiveDate}.` })
        setOpen(false)
        reset()
        router.refresh()
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشل تغيير الدرجة' : 'Grade change failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{locale === 'ar' ? 'تغيير الدرجة' : 'Grade change'}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{locale === 'ar' ? `تغيير درجة ${personLabel}` : `Grade change for ${personLabel}`}</DialogTitle>
          <DialogDescription>
            {locale === 'ar'
              ? 'نقل عام للدرجة — يحدّد الخادم ما إذا كان ترقية PROMOTION أو خفضاً DEMOTION استناداً إلى مستوى الدرجة. النقل الجانبي غير مسموح (ينبغي أن يكون نقلاً بدلاً من ذلك).'
              : 'Generic grade move — server resolves to PROMOTION or DEMOTION based on grade level. Lateral moves are not allowed (they should be a Transfer instead).'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}
              required
              value={effectiveDate}
              onChange={setEffectiveDate}
              disabled={pending}
            />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الدرجة الحالية' : 'Current grade'}</Label>
              <Input value={currentGrade ? `${currentGrade.code} — ${currentGrade.nameEn}${currentGrade.nameAr ? ` · ${currentGrade.nameAr}` : ''}` : '—'} readOnly disabled />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'الدرجة الجديدة' : 'New grade'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Select value={newGradeId || undefined}
              onValueChange={setNewGradeId} disabled={pending || otherGrades.length === 0}>
              <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر الدرجة' : 'Select grade'} /></SelectTrigger>
              <SelectContent>
                {otherGrades.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.code} — {g.nameEn}{g.nameAr ? ` · ${g.nameAr}` : ''}{g.level != null ? ` (lvl ${g.level})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {derivedKind && (
              <p className="text-xs text-ink-3">
                {locale === 'ar' ? 'نوع الإجراء المُشتق:' : 'Derived action type:'} <Badge variant="outline">{derivedKind}</Badge>
                {derivedKind === 'LATERAL' && (
                  <span className="ms-2 text-destructive">{locale === 'ar' ? '— نفس المستوى: استخدم النقل بدلاً من ذلك' : '— same level: use Transfer instead'}</span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-reason" className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'السبب' : 'Reason'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Textarea id="g-reason" required rows={2}
              value={reasonText} onChange={e => setReasonText(e.target.value)}
              placeholder={locale === 'ar' ? 'مثال: نتيجة تقييم الأداء — نُقل إلى G3' : 'e.g. Performance review outcome — moved to G3'}
              disabled={pending} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={pending || derivedKind === 'LATERAL'}>
              {pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'تسجيل تغيير الدرجة' : 'Record grade change')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
