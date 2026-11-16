import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { publicHolidays, legalEntities } from '@/drizzle/schema'
import { eq, asc, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { HolidayClient } from './components/HolidayClient'

export const metadata = { title: 'Holiday Calendars' }

export default async function HolidayCalendarsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) redirect('/dashboard')

  const [data, auditHistory, entityList] = await Promise.all([
    db.select().from(publicHolidays)
      .where(eq(publicHolidays.tenantId, TENANT_ID))
      .orderBy(asc(publicHolidays.holidayDate))
      .catch(() => []),
    getMdmChangeHistory('public_holidays'),
    db.select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn))
      .catch(() => []),
  ])

  return (
    <HolidayClient
      initialData={data as any}
      auditHistory={auditHistory}
      legalEntities={entityList}
    />
  )
}
