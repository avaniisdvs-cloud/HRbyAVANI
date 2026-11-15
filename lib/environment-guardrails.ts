type EnvMap = Partial<Record<string, string | undefined>>

export type DatabaseEnv = 'development' | 'dev' | 'test' | 'uat' | 'production'
export type EmailDeliveryMode = 'disabled' | 'allowlist' | 'live'
export type EnvironmentGovernanceMode = 'single-dev-uat' | 'uat-prod'

const DATABASE_ENVS = new Set<DatabaseEnv>(['development', 'dev', 'test', 'uat', 'production'])
const NON_PRODUCTION_DATABASE_ENVS = new Set<DatabaseEnv>(['development', 'dev', 'test', 'uat'])
const UAT_DATABASE_ENVS = new Set<DatabaseEnv>(['test', 'uat'])
const EMAIL_DELIVERY_MODES = new Set<EmailDeliveryMode>(['disabled', 'allowlist', 'live'])
const ENVIRONMENT_GOVERNANCE_MODES = new Set<EnvironmentGovernanceMode>(['single-dev-uat', 'uat-prod'])

export function getDatabaseEnv(env: EnvMap = process.env): string {
  return (env.DATABASE_ENV ?? '').trim().toLowerCase()
}

export function isKnownDatabaseEnv(value: string): value is DatabaseEnv {
  return DATABASE_ENVS.has(value as DatabaseEnv)
}

export function isNonProductionDatabaseEnv(value: string): boolean {
  return isKnownDatabaseEnv(value) && NON_PRODUCTION_DATABASE_ENVS.has(value)
}

export function isUatDatabaseEnv(value: string): boolean {
  return isKnownDatabaseEnv(value) && UAT_DATABASE_ENVS.has(value)
}

export function isProductionDatabaseEnv(env: EnvMap = process.env): boolean {
  return getDatabaseEnv(env) === 'production'
}

export function getEnvironmentGovernanceMode(env: EnvMap = process.env): EnvironmentGovernanceMode {
  const raw = (env.ENV_GOVERNANCE_MODE ?? 'single-dev-uat').trim().toLowerCase()
  return ENVIRONMENT_GOVERNANCE_MODES.has(raw as EnvironmentGovernanceMode)
    ? raw as EnvironmentGovernanceMode
    : 'single-dev-uat'
}

export function isProductionComparisonRequired(env: EnvMap = process.env): boolean {
  return getEnvironmentGovernanceMode(env) === 'uat-prod'
}

export function areDevAccountsAllowed(env: EnvMap = process.env): boolean {
  if (isProductionDatabaseEnv(env)) return false
  if (!getDatabaseEnv(env) && env.VERCEL_ENV === 'production') return false
  return env.NODE_ENV === 'development' || env.ENABLE_DEV_ACCOUNTS === 'true'
}

export function getEmailDeliveryMode(env: EnvMap = process.env): EmailDeliveryMode {
  const raw = (env.EMAIL_DELIVERY_MODE ?? 'disabled').trim().toLowerCase()
  return EMAIL_DELIVERY_MODES.has(raw as EmailDeliveryMode) ? raw as EmailDeliveryMode : 'disabled'
}

export function parseEmailTestAllowlist(raw = ''): string[] {
  return raw
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
}

function emailDomain(email: string): string {
  return email.toLowerCase().split('@')[1] ?? ''
}

export function isEmailRecipientInAllowlist(email: string, allowlist: string[]): boolean {
  const normalizedEmail = email.trim().toLowerCase()
  const domain = emailDomain(normalizedEmail)
  if (!normalizedEmail || !domain) return false

  return allowlist.some(entry => {
    if (entry.includes('@') && !entry.startsWith('@')) return entry === normalizedEmail
    if (entry.startsWith('*.')) return domain.endsWith(entry.slice(1))
    const normalizedDomain = entry.startsWith('@') ? entry.slice(1) : entry
    return normalizedDomain === domain
  })
}

export function validateEmailDeliveryRecipient(
  recipientEmail: string,
  env: EnvMap = process.env,
): { allowed: boolean; mode: EmailDeliveryMode; reason?: string } {
  const mode = getEmailDeliveryMode(env)
  if (mode === 'disabled') {
    return { allowed: false, mode, reason: 'EMAIL_DELIVERY_DISABLED' }
  }

  if (mode === 'live') {
    if (!isProductionDatabaseEnv(env)) {
      return { allowed: false, mode, reason: 'EMAIL_LIVE_MODE_REQUIRES_PRODUCTION_DATABASE_ENV' }
    }
    return { allowed: true, mode }
  }

  const allowlist = parseEmailTestAllowlist(env.EMAIL_TEST_ALLOWLIST)
  if (allowlist.length === 0) {
    return { allowed: false, mode, reason: 'EMAIL_TEST_ALLOWLIST_REQUIRED' }
  }
  if (!isEmailRecipientInAllowlist(recipientEmail, allowlist)) {
    return { allowed: false, mode, reason: 'EMAIL_RECIPIENT_NOT_ALLOWLISTED' }
  }
  return { allowed: true, mode }
}
