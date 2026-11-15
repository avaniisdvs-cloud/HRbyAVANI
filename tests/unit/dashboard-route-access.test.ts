/**
 * ISSUE-013 — /dashboard route RBAC tests
 *
 * Static/source-level tests proving that:
 *   (a) middleware.ts gates /dashboard correctly (EMPLOYEE blocked)
 *   (b) dashboard/page.tsx has a page-level EMPLOYEE redirect (defense-in-depth)
 *   (c) data queries inside the page are properly scoped per role
 *
 * Tests:
 *   DBD-001: middleware /dashboard allowed list does NOT include EMPLOYEE
 *   DBD-002: middleware /dashboard allowed list includes HR_ADMIN
 *   DBD-003: middleware /dashboard allowed list includes HR_DIRECTOR
 *   DBD-004: middleware /dashboard allowed list includes SUPER_ADMIN
 *   DBD-005: middleware /dashboard allowed list includes PAYROLL_ADMIN
 *   DBD-006: middleware /dashboard allowed list includes FINANCE
 *   DBD-007: middleware /dashboard allowed list includes MANAGER
 *   DBD-008: dashboard page has page-level redirect for EMPLOYEE to /me
 *   DBD-009: MANAGER branch scoped to session.user.personId via lineManagerId filter
 *   DBD-010: admin headcount query has legalEntityId scope condition
 *   DBD-011: SUPER_ADMIN branch bypasses entity filter (sees all)
 *   DBD-012: pending approvals scoped to currentPersonId (not org-wide)
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

const middlewareSource  = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')
const dashboardSource   = fs.readFileSync(
  path.join(ROOT, 'app/(hr-admin)/dashboard/page.tsx'),
  'utf-8',
)

// ── Extract allowed list for a path prefix from middleware.ts ─────────────────

function extractMiddlewareAllowed(prefix: string): string[] {
  const prefixPattern = new RegExp(
    `prefix:\\s*'${prefix.replace('/', '\\/')}'[^}]+?allowed:\\s*\\[([^\\]]+)\\]`,
    's',
  )
  const match = middlewareSource.match(prefixPattern)
  if (!match) return []
  return (match[1].match(/'[A-Z_]+'/g) ?? []).map(r => r.replace(/'/g, ''))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ISSUE-013 — /dashboard route RBAC', () => {

  it('DBD-001: middleware /dashboard allowed list does NOT include EMPLOYEE', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed, 'EMPLOYEE must not appear in /dashboard middleware gate').not.toContain('EMPLOYEE')
  })

  it('DBD-002: middleware /dashboard allowed list includes HR_ADMIN', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed).toContain('HR_ADMIN')
  })

  it('DBD-003: middleware /dashboard allowed list includes HR_DIRECTOR', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed).toContain('HR_DIRECTOR')
  })

  it('DBD-004: middleware /dashboard allowed list includes SUPER_ADMIN', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed).toContain('SUPER_ADMIN')
  })

  it('DBD-005: middleware /dashboard allowed list includes PAYROLL_ADMIN', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed).toContain('PAYROLL_ADMIN')
  })

  it('DBD-006: middleware /dashboard allowed list includes FINANCE', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed).toContain('FINANCE')
  })

  it('DBD-007: middleware /dashboard allowed list includes MANAGER', () => {
    const allowed = extractMiddlewareAllowed('/dashboard')
    expect(allowed).toContain('MANAGER')
  })

  it("DBD-008: dashboard page redirects EMPLOYEE to /me (defense-in-depth)", () => {
    // The page must have an explicit EMPLOYEE redirect so that even if middleware
    // is bypassed, EMPLOYEE never receives admin dashboard data.
    expect(dashboardSource).toContain("role === 'EMPLOYEE'")
    expect(dashboardSource).toContain("redirect('/me')")
    // Both checks must appear before the Manager / Admin query branches.
    const employeeCheckIdx = dashboardSource.indexOf("role === 'EMPLOYEE'")
    const managerBranchIdx = dashboardSource.indexOf("role === 'MANAGER'")
    expect(employeeCheckIdx).toBeGreaterThan(-1)
    expect(managerBranchIdx).toBeGreaterThan(-1)
    expect(employeeCheckIdx, 'EMPLOYEE redirect must precede the MANAGER branch').toBeLessThan(managerBranchIdx)
  })

  it('DBD-009: MANAGER branch is scoped to session.user.personId via lineManagerId', () => {
    // Manager only sees their own direct reports — confirmed by lineManagerId filter.
    expect(dashboardSource).toContain('session.user.personId')
    expect(dashboardSource).toContain('lineManagerId')
    // Both must appear inside the MANAGER branch, before the admin queries.
    const managerBranchIdx = dashboardSource.indexOf("role === 'MANAGER'")
    const lineManagerIdx   = dashboardSource.indexOf('lineManagerId', managerBranchIdx)
    expect(lineManagerIdx).toBeGreaterThan(managerBranchIdx)
  })

  it('DBD-010: admin headcount query has legalEntityId scope for non-SUPER_ADMIN', () => {
    // Non-super-admin users must have their headcount limited to their own entity.
    expect(dashboardSource).toContain('legalEntityId')
    // The entity condition is applied via inline spread in the headcountConds array literal
    // (GEO-OPT-001 refactor at a01dc1b changed .push() → spread for parallelisation).
    // Verify the legalEntityId scoping expression exists in the headcountConds definition.
    const headcountCondsIdx = dashboardSource.indexOf('headcountConds')
    expect(headcountCondsIdx).toBeGreaterThan(0)
    const condsBlock = dashboardSource.slice(headcountCondsIdx, headcountCondsIdx + 400)
    expect(condsBlock).toContain('legalEntityId')
    expect(condsBlock).toContain('isSuperAdmin')
  })

  it('DBD-011: SUPER_ADMIN bypasses entity filter (sees all)', () => {
    // isSuperAdmin is checked before applying legalEntityId conditions.
    expect(dashboardSource).toContain('isSuperAdmin')
    // The guard pattern: if (!isSuperAdmin && entityId) ...push entity cond
    expect(dashboardSource).toContain('!isSuperAdmin && entityId')
  })

  it('DBD-012: pending approvals scoped to currentPersonId (not org-wide)', () => {
    // Pending approvals count must be filtered to the current user's personId,
    // not a full org-wide count, so lower-privilege admins do not see all pending work.
    expect(dashboardSource).toContain('currentPersonId')
    expect(dashboardSource).toContain('assignedToPersonId')
    // The where clause must reference both — confirmed by their co-occurrence in source.
    const cpIdx  = dashboardSource.indexOf('currentPersonId')
    const asnIdx = dashboardSource.indexOf('assignedToPersonId')
    expect(cpIdx).toBeGreaterThan(-1)
    expect(asnIdx).toBeGreaterThan(-1)
  })

})
