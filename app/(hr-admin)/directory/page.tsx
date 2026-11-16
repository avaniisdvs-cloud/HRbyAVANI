import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth, roleHome } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import { searchDirectory } from '@/modules/directory/actions'
import { DirectoryPageClient } from '@/components/directory/DirectoryPageClient'

export const metadata = { title: 'Directory · AVANIIS People' }

const ALLOWED = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER']

export default async function AdminDirectoryPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!ALLOWED.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale  = await getLocale()
  const initial = await searchDirectory({ query: '', pageSize: 20 })

  return (
    <div className="page-in">
      <div style={{ marginBottom: 24 }}>
        <PageTitle style={{
          fontFamily:    'var(--font-serif)',
          fontSize:      28,
          fontWeight:    500,
          letterSpacing: '-0.4px',
          color:         'var(--ink-1)',
          margin:        0,
        }}>
          {locale === 'ar' ? 'دليل الموظفين' : 'Employee Directory'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          {locale === 'ar'
            ? 'ابحث عن موظفين واطّلع على بياناتهم الوظيفية.'
            : 'Search employees and view their work contact details.'}
        </p>
      </div>

      <DirectoryPageClient
        initial={initial}
        locale={locale === 'ar' ? 'ar' : 'en'}
        showEntity={true}
      />
    </div>
  )
}
