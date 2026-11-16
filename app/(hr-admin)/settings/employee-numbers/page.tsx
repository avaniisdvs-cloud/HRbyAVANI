import { PageTitle } from '@/components/ui/typography'
import { redirect }            from 'next/navigation'
import { auth }                from '@/lib/auth'
import { listEmpNumberConfig } from './actions'
import { EmpNumbersClient }    from './_EmpNumbersClient'

export const metadata = { title: 'Employee Numbers' }

/**
 * Settings → Employee Numbers (Server Component)
 *
 * SUPER_ADMIN: full read/write — can edit prefix, digit count, and seed.
 * HR_ADMIN / HR_DIRECTOR: read-only view.
 */
export default async function EmpNumbersPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const rows       = await listEmpNumberConfig()
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <PageTitle style={{
          fontFamily:    'var(--font-serif)',
          fontSize:      24,
          fontWeight:    500,
          color:         'var(--ink-1)',
          margin:        0,
          letterSpacing: '-0.4px',
        }}>
          Employee Numbers
        </PageTitle>
        <p style={{ marginTop: 6, fontSize: 'var(--text-body)', color: 'var(--ink-3)',
        marginRight: "0",
        marginBottom: "0",
        marginLeft: "0" }}>
          Configure the prefix code, digit length, and starting counter for each legal entity.
          {isSuperAdmin
            ? ' As SUPER_ADMIN you can edit all settings.'
            : ' Only SUPER_ADMIN can modify these settings.'}
        </p>
      </div>

      <EmpNumbersClient rows={rows} isSuperAdmin={isSuperAdmin} />
    </div>
  )
}
