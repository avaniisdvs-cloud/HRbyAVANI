import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Department Head + Department Work Schedule foundation — unit tests.
 *
 * DHS-001–006  resolveDefaultScheduleId (pure)
 * DHS-007–010  getDepartmentHead (DB-mocked workflow-actor resolver)
 * DHS-011–013  DepartmentActions source contract (head mandatory on create,
 *              transactional create, active-employee gate)
 */

import { resolveDefaultScheduleId, type ScheduleOption } from '@/app/(hr-admin)/master-data/departments/components/schedule-default'

const ENTITY_A = '11111111-1111-1111-1111-111111111111'
const ENTITY_B = '22222222-2222-2222-2222-222222222222'

const schedules: ScheduleOption[] = [
  { id: 'glob-default', scheduleNameEn: 'Global 5-day', scheduleCode: 'G5', isDefault: true,  legalEntityId: null },
  { id: 'a-default',    scheduleNameEn: 'KPD Standard', scheduleCode: 'KPD', isDefault: true,  legalEntityId: ENTITY_A },
  { id: 'a-shift',      scheduleNameEn: 'KPD Shift',    scheduleCode: 'KPDS', isDefault: false, legalEntityId: ENTITY_A },
  { id: 'b-shift',      scheduleNameEn: 'Entity B Shift', scheduleCode: 'BS', isDefault: false, legalEntityId: ENTITY_B },
]

describe('resolveDefaultScheduleId', () => {
  it('DHS-001: returns the entity-specific default when present', () => {
    expect(resolveDefaultScheduleId(schedules, ENTITY_A)).toBe('a-default')
  })

  it('DHS-002: falls back to the tenant-global default when entity has no default', () => {
    expect(resolveDefaultScheduleId(schedules, ENTITY_B)).toBe('glob-default')
  })

  it('DHS-003: returns empty string when no entity is selected', () => {
    expect(resolveDefaultScheduleId(schedules, '')).toBe('')
  })

  it('DHS-004: returns empty string when neither entity nor global default exists', () => {
    const noDefaults = schedules.map(s => ({ ...s, isDefault: false }))
    expect(resolveDefaultScheduleId(noDefaults, ENTITY_A)).toBe('')
  })

  it('DHS-005: entity default wins over global default', () => {
    // ENTITY_A has both a global default and its own default — own wins.
    expect(resolveDefaultScheduleId(schedules, ENTITY_A)).not.toBe('glob-default')
  })

  it('DHS-006: empty schedule list yields empty string', () => {
    expect(resolveDefaultScheduleId([], ENTITY_A)).toBe('')
  })
})

// ── getDepartmentHead (DB-mocked) ─────────────────────────────────────────────

let queued: unknown[] = []

function chain(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(queued).then(resolve)
      }
      return () => chain()
    },
  })
}

vi.mock('@/lib/db', () => ({ db: { select: () => chain() } }))
vi.mock('@/drizzle/schema', () => ({ departments: {}, persons: {} }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq:  (...a: unknown[]) => a,
}))

import { getDepartmentHead } from '@/modules/core-hr/department-head'

describe('getDepartmentHead', () => {
  beforeEach(() => { queued = [] })

  it('DHS-007: returns null when the department has no head', async () => {
    queued = []
    const result = await getDepartmentHead('dept-1')
    expect(result).toBeNull()
  })

  it('DHS-008: returns the resolved head shape (personId, name, number)', async () => {
    queued = [{ personId: 'p-1', personName: 'Dorab Kethari', personNumber: 'AVN-000123' }]
    const result = await getDepartmentHead('dept-1')
    expect(result).toEqual({
      departmentId: 'dept-1',
      personId:     'p-1',
      personName:   'Dorab Kethari',
      personNumber: 'AVN-000123',
    })
  })

  it('DHS-009: tolerates a null fullNameEn by returning empty name', async () => {
    queued = [{ personId: 'p-2', personName: null, personNumber: 'AVN-000999' }]
    const result = await getDepartmentHead('dept-2')
    expect(result?.personName).toBe('')
    expect(result?.personId).toBe('p-2')
  })

  it('DHS-010: echoes the requested departmentId back in the result', async () => {
    queued = [{ personId: 'p-3', personName: 'A B', personNumber: 'AVN-001' }]
    const result = await getDepartmentHead('dept-XYZ')
    expect(result?.departmentId).toBe('dept-XYZ')
  })
})

// ── DepartmentActions source contract ─────────────────────────────────────────
// Lightweight guards so the enterprise rules can't silently regress.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const actionsSrc = readFileSync(
  join(process.cwd(), 'app/(hr-admin)/master-data/departments/components/DepartmentActions.ts'),
  'utf8',
)

describe('DepartmentActions contract', () => {
  it('DHS-011: Department Head is mandatory on create', () => {
    expect(actionsSrc).toContain("throw new Error('Department Head is required.')")
  })

  it('DHS-012: create wraps insert + audit in a single transaction (Hard Rule 1)', () => {
    expect(actionsSrc).toMatch(/createDepartment[\s\S]*?db\.transaction\(async \(tx\)/)
    expect(actionsSrc).toMatch(/eventType:\s*'DEPARTMENT_CREATED'[\s\S]*?\}, tx\)/)
  })

  it('DHS-013: head validation gates on both isActive and assignmentStatus=ACTIVE', () => {
    expect(actionsSrc).toContain("assignmentStatus !== 'ACTIVE'")
    expect(actionsSrc).toMatch(/assertHeadPersonValid/)
  })
})
