import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import { auth } from '@/lib/auth'
import { listFeaturePermissions } from '@/modules/access/actions'
import { FeaturePermissionsClient } from './_FeaturePermissionsClient'

export const metadata = { title: 'Feature Permissions · AVANIIS HR' }

export default async function FeaturePermissionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  // SUPER_ADMIN only — platform-level feature/RBAC flags. HR_ADMIN/HR_DIRECTOR
  // are sent to the settings hub (in-group) rather than the dashboard.
  if (session.user.role !== 'SUPER_ADMIN') redirect('/settings')

  const rows = await listFeaturePermissions()

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: '#6B728015',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Lock size={22} strokeWidth={1.75} style={{ color: '#6B7280' }} aria-hidden />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <PageTitle style={{
                fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500,
                letterSpacing: '-0.4px', color: 'var(--ink-1)', margin: 0,
              }}>
                Feature Permissions
              </PageTitle>
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', fontFamily: 'var(--font-arabic)', direction: 'rtl' }}>
                صلاحيات الميزات
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
              Control which roles can view, create, edit, delete, approve, or export each feature.
              <span style={{ marginLeft: 8, color: 'var(--ink-4)' }}>
                System-locked rows cannot be changed.
              </span>
            </p>
          </div>
        </div>
      </div>

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
