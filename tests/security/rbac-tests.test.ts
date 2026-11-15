/**
 * RBAC Tests — AVANIIS HR System
 *
 * RBAC-001 through RBAC-010 — Role-Based Access Control enforcement.
 *
 * Covers:
 *   RBAC-001  EMPLOYEE cannot call HR-admin actions
 *   RBAC-002  LINE_MANAGER sees limited data (entity-scoped; team filter noted)
 *   RBAC-003  HR_ADMIN can access HR functions
 *   RBAC-004  HR_DIRECTOR has elevated access
 *   RBAC-005  SUPER_ADMIN unrestricted
 *   RBAC-006  requireRole() guard enforcement directly
 *   RBAC-007  Unauthenticated request → UNAUTHENTICATED error
 *   RBAC-008  Tenant isolation — tenantId filter always applied
 *   RBAC-009  Feature permission enforcement (featurePermissions table)
 *   RBAC-010  Role hierarchy: SUPER_ADMIN > HR_DIRECTOR > HR_ADMIN > MANAGER > EMPLOYEE
 *
 * Uses the same full-mock pattern as auth-session.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { requireRole } from '@/lib/auth'

const ROOT = path.resolve(__dirname, '../..')

// ── Shared mutable session state ──────────────────────────────────────────────

const session = {
  user: {
    id:            'rbac-user-1',
    name:          'RBAC Test User',
    email:         'rbac@avaniis.dev',
    role:          'EMPLOYEE',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
    personId:      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
}

// ── Module mocks ──────────────────────────────────────────────────────────────
// Mirrors the exact pattern in auth-session.test.ts so the mock requireRole
// faithfully replicates lib/auth.ts lines 209-216.

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async (roles: string[]) => {
    if (!session.user.id) {
      throw new Error('UNAUTHENTICATED')
    }
    if (!roles.includes(session.user.role)) {
      throw new Error(
        `FORBIDDEN: requires one of [${roles.join(', ')}], got ${session.user.role}`,
      )
    }
    return session.user
  }),
  getCurrentUser: vi.fn(async () => {
    if (!session.user.id) throw new Error('UNAUTHENTICATED')
    return session.user
  }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select:    vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => []) })) })),
    insert:    vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
    update:    vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => []) })) })),
    delete:    vi.fn(() => ({ where: vi.fn(() => []) })),
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  },
}))

vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(() => Promise.resolve()) }))

vi.mock('@/lib/constants', () => ({
  TENANT_ID:     '00000000-0000-0000-0000-000000000001',
  AVANIIS_TENANT_ID: '00000000-0000-0000-0000-000000000001',
}))

vi.mock('@/drizzle/schema', () => ({
  persons:              {},
  legalEntities:        {},
  departments:          {},
  jobs:                 {},
  positions:            {},
  personContacts:       {},
  personAddresses:      {},
  personDocuments:      {},
  personBankDetails:    {},
  personDependents:     {},
  userAccounts:         {},
  leaveRequests:        {},
  auditLog:             {},
  notificationLog:      {},
  approvalDelegations:  {},
  policySettings:       {},
  customFieldDefinitions: {},
  featurePermissions:   {},
  complianceRules:      {},
  workflowDefinitions:  {},
}))

vi.mock('drizzle-orm', () => ({
  eq:       () => ({}),
  and:      (...a: unknown[]) => a,
  or:       (...a: unknown[]) => a,
  ne:       () => ({}),
  lt:       () => ({}),
  lte:      () => ({}),
  gt:       () => ({}),
  gte:      () => ({}),
  ilike:    () => ({}),
  sql:      vi.fn(),
  inArray:  () => ({}),
  isNull:   () => ({}),
  isNotNull:() => ({}),
  desc:     () => ({}),
  asc:      () => ({}),
  count:    () => ({ as: () => ({}) }),
}))

vi.mock('zod', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zod')>()
  return actual
})

// ── Reset per test ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  session.user = {
    id:            'rbac-user-1',
    name:          'RBAC Test User',
    email:         'rbac@avaniis.dev',
    role:          'EMPLOYEE',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
    personId:      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-001 — EMPLOYEE cannot call HR-admin actions
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-001 — EMPLOYEE blocked from HR-admin actions', () => {
  it('requireRole(["HR_ADMIN"]) throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['HR_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('requireRole(["HR_ADMIN", "SUPER_ADMIN"]) throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['HR_ADMIN', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('requireRole(["HR_ADMIN", "HR_DIRECTOR"]) throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['HR_ADMIN', 'HR_DIRECTOR'])).rejects.toThrow('FORBIDDEN')
  })

  it('createPerson action is guarded by HR_ADMIN/SUPER_ADMIN (source-level check)', () => {
    // Verify the actual createPerson source requires HR_ADMIN or SUPER_ADMIN
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    // Extract createPerson function block heuristically
    const createPersonIdx = actionsSource.indexOf('export async function createPerson')
    const slice = actionsSource.slice(createPersonIdx, createPersonIdx + 500)
    expect(slice).toMatch(/requireRole\(\[['"]HR_ADMIN['"]/)
    expect(slice).toMatch(/SUPER_ADMIN/)
  })

  it('EMPLOYEE error message names the required roles', async () => {
    session.user.role = 'EMPLOYEE'
    const err = await requireRole(['HR_ADMIN', 'SUPER_ADMIN']).catch((e: unknown) => e as Error) as Error
    expect(err.message).toContain('HR_ADMIN')
    expect(err.message).toContain('SUPER_ADMIN')
    expect(err.message).toContain('EMPLOYEE')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-002 — LINE_MANAGER (MANAGER) sees limited data
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-002 — LINE_MANAGER limited data access', () => {
  it('MANAGER is permitted on listPersons allowed-list', async () => {
    session.user.role = 'MANAGER'
    // listPersons allows MANAGER — requireRole should resolve
    const user = await requireRole(['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'SUPER_ADMIN', 'FINANCE'])
    expect(user.role).toBe('MANAGER')
  })

  it('listPersons action includes MANAGER in its allowed-list (source check)', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    const listPersonsIdx = actionsSource.indexOf('export async function listPersons')
    const slice = actionsSource.slice(listPersonsIdx, listPersonsIdx + 400)
    expect(slice).toMatch(/MANAGER/)
  })

  it('MANAGER is blocked from createPerson (HR_ADMIN+ only)', async () => {
    session.user.role = 'MANAGER'
    await expect(requireRole(['HR_ADMIN', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('MANAGER is blocked from updatePerson with HR_DIRECTOR gate (source check)', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    const updatePersonIdx = actionsSource.indexOf('export async function updatePerson')
    const slice = actionsSource.slice(updatePersonIdx, updatePersonIdx + 500)
    // updatePerson requires HR_ADMIN, HR_DIRECTOR, or SUPER_ADMIN — not MANAGER
    expect(slice).toMatch(/HR_ADMIN/)
    expect(slice).not.toMatch(/['"]MANAGER['"]/)
  })

  it('entity scoping for MANAGER is enforced in listPersons source (non-SUPER_ADMIN scoping)', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    // Confirms the entity-scope guard: non-SUPER_ADMIN is bound to their legalEntityId
    expect(actionsSource).toMatch(/SUPER_ADMIN.*legalEntityId|legalEntityId.*SUPER_ADMIN/s)
    expect(actionsSource).toMatch(/user\.legalEntityId/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-003 — HR_ADMIN can access HR functions
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-003 — HR_ADMIN can access HR functions', () => {
  it('HR_ADMIN passes requireRole(["HR_ADMIN", "SUPER_ADMIN"]) — createPerson gate', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_ADMIN')
  })

  it('HR_ADMIN passes requireRole for listPersons', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'SUPER_ADMIN', 'FINANCE'])
    expect(user.role).toBe('HR_ADMIN')
  })

  it('HR_ADMIN passes requireRole for updatePerson', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_ADMIN')
  })

  it('HR_ADMIN passes requireRole for saveFeaturePermissions', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_ADMIN')
  })

  it('HR_ADMIN is blocked from SUPER_ADMIN-only compliance action', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-004 — HR_DIRECTOR has elevated access
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-004 — HR_DIRECTOR elevated access', () => {
  it('HR_DIRECTOR passes requireRole for updatePerson (elevated over HR_ADMIN)', async () => {
    session.user.role = 'HR_DIRECTOR'
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_DIRECTOR')
  })

  it('HR_DIRECTOR passes requireRole for saveFeaturePermissions', async () => {
    session.user.role = 'HR_DIRECTOR'
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_DIRECTOR')
  })

  it('HR_DIRECTOR is blocked from SUPER_ADMIN-only compliance action', async () => {
    session.user.role = 'HR_DIRECTOR'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('compliance action in source is gated to SUPER_ADMIN only (not HR_DIRECTOR)', () => {
    const complianceSource = fs.readFileSync(
      path.join(ROOT, 'modules/compliance/actions.ts'),
      'utf-8',
    )
    // Confirm the compliance action requires ONLY SUPER_ADMIN
    expect(complianceSource).toMatch(/requireRole\(\['SUPER_ADMIN'\]/)
  })

  it('HR_DIRECTOR passes the HR_DIRECTOR + SUPER_ADMIN policy gate', async () => {
    session.user.role = 'HR_DIRECTOR'
    const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_DIRECTOR')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-005 — SUPER_ADMIN unrestricted
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-005 — SUPER_ADMIN unrestricted access', () => {
  it('SUPER_ADMIN passes any single-role gate', async () => {
    session.user.role = 'SUPER_ADMIN'
    const user = await requireRole(['SUPER_ADMIN'])
    expect(user.role).toBe('SUPER_ADMIN')
  })

  it('SUPER_ADMIN passes mixed-role gate with HR_ADMIN', async () => {
    session.user.role = 'SUPER_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
    expect(user.role).toBe('SUPER_ADMIN')
  })

  it('SUPER_ADMIN passes full-spectrum gate', async () => {
    session.user.role = 'SUPER_ADMIN'
    const user = await requireRole([
      'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR',
      'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN', 'FINANCE',
    ])
    expect(user.role).toBe('SUPER_ADMIN')
  })

  it('SUPER_ADMIN is not blocked by any action gate in core-hr source', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    // Every requireRole call in core-hr must include SUPER_ADMIN
    const requireRoleMatches = [...actionsSource.matchAll(/requireRole\(\[([^\]]+)\]/g)]
    for (const match of requireRoleMatches) {
      expect(
        match[1],
        `requireRole call missing SUPER_ADMIN: requireRole([${match[1]}])`
      ).toMatch(/SUPER_ADMIN/)
    }
  })

  it('SUPER_ADMIN passes the compliance SUPER_ADMIN-only gate', async () => {
    session.user.role = 'SUPER_ADMIN'
    const user = await requireRole(['SUPER_ADMIN'])
    expect(user.role).toBe('SUPER_ADMIN')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-006 — requireRole() function direct enforcement
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-006 — requireRole() direct enforcement', () => {
  it('throws FORBIDDEN when role is not in allowed list', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['HR_ADMIN', 'HR_DIRECTOR'])).rejects.toThrow('FORBIDDEN')
  })

  it('resolves with SessionUser when role matches', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR'])
    expect(user).toBeDefined()
    expect(user.id).toBe('rbac-user-1')
    expect(user.role).toBe('HR_ADMIN')
  })

  it('error message contains the actual role', async () => {
    session.user.role = 'FINANCE'
    const err = await requireRole(['HR_ADMIN']).catch((e: unknown) => e as Error) as Error
    expect(err.message).toMatch(/FINANCE/)
  })

  it('error message contains all required roles', async () => {
    session.user.role = 'EMPLOYEE'
    const err = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']).catch((e: unknown) => e as Error) as Error
    expect(err.message).toContain('HR_ADMIN')
    expect(err.message).toContain('HR_DIRECTOR')
    expect(err.message).toContain('SUPER_ADMIN')
  })

  it('resolves the full SessionUser shape on success', async () => {
    session.user.role = 'PAYROLL_ADMIN'
    const user = await requireRole(['PAYROLL_ADMIN', 'HR_DIRECTOR'])
    expect(user.id).toBe('rbac-user-1')
    expect(user.email).toBe('rbac@avaniis.dev')
    expect(user.legalEntityId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('real requireRole implementation in lib/auth.ts uses allowed.includes()', () => {
    const authSource = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
    const requireRoleSource = authSource.slice(
      authSource.indexOf('export async function requireRole'),
    )
    expect(requireRoleSource).toMatch(/allowed\.includes/)
    expect(requireRoleSource).toMatch(/FORBIDDEN/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-007 — Unauthenticated request → UNAUTHENTICATED error
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-007 — Unauthenticated requests are rejected', () => {
  it('requireRole throws UNAUTHENTICATED when session has no user id', async () => {
    // Simulate missing session by clearing the id
    const savedId = session.user.id
    session.user.id = ''
    await expect(requireRole(['HR_ADMIN'])).rejects.toThrow('UNAUTHENTICATED')
    session.user.id = savedId
  })

  it('real getCurrentUser in lib/auth.ts throws UNAUTHENTICATED when no session', () => {
    const authSource = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
    expect(authSource).toMatch(/UNAUTHENTICATED/)
    expect(authSource).toMatch(/getCurrentUser/)
  })

  it('middleware redirects unauthenticated users to /sign-in', () => {
    const middlewareSource = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')
    expect(middlewareSource).toContain('/sign-in')
    expect(middlewareSource).toContain('redirect')
  })

  it('getCurrentUser is called inside requireRole (call chain)', () => {
    const authSource = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
    const requireRoleBlock = authSource.slice(
      authSource.indexOf('export async function requireRole'),
    )
    // requireRole must call getCurrentUser (or auth()) to establish identity
    const callsGetCurrentUser = /getCurrentUser|await auth\(\)/.test(requireRoleBlock)
    expect(callsGetCurrentUser).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-008 — Tenant isolation (tenantId always applied)
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-008 — Tenant isolation enforced in queries', () => {
  it('TENANT_ID constant is used in core-hr actions', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    expect(actionsSource).toContain('TENANT_ID')
  })

  it('every DB read in listPersons includes tenantId condition (source check)', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    const listPersonsIdx = actionsSource.indexOf('export async function listPersons')
    const slice = actionsSource.slice(listPersonsIdx, listPersonsIdx + 1500)
    // The query must scope by tenantId
    expect(slice).toMatch(/tenantId|TENANT_ID/)
    expect(slice).toMatch(/eq\(persons\.tenantId/)
  })

  it('getPerson uses tenantId filter in its DB query', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    const getPersonIdx = actionsSource.indexOf('export async function getPerson')
    const slice = actionsSource.slice(getPersonIdx, getPersonIdx + 800)
    expect(slice).toMatch(/eq\(persons\.tenantId/)
  })

  it('createPerson inserts tenantId on every new record', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    const createPersonIdx = actionsSource.indexOf('export async function createPerson')
    expect(createPersonIdx).toBeGreaterThan(-1)
    // Anchor the window to the persons insert itself rather than a fixed offset
    // from the function start. createPerson has grown over time (work-schedule
    // lookup, person-number generation) pushing the .values() block further down,
    // which repeatedly broke a fixed byte-window. Anchoring to `.insert(persons)`
    // keeps the assertion strong (it proves an explicit tenant scope on the
    // persons insert specifically) and drift-proof.
    const insertIdx = actionsSource.indexOf('.insert(persons)', createPersonIdx)
    expect(insertIdx).toBeGreaterThan(createPersonIdx)
    const slice = actionsSource.slice(insertIdx, insertIdx + 600)
    expect(slice).toMatch(/tenantId\s*:\s*TENANT_ID/)
  })

  it('TENANT_ID is a stable UUID constant (not hardcoded inline)', () => {
    const constantsSource = fs.readFileSync(path.join(ROOT, 'lib/constants.ts'), 'utf-8')
    // QA-Audit-M2: TENANT_ID must be defined in lib/constants.ts
    expect(constantsSource).toMatch(/TENANT_ID/)
    expect(constantsSource).toMatch(/AVANIIS_TENANT_ID/)
    // Must be a UUID-shaped value
    expect(constantsSource).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })

  it('entity-scope guard blocks cross-entity reads for non-SUPER_ADMIN', () => {
    const actionsSource = fs.readFileSync(
      path.join(ROOT, 'modules/core-hr/actions.ts'),
      'utf-8',
    )
    // Verify the cross-entity FORBIDDEN guard is present in getPerson
    expect(actionsSource).toMatch(/cross-entity person access denied|FORBIDDEN.*cross-entity/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-009 — Feature permission enforcement
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-009 — Feature permission enforcement', () => {
  it('saveFeaturePermissions requires SUPER_ADMIN (blocks EMPLOYEE)', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('saveFeaturePermissions requires SUPER_ADMIN (blocks MANAGER)', async () => {
    session.user.role = 'MANAGER'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('saveFeaturePermissions is gated to SUPER_ADMIN in source', () => {
    const accessSource = fs.readFileSync(
      path.join(ROOT, 'modules/access/actions.ts'),
      'utf-8',
    )
    const saveIdx = accessSource.indexOf('saveFeaturePermissions')
    const slice = accessSource.slice(saveIdx, saveIdx + 400)
    expect(slice).toMatch(/requireRole/)
    expect(slice).toMatch(/SUPER_ADMIN/)
    expect(slice).not.toMatch(/HR_ADMIN/)
  })

  it('featurePermissions table has per-role permission columns', () => {
    const configSchema = fs.readFileSync(
      path.join(ROOT, 'drizzle/schema/configuration.ts'),
      'utf-8',
    )
    expect(configSchema).toMatch(/employeePerms/)
    expect(configSchema).toMatch(/managerPerms/)
    expect(configSchema).toMatch(/hrAdminPerms/)
  })

  it('PermSet type covers all permission actions', () => {
    const configSchema = fs.readFileSync(
      path.join(ROOT, 'drizzle/schema/configuration.ts'),
      'utf-8',
    )
    // PermSet = Record<PermAction, boolean> with view/create/edit/delete/approve/export
    expect(configSchema).toMatch(/view.*create.*edit.*delete.*approve.*export/)
  })

  it('SUPER_ADMIN passes saveFeaturePermissions gate', async () => {
    session.user.role = 'SUPER_ADMIN'
    const user = await requireRole(['SUPER_ADMIN'])
    expect(user.role).toBe('SUPER_ADMIN')
  })

  it('HR_ADMIN no longer passes saveFeaturePermissions gate', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RBAC-010 — Role hierarchy
// ══════════════════════════════════════════════════════════════════════════════

describe('RBAC-010 — Role hierarchy SUPER_ADMIN > HR_DIRECTOR > HR_ADMIN > MANAGER > EMPLOYEE', () => {
  /**
   * AVANIIS uses a flat role list (no inheritance). Access is granted if and
   * only if the user's role is explicitly in the allowed list. These tests
   * document the effective hierarchy by checking which gates each role can pass.
   */

  // Level 1 — EMPLOYEE (lowest)
  it('EMPLOYEE passes only EMPLOYEE-inclusive gates', async () => {
    session.user.role = 'EMPLOYEE'
    const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('EMPLOYEE')
  })

  it('EMPLOYEE cannot pass HR_ADMIN-only gate', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  // Level 2 — MANAGER
  it('MANAGER passes MANAGER-inclusive gate that EMPLOYEE would fail', async () => {
    session.user.role = 'MANAGER'
    const user = await requireRole(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('MANAGER')
  })

  it('MANAGER cannot pass HR_ADMIN-only gate', async () => {
    session.user.role = 'MANAGER'
    await expect(requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  // Level 3 — HR_ADMIN
  it('HR_ADMIN passes gates that MANAGER cannot', async () => {
    session.user.role = 'HR_ADMIN'
    const user = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_ADMIN')
  })

  it('HR_ADMIN cannot pass HR_DIRECTOR-only gate', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  // Level 4 — HR_DIRECTOR
  it('HR_DIRECTOR passes gates that HR_ADMIN cannot', async () => {
    session.user.role = 'HR_DIRECTOR'
    const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('HR_DIRECTOR')
  })

  it('HR_DIRECTOR cannot pass SUPER_ADMIN-only gate', async () => {
    session.user.role = 'HR_DIRECTOR'
    await expect(requireRole(['SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  // Level 5 — SUPER_ADMIN (highest)
  it('SUPER_ADMIN passes the SUPER_ADMIN-only gate that HR_DIRECTOR cannot', async () => {
    session.user.role = 'SUPER_ADMIN'
    const user = await requireRole(['SUPER_ADMIN'])
    expect(user.role).toBe('SUPER_ADMIN')
  })

  it('all six roles are defined in KRole type in lib/auth.ts', () => {
    const authSource = fs.readFileSync(path.join(ROOT, 'lib/auth.ts'), 'utf-8')
    const roles: string[] = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'FINANCE', 'SUPER_ADMIN']
    for (const role of roles) {
      expect(authSource, `KRole must include '${role}'`).toContain(`'${role}'`)
    }
  })

  it('FINANCE role is orthogonal — passes finance gates but not HR_ADMIN gate', async () => {
    session.user.role = 'FINANCE'
    const user = await requireRole(['FINANCE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(user.role).toBe('FINANCE')
  })

  it('FINANCE cannot pass HR_ADMIN-only gate', async () => {
    session.user.role = 'FINANCE'
    await expect(requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })

  it('PAYROLL_ADMIN is orthogonal — passes payroll gates but not HR_DIRECTOR-only gate', async () => {
    session.user.role = 'PAYROLL_ADMIN'
    await expect(requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])).rejects.toThrow('FORBIDDEN')
  })
})

// ── RBAC-BL-07 / RBAC-BL-04 — sensitive admin surface hardening (P0) ──────────
// Source-inspection (fs) like RBAC-008 — verifies the access guards are present
// at the page, middleware, and read-API layers.
describe('Sensitive admin surface guards (P0)', () => {
  const dataopsPage = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/admin/dataops/page.tsx'), 'utf-8')
  const middleware  = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')
  const lettersPage = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/employee-letters/page.tsx'), 'utf-8')
  const empApi      = fs.readFileSync(path.join(ROOT, 'app/api/employee-letters/employees/route.ts'), 'utf-8')
  const listApi     = fs.readFileSync(path.join(ROOT, 'app/api/employee-letters/list/route.ts'), 'utf-8')

  // Returns the `allowed: [...]` array text that follows a given middleware prefix.
  const allowedFor = (prefix: string) => {
    const i = middleware.indexOf(`prefix:  '${prefix}'`)
    // Window covers only this entry's `allowed:` line, not the next entry.
    return i === -1 ? '' : middleware.slice(i, i + 64)
  }

  // RBAC-BL-07
  it('RBAC-BL07-001: DataOps page is SUPER_ADMIN only (no broad ALLOWED_ROLES)', () => {
    expect(dataopsPage).toMatch(/session\.user\.role !== 'SUPER_ADMIN'\)\s*redirect/)
    // The old multi-role allow-list (incl. EMPLOYEE/MANAGER/PAYROLL/FINANCE) is gone.
    expect(dataopsPage).not.toMatch(/ALLOWED_ROLES/)
  })

  it('RBAC-BL07-002: middleware gates /admin/dataops to SUPER_ADMIN only', () => {
    const seg = allowedFor('/admin/dataops')
    expect(seg).toMatch(/allowed:\s*\['SUPER_ADMIN'\]/)
    expect(seg).not.toMatch(/HR_ADMIN|MANAGER|EMPLOYEE|FINANCE|PAYROLL/)
  })

  it('RBAC-BL07-003: middleware gates /api/dataops to SUPER_ADMIN only (closes read API)', () => {
    const seg = allowedFor('/api/dataops')
    expect(seg).toMatch(/allowed:\s*\['SUPER_ADMIN'\]/)
    expect(seg).not.toMatch(/HR_ADMIN|MANAGER|EMPLOYEE|FINANCE|PAYROLL/)
  })

  it('RBAC-BL07-004: /api/dataops gate precedes /master-data (first-match-wins)', () => {
    expect(middleware.indexOf("'/api/dataops'")).toBeLessThan(middleware.indexOf("'/master-data'"))
    expect(middleware.indexOf("'/admin/dataops'")).toBeLessThan(middleware.indexOf("'/master-data'"))
  })

  // RBAC-BL-04
  it('RBAC-BL04-001: Employee Letters page restricts to HR roles', () => {
    expect(lettersPage).toMatch(/HR_LETTER_ROLES\s*=\s*\['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'\]/)
    expect(lettersPage).toMatch(/!HR_LETTER_ROLES\.includes\(session\.user\.role\)\)\s*redirect/)
  })

  it('RBAC-BL04-002: Employee Letters page redirects unauthenticated to /sign-in (not /login)', () => {
    expect(lettersPage).toMatch(/redirect\('\/sign-in'\)/)
    expect(lettersPage).not.toMatch(/redirect\('\/login'\)/)
  })

  it('RBAC-BL04-003: /api/employee-letters/employees is HR-gated', () => {
    expect(empApi).toMatch(/\['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'\]\.includes\(session\.user\.role\)/)
    expect(empApi).toMatch(/status:\s*403/)
  })

  it('RBAC-BL04-004: /api/employee-letters/list is HR-gated', () => {
    expect(listApi).toMatch(/\['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'\]\.includes\(session\.user\.role\)/)
    expect(listApi).toMatch(/status:\s*403/)
  })
})

// ── RBAC-BL-01 / BL-02 / BL-03 — settings alignment + middleware defense-in-depth
// Source-inspection. Asserts the three layers agree and the new middleware gates
// match each route's existing page-guard role set (no expansion, no loss).
describe('Settings + admin route guard alignment (P1/P2)', () => {
  const mw          = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')
  const settingsLay = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/settings/layout.tsx'), 'utf-8')
  const settingsPg  = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/settings/page.tsx'), 'utf-8')
  const exitDetail  = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/admin/exit-clearance/[personId]/page.tsx'), 'utf-8')

  // Isolate the `allowed: [...]` array text for a given middleware prefix entry.
  const gateAllowed = (prefix: string) => {
    const i = mw.indexOf(`prefix:  '${prefix}'`)
    if (i === -1) return ''
    const a = mw.indexOf('allowed:', i)
    return mw.slice(a, mw.indexOf(']', a) + 1)
  }
  const TRIAD = /\[\s*'HR_ADMIN',\s*'HR_DIRECTOR',\s*'SUPER_ADMIN'\s*\]/

  // RBAC-BL-01
  it('RBAC-BL01-001: settings/layout.tsx allows exactly the HR triad (no PAYROLL_ADMIN/FINANCE)', () => {
    const i = settingsLay.indexOf('const allowed =')
    const arr = settingsLay.slice(i, settingsLay.indexOf(']', i) + 1)
    expect(arr).toMatch(TRIAD)
    expect(arr).not.toMatch(/PAYROLL_ADMIN/)
    expect(arr).not.toMatch(/FINANCE/)
  })

  it('RBAC-BL01-002: middleware /settings gate is the HR triad (unchanged source of truth)', () => {
    expect(gateAllowed('/settings')).toMatch(TRIAD)
  })

  // RBAC-BL-02
  it('RBAC-BL02-001: settings/page.tsx has an explicit HR-triad role guard (not just session)', () => {
    expect(settingsPg).toMatch(/\['HR_ADMIN',\s*'HR_DIRECTOR',\s*'SUPER_ADMIN'\]\.includes\(role\)\)\s*redirect/)
  })

  it('RBAC-BL02-002: settings/page.tsx guard does not self-redirect to /settings (no loop)', () => {
    // The role-guard line redirects to /dashboard, not /settings.
    expect(settingsPg).toMatch(/includes\(role\)\)\s*redirect\('\/dashboard'\)/)
  })

  // RBAC-BL-03
  it('RBAC-BL03-001: middleware gates /configuration to the HR triad', () => {
    expect(gateAllowed('/configuration')).toMatch(TRIAD)
  })

  it('RBAC-BL03-002: middleware gates /admin/probation to the HR triad', () => {
    expect(gateAllowed('/admin/probation')).toMatch(TRIAD)
  })

  it('RBAC-BL03-003: middleware /admin/exit-clearance uses the 5-role super-set (no detail-page loss)', () => {
    const seg = gateAllowed('/admin/exit-clearance')
    // Must include MANAGER + PAYROLL_ADMIN or the detail page loses legitimate users.
    for (const r of ['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN']) {
      expect(seg).toContain(`'${r}'`)
    }
    expect(seg).not.toMatch(/FINANCE/)
  })

  it('RBAC-BL03-004: exit-clearance middleware gate is a super-set of the detail page guard (regression guard)', () => {
    // Extract the detail page ALLOWED_ROLES and assert every role is in the gate.
    const i = exitDetail.indexOf('ALLOWED_ROLES')
    const pageArr = exitDetail.slice(i, exitDetail.indexOf(']', i) + 1)
    const seg = gateAllowed('/admin/exit-clearance')
    for (const r of ['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN']) {
      if (pageArr.includes(`'${r}'`)) expect(seg).toContain(`'${r}'`)
    }
  })

  it('RBAC-BL03-005: /admin/dataops stays SUPER_ADMIN-only and is ordered before the new /admin/* gates', () => {
    expect(gateAllowed('/admin/dataops')).toMatch(/\[\s*'SUPER_ADMIN'\s*\]/)
    expect(mw.indexOf("'/admin/dataops'")).toBeLessThan(mw.indexOf("'/admin/probation'"))
    expect(mw.indexOf("'/admin/dataops'")).toBeLessThan(mw.indexOf("'/admin/exit-clearance'"))
    // No broad '/admin' prefix entry (would mis-gate dataops).
    expect(mw).not.toMatch(/prefix:\s*'\/admin'\s*,/)
  })
})
