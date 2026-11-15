/**
 * Access Guards — Unit Tests (W0 Foundation)
 * ACG-001–020: deriveActorIdentity, assertSameEntity, assertSelfOrTeam,
 * assertActivePersonTarget.
 *
 * These verify the shared authorization primitives consumed by W1–W3:
 *  - identity is re-derived from the session, never from caller args
 *  - cross-entity access is blocked (SUPER_ADMIN bypass)
 *  - person-data access follows self / recursive-team / HR relationship rule
 *  - terminated/inactive targets are rejected (isActive AND assignmentStatus)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

let currentUser: unknown = null
const getCurrentUserMock = vi.fn(async () => {
  if (!currentUser) throw new Error('UNAUTHENTICATED')
  return currentUser
})

let teamIds: string[] = []
const resolveTeamMock = vi.fn(async (_id: string) => teamIds)

let personRow: unknown[] = []
function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown) => Promise.resolve(personRow).then(resolve)
      }
      return () => makeProxy()
    },
  })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = { select: vi.fn(() => makeProxy()) }

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: getCurrentUserMock }))
vi.mock('@/lib/leave-person-scope', () => ({ resolveManagerViewablePersonIds: resolveTeamMock }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/drizzle/schema', () => ({ persons: { id: 'id', tenantId: 'tenant_id', isActive: 'is_active', assignmentStatus: 'assignment_status' } }))

const {
  deriveActorIdentity,
  assertSameEntity,
  assertSelfOrTeam,
  assertActivePersonTarget,
} = await import('@/lib/access')

beforeEach(() => {
  currentUser = null
  teamIds = []
  personRow = []
  vi.clearAllMocks()
})

// ── deriveActorIdentity ─────────────────────────────────────────────────────

describe('deriveActorIdentity', () => {
  it('ACG-001 returns identity derived from the session, ignoring any caller args', async () => {
    currentUser = { id: 'u1', role: 'EMPLOYEE', legalEntityId: 'E1', personId: 'p1', mfaVerified: true }
    const a = await deriveActorIdentity()
    expect(a).toEqual({ userId: 'u1', role: 'EMPLOYEE', legalEntityId: 'E1', personId: 'p1', mfaVerified: true })
  })

  it('ACG-002 throws UNAUTHENTICATED when there is no session', async () => {
    currentUser = null
    await expect(deriveActorIdentity()).rejects.toThrow('UNAUTHENTICATED')
  })

  it('ACG-003 carries undefined personId through (first-time SSO)', async () => {
    currentUser = { id: 'u2', role: 'EMPLOYEE', legalEntityId: 'E1', personId: undefined }
    const a = await deriveActorIdentity()
    expect(a.personId).toBeUndefined()
  })
})

// ── assertSameEntity ────────────────────────────────────────────────────────

describe('assertSameEntity', () => {
  it('ACG-004 allows matching entity', () => {
    expect(() => assertSameEntity({ role: 'HR_ADMIN', legalEntityId: 'E1' }, 'E1')).not.toThrow()
  })
  it('ACG-005 throws on entity mismatch for non-SUPER_ADMIN', () => {
    expect(() => assertSameEntity({ role: 'HR_ADMIN', legalEntityId: 'E1' }, 'E2')).toThrow('FORBIDDEN')
  })
  it('ACG-006 SUPER_ADMIN bypasses any entity', () => {
    expect(() => assertSameEntity({ role: 'SUPER_ADMIN', legalEntityId: 'E1' }, 'E2')).not.toThrow()
  })
  it('ACG-007 throws when target entity is null/undefined for non-SUPER_ADMIN', () => {
    expect(() => assertSameEntity({ role: 'PAYROLL_ADMIN', legalEntityId: 'E1' }, null)).toThrow('FORBIDDEN')
    expect(() => assertSameEntity({ role: 'PAYROLL_ADMIN', legalEntityId: 'E1' }, undefined)).toThrow('FORBIDDEN')
  })
})

// ── assertSelfOrTeam ────────────────────────────────────────────────────────

describe('assertSelfOrTeam', () => {
  it('ACG-008 HR roles may access any person', async () => {
    for (const role of ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']) {
      await expect(assertSelfOrTeam({ role, personId: 'pX' }, 'pOther')).resolves.toBeUndefined()
    }
    expect(resolveTeamMock).not.toHaveBeenCalled()
  })
  it('ACG-009 self access is always allowed', async () => {
    await expect(assertSelfOrTeam({ role: 'EMPLOYEE', personId: 'p1' }, 'p1')).resolves.toBeUndefined()
    expect(resolveTeamMock).not.toHaveBeenCalled()
  })
  it('ACG-010 manager may access a recursive report', async () => {
    teamIds = ['p2', 'p3']
    await expect(assertSelfOrTeam({ role: 'MANAGER', personId: 'pM' }, 'p3')).resolves.toBeUndefined()
  })
  it('ACG-011 throws for a stranger not in the team', async () => {
    teamIds = ['p2']
    await expect(assertSelfOrTeam({ role: 'EMPLOYEE', personId: 'p1' }, 'p9')).rejects.toThrow('FORBIDDEN')
  })
  it('ACG-012 throws when actor has no personId and is not HR', async () => {
    await expect(assertSelfOrTeam({ role: 'EMPLOYEE', personId: undefined }, 'p1')).rejects.toThrow('FORBIDDEN')
  })
  it('ACG-013 forged role is irrelevant — relationship is the gate (non-HR stranger blocked)', async () => {
    teamIds = []
    await expect(assertSelfOrTeam({ role: 'MANAGER', personId: 'pM' }, 'pStranger')).rejects.toThrow('FORBIDDEN')
  })
})

// ── assertActivePersonTarget ────────────────────────────────────────────────

describe('assertActivePersonTarget', () => {
  it('ACG-014 allows an active employee', async () => {
    personRow = [{ isActive: true, assignmentStatus: 'ACTIVE' }]
    await expect(assertActivePersonTarget('p1')).resolves.toBeUndefined()
  })
  it('ACG-015 throws PERSON_NOT_FOUND when no row', async () => {
    personRow = []
    await expect(assertActivePersonTarget('pX')).rejects.toThrow('PERSON_NOT_FOUND')
  })
  it('ACG-016 throws PERSON_INACTIVE when isActive is false', async () => {
    personRow = [{ isActive: false, assignmentStatus: 'ACTIVE' }]
    await expect(assertActivePersonTarget('p1')).rejects.toThrow('PERSON_INACTIVE')
  })
  it('ACG-017 throws PERSON_INACTIVE when assignmentStatus is TERMINATED even if isActive stays true', async () => {
    // documented invariant: termination flips assignmentStatus, NOT isActive
    personRow = [{ isActive: true, assignmentStatus: 'TERMINATED' }]
    await expect(assertActivePersonTarget('p1')).rejects.toThrow('PERSON_INACTIVE')
  })
  it('ACG-018 throws PERSON_INACTIVE for non-ACTIVE statuses (RETIRED/SUSPENDED)', async () => {
    for (const s of ['RETIRED', 'SUSPENDED', 'DECEASED']) {
      personRow = [{ isActive: true, assignmentStatus: s }]
      await expect(assertActivePersonTarget('p1')).rejects.toThrow('PERSON_INACTIVE')
    }
  })
})
