import { redirect, notFound } from 'next/navigation'
import { and, asc, eq, or } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { personContacts, personAddresses, personEmergencyContacts, personEducation, persons, positions, departments, grades, locations, workerAssignments, projects, workSchedules, workScheduleAssignments } from '@/drizzle/schema'
import { getPerson } from '@/modules/core-hr'
import { resolveFormConfig, resolveCustomFields } from '@/lib/config-resolver'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { PersonEditForm } from './PersonEditForm'

export const metadata = { title: 'Edit person' }

/**
 * S4-01 — Person profile edit (Server Component shell).
 *
 * Loads the masked/decrypted PersonView via getPerson (so PII visibility
 * follows the same role rules as the read profile), plus contacts and
 * addresses for the read-only sidecar. The Client Component below diffs the
 * form state against this initial snapshot and only sends changed fields to
 * updatePerson — matching the partial-patch semantics in UpdatePersonSchema.
 *
 * Employment fields (legal entity, hire date, employment type, department,
 * position, grade) are NOT editable here — those changes flow through
 * employment_actions (S3-06 / S4-03) so the worker_assignments history
 * stays effective-dated (Hard Rule 3).
 */
export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)

  const { id } = await params

  // Same role gate as updatePerson (modules/core-hr/actions.ts:369).
  // EMPLOYEE/MANAGER/PAYROLL_ADMIN can read the profile but cannot edit.
  const allowedRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(`/persons/${id}`)

  // S4-Q1 — page-level entity-scope redirect for parity with the other
  // Sprint 4 admin pages. `getPerson` would still throw FORBIDDEN on a
  // cross-entity read (defense in depth), but the redirect gives a cleaner
  // UX than the framework error boundary.
  const [scope] = await db
    .select({ legalEntityId: persons.legalEntityId })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
    .limit(1)
  if (!scope) notFound()
  if (
    session.user.role !== 'SUPER_ADMIN'
    && session.user.legalEntityId !== scope.legalEntityId
  ) redirect(`/persons/${id}`)

  const person = await getPerson(id)
  if (!person) notFound()

  // Pre-fetch current project assignment so the picklist can include the
  // current project even if it has since been marked inactive (OR anchor).
  const currentWa = await db
    .select({ projectId: workerAssignments.projectId, allocationPct: workerAssignments.projectAllocationPct })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, person.id),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)
    .then(r => r[0] ?? null)
  const currentProjectId    = currentWa?.projectId   ?? null
  const currentAllocationPct = currentWa?.allocationPct ?? null
  // hasWorkerAssignment drives the Project field gate in PersonEditForm.
  // Without a current WA row, updatePersonProject returns { noAssignment: true }
  // and the project would be silently discarded — disable the field upfront.
  const hasWorkerAssignment = currentWa !== null

  // Collect both manager IDs that need anchoring in the managers picklist.
  const dottedMgrId = (person as Record<string, unknown>).dottedLineManagerId as string | null ?? null

  const [contactRows, addressRows, emergencyRow, educationRow, formConfig, customFields, positionRows, departmentRows, gradeRows, locationRows, managerRows, projectRows, scheduleRows, currentScheduleAssignment] = await Promise.all([
    db.select().from(personContacts)
      .where(and(
        eq(personContacts.tenantId, TENANT_ID),
        eq(personContacts.personId, person.id),
        eq(personContacts.isActive, true),
      ))
      .orderBy(asc(personContacts.contactType)),
    db.select().from(personAddresses)
      .where(and(
        eq(personAddresses.tenantId, TENANT_ID),
        eq(personAddresses.personId, person.id),
      ))
      .orderBy(asc(personAddresses.addressType)),
    db.select({
      id:            personEmergencyContacts.id,
      contactNameEn: personEmergencyContacts.contactNameEn,
      relationship:  personEmergencyContacts.relationship,
      phonePrimary:  personEmergencyContacts.phonePrimary,
    })
      .from(personEmergencyContacts)
      .where(and(
        eq(personEmergencyContacts.tenantId, TENANT_ID),
        eq(personEmergencyContacts.personId, person.id),
        eq(personEmergencyContacts.priorityOrder, 1),
      ))
      .limit(1)
      .then(r => r[0] ?? null),
    db.select({
      id:              personEducation.id,
      institutionName: personEducation.institutionName,
      degreeType:      personEducation.degreeType,
      fieldOfStudy:    personEducation.fieldOfStudy,
      country:         personEducation.country,
      startYear:       personEducation.startYear,
      graduationYear:  personEducation.graduationYear,
      isHighestDegree: personEducation.isHighestDegree,
    })
      .from(personEducation)
      .where(and(
        eq(personEducation.tenantId, TENANT_ID),
        eq(personEducation.personId, person.id),
        eq(personEducation.isHighestDegree, true),
      ))
      .limit(1)
      .then(r => r[0] ?? null),
    resolveFormConfig('PERSON', session.user.role, TENANT_ID),
    resolveCustomFields('PERSON', TENANT_ID),
    // Anchor: always include the person's current position even if it is
    // inactive or belongs to a different entity (prevents blank dropdown).
    person.currentPositionId
      ? db.select({ id: positions.id, titleEn: positions.positionTitleEn, positionCode: positions.positionCode })
          .from(positions)
          .where(or(
            and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true), eq(positions.legalEntityId, scope.legalEntityId)),
            and(eq(positions.tenantId, TENANT_ID), eq(positions.id, person.currentPositionId)),
          )!)
          .orderBy(asc(positions.positionTitleEn))
      : db.select({ id: positions.id, titleEn: positions.positionTitleEn, positionCode: positions.positionCode })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true), eq(positions.legalEntityId, scope.legalEntityId)))
          .orderBy(asc(positions.positionTitleEn)),
    // Anchor: always include the person's current department even if inactive.
    person.currentDepartmentId
      ? db.select({ id: departments.id, nameEn: departments.nameEn })
          .from(departments)
          .where(or(
            and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true), eq(departments.legalEntityId, scope.legalEntityId)),
            and(eq(departments.tenantId, TENANT_ID), eq(departments.id, person.currentDepartmentId)),
          )!)
          .orderBy(asc(departments.nameEn))
      : db.select({ id: departments.id, nameEn: departments.nameEn })
          .from(departments)
          .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true), eq(departments.legalEntityId, scope.legalEntityId)))
          .orderBy(asc(departments.nameEn)),
    // Anchor: always include the person's current grade even if inactive.
    person.currentGradeId
      ? db.select({ id: grades.id, gradeNameEn: grades.gradeNameEn, gradeCode: grades.gradeCode })
          .from(grades)
          .where(or(
            and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)),
            and(eq(grades.tenantId, TENANT_ID), eq(grades.id, person.currentGradeId)),
          )!)
          .orderBy(asc(grades.gradeLevel))
      : db.select({ id: grades.id, gradeNameEn: grades.gradeNameEn, gradeCode: grades.gradeCode })
          .from(grades)
          .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
          .orderBy(asc(grades.gradeLevel)),
    // Anchor: always include the person's current location even if inactive.
    person.currentLocationId
      ? db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
          .from(locations)
          .where(or(
            and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true), eq(locations.legalEntityId, scope.legalEntityId)),
            and(eq(locations.tenantId, TENANT_ID), eq(locations.id, person.currentLocationId)),
          )!)
          .orderBy(asc(locations.nameEn))
      : db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
          .from(locations)
          .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true), eq(locations.legalEntityId, scope.legalEntityId)))
          .orderBy(asc(locations.nameEn)),
    // Join departments for label; anchor both line manager and functional manager
    // so both always appear in the dropdown even if their records are inactive.
    (person.lineManagerId || dottedMgrId)
      ? db.select({ id: persons.id, fullNameEn: persons.fullNameEn, personNumber: persons.personNumber, departmentNameEn: departments.nameEn })
          .from(persons)
          .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
          .where(or(
            and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.legalEntityId, scope.legalEntityId)),
            person.lineManagerId ? and(eq(persons.tenantId, TENANT_ID), eq(persons.id, person.lineManagerId)) : undefined,
            dottedMgrId ? and(eq(persons.tenantId, TENANT_ID), eq(persons.id, dottedMgrId)) : undefined,
          )!)
          .orderBy(asc(persons.fullNameEn))
      : db.select({ id: persons.id, fullNameEn: persons.fullNameEn, personNumber: persons.personNumber, departmentNameEn: departments.nameEn })
          .from(persons)
          .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.legalEntityId, scope.legalEntityId)))
          .orderBy(asc(persons.fullNameEn)),
    // Projects picklist — anchor current project so it appears even if inactive.
    currentProjectId
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
          .orderBy(asc(projects.nameEn)),
    // Task 2D — Work schedules available for this entity (picker options).
    db.select({
      id:             workSchedules.id,
      scheduleNameEn: workSchedules.scheduleNameEn,
      scheduleCode:   workSchedules.scheduleCode,
      isDefault:      workSchedules.isDefault,
    })
      .from(workSchedules)
      .where(and(
        eq(workSchedules.tenantId, TENANT_ID),
        eq(workSchedules.legalEntityId, scope.legalEntityId),
        eq(workSchedules.isActive, true),
      ))
      .orderBy(asc(workSchedules.scheduleCode)),
    // Task 2D — Current work schedule assignment for this person.
    db.select({ workScheduleId: workScheduleAssignments.workScheduleId })
      .from(workScheduleAssignments)
      .where(and(
        eq(workScheduleAssignments.tenantId, TENANT_ID),
        eq(workScheduleAssignments.personId, id),
        eq(workScheduleAssignments.isCurrent, true),
      ))
      .limit(1)
      .then(r => r[0] ?? null),
  ])

  return (
    <div className="page-in">
      <div className="mb-6">
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{locale === 'ar' ? 'تعديل الموظف' : 'Edit person'}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {person.personNumber} · {person.fullNameEn ?? '—'}
          <span className="mx-2 text-ink-3">·</span>
          <span dir="rtl" lang="ar">{person.fullNameAr}</span>
        </p>
        <p className="mt-2 text-xs text-ink-3">
          {locale === 'ar' ? 'عدّل الهوية والوثائق وتعيين العمل والتفضيلات أدناه.' : 'Edit identity, documents, employment assignment, and preferences below.'}
        </p>
      </div>

      <PersonEditForm
        person={person}
        contacts={contactRows.map(c => ({
          id: c.id,
          contactType: c.contactType,
          contactValue: c.contactValue,
          isPrimary: c.isPrimary,
        }))}
        addresses={addressRows.map(a => ({
          id: a.id,
          addressType: a.addressType,
          addressLine1: a.addressLine1,
          addressLine2: a.addressLine2,
          city: a.city,
          stateEmirate: a.stateEmirate,
          country: a.country,
          postalCode: a.postalCode ?? null,
          poBox: a.poBox ?? null,
        }))}
        emergencyContact={emergencyRow}
        education={educationRow}
        formConfig={formConfig}
        customFields={customFields}
        positionOptions={positionRows}
        departmentOptions={departmentRows}
        gradeOptions={gradeRows}
        locationOptions={locationRows}
        managerOptions={managerRows.filter(m => m.id !== person.id)}
        projectOptions={projectRows}
        currentProjectId={currentProjectId}
        currentAllocationPct={currentAllocationPct}
        hasWorkerAssignment={hasWorkerAssignment}
        scheduleOptions={scheduleRows}
        currentWorkScheduleId={currentScheduleAssignment?.workScheduleId ?? null}
        legalEntityId={scope.legalEntityId}
      />
    </div>
  )
}
