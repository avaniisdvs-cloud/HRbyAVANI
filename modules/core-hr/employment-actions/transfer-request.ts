'use server'
/**
 * Transfer / Promotion request orchestrator.
 *
 * Single governed entry point that BOTH (a) creates the transfer_requests row and
 * (b) starts the 2-step approval workflow. Previously createTransferRequest only
 * created the row and never triggered the workflow, so requests sat in
 * PENDING_APPROVAL forever with no approval steps. This pairs them.
 *
 * Governance: RBAC-gated (MANAGER → direct reports only; HR_ADMIN+ entity-wide).
 * Creates a REQUEST and starts a workflow; the actual assignment change happens
 * only on final human approval, in lib/workflow-engine → applyTransferOutcome.
 * The workflow engine remains the system of record.
 *
 * Hard Rule 8: returns { error } rather than translateError (which would re-throw
 * and crash a Server Component render).
 */
import { and, eq, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { persons, transferRequests, grades } from '@/drizzle/schema'
import { isManagerDirectReport } from '../manager-scope'
import { triggerTransferApproval, triggerPromotionApproval } from '@/modules/workflow'

export interface RequestTransferInput {
  personId:           string
  requestType:        'TRANSFER' | 'PROMOTION'
  targetDepartmentId?: string  // required for TRANSFER
  targetPositionId?:  string
  targetGradeId?:     string   // required for PROMOTION
  effectiveDate:      string   // YYYY-MM-DD
  reason:             string   // CAREER_GROWTH | ORG_NEED | PERFORMANCE | PERSONAL | OTHER
  notes?:             string
}

export interface RequestTransferResult {
  success:    boolean
  requestId?: string
  instanceId?: string
  error?:     string
}

export async function requestTransfer(input: RequestTransferInput): Promise<RequestTransferResult> {
  try {
    const user = await getCurrentUser()
    const allowed = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
    if (!allowed.includes(user.role)) return { success: false, error: 'Insufficient permissions to request a transfer.' }

    const [person] = await db
      .select({
        id:                persons.id,
        personNumber:      persons.personNumber,
        fullNameEn:        persons.fullNameEn,
        legalEntityId:     persons.legalEntityId,
        currentPositionId: persons.currentPositionId,
        currentGradeId:    persons.currentGradeId,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, input.personId)))
      .limit(1)
    if (!person) return { success: false, error: 'Employee not found.' }
    if (!person.currentPositionId) return { success: false, error: 'Employee has no current position.' }
    if (input.requestType === 'PROMOTION' && !input.targetGradeId) return { success: false, error: 'A target grade is required for a promotion.' }
    if (input.requestType === 'TRANSFER'  && !input.targetDepartmentId) return { success: false, error: 'A target department is required for a transfer.' }

    // MANAGER scope — only direct reports (backend-enforced).
    if (user.role === 'MANAGER') {
      if (!user.personId || !(await isManagerDirectReport(person.id, user.personId))) {
        return { success: false, error: 'You can only request transfers or promotions for your direct reports.' }
      }
    }

    // 1) Create the request row (+ audit) atomically.
    let requestId = ''
    await db.transaction(async tx => {
      const [req] = await tx
        .insert(transferRequests)
        .values({
          tenantId:           TENANT_ID,
          personId:           person.id,
          currentPositionId:  person.currentPositionId!,
          targetPositionId:   input.targetPositionId,
          targetDepartmentId: input.targetDepartmentId,
          targetGradeId:      input.targetGradeId,
          requestType:        input.requestType,
          effectiveDate:      input.effectiveDate,
          reason:             input.reason,
          notes:              input.notes,
          status:             'PENDING_APPROVAL',
          requestedById:      user.id,
          requestedByName:    user.name,
          createdBy:          user.id,
          createdByName:      user.name,
        })
        .returning({ id: transferRequests.id })
      requestId = req.id

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'TRANSFER_REQUEST_CREATED',
        resourceType: 'transfer_requests',
        resourceId:   req.id,
        newValues:    {
          personId:           person.id,
          requestType:        input.requestType,
          targetDepartmentId: input.targetDepartmentId,
          effectiveDate:      input.effectiveDate,
        },
      }, tx)
    })

    // 2) Start the 2-step approval workflow (builds its own def; no seeded
    //    template needed). On approval the engine applies the change.
    let instanceId: string | undefined
    if (input.requestType === 'PROMOTION') {
      // Resolve current + target grade names for the approval notification.
      const gradeIds = [person.currentGradeId, input.targetGradeId].filter(Boolean) as string[]
      const gRows = gradeIds.length
        ? await db.select({ id: grades.id, name: grades.gradeNameEn }).from(grades)
            .where(and(eq(grades.tenantId, TENANT_ID), inArray(grades.id, gradeIds)))
        : []
      const nameOf = (id: string | null | undefined) => gRows.find(g => g.id === id)?.name ?? '—'
      const wf = await triggerPromotionApproval({
        personId:          person.id,
        personNumber:      person.personNumber,
        personFullName:    person.fullNameEn ?? person.personNumber,
        legalEntityId:     person.legalEntityId,
        fromGradeName:     nameOf(person.currentGradeId),
        toGradeName:       nameOf(input.targetGradeId),
        effectiveDate:     input.effectiveDate,
        reason:            input.reason,
        transferRequestId: requestId,
      })
      instanceId = wf?.instanceId
    } else {
      const wf = await triggerTransferApproval({
        personId:          person.id,
        personNumber:      person.personNumber,
        personFullName:    person.fullNameEn ?? person.personNumber,
        legalEntityId:     person.legalEntityId,
        toDepartmentId:    input.targetDepartmentId!,
        effectiveDate:     input.effectiveDate,
        reason:            input.reason,
        transferRequestId: requestId,
      })
      instanceId = wf?.instanceId
    }

    return { success: true, requestId, instanceId }
  } catch (e) {
    console.error('[core-hr] requestTransfer failed:', e instanceof Error ? e.message : e)
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit transfer request.' }
  }
}
