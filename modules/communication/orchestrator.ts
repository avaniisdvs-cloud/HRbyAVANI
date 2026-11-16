/**
 * NotificationOrchestrator — the funnel for business events into channels.
 *
 * Hard rule (Section 9): business logic NEVER calls a provider directly. Modules
 * emit an event here; the orchestrator decides channels (today: in-app + email;
 * future: Teams / SMS / WhatsApp / push) and QUEUES email_messages rows. A cron
 * dispatcher (app/api/cron/email-dispatch) can later recover any rows not sent
 * by the immediate queue-first dispatcher.
 *
 * Queuing is decoupled from sending so a provider outage NEVER blocks or rolls
 * back the originating business transaction.
 */
import { getCompanyBranding } from '@/lib/company-branding'
import 'server-only'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import { emailMessages, emailDeliveryEvents } from '@/drizzle/schema/communication'
import { getSenderDefaults, resolveModuleSender } from './settings'
import type { TemplateVars } from './templates/render'
import { ctaButton } from './templates/base-layout'
import { issueApprovalLinks, type ActionLinks } from './action-tokens'
import { renderDecisionContextHtml, type DecisionContext } from './decision-context'
import {
  EMAIL_DELIVERY_REJECTION_EVENT,
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
} from './delivery-policy'
import { dispatchQueuedMessageById } from './email-service'

export interface QueueEmailArgs {
  templateCode: string
  module?: string
  recipientEmail: string
  recipientPersonId?: string
  recipientName?: string
  vars: TemplateVars
  /** Keys in vars whose values are trusted pre-built HTML (e.g. action buttons). */
  rawKeys?: string[]
  businessObjectType?: string
  businessObjectId?: string
  workflowRequestId?: string
  workflowStepId?: string
  companyName?: string
  legalEntityName?: string
  hrContact?: string
  complianceFooter?: string
  dir?: 'ltr' | 'rtl'
  decisionContext?: DecisionContext
  /**
   * queue_only keeps the historical outbox-only behaviour.
   * immediate queues first, commits the row, then invokes the same dispatcher
   * used by cron. Provider failures remain non-fatal to business workflows.
   */
  dispatchStrategy?: 'queue_only' | 'immediate'
  actor: { id: string; name: string; role?: string }
}

/**
 * Queue a templated email. Returns the new message id, or null on failure.
 * NEVER throws — callers (e.g. leave submission) must not be impacted by email
 * problems. Uses the global pool intentionally so it can be called AFTER the
 * business transaction commits.
 */
export async function queueEmail(args: QueueEmailArgs): Promise<string | null> {
  try {
    const policy = validateEmailDeliveryPolicy(args.recipientEmail)
    if (!policy.allowed) {
      await db.transaction(async (tx) => {
        await writeAuditLog({
          actorId: args.actor.id,
          actorName: args.actor.name,
          actorRole: args.actor.role ?? 'SYSTEM',
          channel: 'SYSTEM',
          eventType: EMAIL_DELIVERY_REJECTION_EVENT,
          resourceType: 'email_delivery_policy',
          resourceId: args.businessObjectId,
          metadata: emailDeliveryPolicyMetadata(args.recipientEmail, policy, 'queueEmail', {
            templateCode: args.templateCode,
            module: args.module ?? null,
            businessObjectType: args.businessObjectType ?? null,
            workflowRequestId: args.workflowRequestId ?? null,
            workflowStepId: args.workflowStepId ?? null,
            recipientPersonId: args.recipientPersonId ?? null,
          }),
        }, tx)
      })
      return null
    }

    const defaults = await getSenderDefaults()
    const sender = resolveModuleSender(defaults, args.module)

    const payloadJson = {
      vars: args.vars,
      rawKeys: args.rawKeys ?? [],
      recipientName: args.recipientName,
      companyName: args.companyName ?? `${(await getCompanyBranding()).companyName} HR`,
      legalEntityName: args.legalEntityName,
      hrContact: args.hrContact,
      complianceFooter: args.complianceFooter,
      dir: args.dir ?? 'ltr',
      decisionContext: args.decisionContext,
    }

    const messageId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(emailMessages).values({
        tenantId: TENANT_ID,
        templateCode: args.templateCode,
        module: args.module,
        recipientEmail: args.recipientEmail,
        recipientPersonId: args.recipientPersonId ?? null,
        senderEmail: sender.fromEmail ?? null,
        status: 'QUEUED',
        businessObjectType: args.businessObjectType ?? null,
        businessObjectId: args.businessObjectId ?? null,
        workflowRequestId: args.workflowRequestId ?? null,
        workflowStepId: args.workflowStepId ?? null,
        payloadJson,
        createdBy: args.actor.id,
        createdByName: args.actor.name,
      }).returning({ id: emailMessages.id })

      if (row) {
        await tx.insert(emailDeliveryEvents).values({
          tenantId: TENANT_ID,
          emailMessageId: row.id,
          eventType: 'QUEUED',
        })
      }
      return row?.id ?? null
    })

    if (messageId && args.dispatchStrategy === 'immediate') {
      try {
        const result = await dispatchQueuedMessageById(messageId)
        if (!result.success) {
          console.error('[orchestrator] immediate email dispatch failed (queue row retained):', result.error)
        }
      } catch (dispatchErr) {
        console.error('[orchestrator] immediate email dispatch threw (queue row retained):',
          dispatchErr instanceof Error ? dispatchErr.message : dispatchErr)
      }
    }

    return messageId
  } catch (err) {
    console.error('[orchestrator] queueEmail failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Convenience for workflow approval emails: issues APPROVE/REJECT/DELEGATE action links
 * (when enabled) and queues the email with rendered action buttons.
 */
export async function queueWorkflowApprovalEmail(args: {
  templateCode: string
  module?: string
  recipientEmail: string
  recipientPersonId: string
  recipientName?: string
  vars: TemplateVars
  workflowInstanceId: string
  workflowStepInstanceId: string
  approverPersonId: string
  businessObjectType?: string
  businessObjectId?: string
  enableWorkflowActions: boolean
  tokenExpiryMinutes: number
  decisionContext?: DecisionContext
  actor: { id: string; name: string }
}): Promise<string | null> {
  let actionButtons = ''
  const decisionContextHtml = args.decisionContext
    ? renderDecisionContextHtml(args.decisionContext)
    : ''
  const rawKeys = ['actionButtons', 'decisionContextHtml']
  const approvalEmailPolicy = validateEmailDeliveryPolicy(args.recipientEmail)
  if (!approvalEmailPolicy.allowed) {
    return queueEmail({
      templateCode: args.templateCode,
      module: args.module,
      recipientEmail: args.recipientEmail,
      recipientPersonId: args.recipientPersonId,
      recipientName: args.recipientName,
      vars: { ...args.vars, decisionContextHtml, actionButtons: decisionContextHtml },
      rawKeys,
      businessObjectType: args.businessObjectType,
      businessObjectId: args.businessObjectId,
      workflowRequestId: args.workflowInstanceId,
      workflowStepId: args.workflowStepInstanceId,
      decisionContext: args.decisionContext,
      dispatchStrategy: 'immediate',
      actor: args.actor,
    })
  }

  if (args.enableWorkflowActions) {
    try {
      const expiresAt = new Date(Date.now() + args.tokenExpiryMinutes * 60_000)
      const links: ActionLinks = await issueApprovalLinks({
        instanceId: args.workflowInstanceId,
        stepInstanceId: args.workflowStepInstanceId,
        approverPersonId: args.approverPersonId,
        expiresAt,
      })
      actionButtons =
        decisionContextHtml +
        ctaButton('Approve · موافقة', links.approveUrl, 'approve') +
        ctaButton('Reject · رفض', links.rejectUrl, 'reject') +
        ctaButton('Delegate · تفويض', links.delegateUrl, 'neutral')
    } catch (err) {
      console.error('[orchestrator] issueApprovalLinks failed (non-fatal):', err instanceof Error ? err.message : err)
    }
  } else {
    actionButtons = decisionContextHtml
  }

  return queueEmail({
    templateCode: args.templateCode,
    module: args.module,
    recipientEmail: args.recipientEmail,
    recipientPersonId: args.recipientPersonId,
    recipientName: args.recipientName,
    vars: { ...args.vars, decisionContextHtml, actionButtons },
    rawKeys,
    businessObjectType: args.businessObjectType,
    businessObjectId: args.businessObjectId,
    workflowRequestId: args.workflowInstanceId,
    workflowStepId: args.workflowStepInstanceId,
    decisionContext: args.decisionContext,
    dispatchStrategy: 'immediate',
    actor: args.actor,
  })
}
