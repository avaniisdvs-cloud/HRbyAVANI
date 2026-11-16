/**
 * Workflow Steps page — server component.
 *
 * Route: /configuration/workflows/[workflowId]
 *
 * Loads the workflow definition by id, then lists all steps ordered by
 * stepOrder. Renders a StepsPageClient for interactivity (add / edit / delete
 * / reorder).
 */

import { PageTitle } from '@/components/ui/typography'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { workflowDefinitionsV2 } from '@/drizzle/schema/workflow-engine'
import { listWorkflowSteps, listApprovalGroups } from '@/modules/workflow/actions'
import { TENANT_ID } from '@/lib/constants'
import { StepsPageClient } from './StepsPageClient'
import type { PersonOption } from '@/components/forms/PersonSelect'

export const metadata = { title: 'Workflow steps' }

export default async function WorkflowStepsPage({
  params,
}: {
  params: Promise<{ workflowId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const { workflowId } = await params

  const [wf] = await db
    .select()
    .from(workflowDefinitionsV2)
    .where(and(
      eq(workflowDefinitionsV2.id, workflowId),
      eq(workflowDefinitionsV2.tenantId, TENANT_ID),
    ))
    .limit(1)

  if (!wf) notFound()

  const [steps, groups] = await Promise.all([
    listWorkflowSteps(workflowId),
    listApprovalGroups(),
  ])

  // Active approval groups for the CUSTOM_GROUP routing picker (searchable LOV).
  const groupOptions: PersonOption[] = groups
    .filter(g => g.isActive)
    .map(g => ({
      id:       g.id,
      label:    `${g.groupNameEn} — ${g.groupCode}`,
      sublabel: `${g.memberCount} member${g.memberCount === 1 ? '' : 's'} · ${g.votingMethod.replace('_', ' ')}`,
    }))

  return (
    <div className="page-in">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
        <Link href="/configuration/workflows" style={{ color: 'var(--brand-active)', textDecoration: 'none' }}>
          Workflow templates
        </Link>
        <span>/</span>
        <span>{wf.workflowNameEn}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div>
          <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--ink-1)', margin: 0 }}>
            {wf.workflowNameEn}
            {wf.workflowNameAr && (
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', marginLeft: 12, direction: 'rtl', fontFamily: 'inherit' }}>
                {wf.workflowNameAr}
              </span>
            )}
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0' }}>
            {steps.length} step{steps.length !== 1 ? 's' : ''} · {wf.triggerEvent}
          </p>
        </div>
      </div>

      <StepsPageClient
        workflowId={workflowId}
        workflowCode={wf.workflowCode}
        initialSteps={steps}
        groupOptions={groupOptions}
      />
    </div>
  )
}
