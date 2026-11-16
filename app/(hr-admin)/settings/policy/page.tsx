import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getPolicySettings } from '@/modules/config'
import { Badge } from '@/components/ui/badge'
import { PolicySettingEditButton } from './PolicySettingEditButton'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Policy settings · AVANIIS HR' }

/**
 * S10-01 — Policy settings page (Server Component).
 *
 * Lists all policy_settings rows grouped by moduleCode. Overridable rows
 * expose an inline edit button (Client Component). Non-overridable rows
 * are read-only with a SYSTEM_ONLY badge.
 *
 * Hard Rule 5: bilingual labels. Hard Rule 8: SYSTEM_ONLY settings never
 * exposed for edit — isOverridable=false rows are display-only.
 */
export default async function PolicySettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const locale = await resolveLocale(session.user.personId)
  const legalEntityId = session.user.legalEntityId ?? undefined
  const settings = await getPolicySettings(legalEntityId)

  // Group by moduleCode
  const grouped = settings.reduce<Record<string, typeof settings>>((acc, s) => {
    acc[s.moduleCode] ??= []
    acc[s.moduleCode].push(s)
    return acc
  }, {})

  return (
    <div className="page-in">
      <div>
        <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'إعدادات السياسة' : 'Policy settings'}</PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar'
            ? 'يمكن تعديل الإعدادات القابلة للتجاوز مباشرة. أما إعدادات النظام فتتطلب ترحيلاً.'
            : 'Overridable settings can be edited inline. System settings require a migration.'}
        </p>
      </div>

      {Object.entries(grouped).map(([module, rows]) => (
        <div key={module} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <header className="border-b border-border px-5 py-3">
              <SectionTitle className="font-sans text-sm font-semibold text-ink-1">{module}</SectionTitle>
            </header>
            <TableScrollRegion><table className="w-full text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase text-ink-3">
                <tr>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الإعداد' : 'Setting'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'القيمة' : 'Value'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'ساري اعتباراً من' : 'Effective from'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الوصول' : 'Access'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(s => (
                  <tr key={s.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink-1">{s.settingNameEn}</p>
                      {s.settingNameAr && (
                        <p className="text-xs text-ink-3" dir="rtl" lang="ar">{s.settingNameAr}</p>
                      )}
                      <p className="mt-0.5 font-mono text-xs text-ink-3">{s.settingKey}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-xs">{s.valueType}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {s.isOverridable && legalEntityId ? (
                        <PolicySettingEditButton
                          settingId={s.id}
                          legalEntityId={legalEntityId}
                          settingKey={s.settingKey}
                          currentValue={s.settingValue}
                          valueType={s.valueType}
                        />
                      ) : (
                        <span className="font-mono text-xs text-ink-2">{s.settingValue}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-3">{s.effectiveFrom}</td>
                    <td className="px-5 py-3">
                      {s.isOverridable
                        ? <Badge variant="outline" className="text-xs text-accent">OVERRIDABLE</Badge>
                        : <Badge variant="secondary" className="text-xs">SYSTEM_ONLY</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></TableScrollRegion>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div className="px-5 py-8 text-center text-sm text-ink-3">
            {locale === 'ar' ? 'لا توجد إعدادات سياسة لهذا الكيان بعد.' : 'No policy settings seeded for this entity yet.'}
          </div>
        </div>
      )}
    </div>
  )
}
