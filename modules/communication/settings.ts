/**
 * Runtime resolution of the admin-configured provider + sender defaults.
 * Server-only: decrypts secrets and constructs the active EmailProvider.
 */
import 'server-only'
import { and, eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { decryptNullable } from '@/lib/encryption'
import {
  emailProviderSettings,
  emailSenderDefaults,
} from '@/drizzle/schema/communication'
import type { EmailProvider, ResolvedProviderConfig, ProviderType } from './providers/types'
import { GraphEmailProvider } from './providers/graph'
import { SmtpEmailProvider } from './providers/smtp'

export type ProviderSettingsRow = typeof emailProviderSettings.$inferSelect
export type SenderDefaultsRow = typeof emailSenderDefaults.$inferSelect

/** Decrypt a settings row into a config the providers can consume. */
export function toResolvedConfig(row: ProviderSettingsRow): ResolvedProviderConfig {
  return {
    providerType: row.providerType,
    graphTenantId: row.graphTenantId,
    graphClientId: row.graphClientId,
    graphClientSecret: decryptNullable(row.graphClientSecretEnc),
    graphSenderMailbox: row.graphSenderMailbox,
    graphSenderName: row.graphSenderName,
    graphAuthorityUrl: row.graphAuthorityUrl,
    graphBaseUrl: row.graphBaseUrl,
    graphMailSendEndpoint: row.graphMailSendEndpoint,
    graphScope: row.graphScope,
    graphUseSharedMailbox: row.graphUseSharedMailbox,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUsername: row.smtpUsername,
    smtpPassword: decryptNullable(row.smtpPasswordEnc),
    smtpEncryption: row.smtpEncryption,
    smtpSenderEmail: row.smtpSenderEmail,
    smtpSenderName: row.smtpSenderName,
    smtpAuthRequired: row.smtpAuthRequired,
    replyToEmail: row.replyToEmail,
  }
}

export function buildProvider(config: ResolvedProviderConfig): EmailProvider {
  return config.providerType === 'GRAPH_API'
    ? new GraphEmailProvider(config)
    : new SmtpEmailProvider(config)
}

/** The active provider settings row, or null if none configured/active. */
export async function getActiveProviderRow(
  tenantId: string = TENANT_ID,
): Promise<ProviderSettingsRow | null> {
  const [row] = await db
    .select()
    .from(emailProviderSettings)
    .where(and(
      eq(emailProviderSettings.tenantId, tenantId),
      eq(emailProviderSettings.isActive, true),
    ))
    .orderBy(desc(emailProviderSettings.updatedDate))
    .limit(1)
  return row ?? null
}

/** Build the active provider instance, or null if none active. */
export async function getActiveProvider(
  tenantId: string = TENANT_ID,
): Promise<{ provider: EmailProvider; row: ProviderSettingsRow } | null> {
  const row = await getActiveProviderRow(tenantId)
  if (!row) return null
  return { provider: buildProvider(toResolvedConfig(row)), row }
}

export async function getSenderDefaults(
  tenantId: string = TENANT_ID,
): Promise<SenderDefaultsRow | null> {
  const [row] = await db
    .select()
    .from(emailSenderDefaults)
    .where(eq(emailSenderDefaults.tenantId, tenantId))
    .orderBy(desc(emailSenderDefaults.updatedDate))
    .limit(1)
  return row ?? null
}

/** Resolve the from-email for a given module using sender-default overrides. */
export function resolveModuleSender(
  defaults: SenderDefaultsRow | null,
  module: string | null | undefined,
): { fromEmail?: string; fromName?: string; replyTo?: string } {
  if (!defaults) return {}
  const map: Record<string, string | null> = {
    hr: defaults.hrSender,
    absence: defaults.workflowSender,
    workflow: defaults.workflowSender,
    payroll: defaults.payrollSender,
    system: defaults.systemSender,
    engagement: defaults.announcementSender,
  }
  const fromEmail = (module && map[module]) || defaults.defaultFromEmail || defaults.fallbackSender || undefined
  return {
    fromEmail: fromEmail ?? undefined,
    fromName: defaults.defaultFromName ?? undefined,
    replyTo: defaults.defaultReplyTo ?? undefined,
  }
}
