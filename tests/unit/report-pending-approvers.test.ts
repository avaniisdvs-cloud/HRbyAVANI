/**
 * Manager Reports — Leave Summary "Pending with <approver>" labels
 *
 * resolvePendingApprovers is the batched resolver that powers the inline
 * approver line under a PENDING status in the Leave Summary report. It resolves
 * the current approver for many workflow instances in one query.
 *
 * Tests:
 *   RPA-001: empty input → empty map (no query, no crash)
 *   RPA-002: assigned person → PERSON label (EN + AR fall back to EN when no AR)
 *   RPA-003: delegated approver wins over assigned → "(delegated)" label
 *   RPA-004: group step → "(approval group)" label
 *   RPA-005: role step → readable role label
 *   RPA-006: config warning (no assignee) → empty labels (caller shows "Pending" only)
 *   RPA-007: multiple instances resolved together; lowest stepOrder wins per instance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Single-query mock: resolvePendingApprovers issues exactly one select() ────

type Row = Record<string, unknown>
let resultRows: Row[] = []

function buildChain(rows: Row[]) {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: Row[]) => unknown) => Promise.resolve(rows).then(resolve)
      }
      return () => proxy
    },
  })
  return proxy
}

vi.mock('@/lib/db', () => ({
  db: { get select() { return () => buildChain(resultRows) } },
}))

vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowStepInstances: { instanceId: {}, stepId: {}, stepOrder: {}, status: {}, assignedToPersonId: {}, assignedToGroupId: {}, delegatedToPersonId: {} },
  workflowInstancesV2:   {},
  workflowDefinitionsV2: {},
  workflowStepsV2:       { id: {}, stepNameEn: {}, hierarchyRole: {} },
  workflowAuditLog:      {},
  approvalGroups:        { id: {}, groupNameEn: {}, groupNameAr: {} },
}))

vi.mock('@/drizzle/schema', () => ({
  persons:        { id: {}, fullNameEn: {}, fullNameAr: {} },
  absenceEntries: {},
  absenceTypes:   {},
}))

vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/lib/auth',      () => ({ requireRole: vi.fn().mockResolvedValue({}) }))

vi.mock('drizzle-orm', () => ({
  eq: () => ({}), and: (...a: unknown[]) => ({ _and: a }),
  inArray: () => ({}), desc: () => ({}), isNull: () => ({}),
}))
vi.mock('drizzle-orm/pg-core', () => ({ alias: (t: unknown) => t }))

const { resolvePendingApprovers } = await import('@/modules/workflow/queries')

beforeEach(() => { resultRows = [] })

describe('resolvePendingApprovers (batched)', () => {
  it('RPA-001: empty input returns empty map without querying', async () => {
    const out = await resolvePendingApprovers([])
    expect(out).toEqual({})
  })

  it('RPA-002: assigned person → PERSON label, AR falls back to EN', async () => {
    resultRows = [{
      instanceId: 'wi-1', hierarchyRole: null,
      assignedPersonEn: 'Ahmed Al Rashidi', assignedPersonAr: null,
      assignedToGroupId: null, groupNameEn: null, groupNameAr: null,
      delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null,
    }]
    const out = await resolvePendingApprovers(['wi-1'])
    expect(out['wi-1'].approverType).toBe('PERSON')
    expect(out['wi-1'].approverLabelEn).toBe('Ahmed Al Rashidi')
    expect(out['wi-1'].approverLabelAr).toBe('Ahmed Al Rashidi')
  })

  it('RPA-003: delegated approver wins over assigned person', async () => {
    resultRows = [{
      instanceId: 'wi-1', hierarchyRole: null,
      assignedPersonEn: 'Original Manager', assignedPersonAr: null,
      assignedToGroupId: null, groupNameEn: null, groupNameAr: null,
      delegatedToPersonId: 'p-del', delegatedPersonEn: 'Sara Khalil', delegatedPersonAr: 'سارة خليل',
    }]
    const out = await resolvePendingApprovers(['wi-1'])
    expect(out['wi-1'].approverType).toBe('DELEGATED')
    expect(out['wi-1'].approverLabelEn).toBe('Sara Khalil (delegated)')
    expect(out['wi-1'].approverLabelAr).toContain('سارة خليل')
  })

  it('RPA-004: group step → approval-group label', async () => {
    resultRows = [{
      instanceId: 'wi-1', hierarchyRole: null,
      assignedPersonEn: null, assignedPersonAr: null,
      assignedToGroupId: 'g-1', groupNameEn: 'HR Approvals', groupNameAr: null,
      delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null,
    }]
    const out = await resolvePendingApprovers(['wi-1'])
    expect(out['wi-1'].approverType).toBe('GROUP')
    expect(out['wi-1'].approverLabelEn).toBe('HR Approvals (approval group)')
  })

  it('RPA-005: role step → readable role label, not raw enum', async () => {
    resultRows = [{
      instanceId: 'wi-1', hierarchyRole: 'HR_ADMIN',
      assignedPersonEn: null, assignedPersonAr: null,
      assignedToGroupId: null, groupNameEn: null, groupNameAr: null,
      delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null,
    }]
    const out = await resolvePendingApprovers(['wi-1'])
    expect(out['wi-1'].approverType).toBe('ROLE')
    expect(out['wi-1'].approverLabelEn).toBe('Hr Admin')
  })

  it('RPA-006: no assignee → CONFIG_WARNING with empty labels (caller shows bare "Pending")', async () => {
    resultRows = [{
      instanceId: 'wi-1', hierarchyRole: null,
      assignedPersonEn: null, assignedPersonAr: null,
      assignedToGroupId: null, groupNameEn: null, groupNameAr: null,
      delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null,
    }]
    const out = await resolvePendingApprovers(['wi-1'])
    expect(out['wi-1'].approverType).toBe('CONFIG_WARNING')
    expect(out['wi-1'].approverLabelEn).toBe('')
    expect(out['wi-1'].approverLabelAr).toBe('')
  })

  it('RPA-007: multiple instances resolved; lowest stepOrder wins per instance', async () => {
    // Rows arrive ordered by stepOrder asc. wi-1 has two PENDING steps; the first
    // seen (Line Manager) must win over the later (HR Director).
    resultRows = [
      { instanceId: 'wi-1', hierarchyRole: null, assignedPersonEn: 'Line Manager', assignedPersonAr: null, assignedToGroupId: null, groupNameEn: null, groupNameAr: null, delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null },
      { instanceId: 'wi-2', hierarchyRole: null, assignedPersonEn: 'Other Approver', assignedPersonAr: null, assignedToGroupId: null, groupNameEn: null, groupNameAr: null, delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null },
      { instanceId: 'wi-1', hierarchyRole: null, assignedPersonEn: 'HR Director', assignedPersonAr: null, assignedToGroupId: null, groupNameEn: null, groupNameAr: null, delegatedToPersonId: null, delegatedPersonEn: null, delegatedPersonAr: null },
    ]
    const out = await resolvePendingApprovers(['wi-1', 'wi-2'])
    expect(out['wi-1'].approverLabelEn).toBe('Line Manager')
    expect(out['wi-2'].approverLabelEn).toBe('Other Approver')
  })
})
