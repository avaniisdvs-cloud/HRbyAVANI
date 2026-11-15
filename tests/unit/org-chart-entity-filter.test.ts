/**
 * Unit tests — fetchOrgTree entity-filter fix
 *
 * Verifies that:
 *   - Global admin roles (SUPER_ADMIN, HR_ADMIN, HR_DIRECTOR, FINANCE,
 *     PAYROLL_ADMIN) do NOT forward legalEntityId → org tree sees all entities
 *   - Scoped roles (MANAGER, EMPLOYEE) DO forward their entity ID → scoped view
 *   - Explicit legalEntityId param always takes precedence over role logic
 *   - Action returns success/error shape on getOrgTree success and failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock getOrgTree (data layer) ──────────────────────────────────────────────

const mockGetOrgTree = vi.fn()

vi.mock('@/lib/org-chart/build-tree', () => ({
  getOrgTree:            mockGetOrgTree,
  getPersonAncestorChain: vi.fn().mockResolvedValue([]),
  getDirectReportNodes:   vi.fn().mockResolvedValue([]),
}))

// ── Mock DB (not used by fetchOrgTree itself but imported by the module) ──────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    transaction: vi.fn(),
    insert:      vi.fn(),
    update:      vi.fn(),
  },
}))

vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/cache',  () => ({ revalidatePath: vi.fn() }))

// ── Mock getCurrentUser — overridden per test ─────────────────────────────────

const mockGetCurrentUser = vi.fn()
vi.mock('@/lib/auth', () => ({
  getCurrentUser: mockGetCurrentUser,
  requireRole:    mockGetCurrentUser,
}))

// ── Reusable tree stub ────────────────────────────────────────────────────────

const STUB_TREE = {
  nodes: [{ id: 'pos-chro', type: 'vacant', position: { x: 0, y: 0 }, data: {} }],
  edges: [],
  meta:  { totalPositions: 1, occupiedCount: 0, vacantCount: 1, frozenCount: 0, actingCount: 0, maxDepth: 1 },
}

// ── Dynamic import (after mocks are set up) ───────────────────────────────────

const { fetchOrgTree } = await import('@/modules/core-hr/org-chart-actions')

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockUser(role: string, legalEntityId = 'aaaa0001-0000-0000-0000-000000000001') {
  mockGetCurrentUser.mockResolvedValue({ id: 'u1', name: 'Test User', email: 't@t.com', role, legalEntityId })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrgTree.mockResolvedValue(STUB_TREE)
})

// ─────────────────────────────────────────────────────────────────────────────
// Global admin roles — no entity filter
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchOrgTree — global admin roles bypass entity filter', () => {
  const GLOBAL_ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'FINANCE', 'PAYROLL_ADMIN']

  for (const role of GLOBAL_ROLES) {
    it(`${role}: calls getOrgTree with legalEntityId = undefined`, async () => {
      mockUser(role, 'aaaa0001-0000-0000-0000-000000000001')

      const result = await fetchOrgTree({ includeVacant: true })

      expect(result.success).toBe(true)
      expect(mockGetOrgTree).toHaveBeenCalledOnce()

      const calledWith = mockGetOrgTree.mock.calls[0][0]
      expect(calledWith.legalEntityId).toBeUndefined()
    })
  }

  it('SUPER_ADMIN: returns tree even when user entity differs from position entity', async () => {
    // Simulates the old bug — user entity = '11111111-...' but positions are in 'aaaa0001-...'
    mockUser('SUPER_ADMIN', '11111111-1111-1111-1111-111111111111')
    mockGetOrgTree.mockResolvedValue(STUB_TREE)

    const result = await fetchOrgTree({ includeVacant: true })

    expect(result.success).toBe(true)
    expect(result.data?.meta.totalPositions).toBe(1)
    // Crucially — legalEntityId NOT forwarded
    expect(mockGetOrgTree.mock.calls[0][0].legalEntityId).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scoped roles — entity filter forwarded
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchOrgTree — scoped roles forward entity filter', () => {
  it('MANAGER: legalEntityId passed from user session', async () => {
    mockUser('MANAGER', 'aaaa0001-0000-0000-0000-000000000001')

    await fetchOrgTree({ includeVacant: true })

    const calledWith = mockGetOrgTree.mock.calls[0][0]
    expect(calledWith.legalEntityId).toBe('aaaa0001-0000-0000-0000-000000000001')
  })

  it('EMPLOYEE: legalEntityId passed from user session', async () => {
    mockUser('EMPLOYEE', 'aaaa0001-0000-0000-0000-000000000001')

    await fetchOrgTree({ includeVacant: true })

    const calledWith = mockGetOrgTree.mock.calls[0][0]
    expect(calledWith.legalEntityId).toBe('aaaa0001-0000-0000-0000-000000000001')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Explicit param always wins
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchOrgTree — explicit legalEntityId param takes precedence', () => {
  it('HR_ADMIN with explicit entity param → entity IS forwarded', async () => {
    mockUser('HR_ADMIN', 'aaaa0001-0000-0000-0000-000000000001')
    const EXPLICIT = 'aaaa0001-0000-0000-0000-000000000002'

    await fetchOrgTree({ includeVacant: true, legalEntityId: EXPLICIT })

    const calledWith = mockGetOrgTree.mock.calls[0][0]
    expect(calledWith.legalEntityId).toBe(EXPLICIT)
  })

  it('EMPLOYEE with explicit entity param → explicit entity used (not user entity)', async () => {
    mockUser('EMPLOYEE', 'aaaa0001-0000-0000-0000-000000000001')
    const EXPLICIT = 'aaaa0001-0000-0000-0000-000000000003'

    await fetchOrgTree({ includeVacant: true, legalEntityId: EXPLICIT })

    const calledWith = mockGetOrgTree.mock.calls[0][0]
    expect(calledWith.legalEntityId).toBe(EXPLICIT)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Response shape
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchOrgTree — response shape', () => {
  it('returns { success: true, data } on success', async () => {
    mockUser('HR_ADMIN')
    mockGetOrgTree.mockResolvedValue(STUB_TREE)

    const result = await fetchOrgTree({ includeVacant: true })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      nodes: expect.any(Array),
      edges: expect.any(Array),
      meta:  expect.objectContaining({ totalPositions: 1 }),
    })
    expect(result.error).toBeUndefined()
  })

  it('returns { success: false, error } when getOrgTree throws', async () => {
    mockUser('HR_ADMIN')
    mockGetOrgTree.mockRejectedValue(new Error('DB connection reset'))

    const result = await fetchOrgTree({ includeVacant: true })

    expect(result.success).toBe(false)
    expect(result.error).toBe('DB connection reset')
    expect(result.data).toBeUndefined()
  })

  it('tenantId is always the system TENANT_ID constant', async () => {
    mockUser('EMPLOYEE')

    await fetchOrgTree({ includeVacant: false })

    const calledWith = mockGetOrgTree.mock.calls[0][0]
    expect(calledWith.tenantId).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('includeVacant param is forwarded correctly', async () => {
    mockUser('HR_ADMIN')

    await fetchOrgTree({ includeVacant: false, maxDepth: 4 })

    const calledWith = mockGetOrgTree.mock.calls[0][0]
    expect(calledWith.includeVacant).toBe(false)
    expect(calledWith.maxDepth).toBe(4)
  })
})
