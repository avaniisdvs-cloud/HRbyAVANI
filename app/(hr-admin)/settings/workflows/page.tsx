import { redirect }                   from 'next/navigation'
import { auth, roleHome }                        from '@/lib/auth'
import { getWorkflowTemplates }        from '@/modules/config'
import { WorkflowTemplatesClient }     from './WorkflowTemplatesClient'

export const metadata = { title: 'Workflow Templates' }

/**
 * S9-01 — Workflow templates list (HR_DIRECTOR / SUPER_ADMIN only).
 * Server component: auth-gate + data fetch, delegates rendering to
 * WorkflowTemplatesClient for interactive MdmRowMenu behaviour.
 *
 * Hard Rule 5: every label is bilingual EN + AR.
 */
export default async function WorkflowsListPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const scopedEntityId = session.user.role === 'SUPER_ADMIN'
    ? undefined
    : session.user.legalEntityId

  const templates = await getWorkflowTemplates(scopedEntityId)

  return (
    <div className="page-in">
      <WorkflowTemplatesClient templates={templates} />
    </div>
  )
}
