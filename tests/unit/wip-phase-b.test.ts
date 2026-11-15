import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateViewerAccess, type AccessFacts } from '@/modules/workflow-intelligence/access'

/**
 * Phase B — Shared Services & Universal Timeline — WIPB-001…020
 * Security core (CWE-639) tested as pure logic; wiring tested by source-inspection.
 */
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const QUERIES = read('modules/workflow-intelligence/queries.ts')
const INDEX   = read('modules/workflow-intelligence/index.ts')
const STATUS  = read('lib/workflow-status.ts')
const TIMELINE = read('components/workflow/WorkflowTimeline.tsx')
const PAGE    = read('app/(hr-admin)/approvals/[instanceId]/page.tsx')

// Base: a non-stakeholder employee in a different entity.
const base = (): AccessFacts => ({
  role: 'EMPLOYEE', personId: 'P-VIEWER', viewerLegalEntityId: 'E2',
  initiatedByPersonId: 'P-OWNER', instanceLegalEntityId: 'E1',
  stepAssigneePersonIds: ['P-MGR', 'P-HR'], isDeciderOrDelegate: false,
})

describe('CWE-639 authorization matrix — evaluateViewerAccess (WIPB-001…009)', () => {
  it('WIPB-001: initiator → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), personId: 'P-OWNER' })).toBe(true))
  it('WIPB-002: in-chain assignee → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), personId: 'P-HR' })).toBe(true))
  it('WIPB-003: decider/delegate (probed) → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), isDeciderOrDelegate: true })).toBe(true))
  it('WIPB-004: delegated-to recorded as current assignee → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), stepAssigneePersonIds: ['P-VIEWER'] })).toBe(true))
  it('WIPB-005: non-stakeholder EMPLOYEE → DENIED (fail closed)', () =>
    expect(evaluateViewerAccess(base())).toBe(false))
  it('WIPB-006: non-stakeholder MANAGER → DENIED', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'MANAGER' })).toBe(false))
  it('WIPB-007: cross-entity HR_ADMIN → DENIED', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'HR_ADMIN' /* E2 viewer vs E1 instance */ })).toBe(false))
  it('WIPB-008: same-entity HR_ADMIN & HR_DIRECTOR → allowed', () => {
    expect(evaluateViewerAccess({ ...base(), role: 'HR_ADMIN', viewerLegalEntityId: 'E1' })).toBe(true)
    expect(evaluateViewerAccess({ ...base(), role: 'HR_DIRECTOR', viewerLegalEntityId: 'E1' })).toBe(true)
  })
  it('WIPB-009: SUPER_ADMIN any entity → allowed', () =>
    expect(evaluateViewerAccess({ ...base(), role: 'SUPER_ADMIN' })).toBe(true))
  it('WIPB-009b: no personId + non-admin → DENIED', () =>
    expect(evaluateViewerAccess({ ...base(), personId: null })).toBe(false))
})

describe('Fail-closed wiring + audit (WIPB-010…011)', () => {
  it('WIPB-010: authorizeAndLoad returns null when not authorized; timeline/preview build on it', () => {
    expect(QUERIES).toContain('if (!(await isAuthorizedViewer(session, detail))) return null')
    expect(QUERIES).toContain('async function authorizeAndLoad')
    expect(QUERIES).toContain('const t = await authorizeAndLoad(session, instanceId)')
  })
  it('WIPB-011: authorized read writes a best-effort DETAIL_VIEWED audit', () => {
    expect(QUERIES).toContain("eventType:    'WORKFLOW.DETAIL_VIEWED'")
    expect(QUERIES).toMatch(/try \{[\s\S]*writeAuditLog[\s\S]*\} catch/)
  })
})

describe('Single status source (WIPB-012…013)', () => {
  it('WIPB-012: every status has bilingual label + tone', () => {
    for (const s of ['PENDING','IN_PROGRESS','APPROVED','REJECTED','WAITING','DELEGATED','ESCALATED']) {
      expect(STATUS).toContain(`${s}:`)
    }
    expect(STATUS).toContain('labelEn'); expect(STATUS).toContain('labelAr'); expect(STATUS).toContain('tone')
  })
  it('WIPB-013: detail page no longer defines an inline StatusPill map; uses WorkflowStatusBadge', () => {
    expect(PAGE).not.toContain('function StatusPill')
    expect(PAGE).toContain('WorkflowStatusBadge')
  })
})

describe('Universal timeline component (WIPB-014…015)', () => {
  it('WIPB-014: timeline renders chain + audit with friendly labels & shared badge', () => {
    expect(TIMELINE).toContain('friendlyAuditLabel')
    expect(TIMELINE).toContain('WorkflowStatusBadge')
  })
  it('WIPB-015: timeline shows chain (steps) and audit trail sections', () => {
    expect(TIMELINE).toContain('instance.steps.map')
    expect(TIMELINE).toContain('instance.auditEvents')
  })
})

describe('Preview auth parity + operations gating + re-home (WIPB-016…018)', () => {
  it('WIPB-016: notification preview uses the SAME gate (authorizeAndLoad)', () => {
    expect(QUERIES).toMatch(/getApprovalNotificationPreview[\s\S]*authorizeAndLoad\(session, instanceId\)/)
  })
  it('WIPB-017: getWorkflowOperations rejects non-HR roles and is entity-scoped', () => {
    expect(QUERIES).toContain('if (!u || !HIGH_PRIVILEGE.includes(u.role)) return empty')
    expect(QUERIES).toContain("u.role === 'SUPER_ADMIN' ? sql`TRUE` : sql`legal_entity_id = ${u.legalEntityId}`")
  })
  it('WIPB-018: module re-homes the two existing services (no reimplementation)', () => {
    expect(INDEX).toContain("export { getPendingApprovalsForUser } from '@/modules/aria'")
    expect(INDEX).toContain("export { getApprovalHistoryForUser } from '@/modules/workflow'")
  })
})

describe('Detail page CWE-639 fix wiring + no new migrations (WIPB-019…020)', () => {
  it('WIPB-019: page authorizes via getWorkflowTimeline and 404s when null', () => {
    expect(PAGE).toContain('const timeline = await getWorkflowTimeline(session, instanceId)')
    expect(PAGE).toContain('if (!timeline) notFound()')
    expect(PAGE).not.toContain('getWorkflowInstanceDetailV2')
  })
  it('WIPB-020: Phase B adds NO new migrations (only the 4 Phase-A wip files exist)', () => {
    const wip = readdirSync(join(ROOT, 'drizzle/migrations')).filter(f => f.includes('wip'))
    expect(wip.sort()).toEqual([
      '0055_wip_step_instance_columns.sql',
      '0056_wip_notification_queue_meta.sql',
      '0057_wip_audit_immutability.sql',
      '0060_wip_intelligence_view.sql',
    ])
  })
})
