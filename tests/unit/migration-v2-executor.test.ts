/**
 * Migration V2 Executor — regression tests for false-success prevention.
 *
 * Tests added 2026-06-04 after confirmed false-success incident:
 * DB showed 0 manager links, 0 dept heads, 0 leave balances while executor
 * reported ok=true. Root cause: phases returned created=0 with no executor
 * errors when all links were skipped or validation arrays were empty.
 *
 * V2EX-001: ok=false when manager links expected but 0 written (all skipped)
 * V2EX-002: ok=false when leave balances expected but 0 written (all skipped)
 * V2EX-003: ok=false when dept heads expected but 0 written
 * V2EX-004: ok=true when all validation arrays are empty (legitimate)
 * V2EX-005: empty managerLinks is not an error (sheet legitimately empty)
 * V2EX-006: Phase 1 exception → immediate ok=false, phases 2-4 not run
 * V2EX-007: ok=true only when phases write expected data (positive path)
 * V2EX-008: hodLinksSet field present on V2ExecutionResult
 * V2EX-009: Phase 2 exception captured — no silent .catch swallow
 * V2EX-010: errors[] contains skip detail when zero-write detected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// vi.hoisted ensures these are available before vi.mock() factories run
const { mockDb, mockTx, mockImportFn } = vi.hoisted(() => {
  const mockTx = {
    update: vi.fn().mockReturnThis(),
    set:    vi.fn().mockReturnThis(),
    where:  vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(undefined),
  }
  const mockDb = {
    select:      vi.fn().mockReturnThis(),
    from:        vi.fn().mockReturnThis(),
    where:       vi.fn().mockResolvedValue([]),
    limit:       vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => { await fn(mockTx) }),
  }
  const mockImportFn = vi.fn()
  return { mockDb, mockTx, mockImportFn }
})

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/drizzle/schema', () => ({
  persons:          {
    id: 'persons.id', personNumber: 'persons.personNumber',
    tenantId: 'persons.tenantId', isActive: 'persons.isActive',
    lineManagerId: 'persons.lineManagerId', currentDepartmentId: 'persons.currentDepartmentId',
    assignmentStatus: 'persons.assignmentStatus',
  },
  departments:       { id: 'departments.id', code: 'departments.code', tenantId: 'departments.tenantId', isActive: 'departments.isActive', headPersonId: 'departments.headPersonId' },
  workerAssignments: { tenantId: 'wa.tenantId', personId: 'wa.personId', isCurrent: 'wa.isCurrent' },
  absenceBalances:   { tenantId: 'ab.tenantId', personId: 'ab.personId', absenceTypeId: 'ab.absenceTypeId', balanceYear: 'ab.balanceYear' },
}))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('drizzle-orm', () => ({
  and:     (...args: unknown[]) => args,
  eq:      (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}))
vi.mock('@/modules/core-hr/bulk-import/import-engine', () => ({
  importEmployeesTx: (...args: unknown[]) => mockImportFn(...args),
}))

import { executeMigrationV2 } from '@/modules/migration/v2-executor'
import type { V2ValidationResult } from '@/modules/migration/v2-types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR = {
  id: 'aaaaaaaa-0000-0000-0000-000000000000',
  name: 'Test Admin',
  role: 'SUPER_ADMIN',
  legalEntityId: 'eeeeeeee-0000-0000-0000-000000000000',
}

function makeValidationResult(overrides: Partial<V2ValidationResult> = {}): V2ValidationResult {
  return {
    employeePreview: {
      totalRows: 2, validRows: 2, errorRows: 0, issues: [], validatedRows: [],
      ...overrides.employeePreview,
    },
    issues:                  [],
    managerLinks:            [],
    deptHeadLinks:           [],
    leaveBalances:           [],
    leaveIssues:             [],
    canExecute:              true,
    withinBatchManagerCount: 0,
    cycleCount:              0,
    ...overrides,
  } as V2ValidationResult
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default chain for all selects — returns empty array (no persons/depts found)
  mockDb.select.mockReturnThis()
  mockDb.from.mockReturnThis()
  mockDb.where.mockResolvedValue([])
  mockDb.limit.mockResolvedValue([])
  mockDb.transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
    await fn(mockTx)
  })

  // Default: successful import of 2 employees
  mockImportFn.mockResolvedValue({
    imported: 2,
    usersCreated: 2,
    rows: [
      { personNumber: 'K33',   personId: 'k33-0000-0000-0000-000000000000' },
      { personNumber: 'K1207', personId: 'k1207-000-0000-0000-000000000000' },
    ],
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── UAE mobile normalization tests (MOB-001–012) ──────────────────────────────
import { normalizeUaeMobile } from '@/modules/core-hr/bulk-import/row-validator'

describe('UAE mobile normalization (MOB-001–012)', () => {
  it('MOB-001: +971 prefix kept as-is', () => {
    expect(normalizeUaeMobile('+971501234567')).toBe('+971501234567')
  })
  it('MOB-002: 971 prefix gets + prepended', () => {
    expect(normalizeUaeMobile('971501234567')).toBe('+971501234567')
  })
  it('MOB-003: leading 0 removed, +971 prepended', () => {
    expect(normalizeUaeMobile('0501234567')).toBe('+971501234567')
  })
  it('MOB-004: starts with 5 → +971 prepended', () => {
    expect(normalizeUaeMobile('501234567')).toBe('+971501234567')
  })
  it('MOB-005: spaces stripped before normalization', () => {
    expect(normalizeUaeMobile('050 123 4567')).toBe('+971501234567')
  })
  it('MOB-006: hyphens stripped before normalization', () => {
    expect(normalizeUaeMobile('050-123-4567')).toBe('+971501234567')
  })
  it('MOB-007: brackets stripped before normalization', () => {
    expect(normalizeUaeMobile('(050)1234567')).toBe('+971501234567')
  })
  it('MOB-008: invalid number returns null', () => {
    expect(normalizeUaeMobile('12345')).toBeNull()
  })
  it('MOB-009: null input returns null', () => {
    expect(normalizeUaeMobile(null)).toBeNull()
  })
  it('MOB-010: empty string returns null', () => {
    expect(normalizeUaeMobile('')).toBeNull()
  })
  it('MOB-011: already-correct +971 9-digit preserved', () => {
    expect(normalizeUaeMobile('+971521234567')).toBe('+971521234567')
  })
  it('MOB-012: starts with 6 (landline prefix) → +971 prepended', () => {
    expect(normalizeUaeMobile('612345678')).toBe('+971612345678')
  })
})

describe('Migration V2 Executor — false-success regression (V2EX-001–010)', () => {

  it('V2EX-001: ok=false when validation has manager links but 0 written', async () => {
    // Use K999 → K888: NOT in mockImportFn rows (K33, K1207 are imported)
    // so importedPersonMap won't supply them either → truly not found → all skipped
    const validation = makeValidationResult({
      managerLinks: [{ employeeNumber: 'K999', managerEmployeeNumber: 'K888' }],
    })
    // DB persons lookup → empty (K999/K888 not in DB)
    mockDb.where.mockResolvedValue([])

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(false)
    expect(result.managerLinksSet).toBe(0)
    expect(result.errors.some(e => e.includes('Phase 2 (managers) FAILED'))).toBe(true)
    expect(result.errors.some(e => /0 of \d+ expected write/.test(e))).toBe(true)
  })

  it('V2EX-002: ok=false when validation has leave balances but 0 written', async () => {
    // K999 not in importedPersonMap (only K33, K1207 are imported)
    const validation = makeValidationResult({
      leaveBalances: [{
        raw: { employeeNumber: 'K999', absenceTypeCode: 'ANNUAL', balanceYear: 2026, openingBalanceDays: 30 },
        absenceTypeId: 'type-uuid-0000',
        legalEntityId: 'eeeeeeee-0000-0000-0000-000000000000',
        personNumber: 'K999',
      }],
    })
    mockDb.where.mockResolvedValue([])

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(false)
    expect(result.leaveBalancesCreated).toBe(0)
    expect(result.errors.some(e => e.includes('Phase 4 (leaveBalances) FAILED'))).toBe(true)
  })

  it('V2EX-003: ok=false when validation has dept head links but 0 written', async () => {
    // K999 not in importedPersonMap, DEPT-UNKNOWN not in DB → all skipped
    const validation = makeValidationResult({
      deptHeadLinks: [{ departmentCode: 'DEPT-UNKNOWN', headEmployeeNumber: 'K999' }],
    })
    mockDb.where.mockResolvedValue([])

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(false)
    expect(result.deptHeadsSet).toBe(0)
    expect(result.errors.some(e => e.includes('Phase 3 (deptHeads) FAILED'))).toBe(true)
  })

  it('V2EX-004: ok=true when all validation arrays are empty (no links to set)', async () => {
    const validation = makeValidationResult({
      managerLinks: [], deptHeadLinks: [], leaveBalances: [],
    })

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.managerLinksSet).toBe(0)
    expect(result.leaveBalancesCreated).toBe(0)
  })

  it('V2EX-005: empty managerLinks array is not an error', async () => {
    const validation = makeValidationResult({ managerLinks: [] })
    const result = await executeMigrationV2(validation, ACTOR)

    // detectZeroWriteFailure returns early when expectedCount === 0
    const managerErrors = result.errors.filter(e => e.toLowerCase().includes('manager'))
    expect(managerErrors).toHaveLength(0)
    expect(result.ok).toBe(true)
  })

  it('V2EX-006: Phase 1 exception → immediate ok=false, phases 2-4 not executed', async () => {
    mockImportFn.mockRejectedValue(new Error('DB connection failed'))

    const validation = makeValidationResult({
      managerLinks: [{ employeeNumber: 'K1207', managerEmployeeNumber: 'K33' }],
    })

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(false)
    expect(result.employeesCreated).toBe(0)
    expect(result.errors.some(e => e.includes('Phase 1 (employees) FAILED'))).toBe(true)
    // Phases 2-4 must not appear — only Phase 1 result
    expect(result.phases).toHaveLength(1)
    expect(result.phases[0].phase).toBe('employees')
  })

  it('V2EX-007: ok=true only when no expected writes are pending (positive path)', async () => {
    // All arrays empty + import succeeds = genuine success with 0 link writes
    const validation = makeValidationResult({})
    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.employeesCreated).toBe(2)
  })

  it('V2EX-008: V2ExecutionResult contains hodLinksSet field', async () => {
    const result = await executeMigrationV2(makeValidationResult(), ACTOR)

    expect(result).toHaveProperty('hodLinksSet')
    expect(typeof result.hodLinksSet).toBe('number')
    expect(result.hodLinksSet).toBeGreaterThanOrEqual(0)
  })

  it('V2EX-009: Phase 2 exception is captured in errors[], ok=false', async () => {
    const validation = makeValidationResult({
      managerLinks: [{ employeeNumber: 'K1207', managerEmployeeNumber: 'K33' }],
    })

    // Make db.transaction throw for the manager phase
    let txCallCount = 0
    mockDb.transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      txCallCount++
      if (txCallCount === 1) throw new Error('Simulated DB transaction failure in Phase 2')
      await fn(mockTx)
    })

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(false)
    expect(
      result.errors.some(e => e.includes('Phase 2') && e.includes('FAILED'))
    ).toBe(true)
  })

  it('V2EX-010: errors[] contains actionable skip detail when zero-write detected', async () => {
    const validation = makeValidationResult({
      managerLinks: [{ employeeNumber: 'K999', managerEmployeeNumber: 'K888' }],
    })
    mockDb.where.mockResolvedValue([])

    const result = await executeMigrationV2(validation, ACTOR)

    expect(result.ok).toBe(false)
    const errorText = result.errors.join('\n')
    expect(errorText).toMatch(/Phase 2 \(managers\) FAILED/)
    expect(errorText).toMatch(/0 of 1 expected write/)
    expect(errorText).toMatch(/skipped/)
    // Must hint at the fix
    expect(errorText).toMatch(/person numbers|serialization/)
  })
})

describe('Migration V2 Executor — manager role field (V2EX-011–012)', () => {

  it('V2EX-011: V2ExecutionResult contains managerRolesAssigned and managerRolesMissingAccount fields', async () => {
    const result = await executeMigrationV2(makeValidationResult(), ACTOR)
    expect(result).toHaveProperty('managerRolesAssigned')
    expect(result).toHaveProperty('managerRolesMissingAccount')
    expect(typeof result.managerRolesAssigned).toBe('number')
    expect(typeof result.managerRolesMissingAccount).toBe('number')
  })

  it('V2EX-012: Phase 1 early return includes managerRolesAssigned=0', async () => {
    mockImportFn.mockRejectedValue(new Error('Import failed'))
    const result = await executeMigrationV2(makeValidationResult(), ACTOR)
    expect(result.ok).toBe(false)
    expect(result.managerRolesAssigned).toBe(0)
    expect(result.managerRolesMissingAccount).toBe(0)
  })
})
