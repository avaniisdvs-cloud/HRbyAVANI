import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { positions, departments, jobs, grades, locations, legalEntities } from '@/drizzle/schema'
import { eq, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { PositionClient } from './components/PositionClient'
import type { PositionRow } from './components/PositionDrawer'

export const metadata = { title: 'Positions' }

export default async function PositionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [rawPositions, allEntities, allDepts, allJobs, allGrades, allLocations, auditHistory] =
    await Promise.all([
      db
        .select({
          id:                  positions.id,
          legalEntityId:       positions.legalEntityId,
          departmentId:        positions.departmentId,
          jobId:               positions.jobId,
          positionCode:        positions.positionCode,
          positionTitleEn:     positions.positionTitleEn,
          positionTitleAr:     positions.positionTitleAr,
          gradeId:             positions.gradeId,
          locationId:          positions.locationId,
          fteCount:            positions.fteCount,
          isOccupied:          positions.isOccupied,
          reportsToPositionId: positions.reportsToPositionId,
          budgetAmount:        positions.budgetAmount,
          isActive:            positions.isActive,
          // Joined display values
          departmentName: departments.nameEn,
          jobTitleEn:     jobs.jobTitleEn,
          gradeCode:      grades.gradeCode,
          locationName:   locations.nameEn,
        })
        .from(positions)
        .leftJoin(departments, eq(positions.departmentId, departments.id))
        .leftJoin(jobs,        eq(positions.jobId,        jobs.id))
        .leftJoin(grades,      eq(positions.gradeId,      grades.id))
        .leftJoin(locations,   eq(positions.locationId,   locations.id))
        .where(eq(positions.tenantId, TENANT_ID))
        .orderBy(asc(positions.positionCode)),

      db
        .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
        .from(legalEntities)
        .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
        .orderBy(asc(legalEntities.nameEn)),

      db
        .select({
          id:            departments.id,
          legalEntityId: departments.legalEntityId,
          nameEn:        departments.nameEn,
          code:          departments.code,
        })
        .from(departments)
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
        .orderBy(asc(departments.code)),

      db
        .select({ id: jobs.id, jobCode: jobs.jobCode, jobTitleEn: jobs.jobTitleEn })
        .from(jobs)
        .where(and(eq(jobs.tenantId, TENANT_ID), eq(jobs.isActive, true)))
        .orderBy(asc(jobs.jobCode)),

      db
        .select({ id: grades.id, gradeCode: grades.gradeCode, gradeNameEn: grades.gradeNameEn })
        .from(grades)
        .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
        .orderBy(asc(grades.gradeLevel)),

      db
        .select({ id: locations.id, nameEn: locations.nameEn, code: locations.code })
        .from(locations)
        .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true)))
        .orderBy(asc(locations.code)),

      getMdmChangeHistory('positions', 30),
    ])

  // Map to PositionRow
  const initialData: PositionRow[] = rawPositions.map(p => ({
    id:                  p.id,
    legalEntityId:       p.legalEntityId,
    departmentId:        p.departmentId,
    jobId:               p.jobId,
    positionCode:        p.positionCode,
    positionTitleEn:     p.positionTitleEn,
    positionTitleAr:     p.positionTitleAr ?? null,
    gradeId:             p.gradeId ?? null,
    locationId:          p.locationId ?? null,
    fteCount:            p.fteCount,
    isOccupied:          p.isOccupied,
    reportsToPositionId: p.reportsToPositionId ?? null,
    budgetAmount:        p.budgetAmount ?? null,
    isActive:            p.isActive,
    departmentName:      p.departmentName ?? undefined,
    jobTitleEn:          p.jobTitleEn ?? undefined,
    gradeCode:           p.gradeCode ?? undefined,
    locationName:        p.locationName ?? undefined,
  }))

  return (
    <PositionClient
      initialData={initialData}
      auditHistory={auditHistory}
      legalEntities={allEntities}
      departments={allDepts}
      jobs={allJobs}
      grades={allGrades}
      locations={allLocations}
    />
  )
}
