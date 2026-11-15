/**
 * Employee Movement Report — security scope, permission enforcement, role-gate
 * deny paths, and the salary / SALARY_REVISION exclusion contract. EMR-001…018.
 *
 * The query body is DB-driven, but the security decision lives in the pure
 * resolveMovementScope() + the role gate + requirePermission, all of which are
 * unit-testable without a live database (DB and permissions are stubbed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
// requirePermission is stubbed; individual tests override the mock to assert deny.
const requirePermission = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/permissions', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }))

const mod = await import('@/modules/reports/employee-movement')
const { getEmployeeMovement, getMovementFilterOptions, resolveMovementScope, MOVEMENT_ACTION_TYPES } = mod

type SessionUser = import('@/lib/auth').SessionUser
const ENTITY_A = 'aaaa0001-0000-0000-0000-000000000001'
const ENTITY_B = 'bbbb0002-0000-0000-0000-000000000002'
const U = (o: Partial<SessionUser>): SessionUser => ({
  id: 'u', name: 'n', email: 'e', role: 'EMPLOYEE', legalEntityId: ENTITY_A, ...o,
})

beforeEach(() => { requirePermission.mockReset(); requirePermission.mockResolvedValue(undefined) })

describe('resolveMovementScope — authorised person scope (no widening)', () => {
  it('EMR-001 SUPER_ADMIN → ALL; entity filter honoured', async () => {
    expect(await resolveMovementScope(U({ role: 'SUPER_ADMIN' }))).toEqual({ kind: 'ALL', entityFilter: null })
    expect(await resolveMovementScope(U({ role: 'SUPER_ADMIN' }), ENTITY_B)).toEqual({ kind: 'ALL', entityFilter: ENTITY_B })
  })

  it('EMR-002 HR_ADMIN → ENTITY bound to OWN entity; requested entity is ignored (cannot widen)', async () => {
    expect(await resolveMovementScope(U({ role: 'HR_ADMIN', legalEntityId: ENTITY_A }), ENTITY_B))
      .toEqual({ kind: 'ENTITY', entityId: ENTITY_A })
  })

  it('EMR-003 HR_DIRECTOR → ENTITY bound to OWN entity (matches employee-history)', async () => {
    expect(await resolveMovementScope(U({ role: 'HR_DIRECTOR', legalEntityId: ENTITY_A }), ENTITY_B))
      .toEqual({ kind: 'ENTITY', entityId: ENTITY_A })
  })

  it('EMR-004 EMPLOYEE / PAYROLL_ADMIN / FINANCE → NONE', async () => {
    expect(await resolveMovementScope(U({ role: 'EMPLOYEE' }))).toEqual({ kind: 'NONE' })
    expect(await resolveMovementScope(U({ role: 'PAYROLL_ADMIN' }))).toEqual({ kind: 'NONE' })
    expect(await resolveMovementScope(U({ role: 'FINANCE' }))).toEqual({ kind: 'NONE' })
  })

  it('EMR-005 MANAGER without a linked person record → NONE', async () => {
    expect(await resolveMovementScope(U({ role: 'MANAGER', personId: undefined }))).toEqual({ kind: 'NONE' })
  })
})

describe('getEmployeeMovement — role gate (no DB on deny)', () => {
  it('EMR-006 EMPLOYEE / PAYROLL / FINANCE get no rows', async () => {
    expect(await getEmployeeMovement(U({ role: 'EMPLOYEE' }), {})).toEqual({ rows: [], truncated: false })
    expect(await getEmployeeMovement(U({ role: 'PAYROLL_ADMIN' }), {})).toEqual({ rows: [], truncated: false })
    expect(await getEmployeeMovement(U({ role: 'FINANCE' }), {})).toEqual({ rows: [], truncated: false })
  })

  it('EMR-007 MANAGER with no linked person → no rows', async () => {
    expect(await getEmployeeMovement(U({ role: 'MANAGER', personId: undefined }), {})).toEqual({ rows: [], truncated: false })
  })
})

describe('REPORTS:view permission enforcement', () => {
  it('EMR-008 matrix deny → getEmployeeMovement throws FORBIDDEN before any DB query', async () => {
    requirePermission.mockRejectedValueOnce(new Error('FORBIDDEN: role HR_ADMIN lacks view'))
    await expect(getEmployeeMovement(U({ role: 'HR_ADMIN' }), {})).rejects.toThrow(/FORBIDDEN/)
  })

  it('EMR-009 matrix deny → getMovementFilterOptions throws FORBIDDEN', async () => {
    requirePermission.mockRejectedValueOnce(new Error('FORBIDDEN: role HR_ADMIN lacks view'))
    await expect(getMovementFilterOptions(U({ role: 'HR_ADMIN' }))).rejects.toThrow(/FORBIDDEN/)
  })

  it('EMR-010 denied role short-circuits before the permission check (no throw)', async () => {
    // EMPLOYEE is gated out by the role list before requirePermission runs.
    await getEmployeeMovement(U({ role: 'EMPLOYEE' }), {})
    expect(requirePermission).not.toHaveBeenCalled()
  })
})

describe('getMovementFilterOptions — deny paths', () => {
  it('EMR-011 disallowed role → empty options', async () => {
    const o = await getMovementFilterOptions(U({ role: 'EMPLOYEE' }))
    expect(o.managers).toEqual([])
    expect(o.departments).toEqual([])
  })

  it('EMR-012 MANAGER without linked person → empty options', async () => {
    const o = await getMovementFilterOptions(U({ role: 'MANAGER', personId: undefined }))
    expect(o.managers).toEqual([])
  })
})

describe('SALARY_REVISION / salary exclusion contract', () => {
  const read = (rel: string) => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    return readFileSync(path.resolve(here, rel), 'utf8')
  }
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('EMR-013 MOVEMENT_ACTION_TYPES excludes SALARY_REVISION', () => {
    expect((MOVEMENT_ACTION_TYPES as readonly string[]).includes('SALARY_REVISION')).toBe(false)
  })

  it('EMR-014 movement module excludes SALARY_REVISION rows in-query', () => {
    const code = stripComments(read('../../modules/reports/employee-movement.ts'))
    expect(/ne\(\s*workerAssignments\.actionType\s*,\s*['"]SALARY_REVISION['"]\s*\)/.test(code)).toBe(true)
  })

  it('EMR-015 shared assignment-history reader excludes SALARY_REVISION rows in-query', () => {
    const code = stripComments(read('../../modules/core-hr/assignment-history.ts'))
    expect(/ne\(\s*workerAssignments\.actionType\s*,\s*['"]SALARY_REVISION['"]\s*\)/.test(code)).toBe(true)
  })

  it('EMR-016 movement module references no salary amount column', () => {
    const code = stripComments(read('../../modules/reports/employee-movement.ts'))
    expect(/basic_?salary|basicSalary|compensation|allowance|payroll/i.test(code)).toBe(false)
  })

  it('EMR-017 movement report PAGE renders no salary column', () => {
    const code = stripComments(read('../../app/(hr-admin)/reports/employee-movement/page.tsx'))
    expect(/basic_?salary|basicSalary|compensation|allowance|payroll/i.test(code)).toBe(false)
  })

  it('EMR-018 export route employee-movement branch has no salary column', () => {
    const code = stripComments(read('../../app/(hr-admin)/reports/export/route.ts'))
    // The whole file is scanned; the only salary-ish token allowed is none.
    expect(/basic_?salary|basicSalary|compensation|allowance|payroll/i.test(code)).toBe(false)
  })
})
