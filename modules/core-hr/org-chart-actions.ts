'use server'

/**
 * Org Chart Server Actions — Task A.3 / Task E / Task F
 *
 * Exported actions:
 *   fetchOrgTree                — full or scoped recursive tree
 *   fetchPersonAncestors        — upward chain to root (breadcrumb / navigate to CEO)
 *   getDirectReports            — one level down from a given manager
 *   createHiringRequest         — E.4
 *   createTransferRequest       — E.5
 *   assignActingManager         — E.6
 *   searchPersons               — E.6 (autocomplete)
 *   getVacantPositionsByDept    — E.5 (transfer target positions)
 *   togglePositionConfidential  — F.1
 *   togglePositionFrozen        — F.1
 *   getOrgChartPendingCounts    — F.6
 */
import { getCurrentUser }  from '@/lib/auth'
import { TENANT_ID }       from '@/lib/constants'
import { db }              from '@/lib/db'
import { writeAuditLog }   from '@/lib/audit'
import { translateError }  from '@/lib/app-error'
import { isManagerDirectReport } from './manager-scope'
import { eq, and, ilike, count } from 'drizzle-orm'
import {
  hiringRequests,
  transferRequests,
  workerAssignments,
  persons,
  positions,
  jobs,
} from '@/drizzle/schema'
import {
  getOrgTree,
  getPersonAncestorChain,
  getDirectReportNodes,
  getSystemUsers,
  type OrgTreeParams,
  type OrgTreeData,
  type OrgNode,
  type OrgViewerRole,
} from '@/lib/org-chart/build-tree'
import type { SystemUserRow } from '@/lib/org-chart/types'
import {
  resolveEngine,
  type HierarchyEngine,
  type HierarchyResult,
} from '@/lib/org-chart/engines/engine-registry'

// Maps JWT role strings to the OrgViewerRole union used by the data layer
function toViewerRole(role: string): OrgViewerRole {
  if (role === 'HR_ADMIN' || role === 'HR_DIRECTOR' || role === 'SUPER_ADMIN') return 'HR_ADMIN'
  if (role === 'MANAGER')                                                        return 'MANAGER'
  if (role === 'FINANCE' || role === 'PAYROLL_ADMIN')                           return 'HR_ADMIN'
  return 'EMPLOYEE'
}

// ─────────────────────────────────────────────────────────────────────────────
// Session 3 — Unified hierarchy engine entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchHierarchyParams {
  engine:          HierarchyEngine
  legalEntityId?:  string
  rootPersonId?:   string
  rootDeptId?:     string
  includeVacant?:  boolean
  maxDepth?:       number
  showPeers?:      boolean
}

export async function fetchHierarchy(
  params: FetchHierarchyParams,
): Promise<{ success: boolean; data?: HierarchyResult; error?: string }> {
  try {
    const user       = await getCurrentUser()
    const viewerRole = toViewerRole(user.role)

    // EMPLOYEE role is always locked to the my-team engine (server-enforced)
    const effectiveEngine: HierarchyEngine =
      viewerRole === 'EMPLOYEE' ? 'my-team' : params.engine

    const result = await resolveEngine(effectiveEngine, {
      tenantId:        TENANT_ID,
      viewerRole,
      legalEntityId:   params.legalEntityId,
      rootPersonId:    params.rootPersonId,
      rootDeptId:      params.rootDeptId,
      includeVacant:   params.includeVacant ?? true,
      maxDepth:        Math.min(params.maxDepth ?? 8, 10),
      currentPersonId: user.personId ?? undefined,
      showPeers:       params.showPeers ?? false,
    })

    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load hierarchy',
    }
  }
}

export async function fetchOrgTree(
  params: Omit<OrgTreeParams, 'tenantId' | 'viewerRole'> & { legalEntityId?: string },
): Promise<{ success: boolean; data?: OrgTreeData; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()
      const viewerRole = toViewerRole(user.role)

      // Global roles (HR Admin and above) see all entities; scoped roles see their entity only
      const isGlobalRole = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'FINANCE', 'PAYROLL_ADMIN'].includes(user.role)
      const legalEntityId = params.legalEntityId ?? (isGlobalRole ? undefined : user.legalEntityId)

      const result = await getOrgTree({
        ...params,
        tenantId: TENANT_ID,
        viewerRole,
        legalEntityId,
      })

      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load org tree' }
    }
  } catch (e) { translateError(e, 'fetchOrgTree') }
}

export async function fetchPersonAncestors(
  personId: string,
): Promise<{ success: boolean; data?: Array<{ positionId: string; personId: string; fullNameEn: string; positionTitleEn: string }>; error?: string }> {
  try {
    try {
      await getCurrentUser()
      const chain = await getPersonAncestorChain(personId, TENANT_ID)
      return { success: true, data: chain }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load ancestors' }
    }
  } catch (e) { translateError(e, 'fetchPersonAncestors') }
}

export async function getDirectReports(
  managerId: string,
): Promise<{ success: boolean; data?: OrgNode[]; error?: string }> {
  try {
    try {
      await getCurrentUser()
      const nodes = await getDirectReportNodes(managerId, TENANT_ID)
      return { success: true, data: nodes }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load direct reports' }
    }
  } catch (e) { translateError(e, 'getDirectReports') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.4 — Create Hiring Request
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateHiringRequestInput {
  positionId:     string
  departmentId:   string
  requestType:    string
  replacementFor?: string
  requiredByDate?: string
  budgetApproved?: boolean
  budgetAmount?:  string
  justification:  string
  urgency?:       string
}

export async function createHiringRequest(
  input: CreateHiringRequestInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      // Basic role gate — MANAGER or HR_ADMIN only
      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']
      if (!allowedRoles.includes(user.role)) {
        return { success: false, error: 'Insufficient permissions' }
      }

      // Validate required fields
      if (!input.positionId)              return { success: false, error: 'positionId required' }
      if (!input.requestType)             return { success: false, error: 'requestType required' }
      if ((input.justification ?? '').trim().length < 30)
        return { success: false, error: 'Justification must be at least 30 characters' }

      let createdId = ''
      await db.transaction(async tx => {
        const [req] = await tx.insert(hiringRequests).values({
          tenantId:        TENANT_ID,
          positionId:      input.positionId,
          departmentId:    input.departmentId,
          requestType:     input.requestType,
          replacementFor:  input.replacementFor,
          requiredByDate:  input.requiredByDate,
          budgetApproved:  input.budgetApproved ?? false,
          budgetAmount:    input.budgetAmount,
          justification:   input.justification,
          urgency:         input.urgency ?? 'STANDARD',
          status:          'PENDING_APPROVAL',
          requestedById:   user.id,
          requestedByName: user.name,
          createdBy:       user.id,
          createdByName:   user.name,
        }).returning({ id: hiringRequests.id })

        createdId = req.id

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'HIRING_REQUEST_CREATED',
          resourceType: 'hiring_requests',
          resourceId:   req.id,
          newValues:    input as unknown as Record<string, unknown>,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      // COLLISION-004 (migration 0041): partial unique index on (tenant_id, position_id)
      // WHERE status = 'PENDING_APPROVAL' raises error code 23505 on duplicate attempt.
      // Surface a business-friendly message instead of a raw Postgres error string.
      const pgCode = (err as Record<string, unknown>)?.code
      if (pgCode === '23505') {
        return {
          success: false,
          error:   'A hiring request for this position is already pending approval. ' +
                   'Please wait for the existing request to be resolved before raising another.',
        }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Failed to create hiring request' }
    }
  } catch (e) { translateError(e, 'createHiringRequest') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.5 — Create Transfer Request
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTransferRequestInput {
  nodeId:               string   // position id (used to look up personId)
  requestType:          string   // TRANSFER | PROMOTION
  targetDepartmentId:   string
  targetPositionId?:    string
  effectiveDate:        string
  reason:               string
  notes?:               string
}

export async function createTransferRequest(
  input: CreateTransferRequestInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']
      if (!allowedRoles.includes(user.role)) {
        return { success: false, error: 'Insufficient permissions' }
      }

      // Find personId from position
      const [pos] = await db
        .select({ personId: positions.occupiedByPersonId })
        .from(positions)
        .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, input.nodeId)))
        .limit(1)

      const personId = pos?.personId ?? null

      // MANAGER scope: may only raise transfer/promotion for a DIRECT REPORT.
      // Backend-enforced — blocks URL/query manipulation of the target position.
      // HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN bypass this (entity-wide authority).
      if (user.role === 'MANAGER') {
        if (!user.personId || !personId || !(await isManagerDirectReport(personId, user.personId))) {
          return { success: false, error: 'You can only request transfers or promotions for your direct reports.' }
        }
      }

      let createdId = ''
      await db.transaction(async tx => {
        const [req] = await tx.insert(transferRequests).values({
          tenantId:           TENANT_ID,
          personId:           personId ?? user.id, // fallback to actor
          currentPositionId:  input.nodeId,
          targetPositionId:   input.targetPositionId,
          targetDepartmentId: input.targetDepartmentId,
          requestType:        input.requestType,
          effectiveDate:      input.effectiveDate,
          reason:             input.reason,
          notes:              input.notes,
          status:             'PENDING_APPROVAL',
          requestedById:      user.id,
          requestedByName:    user.name,
          createdBy:          user.id,
          createdByName:      user.name,
        }).returning({ id: transferRequests.id })

        createdId = req.id

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'TRANSFER_REQUEST_CREATED',
          resourceType: 'transfer_requests',
          resourceId:   req.id,
          newValues:    input as unknown as Record<string, unknown>,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      // COLLISION-004B (migration 0042): partial unique index on (tenant_id, person_id)
      // WHERE status = 'PENDING_APPROVAL' raises error code 23505 on duplicate attempt.
      const pgCode = (err as unknown as Record<string, unknown>)?.code
      if (pgCode === '23505') {
        return {
          success: false,
          error:   'A transfer or promotion request for this person is already pending approval. ' +
                   'Please wait for the existing request to be resolved before raising another.',
        }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Failed to create transfer request' }
    }
  } catch (e) { translateError(e, 'createTransferRequest') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.6 — Assign Acting Manager
// ─────────────────────────────────────────────────────────────────────────────

export interface AssignActingManagerInput {
  positionId:     string
  actingPersonId: string
  startDate:      string
  endDate:        string
  reason:         string
}

export async function assignActingManager(
  input: AssignActingManagerInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']
      if (!allowedRoles.includes(user.role)) {
        return { success: false, error: 'Insufficient permissions' }
      }

      // MANAGER scope: may only assign acting status for a DIRECT REPORT.
      // Backend-enforced — blocks URL/query manipulation of actingPersonId.
      // HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN bypass this (entity-wide authority).
      if (user.role === 'MANAGER') {
        if (!user.personId || !(await isManagerDirectReport(input.actingPersonId, user.personId))) {
          return { success: false, error: 'You can only assign acting status for your direct reports.' }
        }
      }

      // Find the worker_assignment row for the acting person that is current
      const [asgn] = await db
        .select({ id: workerAssignments.id })
        .from(workerAssignments)
        .where(and(
          eq(workerAssignments.tenantId,  TENANT_ID),
          eq(workerAssignments.personId,  input.actingPersonId),
          eq(workerAssignments.isCurrent, true),
        ))
        .limit(1)

      if (!asgn) {
        return { success: false, error: 'Active worker assignment not found for selected person' }
      }

      await db.transaction(async tx => {
        await tx
          .update(workerAssignments)
          .set({
            isActing:        true,
            actingEndDate:   input.endDate,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: new Date(),
          })
          .where(eq(workerAssignments.id, asgn.id))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'ACTING_ASSIGNMENT_CREATED',
          resourceType: 'worker_assignments',
          resourceId:   asgn.id,
          newValues:    input as unknown as Record<string, unknown>,
          description:  input.reason,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to assign acting manager' }
    }
  } catch (e) { translateError(e, 'assignActingManager') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.6 — Search Persons (autocomplete)
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonSearchResult {
  id:         string
  nameEn:     string
  jobTitleEn?: string
}

export async function searchPersons(
  query: string,
): Promise<{ success: boolean; data?: PersonSearchResult[]; error?: string }> {
  try {
    try {
      await getCurrentUser()

      if (!query?.trim()) return { success: true, data: [] }

      const rows = await db
        .select({
          id:         persons.id,
          nameEn:     persons.fullNameEn,
          jobTitleEn: jobs.jobTitleEn,
        })
        .from(persons)
        .innerJoin(workerAssignments, and(
          eq(workerAssignments.personId,  persons.id),
          eq(workerAssignments.tenantId,  TENANT_ID),
          eq(workerAssignments.isCurrent, true),
        ))
        .leftJoin(jobs, eq(jobs.id, workerAssignments.jobId))
        .where(and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.isActive, true),
          ilike(persons.fullNameEn, `%${query}%`),
        ))
        .limit(8)

      return {
        success: true,
        data:    rows.map(r => ({ id: r.id, nameEn: r.nameEn ?? '', jobTitleEn: r.jobTitleEn ?? undefined })),
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Search failed' }
    }
  } catch (e) { translateError(e, 'searchPersons') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.5 — Get Vacant Positions by Department
// ─────────────────────────────────────────────────────────────────────────────

export async function getVacantPositionsByDept(
  deptId: string,
): Promise<{ success: boolean; data?: Array<{ id: string; titleEn: string }>; error?: string }> {
  try {
    try {
      await getCurrentUser()

      const rows = await db
        .select({
          id:         positions.id,
          titleEn:    positions.positionTitleEn,
          isOccupied: positions.isOccupied,
        })
        .from(positions)
        .where(and(
          eq(positions.tenantId,     TENANT_ID),
          eq(positions.departmentId, deptId),
          eq(positions.isActive,     true),
          eq(positions.isFrozen,     false),
        ))
        .limit(50)

      // Return only unoccupied positions
      const vacant = rows.filter(r => !r.isOccupied)

      return { success: true, data: vacant.map(r => ({ id: r.id, titleEn: r.titleEn ?? '' })) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load positions' }
    }
  } catch (e) { translateError(e, 'getVacantPositionsByDept') }
}

// ─────────────────────────────────────────────────────────────────────────────
// F.1 — Toggle Position Confidential
// ─────────────────────────────────────────────────────────────────────────────

export async function togglePositionConfidential(
  positionId: string,
  reason:     string,
): Promise<{ success: boolean; newValue: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)) {
        return { success: false, newValue: false, error: 'HR Admin access required' }
      }
      if (!reason || reason.trim().length < 10) {
        return { success: false, newValue: false, error: 'Reason must be at least 10 characters' }
      }

      let newValue = false
      await db.transaction(async tx => {
        const [pos] = await tx
          .select({ isConfidential: positions.isConfidential })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, positionId)))
          .limit(1)

        if (!pos) throw new Error('Position not found')
        newValue = !pos.isConfidential

        await tx
          .update(positions)
          .set({
            isConfidential:  newValue,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: new Date(),
          })
          .where(eq(positions.id, positionId))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'POSITION_CONFIDENTIAL_TOGGLED',
          resourceType: 'positions',
          resourceId:   positionId,
          oldValues:    { isConfidential: pos.isConfidential },
          newValues:    { isConfidential: newValue },
          metadata:     { changeReason: reason },
        }, tx)
      })

      return { success: true, newValue }
    } catch (err) {
      return { success: false, newValue: false, error: err instanceof Error ? err.message : 'Failed to toggle' }
    }
  } catch (e) { translateError(e, 'togglePositionConfidential') }
}

// ─────────────────────────────────────────────────────────────────────────────
// F.1 — Toggle Position Frozen
// ─────────────────────────────────────────────────────────────────────────────

export async function togglePositionFrozen(
  positionId: string,
  reason:     string,
): Promise<{ success: boolean; newValue: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)) {
        return { success: false, newValue: false, error: 'HR Admin access required' }
      }
      if (!reason || reason.trim().length < 1) {
        return { success: false, newValue: false, error: 'Reason is required' }
      }

      let newValue = false
      await db.transaction(async tx => {
        const [pos] = await tx
          .select({ isFrozen: positions.isFrozen })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, positionId)))
          .limit(1)

        if (!pos) throw new Error('Position not found')
        newValue = !pos.isFrozen

        await tx
          .update(positions)
          .set({
            isFrozen:        newValue,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: new Date(),
          })
          .where(eq(positions.id, positionId))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'POSITION_FROZEN_TOGGLED',
          resourceType: 'positions',
          resourceId:   positionId,
          oldValues:    { isFrozen: pos.isFrozen },
          newValues:    { isFrozen: newValue },
          metadata:     { changeReason: reason },
        }, tx)
      })

      return { success: true, newValue }
    } catch (err) {
      return { success: false, newValue: false, error: err instanceof Error ? err.message : 'Failed to toggle' }
    }
  } catch (e) { translateError(e, 'togglePositionFrozen') }
}

// ─────────────────────────────────────────────────────────────────────────────
// F.6 — Pending Counts for Analytics
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrgChartPendingCounts(): Promise<{
  hiringRequests:   number
  transferRequests: number
  error?: string
}> {
  try {
    try {
      const user = await getCurrentUser()

      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN','EXECUTIVE']
      if (!allowedRoles.includes(user.role)) {
        return { hiringRequests: 0, transferRequests: 0 }
      }

      const [hr] = await db
        .select({ count: count() })
        .from(hiringRequests)
        .where(and(
          eq(hiringRequests.tenantId, TENANT_ID),
          eq(hiringRequests.status,   'PENDING_APPROVAL'),
        ))

      const [tr] = await db
        .select({ count: count() })
        .from(transferRequests)
        .where(and(
          eq(transferRequests.tenantId, TENANT_ID),
          eq(transferRequests.status,   'PENDING_APPROVAL'),
        ))

      return {
        hiringRequests:   Number(hr?.count ?? 0),
        transferRequests: Number(tr?.count ?? 0),
      }
    } catch (err) {
      return { hiringRequests: 0, transferRequests: 0, error: err instanceof Error ? err.message : 'Failed' }
    }
  } catch (e) { translateError(e, 'getOrgChartPendingCounts') }
}

// ── System users ──────────────────────────────────────────────────────────────

export async function fetchSystemUsers(): Promise<{ success: true; data: SystemUserRow[] } | { success: false; error: string }> {
  try {
    const user = await getCurrentUser()
    const adminRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'MANAGER']
    if (!user || !adminRoles.includes(user.role)) {
      return { success: false, error: 'Insufficient permissions' }
    }
    const data = await getSystemUsers(TENANT_ID)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load system users' }
  }
}
