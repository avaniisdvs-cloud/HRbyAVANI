import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listWorkflowDefinitions } from '@/modules/workflow/actions'
import { WorkflowListClient } from './WorkflowListClient'

export const metadata = { title: 'Workflow Definitions' }

export default async function WorkflowDefinitionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  const definitions = await listWorkflowDefinitions().catch(() => [])

  return <WorkflowListClient initialData={definitions} />
}
