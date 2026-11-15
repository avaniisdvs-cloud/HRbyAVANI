/**
 * Foundation Stewardship P2-T3 — self-approval prevention (BR-WF-SOD-001).
 * Pure-guard behavior + source assertion that takeWorkflowAction enforces it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { evaluateSelfApprovalGuard } from '@/lib/workflow-guards'

const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002'

describe('P2-T3 evaluateSelfApprovalGuard', () => {
  it('blocks APPROVE when actor initiated the instance', () => {
    const v = evaluateSelfApprovalGuard({
      decision: 'APPROVE', actorPersonId: ACTOR, initiatedByPersonId: ACTOR, isSystemAction: false,
    })
    expect(v.blocked).toBe(true)
    expect(v.code).toBe('SELF_APPROVAL')
    expect(v.error).toMatch(/SELF_APPROVAL_BLOCKED/)
  })

  it('blocks REJECT-from-queue by the initiator (must use Cancel)', () => {
    const v = evaluateSelfApprovalGuard({
      decision: 'REJECT', actorPersonId: ACTOR, initiatedByPersonId: ACTOR, isSystemAction: false,
    })
    expect(v.blocked).toBe(true)
    expect(v.code).toBe('SELF_REJECTION')
  })

  it('blocks DELEGATE to the instance initiator', () => {
    const v = evaluateSelfApprovalGuard({
      decision: 'DELEGATE', actorPersonId: OTHER, initiatedByPersonId: ACTOR,
      delegateToPersonId: ACTOR, isSystemAction: false,
    })
    expect(v.blocked).toBe(true)
    expect(v.code).toBe('DELEGATE_TO_INITIATOR')
  })

  it('blocks DELEGATE to self', () => {
    const v = evaluateSelfApprovalGuard({
      decision: 'DELEGATE', actorPersonId: OTHER, initiatedByPersonId: ACTOR,
      delegateToPersonId: OTHER, isSystemAction: false,
    })
    expect(v.blocked).toBe(true)
    expect(v.code).toBe('DELEGATE_TO_SELF')
  })

  it('allows a different approver to APPROVE / REJECT / DELEGATE', () => {
    for (const decision of ['APPROVE', 'REJECT'] as const) {
      expect(evaluateSelfApprovalGuard({
        decision, actorPersonId: OTHER, initiatedByPersonId: ACTOR, isSystemAction: false,
      }).blocked).toBe(false)
    }
    expect(evaluateSelfApprovalGuard({
      decision: 'DELEGATE', actorPersonId: OTHER, initiatedByPersonId: ACTOR,
      delegateToPersonId: 'cccccccc-0000-0000-0000-000000000003', isSystemAction: false,
    }).blocked).toBe(false)
  })

  it('exempts the SYSTEM actor (SLA auto-actions)', () => {
    expect(evaluateSelfApprovalGuard({
      decision: 'APPROVE', actorPersonId: ACTOR, initiatedByPersonId: ACTOR, isSystemAction: true,
    }).blocked).toBe(false)
  })

  it('passes through when instance has no initiator recorded', () => {
    expect(evaluateSelfApprovalGuard({
      decision: 'APPROVE', actorPersonId: ACTOR, initiatedByPersonId: null, isSystemAction: false,
    }).blocked).toBe(false)
  })

  it('applies to privileged roles too — guard has no role parameter by design', () => {
    // The guard is role-blind: privileged override in takeWorkflowAction grants
    // authority over OTHERS' steps; it must never license self-approval.
    const v = evaluateSelfApprovalGuard({
      decision: 'APPROVE', actorPersonId: ACTOR, initiatedByPersonId: ACTOR, isSystemAction: false,
    })
    expect(v.blocked).toBe(true)
  })
})

describe('P2-T3 source wiring — takeWorkflowAction enforces the guard', () => {
  const engine = readFileSync(resolve(__dirname, '../../lib/workflow-engine.ts'), 'utf8')

  it('imports and invokes evaluateSelfApprovalGuard before any decision branch', () => {
    expect(engine).toMatch(/from '@\/lib\/workflow-guards'/)
    const guardIdx    = engine.indexOf('evaluateSelfApprovalGuard({')
    const delegateIdx = engine.indexOf("if (decision === 'DELEGATE')")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(delegateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(delegateIdx)
  })

  it('audits blocked attempts via the immutable audit log', () => {
    expect(engine).toMatch(/WORKFLOW\.SELF_APPROVAL_BLOCKED/)
  })
})
