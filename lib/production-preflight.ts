/**
 * Production configuration preflight validator (production-readiness foundation).
 *
 * ADDITIVE & SAFE: a PURE function — no side effects, no DB, no network. It does
 * not change runtime behaviour anywhere on its own; it is a check you can call
 * from a health/readiness endpoint, a deploy gate, or a local script.
 *
 * It encodes the production config expectations from
 * docs/environment/PRODUCTION-SECURITY-CONFIG-CHECKLIST.md so unsafe production
 * combinations are visible (errors) and weak ones are flagged (warnings).
 *
 * UAT exceptions (demo accounts, dev login, local storage) are allowed in
 * DEV/UAT and are ONLY errors when the environment is production.
 */

export interface PreflightResult {
  ok: boolean
  environment: 'production' | 'non-production'
  errors: string[]
  warnings: string[]
}

type Env = Record<string, string | undefined>

function isProductionEnv(env: Env): boolean {
  return (
    env.DATABASE_ENV === 'production' ||
    (env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production')
  )
}

/**
 * Validate production configuration. In non-production it returns ok:true with
 * advisory notes only; in production it enforces the critical controls as errors.
 * Does NOT read secrets' values — only presence/shape.
 */
export function validateProductionConfig(env: Env = process.env): PreflightResult {
  const prod = isProductionEnv(env)
  const errors: string[] = []
  const warnings: string[] = []
  const need = (key: string, msg: string) => { if (!env[key]) (prod ? errors : warnings).push(`${key} not set — ${msg}`) }

  // ── Always-on hygiene ────────────────────────────────────────────────────
  need('AUTH_SECRET', 'auth/session signing key required')
  need('DATABASE_URL', 'database connection required')
  need('ENCRYPTION_KEY', 'PII field encryption key required')

  if (!prod) {
    return { ok: true, environment: 'non-production', errors, warnings }
  }

  // ── Production-only critical controls ─────────────────────────────────────
  // Demo/dev accounts must be off in production.
  if (env.ENABLE_DEV_ACCOUNTS === 'true') {
    errors.push('ENABLE_DEV_ACCOUNTS=true is forbidden in production (would enable demo/dev logins)')
  }
  // Durable document storage must be explicitly configured (no local /tmp).
  const storage = env.DOCUMENT_STORAGE_PROVIDER
  if (!storage || !['azure', 'aws', 's3', 'postgres', 'db'].includes(storage)) {
    errors.push("DOCUMENT_STORAGE_PROVIDER must be a durable provider (azure|aws|postgres) in production — not local/unset")
  }
  // Cron protection.
  need('CRON_SECRET', 'cron endpoints must be authenticated in production')
  // Entra / MFA for high-privilege roles.
  need('AUTH_MICROSOFT_ENTRA_ID_TENANT_ID', 'Entra MFA required for HIGH_PRIVILEGE_ROLES in production')
  need('AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID', 'Entra app required in production')
  // Public URL must not be localhost.
  if (!env.NEXT_PUBLIC_APP_URL || /localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_APP_URL)) {
    errors.push('NEXT_PUBLIC_APP_URL must be the production URL (not localhost) in production')
  }
  // Monitoring: error tracking abstraction exists (lib/monitoring.ts) and is wired
  // into cron failures; a real provider is recommended for production alerting.
  if (!env.MONITORING_PROVIDER) {
    warnings.push('MONITORING_PROVIDER not set — cron/critical failures fall back to structured platform logs only; wire a provider (Sentry/Datadog/App Insights) + alert routing (see MONITORING-READINESS.md)')
  }

  // ── Payroll feature-gate — Core HR-only first release ─────────────────────
  // Authoritative gate is PAYROLL_WORKSTREAM_ENABLED (server). For a non-payroll
  // release it must be explicitly disabled (unset or 'false').
  if (env.PAYROLL_WORKSTREAM_ENABLED === 'true') {
    warnings.push("PAYROLL_WORKSTREAM_ENABLED=true — payroll is ENABLED in production; confirm full payroll UAT + Payroll Owner sign-off before go-live (Core HR-only release expects this unset/false)")
  } else if (env.PAYROLL_WORKSTREAM_ENABLED && env.PAYROLL_WORKSTREAM_ENABLED !== 'false') {
    warnings.push(`PAYROLL_WORKSTREAM_ENABLED='${env.PAYROLL_WORKSTREAM_ENABLED}' is not a recognised value — gate fails closed (disabled); set explicitly to 'false' for the Core HR-only release`)
  }
  // Cosmetic client mirror must not contradict the authoritative server gate.
  const serverPayroll = env.PAYROLL_WORKSTREAM_ENABLED === 'true'
  const clientPayroll = env.NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED === 'true'
  if (clientPayroll && !serverPayroll) {
    errors.push('NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED=true while server gate PAYROLL_WORKSTREAM_ENABLED is not "true" — payroll nav would show but actions/routes are blocked; align both flags')
  } else if (serverPayroll && !clientPayroll) {
    warnings.push('PAYROLL_WORKSTREAM_ENABLED=true but NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED is not "true" — payroll works by URL/action but is hidden from nav; set the public flag at BUILD time and rebuild to surface it')
  }

  // ── Email production-delivery readiness ───────────────────────────────────
  // EMAIL_DELIVERY_MODE: 'disabled' | 'allowlist' (test) | 'live' (production).
  const emailMode = env.EMAIL_DELIVERY_MODE
  if (emailMode === 'live') {
    // delivery-policy.ts already enforces this at runtime — surface it pre-deploy.
    if (env.DATABASE_ENV !== 'production') {
      errors.push("EMAIL_DELIVERY_MODE=live requires DATABASE_ENV=production (live email is blocked otherwise)")
    }
    // A sender identity must be configured (SMTP fallback or admin-configured provider).
    if (!env.SMTP_FROM) {
      warnings.push('EMAIL_DELIVERY_MODE=live but SMTP_FROM unset — ensure a verified sender/domain (SPF/DKIM) is configured via the admin communication platform or SMTP_FROM')
    }
  } else if (emailMode === 'allowlist') {
    errors.push("EMAIL_DELIVERY_MODE=allowlist is a DEV/UAT test mode — must not be active in production; set 'live' (configured) or 'disabled'")
  } else {
    warnings.push("EMAIL_DELIVERY_MODE not 'live' — outbound email is disabled in production; configure provider/sender + set 'live' when ready (P-9)")
  }

  return { ok: errors.length === 0, environment: 'production', errors, warnings }
}
