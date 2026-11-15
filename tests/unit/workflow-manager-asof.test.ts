import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('Phase 2B-2 workflow manager-as-of routing', () => {
  it('resolves line manager from worker assignment as-of service without persons fallback', () => {
    const src = read('lib/workflow-hierarchy.ts')
    expect(src).toContain("from '@/lib/workflow-routing'")
    expect(src).toContain('resolveWorkerAssignmentForRouting(routingContext, personId, db)')
    expect(src).toContain('lineManagerId:       assignment?.lineManagerId ?? null')
    expect(src).not.toContain('resolvedLineManagerId = r.lineManagerId')
  })

  it('passes asOfDate through approval-chain and step resolution', () => {
    const src = read('lib/workflow-hierarchy.ts')
    expect(src).toContain('routingContext: WorkflowRoutingContext')
    expect(src).toContain('resolveLineManagerApprover(submitterPersonId, level, workflowCode, routingContext)')
    expect(src).toContain('loadPerson(currentId, routingContext)')
    expect(src).toContain('NO_MANAGER_AS_OF_DATE')
  })

  it('derives workflow as-of date before resolving new approval chains', () => {
    const src = read('lib/workflow-engine.ts')
    expect(src).toContain('resolveWorkflowAsOfDate(resourceType, resourceId, ctx, reader)')
    expect(src).toContain('buildWorkflowRoutingContext({')
    expect(src).toContain('workflowHasLineManagerStep(steps as WorkflowStepV2[])')
    expect(src).toContain('NO_MANAGER_AS_OF_DATE: workflow as-of date is required for line-manager routing')
    expect(src).toContain('routingContext,')
  })

  it('uses dated resource fields for leave, transfer, hiring, and probation workflows', () => {
    const src = read('lib/workflow-engine.ts')
    expect(src).toContain('resourceType === "absence_entries"')
    expect(src).toContain('absenceEntries.startDate')
    expect(src).toContain('resourceType === "transfer_requests"')
    expect(src).toContain('transferRequests.effectiveDate')
    expect(src).toContain('resourceType === "hiring_requests"')
    expect(src).toContain('hiringRequests.requiredByDate')
    expect(src).toContain('probationReviews.probationEndDateAtInitiation')
  })

  it('keeps already-created workflow steps assigned from stored step instances', () => {
    const src = read('lib/workflow-engine.ts')
    const actionSection = src.slice(
      src.indexOf('export async function takeWorkflowAction'),
      src.indexOf('export async function previewWorkflow'),
    )
    expect(actionSection).toContain('assignedToPersonId')
    expect(actionSection).not.toContain('resolveApprovalChain(')
    expect(actionSection).not.toContain('resolveLineManagerApprover(')
  })
})
