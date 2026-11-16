import { PageTitle } from '@/components/ui/typography'
import { redirect }              from 'next/navigation'
import Link                       from 'next/link'
import { ArrowLeft }              from 'lucide-react'
import { auth, roleHome }                   from '@/lib/auth'
import { resolveLocale }          from '@/lib/language-preference'
import { WorkflowTemplateForm }   from '../WorkflowTemplateForm'

export const metadata = { title: 'New Workflow Template · AVANIIS HR' }

export default async function NewWorkflowTemplatePage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await resolveLocale(session.user.personId)

  return (
    <div className="page-in">

      {/* Back link */}
      <Link
        href="/settings/workflows"
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        5,
          fontSize:   'var(--text-body)',
          color:      'var(--brand-active)',
          textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} />
        {locale === 'ar' ? 'العودة للقوالب' : 'All templates'}
      </Link>

      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <PageTitle style={{
          fontFamily:    'var(--font-serif)',
          fontSize:      26,
          fontWeight:    500,
          color:         'var(--ink-1)',
          margin:        0,
          letterSpacing: '-0.3px',
        }}>
          {locale === 'ar' ? 'قالب سير عمل جديد' : 'New Workflow Template'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          Define an ordered approval chain triggered by a transaction event.
          Save creates v1 of the template — future edits create new versions and leave running instances untouched.
        </p>
      </div>

      <WorkflowTemplateForm legalEntityId={session.user.legalEntityId} locale={locale} />
    </div>
  )
}
