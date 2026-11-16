import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listFeaturePermissions } from '@/modules/access/actions'
import { FeaturePermissionsClient } from '../../access/feature-permissions/_FeaturePermissionsClient'

export const metadata = { title: 'Feature Permissions' }

export default async function PermissionsSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // SUPER_ADMIN only — platform RBAC. Others go back to the settings hub.
  if (session.user.role !== 'SUPER_ADMIN') redirect('/settings')

  const rows = await listFeaturePermissions()

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>
      {rows.length === 0 ? (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '64px 24px', textAlign: 'center',
          background: 'var(--card)',
        }}>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            No feature permissions found. Run migration 0012 to seed default data.
          </p>
        </div>
      ) : (
        <FeaturePermissionsClient rows={rows} />
      )}
    </div>
  )
}
