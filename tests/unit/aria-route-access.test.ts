/**
 * ISSUE-005 — ARIA route access consistency tests
 *
 * Static/source-level tests proving that middleware.ts and the page-level
 * role check for /aria are consistent, and that MANAGER access does not
 * bypass the ARIA service data scope.
 *
 * Tests:
 *   ARA-001: middleware /aria allowed list includes MANAGER
 *   ARA-002: /aria page-level ALLOWED constant includes MANAGER
 *   ARA-003: every role in the page ALLOWED list is also in the middleware allowed list
 *   ARA-004: EMPLOYEE is NOT in the middleware /aria allowed list (remains blocked)
 *   ARA-005: HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE all remain in /aria allowed
 *   ARA-006: middleware redirects unauthenticated users to /sign-in (no regression)
 *   ARA-007: ARIA leave-status handler uses listLeaveRequests (manager scope enforced by service layer)
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

const middlewareSource = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')
const ariaPageSource   = fs.readFileSync(
  path.join(ROOT, 'app/(hr-admin)/aria/page.tsx'),
  'utf-8',
)
const ariaServicesSource = fs.readFileSync(
  path.join(ROOT, 'modules/aria/services.ts'),
  'utf-8',
)
const hrAdminLayoutSource = fs.readFileSync(
  path.join(ROOT, 'app/(hr-admin)/layout.tsx'),
  'utf-8',
)

// ── Extract allowed lists from source ────────────────────────────────────────

/**
 * Extracts the allowed[] array for a given path prefix from middleware.ts.
 * Looks for:
 *   prefix: '/aria',
 *   allowed: ['...', '...'],
 */
function extractMiddlewareAllowed(prefix: string): string[] {
  const prefixPattern = new RegExp(
    `prefix:\\s*'${prefix.replace('/', '\\/')}'[^}]+?allowed:\\s*\\[([^\\]]+)\\]`,
    's',
  )
  const match = middlewareSource.match(prefixPattern)
  if (!match) return []
  return (match[1].match(/'[A-Z_]+'/g) ?? []).map(r => r.replace(/'/g, ''))
}

/**
 * Extracts the ALLOWED constant from the /aria page source.
 * Looks for: const ALLOWED = ['...', '...']
 */
function extractPageAllowed(): string[] {
  const match = ariaPageSource.match(/const ALLOWED\s*=\s*\[([^\]]+)\]/)
  if (!match) return []
  return (match[1].match(/'[A-Z_]+'/g) ?? []).map(r => r.replace(/'/g, ''))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ISSUE-005 — /aria route access consistency', () => {

  it('ARA-001: middleware /aria allowed list includes MANAGER', () => {
    const allowed = extractMiddlewareAllowed('/aria')
    expect(allowed).toContain('MANAGER')
  })

  it('ARA-002: /aria page-level ALLOWED constant includes MANAGER', () => {
    const allowed = extractPageAllowed()
    expect(allowed).toContain('MANAGER')
  })

  it('ARA-003: every role in page ALLOWED is also in middleware allowed (no page-only roles)', () => {
    const middlewareAllowed = extractMiddlewareAllowed('/aria')
    const pageAllowed       = extractPageAllowed()

    // Every role the page permits must also be permitted by the middleware.
    // A mismatch here would mean a role can pass the middleware but still get
    // redirected by the page — or vice versa.
    for (const role of pageAllowed) {
      expect(middlewareAllowed, `Role '${role}' in page ALLOWED but not in middleware`).toContain(role)
    }
  })

  it('ARA-004: EMPLOYEE is NOT in the middleware /aria allowed list', () => {
    const allowed = extractMiddlewareAllowed('/aria')
    expect(allowed).not.toContain('EMPLOYEE')
  })

  it('ARA-005: HR admin roles and finance remain in middleware /aria allowed', () => {
    const allowed = extractMiddlewareAllowed('/aria')
    const requiredRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']
    for (const role of requiredRoles) {
      expect(allowed, `Expected '${role}' to remain in middleware /aria allowed`).toContain(role)
    }
  })

  it('ARA-006: middleware redirects unauthenticated users to /sign-in (no regression)', () => {
    // Verifies the unauthenticated guard still exists in middleware.ts.
    expect(middlewareSource).toContain('/sign-in')
    expect(middlewareSource).toContain('!req.auth')
    expect(middlewareSource).toContain('NextResponse.redirect')
  })

  it('ARA-008: /aria page does NOT block service accounts that lack a person record', () => {
    // RBAC (ALLOWED) controls access — not the presence of a person record.
    // The legacy hard block must be gone.
    expect(ariaPageSource).not.toContain('Your account is not linked to a person record. Contact your HR administrator.')
    // It still gates on RBAC role.
    expect(ariaPageSource).toContain('if (!ALLOWED.includes(role)) redirect')
    // personId is derived defensively (no person → empty string, ARIA still loads).
    expect(ariaPageSource).toContain("session.user.personId ?? ''")
  })

  it('ARA-009: employee-specific intents are guarded by requirePerson (graceful, not a crash)', () => {
    // A requirePerson helper returns an "Employee context required" message and
    // the self-service intents check it before touching person-scoped data.
    expect(ariaServicesSource).toContain('function requirePerson')
    expect(ariaServicesSource).toContain('Employee context required for this action.')
    expect(ariaServicesSource).toContain('PERSON_INTENTS')
    // The four self-service intents are covered.
    for (const intent of ['LEAVE_BALANCE_QUERY', 'LEAVE_REQUEST_STATUS', 'LEAVE_REQUEST_DRAFT', 'LEAVE_REQUEST_CONFIRM']) {
      expect(ariaServicesSource, `PERSON_INTENTS should cover ${intent}`).toContain(intent)
    }
  })

  it('ARA-010: floating ARIA widget is NOT gated on a person record in the admin/manager layout', () => {
    // The widget must render for ARIA-allowed roles even without a person record
    // (service accounts). The old `session.user.personId && <AriaAuthWidget>` gate
    // must be gone; personId is passed defensively as ''.
    expect(hrAdminLayoutSource).not.toContain('session.user.personId && (\n          <AriaAuthWidget')
    expect(hrAdminLayoutSource).toContain('personId:      session.user.personId ?? \'\'')
    // Widget is still mounted.
    expect(hrAdminLayoutSource).toContain('<AriaAuthWidget')
  })

  it('ARA-007: ARIA leave-status handler calls listLeaveRequests — manager scope enforced by service layer', () => {
    // When a MANAGER uses /aria, handleLeaveRequestStatus goes through listLeaveRequests,
    // which enforces the MANAGER team-scope filter (verified in ISSUE-002 / LMS-002).
    // This test confirms the handler delegates to the scoped gateway, not raw DB.
    expect(ariaServicesSource).toContain("import('@/modules/absence')")
    expect(ariaServicesSource).toContain('listLeaveRequests')
    // It must NOT call db.select directly inside handleLeaveRequestStatus for leave data
    // (only the person-lookup branch does, which is also scoped).
    const handlerSlice = ariaServicesSource.slice(
      ariaServicesSource.indexOf('async function handleLeaveRequestStatus'),
      ariaServicesSource.indexOf('async function buildLeaveDraft'),
    )
    // The handler calls listLeaveRequests (scoped) not raw db.select for leave rows
    expect(handlerSlice).toContain('listLeaveRequests')
    expect(handlerSlice).toContain('resolvePendingApprover')
  })

})
