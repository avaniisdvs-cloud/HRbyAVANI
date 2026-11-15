import Image from 'next/image'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { type Locale } from '@/lib/i18n'
import { resolveLocale } from '@/lib/language-preference'
import { EmployeeSidebar } from '@/components/employee/EmployeeSidebar'
import { EmployeeTopbar }  from '@/components/employee/EmployeeTopbar'
import AriaAuthWidget from '@/components/aria/AriaAuthWidget'
import { MobileBottomBar } from '@/components/layout/MobileBottomBar'
import { PreferencesApplier } from '@/components/topbar/PreferencesApplier'
import { getPreferences } from '@/modules/notification'
import { getPagePersonalization } from '@/modules/config/actions/page-personalization'
import { db }      from '@/lib/db'
import { persons } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

const BRANDING_ENTITY_ID = '11111111-1111-1111-1111-111111111111'

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const adminShellRoles = [
    'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
    'PAYROLL_ADMIN', 'FINANCE', 'MANAGER',
  ]
  if (adminShellRoles.includes(session.user.role)) redirect('/dashboard')

  const name     = session.user.name ?? session.user.email?.split('@')[0] ?? 'Employee'
  const initials = name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  // Single source of truth: cookie hint → persisted preference → 'en'.
  const locale: Locale = await resolveLocale(session.user.personId)

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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <PreferencesApplier preferences={preferences} />
        <a className="skip-link" href="#main-content">{locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>
      <EmployeeSidebar
        userName={name}
        userRole={session.user.role}
        initials={initials}
        avatarColor="var(--accent)"
        locale={locale}
        photoUrl={profilePhotoUrl}
        brandingLogoUrl={brandingLogoUrl}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="mobile-brand-header"><Image src="/avaniis-logo.jpg" width={40} height={40} alt="AVANIIS" />AVANIIS HR</div>
          <EmployeeTopbar
          userName={name}
          userRole={session.user.role}
          initials={initials}
          locale={locale}
          personId={session.user.personId}
          tenantId={session.user.legalEntityId ?? ''}
          ssoProvider={undefined}
          photoUrl={profilePhotoUrl}
        />
        <main id="main-content" tabIndex={-1} style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>{children}</main>
      </div>
      <MobileBottomBar role={session.user.role} locale={locale} />
      {session.user.personId && (
        <AriaAuthWidget
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
    </div>
  )
}
