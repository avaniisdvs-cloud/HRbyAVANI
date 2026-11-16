import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listCompanyCurrencySettings } from '@/modules/config'
import { db } from '@/lib/db'
import { legalEntities } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { CurrencySetupClient } from './CurrencySetupClient'

export const metadata = { title: 'Company Currency Setup' }

export default async function CurrencySetupPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const [settings, entities] = await Promise.all([
    listCompanyCurrencySettings(),
    db
      .select({ id: legalEntities.id, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
      .from(legalEntities)
      .where(eq(legalEntities.tenantId, TENANT_ID)),
  ])

  return (
    <CurrencySetupClient
      settings={settings ?? []}
      legalEntities={entities}
      role={session.user.role}
    />
  )
}
