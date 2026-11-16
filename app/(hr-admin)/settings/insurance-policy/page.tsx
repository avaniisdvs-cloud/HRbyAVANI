import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getInsurancePolicySettings } from '@/modules/insurance'
import { resolveLocale } from '@/lib/language-preference'
import { InsurancePolicyClient } from './InsurancePolicyClient'

export const metadata = { title: 'Insurance Policy Settings' }

export default async function InsurancePolicyPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const settings = await getInsurancePolicySettings(session.user.legalEntityId)
  const locale = await resolveLocale(session.user.personId)

  return (
    <InsurancePolicyClient
      settings={settings}
      legalEntityId={session.user.legalEntityId}
      locale={locale}
    />
  )
}
