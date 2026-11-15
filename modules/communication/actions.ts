'use server'
/**
 * Communication Settings server actions.
 *
 * ADR-001 pattern: auth() → requireRole → Schema.parse → db.transaction +
 * writeAuditLog(tx) → revalidatePath. Secrets are AES-256-GCM encrypted on write
 * and NEVER returned in plaintext (read helpers return masked placeholders).
 *
 * Authorized roles: HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN. Activation requires a
 * PASSED test, unless a SUPER_ADMIN supplies an explicit override reason.
 */
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { and, eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { encrypt } from '@/lib/encryption'
import {
  emailProviderSettings,
  emailSenderDefaults,
  emailTemplates,
} from '@/drizzle/schema/communication'
import { sendTestEmail as svcSendTestEmail, retryFailedEmail as svcRetry } from './email-service'
import {
  EMAIL_DELIVERY_REJECTION_EVENT,
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
} from './delivery-policy'

const ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const
const MASK = '••••••••'

type Result = { ok: true } | { ok: false; error: string }

// ── Validation ────────────────────────────────────────────────────────────────
const emailField = z.string().email().max(320)
const optEmail = z.string().email().max(320).optional().or(z.literal('').transform(() => undefined))

const graphSchema = z.object({
  providerType: z.literal('GRAPH_API'),
  graphTenantId: z.string().min(1).max(200),
  graphClientId: z.string().min(1).max(200),
  graphClientSecret: z.string().max(500).optional(), // blank/MASK ⇒ keep existing
  graphSenderMailbox: emailField,
  graphSenderName: z.string().max(200).optional(),
  graphAuthorityUrl: z.string().url().max(500).optional().or(z.literal('')),
  graphBaseUrl: z.string().url().max(500).optional().or(z.literal('')),
  graphMailSendEndpoint: z.string().url().max(500).optional().or(z.literal('')),
  graphScope: z.string().max(500).optional(),
  graphUseSharedMailbox: z.boolean().optional(),
  replyToEmail: optEmail,
  enableTracking: z.boolean().optional(),
  enableWorkflowActions: z.boolean().optional(),
  tokenExpiryMinutes: z.coerce.number().int().min(5).max(43200).optional(),
  retryCount: z.coerce.number().int().min(0).max(10).optional(),
  retryIntervalSec: z.coerce.number().int().min(30).max(86400).optional(),
})

const smtpSchema = z.object({
  providerType: z.literal('SMTP'),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUsername: z.string().max(320).optional(),
  smtpPassword: z.string().max(500).optional(), // blank/MASK ⇒ keep existing
  smtpEncryption: z.enum(['NONE', 'SSL', 'TLS', 'STARTTLS']),
  smtpSenderEmail: emailField,
  smtpSenderName: z.string().max(200).optional(),
  smtpAuthRequired: z.boolean().optional(),
  replyToEmail: optEmail,
  enableTracking: z.boolean().optional(),
  enableWorkflowActions: z.boolean().optional(),
  tokenExpiryMinutes: z.coerce.number().int().min(5).max(43200).optional(),
  retryCount: z.coerce.number().int().min(0).max(10).optional(),
  retryIntervalSec: z.coerce.number().int().min(30).max(86400).optional(),
})

const providerSchema = z.discriminatedUnion('providerType', [graphSchema, smtpSchema])

// ── Save provider settings (upsert one row per (tenant, providerType)) ────────
export async function saveProviderSettings(input: unknown): Promise<Result> {
  let user
  try {
    user = await requireRole([...ADMIN_ROLES])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Forbidden' }
  }
  const parsed = providerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  try {
    const [existing] = await db.select().from(emailProviderSettings).where(and(
      eq(emailProviderSettings.tenantId, TENANT_ID),
      eq(emailProviderSettings.providerType, data.providerType),
    )).limit(1)

    await db.transaction(async (tx) => {
      const common = {
        replyToEmail: data.replyToEmail ?? null,
        enableTracking: data.enableTracking ?? false,
        enableWorkflowActions: data.enableWorkflowActions ?? true,
        tokenExpiryMinutes: data.tokenExpiryMinutes ?? 2880,
        retryCount: data.retryCount ?? 3,
        retryIntervalSec: data.retryIntervalSec ?? 300,
        // Any settings change invalidates a prior PASSED test.
        lastTestStatus: 'UNTESTED' as const,
        updatedBy: user.id,
        updatedByName: user.name,
        updatedDate: new Date(),
        lastUpdatedDate: new Date(),
      }

      const providerFields = data.providerType === 'GRAPH_API'
        ? {
            graphTenantId: data.graphTenantId,
            graphClientId: data.graphClientId,
            // Update secret only when a real new value is supplied.
            ...(data.graphClientSecret && data.graphClientSecret !== MASK
              ? { graphClientSecretEnc: encrypt(data.graphClientSecret) }
              : {}),
            graphSenderMailbox: data.graphSenderMailbox,
            graphSenderName: data.graphSenderName ?? null,
            graphAuthorityUrl: data.graphAuthorityUrl || null,
            graphBaseUrl: data.graphBaseUrl || null,
            graphMailSendEndpoint: data.graphMailSendEndpoint || null,
            graphScope: data.graphScope ?? null,
            graphUseSharedMailbox: data.graphUseSharedMailbox ?? false,
          }
        : {
            smtpHost: data.smtpHost,
            smtpPort: data.smtpPort,
            smtpUsername: data.smtpUsername ?? null,
            ...(data.smtpPassword && data.smtpPassword !== MASK
              ? { smtpPasswordEnc: encrypt(data.smtpPassword) }
              : {}),
            smtpEncryption: data.smtpEncryption,
            smtpSenderEmail: data.smtpSenderEmail,
            smtpSenderName: data.smtpSenderName ?? null,
            smtpAuthRequired: data.smtpAuthRequired ?? true,
          }

      if (existing) {
        await tx.update(emailProviderSettings)
          .set({ ...common, ...providerFields })
          .where(eq(emailProviderSettings.id, existing.id))
      } else {
        await tx.insert(emailProviderSettings).values({
          tenantId: TENANT_ID,
          providerType: data.providerType,
          isActive: false,
          ...common,
          ...providerFields,
          createdBy: user.id,
          createdByName: user.name,
        })
      }

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB',
        eventType: 'COMMUNICATION.PROVIDER.SAVED',
        resourceType: 'email_provider_settings',
        resourceId: existing?.id,
        metadata: { providerType: data.providerType, secretRotated: data.providerType === 'GRAPH_API'
          ? Boolean(data.graphClientSecret && data.graphClientSecret !== MASK)
          : Boolean(data.smtpPassword && data.smtpPassword !== MASK) },
      }, tx)
    })

    revalidatePath('/settings/communication')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' }
  }
}

// ── Activate a provider (exclusive) ───────────────────────────────────────────
export async function setActiveProvider(input: unknown): Promise<Result> {
  let user
  try {
    user = await requireRole([...ADMIN_ROLES])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Forbidden' }
  }
  const schema = z.object({
    providerType: z.enum(['GRAPH_API', 'SMTP']),
    overrideReason: z.string().max(1000).optional(),
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input' }
  const { providerType, overrideReason } = parsed.data

  try {
    const [target] = await db.select().from(emailProviderSettings).where(and(
      eq(emailProviderSettings.tenantId, TENANT_ID),
      eq(emailProviderSettings.providerType, providerType),
    )).limit(1)
    if (!target) return { ok: false, error: 'Provider is not configured yet' }

    const testedOk = target.lastTestStatus === 'PASSED'
    const isSuperAdmin = user.role === 'SUPER_ADMIN'
    if (!testedOk) {
      if (!isSuperAdmin) {
        return { ok: false, error: 'Provider must pass a test email before activation.' }
      }
      if (!overrideReason || overrideReason.trim().length < 5) {
        return { ok: false, error: 'SUPER_ADMIN override requires a reason (min 5 chars).' }
      }
    }

    await db.transaction(async (tx) => {
      // Deactivate all, then activate target — only one active per tenant.
      await tx.update(emailProviderSettings)
        .set({ isActive: false, updatedBy: user.id, updatedByName: user.name, updatedDate: new Date() })
        .where(eq(emailProviderSettings.tenantId, TENANT_ID))
      await tx.update(emailProviderSettings)
        .set({
          isActive: true,
          activationOverrideReason: testedOk ? null : (overrideReason ?? null),
          updatedBy: user.id, updatedByName: user.name, updatedDate: new Date(),
        })
        .where(eq(emailProviderSettings.id, target.id))

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB',
        eventType: 'COMMUNICATION.PROVIDER.ACTIVATED',
        resourceType: 'email_provider_settings',
        resourceId: target.id,
        metadata: { providerType, override: !testedOk, overrideReason: testedOk ? undefined : overrideReason },
      }, tx)
    })

    revalidatePath('/settings/communication')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Activation failed' }
  }
}

// ── Sender defaults ───────────────────────────────────────────────────────────
export async function saveSenderDefaults(input: unknown): Promise<Result> {
  let user
  try {
    user = await requireRole([...ADMIN_ROLES])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Forbidden' }
  }
  const schema = z.object({
    defaultFromName: z.string().max(200).optional(),
    defaultFromEmail: optEmail,
    defaultReplyTo: optEmail,
    hrSender: optEmail,
    payrollSender: optEmail,
    workflowSender: optEmail,
    systemSender: optEmail,
    announcementSender: optEmail,
    fallbackSender: optEmail,
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  try {
    const [existing] = await db.select().from(emailSenderDefaults)
      .where(eq(emailSenderDefaults.tenantId, TENANT_ID))
      .orderBy(desc(emailSenderDefaults.updatedDate)).limit(1)

    await db.transaction(async (tx) => {
      const values = {
        defaultFromName: d.defaultFromName ?? null,
        defaultFromEmail: d.defaultFromEmail ?? null,
        defaultReplyTo: d.defaultReplyTo ?? null,
        hrSender: d.hrSender ?? null,
        payrollSender: d.payrollSender ?? null,
        workflowSender: d.workflowSender ?? null,
        systemSender: d.systemSender ?? null,
        announcementSender: d.announcementSender ?? null,
        fallbackSender: d.fallbackSender ?? null,
        updatedBy: user.id, updatedByName: user.name, updatedDate: new Date(), lastUpdatedDate: new Date(),
      }
      if (existing) {
        await tx.update(emailSenderDefaults).set(values).where(eq(emailSenderDefaults.id, existing.id))
      } else {
        await tx.insert(emailSenderDefaults).values({
          tenantId: TENANT_ID, ...values, createdBy: user.id, createdByName: user.name,
        })
      }
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB', eventType: 'COMMUNICATION.SENDERS.SAVED',
        resourceType: 'email_sender_defaults', resourceId: existing?.id,
      }, tx)
    })
    revalidatePath('/settings/communication')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' }
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────
export async function saveTemplate(input: unknown): Promise<Result> {
  let user
  try {
    user = await requireRole([...ADMIN_ROLES])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Forbidden' }
  }
  const schema = z.object({
    id: z.string().uuid().optional(),
    templateCode: z.string().min(1).max(80),
    templateName: z.string().min(1).max(200),
    subjectTemplate: z.string().min(1),
    bodyHtmlTemplate: z.string().min(1),
    bodyTextTemplate: z.string().optional(),
    module: z.string().max(60).optional(),
    languageCode: z.enum(['en', 'ar']).optional(),
    isActive: z.boolean().optional(),
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const d = parsed.data

  try {
    await db.transaction(async (tx) => {
      const values = {
        templateCode: d.templateCode,
        templateName: d.templateName,
        subjectTemplate: d.subjectTemplate,
        bodyHtmlTemplate: d.bodyHtmlTemplate,
        bodyTextTemplate: d.bodyTextTemplate ?? null,
        module: d.module ?? 'system',
        languageCode: d.languageCode ?? 'en',
        isActive: d.isActive ?? true,
        updatedBy: user.id, updatedByName: user.name, updatedDate: new Date(), lastUpdatedDate: new Date(),
      }
      if (d.id) {
        await tx.update(emailTemplates).set(values).where(eq(emailTemplates.id, d.id))
      } else {
        await tx.insert(emailTemplates).values({
          tenantId: TENANT_ID, ...values, createdBy: user.id, createdByName: user.name,
        })
      }
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB', eventType: 'COMMUNICATION.TEMPLATE.SAVED',
        resourceType: 'email_templates', resourceId: d.id,
        metadata: { templateCode: d.templateCode, languageCode: d.languageCode ?? 'en' },
      }, tx)
    })
    revalidatePath('/settings/communication')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' }
  }
}

// ── Test email ────────────────────────────────────────────────────────────────
export async function sendTestEmailAction(input: unknown): Promise<Result> {
  let user
  try {
    user = await requireRole([...ADMIN_ROLES])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Forbidden' }
  }
  const schema = z.object({
    providerType: z.enum(['GRAPH_API', 'SMTP']),
    recipient: z.string().email().max(320),
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid recipient or provider' }
  const { providerType, recipient } = parsed.data

  try {
    const policy = validateEmailDeliveryPolicy(recipient)
    if (!policy.allowed) {
      await db.transaction(async (tx) => {
        await writeAuditLog({
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          channel: 'WEB',
          eventType: EMAIL_DELIVERY_REJECTION_EVENT,
          resourceType: 'email_provider_settings',
          metadata: emailDeliveryPolicyMetadata(recipient, policy, 'sendTestEmailAction', {
            providerType,
          }),
        }, tx)
      })
      return { ok: false, error: policy.error }
    }

    const [row] = await db.select().from(emailProviderSettings).where(and(
      eq(emailProviderSettings.tenantId, TENANT_ID),
      eq(emailProviderSettings.providerType, providerType),
    )).limit(1)
    if (!row) return { ok: false, error: 'Provider is not configured yet' }

    const result = await svcSendTestEmail(row, recipient, {
      id: user.id,
      name: user.name,
      role: user.role,
    })

    if (result.rejectedByPolicy) {
      return { ok: false, error: result.error ?? 'Email delivery rejected by policy' }
    }

    await db.transaction(async (tx) => {
      await tx.update(emailProviderSettings).set({
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? 'PASSED' : 'FAILED',
        lastTestError: result.ok ? null : (result.error ?? 'Unknown error').slice(0, 2000),
        updatedBy: user.id, updatedByName: user.name, updatedDate: new Date(),
      }).where(eq(emailProviderSettings.id, row.id))

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB', eventType: 'COMMUNICATION.TEST_EMAIL',
        resourceType: 'email_provider_settings', resourceId: row.id,
        metadata: { providerType, recipientDomain: recipient.split('@')[1], success: result.ok },
      }, tx)
    })

    revalidatePath('/settings/communication')
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Test failed' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Test failed' }
  }
}

// ── Retry a failed message ────────────────────────────────────────────────────
export async function retryEmailMessageAction(messageId: string): Promise<Result> {
  let user
  try {
    user = await requireRole([...ADMIN_ROLES])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Forbidden' }
  }
  const id = z.string().uuid().safeParse(messageId)
  if (!id.success) return { ok: false, error: 'Invalid message id' }

  const r = await svcRetry(id.data)
  if (r.ok) {
    await writeAuditLog({
      actorId: user.id, actorName: user.name, actorRole: user.role,
      channel: 'WEB', eventType: 'COMMUNICATION.EMAIL.RETRY',
      resourceType: 'email_messages', resourceId: id.data,
    })
    revalidatePath('/settings/communication')
  }
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Retry failed' }
}
