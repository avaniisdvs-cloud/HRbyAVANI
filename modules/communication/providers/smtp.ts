/**
 * SMTP email provider (nodemailer). Works with any RFC-compliant SMTP server
 * (Office 365, Gmail Workspace, SendGrid SMTP relay, on-prem Exchange, etc.).
 */
import 'server-only'
import nodemailer from 'nodemailer'
import type {
  EmailProvider,
  OutboundEmail,
  ProviderSendResult,
  ResolvedProviderConfig,
} from './types'

export class SmtpEmailProvider implements EmailProvider {
  readonly type = 'SMTP' as const
  constructor(private readonly cfg: ResolvedProviderConfig) {}

  private transporter() {
    const port = this.cfg.smtpPort ?? 587
    const enc = this.cfg.smtpEncryption ?? (port === 465 ? 'SSL' : 'STARTTLS')
    if (!this.cfg.smtpHost) throw new Error('SMTP Host is not configured')
    return nodemailer.createTransport({
      host:   this.cfg.smtpHost,
      port,
      secure: enc === 'SSL', // implicit TLS (465); STARTTLS upgrades on 587
      requireTLS: enc === 'TLS' || enc === 'STARTTLS',
      ignoreTLS: enc === 'NONE',
      auth: this.cfg.smtpAuthRequired === false
        ? undefined
        : { user: this.cfg.smtpUsername ?? '', pass: this.cfg.smtpPassword ?? '' },
      tls: { rejectUnauthorized: enc !== 'NONE' },
    })
  }

  private fromHeader(email: OutboundEmail): string {
    const name = email.fromName || this.cfg.smtpSenderName || 'HR'
    const addr = email.fromEmail || this.cfg.smtpSenderEmail || this.cfg.smtpUsername || ''
    return addr ? `${name} <${addr}>` : name
  }

  async send(email: OutboundEmail): Promise<ProviderSendResult> {
    try {
      const info = await this.transporter().sendMail({
        from:    this.fromHeader(email),
        to:      email.toName ? `${email.toName} <${email.to}>` : email.to,
        subject: email.subject,
        html:    email.html,
        text:    email.text,
        replyTo: email.replyTo || this.cfg.replyToEmail || undefined,
      })
      return { success: true, providerMessageId: info.messageId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.transporter().verify()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
