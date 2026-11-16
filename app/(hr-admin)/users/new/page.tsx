import { redirect } from 'next/navigation'
import { auth, roleHome } from '@/lib/auth'
import { listPersonsWithoutAccounts, listEntities } from '@/modules/auth/actions'
import { ALL_ROLES } from '@/modules/auth/config'
import { NewUserClient } from './_NewUserClient'

export const metadata = { title: 'Add User' }

export default async function NewUserPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const [persons, entities] = await Promise.all([
    listPersonsWithoutAccounts(),
    listEntities(),
  ])

  const assignableRoles = ALL_ROLES.filter(r =>
    r.value !== 'SUPER_ADMIN' || session.user.role === 'SUPER_ADMIN',
  )

  return (
    <div
      className="page-in"
      style={{
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - 104px)',
        overflow: 'hidden', width: '100%', maxWidth: 760,
        boxSizing: 'border-box',
      }}
    >
      <NewUserClient
        persons={persons}
        entities={entities}
        roles={assignableRoles}
        currentUserId={session.user.id}
      />
    </div>
  )
}
