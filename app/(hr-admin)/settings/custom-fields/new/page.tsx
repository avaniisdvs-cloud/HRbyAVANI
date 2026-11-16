import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { CustomFieldCreateForm } from './CustomFieldCreateForm'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'New custom field · AVANIIS HR' }

export default async function NewCustomFieldPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings/custom-fields')

  const legalEntityId = session.user.legalEntityId
  if (!legalEntityId) redirect('/settings/custom-fields')

  const locale = await resolveLocale(session.user.personId)

  return (
    <div className="page-in">
      <div>
        <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'حقل مخصص جديد' : 'New custom field'}</PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar' ? (
            <>أضف حقلاً خاصاً بالمستأجر إلى كائن موارد بشرية. تُخزَّن القيمة في عمود
            <span className="mx-1 font-mono text-ink-2">extra_data</span> من نوع JSONB.</>
          ) : (
            <>Add a tenant-specific field to an HR object. The value is stored in the
            <span className="mx-1 font-mono text-ink-2">extra_data</span> JSONB column.</>
          )}
        </p>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', maxWidth: '42rem' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }} className="">{locale === 'ar' ? 'تعريف الحقل' : 'Field definition'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <CustomFieldCreateForm legalEntityId={legalEntityId} />
        </div>
      </div>
    </div>
  )
}
