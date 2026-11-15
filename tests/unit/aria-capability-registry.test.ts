// @vitest-environment node
/**
 * ARIA Capability Contract / Registry tests.
 *
 * Locks in the governance guarantees the registry encodes: state-changing
 * capabilities must route through the workflow engine, reads must not, and
 * self-service capabilities require a linked person.
 */
import { describe, it, expect } from 'vitest'
import {
  ARIA_CAPABILITY_REGISTRY,
  getCapabilityByIntent,
  stateChangingCapabilities,
} from '@/lib/aria/capabilities/registry'

describe('ARIA Capability Registry', () => {
  it('every capability is well-formed', () => {
    for (const cap of Object.values(ARIA_CAPABILITY_REGISTRY)) {
      expect(cap.name).toBeTruthy()
      expect(cap.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(cap.owner).toBeTruthy()
      expect(['read', 'draft', 'write']).toContain(cap.kind)
      expect(typeof cap.auditRequired).toBe('boolean')
      expect(typeof cap.workflowRequired).toBe('boolean')
    }
  })

  it('Rule 2: only write capabilities route through the workflow engine', () => {
    for (const cap of Object.values(ARIA_CAPABILITY_REGISTRY)) {
      if (cap.workflowRequired) expect(cap.kind).toBe('write')
      if (cap.kind === 'read') expect(cap.workflowRequired).toBe(false)
    }
  })

  it('submitLeaveRequest is the state-changing capability and is workflow + audit gated', () => {
    const submit = ARIA_CAPABILITY_REGISTRY.submitLeaveRequest
    expect(submit.kind).toBe('write')
    expect(submit.workflowRequired).toBe(true)
    expect(submit.auditRequired).toBe(true)
    expect(stateChangingCapabilities().map(c => c.name)).toContain('submitLeaveRequest')
  })

  it('draftLeaveRequest never writes (requires confirmation, no workflow yet)', () => {
    const draft = ARIA_CAPABILITY_REGISTRY.draftLeaveRequest
    expect(draft.kind).toBe('draft')
    expect(draft.workflowRequired).toBe(false)
  })

  it('getMyManager is self-service and requires a linked person', () => {
    const cap = getCapabilityByIntent('ORG_CHART_QUERY')
    expect(cap?.name).toBe('getMyManager')
    expect(cap?.rbacScope.requiresPerson).toBe(true)
    expect(cap?.rbacScope.selfServiceOnly).toBe(true)
  })

  it('admin capabilities are role-restricted', () => {
    expect(getCapabilityByIntent('COMPLIANCE_QUERY')?.rbacScope.roles).toBeDefined()
    expect(getCapabilityByIntent('TEAM_QUERY')?.rbacScope.roles).toContain('MANAGER')
  })

  it('every audit-required capability is recorded (all capabilities audit by Hard Rule 1)', () => {
    for (const cap of Object.values(ARIA_CAPABILITY_REGISTRY)) {
      expect(cap.auditRequired).toBe(true)
    }
  })
})
