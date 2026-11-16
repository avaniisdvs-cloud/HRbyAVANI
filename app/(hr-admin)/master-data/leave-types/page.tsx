import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { absenceTypes, legalEntities } from '@/drizzle/schema'
import { eq, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { LeaveTypeClient } from './components/LeaveTypeClient'

export const metadata = { title: 'Leave Types' }

export default async function LeaveTypesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory, entityList] = await Promise.all([
    db.select().from(absenceTypes).where(eq(absenceTypes.tenantId, TENANT_ID)).orderBy(asc(absenceTypes.typeCode)).catch(() => []),
    getMdmChangeHistory('absence_types'),
    db.select({ id: legalEntities.id, nameEn: legalEntities.nameEn }).from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true))).catch(() => []),
  ])

  return (
    <LeaveTypeClient
      initialData={data as any}
      auditHistory={auditHistory}
      legalEntities={entityList}
    />
  )
}
