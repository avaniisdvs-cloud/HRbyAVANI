import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMigrationStatus } from '@/modules/migration'
import { MigrationConsoleV2 } from './MigrationConsoleV2'

/**
 * Data Migration Activity — SUPER_ADMIN only.
 *
 * V2: 9-step production-grade workflow.
 * Page-level guard mirrors /admin/dataops; the authoritative request-boundary
 * gate is middleware.ts ROLE_GATED_PATHS ('/admin/migration' → SUPER_ADMIN).
 * Every write happens via the console's explicit confirm steps — never here.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // bounded execution for seed/import actions

export default async function MigrationConsolePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/sign-in')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const status = await getMigrationStatus()
  return <MigrationConsoleV2 initialStatus={status} />
}
