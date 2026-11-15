import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getInsurancePlans } from '@/modules/insurance'
import { resolveLocale } from '@/lib/language-preference'
import { InsurancePlansClient } from './InsurancePlansClient'

export const metadata = { title: 'Insurance Plans · AVANIIS HR' }

export default async function InsurancePlansPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const plans = await getInsurancePlans(session.user.legalEntityId)
  const locale = await resolveLocale(session.user.personId)

  return (
    <InsurancePlansClient
      plans={plans ?? []}
      legalEntityId={session.user.legalEntityId}
      role={session.user.role}
      locale={locale}
    />
  )
}
