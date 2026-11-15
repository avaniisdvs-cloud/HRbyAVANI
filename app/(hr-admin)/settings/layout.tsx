import { redirect } from 'next/navigation'
import { auth, roleHome } from '@/lib/auth'
import { SettingsDetailShell } from '@/components/layout/SettingsDetailShell'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // RBAC-BL-01: aligned to the canonical /settings access set enforced by
  // middleware ROLE_GATED_PATHS ('/settings' → HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN).
  // The previous array also listed PAYROLL_ADMIN/FINANCE, but middleware runs
  // first and already redirects those two roles away — so they never reached this
  // layout. Removing them is a no-op on effective access (no expansion, no loss)
  // and closes the silent-expansion trap if middleware were ever relaxed.
  const role    = session.user.role
  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(role)) redirect(roleHome(session.user.role))

  // Phase A — nested SettingsNav sidebar removed to enforce the 2-level rule:
  // Administration (L1) → HR Configuration landing (L2) → detail page.
  // The grouped landing (app/(hr-admin)/settings/page.tsx) is now the sole
  // page-selector; SettingsDetailShell only provides the per-page header/breadcrumb
  // (it renders nothing on the /settings landing itself). RBAC guards unchanged.
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <SettingsDetailShell>
        {children}
      </SettingsDetailShell>
    </div>
  )
}
