/**
 * Unit tests for lib/leave-person-scope.ts
 *
 * Tests assertCanRequestLeaveFor authorization rules:
 *   1. Employee can only file for themselves
 *   2. Employee cannot file for another person
 *   3. Manager can file for themselves
 *   4. Manager can file for a direct/indirect team member
 *   5. Manager cannot file for an unrelated employee
 *   6. HR Admin can file for any employee
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Mock DB and constants before importing the module under test
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-uuid' }))
vi.mock('@/drizzle/schema', () => ({
  persons: { id: 'id', personNumber: 'person_number', fullNameEn: 'full_name_en', fullNameAr: 'full_name_ar', legalEntityId: 'legal_entity_id', tenantId: 'tenant_id', isActive: 'is_active' },
}))

import { db } from '@/lib/db'
const mockExecute = db.execute as ReturnType<typeof vi.fn>

const { assertCanRequestLeaveFor } = await import('@/lib/leave-person-scope')

const SELF_ID   = 'person-self-001'
const OTHER_ID  = 'person-other-002'
const TEAM_ID   = 'person-team-003'

function makeUser(role: string, personId?: string) {
  return {
    id:            'user-001',
    email:         'test@example.com',
    name:          'Test',
    role,
    legalEntityId: 'entity-001',
    personId,
  }
}

describe('assertCanRequestLeaveFor', () => {
  beforeEach(() => { mockExecute.mockReset() })

  // ── EMPLOYEE ──────────────────────────────────────────────────────────────

  describe('EMPLOYEE role', () => {
    it('can file for themselves', async () => {
      const user = makeUser('EMPLOYEE', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, SELF_ID)).resolves.toBeUndefined()
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('cannot file for another person not in their team', async () => {
      // Relationship-based: a non-HR caller filing for someone else triggers a
      // team lookup; an employee with no reports gets an empty team → FORBIDDEN.
      mockExecute.mockResolvedValueOnce([])
      const user = makeUser('EMPLOYEE', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, OTHER_ID)).rejects.toThrow('FORBIDDEN')
      expect(mockExecute).toHaveBeenCalledOnce()
    })

    it('CAN file for a direct/indirect report if they are a line manager', async () => {
      // Relationship-based: any role (here EMPLOYEE) that manages people may file
      // for a report — the team lookup returns a row.
      mockExecute.mockResolvedValueOnce([{ found: 1 }])
      const user = makeUser('EMPLOYEE', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, TEAM_ID)).resolves.toBeUndefined()
      expect(mockExecute).toHaveBeenCalledOnce()
    })
  })

  // ── MANAGER ───────────────────────────────────────────────────────────────

  describe('MANAGER role', () => {
    it('can file for themselves without DB lookup', async () => {
      const user = makeUser('MANAGER', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, SELF_ID)).resolves.toBeUndefined()
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('can file for a team member (DB returns a row)', async () => {
      mockExecute.mockResolvedValueOnce([{ found: 1 }])
      const user = makeUser('MANAGER', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, TEAM_ID)).resolves.toBeUndefined()
      expect(mockExecute).toHaveBeenCalledOnce()
    })

    it('cannot file for an unrelated employee (DB returns empty)', async () => {
      mockExecute.mockResolvedValueOnce([])
      const user = makeUser('MANAGER', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, OTHER_ID)).rejects.toThrow('FORBIDDEN')
      expect(mockExecute).toHaveBeenCalledOnce()
    })

    it('cannot file for anyone when they have no personId', async () => {
      const user = makeUser('MANAGER', undefined)
      await expect(assertCanRequestLeaveFor(user, OTHER_ID)).rejects.toThrow('FORBIDDEN')
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  // ── HR roles ──────────────────────────────────────────────────────────────

  describe('HR_ADMIN role', () => {
    it('can file for any employee without DB lookup', async () => {
      const user = makeUser('HR_ADMIN', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, OTHER_ID)).resolves.toBeUndefined()
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  describe('HR_DIRECTOR role', () => {
    it('can file for any employee', async () => {
      const user = makeUser('HR_DIRECTOR', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, OTHER_ID)).resolves.toBeUndefined()
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  describe('SUPER_ADMIN role', () => {
    it('can file for any employee', async () => {
      const user = makeUser('SUPER_ADMIN', SELF_ID)
      await expect(assertCanRequestLeaveFor(user, OTHER_ID)).resolves.toBeUndefined()
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })
})

// ── Recursive team CTE cycle safety (regression: MANAGER Team Leave hang) ─────
//
// The MANAGER team picklist is built by a `WITH RECURSIVE ... UNION ALL` CTE.
// A cycle in worker_assignments.line_manager_id (A→B→A or a self-reference) made
// the recursion non-terminating, hanging /absence, /absence/my and /absence/new
// for managers (no statement_timeout on the connection). These source-inspection
// tests lock in the cycle-protection guards so the hang cannot silently regress.
describe('teamCte cycle protection', () => {
  const SRC = readFileSync(
    resolve(process.cwd(), 'lib/leave-person-scope.ts'),
    'utf8',
  )

  it('carries a visited-path array through the recursion', () => {
    expect(SRC).toMatch(/WITH RECURSIVE team\(person_id, depth, path\)/)
    expect(SRC).toContain('ARRAY[wa.person_id]')
    expect(SRC).toContain('t.path || wa.person_id')
  })

  it('skips persons already on the path (breaks A→B→A cycles)', () => {
    expect(SRC).toContain('wa.person_id <> ALL(t.path)')
  })

  it('never re-adds the manager themselves under a cycle', () => {
    expect(SRC).toMatch(/wa\.person_id <> \$\{managerId\}::uuid/)
  })

  it('caps recursion depth defensively', () => {
    expect(SRC).toContain('t.depth < 100')
  })

  it('still recurses on line_manager_id over current assignments only', () => {
    // Guards must not have changed the traversal semantics.
    expect(SRC).toContain('JOIN   team t ON wa.line_manager_id = t.person_id')
    expect(SRC).toMatch(/wa\.is_current\s*=\s*true/)
  })
})
