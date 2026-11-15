import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, roleHome } from '@/lib/auth'
import { getWorkflowTemplate } from '@/modules/config'
import { resolveLocale } from '@/lib/language-preference'
import { Badge } from '@/components/ui/badge'
import { WorkflowTemplateForm } from '../WorkflowTemplateForm'
import { PreviewChainButton } from '@/components/workflow/PreviewChainButton'

export const metadata = { title: 'Edit workflow template · AVANIIS HR' }

export default async function EditWorkflowTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // BR-WF-003: HR_DIRECTOR / SUPER_ADMIN only.
  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await resolveLocale(session.user.personId)

  const { id } = await params

  const data = await getWorkflowTemplate(id)
  if (!data) notFound()
  const { template, stages } = data

  // Entity scope — non-SUPER_ADMIN users may only edit their own entity's templates.
  if (
    session.user.role !== 'SUPER_ADMIN' &&
    template.legalEntityId &&
    template.legalEntityId !== session.user.legalEntityId
  ) {
    redirect('/settings/workflows')
  }

  return (
    <div className="page-in">
      <div>
        <Link href="/settings/workflows" className="text-xs text-accent hover:underline">
          {locale === 'ar' ? '← العودة إلى القوالب' : '← All templates'}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl text-ink-1">
            {locale === 'ar' ? 'تعديل القالب' : 'Edit workflow template'}
          </h1>
          <Badge variant="outline">v{template.version}</Badge>
          {template.isActive
            ? <Badge>{locale === 'ar' ? 'نشط' : 'Active'}</Badge>
            : <Badge variant="outline">{locale === 'ar' ? 'غير نشط' : 'Inactive'}</Badge>}
          <PreviewChainButton
            workflowCode={template.workflowCode}
            defaultLegalEntityId={template.legalEntityId ?? session.user.legalEntityId}
            locale={locale}
          />
        </div>
        <p className="mt-1 text-sm text-ink-3">
          Saving creates v{template.version + 1}. Running instances keep their snapshot of v{template.version}.
        </p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }} className="text-base">{locale === 'ar' ? 'تفاصيل القالب' : 'Template details'}</h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <WorkflowTemplateForm
            legalEntityId={session.user.legalEntityId}
            locale={locale}
            initial={{
              id:              template.id,
              workflowCode:    template.workflowCode,
              workflowNameEn:  template.workflowNameEn,
              workflowNameAr:  template.workflowNameAr ?? '',
              triggerEvent:    template.triggerEvent,
              approvalMode:    template.approvalMode as 'SEQUENTIAL' | 'PARALLEL',
              slaHours:        template.slaHours,
              escalationHours: template.escalationHours,
              isActive:        template.isActive,
              stages: stages.map(s => ({
                stageOrder:         s.stageOrder,
                stageNameEn:        s.stageNameEn,
                stageNameAr:        s.stageNameAr ?? '',
                approverRoleCode:   s.approverRoleCode ?? 'LINE_MANAGER',
                stageSlaHours:      s.stageSlaHours,
                escalationRoleCode: s.escalationRoleCode,
                canDelegate:        s.canDelegate,
                isOptional:         s.isOptional,
                actionType:         (s.actionType ?? 'APPROVE_REJECT') as 'APPROVE_REJECT' | 'ACKNOWLEDGE' | 'INFO_ONLY',
              })),
            }}
          />
        </div>
      </div>
    </div>
  )
}
