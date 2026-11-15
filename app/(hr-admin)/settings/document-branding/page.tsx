import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { legalEntities, persons } from '@/drizzle/schema'
import { and, eq, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { DocumentBrandingForm } from './DocumentBrandingForm'

export const metadata = { title: 'Document Branding · AVANIIS HR' }

export default async function DocumentBrandingPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/settings')

  const sp = searchParams ? await searchParams : {} as { entityId?: string }

  const allEntities = await db
    .select({
      id:     legalEntities.id,
      nameEn: legalEntities.nameEn,
    })
    .from(legalEntities)
    .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))

  const selectedEntityId = sp.entityId ?? allEntities[0]?.id ?? null

  let entityData = null
  if (selectedEntityId) {
    const [row] = await db
      .select()
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.id, selectedEntityId)))
      .limit(1)
    entityData = row ?? null
  }

  const employees = await db
    .select({
      id:           persons.id,
      fullNameEn:   persons.fullNameEn,
      personNumber: persons.personNumber,
    })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.assignmentStatus, 'ACTIVE'),
    ))
    .orderBy(asc(persons.fullNameEn))

  return (
    <div className="page-in space-y-6">
      <DocumentBrandingForm
        entities={allEntities}
        selectedEntityId={selectedEntityId}
        entityData={entityData}
        employees={employees.map(e => ({
          id:           e.id,
          fullNameEn:   e.fullNameEn ?? '',
          personNumber: e.personNumber ?? null,
        }))}
      />
    </div>
  )
}
