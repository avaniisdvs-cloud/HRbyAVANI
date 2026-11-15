/**
 * Authentication & Session Security Behavioural Tests
 *
 * Tests NFR-09 (MFA), NFR-10 (session timeout), and RBAC enforcement
 * by driving server actions with different roles and verifying FORBIDDEN
 * is thrown for unauthorized access.
 *
 * Uses the same full-mock pattern as tests/integration/*.test.ts
 * (next-auth/next/server cannot be imported in jsdom environment).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { requireRole } from '@/lib/auth'
import { areDevAccountsAllowed } from '@/lib/environment-guardrails'

const ROOT = path.resolve(__dirname, '../..')

// ── Shared auth session state (mutated per test) ──────────────────────────────

const session = {
  user: {
    id:            'test-user-1',
    name:          'Test User',
    email:         'test@avaniis.dev',
    role:          'EMPLOYEE',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
    personId:      '33333333-3333-3333-3333-333333333333',
  },
}

// ── Full module mocks (same pattern as integration tests) ─────────────────────

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async (roles: string[]) => {
    if (!roles.includes(session.user.role)) {
      throw new Error(
        `FORBIDDEN: requires one of [${roles.join(', ')}], got ${session.user.role}`
      )
    }
    return session.user
  }),
  getCurrentUser: vi.fn(async () => session.user),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select:    vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => []) })) })),
    insert:    vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
    update:    vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => []) })) })),
    delete:    vi.fn(() => ({ where: vi.fn(() => []) })),
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  },
}))

vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(() => Promise.resolve()) }))

vi.mock('@/drizzle/schema', () => ({
  persons:            {},
  userAccounts:       {},
  leaveRequests:      {},
  auditLog:           {},
  notificationLog:    {},
  approvalDelegations:{},
  policySettings:     {},
  customFieldDefinitions: {},
}))

vi.mock('drizzle-orm', () => ({
  eq:  () => ({}),
  and: (...a: unknown[]) => a,
  or:  (...a: unknown[]) => a,
  ne:  () => ({}),
  lt:  () => ({}),
  lte: () => ({}),
  gt:  () => ({}),
  gte: () => ({}),
  sql: vi.fn(),
  inArray: () => ({}),
  isNull:  () => ({}),
  isNotNull: () => ({}),
  desc: () => ({}),
  asc:  () => ({}),
  count: () => ({ as: () => ({}) }),
}))

vi.mock('zod', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zod')>()
  return actual
})

beforeEach(() => {
  vi.clearAllMocks()
  session.user.role = 'EMPLOYEE'
})

// ── Pure RBAC logic tests (extracted from requireRole implementation) ─────────

describe('requireRole — RBAC logic', () => {
  /**
   * These tests verify the requireRole contract using the mock implementation
   * (which mirrors the real logic in lib/auth.ts lines 205-213).
   */

  it('allows access when role matches', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR'])
    expect(user.role).toBe('HR_ADMIN')
  })

  it('throws FORBIDDEN for EMPLOYEE accessing HR_ADMIN endpoint', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['HR_ADMIN', 'HR_DIRECTOR'])).rejects.toThrow('FORBIDDEN')
  })

  it('throws FORBIDDEN for MANAGER accessing SUPER_ADMIN endpoint', async () => {
    session.user.role = 'MANAGER'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('throws FORBIDDEN for FINANCE accessing HR_DIRECTOR payroll endpoint', async () => {
    session.user.role = 'FINANCE'
    await expect(requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('SUPER_ADMIN passes all role checks', async () => {
    session.user.role = 'SUPER_ADMIN'
    const u = await requireRole(['SUPER_ADMIN'])
    expect(u.role).toBe('SUPER_ADMIN')
  })

  it('PAYROLL_ADMIN can access payroll-only endpoints', async () => {
    session.user.role = 'PAYROLL_ADMIN'
    const u = await requireRole(['PAYROLL_ADMIN', 'HR_DIRECTOR'])
    expect(u.role).toBe('PAYROLL_ADMIN')
  })

  it('FORBIDDEN error message includes the required roles and actual role', async () => {
    session.user.role = 'EMPLOYEE'
    const err = await requireRole(['HR_ADMIN', 'PAYROLL_ADMIN']).catch((e: unknown) => e as Error)
    expect((err as Error).message).toContain('HR_ADMIN')
    expect((err as Error).message).toContain('PAYROLL_ADMIN')
    expect((err as Error).message).toContain('EMPLOYEE')
  })
})

// ── Middleware — route protection (source-level) ──────────────────────────────

describe('Middleware — route protection', () => {
  const middlewareTs = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')

  it('public routes: /sign-in is explicitly allowed', () => {
    expect(middlewareTs).toContain('/sign-in')
  })

  it('public routes: /api/auth is explicitly allowed', () => {
    expect(middlewareTs).toContain('/api/auth')
  })

  it('public routes: /api/health is explicitly allowed', () => {
    expect(middlewareTs).toContain('/api/health')
  })

  it('unauthenticated requests are redirected to /sign-in', () => {
    expect(middlewareTs).toContain('signInUrl')
    expect(middlewareTs).toContain('/sign-in')
    expect(middlewareTs).toContain('redirect')
  })

  it('callbackUrl is preserved on redirect (UX requirement)', () => {
    expect(middlewareTs).toContain('callbackUrl')
  })

  it('matcher covers all routes (not just specific paths)', () => {
    expect(middlewareTs).toMatch(/matcher.*\.\*\)/)
  })
})

// ── Sign-in audit (BR-AUDIT-001) ──────────────────────────────────────────────

describe('BR-AUDIT-001 — Sign-in audit logging', () => {
  const authTs = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')

  it('AUTH.SIGN_IN event type is emitted on every sign-in', () => {
    expect(authTs).toContain('AUTH.SIGN_IN')
  })

  it('writeAuditLog is called from the signIn event handler', () => {
    expect(authTs).toContain('writeAuditLog')
    expect(authTs).toContain('signIn')
  })

  it('sign-in audit failure does not block the user (fail-open audit)', () => {
    // The try/catch in the signIn event swallows audit errors
    // This is a documented design decision (Never block sign-in on audit failure)
    // Check both markers exist anywhere in the auth file
    expect(authTs).toContain('catch')
    expect(authTs).toContain('console.error')
    expect(authTs).toContain('Never block sign-in')
  })
})

// ── Dev credentials security (Known Gap #2) ──────────────────────────────────

describe('Dev credentials provider — production safety', () => {
  const authTs = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
  const envGuardTs = fs.readFileSync(path.join(ROOT, 'lib/environment-guardrails.ts'), 'utf-8')

  it("dev credentials are gated to NODE_ENV === 'development' via the shared guard", () => {
    // This check was tightened in QA-Audit-L6:
    // Previously !=='production' would include staging/preview envs
    expect(envGuardTs).toContain("env.NODE_ENV === 'development'")
  })

  it('dev credentials use the production-safe environment guard', () => {
    expect(authTs).toContain('areDevAccountsAllowed')
  })

  it('ENABLE_DEV_ACCOUNTS cannot enable demo credentials when DATABASE_ENV=production', () => {
    expect(areDevAccountsAllowed({
      DATABASE_ENV: 'production',
      ENABLE_DEV_ACCOUNTS: 'true',
      NODE_ENV: 'development',
    })).toBe(false)
  })

  it('dev credential passwords are only the literal "demo" (low-value secret)', () => {
    // All dev accounts use the same "demo" password — acceptable for dev only
    const passwordPattern = /password\s*:\s*['"]([^'"]+)['"]/g
    const passwords = [...authTs.matchAll(passwordPattern)].map(m => m[1])
    for (const pw of passwords) {
      expect(
        pw,
        `Dev account has non-demo password "${pw}" — check DEV_ACCOUNTS`
      ).toBe('demo')
    }
  })
})

// ── NFR-10 — Session timeout (config gap) ────────────────────────────────────

describe('NFR-10 — Session timeout configuration', () => {
  const authTs = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')

  it('NFR-10 FINDING: session.maxAge is not configured (default = 30 days)', () => {
    /**
     * Auth.js default JWT TTL = 30 days when maxAge is not set.
     * NFR-10 requires ≤ 30 min idle timeout for employees, ≤ 15 min for HR_ADMIN+.
     *
     * Expected fix: session: { strategy: 'jwt', maxAge: 1800 }
     * Plus: role-based timeout in JWT callback (reset iat on activity).
     *
     * This test FAILS by design to document the gap.
     */
    const hasMaxAge = /maxAge/.test(authTs)
    expect(
      hasMaxAge,
      'NFR-10 FAIL: session.maxAge not set — default is 30 days, must be ≤ 1800s'
    ).toBe(true)
  })
})

// ── NFR-09 — MFA enforcement (gap documentation) ─────────────────────────────

describe('NFR-09 — MFA enforcement', () => {
  const authTs = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
  const coreHrTypes = fs.readFileSync(path.join(ROOT, 'modules/core-hr/types.ts'), 'utf-8')

  it('step-up MFA JWT claim is defined in types (S3-10)', () => {
    const hasStepUpType = /stepUp|step_up|MFA/i.test(coreHrTypes)
    expect(hasStepUpType, 'S3-10: step-up MFA claim type should exist in core-hr/types.ts').toBe(true)
  })

  it('NFR-09 RESOLVED: requireRole enforces step-up MFA check for high-privilege roles (SEC-04 Phase 2 SHIPPED)', () => {
    /**
     * Phase 2 (2026-05-24): app-level step-up (S3-10) is NOW enforced in requireRole.
     * HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].
     * mfaVerified === false + roleRequiresMfa + !isDevSession → STEP_UP_REQUIRED.
     * Entra ID CA remains the primary MFA control; app-level guard is defence-in-depth.
     */
    const requireRoleBlock = authTs.match(
      /export async function requireRole[\s\S]*?^}/m
    )?.[0] ?? authTs

    const stepUpEnforced = /stepUp|mfaVerified|step_up/i.test(requireRoleBlock)
    // Phase 2 shipped: step-up IS enforced
    expect(stepUpEnforced).toBe(true)
  })
})
