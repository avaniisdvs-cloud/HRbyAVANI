/**
 * AVANIIS HR — Workflow Hierarchy Resolver
 * Resolves approval chains for LINE_MANAGER, POSITION, and CUSTOM_GROUP hierarchies.
 * Handles vacancies, circular-chain guards, and repeated-approver deduplication.
 */
import { db } from '@/lib/db'
import {
  persons,
  positions,
  grades,
  userAccounts,
} from '@/drizzle/schema'
import {
  approvalGroups,
  approvalGroupMembers,
  workflowDelegationRules,
  type WorkflowStepV2,
  type ResolvedApprover,
} from '@/drizzle/schema/workflow-engine'
import type { WorkflowContext } from './workflow-rules'
import { eq, and, lte, gte, isNull, or, sql } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import {
  resolvePositionIncumbentForRouting,
  resolveWorkerAssignmentForRouting,
  type WorkflowRoutingContext,
} from '@/lib/workflow-routing'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PersonSummary {
  id: string
  fullNameEn: string
  gradeLevel: number | null
  lineManagerId: string | null
  currentPositionId: string | null
  currentDepartmentId: string | null
  isActive: boolean
}

export interface PositionSummary {
  id: string
  positionTitleEn: string
  occupiedByPersonId: string | null
  isOccupied: boolean
  reportsToPositionId: string | null
  gradeId: string | null
}

// Max hierarchy traversal depth — prevents runaway loops on cyclic org data
const MAX_DEPTH = 20

// ─── Person loader ────────────────────────────────────────────────────────────

async function loadPerson(personId: string, routingContext?: WorkflowRoutingContext): Promise<PersonSummary | null> {
  const rows = await db
    .select({
      id:                   persons.id,
      fullNameEn:           persons.fullNameEn,
      gradeLevel:           grades.gradeLevel,
      lineManagerId:        persons.lineManagerId,
      currentPositionId:    persons.currentPositionId,
      currentDepartmentId:  persons.currentDepartmentId,
      isActive:             persons.isActive,
    })
    .from(persons)
    .leftJoin(grades, eq(persons.currentGradeId, grades.id))
    .where(eq(persons.id, personId))
    .limit(1)

  if (!rows.length) return null
  const r = rows[0]

  const assignment = routingContext
    ? await resolveWorkerAssignmentForRouting(routingContext, personId, db)
    : null

  return {
    id:                  r.id,
    fullNameEn:          r.fullNameEn ?? '',
    gradeLevel:          r.gradeLevel ?? null,
    lineManagerId:       assignment?.lineManagerId ?? null,
    currentPositionId:   assignment?.positionId ?? r.currentPositionId,
    currentDepartmentId: assignment?.departmentId ?? r.currentDepartmentId,
    isActive:            r.isActive,
  }
}

async function loadPosition(positionId: string, routingContext?: WorkflowRoutingContext): Promise<PositionSummary | null> {
  const predicates = [eq(positions.id, positionId)]
  if (routingContext) {
    predicates.push(
      or(
        isNull(positions.effectiveStartDate),
        lte(positions.effectiveStartDate, routingContext.subjectAsOfDate),
      )!,
      or(
        isNull(positions.effectiveEndDate),
        gte(positions.effectiveEndDate, routingContext.subjectAsOfDate),
      )!,
    )
  }

  const rows = await db
    .select({
      id:                  positions.id,
      positionTitleEn:     positions.positionTitleEn,
      occupiedByPersonId:  positions.occupiedByPersonId,
      isOccupied:          positions.isOccupied,
      reportsToPositionId: positions.reportsToPositionId,
      gradeId:             positions.gradeId,
    })
    .from(positions)
    .where(and(...predicates))
    .limit(1)

  if (!rows.length) return null
  return rows[0] as PositionSummary
}

async function resolvePositionIncumbentApprover(
  positionId: string,
  workflowCode: string,
  routingContext: WorkflowRoutingContext,
): Promise<{ personId: string; personName: string } | null> {
  const incumbentAssignment = await resolvePositionIncumbentForRouting(routingContext, positionId, db)
  if (!incumbentAssignment?.personId) return null

  const approverPerson = await loadPerson(incumbentAssignment.personId, routingContext)
  if (!approverPerson) return null

  const delegateId = await resolveDelegate(approverPerson.id, workflowCode, routingContext.routingDate)
  const finalId = delegateId ?? approverPerson.id
  if (finalId !== approverPerson.id) {
    const delegate = await loadPerson(finalId, routingContext)
    return delegate ? { personId: delegate.id, personName: delegate.fullNameEn } : null
  }

  return { personId: approverPerson.id, personName: approverPerson.fullNameEn }
}

// ─── Delegation check ─────────────────────────────────────────────────────────

/**
 * Returns the active delegate for a person on a given workflow code (if any).
 */
async function resolveDelegate(
  personId: string,
  workflowCode: string,
  routingDate: string,
): Promise<string | null> {
  const rows = await db
    .select({ delegateId: workflowDelegationRules.delegateId })
    .from(workflowDelegationRules)
    .where(
      and(
        eq(workflowDelegationRules.tenantId, TENANT_ID),
        eq(workflowDelegationRules.delegatorId, personId),
        eq(workflowDelegationRules.status, 'ACTIVE'),
        lte(workflowDelegationRules.delegationFrom, routingDate),
        gte(workflowDelegationRules.delegationTo, routingDate),
        or(
          isNull(workflowDelegationRules.workflowCodes),
          sql`${workflowCode} = ANY(${workflowDelegationRules.workflowCodes})`,
        ),
      ),
    )
    .limit(1)

  return rows[0]?.delegateId ?? null
}

// ─── LINE_MANAGER resolver ────────────────────────────────────────────────────

/**
 * Traverse the line manager chain from the submitter.
 * - level 1  = direct line manager (N+1)
 * - level 2  = N+2
 * - level -1 = HOD (head of department — first person whose department differs)
 * - level -2 = Entity Head (top of the chain)
 */
export async function resolveLineManagerApprover(
  submitterPersonId: string,
  level: number,
  workflowCode: string,
  routingContext: WorkflowRoutingContext,
): Promise<{ personId: string; personName: string } | null> {
  if (level > 0) {
    // Positive levels: traverse up N steps
    let currentId = submitterPersonId
    const visited = new Set<string>()

    for (let i = 0; i < level && i < MAX_DEPTH; i++) {
      if (visited.has(currentId)) return null  // circular chain
      visited.add(currentId)

      const person = await loadPerson(currentId, routingContext)
      if (!person || !person.lineManagerId) {
        throw new Error("NO_MANAGER_AS_OF_DATE: no line manager found for " + currentId + " as of " + routingContext.subjectAsOfDate)
      }

      currentId = person.lineManagerId
    }

    const approverPerson = await loadPerson(currentId, routingContext)
    if (!approverPerson) return null

    // Check delegation
    const delegateId = await resolveDelegate(currentId, workflowCode, routingContext.routingDate)
    const finalId = delegateId ?? currentId

    if (finalId !== currentId) {
      const delegate = await loadPerson(finalId, routingContext)
      return delegate
        ? { personId: delegate.id, personName: delegate.fullNameEn }
        : null
    }

    return { personId: approverPerson.id, personName: approverPerson.fullNameEn }
  }

  if (level === -1) {
    // HOD: traverse up until department changes
    const submitter = await loadPerson(submitterPersonId, routingContext)
    if (!submitter) return null

    const submitterDeptId = submitter.currentDepartmentId
    let currentId = submitter.lineManagerId
    const visited = new Set<string>([submitterPersonId])

    for (let i = 0; i < MAX_DEPTH; i++) {
      if (!currentId || visited.has(currentId)) return null
      visited.add(currentId)

      const person = await loadPerson(currentId, routingContext)
      if (!person) return null

      // HOD = first person who is in a different department, OR has no manager
      if (person.currentDepartmentId !== submitterDeptId || !person.lineManagerId) {
        const delegateId = await resolveDelegate(currentId, workflowCode, routingContext.routingDate)
        const finalId = delegateId ?? currentId
        if (finalId !== currentId) {
          const d = await loadPerson(finalId, routingContext)
          return d ? { personId: d.id, personName: d.fullNameEn } : null
        }
        return { personId: person.id, personName: person.fullNameEn }
      }

      currentId = person.lineManagerId
    }

    return null
  }

  if (level === -2) {
    // Entity head: top of chain (no further line manager)
    let currentId: string | null = submitterPersonId
    const visited = new Set<string>()

    for (let i = 0; i < MAX_DEPTH; i++) {
      if (!currentId || visited.has(currentId)) return null
      visited.add(currentId)

      const person = await loadPerson(currentId, routingContext)
      if (!person) return null

      if (!person.lineManagerId) {
        const delegateId = await resolveDelegate(currentId, workflowCode, routingContext.routingDate)
        const finalId = delegateId ?? currentId
        if (finalId !== currentId) {
          const d = await loadPerson(finalId, routingContext)
          return d ? { personId: d.id, personName: d.fullNameEn } : null
        }
        return { personId: person.id, personName: person.fullNameEn }
      }

      currentId = person.lineManagerId
    }

    return null
  }

  return null
}

// ─── POSITION resolver ────────────────────────────────────────────────────────

/**
 * Traverse the position reporting chain from the submitter's current position.
 * Handles vacancies per the onApproverNotFound policy.
 */
export async function resolvePositionApprover(
  submitterPersonId: string,
  level: number,
  workflowCode: string,
  routingContext: WorkflowRoutingContext,
  onNotFound: 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR' = 'ESCALATE_UP',
  fallbackPersonId?: string | null,
): Promise<{ personId: string; personName: string } | null> {
  const submitter = await loadPerson(submitterPersonId, routingContext)
  if (!submitter?.currentPositionId) return null

  let currentPositionId: string | null = submitter.currentPositionId
  const visited = new Set<string>()

  // Traverse up `level` steps in position chain
  for (let i = 0; i < level && i < MAX_DEPTH; i++) {
    if (!currentPositionId || visited.has(currentPositionId)) return null
    visited.add(currentPositionId)

    const pos = await loadPosition(currentPositionId, routingContext)
    if (!pos) return null

    if (!pos.reportsToPositionId) return null
    currentPositionId = pos.reportsToPositionId
  }

  if (!currentPositionId) return null

  const targetPos = await loadPosition(currentPositionId, routingContext)
  if (!targetPos) return null

  const targetApprover = await resolvePositionIncumbentApprover(currentPositionId, workflowCode, routingContext)
  if (targetApprover) return targetApprover

  // Vacant position — apply policy
  switch (onNotFound) {
    case 'ESCALATE_UP': {
      // Try the next position up
      let parentPositionId = targetPos.reportsToPositionId
      while (parentPositionId && !visited.has(parentPositionId)) {
        visited.add(parentPositionId)
        const parentApprover = await resolvePositionIncumbentApprover(parentPositionId, workflowCode, routingContext)
        if (parentApprover) return parentApprover

        const parentPos = await loadPosition(parentPositionId, routingContext)
        parentPositionId = parentPos?.reportsToPositionId ?? null
      }
      return null
    }

    case 'USE_FALLBACK': {
      if (!fallbackPersonId) return null
      const p = await loadPerson(fallbackPersonId, routingContext)
      return p ? { personId: p.id, personName: p.fullNameEn } : null
    }

    case 'ASSIGN_HR_ADMIN': {
      const hrRows = await resolveRoleMembers('HR_ADMIN')
      const hrAdmin = hrRows[0]
      return hrAdmin ? { personId: hrAdmin.personId, personName: hrAdmin.personName } : null
    }

    case 'BLOCK_WITH_ERROR':
      throw new Error(`POSITION_VACANT: Position ${currentPositionId} is vacant. Cannot route approval.`)
  }
}

// ─── CUSTOM_GROUP resolver ─────────────────────────────────────────────────────

/**
 * Resolve members of a custom approval group.
 * STATIC: returns configured members active today.
 * DYNAMIC/HYBRID: not yet implemented — returns static members as fallback.
 */
export async function resolveGroupMembers(
  groupId: string,
  routingContext: WorkflowRoutingContext,
): Promise<Array<{ personId: string; personName: string; voteWeight: number }>> {
  const rows = await db
    .select({
      personId:    approvalGroupMembers.personId,
      fullNameEn:  persons.fullNameEn,
      voteWeight:  approvalGroupMembers.voteWeight,
    })
    .from(approvalGroupMembers)
    .innerJoin(persons, eq(approvalGroupMembers.personId, persons.id))
    .where(
      and(
        eq(approvalGroupMembers.tenantId, TENANT_ID),
        eq(approvalGroupMembers.groupId, groupId),
        lte(approvalGroupMembers.effectiveFrom, routingContext.routingDate),
        or(
          isNull(approvalGroupMembers.effectiveTo),
          gte(approvalGroupMembers.effectiveTo, routingContext.routingDate),
        ),
        eq(persons.isActive, true),
      ),
    )

  return rows.map(r => ({
    personId:   r.personId,
    personName: r.fullNameEn ?? '',
    voteWeight: r.voteWeight,
  }))
}

async function resolveRoleMembers(
  role: string,
): Promise<Array<{ personId: string; personName: string; voteWeight: number }>> {
  const rows = await db
    .select({
      personId:   userAccounts.personId,
      fullNameEn: persons.fullNameEn,
    })
    .from(userAccounts)
    .innerJoin(persons, eq(userAccounts.personId, persons.id))
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.avaniisRole, role),
      eq(userAccounts.isActive, true),
      eq(persons.isActive, true),
    ))
    .limit(1)

  return rows
    .filter(r => r.personId)
    .map(r => ({
      personId:   r.personId!,
      personName: r.fullNameEn ?? '',
      voteWeight: 1,
    }))
}

// ─── Step resolver (main entry point) ────────────────────────────────────────

/**
 * Resolve the approver(s) for a single workflow step.
 * Returns an array (most steps = 1 person; CUSTOM_GROUP = N members).
 */
export async function resolveStepApprover(
  step: WorkflowStepV2,
  submitterPersonId: string,
  workflowCode: string,
  routingContext: WorkflowRoutingContext,
  onApproverNotFound: 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR',
  fallbackPersonId?: string | null,
): Promise<Array<{ personId: string; personName: string }>> {
  switch (step.hierarchyType) {
    case 'LINE_MANAGER': {
      const level = step.hierarchyLevel ?? 1
      const resolved = await resolveLineManagerApprover(submitterPersonId, level, workflowCode, routingContext)
      return resolved ? [resolved] : []
    }

    case 'POSITION': {
      const level = step.hierarchyLevel ?? 1
      const policy = (step.onApproverNotFound ?? onApproverNotFound) as
        'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR'
      const resolved = await resolvePositionApprover(
        submitterPersonId,
        level,
        workflowCode,
        routingContext,
        policy,
        fallbackPersonId,
      )
      return resolved ? [resolved] : []
    }

    case 'CUSTOM_GROUP': {
      if (step.hierarchyGroupId) {
        const members = await resolveGroupMembers(step.hierarchyGroupId, routingContext)
        return members.map(m => ({ personId: m.personId, personName: m.personName }))
      }
      if (step.hierarchyRole) {
        const members = await resolveRoleMembers(step.hierarchyRole)
        return members.map(m => ({ personId: m.personId, personName: m.personName }))
      }
      if (step.hierarchyPersonId) {
        const p = await loadPerson(step.hierarchyPersonId, routingContext)
        return p ? [{ personId: p.id, personName: p.fullNameEn }] : []
      }
      return []
    }
  }
}

// ─── Full chain resolver ──────────────────────────────────────────────────────

/**
 * Resolve the complete approval chain for a workflow definition.
 * Applies step effects (ADD_IF_MATCHES, SKIP_PREVIOUS, INJECT_BEFORE, etc.)
 * and deduplicates repeated approvers.
 *
 * Returns the ordered ResolvedApprover array to be stored in resolved_steps.
 */
export async function resolveApprovalChain(params: {
  steps: WorkflowStepV2[]
  submitterPersonId: string
  workflowCode: string
  onApproverNotFound: 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR'
  fallbackPersonId?: string | null
  firedRuleIds: Set<string>
  ctx: WorkflowContext
  routingContext: WorkflowRoutingContext
}): Promise<ResolvedApprover[]> {
  const {
    steps,
    submitterPersonId,
    workflowCode,
    onApproverNotFound,
    fallbackPersonId,
    firedRuleIds,
    routingContext,
  } = params

  const activeSteps = steps.filter(s => s.isActive).sort((a, b) => a.stepOrder - b.stepOrder)
  const resolvedAt = new Date().toISOString()

  // Intermediate chain (mutable)
  const chain: ResolvedApprover[] = []

  // Deduplicate: track person IDs already in chain (Oracle AME Repeated Approver Rule)
  const alreadyInChain = new Set<string>()

  for (const step of activeSteps) {
    // Activation check: skip step if activation condition doesn't fire
    if (step.activationConditionId && !firedRuleIds.has(step.activationConditionId)) {
      if (step.stepEffect === 'NORMAL' || step.stepEffect === 'ADD_IF_MATCHES') {
        continue  // Activation condition not met — skip this step
      }
    }

    const approvers = await resolveStepApprover(
      step,
      submitterPersonId,
      workflowCode,
      routingContext,
      onApproverNotFound,
      fallbackPersonId,
    )

    if (!approvers.length) continue

    for (const approver of approvers) {
      // Repeated Approver Rule deduplication
      if (step.skipIfAlreadyApproved && alreadyInChain.has(approver.personId)) continue

      const resolvedStep: ResolvedApprover = {
        personId:       approver.personId,
        personName:     approver.personName,
        stepOrder:      step.stepOrder,
        stepCode:       step.stepCode ?? `step_${step.stepOrder}`,
        hierarchyType:  step.hierarchyType,
        hierarchyLevel: step.hierarchyLevel ?? undefined,
        resolvedAt,
      }

      switch (step.stepEffect) {
        case 'NORMAL':
        case 'ADD_IF_MATCHES':
          chain.push(resolvedStep)
          alreadyInChain.add(approver.personId)
          break

        case 'REPLACE': {
          // Replace the last step at the same stepOrder
          const idx = chain.findLastIndex(s => s.stepOrder === step.stepOrder)
          if (idx >= 0) {
            chain[idx] = resolvedStep
          } else {
            chain.push(resolvedStep)
          }
          alreadyInChain.add(approver.personId)
          break
        }

        case 'SKIP_PREVIOUS': {
          // Remove the immediately preceding step
          if (chain.length > 0) chain.pop()
          chain.push(resolvedStep)
          alreadyInChain.add(approver.personId)
          break
        }

        case 'INJECT_BEFORE': {
          const targetCode = step.effectTargetStepCode
          if (targetCode) {
            const idx = chain.findIndex(s => s.stepCode === targetCode)
            if (idx >= 0) {
              chain.splice(idx, 0, resolvedStep)
            } else {
              chain.push(resolvedStep)
            }
          } else {
            chain.push(resolvedStep)
          }
          alreadyInChain.add(approver.personId)
          break
        }

        case 'INJECT_AFTER': {
          const targetCode = step.effectTargetStepCode
          if (targetCode) {
            const idx = chain.findIndex(s => s.stepCode === targetCode)
            if (idx >= 0) {
              chain.splice(idx + 1, 0, resolvedStep)
            } else {
              chain.push(resolvedStep)
            }
          } else {
            chain.push(resolvedStep)
          }
          alreadyInChain.add(approver.personId)
          break
        }

        case 'PARALLEL_ADD':
          // Parallel steps share stepOrder with their base
          chain.push({ ...resolvedStep, stepCode: resolvedStep.stepCode + '_parallel' })
          alreadyInChain.add(approver.personId)
          break
      }
    }
  }

  // Re-number stepOrder sequentially after all effects applied
  return chain.map((s, i) => ({ ...s, stepOrder: i + 1 }))
}
