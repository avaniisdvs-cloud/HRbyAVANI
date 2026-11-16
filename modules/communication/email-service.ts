/**
 * EmailService — the single sanctioned path from a rendered message to a provider.
 *
 *   sendEmail()          — render + send an ad-hoc email immediately
 *   sendTemplateEmail()  — render a template by code + send immediately
 *   sendWorkflowEmail()  — convenience for workflow notifications w/ action links
 *   sendTestEmail()      — verify + send using a SPECIFIC (possibly inactive) row
 *   dispatchQueued()     — process a single QUEUED email_messages row (cron path)
 *   dispatchQueuedMessageById() — process one persisted QUEUED row immediately
 *   retryFailedEmail()   — requeue a FAILED message within its retry budget
 *
 * Server-only. Never imported by client components. Secrets never leave here.
 */
import 'server-only'
import { getCompanyBranding } from '@/lib/company-branding'
import { and, eq, lte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import {
  emailMessages,
  emailDeliveryEvents,
  emailTemplates,
} from '@/drizzle/schema/communication'
import {
  getActiveProvider,
  getSenderDefaults,
  resolveModuleSender,
  toResolvedConfig,
  buildProvider,
  type ProviderSettingsRow,
} from './settings'
import { renderTemplate, type TemplateVars } from './templates/render'
import { wrapBrandedEmail } from './templates/base-layout'
import { TEMPLATE_SEED_MAP } from './templates/seeds'
import type { EmailProvider, OutboundEmail } from './providers/types'
import {
  EMAIL_DELIVERY_REJECTION_EVENT,
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
  type EmailDeliveryPolicySource,
  type EmailDeliveryPolicyResult,
} from './delivery-policy'

type EmailMessageRow = typeof emailMessages.$inferSelect
type EmailAuditActor = { id: string; name: string; role: string }
type SendResult = { ok: boolean; error?: string; rejectedByPolicy?: boolean }

const SYSTEM_ACTOR: EmailAuditActor = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'system: email-delivery-policy',
  role: 'SYSTEM',
}

// ── Template resolution: DB row preferred, seed fallback ─────────────────────
async function resolveTemplate(code: string, lang = 'en') {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(and(
      eq(emailTemplates.tenantId, TENANT_ID),
      eq(emailTemplates.templateCode, code),
      eq(emailTemplates.languageCode, lang),
      eq(emailTemplates.isActive, true),
    ))
    .limit(1)
  if (row) {
    return {
      subjectTemplate: row.subjectTemplate,
      bodyHtmlTemplate: row.bodyHtmlTemplate,
      bodyTextTemplate: row.bodyTextTemplate,
    }
  }
  const seed = TEMPLATE_SEED_MAP[code]
  if (!seed) return null
  return {
    subjectTemplate: seed.subjectTemplate,
    bodyHtmlTemplate: seed.bodyHtmlTemplate,
    bodyTextTemplate: seed.bodyTextTemplate,
  }
}

// ── Delivery-event helpers ────────────────────────────────────────────────────
async function recordEvent(
  messageId: string,
  eventType: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'RETRY' | 'BOUNCED' | 'OPENED',
  payload?: Record<string, unknown>,
  exec: typeof db = db,
) {
  await exec.insert(emailDeliveryEvents).values({
    tenantId: TENANT_ID,
    emailMessageId: messageId,
    eventType,
    eventPayload: payload,
  })
}

async function auditPolicyRejection(args: {
  recipientEmail: string
  policy: EmailDeliveryPolicyResult
  source: EmailDeliveryPolicySource
  actor?: EmailAuditActor
  resourceType?: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
}) {
  const actor = args.actor ?? SYSTEM_ACTOR
  await db.transaction(async (tx) => {
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      channel: 'SYSTEM',
      eventType: EMAIL_DELIVERY_REJECTION_EVENT,
      resourceType: args.resourceType ?? 'email_delivery_policy',
      resourceId: args.resourceId ?? undefined,
      metadata: emailDeliveryPolicyMetadata(args.recipientEmail, args.policy, args.source, args.metadata),
    }, tx)
  })
}

// ── Core: deliver one persisted message row through the active provider ───────
export async function dispatchQueued(row: EmailMessageRow): Promise<{ success: boolean; error?: string }> {
  const policy = validateEmailDeliveryPolicy(row.recipientEmail)
  if (!policy.allowed) {
    await db.transaction(async (tx) => {
      await tx.update(emailMessages)
        .set({
          status: 'CANCELLED',
          lastError: policy.error.slice(0, 2000),
          updatedDate: new Date(),
        })
        .where(and(eq(emailMessages.id, row.id), eq(emailMessages.status, 'QUEUED')))

      await tx.insert(emailDeliveryEvents).values({
        tenantId: TENANT_ID,
        emailMessageId: row.id,
        eventType: 'FAILED',
        eventPayload: emailDeliveryPolicyMetadata(row.recipientEmail, policy, 'dispatchQueued'),
      })

      await writeAuditLog({
        actorId: SYSTEM_ACTOR.id,
        actorName: SYSTEM_ACTOR.name,
        actorRole: SYSTEM_ACTOR.role,
        channel: 'SYSTEM',
        eventType: EMAIL_DELIVERY_REJECTION_EVENT,
        resourceType: 'email_messages',
        resourceId: row.id,
        metadata: emailDeliveryPolicyMetadata(row.recipientEmail, policy, 'dispatchQueued', {
          templateCode: row.templateCode,
          module: row.module,
          workflowRequestId: row.workflowRequestId,
          workflowStepId: row.workflowStepId,
          businessObjectType: row.businessObjectType,
          businessObjectId: row.businessObjectId,
        }),
      }, tx)
    })
    return { success: false, error: policy.error }
  }

  const active = await getActiveProvider(row.tenantId)
  if (!active) {
    await markFailed(row.id, 'No active email provider configured')
    return { success: false, error: 'No active email provider configured' }
  }

  // Atomically CLAIM the message: QUEUED → SENDING only succeeds for the first
  // runner. This makes concurrent/overlapping cron invocations idempotent — a
  // message already SENDING/SENT/FAILED is skipped, never double-sent.
  const [claimed] = await db.update(emailMessages)
    .set({ status: 'SENDING', providerType: active.row.providerType, updatedDate: new Date() })
    .where(and(eq(emailMessages.id, row.id), eq(emailMessages.status, 'QUEUED')))
    .returning({ id: emailMessages.id })
  if (!claimed) {
    return { success: false, error: 'Message already claimed by another dispatcher run' }
  }
  await recordEvent(row.id, 'SENDING')

  // Re-render from stored payload if a template code is present; else use stored subject/html.
  let outbound: OutboundEmail
  const payload = (row.payloadJson ?? {}) as Record<string, unknown>
  if (row.templateCode) {
    const tpl = await resolveTemplate(row.templateCode)
    if (!tpl) {
      await markFailed(row.id, `Template not found: ${row.templateCode}`)
      return { success: false, error: 'Template not found' }
    }
    const rendered = renderTemplate({
      ...tpl,
      vars: (payload.vars ?? {}) as TemplateVars,
      rawKeys: (payload.rawKeys as string[]) ?? [],
      companyName: payload.companyName as string | undefined,
      legalEntityName: payload.legalEntityName as string | undefined,
      hrContact: payload.hrContact as string | undefined,
      complianceFooter: payload.complianceFooter as string | undefined,
      dir: (payload.dir as 'ltr' | 'rtl') ?? 'ltr',
    })
    outbound = {
      to: row.recipientEmail,
      toName: payload.recipientName as string | undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      fromEmail: row.senderEmail ?? undefined,
    }
  } else {
    outbound = {
      to: row.recipientEmail,
      subject: row.subject ?? '(no subject)',
      html: (payload.html as string) ?? wrapBrandedEmail({ title: row.subject ?? '', bodyHtml: '' }),
      fromEmail: row.senderEmail ?? undefined,
    }
  }

  const result = await active.provider.send(outbound)
  if (result.success) {
    await db.update(emailMessages)
      .set({ status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId ?? null, updatedDate: new Date() })
      .where(eq(emailMessages.id, row.id))
    await recordEvent(row.id, 'SENT', { providerMessageId: result.providerMessageId })
    return { success: true }
  }
  await markFailed(row.id, result.error ?? 'Unknown send error')
  return { success: false, error: result.error }
}

/**
 * Queue-first immediate delivery helper.
 *
 * The queue row remains authoritative. This helper only fetches an already
 * committed email_messages row and then reuses dispatchQueued(), including its
 * QUEUED -> SENDING atomic claim. If cron/manual retry races this call, exactly
 * one dispatcher can claim the row.
 */
export async function dispatchQueuedMessageById(messageId: string): Promise<{ success: boolean; error?: string }> {
  const [row] = await db
    .select()
    .from(emailMessages)
    .where(and(
      eq(emailMessages.tenantId, TENANT_ID),
      eq(emailMessages.id, messageId),
      eq(emailMessages.status, 'QUEUED'),
    ))
    .limit(1)

  if (!row) return { success: false, error: 'Message not found or not queued' }
  return dispatchQueued(row)
}

async function markFailed(id: string, error: string) {
  await db.update(emailMessages)
    .set({ status: 'FAILED', lastError: error.slice(0, 2000), retryCount: sql`${emailMessages.retryCount} + 1`, updatedDate: new Date() })
    .where(eq(emailMessages.id, id))
  await recordEvent(id, 'FAILED', { error: error.slice(0, 500) })
}

/** Pick + dispatch a batch of due QUEUED messages. Used by the cron route. */
export async function dispatchBatch(limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const rows = await db
    .select()
    .from(emailMessages)
    .where(and(
      eq(emailMessages.tenantId, TENANT_ID),
      inArray(emailMessages.status, ['QUEUED']),
      lte(emailMessages.sendAfter, new Date()),
    ))
    .limit(limit)

  let sent = 0, failed = 0
  for (const row of rows) {
    const r = await dispatchQueued(row)
    if (r.success) sent++; else failed++
  }
  return { processed: rows.length, sent, failed }
}

/** Requeue a FAILED message if it still has retry budget on the active provider. */
export async function retryFailedEmail(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.select().from(emailMessages).where(eq(emailMessages.id, messageId)).limit(1)
  if (!row) return { ok: false, error: 'Message not found' }
  if (row.status === 'SENT') return { ok: false, error: 'Message already sent' }
  if (row.status !== 'FAILED') return { ok: false, error: 'Only failed messages can be retried' }
  const active = await getActiveProvider(row.tenantId)
  const budget = active?.row.retryCount ?? 3
  if (row.retryCount >= budget) return { ok: false, error: `Retry budget exhausted (${budget})` }
  await db.update(emailMessages)
    .set({ status: 'QUEUED', sendAfter: new Date(), updatedDate: new Date() })
    .where(eq(emailMessages.id, messageId))
  await recordEvent(messageId, 'RETRY')
  return { ok: true }
}

// ── Immediate sends (test email) ──────────────────────────────────────────────

/** Verify + send a test email through a SPECIFIC provider row (need not be active). */
export async function sendTestEmail(
  providerRow: ProviderSettingsRow,
  to: string,
  auditActor?: EmailAuditActor,
): Promise<SendResult> {
  const policy = validateEmailDeliveryPolicy(to)
  if (!policy.allowed) {
    await auditPolicyRejection({
      recipientEmail: to,
      policy,
      source: 'sendTestEmail',
      actor: auditActor,
      resourceType: 'email_provider_settings',
      resourceId: providerRow.id,
      metadata: { providerType: providerRow.providerType },
    })
    return { ok: false, error: policy.error, rejectedByPolicy: true }
  }

  const provider: EmailProvider = buildProvider(toResolvedConfig(providerRow))
  const verify = await provider.verify()
  if (!verify.ok) return { ok: false, error: verify.error }

  const { companyName } = await getCompanyBranding()
  const subject = `${companyName} HR — Test Email`
  const html = wrapBrandedEmail({
    title: subject, companyName: `${companyName} HR`,
    bodyHtml: `<p>This is a test email confirming your <strong>${providerRow.providerType === 'GRAPH_API' ? 'Microsoft Graph API' : 'SMTP'}</strong> configuration is working.</p><p>If you received this, outbound email is correctly configured.</p>`,
  })
  const result = await provider.send({ to, subject, html })
  return { ok: result.success, error: result.error }
}

// ── Ad-hoc immediate sends (used by callers that want synchronous delivery) ───

export async function sendTemplateEmail(args: {
  to: string
  toName?: string
  templateCode: string
  vars: TemplateVars
  rawKeys?: string[]
  module?: string
  lang?: string
  actor?: EmailAuditActor
}): Promise<SendResult> {
  const policy = validateEmailDeliveryPolicy(args.to)
  if (!policy.allowed) {
    await auditPolicyRejection({
      recipientEmail: args.to,
      policy,
      source: 'sendTemplateEmail',
      actor: args.actor,
      metadata: {
        templateCode: args.templateCode,
        module: args.module ?? null,
      },
    })
    return { ok: false, error: policy.error, rejectedByPolicy: true }
  }

  const active = await getActiveProvider()
  if (!active) return { ok: false, error: 'No active email provider configured' }
  const tpl = await resolveTemplate(args.templateCode, args.lang ?? 'en')
  if (!tpl) return { ok: false, error: `Template not found: ${args.templateCode}` }
  const defaults = await getSenderDefaults()
  const sender = resolveModuleSender(defaults, args.module)
  const rendered = renderTemplate({ ...tpl, vars: args.vars, rawKeys: args.rawKeys })
  const result = await active.provider.send({
    to: args.to,
    toName: args.toName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromEmail: sender.fromEmail,
    fromName: sender.fromName,
    replyTo: sender.replyTo,
  })
  return { ok: result.success, error: result.error }
}
