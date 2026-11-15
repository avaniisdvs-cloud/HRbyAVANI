import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S6-Q3 — Integration tests for `markNotificationRead` (Sprint 6 backend).
 *
 * Covers:
 *   • Auth gate — unauthenticated throws
 *   • Recipient-only — non-recipient throws unless SUPER_ADMIN
 *   • Idempotent — already-read returns alreadyRead=true with no write
 *   • Hard Rule 1 — write + audit in same tx
 *   • 'NOT_FOUND' — unknown id throws
 */

let queryRows: unknown[][] = []
let queryIdx = 0

const updateSpy   = vi.fn()
const setSpy      = vi.fn()
const auditSpy    = vi.fn()
const txCalledSpy = vi.fn()

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryRows[queryIdx++] ?? []).then(resolve, reject)
      }
      return () => makeProxy()
    },
  })
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return { where: vi.fn(() => Promise.resolve()) }
    }),
  }
}

function buildTx() {
  return {
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select: vi.fn(() => makeProxy()),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    txCalledSpy()
    return fn(buildTx())
  }),
}

const session = {
  user: {
    id:           '00000000-0000-0000-0000-000000000111',
    name:         'Sara Ahmed',
    email:        'sara@example.com',
    role:         'EMPLOYEE',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    personId:     '00000000-0000-0000-0000-00000000bbbb',
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => {
    auditSpy(event, tx)
    return Promise.resolve()
  }),
  diffFields: () => [],
}))
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(() => Promise.resolve(session.user.id ? { user: session.user } : null)),
}))
vi.mock('@/drizzle/schema', () => ({
  notificationLog: { id: {}, tenantId: {}, recipientPersonId: {}, status: {}, readAt: {} },
}))
vi.mock('drizzle-orm', () => ({
  and:    (...a: unknown[]) => a,
  eq:     () => ({}),
  isNull: () => ({}),
}))

const { markNotificationRead } = await import('@/modules/notification/actions')

const NOTIF_ID = '00000000-0000-0000-0000-00000000ccc1'

beforeEach(() => {
  queryRows = []
  queryIdx  = 0
  vi.clearAllMocks()
  updateSpy.mockClear()
  setSpy.mockClear()
  auditSpy.mockClear()
  txCalledSpy.mockClear()
  // Reset session defaults
  session.user.id            = '00000000-0000-0000-0000-000000000111'
  session.user.role          = 'EMPLOYEE'
  session.user.personId      = '00000000-0000-0000-0000-00000000bbbb'
})

describe('markNotificationRead — auth gate', () => {
  it('throws when session is null', async () => {
    session.user.id = ''
    await expect(markNotificationRead({ notificationId: NOTIF_ID })).rejects.toThrow(/session has expired/i)
  })
})

describe('markNotificationRead — recipient scope', () => {
  it('throws "forbidden" when caller is not the recipient and not SUPER_ADMIN', async () => {
    queryRows.push([{
      id:                NOTIF_ID,
      recipientPersonId: '00000000-0000-0000-0000-00000000ffff', // someone else
      status:            'PENDING',
      legalEntityId:     '00000000-0000-0000-0000-0000000000a1',
    }])

    await expect(markNotificationRead({ notificationId: NOTIF_ID })).rejects.toThrow(/do not have permission/i)
    expect(txCalledSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('allows SUPER_ADMIN even on someone else\'s notification', async () => {
    session.user.role     = 'SUPER_ADMIN'
    queryRows.push([{
      id:                NOTIF_ID,
      recipientPersonId: '00000000-0000-0000-0000-00000000ffff',
      status:            'PENDING',
      legalEntityId:     null,
    }])

    const result = await markNotificationRead({ notificationId: NOTIF_ID })

    expect(result.alreadyRead).toBe(false)
    expect(txCalledSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy).toHaveBeenCalledTimes(1)
  })
})

describe('markNotificationRead — idempotency', () => {
  it('returns alreadyRead=true with no DB write when status is READ', async () => {
    queryRows.push([{
      id:                NOTIF_ID,
      recipientPersonId: session.user.personId,
      status:            'READ',
      legalEntityId:     '00000000-0000-0000-0000-0000000000a1',
    }])

    const result = await markNotificationRead({ notificationId: NOTIF_ID })

    expect(result).toEqual({ id: NOTIF_ID, alreadyRead: true })
    expect(txCalledSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

describe('markNotificationRead — write + audit (Hard Rule 1)', () => {
  it('runs update + audit inside the same transaction', async () => {
    queryRows.push([{
      id:                NOTIF_ID,
      recipientPersonId: session.user.personId,
      status:            'PENDING',
      legalEntityId:     '00000000-0000-0000-0000-0000000000a1',
    }])

    const result = await markNotificationRead({ notificationId: NOTIF_ID })

    expect(result.alreadyRead).toBe(false)
    expect(txCalledSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledTimes(1)
    const setPayload = setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(setPayload.status).toBe('READ')
    expect(setPayload.readAt).toBeInstanceOf(Date)

    expect(auditSpy).toHaveBeenCalledTimes(1)
    const [event, tx] = auditSpy.mock.calls[0]
    expect((event as { eventType: string }).eventType).toBe('NOTIFICATION.MARKED_READ')
    expect((event as { resourceId: string }).resourceId).toBe(NOTIF_ID)
    expect(tx).toBeDefined() // audit-in-tx (Hard Rule 1)
  })
})

describe('markNotificationRead — input validation', () => {
  it('throws when notificationId is not a UUID', async () => {
    await expect(markNotificationRead({ notificationId: 'not-a-uuid' })).rejects.toThrow()
    expect(txCalledSpy).not.toHaveBeenCalled()
  })

  it('throws "notification not found" when row does not exist', async () => {
    queryRows.push([]) // empty — no notification
    await expect(markNotificationRead({ notificationId: NOTIF_ID })).rejects.toThrow(/could not be found/i)
  })
})
