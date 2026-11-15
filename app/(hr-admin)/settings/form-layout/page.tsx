import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { resolveFormConfig } from '@/lib/config-resolver'
import { resolveLocale } from '@/lib/language-preference'
import { TENANT_ID } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { FormLayoutEditor } from './FormLayoutEditor'

export const metadata = { title: 'Form layout' }

const ENTITY_TYPES = ['PERSON', 'CONTRACT', 'LEAVE_REQUEST'] as const
const ROLES_FOR_LAYOUT = ['ALL', 'HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'EMPLOYEE'] as const

/**
 * S4-06 — Settings → Form Layout (Server Component shell).
 *
 * Loads the resolved form config for each entity type / role combination
 * via resolveFormConfig (which falls back from DB → ALL → DEFAULT_SECTIONS).
 * The Client Component below lets HR_DIRECTOR (or SUPER_ADMIN) drag sections
 * to reorder, edit labels, and save to form_configurations via
 * updateFormConfiguration. The save invalidates the policy/rule cache so
 * the next page load picks up the new layout.
 */
export default async function FormLayoutSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; role?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // Reshaping form layouts is HR_DIRECTOR / SUPER_ADMIN only.
  const allowedRoles = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(roleHome(session.user.role))

  const sp = searchParams ? await searchParams : {} as { entityType?: string; role?: string }

  const entityType = ENTITY_TYPES.includes(sp.entityType as (typeof ENTITY_TYPES)[number])
    ? (sp.entityType as (typeof ENTITY_TYPES)[number])
    : 'PERSON'
  const role = ROLES_FOR_LAYOUT.includes(sp.role as (typeof ROLES_FOR_LAYOUT)[number])
    ? (sp.role as (typeof ROLES_FOR_LAYOUT)[number])
    : 'ALL'

  const config = await resolveFormConfig(entityType, role, TENANT_ID)
  const locale = await resolveLocale(session.user.personId)

  return (
    <div className="page-in">
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'تخطيط النموذج' : 'Form layout'}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar' ? (
            <>إعادة ترتيب أقسام النموذج أو إعادة تسميتها أو إخفاؤها دون تغييرات برمجية. تُحدَّد نطاقات التخطيطات
            لكل <code className="font-mono">(entityType, role)</code>؛ ودور <Badge variant="outline">ALL</Badge> هو
            التخطيط الاحتياطي المستخدَم لكل دور لا يملك تجاوزاً أكثر تحديداً.</>
          ) : (
            <>Reorder, rename, or hide form sections without code changes. Layouts are scoped
            per <code className="font-mono">(entityType, role)</code>; the <Badge variant="outline">ALL</Badge> role
            is the fallback layout used by every role that doesn’t have a more specific override.</>
          )}
        </p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }} className="mb-6">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'اختر تخطيطاً للتعديل' : 'Pick a layout to edit'}</h3></div>
        <div style={{ padding: '16px 20px' }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'نوع الكيان' : 'Entity type'}</label>
              <div className="flex flex-wrap gap-2">
                {ENTITY_TYPES.map(et => (
                  <Link
                    key={et}
                    href={{ pathname: '/settings/form-layout', query: { entityType: et, role } }}
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      et === entityType
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-surface text-ink-2 hover:border-accent'
                    }`}
                  >
                    {et}
                  </Link>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'نطاق الدور' : 'Role scope'}</label>
              <div className="flex flex-wrap gap-2">
                {ROLES_FOR_LAYOUT.map(r => (
                  <Link
                    key={r}
                    href={{ pathname: '/settings/form-layout', query: { entityType, role: r } }}
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      r === role
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-surface text-ink-2 hover:border-accent'
                    }`}
                  >
                    {r}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FormLayoutEditor entityType={entityType} role={role} initialSections={config.sections} />
    </div>
  )
}
