import { redirect } from 'next/navigation'
import { asc, desc, eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { locations, legalEntities } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { auth } from '@/lib/auth'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { LocationClient } from './components/LocationClient'

export const metadata = { title: 'Locations · AVANIIS HR' }

export default async function LocationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory, entityList] = await Promise.all([
    db
      .select()
      .from(locations)
      .where(eq(locations.tenantId, TENANT_ID))
      .orderBy(desc(locations.createdDate))
      .catch(() => []),

    getMdmChangeHistory('locations'),

    db
      .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn))
      .catch(() => []),
  ])

  return (
    <LocationClient
      initialData={data as any}
      auditHistory={auditHistory}
      legalEntities={entityList}
    />
  )
}
