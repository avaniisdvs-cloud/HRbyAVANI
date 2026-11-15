import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getCustomFields } from '@/modules/config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Custom fields · AVANIIS HR' }

const OBJECT_TYPES = ['persons', 'worker_assignments', 'positions', 'departments'] as const

/**
 * S10-03 — Custom field builder (Server Component).
 *
 * Lists all custom_field_definitions grouped by objectType. Each row shows
 * apiName, bilingual label, data type, section, required/encrypted flags.
 * "New field" button routes to the create form (createCustomField action).
 */
export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ objectType?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const sp = searchParams ? await searchParams : {} as { objectType?: string }
  const activeType = OBJECT_TYPES.includes(sp.objectType as (typeof OBJECT_TYPES)[number])
    ? sp.objectType as (typeof OBJECT_TYPES)[number]
    : 'persons'

  const locale = await resolveLocale(session.user.personId)
  const fields = await getCustomFields(activeType)

  return (
    <div className="page-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'الحقول المخصصة' : 'Custom fields'}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {locale === 'ar'
              ? 'وسّع كائنات الموارد البشرية بحقول خاصة بالمستأجر تُخزَّن في عمود extra_data من نوع JSONB.'
              : 'Extend HR objects with tenant-specific fields stored in the extra_data JSONB column.'}
          </p>
        </div>
        <Link href="/settings/custom-fields/new">
          <Button size="sm">{locale === 'ar' ? '+ حقل جديد' : '+ New field'}</Button>
        </Link>
      </div>

      {/* Object type tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {OBJECT_TYPES.map(ot => (
          <Link
            key={ot}
            href={`/settings/custom-fields?objectType=${ot}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeType === ot
                ? 'bg-card text-accent shadow-sm'
                : 'text-ink-3 hover:text-ink-1'
            }`}
          >
            {ot}
          </Link>
        ))}
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {fields.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-3">
              {locale === 'ar' ? 'لا توجد حقول مخصصة معرّفة لـ ' : 'No custom fields defined for '}<span className="font-mono">{activeType}</span>{locale === 'ar' ? ' بعد.' : ' yet.'}
            </p>
          ) : (
            <TableScrollRegion><table className="w-full text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase text-ink-3">
                <tr>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'اسم الحقل (API)' : 'API name'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'التسمية EN / AR' : 'Label EN / AR'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'القسم' : 'Section'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'العلامات' : 'Flags'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الترتيب' : 'Order'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fields.map(f => (
                  <tr key={f.id} className="hover:bg-surface/50">
                    <td className="px-5 py-3 font-mono text-xs text-ink-2">{f.apiName}</td>
                    <td className="px-5 py-3">
                      <p className="text-ink-1">{f.labelEn}</p>
                      {f.labelAr && (
                        <p className="text-xs text-ink-3" dir="rtl" lang="ar">{f.labelAr}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-xs">{f.dataType}</Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-3">{f.sectionCode ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {f.isRequired   && <Badge variant="outline" className="text-xs text-destructive">REQUIRED</Badge>}
                        {f.isSearchable && <Badge variant="outline" className="text-xs">SEARCHABLE</Badge>}
                        {f.isEncrypted  && <Badge variant="secondary" className="text-xs">ENCRYPTED</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-3">{f.displayOrder}</td>
                    <td className="px-5 py-3">
                      {f.isActive
                        ? <Badge variant="outline" className="text-xs text-accent">ACTIVE</Badge>
                        : <Badge variant="secondary" className="text-xs">INACTIVE</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></TableScrollRegion>
          )}
      </div>
    </div>
  )
}
