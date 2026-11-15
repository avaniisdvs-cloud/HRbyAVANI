/**
 * Foundation Stewardship P3-D2 — runtime feature-permission enforcement.
 * Resolver semantics (deny / allow / legacy-allow / non-matrixed passthrough),
 * deny behavior with a mocked matrix row, cache invalidation, and wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROW = (overrides: Partial<Record<'employee' | 'manager' | 'hrAdmin', Partial<Record<string, boolean>>>> = {}) => ({
  employeePerms: { view: false, create: false, edit: false, delete: false, approve: false, export: false, ...overrides.employee },
  managerPerms:  { view: true,  create: false, edit: false, delete: false, approve: false, export: false, ...overrides.manager },
  hrAdminPerms:  { view: true,  create: true,  edit: true,  delete: false, approve: true,  export: true,  ...overrides.hrAdmin },
})

// Mock the db so requirePermission's matrix load is controllable.
const selectResult: { rows: unknown[] } = { rows: [] }
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResult.rows,
        }),
      }),
    }),
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { evaluatePermission, requirePermission, invalidatePermissionCache } from '@/lib/permissions'

beforeEach(() => { invalidatePermissionCache(); selectResult.rows = [] })

describe('P3-D2 evaluatePermission (pure)', () => {
  it('DENY when a matrix row exists and the action is false for the role', () => {
    expect(evaluatePermission('EMPLOYEE', ROW(), 'create')).toBe('DENY')
    expect(evaluatePermission('HR_ADMIN', ROW(), 'delete')).toBe('DENY')
  })

  it('ALLOW when the matrix grants the action', () => {
    expect(evaluatePermission('MANAGER', ROW(), 'view')).toBe('ALLOW')
    expect(evaluatePermission('HR_ADMIN', ROW(), 'approve')).toBe('ALLOW')
  })

  it('LEGACY_ALLOW when no matrix row exists (backward compatibility)', () => {
    expect(evaluatePermission('EMPLOYEE', null, 'view')).toBe('LEGACY_ALLOW')
  })

  it('non-matrixed roles pass through (requireRole remains their gate)', () => {
    for (const role of ['SUPER_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', undefined]) {
      expect(evaluatePermission(role, ROW(), 'delete')).toBe('ROLE_NOT_MATRIXED')
    }
  })
})

describe('P3-D2 requirePermission (resolver + cache)', () => {
  it('throws FORBIDDEN on deny and resolves on allow', async () => {
    selectResult.rows = [ROW()]
    await expect(
      requirePermission({ role: 'EMPLOYEE', personId: 'p1' }, 'EMPLOYEE_CREATE', 'create'),
    ).rejects.toThrow(/^FORBIDDEN:/)
    invalidatePermissionCache()
    selectResult.rows = [ROW()]
    await expect(
      requirePermission({ role: 'HR_ADMIN', personId: 'p1' }, 'EMPLOYEE_CREATE', 'create'),
    ).resolves.toBeUndefined()
  })

  it('legacy-allows when the feature has no matrix row', async () => {
    selectResult.rows = []
    await expect(
      requirePermission({ role: 'EMPLOYEE', personId: 'p1' }, 'UNREGISTERED_FEATURE', 'delete'),
    ).resolves.toBeUndefined()
  })

  it('cache invalidation makes a changed row take effect immediately', async () => {
    selectResult.rows = [ROW({ employee: { view: true } })]
    await expect(requirePermission({ role: 'EMPLOYEE' }, 'REPORTS', 'view')).resolves.toBeUndefined()
    // flip to deny — without invalidation the 60s cache would still allow
    selectResult.rows = [ROW({ employee: { view: false } })]
    invalidatePermissionCache('REPORTS')
    await expect(requirePermission({ role: 'EMPLOYEE' }, 'REPORTS', 'view')).rejects.toThrow(/FORBIDDEN/)
  })
})

describe('P3-D2 source wiring', () => {
  it('admin save action invalidates the resolver cache', () => {
    const src = readFileSync(resolve(__dirname, '../../modules/access/actions.ts'), 'utf8')
    expect(src).toMatch(/invalidatePermissionCache\(row\.featureKey\)/)
  })

  it('representative server actions call requirePermission after requireRole', () => {
    const coreHr = readFileSync(resolve(__dirname, '../../modules/core-hr/actions.ts'), 'utf8')
    expect(coreHr).toMatch(/requirePermission\(user, 'EMPLOYEE_CREATE', 'create'\)/)
    expect(coreHr).toMatch(/requirePermission\(user, 'EMPLOYEE_PROFILE', 'edit'\)/)
    const report = readFileSync(resolve(__dirname, '../../modules/reports/employee-history.ts'), 'utf8')
    expect(report).toMatch(/requirePermission\(user, 'REPORTS', 'view'\)/)
  })

  it('CoreHR lifecycle and profile subrecord actions are wired to seeded feature keys', () => {
    const workerAssignments = readFileSync(resolve(__dirname, '../../modules/core-hr/worker-assignments/actions.ts'), 'utf8')
    expect(workerAssignments).toContain("requirePermission(user, 'ASSIGNMENTS', 'create')")
    expect(workerAssignments).toContain("requirePermission(user, 'ASSIGNMENTS', 'edit')")

    const contracts = readFileSync(resolve(__dirname, '../../modules/core-hr/contracts/actions.ts'), 'utf8')
    expect(contracts).toContain("requirePermission(user, 'ASSIGNMENTS', 'create')")
    expect(contracts.match(/requirePermission\(user, 'ASSIGNMENTS', 'edit'\)/g)?.length).toBeGreaterThanOrEqual(3)

    const employmentActions = readFileSync(resolve(__dirname, '../../modules/core-hr/employment-actions/actions.ts'), 'utf8')
    expect(employmentActions).toContain("requirePermission(user, 'ASSIGNMENTS', 'create')")
    expect(employmentActions.match(/requirePermission\(user, 'ASSIGNMENTS', 'edit'\)/g)?.length).toBeGreaterThanOrEqual(2)

    const workSchedules = readFileSync(resolve(__dirname, '../../modules/core-hr/work-schedule-assignment-actions.ts'), 'utf8')
    expect(workSchedules.match(/requirePermission\(actor, 'ASSIGNMENTS', 'edit'\)/g)?.length).toBe(2)

    for (const file of [
      '../../modules/core-hr/bank-details/actions.ts',
      '../../modules/core-hr/dependents/actions.ts',
      '../../modules/core-hr/contacts/actions.ts',
      '../../modules/core-hr/documents/actions.ts',
    ]) {
      const src = readFileSync(resolve(__dirname, file), 'utf8')
      expect(src).toContain("'EMPLOYEE_PROFILE'")
      expect(src).toContain("'edit'")
    }
  })

  it('feature permission administration is guarded in the server action, not only the page', () => {
    const access = readFileSync(resolve(__dirname, '../../modules/access/actions.ts'), 'utf8')
    expect(access).toContain("requireRole(['SUPER_ADMIN'])")
    expect(access).toContain("requirePermission(user, 'FEATURE_PERMISSIONS', 'view')")
    expect(access).toContain("requirePermission(user, 'FEATURE_PERMISSIONS', 'edit')")
  })

  it('resolver never widens access — documented contract: call AFTER requireRole', () => {
    const src = readFileSync(resolve(__dirname, '../../lib/permissions.ts'), 'utf8')
    expect(src).toMatch(/never widens access/i)
  })
})
