import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import { searchDirectory } from '@/modules/directory/actions'
import { DirectoryPageClient } from '@/components/directory/DirectoryPageClient'

export const metadata = { title: 'Directory · AVANIIS People' }

export default async function EmployeeDirectoryPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale  = await getLocale()
  const initial = await searchDirectory({ query: '', pageSize: 20 })

  return (
    <div className="page-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily:    'var(--font-serif)',
          fontSize:      28,
          fontWeight:    500,
          letterSpacing: '-0.4px',
          color:         'var(--ink-1)',
          margin:        0,
        }}>
          {locale === 'ar' ? 'دليل الموظفين' : 'Employee Directory'}
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          {locale === 'ar'
            ? 'ابحث عن زملائك واطّلع على بياناتهم الوظيفية.'
            : 'Find colleagues and view their work contact details.'}
        </p>
      </div>

      <DirectoryPageClient
        initial={initial}
        locale={locale === 'ar' ? 'ar' : 'en'}
        showEntity={false}
      />
    </div>
  )
}
