import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase C — RBAC & Workflow Operations — WIPC-001…012
 * Read-only org-wide oversight at /approvals/operations, HR leadership only,
 * legal-entity scoped. Enforced by middleware + page guard + getWorkflowOperations.
 */
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const QUERIES = read('modules/workflow-intelligence/queries.ts')
const MIDDLEWARE = read('middleware.ts')
const NAV = read('config/workspace-nav.ts')
const SECONDARY = read('components/layout/WorkspaceSecondaryNav.tsx')
const PAGE = read('app/(hr-admin)/approvals/operations/page.tsx')

describe('getWorkflowOperations role gate + entity scope (WIPC-001…006)', () => {
  it('WIPC-001: non-HR roles get an empty result (role gate)', () => {
    expect(QUERIES).toContain('if (!u || !HIGH_PRIVILEGE.includes(u.role)) return empty')
  })
  it('WIPC-002: HIGH_PRIVILEGE = HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN only', () => {
    expect(QUERIES).toContain("const HIGH_PRIVILEGE = HIGH_PRIVILEGE_ROLES")
    const access = read('modules/workflow-intelligence/access.ts')
    expect(access).toContain("HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']")
  })
  it('WIPC-003: SUPER_ADMIN unscoped, others scoped to their legal entity', () => {
    expect(QUERIES).toContain("u.role === 'SUPER_ADMIN' ? sql`TRUE` : sql`legal_entity_id = ${u.legalEntityId}`")
  })
  it('WIPC-004: entity clause applied in SQL WHERE (not post-filtered)', () => {
    expect(QUERIES).toContain('WHERE tenant_id = ${TENANT_ID} AND ${entity}')
  })
  it('WIPC-005: aggregates computed within the scoped query', () => {
    expect(QUERIES).toMatch(/aggregates: \{ pending[\s\S]*byApprover \}/)
    expect(QUERIES).toContain("count(*) FILTER (WHERE is_sla_breached)")
  })
  it('WIPC-006: paginated (limit/offset), capped', () => {
    expect(QUERIES).toContain('Math.min(Math.max(filters.limit ?? 50, 1), 200)')
  })
})

describe('Middleware + page guard (WIPC-007…009)', () => {
  it('WIPC-007: middleware gates /approvals/operations to the 3 HR roles', () => {
    expect(MIDDLEWARE).toMatch(/prefix:\s*'\/approvals\/operations',\s*\n\s*allowed:\s*\['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'\]/)
  })
  it('WIPC-008: /approvals base is NOT gated (employees keep their queue)', () => {
    expect(MIDDLEWARE).not.toMatch(/prefix:\s*'\/approvals',/)
  })
  it('WIPC-009: page re-checks role (defense-in-depth) and redirects others', () => {
    expect(PAGE).toContain("const OPS_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']")
    expect(PAGE).toContain('if (!OPS_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))')
  })
})

describe('Navigation (WIPC-010)', () => {
  it('WIPC-010: Operations nav item restricted to HR roles via allowedRoles', () => {
    expect(NAV).toContain("route: '/approvals/operations'")
    expect(NAV).toContain("allowedRoles: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']")
    expect(SECONDARY).toContain('!item.allowedRoles || item.allowedRoles.includes(role)')
  })
})

describe('Read-only + no migrations (WIPC-011…012)', () => {
  it('WIPC-011: Operations page is read-only (no approve/reject/action/engine calls)', () => {
    expect(PAGE).toContain('getWorkflowOperations')
    expect(PAGE).not.toContain('WorkflowActionForm')
    expect(PAGE).not.toContain('takeWorkflowAction')
    expect(PAGE).not.toMatch(/\bapproveRequest\b|\brejectRequest\b|onSubmit|"use client"|'use client'/)
  })
  it('WIPC-012: Phase C adds NO schema migrations (still only the 4 Phase-A wip files)', () => {
    const wip = readdirSync(join(ROOT, 'drizzle/migrations')).filter(f => f.includes('wip')).sort()
    expect(wip).toEqual([
      '0055_wip_step_instance_columns.sql',
      '0056_wip_notification_queue_meta.sql',
      '0057_wip_audit_immutability.sql',
      '0060_wip_intelligence_view.sql',
    ])
  })
})
