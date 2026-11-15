import { describe, it, expect, vi, beforeEach } from 'vitest'

// branch-safety.ts imports 'server-only' (throws outside RSC) — neutralize for unit tests.
vi.mock('server-only', () => ({}))

import * as M from '@/modules/migration/manifest'
import { getBranchSafety } from '@/modules/migration/branch-safety'

describe('MIG — Manifest integrity', () => {
  it('MIG-001: 48 positions, 6 departments, 4 locations, 1 grade, 1 BU', () => {
    expect(M.POSITIONS.length).toBe(48)
    expect(M.DEPARTMENTS.length).toBe(6)
    expect(M.LOCATIONS.length).toBe(4)
    expect(M.GRADE.code).toBe('KPD-G-01')
    expect(M.BUSINESS_UNIT.code).toBe('KPD-BU-01')
  })

  it('MIG-002: position codes are unique', () => {
    const codes = M.POSITIONS.map(p => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('MIG-003: every position maps to a real department code', () => {
    const deptCodes = new Set(M.DEPARTMENTS.map(d => d.code))
    for (const p of M.POSITIONS) expect(deptCodes.has(p.deptCode), `${p.code} → ${p.deptCode}`).toBe(true)
  })

  it('MIG-004: exactly 6 HOD positions, one per department prefix', () => {
    const hods = M.POSITIONS.filter(p => p.isHod)
    expect(hods.length).toBe(6)
    expect(new Set(hods.map(h => h.deptCode)).size).toBe(6)
  })

  it('MIG-005: job code is derived from position code (-P → -J)', () => {
    expect(M.jobCodeForPosition('DEV-P001')).toBe('DEV-J001')
    expect(M.jobCodeForPosition('COR-P005')).toBe('COR-J005')
  })

  it('MIG-006: each department head references a K-number employee', () => {
    for (const d of M.DEPARTMENTS) expect(d.headEmployeeNumber).toMatch(/^K\d+$/)
  })
})

// ── safeRefreshStatus behaviour (unit-tests for the UI logic contract) ─────────
// These tests document the expected behaviour of the safeRefreshStatus() helper
// that was added to MigrationConsoleV2 to prevent the Step 2 crash.
// They verify the response-shape rules, not the React component itself.

describe('MIG — safeRefreshStatus response contract', () => {
  // Simulate the guard condition used in safeRefreshStatus
  function isValidMigrationStatus(s: unknown): boolean {
    return (
      s !== null &&
      s !== undefined &&
      typeof s === 'object' &&
      'branch' in (s as object) &&
      !!(s as { branch?: unknown }).branch
    )
  }

  it('MIG-RST-001: valid MigrationStatus with branch passes the guard', () => {
    const validStatus = {
      branch: {
        safe: true,
        enabled: true,
        databaseEnv: 'uat',
        governanceMode: 'single-dev-uat',
        hostMasked: 'ep-**',
        isProductionHost: false,
        prodHostConfigured: true,
        targetDiffersFromProduction: true,
        productionComparisonRequired: false,
        allowNonProdCloudWrite: true,
        allowUatReloadWrite: true,
        reason: 'ok',
      },
      summary: {},
      items: [],
      toCreate: 0,
      alreadyPresent: 0,
    }
    expect(isValidMigrationStatus(validStatus)).toBe(true)
  })

  it('MIG-RST-002: undefined (server-action error path) fails the guard', () => {
    expect(isValidMigrationStatus(undefined)).toBe(false)
  })

  it('MIG-RST-003: null fails the guard', () => {
    expect(isValidMigrationStatus(null)).toBe(false)
  })

  it('MIG-RST-004: object without branch fails the guard', () => {
    expect(isValidMigrationStatus({ error: 'DB timeout' })).toBe(false)
  })

  it('MIG-RST-005: object with branch=undefined fails the guard', () => {
    expect(isValidMigrationStatus({ branch: undefined })).toBe(false)
  })

  it('MIG-RST-006: object with branch=null fails the guard', () => {
    expect(isValidMigrationStatus({ branch: null })).toBe(false)
  })

  it('MIG-RST-007: safe optional-chaining fallback never throws', () => {
    const testSafeAccess = (status: unknown) => {
      return (status as { branch?: { safe?: boolean } } | null | undefined)?.branch?.safe ?? false
    }
    expect(testSafeAccess(undefined)).toBe(false)
    expect(testSafeAccess(null)).toBe(false)
    expect(testSafeAccess({ branch: null })).toBe(false)
    expect(testSafeAccess({ branch: { safe: true } })).toBe(true)
    expect(testSafeAccess({ branch: { safe: false } })).toBe(false)
  })
})

describe('MIG — Branch safety guard', () => {
  const ORIG = { ...process.env }
  beforeEach(() => { process.env = { ...ORIG } })

  it('MIG-010: production host is blocked even when console is enabled', () => {
    process.env.ENABLE_MIGRATION_CONSOLE = 'true'
    process.env.DATABASE_ENV = 'uat'
    process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE = 'true'
    process.env.ALLOW_UAT_RELOAD_WRITE = 'true'
    process.env.PROD_DATABASE_URL = 'postgresql://u:p@ep-empty-boat-abc.eu-central-1.aws.neon.tech/neondb'
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
    const s = getBranchSafety()
    expect(s.isProductionHost).toBe(true)
    expect(s.safe).toBe(false)
  })

  it('MIG-013: production DATABASE_ENV is never safe for migration reloads', () => {
    process.env.ENABLE_MIGRATION_CONSOLE = 'true'
    process.env.DATABASE_ENV = 'production'
    process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE = 'true'
    process.env.ALLOW_UAT_RELOAD_WRITE = 'true'
    process.env.PROD_DATABASE_URL = 'postgresql://u:p@ep-empty-boat-abc.eu-central-1.aws.neon.tech/neondb'
    process.env.DATABASE_URL = 'postgresql://u:p@ep-square-union-al2bxhr1.eu-central-1.aws.neon.tech/neondb'
    const s = getBranchSafety()
    expect(s.databaseEnv).toBe('production')
    expect(s.safe).toBe(false)
  })

  it('MIG-011: the active DEV/UAT target is safe with explicit write and reload flags', () => {
    process.env.ENABLE_MIGRATION_CONSOLE = 'true'
    process.env.ENV_GOVERNANCE_MODE = 'single-dev-uat'
    process.env.DATABASE_ENV = 'uat'
    process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE = 'true'
    process.env.ALLOW_UAT_RELOAD_WRITE = 'true'
    delete process.env.PROD_DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://u:p@ep-square-union-al2bxhr1.eu-central-1.aws.neon.tech/neondb'
    const s = getBranchSafety()
    expect(s.governanceMode).toBe('single-dev-uat')
    expect(s.productionComparisonRequired).toBe(false)
    expect(s.isProductionHost).toBe(false)
    expect(s.safe).toBe(true)
    expect(s.hostMasked).not.toContain('square-union') // masked
  })

  it('MIG-014: missing ALLOW_UAT_RELOAD_WRITE blocks the migration console', () => {
    process.env.ENABLE_MIGRATION_CONSOLE = 'true'
    process.env.DATABASE_ENV = 'uat'
    process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE = 'true'
    delete process.env.ALLOW_UAT_RELOAD_WRITE
    process.env.PROD_DATABASE_URL = 'postgresql://u:p@ep-empty-boat-abc.eu-central-1.aws.neon.tech/neondb'
    process.env.DATABASE_URL = 'postgresql://u:p@ep-square-union-al2bxhr1.eu-central-1.aws.neon.tech/neondb'
    const s = getBranchSafety()
    expect(s.allowUatReloadWrite).toBe(false)
    expect(s.safe).toBe(false)
  })

  it('MIG-015: missing PROD_DATABASE_URL blocks only after future production mode is enabled', () => {
    process.env.ENABLE_MIGRATION_CONSOLE = 'true'
    process.env.ENV_GOVERNANCE_MODE = 'uat-prod'
    process.env.DATABASE_ENV = 'uat'
    process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE = 'true'
    process.env.ALLOW_UAT_RELOAD_WRITE = 'true'
    delete process.env.PROD_DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://u:p@ep-square-union-al2bxhr1.eu-central-1.aws.neon.tech/neondb'
    const s = getBranchSafety()
    expect(s.productionComparisonRequired).toBe(true)
    expect(s.prodHostConfigured).toBe(false)
    expect(s.safe).toBe(false)
  })

  it('MIG-012: disabled flag blocks writes regardless of host', () => {
    delete process.env.ENABLE_MIGRATION_CONSOLE
    process.env.DATABASE_ENV = 'uat'
    process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE = 'true'
    process.env.ALLOW_UAT_RELOAD_WRITE = 'true'
    process.env.PROD_DATABASE_URL = 'postgresql://u:p@ep-empty-boat-abc.eu-central-1.aws.neon.tech/neondb'
    process.env.DATABASE_URL = 'postgresql://u:p@ep-square-union-al2bxhr1.eu-central-1.aws.neon.tech/neondb'
    const s = getBranchSafety()
    expect(s.enabled).toBe(false)
    expect(s.safe).toBe(false)
  })
})
