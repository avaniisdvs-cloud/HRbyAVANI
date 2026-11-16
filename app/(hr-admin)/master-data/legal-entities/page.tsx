import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { legalEntities } from '@/drizzle/schema'
import { eq, desc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { LegalEntityClient } from './components/LegalEntityClient'

export const metadata = { title: 'Legal Entities' }

export default async function LegalEntitiesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory] = await Promise.all([
    db.select().from(legalEntities)
      .where(eq(legalEntities.tenantId, TENANT_ID))
      .orderBy(desc(legalEntities.createdDate))
      .catch(() => []),
    getMdmChangeHistory('legal_entities'),
  ])

  return <LegalEntityClient initialData={data as any} auditHistory={auditHistory} />
}
