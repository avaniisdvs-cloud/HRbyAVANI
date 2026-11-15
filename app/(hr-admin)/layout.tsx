import Image from 'next/image'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { auth, roleHome } from '@/lib/auth'
import { type Locale } from '@/lib/i18n'
import { resolveLocale } from '@/lib/language-preference'
import { WorkspaceRail }        from '@/components/layout/WorkspaceRail'
import { WorkspaceSecondaryNav } from '@/components/layout/WorkspaceSecondaryNav'
import { AdminSidebar }         from '@/components/layout/AdminSidebar'
import { AdminTopbar }          from '@/components/layout/AdminTopbar'
import { EmployeeSidebar }      from '@/components/employee/EmployeeSidebar'
import { EmployeeTopbar }       from '@/components/employee/EmployeeTopbar'
import { MobileBottomBar }      from '@/components/layout/MobileBottomBar'
import AriaAuthWidget           from '@/components/aria/AriaAuthWidget'
import { PreferencesApplier }   from '@/components/topbar/PreferencesApplier'
import { CommandPalette }       from '@/components/layout/CommandPalette'
import { getPreferences }       from '@/modules/notification'
import { getPagePersonalization } from '@/modules/config/actions/page-personalization'
import { db }                   from '@/lib/db'
import { persons }              from '@/drizzle/schema'
import { ariaAgentConfig }      from '@/drizzle/schema/configuration'
import { TENANT_ID }            from '@/lib/constants'

const BRANDING_ENTITY_ID = '11111111-1111-1111-1111-111111111111'

/**
 * (hr-admin) route group — gated to HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN,
 * and admin-adjacent roles. EMPLOYEE is included so they can reach
 * /org-chart; each individual page keeps its own narrower role gate.
 *
 * Shell routing (Phase 1 redesign):
 *   Admin roles (HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN | PAYROLL_ADMIN | FINANCE)
 *     → WorkspaceRail + WorkspaceSecondaryNav + AdminTopbar  [NEW SHELL]
 *   MANAGER
 *     → AdminSidebar (MANAGER_NAV) + AdminTopbar              [unchanged]
 *   EMPLOYEE
 *     → EmployeeSidebar + EmployeeTopbar                      [unchanged]
 */

const ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']

export default async function HrAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const role = session.user.role
  const allowed = [
    'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
    'PAYROLL_ADMIN', 'FINANCE', 'MANAGER', 'EMPLOYEE',
  ]
  if (!allowed.includes(role)) redirect(roleHome(session.user.role))

  // Single source of truth: cookie hint → persisted preference → 'en'.
  const locale: Locale = await resolveLocale(session.user.personId)

  const name     = session.user.name ?? session.user.email?.split('@')[0] ?? 'User'
  const initials = name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  const preferences = session.user.personId ? await getPreferences() : {}

  let profilePhotoUrl: string | null = null
  if (session.user.personId) {
    const [photoRow] = await db
      .select({
        profilePhotoUrl:  persons.profilePhotoUrl,
        profilePhotoData: persons.profilePhotoData,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, session.user.personId)))
      .limit(1)
    // Cloud URL first; base64 data URL as durable fallback (migration 0052)
    profilePhotoUrl = photoRow?.profilePhotoUrl || photoRow?.profilePhotoData || null
  }

  // Global branding logo (resilient — returns defaults if DB unreachable).
  const branding = await getPagePersonalization(BRANDING_ENTITY_ID)
  const brandingLogoUrl = branding.logoUrl && branding.logoUrl.trim() !== '' ? branding.logoUrl : null

  // ARIA configured identity — drives the floating widget name (Settings → AI Agent → Identity).
  let ariaAgentName = 'ARIA'
  try {
    const [agentRow] = await db
      .select({ agentName: ariaAgentConfig.agentName })
      .from(ariaAgentConfig)
      .where(eq(ariaAgentConfig.isActive, true))
      .limit(1)
    if (agentRow?.agentName) ariaAgentName = agentRow.agentName
  } catch { /* keep default 'ARIA' if config unreachable */ }

  const isEmployee = role === 'EMPLOYEE'
  const isManager  = role === 'MANAGER'
  const isAdmin    = ADMIN_ROLES.includes(role)

  // ── Admin roles: new workspace shell ─────────────────────────────────────
  if (isAdmin) {
    return (
      <div className="flex bg-bg" style={{ height: '100vh', overflow: 'hidden' }}>
        <PreferencesApplier preferences={preferences} />
        <a className="skip-link" href="#main-content">{locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>

        <WorkspaceRail
          role={role}
          locale={locale}
          userName={name}
          initials={initials}
          photoUrl={profilePhotoUrl}
          brandingLogoUrl={brandingLogoUrl}
        />

        <WorkspaceSecondaryNav role={role} locale={locale} />

        <div className="flex min-w-0 flex-1 flex-col" style={{ overflow: 'hidden' }}>
          <div className="mobile-brand-header"><Image src="/avaniis-logo.jpg" width={40} height={40} alt="AVANIIS" />AVANIIS HR</div>
          <AdminTopbar
            userName={name}
            role={role}
            initials={initials}
            locale={locale}
            personId={session.user.personId}
            tenantId={session.user.legalEntityId ?? ''}
            ssoProvider={undefined}
            photoUrl={profilePhotoUrl}
          />
          {process.env.DATABASE_ENV === 'development' && <div className="ui-demo-label">{locale === 'ar' ? 'بيئة محلية · بيانات تجريبية' : 'Local preview · Synthetic demo data'}</div>}
          {/* FIX 8 — scoped class so padding-bottom only applies in admin shell */}
          <main id="main-content" tabIndex={-1}
            className="admin-main flex-1"
            style={{ overflowY: 'auto',
            paddingTop: "24px",
            paddingRight: "24px",
            paddingLeft: "24px",
            paddingBottom: 80 }}
          >
            {children}
          </main>
        </div>

        {/* ARIA floating widget — gated by RBAC (this branch is already an
            ARIA-allowed role), NOT by a person record. Service / system accounts
            with no person still get the assistant; personId falls back to ''. */}
        <AriaAuthWidget
          agentName={ariaAgentName}
          sessionCtx={{
            personId:      session.user.personId ?? '',
            role:          session.user.role,
            legalEntityId: session.user.legalEntityId ?? '',
            language:      locale,
            userName:      name,
          }}
          locale={locale}
        />

        {/* FIX 1 — pass role so superAdminOnly workspaces are filtered */}
        <CommandPalette role={role} />

        {/* FIX 6 — mobile nav for admin roles */}
        <MobileBottomBar role={role} locale={locale} />
      </div>
    )
  }

  // ── Manager role: existing AdminSidebar shell (unchanged) ─────────────────
  if (isManager) {
    return (
      <div className="flex bg-bg" style={{ height: '100vh', overflow: 'hidden' }}>
        <PreferencesApplier preferences={preferences} />
        <a className="skip-link" href="#main-content">{locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>

        <AdminSidebar
          role={role}
          locale={locale}
          userName={name}
          initials={initials}
          photoUrl={profilePhotoUrl}
          brandingLogoUrl={brandingLogoUrl}
        />

        <div className="flex min-w-0 flex-1 flex-col" style={{ overflow: 'hidden' }}>
          <div className="mobile-brand-header"><Image src="/avaniis-logo.jpg" width={40} height={40} alt="AVANIIS" />AVANIIS HR</div>
          <AdminTopbar
            userName={name}
            role={role}
            initials={initials}
            locale={locale}
            personId={session.user.personId}
            tenantId={session.user.legalEntityId ?? ''}
            ssoProvider={undefined}
            photoUrl={profilePhotoUrl}
          />
          <main id="main-content" tabIndex={-1}
            className="flex-1"
            style={{ overflowY: 'auto',
            paddingTop: "24px",
            paddingRight: "24px",
            paddingLeft: "24px",
            paddingBottom: 80 }}
          >
            {children}
          </main>
        </div>

        {/* ARIA floating widget — gated by RBAC (this branch is already an
            ARIA-allowed role), NOT by a person record. Service / system accounts
            with no person still get the assistant; personId falls back to ''. */}
        <AriaAuthWidget
          agentName={ariaAgentName}
          sessionCtx={{
            personId:      session.user.personId ?? '',
            role:          session.user.role,
            legalEntityId: session.user.legalEntityId ?? '',
            language:      locale,
            userName:      name,
          }}
          locale={locale}
        />

        {/* FIX 6 — mobile nav for manager role */}
        <MobileBottomBar role={role} locale={locale} />
      </div>
    )
  }

  // ── Employee role: flat employee shell (unchanged) ────────────────────────
  // isEmployee satisfies TypeScript; the allowed check above handles other cases.
  void isEmployee
  return (
    <div className="flex bg-bg" style={{ height: '100vh', overflow: 'hidden' }}>
      <PreferencesApplier preferences={preferences} />
        <a className="skip-link" href="#main-content">{locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>

      <EmployeeSidebar
        userName={name}
        userRole={role}
        initials={initials}
        avatarColor="var(--accent)"
        locale={locale}
        photoUrl={profilePhotoUrl}
        brandingLogoUrl={brandingLogoUrl}
      />

      <div className="flex min-w-0 flex-1 flex-col" style={{ overflow: 'hidden' }}>
        <div className="mobile-brand-header"><Image src="/avaniis-logo.jpg" width={40} height={40} alt="AVANIIS" />AVANIIS HR</div>
          <EmployeeTopbar
          userName={name}
          userRole={role}
          initials={initials}
          locale={locale}
          personId={session.user.personId}
          tenantId={session.user.legalEntityId ?? ''}
          ssoProvider={undefined}
          photoUrl={profilePhotoUrl}
        />
        <main id="main-content" tabIndex={-1} className="flex-1" style={{ overflowY: 'auto',
        paddingBottom: 80 }}>
          {children}
        </main>
      </div>

      {session.user.personId && (
        <AriaAuthWidget
          agentName={ariaAgentName}
          sessionCtx={{
            personId:      session.user.personId,
            role:          session.user.role,
            legalEntityId: session.user.legalEntityId ?? '',
            language:      locale,
            userName:      name,
          }}
          locale={locale}
        />
      )}

      {/* FIX 6 — mobile nav for employee role */}
      <MobileBottomBar role={role} locale={locale} />
    </div>
  )
}
