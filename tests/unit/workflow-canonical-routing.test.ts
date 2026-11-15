import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('ED-UAT-003R canonical effective-dated workflow routing', () => {
  it('defines one routing context model and assignment-as-of manager resolver', () => {
    const src = read('lib/workflow-routing.ts')

    expect(src).toContain('export interface WorkflowRoutingContext')
    expect(src).toContain('subjectAsOfDate: string')
    expect(src).toContain('routingDate: string')
    expect(src).toContain('workflowCode: string')
    expect(src).toContain('resolveManagerForRouting')
    expect(src).toContain('workerAssignmentAsOfAdapter')
    expect(src).toContain('context.subjectAsOfDate')
  })

  it('uses the canonical routing context when resolving workflow chains', () => {
    const engine = read('lib/workflow-engine.ts')
    const hierarchy = read('lib/workflow-hierarchy.ts')

    expect(engine).toContain('buildWorkflowRoutingContext({')
    expect(engine).toContain('routingContext,')
    expect(engine).toContain('fields:       { ...ctx, routingContext }')
    expect(hierarchy).toContain('routingContext: WorkflowRoutingContext')
    expect(hierarchy).toContain('resolveWorkerAssignmentForRouting(routingContext, personId, db)')
  })

  it('resolves position incumbents from worker assignment history instead of live occupant pointers', () => {
    const routing = read('lib/workflow-routing.ts')
    const hierarchy = read('lib/workflow-hierarchy.ts')
    const resolver = hierarchy.slice(
      hierarchy.indexOf('export async function resolvePositionApprover'),
      hierarchy.indexOf('// ─── CUSTOM_GROUP resolver'),
    )

    expect(routing).toContain('export async function resolvePositionIncumbentForRouting')
    expect(routing).toContain('eq(workerAssignments.positionId, positionId)')
    expect(routing).toContain('context.subjectAsOfDate')
    expect(hierarchy).toContain('resolvePositionIncumbentForRouting(routingContext, positionId, db)')
    expect(resolver).not.toContain('occupiedByPersonId')
  })

  it('migrates transfer and promotion wrappers to submit through the canonical workflow path', () => {
    const src = read('modules/workflow/actions.ts')
    const transfer = src.slice(src.indexOf('export async function triggerTransferApproval'), src.indexOf('// ── triggerPromotionApproval'))
    const promotion = src.slice(src.indexOf('export async function triggerPromotionApproval'), src.indexOf('// ── triggerTerminationApproval'))

    for (const section of [transfer, promotion]) {
      expect(section).toContain('submitWorkflow({')
      expect(section).toContain("resourceType:        'transfer_requests'")
      expect(section).toContain("'workflow.as_of_date':")
      expect(section).toContain("'assignment.effective_date':")
      expect(section).not.toContain('lineManagerId) {')
      expect(section).not.toContain('assignedToPersonId: lmPersonId')
    }
  })

  it('does not hand current-state lineManagerId from requestTransfer into routing', () => {
    const src = read('modules/core-hr/employment-actions/transfer-request.ts')
    const selectSection = src.slice(src.indexOf('.select({'), src.indexOf('if (!person)'))
    const workflowSection = src.slice(src.indexOf('Start the 2-step approval workflow'), src.indexOf('return { success: true'))

    expect(selectSection).not.toContain('lineManagerId')
    expect(workflowSection).not.toContain('lineManagerId:')
  })
})
