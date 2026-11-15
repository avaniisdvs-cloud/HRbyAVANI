/**
 * P0 escaped-defect regression — Manager approval inbox single source of truth.
 *
 * Root cause: the Manager Overview counted team-initiated IN_PROGRESS workflow
 * INSTANCES, while the Approvals page / bell counted PENDING STEP-INSTANCES
 * assigned to the actor. For K1207 this read "3" on Overview and "0 / All
 * caught up" on Approvals. Separately, a CANCELLED leave (LR-0000001) whose
 * workflow instance stayed IN_PROGRESS surfaced as "awaiting approval" with
 * live Approve/Reject buttons.
 *
 * These tests pin the fix:
 *  A. getActionableApprovalInbox is THE source of truth and excludes terminal
 *     resources (cancelled leave) and terminal workflows.
 *  B. getPendingApprovalsV2 is derived from it (same definition everywhere).
 *  C. Every surface wires to the single source (source-inspection) so Overview
 *     and Approvals can never diverge again.
 *  D. The server enforces the rule (resource-terminal guard in the engine; bell
 *     detail exposes isActionable; panel gates buttons on it).
 *
 * DB and auth are mocked — runs without Postgres.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Row = Record<string, unknown>
const mockState: { fromQueue: Row[][]; currentUser: { id: string; personId: string | null; role: string; name: string; legalEntityId?: string } } = {
  fromQueue:   [],
  currentUser: { id: 'u-mgr', personId: 'mgr-1', role: 'MANAGER', name: 'Dorababu Kethari', legalEntityId: 'le-1' },
}

const buildSelect = () => {
  const pop = () => Promise.resolve(mockState.fromQueue.shift() ?? [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    from: () => b, leftJoin: () => b, innerJoin: () => b, where: () => b,
    orderBy: () => b, groupBy: () => b, limit: () => pop(),
    then: (res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) => pop().then(res, rej),
  }
  return b
}

vi.mock('@/lib/db', () => ({
  db: {
    select:      () => buildSelect(),
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn({}),
  },
}))
vi.mock('@/lib/auth', () => ({
  requireRole:    (_r: string[]) => Promise.resolve(mockState.currentUser),
  getCurrentUser: () => Promise.resolve(mockState.currentUser),
}))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/drizzle/schema', () => ({ persons: {}, absenceEntries: {}, absenceTypes: {} }))
vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowStepInstances: {}, workflowInstancesV2: {}, workflowDefinitionsV2: {},
  workflowStepsV2: {}, workflowAuditLog: {}, approvalGroups: {},
}))

import { getActionableApprovalInbox, getPendingApprovalsV2 } from '@/modules/workflow/queries'

// Build one inbox DB row in the exact nested shape the query selects.
function row(opts: { stepId?: string; instanceStatus: string; absenceStatus: string | null; resourceType?: string }): Row {
  return {
    stepInstance: { id: opts.stepId ?? 's1', stepId: 'def-step', stepOrder: 2, slaDeadline: null, decidedAt: null, assignedToPersonId: 'mgr-1' },
    instance:     { id: 'i-' + (opts.stepId ?? 's1'), resourceId: 'r-' + (opts.stepId ?? 's1'), status: opts.instanceStatus, resourceType: opts.resourceType ?? 'absence_entries', initiatedByPersonId: 'emp-1', startedAt: new Date('2026-06-01') },
    definition:   { workflowCode: 'WF-LEAVE', workflowNameEn: 'Leave Approval' },
    step:         { stepNameEn: 'HR Admin', isFyiOnly: false, canDelegate: true },
    initiatorName: 'Shakeel Haider Khan',
    absenceStatus: opts.absenceStatus,
    absenceStart:  '2026-06-10',
    absenceEnd:    '2026-06-12',
    leaveTypeName: 'Annual Leave',
  }
}

beforeEach(() => { mockState.fromQueue = []; mockState.currentUser = { id: 'u-mgr', personId: 'mgr-1', role: 'MANAGER', name: 'Dorababu Kethari', legalEntityId: 'le-1' } })

describe('A — getActionableApprovalInbox actionability contract', () => {
  it('a live leave with a PENDING step assigned to me is actionable', async () => {
    mockState.fromQueue = [[ row({ stepId: 'live', instanceStatus: 'IN_PROGRESS', absenceStatus: 'PENDING' }) ]]
    const inbox = await getActionableApprovalInbox()
    expect(inbox).toHaveLength(1)
    expect(inbox[0].isActionable).toBe(true)
    expect(inbox[0].actionDisabledReason).toBeNull()
    expect(inbox[0].businessStatus).toBe('PENDING')
  })

  it('a CANCELLED leave whose workflow stayed IN_PROGRESS is NOT actionable (LR-0000001 class)', async () => {
    mockState.fromQueue = [[ row({ stepId: 'cancelled', instanceStatus: 'IN_PROGRESS', absenceStatus: 'CANCELLED' }) ]]
    const inbox = await getActionableApprovalInbox()
    expect(inbox).toHaveLength(1)
    expect(inbox[0].isActionable).toBe(false)
    expect(inbox[0].actionDisabledReason).toMatch(/CANCELLED/)
  })

  it('a terminal workflow (REJECTED) is NOT actionable', async () => {
    mockState.fromQueue = [[ row({ stepId: 'rej', instanceStatus: 'REJECTED', absenceStatus: 'PENDING' }) ]]
    const inbox = await getActionableApprovalInbox()
    expect(inbox[0].isActionable).toBe(false)
  })

  it('returns no rows when the actor has no personId (identity gate)', async () => {
    mockState.currentUser = { id: 'u', personId: null, role: 'MANAGER', name: 'x' }
    expect(await getActionableApprovalInbox()).toEqual([])
  })
})

describe('B — getPendingApprovalsV2 is derived from the single source', () => {
  it('excludes cancelled/terminal items so the Pending count matches the inbox', async () => {
    const rows = [
      row({ stepId: 'live1', instanceStatus: 'IN_PROGRESS', absenceStatus: 'PENDING' }),
      row({ stepId: 'cancelled', instanceStatus: 'IN_PROGRESS', absenceStatus: 'CANCELLED' }),
      row({ stepId: 'live2', instanceStatus: 'IN_PROGRESS', absenceStatus: 'PENDING' }),
    ]
    // getActionableApprovalInbox + getPendingApprovalsV2 each run one select.
    mockState.fromQueue = [rows, rows.map(r => ({ ...r }))]
    const inbox = await getActionableApprovalInbox()
    const pending = await getPendingApprovalsV2()
    // The Pending tab count == the actionable inbox count (NEVER the raw count).
    expect(inbox.filter(r => r.isActionable)).toHaveLength(2)
    expect(pending).toHaveLength(2)
    expect(pending.map(p => p.stepInstanceId).sort()).toEqual(['live1', 'live2'])
  })
})

// ── C & D — cross-surface wiring (regression-proofs the SSOT can't be undone) ──
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('C — every surface derives from the single source of truth', () => {
  it('Manager Overview uses getActionableApprovalInbox, NOT a team-initiated instance query', () => {
    const dash = read('app/(hr-admin)/dashboard/page.tsx')
    expect(dash).toContain('getActionableApprovalInbox()')
    // The old divergent definition must be gone.
    expect(dash).not.toContain('inArray(workflowInstancesV2.initiatedByPersonId, teamPersonIds)')
    expect(dash).toContain('pendingApprovals={actionableInbox.length}')
  })
  it('Approvals page and /workflows both use getPendingApprovalsV2 (the derived inbox)', () => {
    expect(read('app/(hr-admin)/approvals/page.tsx')).toContain('getPendingApprovalsV2()')
    expect(read('app/(hr-admin)/workflows/page.tsx')).toContain('getPendingApprovalsV2()')
  })
  it('getPendingApprovalsV2 is implemented in terms of getActionableApprovalInbox', () => {
    const q = read('modules/workflow/queries.ts')
    expect(q).toMatch(/getPendingApprovalsV2[\s\S]{0,200}getActionableApprovalInbox\(\)/)
  })
})

describe('D — server + bell enforce the rule', () => {
  it('the workflow engine refuses an action when the underlying resource is terminal', () => {
    const engine = read('lib/workflow-engine.ts')
    expect(engine).toContain('Resource-terminal guard')
    expect(engine).toMatch(/ABSENCE_TERMINAL[\s\S]{0,120}CANCELLED/)
    expect(engine).toMatch(/can no longer be approved or rejected/)
  })
  it('the notification bell exposes isActionable and gates buttons on it', () => {
    const panel = read('components/topbar/NotificationPanel.tsx')
    expect(panel).toContain("detail?.isActionable === true")
    const topbar = read('modules/notification/topbar-actions.ts')
    expect(topbar).toContain('TERMINAL_RESOURCE_STATUSES')
    expect(topbar).toContain('actionability(')
  })
})
