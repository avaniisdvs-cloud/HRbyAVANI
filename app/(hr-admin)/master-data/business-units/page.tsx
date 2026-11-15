import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessUnits, legalEntities } from '@/drizzle/schema'
import { eq, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { BusinessUnitClient } from './components/BusinessUnitClient'
import type { BusinessUnitRow } from './components/BusinessUnitDrawer'

export const metadata = { title: 'Business Units · AVANIIS HR' }

export default async function BusinessUnitsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  const [rawBUs, allEntities, auditHistory] = await Promise.all([
    db
      .select({
        id:            businessUnits.id,
        legalEntityId: businessUnits.legalEntityId,
        code:          businessUnits.code,
        nameEn:        businessUnits.nameEn,
        nameAr:        businessUnits.nameAr,
        glSegmentCode: businessUnits.glSegmentCode,
        isActive:      businessUnits.isActive,
        entityName:    legalEntities.nameEn,
      })
      .from(businessUnits)
      .leftJoin(legalEntities, eq(businessUnits.legalEntityId, legalEntities.id))
      .where(eq(businessUnits.tenantId, TENANT_ID))
      .orderBy(asc(businessUnits.code)),

    db
      .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn)),

    getMdmChangeHistory('business_units', 30),
  ])

  const initialData: BusinessUnitRow[] = rawBUs.map(r => ({
    id:            r.id,
    legalEntityId: r.legalEntityId,
    code:          r.code,
    nameEn:        r.nameEn,
    nameAr:        r.nameAr,
    glSegmentCode: r.glSegmentCode ?? null,
    isActive:      r.isActive,
    entityName:    r.entityName ?? undefined,
  }))

  return (
    <BusinessUnitClient
      initialData={initialData}
      auditHistory={auditHistory}
      legalEntities={allEntities}
    />
  )
}
