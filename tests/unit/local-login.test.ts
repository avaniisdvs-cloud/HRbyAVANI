/**
 * Controlled LOCAL login — eligibility + lockout policy tests.
 *
 * Covers the approved matrix for non-SSO password login:
 *   LL-001..006  eligibility gate (role / provider / active / hash)
 *   LL-010..013  lockout enforcement (lock check, failure increment, threshold)
 *   LL-020..021  success reset
 *
 * The SUPER_ADMIN break-glass path and Microsoft SSO are NOT governed by these
 * helpers (they branch separately in lib/auth.ts) and are asserted via the
 * eligibility gate rejecting non-EMPLOYEE/MANAGER roles.
 */

import { describe, it, expect } from 'vitest'
import {
  isLocalLoginEligible, isLocked, failureUpdate, successUpdate, isSeparated,
  LOCAL_LOGIN_ROLES, MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES, ACCESS_ENDING_STATUSES,
  type LoginAccount,
} from '../../lib/local-login'
import { readFileSync } from 'fs'
import { join } from 'path'

function acct(overrides?: Partial<LoginAccount>): LoginAccount {
  return {
    avaniisRole:        'EMPLOYEE',
    isActive:           true,
    primarySsoProvider: 'LOCAL',
    passwordHash:       '$2a$12$abcdefghijklmnopqrstuv',
    failedLoginCount:   0,
    lockedUntil:        null,
    ...overrides,
  }
}

// ── Eligibility gate ──────────────────────────────────────────────────────────

describe('LOCAL login eligibility', () => {
  it('LL-001: LOCAL EMPLOYEE with password is eligible', () => {
    expect(isLocalLoginEligible(acct({ avaniisRole: 'EMPLOYEE' }))).toBe(true)
  })

  it('LL-002: LOCAL MANAGER with password is eligible', () => {
    expect(isLocalLoginEligible(acct({ avaniisRole: 'MANAGER' }))).toBe(true)
  })

  it('LL-003: LOCAL HR_ADMIN is now eligible (OP-001 identity-based policy)', () => {
    // Policy 2026-06-05: SSO vs password is decided by identity (provider=LOCAL =
    // no corporate email), not role. Non-corporate-email staff of any non-super
    // role may use password login; RBAC still applies by role.
    expect(isLocalLoginEligible(acct({ avaniisRole: 'HR_ADMIN' }))).toBe(true)
  })

  it('LL-003b: LOCAL HR_DIRECTOR / PAYROLL_ADMIN / FINANCE are eligible; SUPER_ADMIN gate-rejected (break-glass only)', () => {
    for (const role of ['HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE']) {
      expect(isLocalLoginEligible(acct({ avaniisRole: role }))).toBe(true)
    }
    // SUPER_ADMIN is NOT in the LOCAL allow-list — it uses the separate
    // break-glass path in authorize(), not these helpers.
    expect(isLocalLoginEligible(acct({ avaniisRole: 'SUPER_ADMIN' }))).toBe(false)
  })

  it('LL-004: inactive account is rejected', () => {
    expect(isLocalLoginEligible(acct({ isActive: false }))).toBe(false)
  })

  it('LL-005: null / empty passwordHash is rejected', () => {
    expect(isLocalLoginEligible(acct({ passwordHash: null }))).toBe(false)
    expect(isLocalLoginEligible(acct({ passwordHash: '' }))).toBe(false)
  })

  it('LL-006: MICROSOFT_AD provider is rejected even for EMPLOYEE (corporate email → SSO)', () => {
    expect(isLocalLoginEligible(acct({ primarySsoProvider: 'MICROSOFT_AD' }))).toBe(false)
  })

  it('LL-006b: corporate-SSO HR_ADMIN cannot use LOCAL password (must SSO)', () => {
    expect(isLocalLoginEligible(acct({ avaniisRole: 'HR_ADMIN', primarySsoProvider: 'MICROSOFT_AD' }))).toBe(false)
  })

  it('LL-007: allow-list covers all non-super roles (super uses break-glass)', () => {
    expect([...LOCAL_LOGIN_ROLES].sort()).toEqual(
      ['EMPLOYEE', 'FINANCE', 'HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN'],
    )
    expect([...LOCAL_LOGIN_ROLES]).not.toContain('SUPER_ADMIN')
  })
})

// ── Lockout ───────────────────────────────────────────────────────────────────

describe('LOCAL login lockout', () => {
  const now = new Date('2026-06-04T10:00:00Z')

  it('LL-010: not locked when lockedUntil is null', () => {
    expect(isLocked({ lockedUntil: null }, now)).toBe(false)
  })

  it('LL-011: locked when lockedUntil is in the future', () => {
    expect(isLocked({ lockedUntil: new Date(now.getTime() + 60_000) }, now)).toBe(true)
  })

  it('LL-012: not locked when lockedUntil has passed', () => {
    expect(isLocked({ lockedUntil: new Date(now.getTime() - 60_000) }, now)).toBe(false)
  })

  it('LL-013: failure increments counter; no lock before threshold', () => {
    const upd = failureUpdate({ failedLoginCount: 0 }, now)
    expect(upd.failedLoginCount).toBe(1)
    expect(upd.lockedUntil).toBeNull()
  })

  it('LL-014: reaching MAX_FAILED_ATTEMPTS sets lockedUntil', () => {
    const upd = failureUpdate({ failedLoginCount: MAX_FAILED_ATTEMPTS - 1 }, now)
    expect(upd.failedLoginCount).toBe(MAX_FAILED_ATTEMPTS)
    expect(upd.lockedUntil).not.toBeNull()
    expect(upd.lockedUntil!.getTime()).toBe(now.getTime() + LOCKOUT_MINUTES * 60_000)
  })

  it('LL-015: five consecutive failures from zero results in a lock', () => {
    let failed = 0
    let lockedUntil: Date | null = null
    for (let i = 0; i < 5; i++) {
      const upd = failureUpdate({ failedLoginCount: failed }, now)
      failed = upd.failedLoginCount
      lockedUntil = upd.lockedUntil
    }
    expect(failed).toBe(5)
    expect(lockedUntil).not.toBeNull()
  })
})

// ── Success reset ─────────────────────────────────────────────────────────────

describe('LOCAL login success reset', () => {
  const now = new Date('2026-06-04T10:00:00Z')

  it('LL-020: success clears failure counter and lock', () => {
    const ok = successUpdate(now)
    expect(ok.failedLoginCount).toBe(0)
    expect(ok.lockedUntil).toBeNull()
  })

  it('LL-021: success stamps lastLoginAt to now', () => {
    const ok = successUpdate(now)
    expect(ok.lastLoginAt).toEqual(now)
  })
})

// ── B1: separated-worker access gate (isSeparated) ─────────────────────────────

const TODAY = '2026-06-14'

describe('B1 — isSeparated access gate', () => {
  it('LL-030: active employee (no separation) can authenticate', () => {
    expect(isSeparated('ACTIVE', null, TODAY)).toBe(false)
  })

  it('LL-031: TERMINATED worker is blocked even with no separationDate', () => {
    expect(isSeparated('TERMINATED', null, TODAY)).toBe(true)
  })

  it('LL-032: RETIRED and DECEASED workers are blocked', () => {
    expect(isSeparated('RETIRED', null, TODAY)).toBe(true)
    expect(isSeparated('DECEASED', null, TODAY)).toBe(true)
  })

  it('LL-033: separationDate on/before today blocks, even if status still ACTIVE', () => {
    expect(isSeparated('ACTIVE', '2026-06-14', TODAY)).toBe(true)   // == today
    expect(isSeparated('ACTIVE', '2026-06-01', TODAY)).toBe(true)   // before today
  })

  it('LL-034: a FUTURE separationDate does not block yet', () => {
    expect(isSeparated('ACTIVE', '2026-12-31', TODAY)).toBe(false)
  })

  it('LL-035: ON_LEAVE / SUSPENDED are NOT separations (still employed)', () => {
    expect(isSeparated('ON_LEAVE', null, TODAY)).toBe(false)
    expect(isSeparated('SUSPENDED', null, TODAY)).toBe(false)
  })

  it('LL-036: null/unknown status with no separationDate does not block', () => {
    expect(isSeparated(null, null, TODAY)).toBe(false)
    expect(isSeparated(undefined, undefined, TODAY)).toBe(false)
  })

  it('LL-037: access-ending statuses are exactly TERMINATED/RETIRED/DECEASED', () => {
    expect([...ACCESS_ENDING_STATUSES].sort()).toEqual(['DECEASED', 'RETIRED', 'TERMINATED'])
  })
})

// ── B1: source-inspection guarantees a mock cannot exercise ────────────────────

describe('B1 — auth wiring & termination invariant (source inspection)', () => {
  it('LL-040: lib/auth.ts gates both login paths with isSeparated (SUPER_ADMIN exempt)', () => {
    const auth = readFileSync(join(process.cwd(), 'lib/auth.ts'), 'utf8')
    // both the credentials authorize() and the OAuth signIn() call isSeparated
    const calls = auth.match(/isSeparated\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(auth).toMatch(/avaniisRole !== 'SUPER_ADMIN'/)
  })

  it('LL-041: termination flow does NOT set persons.isActive=false (B1 Option A)', () => {
    const term = readFileSync(join(process.cwd(), 'modules/core-hr/contracts/actions.ts'), 'utf8')
    expect(term).toMatch(/assignmentStatus:\s*'TERMINATED'/)
    expect(term).toMatch(/separationDate:/)
    // the record-active flag must remain untouched on termination
    expect(term).not.toMatch(/isActive:\s*false/)
  })
})
