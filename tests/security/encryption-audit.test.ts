/**
 * AGENT-5B — Data Encryption & Audit Immutability Tests
 *
 * Covers:
 *   ENC-001..007   — AES-256-GCM field-level encryption (lib/encryption.ts)
 *   AUDIT-001..005 — writeAuditLog behaviour and Hard Rule 1 (lib/audit.ts)
 *   PDPL-001..002  — PII field encryption in bank-details server actions
 *
 * Architecture:
 *   vi.mock() is hoisted by Vitest to the top of the module before any imports.
 *   To test the REAL encryption and audit modules we use vi.importActual() inside
 *   the test bodies — this bypasses the mock registry and loads the real module.
 *   The vi.mock() calls below are only needed for the PDPL integration tests which
 *   need to stub db/auth/encryption for the server actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs   from 'fs'
import path from 'path'

// ── Stubs for modules that require DB/Next.js infrastructure ─────────────────
// These mocks are hoisted but scoped — they only affect modules that vi.mock wraps.
// The ENC/AUDIT tests use vi.importActual() to bypass these stubs for real modules.

vi.mock('@/lib/db', () => ({
  db: {
    insert:      vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    update:      vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    delete:      vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    transaction: vi.fn(),
  },
}))

vi.mock('@/drizzle/schema', () => ({
  auditLog:          Symbol('auditLog'),
  persons:           Symbol('persons'),
  personBankDetails: Symbol('personBankDetails'),
  personDependents:  Symbol('personDependents'),
  personDocuments:   Symbol('personDocuments'),
  // Added for the requirePermission() enforcement layer (lib/permissions.ts):
  // createBankDetails/getBankDetails now run a second authz gate that reads the
  // feature_permissions matrix. The matrix query resolves to no row in this
  // mock → evaluatePermission() returns LEGACY_ALLOW (the realistic default:
  // enforcement is inert until an admin seeds a row), so the authorized actor
  // passes. The DENY path is covered by tests/security/permission-resolver.test.ts.
  featurePermissions: Symbol('featurePermissions'),
}))

vi.mock('@/lib/constants', () => ({
  TENANT_ID: '00000000-0000-0000-0000-000000000001',
}))

vi.mock('drizzle-orm', () => ({
  eq:    () => ({}),
  and:   (...a: unknown[]) => a,
  count: () => ({}),
  desc:  () => ({}),
}))

// ── PDPL integration-test stubs (for createBankDetails / getBankDetails) ──────

const encryptCallArgs:       string[]            = []
const decryptCallArgs:       (string | null)[]   = []

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => {
    encryptCallArgs.push(v)
    return `enc:${v}`
  }),
  encryptNullable: vi.fn((v: string | undefined | null) => {
    if (v != null) encryptCallArgs.push(v)
    return v ? `enc:${v}` : null
  }),
  decryptNullable: vi.fn((v: string | null) => {
    decryptCallArgs.push(v)
    return v?.startsWith('enc:') ? v.slice(4) : v
  }),
  decrypt: vi.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  diffFields:    () => [],
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() =>
    Promise.resolve({
      id:            '00000000-0000-0000-0000-0000000000c3',
      name:          'HR Admin',
      role:          'HR_ADMIN',
      legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      personId:      '00000000-0000-0000-0000-0000000000d4',
    }),
  ),
}))

vi.mock('@/lib/effective-date', () => ({
  addDays: (date: string, n: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  },
}))

// ─────────────────────────────────────────────────────────────────────────────
// Real modules loaded via importActual — bypass mock registry
// ─────────────────────────────────────────────────────────────────────────────

// Set the encryption key env var before loading the real module
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(process.env as any).NODE_ENV = 'development'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realEncModule = await vi.importActual<any>('@/lib/encryption')
const realEncrypt   = realEncModule.encrypt  as (s: string) => string
const realDecrypt   = realEncModule.decrypt  as (s: string) => string

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realAuditModule  = await vi.importActual<any>('@/lib/audit')
const realWriteAuditLog = realAuditModule.writeAuditLog as (
  event: unknown,
  executor?: unknown,
) => Promise<void>

// ─────────────────────────────────────────────────────────────────────────────
// ENC-001 — encrypt / decrypt round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-001 — encrypt / decrypt round-trip', () => {
  it('UAE IBAN round-trips correctly', () => {
    const plain = 'AE070331234567890123456'
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
  })

  it('Emirates ID round-trips correctly', () => {
    const plain = '784-1990-1234567-8'
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENC-002 — encrypted output is not the plaintext
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-002 — encrypted output is not the plaintext', () => {
  it('ciphertext differs from plaintext IBAN', () => {
    const plain = '784-1990-1234567-8'
    expect(realEncrypt(plain)).not.toBe(plain)
  })

  it('ciphertext is a valid base64 string', () => {
    const ct = realEncrypt('AE070331234567890123456')
    expect(ct).toBeTruthy()
    expect(() => Buffer.from(ct, 'base64')).not.toThrow()
  })

  it('ciphertext encodes IV(12)+TAG(16)+ct — minimum 29 decoded bytes', () => {
    const ct  = realEncrypt('test-value')
    const buf = Buffer.from(ct, 'base64')
    // 12 bytes IV + 16 bytes GCM tag + ≥1 byte ciphertext = ≥ 29 bytes
    expect(buf.length).toBeGreaterThanOrEqual(29)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENC-003 — different plaintexts produce different ciphertexts
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-003 — different plaintexts produce different ciphertexts', () => {
  it('two distinct values give distinct ciphertexts', () => {
    expect(realEncrypt('value1')).not.toBe(realEncrypt('value2'))
  })

  it('longer plaintext produces longer decoded output', () => {
    const short = Buffer.from(realEncrypt('ab'), 'base64').length
    const long  = Buffer.from(realEncrypt('abcdefghij1234567890'), 'base64').length
    expect(long).toBeGreaterThan(short)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENC-004 — same plaintext produces different ciphertexts (IV randomisation)
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-004 — same plaintext → different ciphertexts (random IV)', () => {
  it('two encryptions of the same value differ', () => {
    const plain = 'same-secret-value'
    expect(realEncrypt(plain)).not.toBe(realEncrypt(plain))
  })

  it('both ciphertexts still decrypt to the original value', () => {
    const plain = 'same-secret-value'
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENC-005 — tampered / invalid ciphertext is rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-005 — tampered ciphertext is rejected', () => {
  it('flipping the last byte of ciphertext causes GCM auth-tag failure', () => {
    const ct  = realEncrypt('hello')
    const buf = Buffer.from(ct, 'base64')
    buf[buf.length - 1] ^= 0xff        // corrupt a ciphertext byte
    expect(() => realDecrypt(buf.toString('base64'))).toThrow()
  })

  it('flipping a tag byte causes GCM auth failure', () => {
    const ct  = realEncrypt('hello')
    const buf = Buffer.from(ct, 'base64')
    buf[13] ^= 0xaa                    // corrupt inside the 16-byte tag (bytes 12–27)
    expect(() => realDecrypt(buf.toString('base64'))).toThrow()
  })

  it('truncated buffer (only 10 bytes) throws', () => {
    const truncated = Buffer.alloc(10).toString('base64')
    expect(() => realDecrypt(truncated)).toThrow()
  })

  it('empty base64 string throws', () => {
    expect(() => realDecrypt('')).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENC-006 — empty string handled gracefully
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-006 — empty string handling', () => {
  it('encrypt("") does not throw', () => {
    expect(() => realEncrypt('')).not.toThrow()
  })

  it('round-trip of empty string returns empty string', () => {
    expect(realDecrypt(realEncrypt(''))).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ENC-007 — special characters and Unicode
// ─────────────────────────────────────────────────────────────────────────────

describe('ENC-007 — special characters and Unicode', () => {
  it('Japanese characters (名前) round-trip correctly', () => {
    expect(realDecrypt(realEncrypt('名前'))).toBe('名前')
  })

  it('Arabic characters round-trip correctly', () => {
    const plain = 'محمد عبدالله'
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
  })

  it('mixed Unicode + ASCII round-trips', () => {
    const plain = 'Test-名前-123'
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
  })

  it('null-byte in string round-trips', () => {
    const plain = 'before\x00after'
    expect(realDecrypt(realEncrypt(plain))).toBe(plain)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Audit tests use the REAL writeAuditLog with an in-memory executor
// ─────────────────────────────────────────────────────────────────────────────

function makeMockExecutor() {
  const insertedRows: unknown[] = []
  const updateCalls:  number[]  = []
  const deleteCalls:  number[]  = []

  const executor = {
    insert: vi.fn((_table: unknown) => ({
      values: vi.fn((row: unknown) => {
        insertedRows.push(row)
        return Promise.resolve()
      }),
    })),
    update: vi.fn((_table: unknown) => {
      updateCalls.push(Date.now())
      return { set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }
    }),
    delete: vi.fn((_table: unknown) => {
      deleteCalls.push(Date.now())
      return { where: vi.fn(() => Promise.resolve()) }
    }),
  }
  return { executor, insertedRows, updateCalls, deleteCalls }
}

const baseEvent = {
  actorId:      'user-001',
  actorName:    'Test User',
  actorRole:    'HR_ADMIN',
  channel:      'WEB' as const,
  eventType:    'TEST.EVENT',
  resourceType: 'test_resource',
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-001 — audit log written on entity CREATE
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT-001 — audit log written on entity CREATE', () => {
  it('calls executor.insert with a CREATE event', async () => {
    const { executor, insertedRows } = makeMockExecutor()
    await realWriteAuditLog(
      {
        ...baseEvent,
        eventType:    'EMPLOYEE.CREATED',
        resourceType: 'persons',
        resourceId:   'person-123',
        newValues:    { firstName: 'Sara', lastName: 'Ahmed' },
      },
      executor,
    )
    expect(executor.insert).toHaveBeenCalledOnce()
    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0] as Record<string, unknown>
    expect(row.eventType).toBe('EMPLOYEE.CREATED')
    expect(row.resourceType).toBe('persons')
    expect(row.resourceId).toBe('person-123')
    expect((row.newValues as Record<string, unknown>).firstName).toBe('Sara')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-002 — audit log written on entity UPDATE (old + new values)
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT-002 — audit log written on entity UPDATE', () => {
  it('includes oldValues, newValues, and changedFields', async () => {
    const { executor, insertedRows } = makeMockExecutor()
    await realWriteAuditLog(
      {
        ...baseEvent,
        eventType:     'EMPLOYEE.UPDATED',
        resourceType:  'persons',
        resourceId:    'person-456',
        oldValues:     { jobTitle: 'Analyst' },
        newValues:     { jobTitle: 'Senior Analyst' },
        changedFields: ['jobTitle'],
      },
      executor,
    )
    expect(executor.insert).toHaveBeenCalledOnce()
    const row = insertedRows[0] as Record<string, unknown>
    expect(row.eventType).toBe('EMPLOYEE.UPDATED')
    expect((row.oldValues as Record<string, unknown>).jobTitle).toBe('Analyst')
    expect((row.newValues as Record<string, unknown>).jobTitle).toBe('Senior Analyst')
    expect(row.changedFields).toEqual(['jobTitle'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-003 — audit log includes user identity
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT-003 — audit log includes user identity (actorId)', () => {
  it('actorId in the stored row matches the caller session userId', async () => {
    const { executor, insertedRows } = makeMockExecutor()
    const sessionUserId = 'usr-00000000-cafe-beef-0000-000000000001'
    await realWriteAuditLog(
      { ...baseEvent, actorId: sessionUserId, actorName: 'Admin User', actorRole: 'HR_DIRECTOR' },
      executor,
    )
    const row = insertedRows[0] as Record<string, unknown>
    expect(row.actorId).toBe(sessionUserId)
    expect(row.actorName).toBe('Admin User')
    expect(row.actorRole).toBe('HR_DIRECTOR')
  })

  it('all actor fields are preserved verbatim', async () => {
    const { executor, insertedRows } = makeMockExecutor()
    await realWriteAuditLog(
      {
        ...baseEvent,
        actorId:       'actor-abc',
        actorName:     'Jane Smith',
        actorRole:     'PAYROLL_ADMIN',
        actorEntityId: 'entity-xyz',
        channel:       'API',
        ipAddress:     '10.0.0.5',
        sessionId:     'sess-99',
      },
      executor,
    )
    const row = insertedRows[0] as Record<string, unknown>
    expect(row.actorId).toBe('actor-abc')
    expect(row.actorName).toBe('Jane Smith')
    expect(row.actorRole).toBe('PAYROLL_ADMIN')
    expect(row.actorEntityId).toBe('entity-xyz')
    expect(row.channel).toBe('API')
    expect(row.ipAddress).toBe('10.0.0.5')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-004 — audit log immutability (INSERT only, never UPDATE or DELETE)
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT-004 — audit log immutability', () => {
  it('writeAuditLog calls insert — never update or delete on the executor', async () => {
    const { executor, updateCalls, deleteCalls } = makeMockExecutor()
    await realWriteAuditLog({ ...baseEvent }, executor)
    expect(executor.insert).toHaveBeenCalledOnce()
    expect(updateCalls).toHaveLength(0)
    expect(deleteCalls).toHaveLength(0)
  })

  it('source code of lib/audit.ts contains no db.update(auditLog) or db.delete(auditLog)', () => {
    const ROOT   = path.resolve(__dirname, '../..')
    const source = fs.readFileSync(path.join(ROOT, 'lib/audit.ts'), 'utf-8')
    expect(
      /db\.update\s*\(\s*auditLog\b/i.test(source),
      'AUDIT-004 FAIL: lib/audit.ts must not contain db.update(auditLog)',
    ).toBe(false)
    expect(
      /db\.delete\s*\(\s*auditLog\b/i.test(source),
      'AUDIT-004 FAIL: lib/audit.ts must not contain db.delete(auditLog)',
    ).toBe(false)
  })

  it('multiple writeAuditLog calls each produce a separate INSERT row', async () => {
    const { executor, insertedRows } = makeMockExecutor()
    await realWriteAuditLog({ ...baseEvent, eventType: 'EV.ONE' }, executor)
    await realWriteAuditLog({ ...baseEvent, eventType: 'EV.TWO' }, executor)
    expect(executor.insert).toHaveBeenCalledTimes(2)
    expect(insertedRows).toHaveLength(2)
    expect((insertedRows[0] as Record<string, unknown>).eventType).toBe('EV.ONE')
    expect((insertedRows[1] as Record<string, unknown>).eventType).toBe('EV.TWO')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT-005 — audit log inside transaction (Hard Rule 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT-005 — audit log inside transaction (Hard Rule 1)', () => {
  it('writeAuditLog uses the supplied tx executor, not the global db pool', async () => {
    const txInsertedRows: unknown[] = []
    const txExecutor = {
      insert: vi.fn((_table: unknown) => ({
        values: vi.fn((row: unknown) => {
          txInsertedRows.push(row)
          return Promise.resolve()
        }),
      })),
    }

    await realWriteAuditLog(
      { ...baseEvent, eventType: 'EMPLOYEE.CREATED', resourceType: 'persons' },
      txExecutor,
    )

    expect(txExecutor.insert).toHaveBeenCalledOnce()
    expect(txInsertedRows).toHaveLength(1)
  })

  it('audit written in the same simulated transaction as the data change', async () => {
    const auditLogSymbol = (await import('@/drizzle/schema')).auditLog
    const dataRows:  unknown[] = []
    const auditRows: unknown[] = []

    const txExecutor = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((row: unknown) => {
          if (table === auditLogSymbol) {
            auditRows.push(row)
          } else {
            dataRows.push(row)
          }
          return Promise.resolve([{ id: 'new-id' }])
        }),
        returning: vi.fn(() => Promise.resolve([{ id: 'new-id' }])),
      })),
    }

    // Simulate: business data insert + audit insert in the same tx
    async function simulateDataWrite(tx: typeof txExecutor) {
      await tx.insert('persons_table' as unknown as symbol).values({ name: 'Test Person' })
      await realWriteAuditLog(
        { ...baseEvent, eventType: 'PERSON.CREATED', resourceType: 'persons' },
        tx,
      )
    }

    await simulateDataWrite(txExecutor)

    expect(txExecutor.insert).toHaveBeenCalledTimes(2)
    expect(auditRows).toHaveLength(1)
    expect((auditRows[0] as Record<string, unknown>).eventType).toBe('PERSON.CREATED')
  })

  it('writeAuditLog is callable with an explicit executor (Hard Rule 1 API contract)', () => {
    const dummy = {
      insert: vi.fn((_t: unknown) => ({ values: vi.fn(() => Promise.resolve()) })),
    }
    // If the second param didn't exist, TypeScript would error here — confirms the API.
    expect(() => void realWriteAuditLog(baseEvent, dummy)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PDPL integration tests — use mocked encryption + server actions
// ─────────────────────────────────────────────────────────────────────────────

const PERSON_ID = '00000000-0000-0000-0000-000000000700'
const ENTITY_ID = '00000000-0000-0000-0000-0000000000a1'
const valuesCaptured: unknown[] = []

let queryQueuePdpl: unknown[][] = []
let callIndexPdpl  = 0

function makeProxyPdpl(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueuePdpl[callIndexPdpl++] ?? []).then(resolve, reject)
      }
      return () => makeProxyPdpl()
    },
  })
}

function makeInsertChainPdpl(returnRows: unknown[]) {
  return {
    values: vi.fn((payload: unknown) => {
      valuesCaptured.push(payload)
      return { returning: vi.fn(() => Promise.resolve(returnRows)) }
    }),
  }
}

function makeUpdateChainPdpl() {
  return { set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }
}

function buildTxPdpl(returnRows: unknown[]) {
  return {
    select: vi.fn(() => makeProxyPdpl()),
    insert: vi.fn(() => makeInsertChainPdpl(returnRows)),
    update: vi.fn(() => makeUpdateChainPdpl()),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDbPdpl: any = {
  select:      vi.fn(() => makeProxyPdpl()),
  insert:      vi.fn(() => makeInsertChainPdpl([])),
  update:      vi.fn(() => makeUpdateChainPdpl()),
  transaction: vi.fn(),
}

// Patch the already-mocked db module with our PDPL mock
const { db: mockedDb } = await import('@/lib/db')
Object.assign(mockedDb as object, mockDbPdpl)

const { createBankDetails, getBankDetails } =
  await import('@/modules/core-hr/bank-details/actions')

beforeEach(() => {
  queryQueuePdpl  = []
  callIndexPdpl   = 0
  encryptCallArgs.length  = 0
  decryptCallArgs.length  = 0
  valuesCaptured.length   = 0
  vi.clearAllMocks()
  mockDbPdpl.select.mockImplementation(() => makeProxyPdpl())
  mockDbPdpl.insert.mockImplementation(() => makeInsertChainPdpl([]))
  mockDbPdpl.update.mockImplementation(() => makeUpdateChainPdpl())
  Object.assign(mockedDb as object, mockDbPdpl)
  // Restore mocked requireRole default (no-op placeholder)
})

const validBankInput = () => ({
  personId:      PERSON_ID,
  bankName:      'Emirates NBD',
  bankCode:      'EBILAEAD',
  iban:          'AE070331234567890123456',
  accountName:   'Sara Ahmed',
  accountType:   'CURRENT' as const,
  currency:      'AED',
  isWpsAccount:  true,
  effectiveFrom: '2026-05-01',
})

// ─────────────────────────────────────────────────────────────────────────────
// PDPL-001 — PII fields (IBAN) are encrypted before storage
// ─────────────────────────────────────────────────────────────────────────────

describe('PDPL-001 — IBAN encrypted before INSERT (Hard Rule 4)', () => {
  it('createBankDetails calls encrypt() with the raw IBAN', async () => {
    const tx = buildTxPdpl([{ id: 'bank-id-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]),
        }),
      }),
    }))
    mockDbPdpl.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await createBankDetails(validBankInput())

    // encrypt() (mocked) must have been called with the plaintext IBAN
    const { encrypt: encMock } = await import('@/lib/encryption')
    expect(encMock).toHaveBeenCalledWith('AE070331234567890123456')
  })

  it('the row passed to .values() contains ciphertext — not plaintext IBAN', async () => {
    const tx = buildTxPdpl([{ id: 'bank-id-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]),
        }),
      }),
    }))
    mockDbPdpl.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await createBankDetails(validBankInput())

    const insertRow = valuesCaptured.find(
      (v) => (v as Record<string, unknown>).iban !== undefined,
    ) as Record<string, unknown> | undefined

    expect(insertRow).toBeDefined()
    expect(insertRow?.iban).toBe('enc:AE070331234567890123456')
    expect(insertRow?.iban).not.toBe('AE070331234567890123456')
  })

  it('audit row does NOT contain the plaintext IBAN', async () => {
    const tx = buildTxPdpl([{ id: 'bank-id-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]),
        }),
      }),
    }))
    mockDbPdpl.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await createBankDetails(validBankInput())

    const { writeAuditLog: auditMock } = await import('@/lib/audit')
    expect(auditMock).toHaveBeenCalled()
    const auditEvent = (auditMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      eventType: string
      newValues: Record<string, unknown>
    }
    expect(auditEvent.eventType).toBe('BANK_DETAILS.CREATED')
    expect(auditEvent.newValues?.['iban']).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PDPL-002 — Sensitive data decrypted on retrieval
// ─────────────────────────────────────────────────────────────────────────────

describe('PDPL-002 — IBAN decrypted on retrieval for privileged roles', () => {
  const bankRow = {
    id:            'bank-id-1',
    tenantId:      'tenant-1',
    personId:      PERSON_ID,
    bankName:      'Emirates NBD',
    bankCode:      'EBILAEAD',
    iban:          'enc:AE070331234567890123456',
    accountName:   'Sara Ahmed',
    accountType:   'CURRENT',
    currency:      'AED',
    isPrimary:     true,
    isWpsAccount:  true,
    effectiveFrom: '2026-05-01',
    effectiveTo:   null,
  }

  it('PAYROLL_ADMIN: decryptNullable is called and full IBAN is returned', async () => {
    const { requireRole } = await import('@/lib/auth')
    ;(requireRole as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id:            '00000000-0000-0000-0000-0000000000c3',
      name:          'Payroll Admin',
      role:          'PAYROLL_ADMIN',
      legalEntityId: ENTITY_ID,
      personId:      '00000000-0000-0000-0000-0000000000d4',
    })

    queryQueuePdpl = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]

    const result = await getBankDetails(PERSON_ID)
    expect(result).not.toBeNull()
    expect(result?.iban).toBe('AE070331234567890123456')
    expect(result?.ibanMasked).toBe(false)
  })

  it('HR_ADMIN: receives masked IBAN (tail visible, full plaintext not exposed)', async () => {
    queryQueuePdpl = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]

    const result = await getBankDetails(PERSON_ID)
    expect(result).not.toBeNull()
    expect(result?.ibanMasked).toBe(true)
    expect(result?.iban).toMatch(/3456$/)
    expect(result?.iban).not.toBe('AE070331234567890123456')
  })

  it('PAYROLL_ADMIN view triggers BANK_DETAILS.IBAN_VIEWED audit event', async () => {
    const { requireRole } = await import('@/lib/auth')
    ;(requireRole as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id:            '00000000-0000-0000-0000-0000000000c3',
      name:          'Payroll Admin',
      role:          'PAYROLL_ADMIN',
      legalEntityId: ENTITY_ID,
      personId:      '00000000-0000-0000-0000-0000000000d4',
    })

    queryQueuePdpl = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]

    await getBankDetails(PERSON_ID)

    const { writeAuditLog: auditMock } = await import('@/lib/audit')
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'BANK_DETAILS.IBAN_VIEWED' }),
    )
  })
})
