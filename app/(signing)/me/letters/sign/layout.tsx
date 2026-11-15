import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { LOCALE_COOKIE, isSupported, type Locale } from '@/lib/i18n'
import { AdminSidebar }    from '@/components/layout/AdminSidebar'
import { AdminTopbar }     from '@/components/layout/AdminTopbar'
import { EmployeeSidebar } from '@/components/employee/EmployeeSidebar'
import { EmployeeTopbar }  from '@/components/employee/EmployeeTopbar'
import { PreferencesApplier } from '@/components/topbar/PreferencesApplier'
import { getPreferences } from '@/modules/notification'

/**
 * Signing layout — auth-only, zero role restrictions.
 *
 * ANY authenticated role (EMPLOYEE, MANAGER, HR_ADMIN, …) must be able to
 * reach the signing page — a manager or admin may receive a letter personally.
 * This layout lives in its own (signing) route group so the (employee) layout
 * cannot intercept and redirect admin-adjacent roles back to /dashboard.
 *
 * Renders the appropriate shell:
 *   EMPLOYEE            → EmployeeSidebar + EmployeeTopbar
 *   all other roles     → AdminSidebar + AdminTopbar
 */
export default async function SigningLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const role = session.user.role
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale: Locale = cookieLocale && isSupported(cookieLocale) ? cookieLocale : 'en'

  const name     = session.user.name ?? session.user.email?.split('@')[0] ?? 'User'
  const initials = name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  const preferences = session.user.personId ? await getPreferences() : {}
  const isEmployee  = role === 'EMPLOYEE'

  return (
    <div className="flex bg-bg" style={{ height: '100vh', overflow: 'hidden' }}>
      <PreferencesApplier preferences={preferences} />

      {isEmployee ? (
        <EmployeeSidebar
          userName={name}
          userRole={role}
          initials={initials}
          avatarColor="var(--accent)"
          locale={locale}
        />
      ) : (
        <AdminSidebar role={role} locale={locale} />
      )}

      <div className="flex min-w-0 flex-1 flex-col" style={{ overflow: 'hidden' }}>
        {isEmployee ? (
          <EmployeeTopbar
            userName={name}
            userRole={role}
            initials={initials}
            locale={locale}
            personId={session.user.personId}
            tenantId={session.user.legalEntityId ?? ''}
            ssoProvider={undefined}
          />
        ) : (
          <AdminTopbar
            userName={name}
            role={role}
            initials={initials}
            locale={locale}
            personId={session.user.personId}
            tenantId={session.user.legalEntityId ?? ''}
            ssoProvider={undefined}
          />
        )}

        {/* No padding — signing page manages its own layout */}
        <main className="flex-1" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
