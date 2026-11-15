import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S6-Q1 / S6-Q3 — Integration tests for `runDocumentExpiryCheck`.
 *
 * Covers the riskiest invariants of the cron job:
 *   • De-dup key includes subjectEn so multi-doc dependents do not
 *     collapse into one alert (S6-Q1 regression-guard)
 *   • Hard Rule 1 — audit row written inside the same tx as the inserts
 *   • Idempotency — same-day re-run produces zero duplicate inserts
 *   • Bilingual — every notification carries subject_en + subject_ar
 *   • System actor — actorId === SYSTEM_ACTOR_ID (00…0000)
 */

// ── Per-test queue feeding the chained DB proxy ────────────────────────────

let queryResults: unknown[][] = []
let queryIdx = 0

const insertSpy   = vi.fn()
const insertValuesSpy = vi.fn()
const auditSpy    = vi.fn()

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

function buildTx() {
  return {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn(() => { insertSpy('called'); return makeInsertChain() }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select: vi.fn(() => makeProxy()),
  insert: vi.fn(() => makeInsertChain()),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(buildTx())),
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
  notificationLog:   { id: {}, tenantId: {}, recipientPersonId: {}, referenceId: {}, subjectEn: {}, notificationType: {} },
  personDocuments:   { id: {}, tenantId: {}, personId: {}, legalEntityId: {}, expiryDate: {}, documentType: {}, documentNumber: {} },
  personDependents:  { id: {}, tenantId: {}, personId: {}, firstNameEn: {}, lastNameEn: {}, passportExpiry: {}, emiratesIdExpiry: {}, visaExpiry: {} },
  persons:           { id: {}, legalEntityId: {} },
}))
vi.mock('drizzle-orm', () => ({
  and:     (...a: unknown[]) => a,
  eq:      () => ({}),
  inArray: () => ({}),
}))

const { runDocumentExpiryCheck, ALERT_WINDOWS_DAYS } = await import('@/lib/jobs/document-expiry-checker')

// ─────────────────────────────────────────────────────────────────────────────

const PERSON_X    = '00000000-0000-0000-0000-00000000000a'
const ENTITY_1    = '00000000-0000-0000-0000-0000000000a1'
const DEP_A       = '00000000-0000-0000-0000-00000000d0a1'

beforeEach(() => {
  queryResults = []
  queryIdx     = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  insertValuesSpy.mockClear()
  auditSpy.mockClear()
})

/**
 * Each window iteration consumes 3 result slots in this order:
 *   1. personDocuments rows
 *   2. personDependents rows
 *   3. persons rows (legalEntityId resolution for dependents)
 *  + (inside tx) 1 slot for the existing notificationLog dedup query.
 *
 * For windows with zero pending alerts we short-circuit before the tx
 * opens so the existing-log slot is NOT consumed.
 */
function queueEmpty() {
  for (let i = 0; i < ALERT_WINDOWS_DAYS.length; i++) {
    queryResults.push([], [], []) // docs / deps / owners — all empty
  }
}

describe('runDocumentExpiryCheck — S6-Q1 dedup correctness', () => {
  it('inserts DISTINCT alerts for visa AND passport on the same dependent (no collapse)', async () => {
    // First window has 2 dependent docs expiring on the same target date,
    // both for the same dependent row (DEP_A). The dedup KEY now includes
    // subjectEn — visa and passport produce distinct subjects, so both
    // should be inserted.
    queryResults.push(
      [], // docs
      [{
        id: DEP_A, personId: PERSON_X,
        firstNameEn: 'Sara', lastNameEn: 'Ahmed',
        passportExpiry:   isoTodayPlus(90),
        emiratesIdExpiry: null,
        visaExpiry:       isoTodayPlus(90),
      }],
      [{ id: PERSON_X, legalEntityId: ENTITY_1 }],
      [], // existing notificationLog rows for dedup — none yet
    )
    // Remaining 3 windows: no pending alerts.
    for (let i = 1; i < ALERT_WINDOWS_DAYS.length; i++) {
      queryResults.push([], [], [])
    }

    const result = await runDocumentExpiryCheck()

    expect(result.alertsCreated).toBe(2)
    expect(result.duplicatesSkipped).toBe(0)
    const inserted = insertValuesSpy.mock.calls[0][0] as Array<{ subjectEn: string; referenceId: string }>
    expect(inserted).toHaveLength(2)
    const subjects = inserted.map(r => r.subjectEn).sort()
    expect(subjects[0]).toMatch(/passport/i)
    expect(subjects[1]).toMatch(/visa/i)
    // Same referenceId on both — proves the prior dedup-by-(person|ref)
    // would have collapsed this case.
    expect(inserted[0].referenceId).toBe(DEP_A)
    expect(inserted[1].referenceId).toBe(DEP_A)
  })

  it('skips a re-run for the same dependent+document+window (idempotent)', async () => {
    queryResults.push(
      [], // docs
      [{
        id: DEP_A, personId: PERSON_X,
        firstNameEn: 'Sara', lastNameEn: 'Ahmed',
        passportExpiry: isoTodayPlus(90),
        emiratesIdExpiry: null, visaExpiry: null,
      }],
      [{ id: PERSON_X, legalEntityId: ENTITY_1 }],
      // existing log for this referenceId already has the same subject —
      // the new pending alert dedup key matches → SKIP.
      [{
        recipientPersonId: PERSON_X,
        referenceId:       DEP_A,
        subjectEn:         'Dependent passport expires in 90 days',
      }],
    )
    for (let i = 1; i < ALERT_WINDOWS_DAYS.length; i++) {
      queryResults.push([], [], [])
    }

    const result = await runDocumentExpiryCheck()

    expect(result.alertsCreated).toBe(0)
    expect(result.duplicatesSkipped).toBe(1)
    expect(insertValuesSpy).not.toHaveBeenCalled()
  })

  it('inserts an EID alert even when visa+passport were already inserted earlier', async () => {
    // Repro of the S6-Q1 bug: prior key was (person|ref) so any prior
    // alert for this dependent would block ALL future ones. The new key
    // is (person|ref|subject), so an EID-specific subject still goes
    // through.
    queryResults.push(
      [],
      [{
        id: DEP_A, personId: PERSON_X,
        firstNameEn: 'Sara', lastNameEn: 'Ahmed',
        passportExpiry: null, visaExpiry: null,
        emiratesIdExpiry: isoTodayPlus(90),
      }],
      [{ id: PERSON_X, legalEntityId: ENTITY_1 }],
      [
        // Earlier-day visa + passport alerts on the same dependent.
        { recipientPersonId: PERSON_X, referenceId: DEP_A,
          subjectEn: 'Dependent visa expires in 90 days' },
        { recipientPersonId: PERSON_X, referenceId: DEP_A,
          subjectEn: 'Dependent passport expires in 90 days' },
      ],
    )
    for (let i = 1; i < ALERT_WINDOWS_DAYS.length; i++) {
      queryResults.push([], [], [])
    }

    const result = await runDocumentExpiryCheck()

    expect(result.alertsCreated).toBe(1)
    expect(result.duplicatesSkipped).toBe(0)
    const inserted = insertValuesSpy.mock.calls[0][0] as Array<{ subjectEn: string }>
    expect(inserted[0].subjectEn).toMatch(/emirates id/i)
  })
})

describe('runDocumentExpiryCheck — Hard Rule 1 (audit-in-tx) + bilingual', () => {
  it('writes an audit row INSIDE the transaction for every window with inserts', async () => {
    queryResults.push(
      [{ id: 'doc-1', personId: PERSON_X, legalEntityId: ENTITY_1,
         documentType: 'PASSPORT', documentNumber: 'P12345' }],
      [],
      [],
      [], // dedup — no prior alerts
    )
    for (let i = 1; i < ALERT_WINDOWS_DAYS.length; i++) {
      queryResults.push([], [], [])
    }

    await runDocumentExpiryCheck()

    expect(auditSpy).toHaveBeenCalledTimes(1)
    const [event, tx] = auditSpy.mock.calls[0]
    expect((event as { eventType: string }).eventType).toBe('DOCUMENT_EXPIRY.ALERTS_GENERATED')
    expect((event as { actorId: string }).actorId).toBe('00000000-0000-0000-0000-000000000000')
    expect((event as { channel: string }).channel).toBe('BATCH')
    expect(tx).toBeDefined()
  })

  it('emits subject_en AND subject_ar on every inserted row (Hard Rule 5)', async () => {
    queryResults.push(
      [{ id: 'doc-1', personId: PERSON_X, legalEntityId: ENTITY_1,
         documentType: 'EMIRATES_ID', documentNumber: '784-1234-5678901-2' }],
      [],
      [],
      [],
    )
    for (let i = 1; i < ALERT_WINDOWS_DAYS.length; i++) {
      queryResults.push([], [], [])
    }

    await runDocumentExpiryCheck()

    const inserted = insertValuesSpy.mock.calls[0][0] as Array<{
      subjectEn: string; subjectAr: string; bodyEn: string; bodyAr: string
    }>
    expect(inserted[0].subjectEn).toBeTruthy()
    expect(inserted[0].subjectAr).toBeTruthy()
    expect(inserted[0].bodyEn).toBeTruthy()
    expect(inserted[0].bodyAr).toBeTruthy()
    // The Arabic subject contains the document type substring or the
    // generic Arabic phrase — assert a non-Latin character is present so
    // an empty-string regression would fail.
    expect(inserted[0].subjectAr).toMatch(/[؀-ۿ]/)
  })

  it('returns a zero-alerts result with no inserts when nothing is expiring', async () => {
    queueEmpty()
    const result = await runDocumentExpiryCheck()
    expect(result.alertsCreated).toBe(0)
    expect(result.duplicatesSkipped).toBe(0)
    expect(insertValuesSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

function isoTodayPlus(days: number): string {
  // Match the production helper — UAE today + N days.
  const now = new Date()
  const uae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  const d   = new Date(uae.toISOString().slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
