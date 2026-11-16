import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { departments, legalEntities, businessUnits, persons, jobs, workerAssignments, workSchedules } from '@/drizzle/schema'
import { eq, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { DepartmentClient } from './components/DepartmentClient'
import type { DepartmentRow } from './components/DepartmentDrawer'

export const metadata = { title: 'Departments' }

export default async function DepartmentsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  // ── Fetch reference data in parallel ──────────────────────────────────────
  const [rawDepts, allEntities, allBUs, rawPersons, rawSchedules, auditHistory] = await Promise.all([
    db
      .select({
        id:                 departments.id,
        legalEntityId:      departments.legalEntityId,
        businessUnitId:     departments.businessUnitId,
        code:               departments.code,
        nameEn:             departments.nameEn,
        nameAr:             departments.nameAr,
        departmentType:     departments.departmentType,
        parentDepartmentId: departments.parentDepartmentId,
        approvedHeadcount:  departments.approvedHeadcount,
        costCentreCode:     departments.costCentreCode,
        glAccountCode:      departments.glAccountCode,
        headPersonId:       departments.headPersonId,
        workScheduleId:     departments.workScheduleId,
        isActive:           departments.isActive,
        // Entity name from join
        entityName:         legalEntities.nameEn,
        // Head + schedule display names (leftJoin — nullable)
        headPersonName:     persons.fullNameEn,
        headPersonNumber:   persons.personNumber,
        workScheduleName:   workSchedules.scheduleNameEn,
        workScheduleCode:   workSchedules.scheduleCode,
      })
      .from(departments)
      .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
      .leftJoin(persons, eq(departments.headPersonId, persons.id))
      .leftJoin(workSchedules, eq(departments.workScheduleId, workSchedules.id))
      .where(eq(departments.tenantId, TENANT_ID))
      .orderBy(asc(departments.code)),

    db
      .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn)),

    db
      .select({ id: businessUnits.id, legalEntityId: businessUnits.legalEntityId, nameEn: businessUnits.nameEn })
      .from(businessUnits)
      .where(eq(businessUnits.tenantId, TENANT_ID))
      .orderBy(asc(businessUnits.nameEn)),

    // Active-employee LOV for the Department Head selector.
    // persons.isActive is NOT cleared on termination → also gate assignmentStatus='ACTIVE'
    // and require a current worker_assignment (isCurrent) to exclude terminated staff.
    db
      .select({
        id:            persons.id,
        fullNameEn:    persons.fullNameEn,
        personNumber:  persons.personNumber,
        legalEntityId: persons.legalEntityId,
        jobTitleEn:    jobs.jobTitleEn,
      })
      .from(persons)
      .innerJoin(workerAssignments, and(
        eq(workerAssignments.personId,  persons.id),
        eq(workerAssignments.tenantId,  TENANT_ID),
        eq(workerAssignments.isCurrent, true),
      ))
      .leftJoin(jobs, eq(jobs.id, workerAssignments.jobId))
      .where(and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.isActive, true),
        eq(persons.assignmentStatus, 'ACTIVE'),
      ))
      .orderBy(asc(persons.fullNameEn)),

    // Active work schedules (tenant-global + entity-specific) for the Work Schedule selector.
    db
      .select({
        id:             workSchedules.id,
        scheduleNameEn: workSchedules.scheduleNameEn,
        scheduleCode:   workSchedules.scheduleCode,
        isDefault:      workSchedules.isDefault,
        legalEntityId:  workSchedules.legalEntityId,
      })
      .from(workSchedules)
      .where(and(eq(workSchedules.tenantId, TENANT_ID), eq(workSchedules.isActive, true)))
      .orderBy(asc(workSchedules.scheduleNameEn)),

    getMdmChangeHistory('departments', 30),
  ])

  // Map to DepartmentRow — entityName / head / schedule are nullable from leftJoin
  const initialData: DepartmentRow[] = rawDepts.map(d => ({
    id:                 d.id,
    legalEntityId:      d.legalEntityId,
    businessUnitId:     d.businessUnitId,
    code:               d.code,
    nameEn:             d.nameEn,
    nameAr:             d.nameAr,
    departmentType:     d.departmentType ?? null,
    parentDepartmentId: d.parentDepartmentId ?? null,
    approvedHeadcount:  d.approvedHeadcount,
    costCentreCode:     d.costCentreCode ?? null,
    glAccountCode:      d.glAccountCode ?? null,
    headPersonId:       d.headPersonId ?? null,
    headPersonName:     d.headPersonName
      ? `${d.headPersonName}${d.headPersonNumber ? ` — ${d.headPersonNumber}` : ''}`
      : null,
    workScheduleId:     d.workScheduleId ?? null,
    workScheduleName:   d.workScheduleName ?? null,
    workScheduleCode:   d.workScheduleCode ?? null,
    isActive:           d.isActive,
    entityName:         d.entityName ?? undefined,
  }))

  const personOptions = rawPersons.map(p => ({
    id:            p.id,
    label:         `${p.fullNameEn ?? '—'} — ${p.personNumber}`,
    sublabel:      p.jobTitleEn ?? undefined,
    legalEntityId: p.legalEntityId,
  }))

  const scheduleOptions = rawSchedules.map(s => ({
    id:            s.id,
    scheduleNameEn: s.scheduleNameEn,
    scheduleCode:  s.scheduleCode,
    isDefault:     s.isDefault,
    legalEntityId: s.legalEntityId ?? null,
  }))

  return (
    <DepartmentClient
      initialData={initialData}
      auditHistory={auditHistory}
      legalEntities={allEntities}
      businessUnits={allBUs}
      personOptions={personOptions}
      scheduleOptions={scheduleOptions}
    />
  )
}
