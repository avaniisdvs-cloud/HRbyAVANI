import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMyProfile } from '@/modules/profile/actions'
import { getAssignmentHistory } from '@/modules/core-hr/assignment-history'
import { resolveLocale } from '@/lib/language-preference'
import { LanguagePreferenceCard } from '@/components/settings/LanguagePreferenceCard'
import { ProfilePageClient } from '../ProfilePageClient'

export const metadata = { title: 'My Profile · Self Service' }

export default async function MyProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const personId = session.user.personId
  if (!personId) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
          Your sign-in is not linked to a person record yet. Please contact HR Admin to complete onboarding.
        </p>
      </div>
    )
  }

  const data = await getMyProfile(personId)
  if (!data) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
          Profile not found. Please contact HR Admin.
        </p>
      </div>
    )
  }

  const locale = await resolveLocale(personId)

  // Effective-dated assignment history (self-scope enforced inside the reader).
  const history = await getAssignmentHistory(session.user, personId)

  return (
    <>
      <ProfilePageClient data={data} personId={personId} history={history?.rows ?? []} />
      <div style={{ padding: '0 24px 32px' }}>
        <LanguagePreferenceCard current={locale} />
      </div>
    </>
  )
}
