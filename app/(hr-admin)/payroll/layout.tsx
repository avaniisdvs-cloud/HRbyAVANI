import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth }     from '@/lib/auth'
import { isPayrollWorkstreamEnabled, PAYROLL_DISABLED_MESSAGE } from '@/lib/features/payroll-feature-gate'

const PAYROLL_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']

export default async function PayrollLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  // RBAC is unchanged and authoritative — role check stays in place.
  if (!PAYROLL_ROLES.includes(session.user.role)) redirect('/dashboard')

  // Feature gate (defence-in-depth, additional to RBAC): payroll is DEFERRED from
  // the Core HR-only release. When PAYROLL_WORKSTREAM_ENABLED is not "true", block
  // ALL payroll routes by URL — even for authorized roles — and show a safe notice.
  // See docs/environment/PRODUCTION-GO-LIVE-READINESS.md (P-4).
  if (!isPayrollWorkstreamEnabled()) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div
          role="status"
          className="max-w-md rounded-lg border p-6 text-center"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <PageTitle className="mb-2 text-lg font-semibold" style={{ color: 'var(--ink-1)' }}>
            {PAYROLL_DISABLED_MESSAGE}
          </PageTitle>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            Payroll is deferred from the current release. Contact your administrator
            if you believe this is unexpected.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
