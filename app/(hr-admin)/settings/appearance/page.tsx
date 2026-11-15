import { redirect } from 'next/navigation'
import { and, eq, inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { policySettings } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { LanguagePreferenceCard } from '@/components/settings/LanguagePreferenceCard'
import { AppearanceSettingsClient } from './AppearanceSettingsClient'

export const metadata = { title: 'Appearance · AVANIIS HR' }

/**
 * Appearance settings page (Server Component).
 *
 * Reads current UI_ACCENT_THEME / UI_DARK_MODE / UI_DENSITY from
 * policy_settings and hydrates the client-side controls. HR_DIRECTOR
 * and SUPER_ADMIN only.
 */
export default async function AppearanceSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const legalEntityId = session.user.legalEntityId ?? '11111111-1111-1111-1111-111111111111'

  const uiSettings = await db
    .select({
      settingKey:   policySettings.settingKey,
      settingValue: policySettings.settingValue,
    })
    .from(policySettings)
    .where(
      and(
        eq(policySettings.tenantId, TENANT_ID),
        inArray(policySettings.settingKey, [
          'UI_ACCENT_THEME',
          'UI_DARK_MODE',
          'UI_DENSITY',
        ]),
      ),
    )

  const find = (key: string) =>
    uiSettings.find(s => s.settingKey === key)?.settingValue ?? ''

  const locale = await resolveLocale(session.user.personId)

  return (
    <div className="page-in">
      <AppearanceSettingsClient
        legalEntityId={legalEntityId}
        initialAccent={find('UI_ACCENT_THEME') || 'teal'}
        initialDark={find('UI_DARK_MODE')    || 'false'}
        initialDensity={find('UI_DENSITY')   || 'comfortable'}
        locale={locale}
      />
      <div style={{ marginTop: 24 }}>
        <LanguagePreferenceCard current={locale} />
      </div>
    </div>
  )
}
