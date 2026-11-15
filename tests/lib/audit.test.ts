import { describe, it, expect, vi, beforeEach } from 'vitest'
// QA-Audit-S4-Q6 — assert against the same constant production code uses.
import { TENANT_ID } from '@/lib/constants'

// ── Mock the DB before importing audit ────────────────────────────────────

const mockInsert = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: mockInsert }),
  },
}))

// ── Mock the auditLog schema table (just needs to be a truthy reference) ─
vi.mock('@/drizzle/schema', () => ({
  auditLog: { name: 'audit_log' },
}))

const { writeAuditLog, diffFields } = await import('@/lib/audit')

// ─────────────────────────────────────────────────────────────────────────────

const BASE_EVENT = {
  actorId:      'actor-uuid-001',
  actorName:    'HR Admin',
  actorRole:    'HR_ADMIN',
  channel:      'WEB' as const,
  eventType:    'CUSTOM_FIELD.CREATED',
  resourceType: 'custom_field_definitions',
}

describe('lib/audit — writeAuditLog', () => {
  beforeEach(() => {
    mockInsert.mockReset()
    mockInsert.mockResolvedValue([])
  })

  it('calls db.insert with all required fields', async () => {
    await writeAuditLog({ ...BASE_EVENT })
    expect(mockInsert).toHaveBeenCalledOnce()
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.actorId).toBe(BASE_EVENT.actorId)
    expect(payload.actorName).toBe(BASE_EVENT.actorName)
    expect(payload.actorRole).toBe(BASE_EVENT.actorRole)
    expect(payload.eventType).toBe(BASE_EVENT.eventType)
    expect(payload.resourceType).toBe(BASE_EVENT.resourceType)
    expect(payload.tenantId).toBeTruthy()
  })

  it('stores JSONB values (oldValues / newValues) correctly', async () => {
    const oldValues = { basicSalary: '10000' }
    const newValues = { basicSalary: '12000' }
    await writeAuditLog({ ...BASE_EVENT, oldValues, newValues })
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.oldValues).toEqual(oldValues)
    expect(payload.newValues).toEqual(newValues)
  })

  it('passes optional metadata through', async () => {
    const metadata = { reason: 'annual review' }
    await writeAuditLog({ ...BASE_EVENT, metadata })
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.metadata).toEqual(metadata)
  })

  it('sets tenantId to system tenant', async () => {
    await writeAuditLog({ ...BASE_EVENT })
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.tenantId).toBe(TENANT_ID)
  })
})

describe('lib/audit — diffFields', () => {
  it('returns keys that changed', () => {
    const before = { name: 'Alice', role: 'EMPLOYEE' }
    const after  = { name: 'Alice', role: 'MANAGER' }
    expect(diffFields(before, after)).toEqual(['role'])
  })

  it('returns empty array when nothing changed', () => {
    const obj = { a: 1, b: 'x' }
    expect(diffFields(obj, { ...obj })).toEqual([])
  })

  it('detects newly added keys', () => {
    expect(diffFields({ a: 1 }, { a: 1, b: 2 })).toEqual(['b'])
  })

  it('detects deleted keys (present in before, absent in after)', () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 1 })).toEqual(['b'])
  })

  it('handles nested object comparison via JSON.stringify', () => {
    const before = { meta: { x: 1 } }
    const after  = { meta: { x: 2 } }
    expect(diffFields(before, after)).toEqual(['meta'])
  })
})
