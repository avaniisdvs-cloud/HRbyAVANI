import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S9-05 — Integration tests for `runSlaBreachCheck`.
 *
 * Pinning the riskiest invariants:
 *   • Hard Rule 1 — audit row written inside the same tx as the inserts
 *   • Idempotency — escalated_at within the dedup window suppresses a
 *     second alert for the same instance
 *   • Bilingual — subject_en + subject_ar both set
 *   • System actor — actor_id === SYSTEM_ACTOR_ID
 *   • Status filter — only PENDING / IN_PROGRESS rows are alerted
 */

// ── Per-test queue feeding the chained DB proxy ────────────────────────────

let queryResults: unknown[][] = []
let queryIdx = 0

const insertSpy       = vi.fn()
const insertValuesSpy = vi.fn()
const updateSpy       = vi.fn()
const updateSetSpy    = vi.fn()
const auditSpy        = vi.fn()
const txCount         = { value: 0 }

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryResults[queryIdx++] ?? []).then(resolve, reject)
      }
      return () => makeProxy()
    },
  })
}

function makeInsertChain() {
  return {
    values: vi.fn((rows: unknown) => {
      insertValuesSpy(rows)
      return Promise.resolve()
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn((vals: unknown) => {
      updateSetSpy(vals)
      return { where: vi.fn(() => Promise.resolve()) }
    }),
  }
}

function buildTx() {
  return {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn(() => { insertSpy('called'); return makeInsertChain() }),
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => makeInsertChain()),
  update:      vi.fn(() => makeUpdateChain()),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    txCount.value++
    return fn(buildTx())
  }),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => {
    auditSpy(event, tx)
    return Promise.resolve()
  }),
  diffFields: () => [],
}))
vi.mock('@/drizzle/schema', () => ({
  notificationLog:    { id: {}, tenantId: {}, recipientPersonId: {}, notificationType: {}, referenceId: {} },
  workflowInstances:  { id: {}, tenantId: {}, slaDeadline: {}, escalatedAt: {}, status: {}, currentStageId: {}, workflowDefinitionId: {}, currentStageOrder: {}, legalEntityId: {}, resourceType: {}, resourceId: {}, initiatedByPersonId: {} },
  workflowDefinitions:{ id: {}, workflowCode: {}, workflowNameEn: {}, workflowNameAr: {}, triggerEvent: {} },
  workflowStages:     { id: {}, stageNameEn: {}, stageNameAr: {}, approverRoleCode: {}, escalationRoleCode: {} },
  persons:            { id: {}, fullNameEn: {}, fullNameAr: {}, tenantId: {} },
  // S9-03 addition: escalation-role holder lookup inside the breach tx
  userAccounts:       { personId: {}, tenantId: {}, avaniisRole: {}, primaryEntityId: {} },
}))
vi.mock('drizzle-orm', () => ({
  and:       (...a: unknown[]) => a,
  or:        (...a: unknown[]) => a,
  eq:        () => ({}),
  lt:        () => ({}),
  isNull:    () => ({}),
  inArray:   () => ({}),
  relations: () => ({}),
}))

const { runSlaBreachCheck, SLA_CHECK_INTERVAL_MINUTES } = await import('@/lib/jobs/sla-breach-checker')

beforeEach(() => {
  queryResults = []
  queryIdx     = 0
  vi.clearAllMocks()
  txCount.value = 0
})

const NOW = new Date('2026-04-29T12:00:00.000Z')

const breachedRow = {
  instanceId:         'wf-1',
  legalEntityId:      'entity-1',
  resourceType:       'absence_entries',
  resourceId:         'le-1',
  initiatorPersonId:  'p-1',
  startedAt:          new Date(NOW.getTime() - 3 * 24 * 3600 * 1000),
  slaDeadline:        new Date(NOW.getTime() - 6 * 3600 * 1000), // 6h ago = breached
  escalatedAt:        null,
  instanceStatus:     'IN_PROGRESS',
  currentStageOrder:  2,
  workflowCode:       'WF-LEAVE-STD',
  workflowNameEn:     'Leave Request',
  workflowNameAr:     'طلب إجازة',
  triggerEvent:       'LEAVE',
  stageNameEn:        'HR Acknowledgement',
  stageNameAr:        'إقرار الموارد البشرية',
  approverRoleCode:   'HR_DIRECTOR',
  hierarchyRole:      'CEO',
}

describe('runSlaBreachCheck — happy path', () => {
  it('alerts a breached IN_PROGRESS instance and writes the WORKFLOW.SLA_BREACHED audit row', async () => {
    queryResults = [
      [breachedRow],                                        // candidate select
      [{ id: 'p-1', fullNameEn: 'Initiator EN', fullNameAr: 'المقدِّم' }], // initiator lookup
      [{ escalatedAt: null }],                              // tx-internal recheck
    ]
    const r = await runSlaBreachCheck(NOW)

    expect(r.candidatesFound).toBe(1)
    expect(r.alertsCreated).toBe(1)
    expect(r.duplicatesSkipped).toBe(0)
    expect(r.errors).toEqual([])

    // Notification insert called with bilingual subject + body, recipient = initiator.
    // The code inserts an array of rows (initiator + any escalation-role holders),
    // so calls[0][0] is the array — unwrap the first element.
    expect(insertValuesSpy).toHaveBeenCalled()
    const notifRows = insertValuesSpy.mock.calls[0][0] as Array<{
      recipientPersonId: string
      subjectEn: string
      subjectAr: string
      bodyEn: string
      bodyAr: string
      notificationType: string
      referenceId: string
    }>
    const notifVals = Array.isArray(notifRows) ? notifRows[0] : notifRows
    expect(notifVals.recipientPersonId).toBe('p-1')
    expect(notifVals.notificationType).toBe('APPROVAL_ESCALATION')
    expect(notifVals.referenceId).toBe('wf-1')
    expect(notifVals.subjectEn).toMatch(/SLA breached/i)
    expect(notifVals.subjectAr).toMatch(/تجاوز موعد/)
    expect(notifVals.subjectEn).toContain('CEO')   // escalation role surfaced
    expect(notifVals.bodyAr.length).toBeGreaterThan(0)

    // workflow_instances.escalated_at set to scanAt
    expect(updateSetSpy).toHaveBeenCalled()
    const update = updateSetSpy.mock.calls[0][0] as { escalatedAt: Date }
    expect(update.escalatedAt).toEqual(NOW)

    // Hard Rule 1: audit row inside the tx, system actor, correct event type
    expect(auditSpy).toHaveBeenCalled()
    const [audit, tx] = auditSpy.mock.calls[0]
    const event = audit as {
      actorId: string; actorName: string; eventType: string;
      resourceType: string; resourceId: string; channel: string
    }
    expect(event.actorId).toBe('00000000-0000-0000-0000-000000000000')
    expect(event.eventType).toBe('WORKFLOW.SLA_BREACHED')
    expect(event.resourceType).toBe('workflow_instances_v2')
    expect(event.resourceId).toBe('wf-1')
    expect(event.channel).toBe('BATCH')
    expect(tx).toBeDefined()
  })
})

describe('runSlaBreachCheck — status filter', () => {
  it('skips APPROVED / REJECTED instances even when sla_deadline is in the past', async () => {
    queryResults = [
      [{ ...breachedRow, instanceStatus: 'APPROVED' }],
      // No initiator lookup expected — status filter trims the list first.
    ]
    const r = await runSlaBreachCheck(NOW)
    expect(r.candidatesFound).toBe(0)
    expect(r.alertsCreated).toBe(0)
    expect(insertValuesSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

describe('runSlaBreachCheck — idempotency / dedup', () => {
  it('does not re-alert when escalated_at is within the dedup window', async () => {
    // The candidate select uses the dedup predicate, so a fresh-escalated
    // row would not appear at all. Simulate that by returning an empty set.
    queryResults = [[], []]
    const r = await runSlaBreachCheck(NOW)
    expect(r.alertsCreated).toBe(0)
    expect(r.duplicatesSkipped).toBe(0)
    expect(insertValuesSpy).not.toHaveBeenCalled()
  })

  it('skips when the tx-internal recheck finds escalated_at moved into the dedup window', async () => {
    // Concurrent-runner scenario: outer SELECT saw escalated_at=null but
    // the inner re-check sees a fresh timestamp.
    const recentEscalation = new Date(NOW.getTime() - 5 * 60 * 1000) // 5 min ago — still in the 30-min window
    queryResults = [
      [breachedRow],                                                 // outer select
      [{ id: 'p-1', fullNameEn: 'Initiator EN', fullNameAr: 'المقدِّم' }], // initiator
      [{ escalatedAt: recentEscalation }],                            // tx recheck — bail out
    ]
    const r = await runSlaBreachCheck(NOW)
    expect(r.alertsCreated).toBe(0)
    expect(r.duplicatesSkipped).toBe(1)
    expect(insertValuesSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

describe('runSlaBreachCheck — constants', () => {
  it('uses a 30-minute cadence (matches cron schedule)', () => {
    expect(SLA_CHECK_INTERVAL_MINUTES).toBe(30)
  })
})
