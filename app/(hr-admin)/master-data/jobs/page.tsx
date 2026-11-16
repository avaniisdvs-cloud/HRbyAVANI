import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { jobs, grades, legalEntities } from '@/drizzle/schema'
import { eq, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { JobClient } from './components/JobClient'

export const metadata = { title: 'Jobs' }

export default async function JobsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory, gradesList, entityList] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.tenantId, TENANT_ID)).orderBy(asc(jobs.jobCode)).catch(() => []),
    getMdmChangeHistory('jobs'),
    db.select({ id: grades.id, gradeCode: grades.gradeCode, gradeLevel: grades.gradeLevel })
      .from(grades).where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
      .orderBy(asc(grades.gradeLevel)).catch(() => []),
    db.select({ id: legalEntities.id, nameEn: legalEntities.nameEn }).from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true))).catch(() => []),
  ])

  return (
    <JobClient
      initialData={data as any}
      auditHistory={auditHistory}
      grades={gradesList}
      legalEntities={entityList}
    />
  )
}
