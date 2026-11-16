import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { eq, and, asc, desc, or } from 'drizzle-orm'
import {
  Briefcase, FileText, Edit2, ArrowRightLeft, TrendingUp, Award, HeartPulse,
} from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  legalEntities, departments, jobs, positions, locations, grades,
  personDocuments, personContacts, personAddresses, contracts, workerAssignments, employmentActions,
  persons as personsTable, projects,
  departmentHistory, gradeHistory, jobHistory, locationHistory, positionHistory,
} from '@/drizzle/schema'
import { getPerson } from '@/modules/core-hr'
import { classifyTemporal } from '@/modules/core-hr/assignment-history'
import { resolveFormConfig } from '@/lib/config-resolver'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { Button } from '@/components/ui/button'
import { EmploymentActionDialogs } from './EmploymentActionDialogs'
import { PhotoUploadWidget } from './PhotoUploadWidget'
import {
  AsOfConflictError,
  departmentHistoryAsOfAdapter,
  getAsOfRow,
  gradeHistoryAsOfAdapter,
  jobHistoryAsOfAdapter,
  locationHistoryAsOfAdapter,
  positionHistoryAsOfAdapter,
} from '@/lib/as-of-query'

export const metadata = { title: 'Person profile' }

/**
 * S3-09 — Person profile (read view).
 *
 * Renders the person via `getPerson` (which masks/decrypts PII based on
 * caller role) plus related lists: contracts, addresses, contacts,
 * documents, worker_assignments history, employment_actions history.
 *
 * Section ordering follows `resolveFormConfig('PERSON', role)` so HR Admin
 * can re-arrange via the Settings → Form Layout screen without code change.
 */
export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ from?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // Back-link origin: when opened from the org chart (?from=org-chart) the Back
  // link returns to /org-chart instead of the All Employees list.
  const sp = searchParams ? await searchParams : {}
  const from = sp.from
  const backHref  = from === 'org-chart' ? '/org-chart'
                  : from === 'my-team'   ? '/my-team'
                  : '/persons'

  const { id } = await params

  // BUG-NAV-001: getPerson uses translateError which always re-throws, crashing
  // Server Components. Wrap in try-catch so a DB error shows notFound() instead
  // of "An error occurred in the Server Components render".
  let person
  try {
    person = await getPerson(id)
  } catch (e) {
    console.error('[PersonProfilePage] getPerson threw:', e instanceof Error ? e.message : String(e))
    notFound()
  }
  if (!person) notFound()

  const locale = await resolveLocale(session.user.personId)

  const backLabel = from === 'org-chart' ? (locale === 'ar' ? '→ المخطط التنظيمي' : '← Organisation Chart')
                  : from === 'my-team'   ? (locale === 'ar' ? '→ فريقي' : '← My Team')
                  : (locale === 'ar' ? '→ جميع الموظفين' : '← All Employees')

  const formConfig = await resolveFormConfig('PERSON', session.user.role, TENANT_ID)

  const canEdit = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)

  // Pre-fetch current project assignment so we can anchor the picklist and
  // display the project name regardless of the viewer's canEdit status.
  const currentWaRow = await db
    .select({
      projectId:      workerAssignments.projectId,
      projectNameEn:  projects.nameEn,
      projectNameAr:  projects.nameAr,
    })
    .from(workerAssignments)
    .leftJoin(projects, eq(workerAssignments.projectId, projects.id))
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, person.id),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)
    .then(r => r[0] ?? null)
  const currentProjectId = currentWaRow?.projectId ?? null

  // Pull all the joinable details in parallel — including picklists for the
  // employment-action dialogs (S4-03), scoped to the person's legal entity.
  const dottedMgrId = (person as Record<string, unknown>).dottedLineManagerId as string | null ?? null

  const [
    entity, dept, job, position, location, grade,
    documents, contactRows, addressRows,
    contractRows, assignmentRows, actionRows,
    deptOpts, locationOpts, gradeOpts, positionOpts, jobOpts, managerOpts, projectOpts,
    lineManagerRow, functionalManagerRow,
  ] = await Promise.all([
    person.legalEntityId
      ? db.select({ id: legalEntities.id, code: legalEntities.entityCode, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
          .from(legalEntities).where(eq(legalEntities.id, person.legalEntityId)).limit(1).then(r => r[0])
      : Promise.resolve(undefined),
    person.currentDepartmentId
      ? db.select({ id: departments.id, code: departments.code, nameEn: departments.nameEn, nameAr: departments.nameAr })
          .from(departments).where(eq(departments.id, person.currentDepartmentId)).limit(1).then(r => r[0])
      : Promise.resolve(undefined),
    person.currentJobId
      ? db.select({ id: jobs.id, code: jobs.jobCode, titleEn: jobs.jobTitleEn, isEmiratisationTarget: jobs.isEmiratisationTarget })
          .from(jobs).where(eq(jobs.id, person.currentJobId)).limit(1).then(r => r[0])
      : Promise.resolve(undefined),
    person.currentPositionId
      ? db.select({ id: positions.id, code: positions.positionCode, titleEn: positions.positionTitleEn })
          .from(positions).where(eq(positions.id, person.currentPositionId)).limit(1).then(r => r[0])
      : Promise.resolve(undefined),
    person.currentLocationId
      ? db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
          .from(locations).where(eq(locations.id, person.currentLocationId)).limit(1).then(r => r[0])
      : Promise.resolve(undefined),
    person.currentGradeId
      ? db.select({ id: grades.id, code: grades.gradeCode, nameEn: grades.gradeNameEn, nameAr: grades.gradeNameAr })
          .from(grades).where(eq(grades.id, person.currentGradeId)).limit(1).then(r => r[0])
      : Promise.resolve(undefined),
    // BUG-NAV-001b: .catch([]) guards against "column does not exist" when
    // migration 0050 (document_management_v2) hasn't been applied to Neon yet.
    db.select().from(personDocuments)
      .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.personId, person.id)))
      .orderBy(asc(personDocuments.documentType))
      .catch(() => [] as typeof personDocuments.$inferSelect[]),
    db.select().from(personContacts)
      .where(and(eq(personContacts.tenantId, TENANT_ID), eq(personContacts.personId, person.id), eq(personContacts.isActive, true)))
      .orderBy(asc(personContacts.contactType)),
    db.select().from(personAddresses)
      .where(and(eq(personAddresses.tenantId, TENANT_ID), eq(personAddresses.personId, person.id)))
      .orderBy(asc(personAddresses.addressType)),
    db.select().from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.personId, person.id)))
      .orderBy(desc(contracts.startDate)),
    db.select().from(workerAssignments)
      .where(and(eq(workerAssignments.tenantId, TENANT_ID), eq(workerAssignments.personId, person.id)))
      .orderBy(desc(workerAssignments.effectiveStartDate)),
    db.select().from(employmentActions)
      .where(and(eq(employmentActions.tenantId, TENANT_ID), eq(employmentActions.personId, person.id)))
      .orderBy(desc(employmentActions.effectiveDate))
      .limit(50),
    // Picklists for the employment-action dialogs (S4-03) — scoped to the
    // person's entity. S4-Q9: only loaded when the viewer can actually edit;
    // EMPLOYEE / MANAGER / PAYROLL_ADMIN profile views skip these 6 reads.
    canEdit
      ? db.select({ id: departments.id, code: departments.code, nameEn: departments.nameEn, nameAr: departments.nameAr })
          .from(departments)
          .where(and(
            eq(departments.tenantId, TENANT_ID),
            eq(departments.legalEntityId, person.legalEntityId),
            eq(departments.isActive, true),
          ))
          .orderBy(asc(departments.nameEn))
      : Promise.resolve([] as Array<{ id: string; code: string; nameEn: string; nameAr: string | null }>),
    canEdit
      ? db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
          .from(locations)
          .where(and(
            eq(locations.tenantId, TENANT_ID),
            eq(locations.legalEntityId, person.legalEntityId),
            eq(locations.isActive, true),
          ))
          .orderBy(asc(locations.nameEn))
      : Promise.resolve([] as Array<{ id: string; code: string; nameEn: string; nameAr: string | null }>),
    canEdit
      ? db.select({ id: grades.id, code: grades.gradeCode, nameEn: grades.gradeNameEn, nameAr: grades.gradeNameAr, level: grades.gradeLevel })
          .from(grades)
          .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
          .orderBy(asc(grades.gradeLevel))
      : Promise.resolve([] as Array<{ id: string; code: string; nameEn: string; nameAr: string | null; level: number | null }>),
    canEdit
      ? db.select({ id: positions.id, code: positions.positionCode, titleEn: positions.positionTitleEn, isOccupied: positions.isOccupied })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true)))
          .orderBy(asc(positions.positionTitleEn))
      : Promise.resolve([] as Array<{ id: string; code: string; titleEn: string; isOccupied: boolean }>),
    canEdit
      ? db.select({ id: jobs.id, code: jobs.jobCode, titleEn: jobs.jobTitleEn })
          .from(jobs)
          .where(and(eq(jobs.tenantId, TENANT_ID), eq(jobs.isActive, true)))
          .orderBy(asc(jobs.jobTitleEn))
      : Promise.resolve([] as Array<{ id: string; code: string; titleEn: string }>),
    canEdit
      ? db.select({ id: personsTable.id, personNumber: personsTable.personNumber, fullNameEn: personsTable.fullNameEn })
          .from(personsTable)
          .where(and(
            eq(personsTable.tenantId, TENANT_ID),
            eq(personsTable.legalEntityId, person.legalEntityId),
            eq(personsTable.isActive, true),
          ))
          .orderBy(asc(personsTable.fullNameEn))
          .limit(500)
      : Promise.resolve([] as Array<{ id: string; personNumber: string; fullNameEn: string | null }>),
    canEdit
      ? (currentProjectId
          ? db.select({ id: projects.id, code: projects.code, nameEn: projects.nameEn, nameAr: projects.nameAr })
              .from(projects)
              .where(or(
                and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true)),
                and(eq(projects.tenantId, TENANT_ID), eq(projects.id, currentProjectId)),
              )!)
              .orderBy(asc(projects.nameEn))
          : db.select({ id: projects.id, code: projects.code, nameEn: projects.nameEn, nameAr: projects.nameAr })
              .from(projects)
              .where(and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true)))
              .orderBy(asc(projects.nameEn)))
      : Promise.resolve([] as Array<{ id: string; code: string; nameEn: string; nameAr: string | null }>),
    // Resolve line manager and functional manager names for the Employment card.
    person.lineManagerId
      ? db.select({ fullNameEn: personsTable.fullNameEn, personNumber: personsTable.personNumber })
          .from(personsTable)
          .where(eq(personsTable.id, person.lineManagerId))
          .limit(1)
          .then(r => r[0] ?? null)
      : Promise.resolve(null),
    dottedMgrId
      ? db.select({ fullNameEn: personsTable.fullNameEn, personNumber: personsTable.personNumber })
          .from(personsTable)
          .where(eq(personsTable.id, dottedMgrId))
          .limit(1)
          .then(r => r[0] ?? null)
      : Promise.resolve(null),
  ])

  // Initials avatar helper
  const nameInitials = (() => {
    const n = person.fullNameEn ?? ''
    const parts = n.trim().split(/\s+/)
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
    return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
  })()

  // Status pill using design token classes
  const statusPillClass: Record<string, string> = {
    ACTIVE:       'bg-accent-050 text-accent-700',
    ON_LEAVE:     'bg-status-warning-bg text-status-warning-fg',
    SUSPENDED:    'bg-red-50 text-red-800',
    PENDING_HIRE: 'bg-blue-50 text-blue-900',
    TERMINATED:   'bg-surface text-ink-3',
    INACTIVE:     'bg-surface text-ink-3',
  }
  const pillClass = statusPillClass[person.assignmentStatus] ?? 'bg-surface text-ink-3'
  const historyLabelCache: HistoryLabelCache = new Map()
  const assignmentRowsWithHistoricalLabels = await Promise.all(
    assignmentRows.map(async assignment => ({
      ...assignment,
      historicalLabels: await resolveAssignmentHistoryLabels(assignment, historyLabelCache),
    })),
  )

  return (
    <div className="page-in">
      {/* ── Profile header ─────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {/* Avatar — profilePhotoUrl (cloud) → profilePhotoData (base64) → extraData legacy */}
          {(() => {
            const photoUrl = person.profilePhotoUrl
              || person.profilePhotoData
              || (typeof person.extraData?.photoUrl === 'string' ? person.extraData.photoUrl : null)
              || null
            return photoUrl ? (
              <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-accent-100">
                <Image
                  src={photoUrl}
                  alt={person.fullNameEn ?? 'Profile photo'}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
                {canEdit && <PhotoUploadWidget personId={person.id} />}
              </div>
            ) : (
              <div
                className="group relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-100 font-serif text-xl font-semibold text-accent-700"
              >
                <span aria-hidden>{nameInitials}</span>
                {canEdit && <PhotoUploadWidget personId={person.id} />}
              </div>
            )
          })()}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={backHref}
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            4,
                  fontSize:       'var(--text-caption)',
                  fontWeight:     500,
                  fontFamily:     'var(--font-sans)',
                  color:          'var(--ink-2)',
                  textDecoration: 'none',
                  padding:        '3px 8px',
                  borderRadius:   6,
                  border:         '1px solid var(--border)',
                  background:     'var(--surface)',
                }}
              >
                {backLabel}
              </Link>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass}`}>
                {person.assignmentStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{person.fullNameEn ?? '—'}</PageTitle>
            <p className="mt-0.5 text-sm text-ink-3" dir="rtl" lang="ar">{person.fullNameAr}</p>
            <p className="mt-1 font-mono text-xs text-ink-2">
              {person.personNumber}
              {entity && <> · {entity.code} · {entity.nameEn}{entity.nameAr ? ` · ${entity.nameAr}` : ''}</>}
              {dept && <> · {dept.nameEn}{dept.nameAr ? ` · ${dept.nameAr}` : ''}</>}
              {position && <> · {position.titleEn}</>}
              {grade && <> · {grade.code}</>}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/persons/${person.id}/edit`}>
                <Button size="sm" className="gap-1.5">
                  <Edit2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                  {locale === 'ar' ? 'تعديل' : 'Edit'}
                </Button>
              </Link>
              <Link href={`/persons/${person.id}/documents`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                  {locale === 'ar' ? 'الوثائق' : 'Documents'}
                </Button>
              </Link>
              <Link href={`/persons/${person.id}/bank-details`}>
                <Button variant="outline" size="sm">{locale === 'ar' ? 'التفاصيل المصرفية' : 'Bank details'}</Button>
              </Link>
              <Link href={`/persons/${person.id}/dependents`}>
                <Button variant="outline" size="sm">{locale === 'ar' ? 'المعالون' : 'Dependents'}</Button>
              </Link>
              <Link href={`/persons/${person.id}/insurance`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <HeartPulse className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                  {locale === 'ar' ? 'التأمين' : 'Insurance'}
                </Button>
              </Link>
            </div>
            <EmploymentActionDialogs
              personId={person.id}
              personLabel={person.fullNameEn ?? person.personNumber}
              legalEntityId={person.legalEntityId}
              assignmentStatus={person.assignmentStatus}
              current={{
                departmentId:  person.currentDepartmentId,
                locationId:    person.currentLocationId,
                lineManagerId: person.lineManagerId,
                gradeId:       person.currentGradeId,
                positionId:    person.currentPositionId,
                jobId:         person.currentJobId,
                projectId:     assignmentRows.find(a => a.isCurrent)?.projectId ?? null,
              }}
              picklists={{
                departments: deptOpts,
                locations:   locationOpts,
                managers:    managerOpts.filter(m => m.id !== person.id),
                grades:      gradeOpts,
                positions:   positionOpts,
                jobs:        jobOpts,
                projects:    projectOpts,
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/persons/${person.id}/contracts/amend`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                  {locale === 'ar' ? 'نقل' : 'Transfer'}
                </Button>
              </Link>
              <Link href={`/persons/${person.id}/contracts/terminate`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                  {locale === 'ar' ? 'ترقية' : 'Promote'}
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Award className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                {locale === 'ar' ? 'تغيير الدرجة' : 'Grade Change'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Personal info ─────────────────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'المعلومات الشخصية' : 'Personal Information'}</h3></div>
          <div style={{ padding: '16px 20px' }} className="space-y-3 text-sm">
            <Row label={locale === 'ar' ? 'تاريخ الميلاد' : 'Date of birth'}        value={person.dateOfBirth} />
            <Row label={locale === 'ar' ? 'الجنس' : 'Gender'}               value={person.gender} />
            <Row label={locale === 'ar' ? 'الحالة الاجتماعية' : 'Marital status'}       value={person.maritalStatus ?? '—'} />
            <Row label={locale === 'ar' ? 'عدد المعالين' : 'Number of dependents'} value={String(person.numberOfDependents)} />
            <Row label={locale === 'ar' ? 'الجنسية' : 'Nationality'}          value={`${person.nationalityCode} (${person.nationalityCategory.replace('_',' ')})`} />
            {person.religion && (
              <Row label={locale === 'ar' ? 'الديانة' : 'Religion'} value={`${person.religion}${person.religionConsentGiven ? (locale === 'ar' ? ' · بموافقة' : ' · consent given') : (locale === 'ar' ? ' · بدون موافقة' : ' · no consent')}`} />
            )}
          </div>
        </div>

        {/* ── Identity Documents (PII) ──────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'الوثائق الرسمية' : 'Identity Documents'}
              <span className={`ms-2 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-xs font-medium ${person.piiMasked ? 'bg-surface text-ink-3 ring-1 ring-border' : 'bg-accent-050 text-accent-700'}`}>
                {person.piiMasked ? (locale === 'ar' ? 'مُخفاة' : 'masked') : (locale === 'ar' ? 'ظاهرة' : 'unmasked')}
              </span>
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }} className="space-y-3 text-sm">
            <Row label={locale === 'ar' ? 'الهوية الإماراتية' : 'Emirates ID'}   value={person.emiratesId ?? '—'} mono />
            <Row label={locale === 'ar' ? 'انتهاء الهوية' : 'EID expiry'}    value={person.emiratesIdExpiry ?? '—'} />
            <Row label={locale === 'ar' ? 'رقم جواز السفر' : 'Passport #'}    value={person.passportNumber ?? '—'} mono />
            <Row label={locale === 'ar' ? 'دولة جواز السفر' : 'Passport country'} value={person.passportCountry ?? '—'} />
            <Row label={locale === 'ar' ? 'انتهاء جواز السفر' : 'Passport expiry'}  value={person.passportExpiry ?? '—'} />
            <Row label={locale === 'ar' ? 'رقم التأشيرة' : 'Visa #'}        value={person.visaNumber ?? '—'} />
            <Row label={locale === 'ar' ? 'انتهاء التأشيرة' : 'Visa expiry'}   value={person.visaExpiry ?? '—'} />
            <Row label={locale === 'ar' ? 'حالة التأشيرة' : 'Visa status'}   value={person.visaStatus ?? '—'} />
            <Row label={locale === 'ar' ? 'رقم بطاقة العمل' : 'Labour card #'} value={person.labourCardNumber ?? '—'} />
            {person.nationalityCategory === 'UAE_NATIONAL' && (
              <>
                <Row label={locale === 'ar' ? 'رقم خلاصة القيد' : 'Family book #'}  value={person.familyBookNumber ?? '—'} />
                <Row label={locale === 'ar' ? 'رقم تسجيل نافس' : 'Nafis reg #'}    value={person.nafisRegistrationNumber ?? '—'} />
              </>
            )}
            {person.piiMasked && (
              <p className="mt-2 rounded-md bg-surface p-2 text-xs text-ink-3">
                {locale === 'ar'
                  ? 'المعرّفات الحساسة مُخفاة. سجّل الدخول بدور HR_ADMIN أو HR_DIRECTOR أو PAYROLL_ADMIN لعرضها كاملة (مع تسجيل تدقيقي).'
                  : 'Sensitive identifiers are masked. Sign in as HR_ADMIN, HR_DIRECTOR, or PAYROLL_ADMIN to view in full (audit-logged).'}
              </p>
            )}
          </div>
        </div>

        {/* ── Employment ───────────────────────────────────────────── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }} className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.75} />
              {locale === 'ar'
                ? <span dir="rtl" lang="ar">التوظيف</span>
                : 'Employment'}
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }} className="space-y-3 text-sm">
            <Row label={locale === 'ar' ? 'تاريخ التعيين' : 'Hire date'}         value={person.hireDate} />
            <Row label={locale === 'ar' ? 'تاريخ التعيين الأصلي' : 'Original hire'}     value={person.originalHireDate ?? '—'} />
            <Row label={locale === 'ar' ? 'نهاية فترة الاختبار' : 'Probation end'}     value={person.probationEndDate ?? '—'} />
            <Row label={locale === 'ar' ? 'فترة الإشعار' : 'Notice period'}     value={`${person.noticePeriodDays} ${locale === 'ar' ? 'يوم' : 'days'}`} />
            <Row label={locale === 'ar' ? 'نوع التوظيف' : 'Employment type'}   value={person.employmentType} />
            <Row label={locale === 'ar' ? 'ساعات العقد' : 'Contracted hours'}  value={String(person.contractedHoursPerWeek)} />
            <Row label={locale === 'ar' ? 'القسم' : 'Department'}        value={dept ? `${dept.nameEn}${dept.nameAr ? ` · ${dept.nameAr}` : ''}` : '—'} />
            <Row label={locale === 'ar' ? 'المنصب' : 'Position'}          value={position?.titleEn ?? '—'} />
            <Row label={locale === 'ar' ? 'الوظيفة' : 'Job'}               value={job?.titleEn ?? '—'} />
            <Row label={locale === 'ar' ? 'الموقع' : 'Location'}          value={location ? `${location.nameEn}${location.nameAr ? ` · ${location.nameAr}` : ''}` : '—'} />
            <Row label={locale === 'ar' ? 'الدرجة' : 'Grade'}             value={grade ? `${grade.nameEn}${grade.nameAr ? ` · ${grade.nameAr}` : ''}` : '—'} />
            <Row label={locale === 'ar' ? 'المشروع' : 'Project'}           value={currentWaRow?.projectNameEn ? `${currentWaRow.projectNameEn}${currentWaRow.projectNameAr ? ` · ${currentWaRow.projectNameAr}` : ''}` : '—'} />
            <Row label={locale === 'ar' ? 'المدير المباشر' : 'Line manager'}      value={lineManagerRow ? `${lineManagerRow.fullNameEn ?? lineManagerRow.personNumber}` : '—'} />
            <Row label={locale === 'ar' ? 'المدير الوظيفي' : 'Functional manager'} value={functionalManagerRow ? `${functionalManagerRow.fullNameEn ?? functionalManagerRow.personNumber}` : '—'} />
            {job?.isEmiratisationTarget && person.nationalityCategory === 'UAE_NATIONAL' && (
              <span className="inline-flex items-center rounded-full bg-accent-050 px-2.5 py-0.5 text-xs font-medium text-accent-700">
                {locale === 'ar' ? 'يُحتسب ضمن حصة نافس (BR-NAF-002)' : 'Counts toward Nafis quota (BR-NAF-002)'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Contacts + Addresses ─────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'جهات الاتصال' : 'Contacts'}</h3></div>
          <div style={{ padding: '16px 20px' }}>
            {contactRows.length === 0
              ? <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا توجد جهات اتصال مسجلة.' : 'No contacts on file.'}</p>
              : (
                <ul className="space-y-2 text-sm">
                  {contactRows.map(c => (
                    <li key={c.id} className="flex items-center justify-between">
                      <span className="text-ink-2">{c.contactType.replace('_',' ').toLowerCase()}</span>
                      <span className="font-mono text-ink-1">{c.contactValue}</span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'العناوين' : 'Addresses'}</h3></div>
          <div style={{ padding: '16px 20px' }}>
            {addressRows.length === 0
              ? <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا توجد عناوين مسجلة.' : 'No addresses on file.'}</p>
              : (
                <ul className="space-y-3 text-sm">
                  {addressRows.map(a => (
                    <li key={a.id}>
                      <div className="text-xs uppercase text-ink-3">{a.addressType.replace('_',' ').toLowerCase()}</div>
                      <div className="text-ink-1">{a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ''}</div>
                      <div className="text-ink-2">{a.city}{a.stateEmirate ? `, ${a.stateEmirate}` : ''}, {a.country}</div>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      </div>

      {/* ── Documents ─────────────────────────────────────────────── */}
      <div className="mt-6" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }} className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" aria-hidden strokeWidth={1.75} />
            {locale === 'ar'
              ? <span dir="rtl" lang="ar">الوثائق</span>
              : 'Documents'}
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {documents.length === 0 ? (
            <p className="text-sm text-ink-3">{locale === 'ar' ? 'لم يتم رفع أي مستندات.' : 'No documents uploaded.'}</p>
          ) : (
            <TableScrollRegion><table className="w-full text-sm">
              <thead className="border-b border-border text-start text-xs uppercase text-ink-3">
                <tr>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'تاريخ الإصدار' : 'Issued'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الانتهاء' : 'Expiry'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map(d => (
                  <tr key={d.id}>
                    <td className="py-2 pe-3 text-ink-2">{d.documentType}</td>
                    <td className="py-2 pe-3 text-ink-1">{d.documentTitle}</td>
                    <td className="py-2 pe-3 font-mono text-xs text-ink-3">{d.issueDate ?? '—'}</td>
                    <td className="py-2 pe-3 font-mono text-xs text-ink-3">{d.expiryDate ?? '—'}</td>
                    <td className="py-2 pe-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${d.documentStatus === 'VALID' ? 'bg-accent-050 text-accent-700' : 'bg-surface text-ink-3 ring-1 ring-border'}`}>
                        {d.documentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></TableScrollRegion>
          )}
        </div>
      </div>

      {/* ── Contracts ─────────────────────────────────────────────── */}
      <div className="mt-6" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'العقود' : 'Contracts'}</h3></div>
        <div style={{ padding: '16px 20px' }}>
          {contractRows.length === 0
            ? <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا توجد عقود مسجلة.' : 'No contracts on file.'}</p>
            : (
              <TableScrollRegion><table className="w-full text-sm">
                <thead className="border-b border-border text-start text-xs uppercase text-ink-3">
                  <tr>
                    <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'رقم العقد' : 'Contract #'}</th>
                    <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'البداية' : 'Start'}</th>
                    <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'النهاية' : 'End'}</th>
                    <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                    <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contractRows.map(c => (
                    <tr key={c.id}>
                      <td className="py-2 pe-3 font-mono text-xs text-ink-1">{c.contractNumber}</td>
                      <td className="py-2 pe-3 font-mono text-xs text-ink-3">{c.startDate}</td>
                      <td className="py-2 pe-3 font-mono text-xs text-ink-3">{c.endDate}</td>
                      <td className="py-2 pe-3 text-ink-2">{c.employmentType}</td>
                      <td className="py-2 pe-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.status === 'ACTIVE' ? 'bg-accent-050 text-accent-700' : 'bg-surface text-ink-3 ring-1 ring-border'}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></TableScrollRegion>
            )}
        </div>
      </div>

      {/* ── Assignment + action history ───────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'سجل تعيينات العامل' : 'Worker assignment history'}</h3></div>
          <div style={{ padding: '16px 20px' }}>
            {assignmentRows.length === 0
              ? <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا يوجد سجل تعيينات.' : 'No assignment history.'}</p>
              : (
                <ul className="space-y-2 text-sm">
                  {assignmentRowsWithHistoricalLabels.map(a => {
                    const tState = classifyTemporal(
                      String(a.effectiveStartDate),
                      String(a.effectiveEndDate ?? '9999-12-31'),
                      new Date().toISOString().slice(0, 10),
                    )
                    const tLabel = tState === 'CURRENT' ? (locale === 'ar' ? 'الحالي' : 'Current')
                                 : tState === 'FUTURE'  ? (locale === 'ar' ? 'مستقبلي' : 'Future')
                                 : (locale === 'ar' ? 'سابق' : 'Past')
                    return (
                    <li key={a.id} className="border-s-2 border-border ps-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-3">
                          {a.effectiveStartDate} → {a.effectiveEndDate ?? (locale === 'ar' ? 'الحالي' : 'current')}
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-border" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>{tLabel}</span>
                      </div>
                      <div className="text-ink-1">{a.actionType.replace('_',' ')}</div>
                      <div className="mt-1 grid gap-1 text-xs text-ink-2 sm:grid-cols-2">
                        <span>{locale === 'ar' ? 'القسم' : 'Department'}: {a.historicalLabels.department}</span>
                        <span>{locale === 'ar' ? 'المنصب' : 'Position'}: {a.historicalLabels.position}</span>
                        <span>{locale === 'ar' ? 'الوظيفة' : 'Job'}: {a.historicalLabels.job}</span>
                        <span>{locale === 'ar' ? 'الدرجة' : 'Grade'}: {a.historicalLabels.grade}</span>
                        <span>{locale === 'ar' ? 'الموقع' : 'Location'}: {a.historicalLabels.location}</span>
                      </div>
                      <div className="text-xs text-ink-3">{a.actionReason ?? '—'}</div>
                    </li>
                  )})}
                </ul>
              )}
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'إجراءات التوظيف' : 'Employment actions'}</h3></div>
          <div style={{ padding: '16px 20px' }}>
            {actionRows.length === 0
              ? <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا توجد إجراءات مسجلة.' : 'No actions recorded.'}</p>
              : (
                <ul className="space-y-2 text-sm">
                  {actionRows.map(a => (
                    <li key={a.id} className="border-s-2 border-border ps-3">
                      <div className="font-mono text-xs text-ink-3">{a.effectiveDate}</div>
                      <div className="text-ink-1">{a.actionType.replace('_',' ')}</div>
                      <div className="text-xs text-ink-3">{a.reasonText ?? '—'}</div>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      </div>

      {/* Configured form sections (informational — confirms resolveFormConfig wiring) */}
      <p className="mt-8 text-xs text-ink-3">
        {locale === 'ar' ? 'الأقسام المُهيّأة للدور' : 'Sections configured for role'} <code className="font-mono">{session.user.role}</code>:{' '}
        {formConfig.sections.map(s => s.labelEn).join(' · ')}
      </p>
    </div>
  )
}

type WorkerAssignmentHistoryRow = typeof workerAssignments.$inferSelect
type HistoryLabelCache = Map<string, Promise<string>>

interface AssignmentHistoryLabels {
  department: string
  job: string
  position: string
  grade: string
  location: string
}

const EMPTY_HISTORY_LABEL = '—'
const HISTORY_CONFLICT_LABEL = 'History conflict'

function formatMdmLabel(primary?: string | null, secondary?: string | null): string | null {
  const p = primary?.trim()
  const s = secondary?.trim()
  if (p && s) return `${p} · ${s}`
  return p || s || null
}

function cachedHistoryLabel(
  cache: HistoryLabelCache,
  key: string,
  resolver: () => Promise<string>,
): Promise<string> {
  const cached = cache.get(key)
  if (cached) return cached

  const resolved = resolver()
  cache.set(key, resolved)
  return resolved
}

async function resolveAssignmentHistoryLabels(
  assignment: WorkerAssignmentHistoryRow,
  cache: HistoryLabelCache,
): Promise<AssignmentHistoryLabels> {
  const asOfDate = assignment.effectiveStartDate

  const [department, job, position, grade, location] = await Promise.all([
    resolveDepartmentHistoryLabel(assignment.departmentId, asOfDate, cache),
    resolveJobHistoryLabel(assignment.jobId, asOfDate, cache),
    resolvePositionHistoryLabel(assignment.positionId, asOfDate, cache),
    resolveGradeHistoryLabel(assignment.gradeId, asOfDate, cache),
    resolveLocationHistoryLabel(assignment.locationId, asOfDate, cache),
  ])

  return { department, job, position, grade, location }
}

async function resolveDepartmentHistoryLabel(
  departmentId: string | null,
  asOfDate: string,
  cache: HistoryLabelCache,
): Promise<string> {
  if (!departmentId) return EMPTY_HISTORY_LABEL

  return cachedHistoryLabel(cache, `department:${departmentId}:${asOfDate}`, async () => {
    try {
      const history = await getAsOfRow<typeof departmentHistory.$inferSelect>(
        db,
        departmentHistoryAsOfAdapter,
        { tenantId: TENANT_ID, departmentId },
        asOfDate,
      )
      const label = history ? formatMdmLabel(history.nameEn, history.nameAr) : null
      if (label) return label
    } catch (err) {
      if (err instanceof AsOfConflictError) return HISTORY_CONFLICT_LABEL
      throw err
    }

    const [current] = await db
      .select({ nameEn: departments.nameEn, nameAr: departments.nameAr })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.id, departmentId)))
      .limit(1)

    return formatMdmLabel(current?.nameEn, current?.nameAr) ?? EMPTY_HISTORY_LABEL
  })
}

async function resolveJobHistoryLabel(
  jobId: string | null,
  asOfDate: string,
  cache: HistoryLabelCache,
): Promise<string> {
  if (!jobId) return EMPTY_HISTORY_LABEL

  return cachedHistoryLabel(cache, `job:${jobId}:${asOfDate}`, async () => {
    try {
      const history = await getAsOfRow<typeof jobHistory.$inferSelect>(
        db,
        jobHistoryAsOfAdapter,
        { tenantId: TENANT_ID, jobId },
        asOfDate,
      )
      const label = history ? formatMdmLabel(history.jobTitleEn, history.jobTitleAr) : null
      if (label) return label
    } catch (err) {
      if (err instanceof AsOfConflictError) return HISTORY_CONFLICT_LABEL
      throw err
    }

    const [current] = await db
      .select({ titleEn: jobs.jobTitleEn, titleAr: jobs.jobTitleAr })
      .from(jobs)
      .where(and(eq(jobs.tenantId, TENANT_ID), eq(jobs.id, jobId)))
      .limit(1)

    return formatMdmLabel(current?.titleEn, current?.titleAr) ?? EMPTY_HISTORY_LABEL
  })
}

async function resolvePositionHistoryLabel(
  positionId: string | null,
  asOfDate: string,
  cache: HistoryLabelCache,
): Promise<string> {
  if (!positionId) return EMPTY_HISTORY_LABEL

  return cachedHistoryLabel(cache, `position:${positionId}:${asOfDate}`, async () => {
    try {
      const history = await getAsOfRow<typeof positionHistory.$inferSelect>(
        db,
        positionHistoryAsOfAdapter,
        { tenantId: TENANT_ID, positionId },
        asOfDate,
      )
      const label = history ? formatMdmLabel(history.positionTitleEn, history.positionTitleAr) : null
      if (label) return label
    } catch (err) {
      if (err instanceof AsOfConflictError) return HISTORY_CONFLICT_LABEL
      throw err
    }

    const [current] = await db
      .select({ titleEn: positions.positionTitleEn, titleAr: positions.positionTitleAr })
      .from(positions)
      .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, positionId)))
      .limit(1)

    return formatMdmLabel(current?.titleEn, current?.titleAr) ?? EMPTY_HISTORY_LABEL
  })
}

async function resolveGradeHistoryLabel(
  gradeId: string | null,
  asOfDate: string,
  cache: HistoryLabelCache,
): Promise<string> {
  if (!gradeId) return EMPTY_HISTORY_LABEL

  return cachedHistoryLabel(cache, `grade:${gradeId}:${asOfDate}`, async () => {
    try {
      const history = await getAsOfRow<typeof gradeHistory.$inferSelect>(
        db,
        gradeHistoryAsOfAdapter,
        { tenantId: TENANT_ID, gradeId },
        asOfDate,
      )
      const label = history ? formatMdmLabel(history.gradeNameEn ?? history.gradeCode, history.gradeNameAr) : null
      if (label) return label
    } catch (err) {
      if (err instanceof AsOfConflictError) return HISTORY_CONFLICT_LABEL
      throw err
    }

    const [current] = await db
      .select({ code: grades.gradeCode, nameEn: grades.gradeNameEn, nameAr: grades.gradeNameAr })
      .from(grades)
      .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.id, gradeId)))
      .limit(1)

    return formatMdmLabel(current?.nameEn ?? current?.code, current?.nameAr) ?? EMPTY_HISTORY_LABEL
  })
}

async function resolveLocationHistoryLabel(
  locationId: string | null,
  asOfDate: string,
  cache: HistoryLabelCache,
): Promise<string> {
  if (!locationId) return EMPTY_HISTORY_LABEL

  return cachedHistoryLabel(cache, `location:${locationId}:${asOfDate}`, async () => {
    try {
      const history = await getAsOfRow<typeof locationHistory.$inferSelect>(
        db,
        locationHistoryAsOfAdapter,
        { tenantId: TENANT_ID, locationId },
        asOfDate,
      )
      const label = history ? formatMdmLabel(history.nameEn, history.nameAr) : null
      if (label) return label
    } catch (err) {
      if (err instanceof AsOfConflictError) return HISTORY_CONFLICT_LABEL
      throw err
    }

    const [current] = await db
      .select({ nameEn: locations.nameEn, nameAr: locations.nameAr })
      .from(locations)
      .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.id, locationId)))
      .limit(1)

    return formatMdmLabel(current?.nameEn, current?.nameAr) ?? EMPTY_HISTORY_LABEL
  })
}

function Row({
  label, value, mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className={`text-ink-1 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
