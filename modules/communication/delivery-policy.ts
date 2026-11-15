import {
  validateEmailDeliveryRecipient,
  type EmailDeliveryMode,
} from '@/lib/environment-guardrails'

export const EMAIL_DELIVERY_REJECTION_EVENT = 'COMMUNICATION.EMAIL.REJECTED'

export type EmailDeliveryPolicySource =
  | 'queueEmail'
  | 'dispatchQueued'
  | 'sendTemplateEmail'
  | 'sendTestEmail'
  | 'sendTestEmailAction'
  | 'workflowActionReissue'
  | 'workflowEmailDelegate'

export type EmailDeliveryPolicyResult =
  | { allowed: true; mode: EmailDeliveryMode }
  | { allowed: false; mode: EmailDeliveryMode; reason: string; error: string }

export function emailDeliveryPolicyError(reason?: string): string {
  switch (reason) {
    case 'EMAIL_DELIVERY_DISABLED':
      return 'Email delivery is disabled.'
    case 'EMAIL_TEST_ALLOWLIST_REQUIRED':
      return 'EMAIL_TEST_ALLOWLIST must be configured before sending email.'
    case 'EMAIL_RECIPIENT_NOT_ALLOWLISTED':
      return 'Recipient is not in EMAIL_TEST_ALLOWLIST.'
    case 'EMAIL_LIVE_MODE_REQUIRES_PRODUCTION_DATABASE_ENV':
      return 'Live email delivery requires DATABASE_ENV=production.'
    default:
      return 'Email delivery is not permitted for this recipient.'
  }
}

export function validateEmailDeliveryPolicy(
  recipientEmail: string,
  env: Partial<Record<string, string | undefined>> = process.env,
): EmailDeliveryPolicyResult {
  const result = validateEmailDeliveryRecipient(recipientEmail, env)
  if (result.allowed) return { allowed: true, mode: result.mode }

  return {
    allowed: false,
    mode: result.mode,
    reason: result.reason ?? 'EMAIL_DELIVERY_REJECTED',
    error: emailDeliveryPolicyError(result.reason),
  }
}

export function recipientDomain(recipientEmail: string): string | null {
  const domain = recipientEmail.trim().toLowerCase().split('@')[1]
  return domain || null
}

export function emailDeliveryPolicyMetadata(
  recipientEmail: string,
  policy: EmailDeliveryPolicyResult,
  source: EmailDeliveryPolicySource,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source,
    mode: policy.mode,
    allowed: policy.allowed,
    reason: policy.allowed ? null : policy.reason,
    recipientDomain: recipientDomain(recipientEmail),
    ...extra,
  }
}
