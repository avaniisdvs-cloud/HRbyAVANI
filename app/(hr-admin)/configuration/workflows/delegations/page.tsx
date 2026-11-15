import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listDelegationRules } from '@/modules/workflow/actions'
import { DelegationListClient } from './DelegationListClient'

export const metadata = { title: 'Delegation Rules · AVANIIS HR' }

const ALLOWED_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

export default async function DelegationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!ALLOWED_ROLES.includes(session.user.role)) redirect('/dashboard')

  const rules = await listDelegationRules()

  return (
    <div className="page-in">
      <DelegationListClient initialRules={rules} />
    </div>
  )
}
