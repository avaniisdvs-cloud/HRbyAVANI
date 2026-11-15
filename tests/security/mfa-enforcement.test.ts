import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * SEC-04 — MFA / step-up enforcement for high-privilege roles.
 *
 * Requirement (S3-10, Sprint 11):
 *   HR_ADMIN, HR_DIRECTOR, and SUPER_ADMIN sessions MUST carry a verified MFA
 *   claim before `requireRole` grants access. EMPLOYEE / MANAGER / PAYROLL_ADMIN
 *   / FINANCE are single-factor.
 *
 * Current state (Sprint 10 / as-shipped):
 *   `requireRole` checks role membership only — no MFA claim inspection.
 *   This is a DOCUMENTED GAP, tracked as SEC-04 P1.
 *
 * These tests:
 *   1. Confirm the Sprint 11 TODO comment exists in lib/auth.ts so the gap
 *      is visible during code review.
 *   2. Enumerate the high-privilege roles that MUST be gated by MFA.
 *   3. Intentionally FAIL the future requirement (MFA claim check) so CI
 *      turns green only after the Sprint 11 implementation lands.
 *      The failing assertion is clearly labelled [SPRINT-11-PENDING].
 */

const ROOT = path.resolve(__dirname, '../..')
const authSource = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
const requireRoleSource = authSource.slice(
  authSource.indexOf('export async function requireRole'),
)

const HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const
const SINGLE_FACTOR_ROLES  = ['EMPLOYEE', 'MANAGER', 'PAYROLL_ADMIN', 'FINANCE'] as const

// ── Gap documentation ──────────────────────────────────────────────────────

describe('SEC-04 — MFA enforcement gap documentation', () => {
  it('lib/auth.ts contains the Phase 2 MFA TODO comment (SEC-04 governance anchor)', () => {
    // The SEC-04 / S3-10 comment in requireRole() anchors the Phase 2 deferral.
    // If this test fails, the comment was removed without the implementation landing.
    // Do not remove this anchor — it is the governance record for the MFA gap.
    expect(authSource).toMatch(/Phase 2/)
    expect(authSource).toMatch(/step.up|step-up/i)
  })

  it('requireRole is defined as an exported async function', () => {
    expect(requireRoleSource).toMatch(/export async function requireRole/)
  })

  it('requireRole currently checks role membership (role inclusion check present)', () => {
    // Verifies the existing role gate is intact — not accidentally removed.
    expect(requireRoleSource).toMatch(/allowed\.includes/)
    expect(requireRoleSource).toMatch(/FORBIDDEN/)
  })

  it('high-privilege roles are defined in KRole type', () => {
    for (const role of HIGH_PRIVILEGE_ROLES) {
      expect(authSource).toContain(`'${role}'`)
    }
  })

  it('single-factor roles are defined in KRole type', () => {
    for (const role of SINGLE_FACTOR_ROLES) {
      expect(authSource).toContain(`'${role}'`)
    }
  })
})

// ── Session timeout (pre-condition for MFA) ───────────────────────────────

describe('SEC-04 — session timeout hardening (pre-condition)', () => {
  it('JWT maxAge is set to 1800s (30 min) — NFR-10 satisfied', () => {
    expect(authSource).toMatch(/maxAge\s*:\s*1800/)
  })

  it('15-minute idle enforcement for HR_ADMIN+ is deferred to Sprint 11', () => {
    // If this comment disappears without the implementation landing, the test
    // surfaces the omission.
    expect(authSource).toMatch(/15.min|S3-10/i)
  })
})

// ── SEC-04 — MFA step-up enforcement (Phase 2 — IMPLEMENTED) ─────────────
//
// Phase 3 Priority 5 (2026-05-24): SEC-04 MFA step-up enforcement shipped.
// Implementation in lib/auth.ts:
//   • `mfaVerified?: boolean` added to JWT, Session, SessionUser types
//   • jwt callback sets `mfaVerified = account?.provider === 'microsoft-entra-id'`
//   • `HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']`
//   • requireRole() checks `user.mfaVerified === false` for high-privilege roles
//   • Dev bypass: areDevAccountsAllowed() blocks DATABASE_ENV=production
//   • Strict `=== false` check: undefined (legacy JWTs) is not retroactively blocked
//   • Production: Entra ID sessions always get mfaVerified=true (Avaniis CA enforcement)
//
// No app-level TOTP library needed for this MVP — Entra ID CA is the MFA control.
// App-level TOTP enrollment UI (QR codes, recovery codes) is a Phase 3 stretch goal.
//
// See tests/roadmap/mfa-phase1-assessment.md for full risk register.

describe('SEC-04 — requireRole MFA step-up enforcement (Phase 2 SHIPPED)', () => {
  it('requireRole source contains mfaVerified claim check and STEP_UP_REQUIRED (SEC-04 gate)', () => {
    // The step-up check must be present in requireRole source (not just a comment).
    expect(requireRoleSource).toMatch(/mfaVerified|mfa_verified/i)
    expect(requireRoleSource).toContain('STEP_UP_REQUIRED')
  })

  it('requireRole source references HIGH_PRIVILEGE_ROLES for HR_ADMIN + SUPER_ADMIN scope (SEC-04)', () => {
    // HIGH_PRIVILEGE_ROLES drives the step-up check — must include HR_ADMIN and SUPER_ADMIN.
    expect(authSource).toContain('HIGH_PRIVILEGE_ROLES')
    // The roles array must include both high-privilege roles
    const roleListMatch = authSource.match(/HIGH_PRIVILEGE_ROLES[^=]*=\s*\[([^\]]+)\]/)
    expect(roleListMatch, 'HIGH_PRIVILEGE_ROLES array should be defined').toBeTruthy()
    if (roleListMatch) {
      const roleList = roleListMatch[1]
      expect(roleList).toContain("'HR_ADMIN'")
      expect(roleList).toContain("'SUPER_ADMIN'")
    }
  })

  it('requireRole step-up check uses === false (strict equality — does not block legacy JWTs)', () => {
    // Strict equality prevents legacy JWTs (mfaVerified=undefined) from being blocked.
    // Only explicit false (dev credentials in production context) triggers STEP_UP_REQUIRED.
    expect(requireRoleSource).toContain('mfaVerified === false')
  })

  it('requireRole has a production-safe dev bypass so local HR_ADMIN sessions are not blocked (SEC-04 dev guard)', () => {
    // Dev sessions use areDevAccountsAllowed(), which refuses DATABASE_ENV=production.
    // Without this guard, local development is broken whenever NODE_ENV !== development.
    expect(authSource).toContain('areDevAccountsAllowed')
    expect(requireRoleSource).toContain('isDevSession')
  })
})
