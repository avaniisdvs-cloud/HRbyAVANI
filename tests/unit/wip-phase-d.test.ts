import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase D acceptance gate — R1 (Requester Visibility) · R2 (ESS My Requests) ·
 * R3 (WorkflowTimeline reuse) · R4 (Review performance). WIPD-R*.
 */
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const QUERIES = read('modules/workflow-intelligence/queries.ts')
const INDEX   = read('modules/workflow-intelligence/index.ts')
const LIST    = read('app/(employee)/me/requests/page.tsx')
const DETAIL  = read('app/(employee)/me/requests/[requestId]/page.tsx')
const SIDEBAR = read('components/employee/EmployeeSidebar.tsx')
const APPROVALS_PAGE = read('app/(hr-admin)/approvals/[instanceId]/page.tsx')
const ARIA_Q  = read('modules/aria/approval-queries.ts')

describe('R1 — Requester Workflow Visibility', () => {
  it('R1-001: getMyRequests is requester-scoped (initiated_by_person_id = self)', () => {
    expect(QUERIES).toContain('export async function getMyRequests')
    expect(QUERIES).toMatch(/getMyRequests[\s\S]*initiated_by_person_id = \$\{pid\}/)
    expect(QUERIES).toMatch(/getMyRequests[\s\S]*const pid = session\.user\?\.personId/)
  })
  it('R1-002: list surfaces current approver, stage, next approver, and progress', () => {
    expect(LIST).toContain('Pending with: ')         // current approver line
    expect(LIST).toContain('r.currentApproverName')
    expect(LIST).toContain('r.currentStepName')
    expect(LIST).toContain('r.nextApproverName')      // next approver
    expect(LIST).toContain('{r.currentStepOrder}/{r.totalSteps}') // progress
  })
  it('R1-003: status shown via the shared WorkflowStatusBadge (single vocabulary)', () => {
    expect(LIST).toContain('WorkflowStatusBadge')
  })
})

describe('R2 — ESS My Requests (generic, all types, initiator-scoped)', () => {
  it('R2-001: getMyRequests reads the canonical view with NO resource_type filter (all types)', () => {
    expect(QUERIES).toMatch(/getMyRequests[\s\S]*FROM workflow_intelligence_view/)
    const fn = QUERIES.slice(QUERIES.indexOf('export async function getMyRequests'), QUERIES.indexOf('export async function getMyRequests') + 600)
    expect(fn).not.toContain("resource_type =")  // not restricted to leave
  })
  it('R2-002: exported from the workflow-intelligence barrel', () => {
    expect(INDEX).toContain('getMyRequests')
  })
  it('R2-003: ESS page loads getMyRequests with the session (self only)', () => {
    expect(LIST).toContain('await getMyRequests(session)')
  })
  it('R2-004: sidebar exposes "My Requests" → /me/requests (bilingual)', () => {
    expect(SIDEBAR).toContain("href: '/me/requests'")
    expect(SIDEBAR).toContain("labelEn: 'My Requests'")
    expect(SIDEBAR).toContain('طلباتي')
  })
})

describe('R3 — WorkflowTimeline reuse (no duplicate timeline)', () => {
  it('R3-001: ESS detail reuses the shared WorkflowTimeline + Phase B getWorkflowTimeline', () => {
    expect(DETAIL).toContain("import { WorkflowTimeline } from '@/components/workflow/WorkflowTimeline'")
    expect(DETAIL).toContain('getWorkflowTimeline(session, requestId)')
    expect(DETAIL).toContain('<WorkflowTimeline data={timeline}')
  })
  it('R3-002: ESS detail no longer hand-rolls a timeline via getWorkflowInstanceDetailV2', () => {
    expect(DETAIL).not.toContain('getWorkflowInstanceDetailV2')
  })
  it('R3-003: exactly ONE WorkflowTimeline component exists (no duplicate implementation)', () => {
    const comps = readdirSync(join(ROOT, 'components/workflow'))
    expect(comps.filter(f => /Timeline/i.test(f))).toEqual(['WorkflowTimeline.tsx'])
  })
})

describe('R4 — Review page performance (no synchronous AI on render)', () => {
  it('R4-001: recommendation fetch is read-only (no generateLeaveRecommendation)', () => {
    const fn = ARIA_Q.slice(ARIA_Q.indexOf('export async function getLeaveRecommendationForInstance'))
    expect(fn).not.toContain('generateLeaveRecommendation')
  })
  it('R4-002: review page does not trigger synchronous AI generation + is instrumented', () => {
    expect(APPROVALS_PAGE).not.toContain('generateLeaveRecommendation')
    expect(APPROVALS_PAGE).toContain('const _t = startTimer()')
  })
})
