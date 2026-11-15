/**
 * Email provider abstraction — the contract every transport implements.
 * Server-only. Concrete providers: GraphEmailProvider, SmtpEmailProvider.
 */
import 'server-only'

export type ProviderType = 'GRAPH_API' | 'SMTP'

/** Resolved, DECRYPTED provider configuration handed to a provider instance. */
export interface ResolvedProviderConfig {
  providerType: ProviderType

  // Graph (decrypted secret)
  graphTenantId?: string | null
  graphClientId?: string | null
  graphClientSecret?: string | null
  graphSenderMailbox?: string | null
  graphSenderName?: string | null
  graphAuthorityUrl?: string | null
  graphBaseUrl?: string | null
  graphMailSendEndpoint?: string | null
  graphScope?: string | null
  graphUseSharedMailbox?: boolean | null

  // SMTP (decrypted password)
  smtpHost?: string | null
  smtpPort?: number | null
  smtpUsername?: string | null
  smtpPassword?: string | null
  smtpEncryption?: 'NONE' | 'SSL' | 'TLS' | 'STARTTLS' | null
  smtpSenderEmail?: string | null
  smtpSenderName?: string | null
  smtpAuthRequired?: boolean | null

  replyToEmail?: string | null
}

export interface OutboundEmail {
  to: string
  toName?: string
  subject: string
  html: string
  text?: string
  fromEmail?: string
  fromName?: string
  replyTo?: string
}

export interface ProviderSendResult {
  success: boolean
  providerMessageId?: string
  error?: string
}

export interface EmailProvider {
  readonly type: ProviderType
  send(email: OutboundEmail): Promise<ProviderSendResult>
  /** Lightweight credential / connectivity check used by Test Email + activation. */
  verify(): Promise<{ ok: boolean; error?: string }>
}
