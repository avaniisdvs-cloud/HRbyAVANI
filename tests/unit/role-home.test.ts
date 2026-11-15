/**
 * AVANIIS HCM — roleHome() behavioral unit coverage (RBAC-BL-08).
 *
 * Exercises the ACTUAL helper exported from lib/auth.ts (not a re-implementation).
 * lib/auth.ts only imports next-auth + its two providers + zod at module scope
 * (DB/bcrypt are lazy-imported inside functions), so mocking the three next-auth
 * modules lets the real module evaluate in the vitest node env — which otherwise
 * fails because next-auth@5-beta imports `next/server`. No production code is
 * changed; only the load-time next-auth dependency is stubbed for the test.
 *
 * Tests: RH-001..006
 */

import { describe, it, expect, vi } from 'vitest'

// Stub only the load-breaking next-auth deps so the REAL lib/auth module loads.
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}))
vi.mock('next-auth/providers/microsoft-entra-id', () => ({ default: vi.fn() }))
vi.mock('next-auth/providers/credentials', () => ({ default: vi.fn() }))

import { roleHome } from '@/lib/auth'

describe('roleHome() — role-appropriate landing route (BL-08)', () => {
  it('RH-001: EMPLOYEE → /me', () => {
    expect(roleHome('EMPLOYEE')).toBe('/me')
  })

  it('RH-002: MANAGER → /dashboard', () => {
    expect(roleHome('MANAGER')).toBe('/dashboard')
  })

  it('RH-003: HR_ADMIN → /dashboard', () => {
    expect(roleHome('HR_ADMIN')).toBe('/dashboard')
  })

  it('RH-004: HR_DIRECTOR → /dashboard', () => {
    expect(roleHome('HR_DIRECTOR')).toBe('/dashboard')
  })

  it('RH-005: SUPER_ADMIN → /dashboard', () => {
    expect(roleHome('SUPER_ADMIN')).toBe('/dashboard')
  })

  it('RH-006: undefined (no role) falls back to /dashboard', () => {
    expect(roleHome(undefined)).toBe('/dashboard')
  })
})
