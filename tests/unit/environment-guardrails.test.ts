import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  areDevAccountsAllowed,
  getEnvironmentGovernanceMode,
  isEmailRecipientInAllowlist,
  isProductionComparisonRequired,
  validateEmailDeliveryRecipient,
} from '@/lib/environment-guardrails'

const ROOT = path.resolve(__dirname, '../..')
const GUARD = path.join(ROOT, 'scripts/guard-db-write.js')

function runGuard(overrides: Record<string, string | undefined>) {
  const env = {
    ...process.env,
    DATABASE_URL: '',
    PROD_DATABASE_URL: '',
    DATABASE_ENV: '',
    ALLOW_PRODUCTION_DB_WRITE: 'false',
    ALLOW_NON_PROD_CLOUD_DB_WRITE: 'false',
    ALLOW_UAT_RELOAD_WRITE: 'false',
    DB_WRITE_OPERATION: 'generic',
    ...overrides,
  }
  return spawnSync(process.execPath, [GUARD], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  })
}

describe('environment guardrails', () => {
  it('blocks demo accounts when DATABASE_ENV=production even if explicitly enabled', () => {
    expect(areDevAccountsAllowed({
      DATABASE_ENV: 'production',
      ENABLE_DEV_ACCOUNTS: 'true',
      NODE_ENV: 'development',
    })).toBe(false)
  })

  it('allows demo accounts in approved non-production environments when explicitly enabled', () => {
    expect(areDevAccountsAllowed({
      DATABASE_ENV: 'uat',
      ENABLE_DEV_ACCOUNTS: 'true',
      NODE_ENV: 'production',
    })).toBe(true)
  })

  it('defaults to single active DEV/UAT governance mode', () => {
    expect(getEnvironmentGovernanceMode({})).toBe('single-dev-uat')
    expect(isProductionComparisonRequired({})).toBe(false)
    expect(isProductionComparisonRequired({ ENV_GOVERNANCE_MODE: 'uat-prod' })).toBe(true)
  })

  it('requires an allowlist when EMAIL_DELIVERY_MODE=allowlist', () => {
    const result = validateEmailDeliveryRecipient('employee@avaniis.dev', {
      DATABASE_ENV: 'uat',
      EMAIL_DELIVERY_MODE: 'allowlist',
      EMAIL_TEST_ALLOWLIST: '',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('EMAIL_TEST_ALLOWLIST_REQUIRED')
  })

  it('matches email allowlist by exact email or domain', () => {
    expect(isEmailRecipientInAllowlist('employee@avaniis.dev', ['employee@avaniis.dev'])).toBe(true)
    expect(isEmailRecipientInAllowlist('manager@avaniis.dev', ['avaniis.dev'])).toBe(true)
    expect(isEmailRecipientInAllowlist('hr@test.avaniis.dev', ['*.avaniis.dev'])).toBe(true)
    expect(isEmailRecipientInAllowlist('external@example.com', ['avaniis.dev'])).toBe(false)
  })

  it('blocks live email mode outside production DATABASE_ENV', () => {
    const result = validateEmailDeliveryRecipient('employee@avaniis.dev', {
      DATABASE_ENV: 'uat',
      EMAIL_DELIVERY_MODE: 'live',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('EMAIL_LIVE_MODE_REQUIRES_PRODUCTION_DATABASE_ENV')
  })
})

describe('guard-db-write.js', () => {
  it('fails closed when DATABASE_ENV is missing', () => {
    const r = runGuard({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev',
      DATABASE_ENV: '',
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('DATABASE_ENV is required')
  })

  it('allows local writes only when DATABASE_ENV is classified', () => {
    const r = runGuard({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev',
      DATABASE_ENV: 'development',
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('local host')
  })

  it('blocks production reload/clear even with production override', () => {
    const r = runGuard({
      DATABASE_URL: 'postgresql://u:p@ep-empty-boat-prod.eu-central-1.aws.neon.tech/neondb',
      PROD_DATABASE_URL: 'postgresql://u:p@ep-empty-boat-prod.eu-central-1.aws.neon.tech/neondb',
      DATABASE_ENV: 'production',
      ALLOW_PRODUCTION_DB_WRITE: 'true',
      DB_WRITE_OPERATION: 'reload',
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('RELOAD/CLEAR BLOCKED')
  })

  it('allows current single DEV/UAT cloud writes without a production URL', () => {
    const r = runGuard({
      ENV_GOVERNANCE_MODE: 'single-dev-uat',
      DATABASE_URL: 'postgresql://u:p@ep-active-uat.eu-central-1.aws.neon.tech/neondb',
      DATABASE_ENV: 'uat',
      ALLOW_NON_PROD_CLOUD_DB_WRITE: 'true',
    })
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('single-dev-uat')
  })

  it('allows future split-mode non-production cloud writes only with host comparison flags', () => {
    const r = runGuard({
      ENV_GOVERNANCE_MODE: 'uat-prod',
      DATABASE_URL: 'postgresql://u:p@ep-uat-branch.eu-central-1.aws.neon.tech/neondb',
      PROD_DATABASE_URL: 'postgresql://u:p@ep-empty-boat-prod.eu-central-1.aws.neon.tech/neondb',
      DATABASE_ENV: 'uat',
      ALLOW_NON_PROD_CLOUD_DB_WRITE: 'true',
    })
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('NON-PRODUCTION CLOUD DATABASE WRITE')
  })

  it('requires ALLOW_UAT_RELOAD_WRITE for non-production reload/clear operations', () => {
    const base = {
      ENV_GOVERNANCE_MODE: 'single-dev-uat',
      DATABASE_URL: 'postgresql://u:p@ep-uat-branch.eu-central-1.aws.neon.tech/neondb',
      DATABASE_ENV: 'uat',
      ALLOW_NON_PROD_CLOUD_DB_WRITE: 'true',
      DB_WRITE_OPERATION: 'reload',
    }
    const blocked = runGuard(base)
    expect(blocked.status).toBe(1)
    expect(blocked.stderr).toContain('ALLOW_UAT_RELOAD_WRITE=true')

    const allowed = runGuard({ ...base, ALLOW_UAT_RELOAD_WRITE: 'true' })
    expect(allowed.status).toBe(0)
  })
})
