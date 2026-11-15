/**
 * Security Static Analysis Tests
 *
 * These tests scan source code for security anti-patterns and verify that
 * NFR-09 (MFA), NFR-10 (session timeout), and NFR-22 (audit immutability)
 * requirements are addressed in code — without requiring a live server.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = []
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full)
      } else if (entry.isFile() && (entry.name.endsWith(ext) || ext === '*')) {
        results.push(full)
      }
    }
  }
  walk(path.join(ROOT, dir))
  return results
}

function getServerActionFiles(): string[] {
  return [
    ...findFiles('modules', '.ts'),
    ...findFiles('lib', '.ts'),
  ].filter(f => !f.includes('.test.') && !f.includes('node_modules'))
}

// ── NFR-09 — MFA mandatory for HR_ADMIN+ ─────────────────────────────────────

describe('NFR-09 — MFA enforcement', () => {
  it('JWT type carries a step-up MFA claim (in types or auth)', () => {
    const authTs = readFile('lib/auth.ts')
    const coreHrTypes = readFile('modules/core-hr/types.ts')
    // MFA claim may be in types.ts (step-up claim on SessionUser) rather than auth.ts
    const hasMfaOrStepUp =
      /mfa|stepUp|step.up|totp|otp|two.factor/i.test(authTs) ||
      /mfa|stepUp|step.up|totp|otp|two.factor/i.test(coreHrTypes)
    expect(
      hasMfaOrStepUp,
      'NFR-09 FAIL: No MFA/step-up claim found in auth.ts or core-hr/types.ts — required for HR_ADMIN+ per NFR-09'
    ).toBe(true)
  })

  it('MFA step-up is typed in SessionUser or JWT types', () => {
    const coreHrTypes = readFile('modules/core-hr/types.ts')
    const hasMfaClaim = /stepUp|step_up|mfa|MFA/i.test(coreHrTypes)
    expect(
      hasMfaClaim,
      'No MFA/step-up claim found in core-hr types — JWT must carry a step-up claim per S3-10'
    ).toBe(true)
  })

  it('MFA is documented as NOT enforced in Phase 1 (known gap)', () => {
    const coreHrServices = readFile('modules/core-hr/services.ts')
    const documentsPhase1Deferral = /phase 1|Phase 1|sprint.*11|Sprint.*11|step.up.*MFA/i.test(coreHrServices)
    // This test DOCUMENTS the gap — it passes to acknowledge the known deferral
    expect(documentsPhase1Deferral, 'MFA deferral not documented in services — add a comment').toBe(true)
  })
})

// ── NFR-10 — Session timeout ──────────────────────────────────────────────────

describe('NFR-10 — Session timeout configuration', () => {
  it('auth.ts configures a session maxAge', () => {
    const authTs = readFile('lib/auth.ts')
    const hasMaxAge = /maxAge|max_age|expires|sessionExpiry/i.test(authTs)
    // FAIL if no maxAge is set — default Auth.js JWT = 30 days, violates NFR-10
    expect(
      hasMaxAge,
      'NFR-10 FAIL: No session maxAge configured in lib/auth.ts. ' +
      'Default Auth.js JWT TTL is 30 days. Required: 30 min (employee) / 15 min (admin).'
    ).toBe(true)
  })

  it('employee session timeout does not exceed 30 minutes (1800s)', () => {
    const authTs = readFile('lib/auth.ts')
    // Extract any numeric maxAge value
    const match = authTs.match(/maxAge\s*:\s*(\d+)/)
    if (!match) {
      // No maxAge found — fails the previous test, skip this assertion
      return
    }
    const seconds = parseInt(match[1], 10)
    expect(
      seconds,
      `NFR-10 FAIL: session maxAge is ${seconds}s (${seconds / 60} min) — must be ≤ 1800s (30 min) for employees`
    ).toBeLessThanOrEqual(1800)
  })
})

// ── NFR-22 — Audit log immutability ──────────────────────────────────────────

describe('NFR-22 — Audit log immutability and 7-year retention', () => {
  it('writeAuditLog never performs UPDATE or DELETE on audit_log table', () => {
    const auditTs = readFile('lib/audit.ts')
    // writeAuditLog should only contain INSERT (db.insert)
    const hasUpdate = /db\.update\s*\(\s*auditLog\b/i.test(auditTs)
    const hasDelete = /db\.delete\s*\(\s*auditLog\b/i.test(auditTs)
    expect(hasUpdate, 'NFR-22 FAIL: lib/audit.ts contains db.update(auditLog) — audit rows must be immutable').toBe(false)
    expect(hasDelete, 'NFR-22 FAIL: lib/audit.ts contains db.delete(auditLog) — audit rows must be immutable').toBe(false)
  })

  it('no module action files perform DELETE on audit_log', () => {
    const actionFiles = getServerActionFiles().filter(f => f.endsWith('actions.ts'))
    const violators: string[] = []
    for (const f of actionFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      if (/db\.delete.*auditLog|delete.*from.*audit_log/i.test(content)) {
        violators.push(f.replace(ROOT + '/', ''))
      }
    }
    expect(
      violators,
      `NFR-22 FAIL: These files delete from audit_log: ${violators.join(', ')}`
    ).toHaveLength(0)
  })

  it('retention-policy.ts exists and references 7-year retention', () => {
    const retentionTs = readFile('lib/retention-policy.ts')
    const has7Year = /7\s*year|seven.*year|2557|84.*month/i.test(retentionTs)
    expect(
      has7Year,
      'NFR-22 FAIL: lib/retention-policy.ts does not reference 7-year retention period'
    ).toBe(true)
  })
})

// ── Security headers (NFR — defence in depth) ────────────────────────────────

describe('Security headers', () => {
  it('next.config.mjs should define Content-Security-Policy headers', () => {
    const nextConfig = readFile('next.config.mjs')
    const hasCSP = /Content-Security-Policy|contentSecurityPolicy|headers\s*\(\)/i.test(nextConfig)
    // This FAILS by design — CSP is listed as a known gap in docs/KNOWN_GAPS.md
    expect(
      hasCSP,
      'SEC-HDR FAIL: Content-Security-Policy is not configured in next.config.mjs (Known Gap #11)'
    ).toBe(true)
  })

  it('next.config.mjs should define X-Frame-Options or frame-ancestors CSP', () => {
    const nextConfig = readFile('next.config.mjs')
    const hasFrameOptions = /X-Frame-Options|frame-ancestors/i.test(nextConfig)
    expect(
      hasFrameOptions,
      'SEC-HDR FAIL: X-Frame-Options not set — clickjacking risk (Known Gap #11)'
    ).toBe(true)
  })
})

// ── RBAC guard coverage ───────────────────────────────────────────────────────

describe('RBAC — server action guard coverage', () => {
  it('all live (non-skeleton) server action files call requireRole or auth()', () => {
    const actionFiles = findFiles('modules', '.ts')
      .filter(f => f.endsWith('actions.ts') && !f.includes('.test.') && !f.includes('node_modules'))

    const unguarded: string[] = []
    for (const f of actionFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      const hasServerDirective = content.includes('"use server"') || content.includes("'use server'")
      if (!hasServerDirective) continue

      // Skip skeleton files (export {} with no real functions)
      const hasFunctions = /export\s+async\s+function\s+\w/.test(content)
      if (!hasFunctions) continue

      const hasGuard =
        /requireRole/.test(content) ||
        /getCurrentUser/.test(content) ||
        /auth\(\)/.test(content)

      if (!hasGuard) {
        unguarded.push(f.replace(ROOT + '/', ''))
      }
    }
    expect(
      unguarded,
      `RBAC FAIL: These live server action files have no auth guard:\n${unguarded.join('\n')}`
    ).toHaveLength(0)
  })
})

// ── DEV credentials provider ─────────────────────────────────────────────────

describe('Dev credentials provider', () => {
  it('DEV_ADMIN_EMAIL credentials provider should be conditional on NODE_ENV !== production', () => {
    const authTs = readFile('lib/auth.ts')
    const hasDevCredentials = /DEV_ADMIN_EMAIL|credentials\s*\(/i.test(authTs)
    if (!hasDevCredentials) {
      // No dev credentials found — safe
      expect(true).toBe(true)
      return
    }
    // Dev credentials exist — they MUST be gated on non-production.
    // 2026-06-12: gating moved from inline NODE_ENV checks in auth.ts to the
    // centralised guardrail areDevAccountsAllowed() (lib/environment-guardrails.ts),
    // which is STRICTER: it returns false when DATABASE_ENV=production, when
    // VERCEL_ENV=production without DATABASE_ENV, and otherwise requires
    // NODE_ENV=development or ENABLE_DEV_ACCOUNTS=true. Accept either the
    // legacy inline gate or the guardrail call — and when the guardrail is
    // used, verify the guardrail itself contains the production checks.
    const inlineGate = /NODE_ENV.*production|process\.env\.NODE_ENV/i.test(authTs)
    const usesGuardrail = /areDevAccountsAllowed\s*\(/.test(authTs)
    let guardrailGate = false
    if (usesGuardrail) {
      const guardrails = readFile('lib/environment-guardrails.ts')
      guardrailGate =
        /isProductionDatabaseEnv\([^)]*\)\)\s*return false/.test(guardrails) &&
        /NODE_ENV\s*===\s*'development'|env\.NODE_ENV/.test(guardrails)
    }
    expect(
      inlineGate || guardrailGate,
      'SEC-CRED FAIL: DEV_ADMIN_EMAIL credentials provider is not gated on non-production (Known Gap #2) — neither inline NODE_ENV gate nor areDevAccountsAllowed() guardrail found'
    ).toBe(true)
  })
})

// ── SQL injection risk — sql.raw usage ───────────────────────────────────────

describe('SQL injection — sql.raw audit', () => {
  it('sql.raw usage is sourced from internal DB row IDs (not user input)', () => {
    const processDriver = readFile('lib/jobs/process-driver.ts')
    // processedIds come from db.select() results, not from user input
    // Confirm the source is a local DB read
    const sourceIsInternal = /processedIds\s*=\s*\[/.test(processDriver) &&
      /actionable\.map/.test(processDriver)
    expect(
      sourceIsInternal,
      'sql.raw in process-driver.ts should be sourced from internal DB IDs only'
    ).toBe(true)
  })
})

// ── dangerouslySetInnerHTML audit ─────────────────────────────────────────────

describe('XSS — dangerouslySetInnerHTML audit', () => {
  it('themeScript injected via dangerouslySetInnerHTML contains no user-controlled data', () => {
    const layoutTs = readFile('app/layout.tsx')
    // Extract the themeScript content
    const scriptMatch = layoutTs.match(/const themeScript\s*=\s*`([\s\S]*?)`/)
    expect(scriptMatch, 'themeScript should be defined as a template literal').toBeTruthy()
    if (scriptMatch) {
      const scriptContent = scriptMatch[1]
      // Must NOT interpolate variables from user/DB into script
      const hasInterpolation = /\$\{(?!`)[^`]*\}/.test(scriptContent)
      expect(
        hasInterpolation,
        'XSS RISK: themeScript interpolates runtime values — only static localStorage reads are safe'
      ).toBe(false)
    }
  })
})
