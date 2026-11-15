/**
 * Employee Letter email sender.
 *
 * Transport priority (first configured wins):
 *   1. Azure Communication Services  — ACS_EMAIL_CONNECTION_STRING is set
 *   2. SMTP (Microsoft 365 / Office 365) — SMTP_HOST + SMTP_USER + SMTP_PASS are set
 *   3. No-op stub — neither configured; returns an explicit error (never silently succeeds)
 */
import nodemailer from 'nodemailer'

// ── ACS (production) ──────────────────────────────────────────────────────────
const ACS_CONNECTION_STRING = process.env.ACS_EMAIL_CONNECTION_STRING
const ACS_SENDER_ADDRESS    = process.env.ACS_EMAIL_SENDER ?? 'noreply@avaniishr.ae'

// ── SMTP (dev / M365) ─────────────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER ?? 'noreply@avaniishr.ae'

type Transport = 'acs' | 'smtp' | 'none'

function resolveTransport(): Transport {
  if (ACS_CONNECTION_STRING) return 'acs'
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return 'smtp'
  return 'none'
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface SendLetterEmailArgs {
  recipientEmail: string
  recipientName:  string
  letterNumber:   string
  letterTypeName: string
  companyName:    string
  pdfBuffer?:     Buffer
  emailFooter?:   string
}

export interface SendResult {
  email:   string
  success: boolean
  error?:  string
}

// ── Single letter email ───────────────────────────────────────────────────────

export async function sendLetterEmail(args: SendLetterEmailArgs): Promise<SendResult> {
  const {
    recipientEmail, recipientName, letterNumber, letterTypeName,
    companyName, pdfBuffer, emailFooter,
  } = args

  const transport = resolveTransport()

  const bodyHtml = `
    <p>Dear ${recipientName},</p>
    <p>Please find attached your ${letterTypeName} (Ref: <strong>${letterNumber}</strong>) from ${companyName}.</p>
    <p>If a digital signature is required, a separate signing link will be sent to you.</p>
    ${emailFooter ? `<br/><p style="color:#666;font-size:12px">${emailFooter}</p>` : ''}
    <br/>
    <p>HR Team<br/>${companyName}</p>
  `.trim()

  const subject = `${letterTypeName} — ${letterNumber}`

  // ── 1. Azure Communication Services ────────────────────────────────────────
  if (transport === 'acs') {
    try {
      const { EmailClient } = await import('@azure/communication-email')
      const client = new EmailClient(ACS_CONNECTION_STRING!)
      const message = {
        senderAddress: ACS_SENDER_ADDRESS,
        recipients: {
          to: [{ address: recipientEmail, displayName: recipientName }],
        },
        content: { subject, html: bodyHtml },
        ...(pdfBuffer ? {
          attachments: [{
            name:            `${letterNumber}.pdf`,
            contentType:     'application/pdf',
            contentInBase64: pdfBuffer.toString('base64'),
          }],
        } : {}),
      }
      const poller = await client.beginSend(message)
      await poller.pollUntilDone()
      return { email: recipientEmail, success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[email/acs] Failed ${letterNumber} → ${recipientEmail}: ${msg}`)
      return { email: recipientEmail, success: false, error: msg }
    }
  }

  // ── 2. SMTP (Microsoft 365 / Office 365) ───────────────────────────────────
  if (transport === 'smtp') {
    try {
      const transporter = nodemailer.createTransport({
        host:   SMTP_HOST,
        port:   SMTP_PORT,
        secure: SMTP_PORT === 465,   // true for port 465, false for 587 (STARTTLS)
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        tls: {
          // Office 365 requires TLS; ciphers default is fine
          rejectUnauthorized: true,
        },
      })

      const mailOptions: nodemailer.SendMailOptions = {
        from:    `AVANIIS HR <${SMTP_FROM}>`,
        to:      `${recipientName} <${recipientEmail}>`,
        subject,
        html:    bodyHtml,
        ...(pdfBuffer ? {
          attachments: [{
            filename:    `${letterNumber}.pdf`,
            content:     pdfBuffer,
            contentType: 'application/pdf',
          }],
        } : {}),
      }

      await transporter.sendMail(mailOptions)
      console.log(`[email/smtp] Sent ${letterNumber} → ${recipientEmail}`)
      return { email: recipientEmail, success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[email/smtp] Failed ${letterNumber} → ${recipientEmail}: ${msg}`)
      return { email: recipientEmail, success: false, error: msg }
    }
  }

  // ── 3. No transport configured ─────────────────────────────────────────────
  console.warn(`[email] No transport configured — email NOT sent to ${recipientEmail}`)
  return {
    email:   recipientEmail,
    success: false,
    error:   'Email service not configured. Set SMTP_HOST + SMTP_USER + SMTP_PASS in .env.local.',
  }
}

// ── Bulk send with failure tracking ──────────────────────────────────────────

export interface BulkSendArgs {
  letters: Array<{
    recipientEmail: string
    recipientName:  string
    letterNumber:   string
    pdfBuffer?:     Buffer
  }>
  letterTypeName: string
  companyName:    string
  emailFooter?:   string
}

export interface BulkSendResult {
  sent:    number
  failed:  number
  results: SendResult[]
}

export async function bulkSendLetterEmails(args: BulkSendArgs): Promise<BulkSendResult> {
  const results = await Promise.allSettled(
    args.letters.map(l =>
      sendLetterEmail({
        recipientEmail: l.recipientEmail,
        recipientName:  l.recipientName,
        letterNumber:   l.letterNumber,
        letterTypeName: args.letterTypeName,
        companyName:    args.companyName,
        pdfBuffer:      l.pdfBuffer,
        emailFooter:    args.emailFooter,
      }),
    ),
  )

  const sendResults: SendResult[] = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { email: args.letters[i].recipientEmail, success: false, error: String((r as PromiseRejectedResult).reason) },
  )

  return {
    sent:    sendResults.filter(r => r.success).length,
    failed:  sendResults.filter(r => !r.success).length,
    results: sendResults,
  }
}
