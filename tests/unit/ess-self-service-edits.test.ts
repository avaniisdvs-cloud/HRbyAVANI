/**
 * ESS Self-Service Edits — Home Address + Qualifications (Defect 1) and
 * Employee upward org-chart chain (Defect 2).
 *
 * SSE-001–009 exercise the real updateMyProfile server action with a mocked DB
 * (ownership guard, home-address upsert, education upsert, validation, audit).
 * SSE-ORG-001–005 exercise the real my-team engine resolver with a mocked
 * db.execute (upward chain shape, no-manager state, RBAC scope) plus a
 * source-inspection guard on the SQL and the EMPLOYEE engine lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Shared mocks (hoisted so vi.mock factories can reference them) ──────────

const h = vi.hoisted(() => {
  const mockTx = {
    insert:  vi.fn(),
    update:  vi.fn(),
    select:  vi.fn(),
    values:  vi.fn(),
    set:     vi.fn(),
    from:    vi.fn(),
    where:   vi.fn(),
    limit:   vi.fn(),
  }
  const mockDb = {
    transaction: vi.fn(),
    execute: vi.fn(),
    select:  vi.fn(),
    from:    vi.fn(),
    where:   vi.fn(),
    limit:   vi.fn(),
  }
  return { mockAuditLog: vi.fn(), mockAuth: vi.fn(), mockTx, mockDb }
})
const { mockAuditLog, mockAuth, mockTx, mockDb } = h
const mockExecute = mockDb.execute

vi.mock('@/lib/audit', () => ({ writeAuditLog: h.mockAuditLog }))
vi.mock('@/lib/auth', () => ({ auth: h.mockAuth }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-001' }))
vi.mock('@/lib/encryption', () => ({ decryptNullable: (v: unknown) => v }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: h.mockDb }))

vi.mock('@/drizzle/schema', () => ({
  personContacts:          { id: 'pc.id', personId: 'pc.person_id', tenantId: 'pc.tenant_id', contactType: 'pc.contact_type' },
  personEmergencyContacts: { id: 'pec.id', personId: 'pec.person_id', tenantId: 'pec.tenant_id', priorityOrder: 'pec.priority_order' },
  personAddresses:         { id: 'pa.id', personId: 'pa.person_id', tenantId: 'pa.tenant_id', addressType: 'pa.address_type' },
  personEducation:         { id: 'pe.id', personId: 'pe.person_id', tenantId: 'pe.tenant_id', isHighestDegree: 'pe.is_highest_degree' },
}))

import { updateMyProfile } from '@/modules/profile/actions'

const SELF = 'p-self'
function asEmployee(personId = SELF) {
  mockAuth.mockResolvedValue({
    user: { id: 'u1', name: 'Self Employee', email: 'self@test.com', role: 'EMPLOYEE', personId },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTx.insert.mockReturnValue(mockTx)
  mockTx.update.mockReturnValue(mockTx)
  mockTx.select.mockReturnValue(mockTx)
  mockTx.values.mockReturnValue(mockTx)
  mockTx.set.mockReturnValue(mockTx)
  mockTx.from.mockReturnValue(mockTx)
  mockTx.where.mockReturnValue(mockTx)
  mockTx.limit.mockResolvedValue([])
  mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx))
  mockDb.select.mockReturnValue(mockDb)
  mockDb.from.mockReturnValue(mockDb)
  mockDb.where.mockReturnValue(mockDb)
  mockDb.limit.mockResolvedValue([])
})

// ───────────────────────────────────────────────────────────────────────────
// Defect 1 — Home Address + Qualifications self-service edits
// ───────────────────────────────────────────────────────────────────────────

describe('SSE-001: ownership — employee cannot update another employee', () => {
  it('rejects when session.personId ≠ target personId and never opens a transaction', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile('p-other', { homeCity: 'Dubai' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('Permission denied')
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('rejects a qualifications edit on another employee too', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile('p-other', { eduInstitutionName: 'Hacker U' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('Permission denied')
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

describe('SSE-002: employee updates own Home Address (insert path)', () => {
  it('inserts a HOME_COUNTRY address row and succeeds', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile(SELF, {
      homeAddressLine1: '123 Marina Walk', homeCity: 'Dubai', homeCountry: 'are',
    })
    expect(res.success).toBe(true)
    expect(mockTx.insert).toHaveBeenCalledWith(expect.objectContaining({ addressType: 'pa.address_type' }))
    const values = mockTx.values.mock.calls.find(c => c[0]?.addressType === 'HOME_COUNTRY')?.[0]
    expect(values).toBeTruthy()
    expect(values.addressLine1).toBe('123 Marina Walk')
    expect(values.city).toBe('Dubai')
    expect(values.country).toBe('ARE')   // normalised to uppercase 3-letter code
    expect(values.personId).toBe(SELF)
  })
})

describe('SSE-003: employee updates own Home Address (update path)', () => {
  it('updates an existing HOME_COUNTRY row when one exists', async () => {
    asEmployee(SELF)
    mockTx.limit.mockResolvedValueOnce([{ id: 'addr-1' }])  // existing address found
    const res = await updateMyProfile(SELF, { homeCity: 'Abu Dhabi', homePoBox: '99999' })
    expect(res.success).toBe(true)
    expect(mockTx.update).toHaveBeenCalled()
    const setArg = mockTx.set.mock.calls.find(c => c[0]?.city === 'Abu Dhabi')?.[0]
    expect(setArg).toBeTruthy()
    expect(setArg.poBox).toBe('99999')
    expect(mockTx.insert).not.toHaveBeenCalled()
  })
})

describe('SSE-004: employee updates own Qualifications', () => {
  it('inserts a highest-degree education row and succeeds', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile(SELF, {
      eduInstitutionName: 'AUS', eduDegreeType: 'Bachelor', eduGraduationYear: '2018',
    })
    expect(res.success).toBe(true)
    const values = mockTx.values.mock.calls.find(c => c[0]?.institutionName === 'AUS')?.[0]
    expect(values).toBeTruthy()
    expect(values.isHighestDegree).toBe(true)
    expect(values.graduationYear).toBe(2018)   // string '2018' coerced to number
    expect(values.personId).toBe(SELF)
  })
})

describe('SSE-005: country validation', () => {
  it('rejects a non-3-letter home country code before any write', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile(SELF, { homeCountry: 'UAE-LONG' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/3-letter ISO/i)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('treats an empty country as "no change" (does not reject)', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile(SELF, { homeCity: 'Sharjah', homeCountry: '' })
    expect(res.success).toBe(true)
  })
})

describe('SSE-006: year validation', () => {
  it('rejects a non-numeric / out-of-range graduation year', async () => {
    asEmployee(SELF)
    const res = await updateMyProfile(SELF, { eduGraduationYear: 'abcd' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/year/i)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

describe('SSE-007: every self-service write is audited', () => {
  it('writes a PERSON.SELF_UPDATED audit log inside the transaction', async () => {
    asEmployee(SELF)
    await updateMyProfile(SELF, { homeCity: 'Dubai' })
    expect(mockAuditLog).toHaveBeenCalledTimes(1)
    expect(mockAuditLog.mock.calls[0][0]).toMatchObject({ eventType: 'PERSON.SELF_UPDATED', resourceId: SELF })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Defect 2 — Employee upward org-chart chain
// ───────────────────────────────────────────────────────────────────────────

import { myTeamEngineResolver } from '@/lib/org-chart/engines/my-team-engine'

const baseRow = (over: Record<string, unknown>) => ({
  full_name_en: 'X', full_name_ar: null, profile_photo_url: null, person_number: null,
  position_id: null, position_title_en: null, position_title_ar: null,
  dept_id: null, dept_name_en: null, dept_name_ar: null, job_title_en: null,
  is_acting: false, acting_end_date: null, assignment_status: 'ACTIVE',
  employment_type: null, nationality_category: null,
  is_emiratisation_target: false, is_management_role: false,
  direct_report_count: 0, ...over,
})

describe('SSE-ORG-001: employee org chart shows the upward manager chain', () => {
  it('builds self → manager → top with manager-as-parent edges', async () => {
    mockExecute.mockResolvedValueOnce([
      baseRow({ person_id: 'm2', line_manager_id: null, lvl: 2, full_name_en: 'CEO' }),
      baseRow({ person_id: 'm1', line_manager_id: 'm2', lvl: 1, full_name_en: 'Manager' }),
      baseRow({ person_id: 'e1', line_manager_id: 'm1', lvl: 0, full_name_en: 'Employee' }),
    ])
    const res = await myTeamEngineResolver({
      tenantId: 'tenant-001', viewerRole: 'EMPLOYEE', currentPersonId: 'e1',
      includeVacant: false, maxDepth: 8,
    })
    expect(res.nodes).toHaveLength(3)
    expect(res.edges).toHaveLength(2)
    // Edges run manager → report
    expect(res.edges.map(e => `${e.source}->${e.target}`).sort())
      .toEqual(['m1->e1', 'm2->m1'])
    // Top of chain (CEO) is depth 1 → smallest y; employee is deepest → largest y
    const y = (id: string) => res.nodes.find(n => n.id === id)!.position.y
    expect(y('m2')).toBeLessThan(y('m1'))
    expect(y('m1')).toBeLessThan(y('e1'))
  })

  it('only includes people on the employee\'s own line (no unrelated staff)', async () => {
    mockExecute.mockResolvedValueOnce([
      baseRow({ person_id: 'm1', line_manager_id: null, lvl: 1, full_name_en: 'Manager' }),
      baseRow({ person_id: 'e1', line_manager_id: 'm1', lvl: 0, full_name_en: 'Employee' }),
    ])
    const res = await myTeamEngineResolver({
      tenantId: 'tenant-001', viewerRole: 'EMPLOYEE', currentPersonId: 'e1',
      includeVacant: false, maxDepth: 8,
    })
    expect(res.nodes.map(n => n.id).sort()).toEqual(['e1', 'm1'])
  })
})

describe('SSE-ORG-002: no-manager case renders a clean top-level state', () => {
  it('returns a single self node with no edges', async () => {
    mockExecute.mockResolvedValueOnce([
      baseRow({ person_id: 'e1', line_manager_id: null, lvl: 0, full_name_en: 'Lonely Employee' }),
    ])
    const res = await myTeamEngineResolver({
      tenantId: 'tenant-001', viewerRole: 'EMPLOYEE', currentPersonId: 'e1',
      includeVacant: false, maxDepth: 8,
    })
    expect(res.nodes).toHaveLength(1)
    expect(res.edges).toHaveLength(0)
    expect(res.nodes[0].id).toBe('e1')
  })
})

describe('SSE-ORG-003: guard — no linked person record', () => {
  it('returns an empty result and runs no query', async () => {
    const res = await myTeamEngineResolver({
      tenantId: 'tenant-001', viewerRole: 'EMPLOYEE', currentPersonId: undefined,
      includeVacant: false, maxDepth: 8,
    })
    expect(res.nodes).toHaveLength(0)
    expect(res.edges).toHaveLength(0)
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

// ── Source-inspection guards (SQL contract + RBAC lock) ─────────────────────

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const ENGINE = read('lib/org-chart/engines/my-team-engine.ts')
const ACTIONS = read('modules/core-hr/org-chart-actions.ts')

describe('SSE-ORG-004: upward-chain SQL contract', () => {
  it('the EMPLOYEE branch walks line_manager_id UPWARD via a recursive join', () => {
    expect(ENGINE).toContain("params.viewerRole === 'EMPLOYEE'")
    expect(ENGINE).toContain('JOIN   up_chain uc ON m.id = uc.line_manager_id')
    // Recursion is depth-bounded to prevent runaway cycles
    expect(ENGINE).toMatch(/uc\.lvl\s+<\s+\$\{MAX_LEVELS\}/)
  })
})

describe('SSE-ORG-005: EMPLOYEE role is locked to the my-team engine server-side', () => {
  it('fetchHierarchy forces my-team for EMPLOYEE regardless of requested engine', () => {
    expect(ACTIONS).toMatch(/viewerRole === 'EMPLOYEE' \? 'my-team' : params\.engine/)
  })
})
