import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { DataOpsApp } from '@/components/dataops/DataOpsApp'
import { resolveDataAccessRole } from '@/lib/dataops/access-policy'

/**
 * DataOps Console access policy:
 *
 *  SUPER_ADMIN → full read + write on all schemas — the ONLY role permitted.
 *
 * RBAC-BL-07: the console is a raw database browser. The read API
 * (/api/dataops/*) treats HR_ADMIN_GROUP (HR_ADMIN/HR_DIRECTOR/PAYROLL_ADMIN/
 * FINANCE) as full-access with no row filter, exposing audit_log, user_accounts,
 * refresh_tokens, sso_provider_config, person_bank_details and all payroll tables
 * across every employee. The nav has always shown DataOps to SUPER_ADMIN only;
 * the guard is now aligned to that. Entry is additionally enforced in middleware
 * for both /admin/dataops and /api/dataops. resolveDataAccessRole and the row-
 * filter policy are left intact (only SUPER_ADMIN reaches them now).
 */
export default async function DataOpsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/sign-in')

  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const canWrite   = true // SUPER_ADMIN only past the guard
  const accessRole = resolveDataAccessRole(session.user.role)

  return (
    <div style={{ margin: '-24px', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      <DataOpsApp
        canWrite={canWrite}
        accessRole={accessRole}
        personId={session.user.personId}
      />
    </div>
  )
}
