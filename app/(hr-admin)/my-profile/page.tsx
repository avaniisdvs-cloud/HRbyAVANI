import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMyProfile } from '@/modules/profile/actions'
import { ProfilePageClient } from '@/app/(employee)/me/ProfilePageClient'

export const metadata = { title: 'My Profile' }

/**
 * My Profile page for MANAGER role.
 * Renders the same ESS profile (ProfilePageClient) within the hr-admin shell
 * so managers see their personal profile — not the team dashboard.
 *
 * Available to: MANAGER, HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE
 * (any role that uses the hr-admin layout can access their profile here)
 */
export default async function MyProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const personId = session.user.personId
  if (!personId) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          Your sign-in is not linked to a person record yet. Please contact HR Admin to complete
          onboarding.
        </p>
      </div>
    )
  }

  const data = await getMyProfile(personId)
  if (!data) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          Profile not found. Please contact HR Admin.
        </p>
      </div>
    )
  }

  return <ProfilePageClient data={data} personId={personId} />
}
