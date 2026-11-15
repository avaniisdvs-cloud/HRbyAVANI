/**
 * Audit Log Immutability & Retention Tests — NFR-22
 *
 * Tests that audit_log is INSERT-only at the application layer,
 * the DB trigger is present in migrations, and retention policy is correct.
 *
 * NFR-22: Audit logs — 7 years retention, immutable (no UPDATE/DELETE).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db',         () => ({ db: { insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })) } }))
vi.mock('@/drizzle/schema', () => ({ auditLog: { tableName: 'audit_log' } }))
vi.mock('@/lib/constants',  () => ({ TENANT_ID: '11111111-1111-1111-1111-111111111111' }))

import { writeAuditLog, diffFields } from '@/lib/audit'
import { db as mockDb } from '@/lib/db'

const insertSpy = mockDb.insert as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  insertSpy.mockReturnValue({ values: vi.fn(() => Promise.resolve()) })
})

// ── writeAuditLog behavioural tests ──────────────────────────────────────────

describe('writeAuditLog — INSERT-only contract', () => {
  const event = {
    actorId:      'actor-1',
    actorName:    'HR Admin',
    actorRole:    'HR_ADMIN',
    channel:      'WEB' as const,
    eventType:    'EMPLOYEE.CREATE',
    resourceType: 'persons',
    resourceId:   'person-1',
  }

  it('calls db.insert exactly once per audit event', async () => {
    await writeAuditLog(event)
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('writes to the auditLog table (not any other table)', async () => {
    await writeAuditLog(event)
    const firstCall = insertSpy.mock.calls[0]
    expect(firstCall[0]).toEqual({ tableName: 'audit_log' })
  })

  it('never calls db.update on audit_log', async () => {
    // writeAuditLog must not have an update path
    const mockDbWithUpdate = {
      insert:    insertSpy,
      update:    vi.fn(),
      delete:    vi.fn(),
    }
    await writeAuditLog(event, mockDbWithUpdate as unknown as Parameters<typeof writeAuditLog>[1])
    expect(mockDbWithUpdate.update).not.toHaveBeenCalled()
    expect(mockDbWithUpdate.delete).not.toHaveBeenCalled()
  })

  it('persists all AuditEvent fields in the values payload', async () => {
    const valuesSpy = vi.fn(() => Promise.resolve())
    insertSpy.mockReturnValueOnce({ values: valuesSpy })

    await writeAuditLog({
      ...event,
      oldValues:     { salary: 10000 },
      newValues:     { salary: 12000 },
      changedFields: ['salary'],
      metadata:      { reason: 'annual review' },
      description:   'Salary updated',
    })

    expect(valuesSpy).toHaveBeenCalledTimes(1)
    const payload = (valuesSpy.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>
    expect(payload.eventType).toBe('EMPLOYEE.CREATE')
    expect(payload.actorId).toBe('actor-1')
    expect(payload.oldValues).toEqual({ salary: 10000 })
    expect(payload.newValues).toEqual({ salary: 12000 })
    expect(payload.changedFields).toEqual(['salary'])
    expect(payload.description).toBe('Salary updated')
  })

  it('accepts a transaction executor (tx) instead of the global db', async () => {
    const txInsertSpy = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }))
    const tx = { insert: txInsertSpy }
    await writeAuditLog(event, tx as unknown as Parameters<typeof writeAuditLog>[1])
    expect(txInsertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy).not.toHaveBeenCalled() // global db NOT used
  })

  it('writes tenantId from TENANT_ID constant', async () => {
    const valuesSpy = vi.fn(() => Promise.resolve())
    insertSpy.mockReturnValueOnce({ values: valuesSpy })
    await writeAuditLog(event)
    const payload = (valuesSpy.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>
    expect(payload.tenantId).toBe('11111111-1111-1111-1111-111111111111')
  })
})

// ── diffFields utility ────────────────────────────────────────────────────────

describe('diffFields — change detection for audit payloads', () => {
  it('returns empty array when objects are identical', () => {
    expect(diffFields({ name: 'Alice', salary: 5000 }, { name: 'Alice', salary: 5000 })).toEqual([])
  })

  it('detects changed scalar fields', () => {
    const result = diffFields({ name: 'Alice', salary: 5000 }, { name: 'Alice', salary: 6000 })
    expect(result).toContain('salary')
    expect(result).not.toContain('name')
  })

  it('detects added fields', () => {
    const result = diffFields({ name: 'Alice' }, { name: 'Alice', email: 'a@b.com' })
    expect(result).toContain('email')
  })

  it('detects removed fields', () => {
    const result = diffFields({ name: 'Alice', temp: 'x' }, { name: 'Alice' })
    expect(result).toContain('temp')
  })

  it('detects nested object changes (JSON comparison)', () => {
    const result = diffFields(
      { address: { city: 'Dubai' } },
      { address: { city: 'Abu Dhabi' } }
    )
    expect(result).toContain('address')
  })
})

// ── Database-level immutability (migration inspection) ────────────────────────

describe('NFR-22 — DB trigger enforces immutability', () => {
  it('migration 0005 creates the audit_log_immutable trigger', () => {
    const migrationFile = path.join(ROOT, 'drizzle/migrations/0005_qa_audit_audit_immutable.sql')
    expect(fs.existsSync(migrationFile), 'Migration 0005_qa_audit_audit_immutable.sql must exist').toBe(true)

    const content = fs.readFileSync(migrationFile, 'utf-8')
    expect(content).toContain('CREATE TRIGGER audit_log_immutable')
    expect(content).toContain('BEFORE UPDATE OR DELETE ON "audit_log"')
    expect(content).toContain('prevent_audit_mutation')
  })

  it('trigger fires on both UPDATE and DELETE (not just one)', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'drizzle/migrations/0005_qa_audit_audit_immutable.sql'), 'utf-8'
    )
    // Must cover BOTH operations
    expect(content).toContain('UPDATE OR DELETE')
  })

  it('trigger function raises EXCEPTION (hard block, not warning)', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'drizzle/migrations/0005_qa_audit_audit_immutable.sql'), 'utf-8'
    )
    expect(content).toContain('RAISE EXCEPTION')
    expect(content).not.toContain('RAISE WARNING')
    expect(content).not.toContain('RAISE NOTICE')
  })

  it('REVOKE UPDATE, DELETE also applied at SQL-privilege level (migration 0001)', () => {
    const migration0001 = path.join(ROOT, 'drizzle/migrations/0001_sprint2_events_extra_data.sql')
    expect(fs.existsSync(migration0001)).toBe(true)
    const content = fs.readFileSync(migration0001, 'utf-8')
    expect(content).toContain('REVOKE UPDATE, DELETE ON TABLE "audit_log"')
  })
})

// ── 7-year retention policy (NFR-22) ─────────────────────────────────────────

describe('NFR-22 — 7-year retention policy', () => {
  it('retention-policy.ts specifies AUDIT_LOG_YEARS = 7', () => {
    // Read directly from the source file to avoid module alias issues
    const content = fs.readFileSync(path.join(ROOT, 'lib/retention-policy.ts'), 'utf-8')
    const match = content.match(/AUDIT_LOG_YEARS\s*:\s*(\d+)/)
    expect(match, 'AUDIT_LOG_YEARS not found in retention-policy.ts').toBeTruthy()
    expect(parseInt(match![1], 10)).toBe(7)
  })

  it('AUDIT_LOG_YEARS is the maximum retention period', () => {
    const content = fs.readFileSync(path.join(ROOT, 'lib/retention-policy.ts'), 'utf-8')
    const extractYear = (key: string) => {
      const m = content.match(new RegExp(`${key}\\s*:\\s*(\\d+)`))
      return m ? parseInt(m[1], 10) : 0
    }
    const auditYears      = extractYear('AUDIT_LOG_YEARS')
    const employmentYears = extractYear('EMPLOYMENT_RECORDS_YEARS')
    const payrollYears    = extractYear('PAYROLL_RECORDS_YEARS')
    expect(auditYears).toBeGreaterThanOrEqual(employmentYears)
    expect(auditYears).toBeGreaterThanOrEqual(payrollYears)
  })

  it('employment records retain for 7 years (UAE Labour Law)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'lib/retention-policy.ts'), 'utf-8')
    const match = content.match(/EMPLOYMENT_RECORDS_YEARS\s*:\s*(\d+)/)
    expect(parseInt(match![1], 10)).toBe(7)
  })

  it('payroll records retain for 7 years (UAE Federal Tax Authority)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'lib/retention-policy.ts'), 'utf-8')
    const match = content.match(/PAYROLL_RECORDS_YEARS\s*:\s*(\d+)/)
    expect(parseInt(match![1], 10)).toBe(7)
  })
})

// ── Audit coverage across modules ────────────────────────────────────────────

describe('NFR-22 — Audit write coverage in server actions', () => {
  it('writeAuditLog is imported in every write-capable server action file', () => {
    const actionFiles = [
      'modules/absence/actions.ts',
      'modules/config/actions.ts',
      'modules/core-hr/actions.ts',
      'modules/core-hr/bank-details/actions.ts',
      'modules/core-hr/contracts/actions.ts',
      'modules/core-hr/documents/actions.ts',
      'modules/core-hr/employment-actions/actions.ts',
    ]

    const missing: string[] = []
    for (const rel of actionFiles) {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf-8')
      const hasAuditImport = /writeAuditLog/.test(content)
      if (!hasAuditImport) missing.push(rel)
    }
    expect(
      missing,
      `NFR-22 FAIL: These action files don't call writeAuditLog:\n${missing.join('\n')}`
    ).toHaveLength(0)
  })

  it('auth sign-in writes an audit row (AUTH.SIGN_IN event)', () => {
    const authTs = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
    expect(authTs).toContain('AUTH.SIGN_IN')
    expect(authTs).toContain('writeAuditLog')
  })
})
