import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { workSchedules, legalEntities } from '@/drizzle/schema'
import { eq, desc, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { WorkScheduleClient } from './components/WorkScheduleClient'

export const metadata = { title: 'Work Schedules · AVANIIS HR' }

export default async function WorkSchedulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory, entityList] = await Promise.all([
    db.select().from(workSchedules)
      .where(eq(workSchedules.tenantId, TENANT_ID))
      .orderBy(desc(workSchedules.createdDate))
      .catch(() => []),
    getMdmChangeHistory('work_schedules'),
    db.select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn))
      .catch(() => []),
  ])

  return (
    <WorkScheduleClient
      initialData={data as any}
      auditHistory={auditHistory}
      legalEntities={entityList}
    />
  )
}
