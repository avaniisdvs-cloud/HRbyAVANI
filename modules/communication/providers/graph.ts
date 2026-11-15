/**
 * Microsoft Graph API email provider.
 *
 * Uses the OAuth2 client-credentials flow (raw fetch to the configurable
 * authority token endpoint — no SDK dependency) to obtain an app-only token,
 * then POSTs to the configurable Graph sendMail endpoint.
 *
 * All endpoints/authority/scope are admin-configurable (Section 3) so the
 * platform works against commercial, GCC-High, or sovereign Graph clouds.
 */
import 'server-only'
import type {
  EmailProvider,
  OutboundEmail,
  ProviderSendResult,
  ResolvedProviderConfig,
} from './types'

const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com'
const DEFAULT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const DEFAULT_SCOPE = 'https://graph.microsoft.com/.default'

export class GraphEmailProvider implements EmailProvider {
  readonly type = 'GRAPH_API' as const
  constructor(private readonly cfg: ResolvedProviderConfig) {}

  private tokenUrl(): string {
    const authority = (this.cfg.graphAuthorityUrl || DEFAULT_AUTHORITY).replace(/\/+$/, '')
    const tenant = this.cfg.graphTenantId
    if (!tenant) throw new Error('Graph Tenant ID is not configured')
    return `${authority}/${tenant}/oauth2/v2.0/token`
  }

  private sendUrl(): string {
    if (this.cfg.graphMailSendEndpoint) return this.cfg.graphMailSendEndpoint
    const base = (this.cfg.graphBaseUrl || DEFAULT_GRAPH_BASE).replace(/\/+$/, '')
    const mailbox = this.cfg.graphSenderMailbox
    if (!mailbox) throw new Error('Graph Sender Mailbox is not configured')
    return `${base}/users/${encodeURIComponent(mailbox)}/sendMail`
  }

  private async getToken(): Promise<string> {
    if (!this.cfg.graphClientId || !this.cfg.graphClientSecret) {
      throw new Error('Graph Client ID / Secret is not configured')
    }
    const body = new URLSearchParams({
      client_id:     this.cfg.graphClientId,
      client_secret: this.cfg.graphClientSecret,
      scope:         this.cfg.graphScope || DEFAULT_SCOPE,
      grant_type:    'client_credentials',
    })
    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const detail = await safeError(res)
      throw new Error(`Graph token request failed (${res.status}): ${detail}`)
    }
    const json = (await res.json()) as { access_token?: string }
    if (!json.access_token) throw new Error('Graph token response missing access_token')
    return json.access_token
  }

  async send(email: OutboundEmail): Promise<ProviderSendResult> {
    try {
      const token = await this.getToken()
      const payload = {
        message: {
          subject: email.subject,
          body: { contentType: 'HTML', content: email.html },
          toRecipients: [{ emailAddress: { address: email.to, name: email.toName } }],
          ...(email.replyTo || this.cfg.replyToEmail
            ? { replyTo: [{ emailAddress: { address: email.replyTo || this.cfg.replyToEmail! } }] }
            : {}),
        },
        saveToSentItems: true,
      }
      const res = await fetch(this.sendUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      // Graph sendMail returns 202 Accepted with empty body on success.
      if (res.status === 202 || res.ok) {
        return { success: true, providerMessageId: res.headers.get('request-id') ?? undefined }
      }
      return { success: false, error: `Graph sendMail failed (${res.status}): ${await safeError(res)}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getToken() // proves tenant/client/secret/scope + connectivity
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

/** Reads an error body WITHOUT leaking secrets (Graph never echoes our secret). */
async function safeError(res: Response): Promise<string> {
  try {
    const txt = await res.text()
    return txt.slice(0, 500)
  } catch {
    return res.statusText
  }
}
