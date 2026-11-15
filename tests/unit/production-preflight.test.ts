/**
 * Production config preflight — unit tests.
 * Proves: advisory-only in non-production; FAILS CLOSED for unsafe production combos.
 */
import { describe, it, expect } from 'vitest'
import { validateProductionConfig } from '@/lib/production-preflight'

// A baseline of a correctly-configured production environment.
const SAFE_PROD: Record<string, string> = {
  DATABASE_ENV: 'production',
  AUTH_SECRET: 'x',
  DATABASE_URL: 'postgres://x',
  ENCRYPTION_KEY: 'x',
  DOCUMENT_STORAGE_PROVIDER: 'azure',
  CRON_SECRET: 'x',
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: 'x',
  AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID: 'x',
  NEXT_PUBLIC_APP_URL: 'https://hr.avaniis.global',
  MONITORING_PROVIDER: 'sentry',
  PAYROLL_WORKSTREAM_ENABLED: 'false',
  EMAIL_DELIVERY_MODE: 'live',
  SMTP_FROM: 'no-reply@avaniis.global',
}

describe('preflight — non-production is advisory only', () => {
  it('returns ok:true with no errors when not production (even if unsafe-looking)', () => {
    const r = validateProductionConfig({ NODE_ENV: 'development' })
    expect(r.environment).toBe('non-production')
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })
})

describe('preflight — production fails closed', () => {
  it('passes for a correctly configured production env', () => {
    const r = validateProductionConfig(SAFE_PROD)
    expect(r.environment).toBe('production')
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('errors when demo/dev accounts are enabled in production', () => {
    const r = validateProductionConfig({ ...SAFE_PROD, ENABLE_DEV_ACCOUNTS: 'true' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/ENABLE_DEV_ACCOUNTS/)
  })

  it('errors when storage provider is not durable in production', () => {
    const r = validateProductionConfig({ ...SAFE_PROD, DOCUMENT_STORAGE_PROVIDER: '' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/DOCUMENT_STORAGE_PROVIDER/)
  })

  it('errors when CRON_SECRET is missing in production', () => {
    const { CRON_SECRET, ...noCron } = SAFE_PROD
    const r = validateProductionConfig(noCron)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/CRON_SECRET/)
  })

  it('errors when public URL is localhost in production', () => {
    const r = validateProductionConfig({ ...SAFE_PROD, NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/NEXT_PUBLIC_APP_URL/)
  })

  it('errors when live email is set but DATABASE_ENV is not production', () => {
    // DATABASE_ENV drives prod detection; force prod via VERCEL_ENV to isolate the email rule.
    const r = validateProductionConfig({
      ...SAFE_PROD, DATABASE_ENV: 'uat', NODE_ENV: 'production', VERCEL_ENV: 'production',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/EMAIL_DELIVERY_MODE=live requires DATABASE_ENV=production/)
  })

  it('errors when allowlist (test) email mode is active in production', () => {
    const r = validateProductionConfig({ ...SAFE_PROD, EMAIL_DELIVERY_MODE: 'allowlist' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/allowlist is a DEV\/UAT test mode/)
  })

  it('errors when client payroll nav flag contradicts the server gate', () => {
    const r = validateProductionConfig({ ...SAFE_PROD, NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED: 'true' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED/)
  })

  it('warns (not errors) when payroll is enabled in production', () => {
    const r = validateProductionConfig({ ...SAFE_PROD, PAYROLL_WORKSTREAM_ENABLED: 'true' })
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/PAYROLL_WORKSTREAM_ENABLED=true/)
  })

  it('warns (not errors) when server payroll is on but client nav flag is off', () => {
    const r = validateProductionConfig({
      ...SAFE_PROD, PAYROLL_WORKSTREAM_ENABLED: 'true', NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED: 'false',
    })
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/hidden from nav/)
  })
})
