/**
 * Phase 5 — Pending Future Changes — Server Component page.
 *
 * Auth check: redirect to /sign-in if no session.
 * Passes canCancel={true} only for HR_DIRECTOR / SUPER_ADMIN.
 */
import { redirect }                from 'next/navigation'
import { auth }                    from '@/lib/auth'
import { getPendingFutureChanges } from './actions'
import { PendingChangesClient }    from './PendingChangesClient'

export const metadata = { title: 'Pending Future Changes · AVANIIS People' }

export default async function PendingChangesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const canCancel = ['HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)

  const data = await getPendingFutureChanges()

  return (
    <PendingChangesClient
      initialData={data}
      canCancel={canCancel}
    />
  )
}
