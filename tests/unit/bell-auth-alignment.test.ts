import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateViewerAccess, type AccessFacts } from '@/modules/workflow-intelligence/access'

/**
 * Bell workflow-detail authorization alignment — BELL-001…010
 *
 * getApprovalDetail (notification bell) now shares the Phase B decision
 * (evaluateViewerAccess) + the bell's legitimate notification-recipient signal.
 */
const SRC = readFileSync(join(process.cwd(), 'modules/notification/topbar-actions.ts'), 'utf8')

// Non-stakeholder employee, different entity.
const base = (): AccessFacts => ({
  role: 'EMPLOYEE', personId: 'P-VIEWER', viewerLegalEntityId: 'E2',
  initiatedByPersonId: 'P-OWNER', instanceLegalEntityId: 'E1',
  stepAssigneePersonIds: ['P-MGR', 'P-HR'], isDeciderOrDelegate: false,
})

describe('Bell authorization decision matrix (BELL-001…008)', () => {
  it('BELL-001: unrelated employee → denied', () =>
    expect(evaluateViewerAccess(base())).toBe(false))
  it('BELL-002: unrelated manager → denied', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'MANAGER' })).toBe(false))
  it('BELL-003: HR_ADMIN outside legal entity → denied', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'HR_ADMIN', viewerLegalEntityId: 'E2' })).toBe(false))
  it('BELL-004: HR_ADMIN inside legal entity → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'HR_ADMIN', viewerLegalEntityId: 'E1' })).toBe(true))
  it('BELL-005: HR_DIRECTOR inside legal entity → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'HR_DIRECTOR', viewerLegalEntityId: 'E1' })).toBe(true))
  it('BELL-006: SUPER_ADMIN → allowed globally', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'SUPER_ADMIN' })).toBe(true))
  it('BELL-007: initiator → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), personId: 'P-OWNER' })).toBe(true))
  it('BELL-008: in-chain approver/decider → allowed', () => {
    expect(evaluateViewerAccess({ ...base(), personId: 'P-HR' })).toBe(true)              // assignee
    expect(evaluateViewerAccess({ ...base(), isDeciderOrDelegate: true })).toBe(true)     // decider/delegate
  })
})

describe('Bell integration wiring (BELL-009…010)', () => {
  it('BELL-009: getApprovalDetail uses evaluateViewerAccess + recipient fallback, fails closed', () => {
    expect(SRC).toContain("import { evaluateViewerAccess } from '@/modules/workflow-intelligence/access'")
    expect(SRC).toContain('let allowed = evaluateViewerAccess({')
    // notification recipient is an additional stakeholder signal, only when the gate denies
    expect(SRC).toMatch(/if \(!allowed && pid\)[\s\S]*allowed = !!notifRow/)
    expect(SRC).toContain('if (!allowed) {')
    expect(SRC).toContain("throw new Error('FORBIDDEN: you do not have access to this approval')")
  })
  it('BELL-010: old hardcoded HR_ADMIN-or-SUPER_ADMIN bypass is gone', () => {
    expect(SRC).not.toContain("if (user.role !== 'HR_ADMIN' && user.role !== 'SUPER_ADMIN')")
  })
})
