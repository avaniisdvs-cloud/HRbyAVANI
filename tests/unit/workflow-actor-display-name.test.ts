/**
 * ISSUE-001 — Workflow actor display name tests
 *
 * Proves that workflow completion and notification creation use a human-readable
 * actor display name, never a raw UUID, in user-facing / display fields.
 * ID fields (updatedBy, decidedByPersonId) correctly remain UUIDs.
 *
 * Tests:
 *   WAN-001: dispatchResourceCompletion leave notification uses actorDisplayName for createdByName (not UUID)
 *   WAN-002: dispatchResourceCompletion absence_entries update uses actorDisplayName for updatedByName (not UUID)
 *   WAN-003: takeWorkflowAction decision record uses actorDisplayName for updatedByName (not UUID)
 *   WAN-004: ID fields (updatedBy, decidedByPersonId) still use actorPersonId — UUID preserved in references
 *   WAN-005: writeAudit calls in takeWorkflowAction pass actorName: actorDisplayName (not defaulting to SYSTEM_ACTOR.name)
 *   WAN-006: resolvePendingApprover (ARIA) still exists in workflow/queries.ts — unaffected by this fix
 *   WAN-007: resolveActorDisplayName returns person's fullNameEn for a known person
 *   WAN-008: resolveActorDisplayName returns 'Workflow approver' for unknown person — never leaks UUID
 *   WAN-009: resolveActorDisplayName returns SYSTEM_ACTOR.name for the system actor ID (no DB round-trip)
 *   WAN-010: resolveActorDisplayName output never matches a raw UUID pattern regardless of input
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

// ── Static source reads ───────────────────────────────────────────────────────

const workflowEngineSource   = fs.readFileSync(path.join(ROOT, 'lib/workflow-engine.ts'), 'utf-8')
const workflowQueriesSource  = fs.readFileSync(path.join(ROOT, 'modules/workflow/queries.ts'), 'utf-8')

// ── Source-section extractors ─────────────────────────────────────────────────

/** Returns the source slice for dispatchResourceCompletion. */
function getDispatchSection(): string {
  const start = workflowEngineSource.indexOf('async function dispatchResourceCompletion')
  const end   = workflowEngineSource.indexOf('\nasync function takeWorkflowAction', start)
  return workflowEngineSource.slice(start, end)
}

/** Returns the source slice for takeWorkflowAction. */
function getTakeActionSection(): string {
  const start = workflowEngineSource.indexOf('export async function takeWorkflowAction')
  const end   = workflowEngineSource.indexOf('\nexport async function previewWorkflow', start)
  return workflowEngineSource.slice(start, end)
}

// ── Queue-based DB mock (same pattern as aria-pending-approver.test.ts) ───────

type Row = Record<string, unknown>
let queryQueue:    Row[][] = []
let queryCallIdx = 0

function buildChain(rows: Row[]): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: Row[]) => unknown) => Promise.resolve(rows).then(resolve)
      }
      return () => buildChain(rows)
    },
  })
}

// ── Module mocks (must be at top-level — vi.mock is hoisted) ─────────────────

vi.mock('@/lib/db', () => ({
  db: {
    get select() {
      return () => buildChain(queryQueue[queryCallIdx++] ?? [])
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
  },
}))

vi.mock('@/drizzle/schema', () => ({
  persons:          { id: {}, fullNameEn: {}, tenantId: {} },
  grades:           {},
  legalEntities:    {},
  absenceEntries:   { id: {}, tenantId: {} },
  notificationLog:  {},
  workerAssignments: { lineManagerId: {}, isCurrent: {}, assignmentStatus: {} },
}))

vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowDefinitionsV2:    {},
  workflowStepsV2:          {},
  workflowInstancesV2:      {},
  workflowStepInstances:    {},
  workflowAuditLog:         {},
  workflowEmailTokens:      {},
  workflowNotificationQueue: {},
  workflowSlaCalendars:     {},
  workflowRules:            {},
}))

vi.mock('@/lib/constants',        () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/lib/auth',             () => ({
  requireRole:    vi.fn().mockResolvedValue({}),
  getCurrentUser: vi.fn().mockResolvedValue({ personId: 'actor-hr-001', role: 'HR_ADMIN' }),
}))
vi.mock('@/lib/workflow-rules',    () => ({
  evaluateRules:      vi.fn(() => []),
  buildWorkflowContext: vi.fn((x: unknown) => x),
}))
vi.mock('@/lib/workflow-hierarchy', () => ({ resolveApprovalChain: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/workflow-sla',       () => ({ calculateSLADeadline: vi.fn().mockResolvedValue(new Date()) }))

vi.mock('drizzle-orm', () => ({
  eq:      () => ({}),
  and:     (...a: unknown[]) => ({ _and: a }),
  lte:     () => ({}),
  inArray: () => ({}),
  desc:    () => ({}),
  or:      () => ({}),
  isNull:  () => ({}),
  count:   () => ({}),
}))

// ── Import SUT after all mocks ────────────────────────────────────────────────

const { resolveActorDisplayName } = await import('@/lib/workflow-engine')

const SYSTEM_ACTOR_ID   = '22222222-2222-2222-2222-222222222222'
const SYSTEM_ACTOR_NAME = 'AVANIIS Workflow Engine'
const UUID_REGEX        = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(() => {
  queryQueue    = []
  queryCallIdx  = 0
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ISSUE-001 — workflow actor display name', () => {

  // ── Static source checks ──────────────────────────────────────────────────

  it('WAN-001: dispatchResourceCompletion leave notification uses actorDisplayName for createdByName (not UUID)', () => {
    const dispatch = getDispatchSection()
    // The notification insert must use actorDisplayName, not actorPersonId, as the display field
    expect(dispatch).toContain("createdByName:     actorDisplayName")
    expect(dispatch).not.toContain("createdByName:     actorPersonId")
  })

  it('WAN-002: dispatchResourceCompletion absence_entries update uses actorDisplayName for updatedByName (not UUID)', () => {
    const dispatch = getDispatchSection()
    // The resource update must use actorDisplayName as the display name
    expect(dispatch).toContain("updatedByName:   actorDisplayName")
    expect(dispatch).not.toContain("updatedByName:   actorPersonId")
  })

  it('WAN-003: takeWorkflowAction decision record uses actorDisplayName for updatedByName (not UUID)', () => {
    const take = getTakeActionSection()
    // All updatedByName occurrences in the action section must reference actorDisplayName
    expect(take).toContain("actorDisplayName")
    // Raw UUID used as display name must not appear anywhere in the action section
    expect(take).not.toContain("updatedByName:     actorPersonId")
    expect(take).not.toContain("updatedByName:    actorPersonId")
    expect(take).not.toContain("updatedByName:  actorPersonId")
  })

  it('WAN-004: ID fields (updatedBy, decidedByPersonId) still reference actorPersonId — UUID preserved in references', () => {
    const take = getTakeActionSection()
    // The stable ID reference fields must remain UUIDs, not display names
    expect(take).toContain("updatedBy:         actorPersonId")
    expect(take).toContain("decidedByPersonId: actorPersonId")
    expect(take).toContain("finalDecisionBy:  actorPersonId")
  })

  it('WAN-005: writeAudit calls in takeWorkflowAction pass actorName: actorDisplayName (human-readable audit trail)', () => {
    const take = getTakeActionSection()
    // Every writeAudit call for human decisions should include actorName: actorDisplayName
    expect(take).toContain("actorName:      actorDisplayName")
    expect(take).toContain("actorName:  actorDisplayName")
  })

  it('WAN-006: resolvePendingApprover still exists in workflow/queries.ts — ARIA not affected', () => {
    // This fix must not alter the ARIA pending-approver resolution path
    expect(workflowQueriesSource).toContain('resolvePendingApprover')
    // The resolver must still return structured approver info (not raw UUIDs)
    expect(workflowQueriesSource).toContain('approverLabel')
    expect(workflowQueriesSource).toContain('approverType')
  })

  // ── Behavioral unit tests for resolveActorDisplayName ─────────────────────

  it('WAN-007: resolveActorDisplayName returns fullNameEn for a known person', async () => {
    queryQueue = [[{ fullNameEn: 'Mahendra Kumar' }]]

    const name = await resolveActorDisplayName('person-uuid-001')

    expect(name).toBe('Mahendra Kumar')
  })

  it('WAN-008: resolveActorDisplayName returns "Workflow approver" for unknown person — never leaks UUID', async () => {
    // Empty result — person not found (deleted/soft-deleted/wrong tenant)
    queryQueue = [[]]

    const name = await resolveActorDisplayName('33333333-3333-3333-3333-333333333333')

    expect(name).toBe('Workflow approver')
    // Must not be the UUID that was passed in
    expect(name).not.toBe('33333333-3333-3333-3333-333333333333')
    expect(UUID_REGEX.test(name)).toBe(false)
  })

  it('WAN-009: resolveActorDisplayName returns SYSTEM_ACTOR.name for system actor ID — no DB query made', async () => {
    // No rows queued — if DB were queried, the queue is empty and it would return 'Workflow approver'
    // instead of SYSTEM_ACTOR.name. The correct result proves the early return fires.
    queryQueue = []

    const name = await resolveActorDisplayName(SYSTEM_ACTOR_ID)

    expect(name).toBe(SYSTEM_ACTOR_NAME)
    // Must not be the UUID
    expect(UUID_REGEX.test(name)).toBe(false)
  })

  it('WAN-010: resolveActorDisplayName output never matches a raw UUID pattern regardless of input', async () => {
    // Invariant test: whatever happens, the return value is never UUID-shaped.
    // Test three scenarios: known person, unknown person, system actor.
    queryQueue = [
      [{ fullNameEn: 'Salma Al Hashemi' }],  // scenario A: person found
      [],                                     // scenario B: person not found
    ]

    const nameA = await resolveActorDisplayName('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') // found
    const nameB = await resolveActorDisplayName('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') // not found
    const nameC = await resolveActorDisplayName(SYSTEM_ACTOR_ID)                        // system actor

    expect(UUID_REGEX.test(nameA)).toBe(false)
    expect(UUID_REGEX.test(nameB)).toBe(false)
    expect(UUID_REGEX.test(nameC)).toBe(false)
  })

})
