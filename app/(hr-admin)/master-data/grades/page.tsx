import { redirect } from 'next/navigation'
import { asc, desc, eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grades, legalEntities } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { auth } from '@/lib/auth'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { GradeClient } from './components/GradeClient'

export const metadata = { title: 'Grades' }

export default async function GradesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory, entityList] = await Promise.all([
    db
      .select()
      .from(grades)
      .where(eq(grades.tenantId, TENANT_ID))
      .orderBy(desc(grades.createdDate))
      .catch(() => []),

    getMdmChangeHistory('grades'),

    db
      .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn))
      .catch(() => []),
  ])

  return (
    <GradeClient
      initialData={data as any}
      auditHistory={auditHistory}
      legalEntities={entityList}
    />
  )
}
