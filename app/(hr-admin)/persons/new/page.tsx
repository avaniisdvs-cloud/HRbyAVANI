import { redirect } from 'next/navigation'
import { eq, and, asc } from 'drizzle-orm'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  legalEntities, departments, jobs, positions, grades, locations, persons,
  hiringRequests, projects,
} from '@/drizzle/schema'
import { resolveFormConfig, resolveCustomFields } from '@/lib/config-resolver'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { t } from '@/lib/locale-server'
import { PersonNewForm, type HiringRequestPrefill } from './PersonNewForm'

export const metadata = { title: 'Create Person' }

/**
 * S3-02 — Create Person form (Server Component shell).
 *
 * Accepts optional ?hiringRequestId= query param (ME-4): loads position +
 * department from the approved hiring request and pre-populates the form.
 */
export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<{ hiringRequestId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowedRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(roleHome(session.user.role))

  const sp = searchParams ? await searchParams : {} as { hiringRequestId?: string }

  // ME-4 — load hiring request prefill if param present
  let hiringRequestPrefill: HiringRequestPrefill | undefined
  if (sp.hiringRequestId) {
    const [hr] = await db
      .select({
        id:           hiringRequests.id,
        positionId:   hiringRequests.positionId,
        departmentId: hiringRequests.departmentId,
        status:       hiringRequests.status,
      })
      .from(hiringRequests)
      .where(and(
        eq(hiringRequests.tenantId, TENANT_ID),
        eq(hiringRequests.id, sp.hiringRequestId),
      ))
      .limit(1)

    if (hr && hr.status === 'APPROVED') {
      const [pos] = await db
        .select({ titleEn: positions.positionTitleEn })
        .from(positions)
        .where(eq(positions.id, hr.positionId))
        .limit(1)
      const [dept] = await db
        .select({ nameEn: departments.nameEn })
        .from(departments)
        .where(eq(departments.id, hr.departmentId))
        .limit(1)

      hiringRequestPrefill = {
        hiringRequestId: hr.id,
        positionId:      hr.positionId,
        departmentId:    hr.departmentId,
        positionTitle:   pos?.titleEn ?? '',
        departmentName:  dept?.nameEn ?? '',
      }
    }
  }

  const [
    entityRows, departmentRows, jobRows, positionRows, gradeRows, locationRows,
    managerRows, projectRows, formConfig, customFields,
  ] = await Promise.all([
    db.select({ id: legalEntities.id, code: legalEntities.entityCode, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.entityCode)),
    db.select({ id: departments.id, legalEntityId: departments.legalEntityId, code: departments.code, nameEn: departments.nameEn, nameAr: departments.nameAr })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
      .orderBy(asc(departments.nameEn)),
    db.select({ id: jobs.id, code: jobs.jobCode, titleEn: jobs.jobTitleEn, titleAr: jobs.jobTitleAr, isEmiratisationTarget: jobs.isEmiratisationTarget })
      .from(jobs)
      .where(and(eq(jobs.tenantId, TENANT_ID), eq(jobs.isActive, true)))
      .orderBy(asc(jobs.jobTitleEn)),
    db.select({ id: positions.id, departmentId: positions.departmentId, jobId: positions.jobId, code: positions.positionCode, titleEn: positions.positionTitleEn, titleAr: positions.positionTitleAr, isOccupied: positions.isOccupied })
      .from(positions)
      .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true)))
      .orderBy(asc(positions.positionTitleEn)),
    db.select({ id: grades.id, legalEntityId: grades.legalEntityId, code: grades.gradeCode, nameEn: grades.gradeNameEn, nameAr: grades.gradeNameAr, level: grades.gradeLevel })
      .from(grades)
      .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
      .orderBy(asc(grades.gradeLevel)),
    db.select({ id: locations.id, legalEntityId: locations.legalEntityId, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
      .from(locations)
      .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true)))
      .orderBy(asc(locations.nameEn)),
    // Include legalEntityId + department so PersonNewForm can filter by selected
    // entity and render "Name — EmployeeNumber — Department" labels.
    db.select({
        id:              persons.id,
        personNumber:    persons.personNumber,
        fullNameEn:      persons.fullNameEn,
        legalEntityId:   persons.legalEntityId,
        departmentNameEn: departments.nameEn,
      })
      .from(persons)
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true)))
      .orderBy(asc(persons.fullNameEn))
      .limit(500),
    db.select({ id: projects.id, code: projects.code, nameEn: projects.nameEn, nameAr: projects.nameAr })
      .from(projects)
      .where(and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true)))
      .orderBy(asc(projects.code)),
    resolveFormConfig('PERSON', session.user.role, TENANT_ID),
    resolveCustomFields('PERSON', TENANT_ID),
  ])

  const locale = await resolveLocale(session.user.personId)

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 24 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link href="/persons" style={{ color: 'var(--ink-3)', textDecoration: 'none' }}>{t(locale, 'Employees', 'الموظفون')}</Link>
          <span>/</span>
          <span>{t(locale, 'New Employee', 'موظف جديد')}</span>
        </div>
        {/* Title */}
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, color: 'var(--ink-1)', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
          {t(locale, 'Add New Employee', 'إضافة موظف جديد')}
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
          {t(locale, 'Complete required fields to create the employee record. All PII fields are encrypted before storage.', 'أكمل الحقول المطلوبة لإنشاء سجل الموظف. يتم تشفير جميع حقول البيانات الشخصية قبل التخزين.')}
        </p>
      </div>

      <PersonNewForm
        defaultLegalEntityId={session.user.legalEntityId}
        legalEntities={entityRows}
        departments={departmentRows}
        jobs={jobRows}
        positions={positionRows}
        grades={gradeRows}
        locations={locationRows}
        managers={managerRows}
        projects={projectRows}
        formConfig={formConfig}
        customFields={customFields}
        currentUserId={session.user.id}
        hiringRequestPrefill={hiringRequestPrefill}
      />
    </div>
  )
}
