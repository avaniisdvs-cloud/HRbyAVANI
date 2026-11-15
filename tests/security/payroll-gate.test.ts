/**
 * Payroll feature-gate — security regression tests.
 *
 * Proves that with the payroll workstream DISABLED (default), payroll server
 * actions are blocked BEFORE any RBAC/DB work, and that RBAC remains intact and
 * is still reached when payroll is ENABLED (the gate is additional, not a
 * replacement). Also a source-contract check that every payroll mutation gates.
 *
 * Pattern mirrors tests/unit/w1-authorization.test.ts (mock auth/db/audit; the
 * gate short-circuits before any of them are touched).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAYROLL_DISABLED_MESSAGE } from '@/lib/features/payroll-feature-gate'

const requireRoleMock = vi.fn(async () => ({ id: 'U', role: 'SUPER_ADMIN', legalEntityId: 'E' }))
vi.mock('@/lib/auth', () => ({ requireRole: requireRoleMock }))
vi.mock('@/lib/db', () => ({ db: { select: vi.fn(), transaction: vi.fn(), execute: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async () => {}) }))

const actions = await import('@/modules/payroll/actions')
const assignmentActions = await import('@/modules/payroll/payroll-assignment-actions')

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.PAYROLL_WORKSTREAM_ENABLED
})

describe('payroll DISABLED — actions are blocked before RBAC/DB', () => {
  it('createPayrollRun returns the safe disabled message and never calls requireRole', async () => {
    const res = await actions.createPayrollRun({} as never)
    expect(res).toEqual({ success: false, error: PAYROLL_DISABLED_MESSAGE })
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it('calculatePayrollRun is blocked', async () => {
    const res = await actions.calculatePayrollRun('run-1')
    expect(res).toEqual({ success: false, error: PAYROLL_DISABLED_MESSAGE })
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it('lockPayrollRun is blocked', async () => {
    const res = await actions.lockPayrollRun(new FormData())
    expect(res.error).toBe(PAYROLL_DISABLED_MESSAGE)
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it('approvePayrollRun is blocked', async () => {
    const res = await actions.approvePayrollRun(new FormData())
    expect(res.error).toBe(PAYROLL_DISABLED_MESSAGE)
  })

  it('generateWpsSif is blocked', async () => {
    const res = await actions.generateWpsSif('run-1')
    expect(res.error).toBe(PAYROLL_DISABLED_MESSAGE)
  })

  it('confirmPayrollRun is blocked', async () => {
    const res = await actions.confirmPayrollRun('run-1')
    expect(res.error).toBe(PAYROLL_DISABLED_MESSAGE)
  })

  it('triggerEosbCalculation is blocked', async () => {
    const res = await actions.triggerEosbCalculation(new FormData())
    expect(res.error).toBe(PAYROLL_DISABLED_MESSAGE)
  })

  it('assignToPayroll (payroll-assignment-actions) is blocked before RBAC', async () => {
    const res = await assignmentActions.assignToPayroll({} as never)
    expect(res).toEqual({ error: PAYROLL_DISABLED_MESSAGE })
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it('correctPayrollAssignment is blocked before RBAC', async () => {
    const res = await assignmentActions.correctPayrollAssignment({} as never)
    expect(res).toEqual({ error: PAYROLL_DISABLED_MESSAGE })
    expect(requireRoleMock).not.toHaveBeenCalled()
  })
})

describe('payroll ENABLED — RBAC is preserved (gate is additional, not a replacement)', () => {
  it('calculatePayrollRun passes the gate and STILL reaches requireRole', async () => {
    process.env.PAYROLL_WORKSTREAM_ENABLED = 'true'
    // Past the gate it hits requireRole (mocked) then the mocked db throws and is
    // caught — we only assert that the RBAC check was reached, proving it is intact.
    const res = await actions.calculatePayrollRun('run-1')
    expect(requireRoleMock).toHaveBeenCalledTimes(1)
    expect(res.error).not.toBe(PAYROLL_DISABLED_MESSAGE)
  })
})

describe('source-contract — every payroll mutation is gated', () => {
  const root = process.cwd()
  const actionsSrc = readFileSync(join(root, 'modules/payroll/actions.ts'), 'utf8')
  const assignSrc = readFileSync(join(root, 'modules/payroll/payroll-assignment-actions.ts'), 'utf8')
  const layoutSrc = readFileSync(join(root, 'app/(hr-admin)/payroll/layout.tsx'), 'utf8')

  it('actions.ts imports the gate and applies it to all 12 mutating actions', () => {
    expect(actionsSrc).toMatch(/from '@\/lib\/features\/payroll-feature-gate'/)
    const gates = actionsSrc.match(/if \(!isPayrollWorkstreamEnabled\(\)\) return \{ success: false, error: PAYROLL_DISABLED_MESSAGE \}/g)
    expect(gates?.length).toBe(12)
  })

  it('payroll-assignment-actions.ts gates both assignment mutations', () => {
    expect(assignSrc).toMatch(/from '@\/lib\/features\/payroll-feature-gate'/)
    const gates = assignSrc.match(/if \(!isPayrollWorkstreamEnabled\(\)\) return \{ error: PAYROLL_DISABLED_MESSAGE \}/g)
    expect(gates?.length).toBe(2)
  })

  it('payroll layout blocks routes with a safe disabled notice', () => {
    expect(layoutSrc).toMatch(/isPayrollWorkstreamEnabled/)
    expect(layoutSrc).toMatch(/PAYROLL_DISABLED_MESSAGE/)
    // RBAC role check must remain in the layout (not weakened).
    expect(layoutSrc).toMatch(/PAYROLL_ROLES\.includes/)
  })
})
