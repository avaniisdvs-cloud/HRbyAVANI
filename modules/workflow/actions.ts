'use server'

/**
 * Workflow Server Actions — Sprint 9 / BR-WF-010.
 *
 * triggerBackdatedHireApproval:
 *   Called immediately after createPerson() when hire_date > 30 days in the past.
 *   Upserts the BACKDATED_HIRE_APPROVAL workflow definition on first use,
 *   creates the workflow instance (LINE_MANAGER → HR_HOD sequential),
 *   and inserts notification_log rows for both approvers.
 *
 *   Hard Rule 1 — every DB write is inside a Drizzle tx with writeAuditLog.
 *   BR-WF-001 — approver roles from VALID_APPROVER_ROLES (guards.ts).
 *   BR-WF-010 — backdated hire > 30 days requires LINE_MANAGER + HR_HOD approval.
 */

import { randomUUID } from 'crypto'
import { translateError } from '@/lib/app-error'
import { eq, and, count, desc, asc, max, sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  notificationLog,
  userAccounts,
  persons,
} from '@/drizzle/schema'
import {
  workflowDefinitionsV2,
  workflowStepsV2,
  workflowInstancesV2,
  workflowStepInstances,
  approvalGroups,
  approvalGroupMembers,
  workflowDelegationRules,
  type WorkflowStepV2,
  type NewWorkflowStepV2,
  type ResolvedApprover,
  type HierarchySnapshot,
  type ContextSnapshot,
} from '@/drizzle/schema/workflow-engine'
import { previewWorkflow, submitWorkflow, type PreviewWorkflowResult } from '@/lib/workflow-engine'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

const BACKDATED_WF_CODE = 'BACKDATED_HIRE_APPROVAL'

export interface BackdatedHireWorkflowResult {
  instanceId:      string
  lineManagerName: string | null
  hrHodFound:      boolean
}

/**
 * Ensures the BACKDATED_HIRE_APPROVAL workflow definition + stages exist,
 * creates a workflow instance for the given person, and notifies approvers.
 */
export async function triggerBackdatedHireApproval(input: {
  personId:       string
  personNumber:   string
  personFullName: string
  hireDate:       string
  legalEntityId:  string
  lineManagerId:  string | null
  backdatingDays: number
  reason?:        string
}): Promise<BackdatedHireWorkflowResult> {
  try {
    const actor = await getCurrentUser()

  const {
    personId, personNumber, personFullName,
    hireDate, legalEntityId, lineManagerId,
    backdatingDays, reason,
  } = input

  let instanceId      = ''
  let lineManagerName: string | null = null
  let hrHodFound      = false

  await db.transaction(async tx => {
    // 1. Upsert v2 workflow definition (self-seeding on first use)
    let defId = ''
    let step1Id = ''
    let step2Id = ''

    const [existingDef] = await tx
      .select({ id: workflowDefinitionsV2.id })
      .from(workflowDefinitionsV2)
      .where(and(
        eq(workflowDefinitionsV2.tenantId, TENANT_ID),
        eq(workflowDefinitionsV2.workflowCode, BACKDATED_WF_CODE),
      ))
      .limit(1)

    if (existingDef) {
      defId = existingDef.id
      // Load step ids
      const steps = await tx
        .select({ id: workflowStepsV2.id, stepOrder: workflowStepsV2.stepOrder })
        .from(workflowStepsV2)
        .where(and(
          eq(workflowStepsV2.tenantId, TENANT_ID),
          eq(workflowStepsV2.workflowDefinitionId, defId),
        ))
        .orderBy(asc(workflowStepsV2.stepOrder))
      step1Id = steps.find(s => s.stepOrder === 1)?.id ?? ''
      step2Id = steps.find(s => s.stepOrder === 2)?.id ?? ''
    } else {
      const [created] = await tx
        .insert(workflowDefinitionsV2)
        .values({
          tenantId:               TENANT_ID,
          workflowCode:           BACKDATED_WF_CODE,
          workflowNameEn:         'Backdated Hire Approval',
          workflowNameAr:         'موافقة على التوظيف بأثر رجعي',
          triggerEvent:           'BACKDATED_HIRE',
          defaultHierarchyType:   'LINE_MANAGER',
          defaultSlaHours:        48,
          defaultEscalationHours: 72,
          isActive:               true,
          version:                1,
          createdBy:              actor.id,
          createdByName:          actor.name,
        })
        .returning({ id: workflowDefinitionsV2.id })
      defId = created.id

      const [s1] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId:            TENANT_ID,
          workflowDefinitionId: defId,
          stepOrder:           1,
          stepCode:            'LINE_MANAGER_APPROVAL',
          stepNameEn:          'Line Manager Approval',
          stepNameAr:          'موافقة المدير المباشر',
          hierarchyType:       'LINE_MANAGER',
          hierarchyLevel:      1,
          slaHours:            48,
          onSlaBreach:         'ESCALATE',
          canDelegate:         true,
          isOptional:          false,
          createdBy:           actor.id,
          createdByName:       actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      step1Id = s1.id

      const [s2] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId:            TENANT_ID,
          workflowDefinitionId: defId,
          stepOrder:           2,
          stepCode:            'HR_HOD_APPROVAL',
          stepNameEn:          'HR Head of Department Approval',
          stepNameAr:          'موافقة رئيس قسم الموارد البشرية',
          hierarchyType:       'CUSTOM_GROUP',
          hierarchyRole:       'HR_HOD',
          slaHours:            48,
          onSlaBreach:         'ESCALATE',
          canDelegate:         false,
          isOptional:          false,
          createdBy:           actor.id,
          createdByName:       actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      step2Id = s2.id
    }

    // 2. Resolve approvers
    // (person records resolved below — referenced in step instances)

    // 4. Resolve line manager person record
    let lineManagerPersonId: string | null = null
    if (lineManagerId) {
      const [mgr] = await tx
        .select({ id: persons.id, fullNameEn: persons.fullNameEn })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId)))
        .limit(1)
      if (mgr) {
        lineManagerPersonId = mgr.id
        lineManagerName     = mgr.fullNameEn ?? null
      }
    }

    // 5. Resolve HR_HOD person (fall back to HR_ADMIN)
    let hodPersonId: string | null = null

    const [hodAccount] = await tx
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(and(
        eq(userAccounts.tenantId, TENANT_ID),
        eq(userAccounts.avaniisRole, 'HR_HOD'),
        eq(userAccounts.isActive, true),
      ))
      .limit(1)

    if (hodAccount) {
      hodPersonId = hodAccount.personId
      hrHodFound  = true
    } else {
      const [adminAccount] = await tx
        .select({ personId: userAccounts.personId })
        .from(userAccounts)
        .where(and(
          eq(userAccounts.tenantId, TENANT_ID),
          eq(userAccounts.avaniisRole, 'HR_ADMIN'),
          eq(userAccounts.isActive, true),
        ))
        .limit(1)
      if (adminAccount) hodPersonId = adminAccount.personId
    }

    // 5b. Build v2 snapshots and create instance + step instances
    const slaDeadline = new Date()
    slaDeadline.setHours(slaDeadline.getHours() + 48)
    const now = new Date()

    const resolvedApprovers: ResolvedApprover[] = []
    if (lineManagerPersonId) {
      resolvedApprovers.push({
        personId:      lineManagerPersonId,
        personName:    lineManagerName ?? '',
        stepOrder:     1,
        stepCode:      'LINE_MANAGER_APPROVAL',
        hierarchyType: 'LINE_MANAGER',
        resolvedAt:    now.toISOString(),
      })
    }
    if (hodPersonId) {
      resolvedApprovers.push({
        personId:      hodPersonId,
        personName:    '',
        stepOrder:     2,
        stepCode:      'HR_HOD_APPROVAL',
        hierarchyType: 'CUSTOM_GROUP',
        resolvedAt:    now.toISOString(),
      })
    }

    const hierarchySnapshot: HierarchySnapshot = {
      encryptedAt:   now.toISOString(),
      resolvedSteps: resolvedApprovers,
      resolvedBy:    'avaniis-workflow-engine-v2',
    }
    const contextSnapshot: ContextSnapshot = {
      encryptedAt:  now.toISOString(),
      resourceType: 'persons',
      resourceId:   personId,
      fields:       { personId, personNumber, hireDate, backdatingDays, reason: reason ?? null },
    }

    instanceId = randomUUID()
    await tx.insert(workflowInstancesV2).values({
      id:                    instanceId,
      tenantId:              TENANT_ID,
      workflowDefinitionId:  defId,
      legalEntityId,
      resourceType:          'persons',
      resourceId:            personId,
      initiatedByPersonId:   actor.personId ?? personId,
      status:                'IN_PROGRESS',
      currentStepOrder:      1,
      hierarchySnapshot:     hierarchySnapshot as never,
      contextSnapshot:       contextSnapshot as never,
      resolvedSteps:         resolvedApprovers as never,
      slaDeadline,
      startedAt:             now,
      createdBy:             actor.id,
      createdByName:         actor.name,
      createdDate:           now,
    })

    // Create step instances
    if (step1Id && lineManagerPersonId) {
      await tx.insert(workflowStepInstances).values({
        id:                  randomUUID(),
        tenantId:            TENANT_ID,
        instanceId,
        stepId:              step1Id,
        stepOrder:           1,
        status:              'PENDING',
        assignedToPersonId:  lineManagerPersonId,
        slaDeadline,
        createdBy:           actor.id,
        createdByName:       actor.name,
        createdDate:         now,
      })
    }
    if (step2Id && hodPersonId) {
      await tx.insert(workflowStepInstances).values({
        id:                  randomUUID(),
        tenantId:            TENANT_ID,
        instanceId,
        stepId:              step2Id,
        stepOrder:           2,
        status:              'WAITING',
        assignedToPersonId:  hodPersonId,
        createdBy:           actor.id,
        createdByName:       actor.name,
        createdDate:         now,
      })
    }

    // 6. Notification log entries
    type NotifRow = typeof notificationLog.$inferInsert
    const notifs: NotifRow[] = []

    if (lineManagerPersonId) {
      notifs.push({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: lineManagerPersonId,
        notificationType:  'APPROVAL_REQUIRED',
        channel:           'IN_APP',
        subjectEn:         `Backdated hire approval required — ${personFullName}`,
        bodyEn:            `${actor.name} has requested approval to add ${personFullName} (${personNumber}) ` +
                           `with a hire date of ${hireDate} (${backdatingDays} days ago).` +
                           (reason ? ` Reason: ${reason}` : ''),
        referenceType:     'WORKFLOW_INSTANCE',
        referenceId:       instanceId,
        status:            'PENDING',
        createdBy:         actor.id,
        createdByName:     actor.name,
      })
    }

    if (hodPersonId) {
      notifs.push({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: hodPersonId,
        notificationType:  'APPROVAL_REQUIRED',
        channel:           'IN_APP',
        subjectEn:         `Backdated hire pending your review — ${personFullName}`,
        bodyEn:            `A backdated hire for ${personFullName} (${personNumber}, hire date ${hireDate}) ` +
                           `is pending Line Manager approval. You will be notified when your review is required.`,
        referenceType:     'WORKFLOW_INSTANCE',
        referenceId:       instanceId,
        status:            'PENDING',
        createdBy:         actor.id,
        createdByName:     actor.name,
      })
    }

    if (notifs.length > 0) {
      await tx.insert(notificationLog).values(notifs)
    }

    // 7. Audit row
    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: legalEntityId,
      channel:       'WEB',
      eventType:     'WORKFLOW.BACKDATED_HIRE_INITIATED',
      resourceType:  'workflow_instances_v2',
      resourceId:    instanceId,
      entityId:      legalEntityId,
      newValues: { personId, personNumber, hireDate, backdatingDays },
    }, tx)
  })

    return { instanceId, lineManagerName, hrHodFound }
  } catch (e) { translateError(e, 'triggerBackdatedHireApproval') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Workflow Definitions CRUD — Unit 4 (Admin Builder)
// ══════════════════════════════════════════════════════════════════════════════

export type TriggerEvent =
  | 'LEAVE_REQUEST'
  | 'HIRE'
  | 'TRANSFER'
  | 'SALARY_REVISION'
  | 'TERMINATION'
  | 'OVERTIME_REQUEST'
  | 'EXIT_CLEARANCE'
  | 'PROBATION_CONFIRM'
  | 'VISA_RENEWAL'

export type HierarchyType = 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'

export type OnApproverNotFound =
  | 'ESCALATE_UP'
  | 'USE_FALLBACK'
  | 'ASSIGN_HR_ADMIN'
  | 'BLOCK_WITH_ERROR'

export interface WorkflowDefinitionRow {
  id:                   string
  workflowCode:         string
  workflowNameEn:       string
  workflowNameAr:       string | null
  triggerEvent:         string
  defaultHierarchyType: string | null
  defaultSlaHours:      number
  isActive:             boolean
  version:              number
  stepCount:            number
  createdDate:          Date | null
}

export interface WorkflowDefinitionInput {
  workflowCode:          string
  workflowNameEn:        string
  workflowNameAr?:       string
  description?:          string
  triggerEvent:          TriggerEvent
  defaultHierarchyType?: HierarchyType
  onApproverNotFound?:   OnApproverNotFound
  defaultSlaHours?:      number
  defaultEscalationHours?: number
  requiresMedicalCert?:  boolean
  requiresManagerComment?: boolean
}

// ── listWorkflowDefinitions ─────────────────────────────────────────────────

export async function listWorkflowDefinitions(): Promise<WorkflowDefinitionRow[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const defs = await db
    .select({
      id:                   workflowDefinitionsV2.id,
      workflowCode:         workflowDefinitionsV2.workflowCode,
      workflowNameEn:       workflowDefinitionsV2.workflowNameEn,
      workflowNameAr:       workflowDefinitionsV2.workflowNameAr,
      triggerEvent:         workflowDefinitionsV2.triggerEvent,
      defaultHierarchyType: workflowDefinitionsV2.defaultHierarchyType,
      defaultSlaHours:      workflowDefinitionsV2.defaultSlaHours,
      isActive:             workflowDefinitionsV2.isActive,
      version:              workflowDefinitionsV2.version,
      createdDate:          workflowDefinitionsV2.createdDate,
    })
    .from(workflowDefinitionsV2)
    .where(eq(workflowDefinitionsV2.tenantId, TENANT_ID))
    .orderBy(desc(workflowDefinitionsV2.createdDate))

  // Fetch step counts for each v2 definition
  const stepCounts = await db
    .select({
      workflowDefinitionId: workflowStepsV2.workflowDefinitionId,
      cnt:                  count(workflowStepsV2.id),
    })
    .from(workflowStepsV2)
    .where(eq(workflowStepsV2.tenantId, TENANT_ID))
    .groupBy(workflowStepsV2.workflowDefinitionId)

  const countMap = new Map<string, number>()
  for (const row of stepCounts) {
    countMap.set(row.workflowDefinitionId, Number(row.cnt))
  }

    return defs.map(d => ({
      id:                   d.id,
      workflowCode:         d.workflowCode,
      workflowNameEn:       d.workflowNameEn,
      workflowNameAr:       d.workflowNameAr ?? null,
      triggerEvent:         d.triggerEvent,
      defaultHierarchyType: d.defaultHierarchyType ?? null,
      defaultSlaHours:      d.defaultSlaHours,
      isActive:             d.isActive,
      version:              d.version,
      stepCount:            countMap.get(d.id) ?? 0,
      createdDate:          d.createdDate ?? null,
    }))
  } catch (e) { translateError(e, 'listWorkflowDefinitions') }
}

// ── createWorkflowDefinition ────────────────────────────────────────────────

export async function createWorkflowDefinition(
  input: WorkflowDefinitionInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // Validation
    if (!input.workflowCode)    return { success: false, error: 'Workflow code is required.' }
    if (!/^[A-Z0-9_]+$/.test(input.workflowCode)) {
      return { success: false, error: 'Workflow code must be uppercase letters, digits, and underscores only.' }
    }
    if (!input.workflowNameEn) return { success: false, error: 'Workflow name (EN) is required.' }
    if (!input.triggerEvent)   return { success: false, error: 'Trigger event is required.' }
    const slaHours = input.defaultSlaHours ?? 48
    if (slaHours < 1 || slaHours > 720) {
      return { success: false, error: 'SLA hours must be between 1 and 720.' }
    }

    let newId = ''

    await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(workflowDefinitionsV2)
        .values({
          tenantId:               TENANT_ID,
          workflowCode:           input.workflowCode,
          workflowNameEn:         input.workflowNameEn,
          workflowNameAr:         input.workflowNameAr ?? null,
          description:            input.description ?? null,
          triggerEvent:           input.triggerEvent,
          defaultHierarchyType:   (input.defaultHierarchyType as 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP') ?? 'LINE_MANAGER',
          onApproverNotFound:     (input.onApproverNotFound as 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR') ?? 'ESCALATE_UP',
          defaultSlaHours:        slaHours,
          defaultEscalationHours: input.defaultEscalationHours ?? 72,
          requiresMedicalCert:    input.requiresMedicalCert ?? false,
          requiresManagerComment: input.requiresManagerComment ?? false,
          isActive:               true,
          version:                1,
          createdBy:              actor.id,
          createdByName:          actor.name ?? actor.email,
        })
        .returning({ id: workflowDefinitionsV2.id })

      newId = inserted.id

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name ?? actor.email,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'WORKFLOW_DEFINITION.CREATED',
        resourceType: 'workflow_definitions_v2',
        resourceId:   newId,
        newValues:    input as unknown as Record<string, unknown>,
        description:  `Created workflow definition ${input.workflowCode} — ${input.workflowNameEn}`,
      }, tx)
    })

      revalidatePath('/configuration/workflows')
      return { success: true, id: newId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return { success: false, error: 'A workflow with this code already exists for this tenant.' }
      }
      return { success: false, error: `Failed to create workflow: ${msg}` }
    }
  } catch (e) { translateError(e, 'createWorkflowDefinition') }
}

// ── updateWorkflowDefinition ────────────────────────────────────────────────

export async function updateWorkflowDefinition(
  id: string,
  patch: Partial<WorkflowDefinitionInput>,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      const [existing] = await db
        .select()
        .from(workflowDefinitionsV2)
        .where(and(eq(workflowDefinitionsV2.id, id), eq(workflowDefinitionsV2.tenantId, TENANT_ID)))
        .limit(1)

    if (!existing) return { success: false, error: 'Workflow definition not found.' }

    if (patch.workflowCode && !/^[A-Z0-9_]+$/.test(patch.workflowCode)) {
      return { success: false, error: 'Workflow code must be uppercase letters, digits, and underscores only.' }
    }
    if (patch.defaultSlaHours !== undefined) {
      if (patch.defaultSlaHours < 1 || patch.defaultSlaHours > 720) {
        return { success: false, error: 'SLA hours must be between 1 and 720.' }
      }
    }

    const now = new Date()

    await db.transaction(async tx => {
      await tx
        .update(workflowDefinitionsV2)
        .set({
          ...(patch.workflowNameEn         !== undefined && { workflowNameEn:         patch.workflowNameEn }),
          ...(patch.workflowNameAr         !== undefined && { workflowNameAr:         patch.workflowNameAr }),
          ...(patch.triggerEvent           !== undefined && { triggerEvent:           patch.triggerEvent }),
          ...(patch.defaultSlaHours        !== undefined && { defaultSlaHours:        patch.defaultSlaHours }),
          ...(patch.defaultEscalationHours !== undefined && { defaultEscalationHours: patch.defaultEscalationHours }),
          ...(patch.defaultHierarchyType   !== undefined && { defaultHierarchyType:   patch.defaultHierarchyType as 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP' }),
          ...(patch.onApproverNotFound     !== undefined && { onApproverNotFound:     patch.onApproverNotFound as 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR' }),
          ...(patch.requiresMedicalCert    !== undefined && { requiresMedicalCert:    patch.requiresMedicalCert }),
          ...(patch.requiresManagerComment !== undefined && { requiresManagerComment: patch.requiresManagerComment }),
          ...(patch.description            !== undefined && { description:            patch.description }),
          version:         existing.version + 1,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(workflowDefinitionsV2.id, id))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name ?? actor.email,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'WORKFLOW_DEFINITION.UPDATED',
        resourceType: 'workflow_definitions_v2',
        resourceId:   id,
        oldValues:    { workflowCode: existing.workflowCode, workflowNameEn: existing.workflowNameEn },
        newValues:    patch as unknown as Record<string, unknown>,
        description:  `Updated workflow definition ${existing.workflowCode}`,
      }, tx)
    })

      revalidatePath('/configuration/workflows')
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `Failed to update workflow: ${msg}` }
    }
  } catch (e) { translateError(e, 'updateWorkflowDefinition') }
}

// ── toggleWorkflowActive ───────────────────────────────────────────────────

export async function toggleWorkflowActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      const [existing] = await db
        .select({ id: workflowDefinitionsV2.id, workflowCode: workflowDefinitionsV2.workflowCode, workflowNameEn: workflowDefinitionsV2.workflowNameEn })
        .from(workflowDefinitionsV2)
        .where(and(eq(workflowDefinitionsV2.id, id), eq(workflowDefinitionsV2.tenantId, TENANT_ID)))
        .limit(1)

      if (!existing) return { success: false, error: 'Workflow definition not found.' }

      const now = new Date()

      await db.transaction(async tx => {
        await tx
          .update(workflowDefinitionsV2)
          .set({
            isActive,
            updatedBy:       actor.id,
            updatedByName:   actor.name ?? actor.email,
            lastUpdatedDate: now,
            updatedDate:     now,
          })
          .where(eq(workflowDefinitionsV2.id, id))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    isActive ? 'WORKFLOW_DEFINITION.ENABLED' : 'WORKFLOW_DEFINITION.DISABLED',
          resourceType: 'workflow_definitions_v2',
          resourceId:   id,
          description:  `${isActive ? 'Enabled' : 'Disabled'} workflow definition ${existing.workflowCode}`,
        }, tx)
      })

      revalidatePath('/configuration/workflows')
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `Failed to toggle workflow: ${msg}` }
    }
  } catch (e) { translateError(e, 'toggleWorkflowActive') }
}


// ══════════════════════════════════════════════════════════════════════════════
// Workflow Steps v2 CRUD Actions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * List all steps for a workflow definition, ordered by stepOrder.
 */
export async function listWorkflowSteps(workflowId: string): Promise<WorkflowStepV2[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    return db
      .select()
      .from(workflowStepsV2)
      .where(and(
        eq(workflowStepsV2.tenantId, TENANT_ID),
        eq(workflowStepsV2.workflowDefinitionId, workflowId),
      ))
      .orderBy(asc(workflowStepsV2.stepOrder))
  } catch (e) { translateError(e, 'listWorkflowSteps') }
}

/**
 * Create a new workflow step.
 */
export async function createWorkflowStep(
  workflowId: string,
  input: NewWorkflowStepV2,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    let newId = ''

    await db.transaction(async tx => {
      // Always compute stepOrder server-side as MAX + 1 to avoid TOCTOU races.
      // The UI sends stepOrder=0 as a sentinel meaning "append at end"; we
      // never trust the client value because ?? does not fall back on 0.
      const resolvedOrder: number = await tx
        .select({ m: max(workflowStepsV2.stepOrder) })
        .from(workflowStepsV2)
        .where(and(
          eq(workflowStepsV2.tenantId, TENANT_ID),
          eq(workflowStepsV2.workflowDefinitionId, workflowId),
        ))
        .then(([row]) => (Number(row?.m ?? 0)) + 1)

      const [created] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId:              TENANT_ID,
          workflowDefinitionId:  workflowId,
          stepOrder:             resolvedOrder,
          stepCode:              input.stepCode ?? null,
          stepNameEn:            input.stepNameEn,
          stepNameAr:            input.stepNameAr ?? null,
          hierarchyType:         input.hierarchyType,
          hierarchyLevel:        input.hierarchyLevel ?? null,
          hierarchyGroupId:      input.hierarchyGroupId ?? null,
          slaHours:              input.slaHours,
          onSlaBreach:           input.onSlaBreach ?? 'ESCALATE',
          stepEffect:            input.stepEffect ?? 'NORMAL',
          activationConditionId: input.activationConditionId ?? null,
          isFyiOnly:             input.isFyiOnly ?? false,
          canDelegate:           input.canDelegate ?? true,
          isOptional:            input.isOptional ?? false,
          skipIfAlreadyApproved: input.skipIfAlreadyApproved ?? false,
          createdBy:             actor.id as unknown as string,
          createdByName:         actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      newId = created.id

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'WORKFLOW.STEP.CREATED',
        resourceType: 'workflow_steps_v2',
        resourceId:   newId,
        newValues:    { workflowId, stepOrder: resolvedOrder, stepNameEn: input.stepNameEn },
      }, tx)
    })

      return { success: true, id: newId }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'createWorkflowStep') }
}

/**
 * Update an existing workflow step.
 */
export async function updateWorkflowStep(
  stepId: string,
  patch: Partial<NewWorkflowStepV2>,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      await db.transaction(async tx => {
        await tx
          .update(workflowStepsV2)
          .set({
            ...(patch.stepCode        !== undefined && { stepCode:        patch.stepCode }),
            ...(patch.stepNameEn      !== undefined && { stepNameEn:      patch.stepNameEn }),
            ...(patch.stepNameAr      !== undefined && { stepNameAr:      patch.stepNameAr }),
            ...(patch.hierarchyType   !== undefined && { hierarchyType:   patch.hierarchyType }),
            ...(patch.hierarchyLevel       !== undefined && { hierarchyLevel:        patch.hierarchyLevel }),
            ...(patch.hierarchyGroupId     !== undefined && { hierarchyGroupId:      patch.hierarchyGroupId }),
            ...(patch.slaHours             !== undefined && { slaHours:              patch.slaHours }),
            ...(patch.onSlaBreach          !== undefined && { onSlaBreach:           patch.onSlaBreach }),
            ...(patch.stepEffect           !== undefined && { stepEffect:            patch.stepEffect }),
            ...(patch.activationConditionId !== undefined && { activationConditionId: patch.activationConditionId }),
            ...(patch.isFyiOnly             !== undefined && { isFyiOnly:             patch.isFyiOnly }),
            ...(patch.canDelegate           !== undefined && { canDelegate:           patch.canDelegate }),
            ...(patch.isOptional            !== undefined && { isOptional:            patch.isOptional }),
            ...(patch.skipIfAlreadyApproved !== undefined && { skipIfAlreadyApproved: patch.skipIfAlreadyApproved }),
            updatedBy:       actor.id as unknown as string,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(
            eq(workflowStepsV2.id, stepId),
            eq(workflowStepsV2.tenantId, TENANT_ID),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'WORKFLOW.STEP.UPDATED',
          resourceType: 'workflow_steps_v2',
          resourceId:   stepId,
          newValues:    patch as Record<string, unknown>,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'updateWorkflowStep') }
}

/**
 * Delete a workflow step by id.
 */
export async function deleteWorkflowStep(
  stepId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      await db.transaction(async tx => {
        await tx
          .delete(workflowStepsV2)
          .where(and(
            eq(workflowStepsV2.id, stepId),
            eq(workflowStepsV2.tenantId, TENANT_ID),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'WORKFLOW.STEP.DELETED',
          resourceType: 'workflow_steps_v2',
          resourceId:   stepId,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'deleteWorkflowStep') }
}

/**
 * Reorder steps: accepts the full ordered list of step ids and updates
 * each row's stepOrder accordingly.
 */
export async function reorderWorkflowSteps(
  workflowId: string,
  orderedIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      await db.transaction(async tx => {
        // Single UPDATE with CASE to avoid N+1 round trips
        const orderCase = sql`CASE ${sql.join(
          orderedIds.map((id, i) => sql`WHEN ${workflowStepsV2.id} = ${id} THEN ${i + 1}`),
          sql` `,
        )} END`
        await tx
          .update(workflowStepsV2)
          .set({
            stepOrder:       sql`(${orderCase})`,
            updatedBy:       actor.id as unknown as string,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(
            eq(workflowStepsV2.tenantId, TENANT_ID),
            eq(workflowStepsV2.workflowDefinitionId, workflowId),
            inArray(workflowStepsV2.id, orderedIds),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'WORKFLOW.STEP.REORDERED',
          resourceType: 'workflow_steps_v2',
          newValues:    { workflowId, orderedIds },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'reorderWorkflowSteps') }
}


// ══════════════════════════════════════════════════════════════════════════════
// APPROVAL GROUPS CRUD — Unit 6
// ══════════════════════════════════════════════════════════════════════════════

const GROUP_ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

export interface ApprovalGroupRow {
  id:           string
  groupCode:    string
  groupNameEn:  string
  groupNameAr:  string | null
  memberType:   string
  votingMethod: string
  minApprovals: number
  isActive:     boolean
  memberCount:  number
}

export interface GroupMemberRow {
  id:            string
  groupId:       string
  personId:      string
  personName:    string
  effectiveFrom: string
  effectiveTo:   string | null
  isPrimary:     boolean
  voteWeight:    number
}

// ── List all approval groups with member count ─────────────────────────────

export async function listApprovalGroups(): Promise<ApprovalGroupRow[]> {
  try {
    await requireRole([...GROUP_ADMIN_ROLES])

    const rows = await db
      .select({
        id:           approvalGroups.id,
        groupCode:    approvalGroups.groupCode,
        groupNameEn:  approvalGroups.groupNameEn,
        groupNameAr:  approvalGroups.groupNameAr,
        memberType:   approvalGroups.memberType,
        votingMethod: approvalGroups.votingMethod,
        minApprovals: approvalGroups.minApprovals,
        isActive:     approvalGroups.isActive,
        memberCount:  sql<number>`cast(count(${approvalGroupMembers.id}) as int)`,
      })
      .from(approvalGroups)
      .leftJoin(
        approvalGroupMembers,
        and(
          eq(approvalGroupMembers.groupId, approvalGroups.id),
          eq(approvalGroupMembers.tenantId, TENANT_ID),
        ),
      )
      .where(eq(approvalGroups.tenantId, TENANT_ID))
      .groupBy(approvalGroups.id)

    return rows.map(r => ({
      ...r,
      memberCount: r.memberCount ?? 0,
    }))
  } catch (e) { translateError(e, 'listApprovalGroups') }
}

// ── Create approval group ──────────────────────────────────────────────────

export async function createApprovalGroup(input: {
  groupCode:    string
  groupNameEn:  string
  groupNameAr?: string
  memberType:   string
  votingMethod: string
  minApprovals: number
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      let newId = ''
      await db.transaction(async tx => {
        const [created] = await tx
          .insert(approvalGroups)
          .values({
            tenantId:     TENANT_ID,
            groupCode:    input.groupCode.toUpperCase(),
            groupNameEn:  input.groupNameEn,
            groupNameAr:  input.groupNameAr ?? null,
            memberType:   input.memberType as 'STATIC' | 'DYNAMIC' | 'HYBRID',
            votingMethod: input.votingMethod as 'ANY_ONE' | 'MAJORITY' | 'ALL' | 'WEIGHTED',
            minApprovals: input.minApprovals,
            isActive:     true,
            createdBy:    actor.id,
            createdByName: actor.name,
          })
          .returning({ id: approvalGroups.id })
        newId = created.id

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.CREATED',
          resourceType: 'approval_groups',
          resourceId:   newId,
          newValues:    { ...input },
        }, tx)
      })

      return { success: true, id: newId }
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === '23505') {
        return { success: false, error: `A group with code "${input.groupCode.toUpperCase()}" already exists. Choose a different code, or edit the existing group to add members.` }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'createApprovalGroup') }
}

// ── Update approval group ──────────────────────────────────────────────────

export async function updateApprovalGroup(
  id: string,
  patch: {
    groupNameEn?:  string
    groupNameAr?:  string
    memberType?:   string
    votingMethod?: string
    minApprovals?: number
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .update(approvalGroups)
          .set({
            ...(patch.groupNameEn  !== undefined && { groupNameEn:  patch.groupNameEn }),
            ...(patch.groupNameAr  !== undefined && { groupNameAr:  patch.groupNameAr }),
            ...(patch.memberType   !== undefined && { memberType:   patch.memberType as 'STATIC' | 'DYNAMIC' | 'HYBRID' }),
            ...(patch.votingMethod !== undefined && { votingMethod: patch.votingMethod as 'ANY_ONE' | 'MAJORITY' | 'ALL' | 'WEIGHTED' }),
            ...(patch.minApprovals !== undefined && { minApprovals: patch.minApprovals }),
            updatedBy:       actor.id,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(eq(approvalGroups.id, id), eq(approvalGroups.tenantId, TENANT_ID)))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.UPDATED',
          resourceType: 'approval_groups',
          resourceId:   id,
          newValues:    patch,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'updateApprovalGroup') }
}

// ── Toggle group active state ──────────────────────────────────────────────

export async function toggleGroupActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .update(approvalGroups)
          .set({
            isActive,
            updatedBy:       actor.id,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(eq(approvalGroups.id, id), eq(approvalGroups.tenantId, TENANT_ID)))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    isActive ? 'APPROVAL_GROUP.ENABLED' : 'APPROVAL_GROUP.DISABLED',
          resourceType: 'approval_groups',
          resourceId:   id,
          newValues:    { isActive },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'toggleGroupActive') }
}

// ── Add group member ───────────────────────────────────────────────────────

export async function addGroupMember(
  groupId: string,
  input: {
    personId:      string
    effectiveFrom: string
    effectiveTo?:  string
    isPrimary?:    boolean
    voteWeight?:   number
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .insert(approvalGroupMembers)
          .values({
            tenantId:      TENANT_ID,
            groupId,
            personId:      input.personId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo:   input.effectiveTo ?? null,
            isPrimary:     input.isPrimary ?? false,
            voteWeight:    input.voteWeight ?? 1,
            createdBy:     actor.id,
            createdByName: actor.name,
          })

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.MEMBER_ADDED',
          resourceType: 'approval_group_members',
          resourceId:   groupId,
          newValues:    { groupId, ...input },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'addGroupMember') }
}

// ── Remove group member ────────────────────────────────────────────────────

export async function removeGroupMember(
  memberId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .delete(approvalGroupMembers)
          .where(and(
            eq(approvalGroupMembers.id, memberId),
            eq(approvalGroupMembers.tenantId, TENANT_ID),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.MEMBER_REMOVED',
          resourceType: 'approval_group_members',
          resourceId:   memberId,
          newValues:    { memberId },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'removeGroupMember') }
}

// ── List group members (with person full name) ─────────────────────────────

export async function listGroupMembers(
  groupId: string,
): Promise<GroupMemberRow[]> {
  try {
    await requireRole([...GROUP_ADMIN_ROLES])

    const rows = await db
      .select({
        id:            approvalGroupMembers.id,
        groupId:       approvalGroupMembers.groupId,
        personId:      approvalGroupMembers.personId,
        personName:    persons.fullNameEn,
        effectiveFrom: approvalGroupMembers.effectiveFrom,
        effectiveTo:   approvalGroupMembers.effectiveTo,
        isPrimary:     approvalGroupMembers.isPrimary,
        voteWeight:    approvalGroupMembers.voteWeight,
      })
      .from(approvalGroupMembers)
      .innerJoin(persons, eq(persons.id, approvalGroupMembers.personId))
      .where(and(
        eq(approvalGroupMembers.groupId, groupId),
        eq(approvalGroupMembers.tenantId, TENANT_ID),
      ))

    return rows.map(r => ({
      id:            r.id,
      groupId:       r.groupId,
      personId:      r.personId,
      personName:    r.personName ?? 'Unknown',
      effectiveFrom: r.effectiveFrom,
      effectiveTo:   r.effectiveTo ?? null,
      isPrimary:     r.isPrimary,
      voteWeight:    r.voteWeight ?? 1,
    }))
  } catch (e) { translateError(e, 'listGroupMembers') }
}


// ══════════════════════════════════════════════════════════════════════════════
// DELEGATION MANAGER — Unit 7 (Workflow Engine v2)
// ══════════════════════════════════════════════════════════════════════════════

export interface DelegationRuleRow {
  id:               string
  delegatorId:      string
  delegatorName:    string | null
  delegateId:       string
  delegateName:     string | null
  delegationFrom:   string
  delegationTo:     string
  workflowCodes:    string[] | null
  status:           string
  delegationReason: string | null
}

/**
 * List all delegation rules (admin view) with delegator + delegate names.
 */
export async function listDelegationRules(): Promise<DelegationRuleRow[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const rows = await db
      .select({
        id:               workflowDelegationRules.id,
        delegatorId:      workflowDelegationRules.delegatorId,
        delegateId:       workflowDelegationRules.delegateId,
        delegationFrom:   workflowDelegationRules.delegationFrom,
        delegationTo:     workflowDelegationRules.delegationTo,
        workflowCodes:    workflowDelegationRules.workflowCodes,
        status:           workflowDelegationRules.status,
        delegationReason: workflowDelegationRules.delegationReason,
      })
      .from(workflowDelegationRules)
      .where(eq(workflowDelegationRules.tenantId, TENANT_ID))
      .orderBy(workflowDelegationRules.createdDate)

    if (rows.length === 0) return []

    // Collect unique person IDs to batch-fetch names
    const personIds = [...new Set([
      ...rows.map(r => r.delegatorId),
      ...rows.map(r => r.delegateId),
    ])]

    const personRows = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(inArray(persons.id, personIds))

    const nameMap = new Map(personRows.map(p => [p.id, p.fullNameEn ?? null]))

    return rows.map(r => ({
      id:               r.id,
      delegatorId:      r.delegatorId,
      delegatorName:    nameMap.get(r.delegatorId) ?? null,
      delegateId:       r.delegateId,
      delegateName:     nameMap.get(r.delegateId) ?? null,
      delegationFrom:   r.delegationFrom,
      delegationTo:     r.delegationTo,
      workflowCodes:    r.workflowCodes ?? null,
      status:           r.status,
      delegationReason: r.delegationReason ?? null,
    }))
  } catch (e) { translateError(e, 'listDelegationRules') }
}

/**
 * Create a new delegation rule.
 * Validates against circular chains: if A→B is requested but B already delegates to A, reject.
 */
export async function createDelegationRule(input: {
  delegatorId:       string
  delegateId:        string
  legalEntityId?:    string
  delegationFrom:    string
  delegationTo:      string
  workflowCodes?:    string[]
  delegationReason?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const { delegatorId, delegateId, delegationFrom, delegationTo, workflowCodes, delegationReason } = input
  const legalEntityId = input.legalEntityId ?? actor.legalEntityId

  // PPCDA-01 H5: self-delegation guard — a person cannot delegate their approval
  // authority to themselves (no-op rule + indicates form tampering).
  if (delegatorId === delegateId) {
    return { success: false, error: 'SELF_DELEGATION: a person cannot delegate workflow authority to themselves.' }
  }

  // PPCDA-01 H7: date-order validation — an inverted window can never match at
  // routing time (resolveDelegate requires from <= asOf <= to) so it is silently
  // dead. Reject it up-front rather than storing a useless rule.
  if (delegationFrom > delegationTo) {
    return { success: false, error: 'INVALID_DATE_RANGE: delegation start date must be on or before the end date.' }
  }

  // PPCDA-01 H8: cross-entity guard — standing delegation must not route a
  // delegator's approvals (incl. PAYROLL_RUN_APPROVAL) to a person outside their
  // legal entity. Mirrors the V1 per-instance guard in modules/config/actions.ts.
  // The Server Action is an open API, so we re-check rather than trust the form.
  const partyRows = await db
    .select({ id: persons.id, legalEntityId: persons.legalEntityId, isActive: persons.isActive })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, [delegatorId, delegateId])))
  const delegatorRow = partyRows.find(p => p.id === delegatorId)
  const delegateRow  = partyRows.find(p => p.id === delegateId)
  if (!delegateRow || !delegateRow.isActive) {
    return { success: false, error: 'NOT_FOUND: delegate target is not an active person.' }
  }
  if (
    actor.role !== 'SUPER_ADMIN' &&
    delegatorRow &&
    delegateRow.legalEntityId !== delegatorRow.legalEntityId
  ) {
    return { success: false, error: 'FORBIDDEN: cannot delegate workflow authority across legal entities.' }
  }

  // Circular chain check (B2 — transitive). The previous guard caught only the
  // depth-1 cycle (B already delegates to A). A multi-hop chain A→B→C→A slipped
  // through. We now load the ACTIVE delegation graph and reject if `delegateId`
  // can already reach `delegatorId` through it — adding delegator→delegate would
  // close a cycle (direct or transitive). The traversal is cycle-safe via a
  // visited set, so a pre-existing loop cannot hang it.
  const activeRules = await db
    .select({
      delegatorId: workflowDelegationRules.delegatorId,
      delegateId:  workflowDelegationRules.delegateId,
    })
    .from(workflowDelegationRules)
    .where(and(
      eq(workflowDelegationRules.tenantId, TENANT_ID),
      eq(workflowDelegationRules.status, 'ACTIVE'),
    ))

  const adjacency = new Map<string, string[]>()
  for (const r of activeRules) {
    const list = adjacency.get(r.delegatorId)
    if (list) list.push(r.delegateId)
    else adjacency.set(r.delegatorId, [r.delegateId])
  }

  // BFS from the proposed delegate; reaching the proposed delegator = a cycle.
  const visited = new Set<string>()
  const queue: string[] = [delegateId]
  let closesCycle = false
  while (queue.length > 0) {
    const node = queue.shift()!
    if (node === delegatorId) { closesCycle = true; break }
    if (visited.has(node)) continue
    visited.add(node)
    for (const next of adjacency.get(node) ?? []) queue.push(next)
  }

  if (closesCycle) {
    return {
      success: false,
      error: 'CIRCULAR_CHAIN: delegating to this person would form a circular delegation chain (direct or multi-hop) — not allowed.',
    }
  }

  let newId = ''

  try {
    await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(workflowDelegationRules)
        .values({
          tenantId:         TENANT_ID,
          legalEntityId,
          delegatorId,
          delegateId,
          delegationFrom,
          delegationTo,
          workflowCodes:    workflowCodes && workflowCodes.length > 0 ? workflowCodes : null,
          status:           'ACTIVE',
          delegationReason: delegationReason ?? null,
          createdBy:        actor.id,
          createdByName:    actor.name,
        })
        .returning({ id: workflowDelegationRules.id })

      newId = inserted.id

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        channel:       'WEB',
        eventType:     'WORKFLOW.DELEGATION.CREATED',
        resourceType:  'workflow_delegation_rules',
        resourceId:    newId,
        newValues: { delegatorId, delegateId, delegationFrom, delegationTo, workflowCodes },
      }, tx)
    })

      return { success: true, id: newId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'createDelegationRule') }
}

/**
 * Revoke an ACTIVE delegation rule.
 */
export async function revokeDelegationRule(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    try {
      await db.transaction(async tx => {
        await tx
          .update(workflowDelegationRules)
          .set({
            status:           'REVOKED',
            delegationReason: reason ?? null,
            updatedBy:        actor.id,
            updatedByName:    actor.name,
            lastUpdatedDate:  new Date(),
          })
          .where(
            and(
              eq(workflowDelegationRules.id, id),
              eq(workflowDelegationRules.tenantId, TENANT_ID),
              eq(workflowDelegationRules.status, 'ACTIVE'),
            ),
          )

        await writeAuditLog({
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          channel:       'WEB',
          eventType:     'WORKFLOW.DELEGATION.REVOKED',
          resourceType:  'workflow_delegation_rules',
          resourceId:    id,
          newValues: { status: 'REVOKED', reason },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'revokeDelegationRule') }
}


// ─── Unit 8 — Preview Chain (read-only, no DB writes) ─────────────────────

export type { PreviewWorkflowResult }

/**
 * Thin server-action wrapper around previewWorkflow() so client components
 * can call it via useTransition without importing server-only DB code.
 */
export async function previewWorkflowChain(params: {
  workflowCode: string
  submitterPersonId: string
  legalEntityId: string
  contextOverrides?: Record<string, unknown>
}): Promise<PreviewWorkflowResult | null> {
  try {
    return previewWorkflow(params)
  } catch (e) { translateError(e, 'previewWorkflowChain') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Unit 9 — Employment-action workflow triggers (ME-1)
//
// triggerTransferApproval   — BR-WF-020: LINE_MANAGER → HR_ADMIN  2-step
// triggerPromotionApproval  — BR-WF-021: LINE_MANAGER → HR_DIRECTOR 2-step
// triggerTerminationApproval— BR-WF-022: LINE_MANAGER → HR_DIRECTOR 2-step (BQ-2)
//
// Each function self-seeds its workflow definition on first use and queues
// IN_APP notifications for every resolved approver.
// ══════════════════════════════════════════════════════════════════════════════

const TRANSFER_WF_CODE    = 'TRANSFER_APPROVAL'
const PROMOTION_WF_CODE   = 'PROMOTION_APPROVAL'
const TERMINATION_WF_CODE = 'TERMINATION_APPROVAL'

// ── Shared internal helper — upsert a 1-or-2-step workflow definition ────────

async function upsertTwoStepDef(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: { id: string; name: string },
  params: {
    code:       string
    nameEn:     string
    nameAr:     string
    trigger:    string
    step1Code:  string; step1NameEn: string; step1NameAr: string; step1HType: 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'
    step2Code?: string; step2NameEn?: string; step2NameAr?: string; step2HType?: 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'; step2HRole?: string
  },
): Promise<{ defId: string; step1Id: string; step2Id: string }> {
  const [existingDef] = await tx
    .select({ id: workflowDefinitionsV2.id })
    .from(workflowDefinitionsV2)
    .where(and(
      eq(workflowDefinitionsV2.tenantId, TENANT_ID),
      eq(workflowDefinitionsV2.workflowCode, params.code),
    ))
    .limit(1)

  let defId   = ''
  let step1Id = ''
  let step2Id = ''

  if (existingDef) {
    defId = existingDef.id
    const steps = await tx
      .select({ id: workflowStepsV2.id, stepOrder: workflowStepsV2.stepOrder })
      .from(workflowStepsV2)
      .where(and(
        eq(workflowStepsV2.tenantId, TENANT_ID),
        eq(workflowStepsV2.workflowDefinitionId, defId),
      ))
      .orderBy(asc(workflowStepsV2.stepOrder))
    step1Id = steps.find(s => s.stepOrder === 1)?.id ?? ''
    step2Id = steps.find(s => s.stepOrder === 2)?.id ?? ''
  } else {
    const [created] = await tx
      .insert(workflowDefinitionsV2)
      .values({
        tenantId: TENANT_ID, workflowCode: params.code,
        workflowNameEn: params.nameEn, workflowNameAr: params.nameAr,
        triggerEvent: params.trigger, defaultHierarchyType: params.step1HType,
        defaultSlaHours: 48, defaultEscalationHours: 72,
        isActive: true, version: 1,
        createdBy: actor.id, createdByName: actor.name,
      })
      .returning({ id: workflowDefinitionsV2.id })
    defId = created.id

    const [s1] = await tx
      .insert(workflowStepsV2)
      .values({
        tenantId: TENANT_ID, workflowDefinitionId: defId,
        stepOrder: 1, stepCode: params.step1Code,
        stepNameEn: params.step1NameEn, stepNameAr: params.step1NameAr,
        hierarchyType: params.step1HType, hierarchyLevel: 1,
        slaHours: 48, onSlaBreach: 'ESCALATE', canDelegate: true, isOptional: false,
        createdBy: actor.id, createdByName: actor.name,
      })
      .returning({ id: workflowStepsV2.id })
    step1Id = s1.id

    if (params.step2Code) {
      const [s2] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId: TENANT_ID, workflowDefinitionId: defId,
          stepOrder: 2, stepCode: params.step2Code,
          stepNameEn: params.step2NameEn!, stepNameAr: params.step2NameAr!,
          hierarchyType: params.step2HType!, hierarchyRole: params.step2HRole,
          hierarchyLevel: 1,
          slaHours: 48, onSlaBreach: 'ESCALATE', canDelegate: false, isOptional: false,
          createdBy: actor.id, createdByName: actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      step2Id = s2.id
    }
  }

  return { defId, step1Id, step2Id }
}

// ── Resolve a person by user role ────────────────────────────────────────────

async function resolvePersonByRole(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ...roles: string[]
): Promise<string | null> {
  for (const role of roles) {
    const [row] = await tx
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(and(
        eq(userAccounts.tenantId, TENANT_ID),
        eq(userAccounts.avaniisRole, role),
        eq(userAccounts.isActive, true),
      ))
      .limit(1)
    if (row?.personId) return row.personId
  }
  return null
}

async function readWorkflowStepSummary(instanceId: string): Promise<{
  firstApproverName: string | null
  hasSecondStep: boolean
}> {
  const rows = await db
    .select({
      stepOrder:  workflowStepInstances.stepOrder,
      fullNameEn: persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(eq(workflowStepInstances.instanceId, instanceId))
    .orderBy(asc(workflowStepInstances.stepOrder))

  return {
    firstApproverName: rows[0]?.fullNameEn ?? null,
    hasSecondStep:    rows.some(row => row.stepOrder === 2),
  }
}

// ── triggerTransferApproval ───────────────────────────────────────────────────

export interface TransferWorkflowResult {
  instanceId:    string
  approverName:  string | null
  hrAdminFound:  boolean
}

/**
 * BR-WF-020 — Transfer requests require LINE_MANAGER then HR_ADMIN approval.
 * Called immediately after a transfer_requests row is created.
 */
export async function triggerTransferApproval(input: {
  personId:         string
  personNumber:     string
  personFullName:   string
  legalEntityId:    string
  lineManagerId?:   string | null // Deprecated: canonical routing ignores current-state manager handoff.
  toDepartmentId:   string
  effectiveDate:    string
  reason:           string
  transferRequestId: string
}): Promise<TransferWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const {
      personId, personNumber, personFullName,
      legalEntityId, effectiveDate, reason, transferRequestId,
    } = input

    await db.transaction(async tx => {
      await upsertTwoStepDef(tx, actor, {
        code: TRANSFER_WF_CODE,
        nameEn: 'Transfer Approval', nameAr: 'موافقة النقل',
        trigger: 'TRANSFER',
        step1Code: 'LINE_MANAGER_APPROVAL', step1NameEn: 'Line Manager Approval', step1NameAr: 'موافقة المدير المباشر', step1HType: 'LINE_MANAGER',
        step2Code: 'HR_ADMIN_APPROVAL',     step2NameEn: 'HR Admin Approval',     step2NameAr: 'موافقة مدير الموارد البشرية', step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_ADMIN',
      })
    })

    const wf = await submitWorkflow({
      workflowCode:        TRANSFER_WF_CODE,
      resourceType:        'transfer_requests',
      resourceId:          transferRequestId,
      initiatedByPersonId: personId,
      legalEntityId,
      contextOverrides: {
        'workflow.as_of_date':   effectiveDate,
        'resource.effective_date': effectiveDate,
        'assignment.effective_date': effectiveDate,
        'transfer.person_number': personNumber,
        'transfer.person_name':   personFullName,
        'transfer.reason':        reason,
      },
    })
    if (!wf.success || !wf.instanceId) throw new Error(wf.error ?? 'Failed to submit transfer workflow')

    const summary = await readWorkflowStepSummary(wf.instanceId)
    await db.transaction(async tx => {
      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: legalEntityId,
        channel:      'WEB',
        eventType:    'WORKFLOW.TRANSFER_INITIATED',
        resourceType: 'workflow_instances_v2',
        resourceId:   wf.instanceId!,
        entityId:     legalEntityId,
        newValues:    { personId, personNumber, effectiveDate, reason, routingMode: 'CANONICAL_EFFECTIVE_DATED' },
      }, tx)
    })

    return { instanceId: wf.instanceId, approverName: summary.firstApproverName, hrAdminFound: summary.hasSecondStep }
  } catch (e) { translateError(e, 'triggerTransferApproval') }
}

// ── triggerPromotionApproval ──────────────────────────────────────────────────

export interface PromotionWorkflowResult {
  instanceId:      string
  approverName:    string | null
  hrDirectorFound: boolean
}

/**
 * BR-WF-021 — Promotions require LINE_MANAGER then HR_DIRECTOR approval.
 * Called immediately after a transfer_requests row (requestType=PROMOTION) is created.
 */
export async function triggerPromotionApproval(input: {
  personId:          string
  personNumber:      string
  personFullName:    string
  legalEntityId:     string
  lineManagerId?:    string | null // Deprecated: canonical routing ignores current-state manager handoff.
  fromGradeName:     string
  toGradeName:       string
  effectiveDate:     string
  reason:            string
  transferRequestId: string
}): Promise<PromotionWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const {
      personId, personNumber, personFullName,
      legalEntityId, fromGradeName, toGradeName, effectiveDate, reason, transferRequestId,
    } = input

    await db.transaction(async tx => {
      await upsertTwoStepDef(tx, actor, {
        code: PROMOTION_WF_CODE,
        nameEn: 'Promotion Approval', nameAr: 'موافقة الترقية',
        trigger: 'PROMOTION',
        step1Code: 'LINE_MANAGER_APPROVAL', step1NameEn: 'Line Manager Approval',  step1NameAr: 'موافقة المدير المباشر',  step1HType: 'LINE_MANAGER',
        step2Code: 'HR_DIRECTOR_APPROVAL',  step2NameEn: 'HR Director Approval',   step2NameAr: 'موافقة مدير الموارد البشرية', step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_DIRECTOR',
      })
    })

    const wf = await submitWorkflow({
      workflowCode:        PROMOTION_WF_CODE,
      resourceType:        'transfer_requests',
      resourceId:          transferRequestId,
      initiatedByPersonId: personId,
      legalEntityId,
      contextOverrides: {
        'workflow.as_of_date':   effectiveDate,
        'resource.effective_date': effectiveDate,
        'assignment.effective_date': effectiveDate,
        'promotion.person_number': personNumber,
        'promotion.person_name':   personFullName,
        'promotion.from_grade':    fromGradeName,
        'promotion.to_grade':      toGradeName,
        'promotion.reason':        reason,
      },
    })
    if (!wf.success || !wf.instanceId) throw new Error(wf.error ?? 'Failed to submit promotion workflow')

    const summary = await readWorkflowStepSummary(wf.instanceId)
    await db.transaction(async tx => {
      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: legalEntityId,
        channel:      'WEB',
        eventType:    'WORKFLOW.PROMOTION_INITIATED',
        resourceType: 'workflow_instances_v2',
        resourceId:   wf.instanceId!,
        entityId:     legalEntityId,
        newValues:    { personId, personNumber, effectiveDate, fromGradeName, toGradeName, routingMode: 'CANONICAL_EFFECTIVE_DATED' },
      }, tx)
    })

    return { instanceId: wf.instanceId, approverName: summary.firstApproverName, hrDirectorFound: summary.hasSecondStep }
  } catch (e) { translateError(e, 'triggerPromotionApproval') }
}

// ── triggerTerminationApproval ────────────────────────────────────────────────

export interface TerminationWorkflowResult {
  instanceId:       string
  lineManagerName:  string | null
  hrDirectorFound:  boolean
}

/**
 * BR-WF-022 — Contract termination requires LINE_MANAGER then HR_DIRECTOR
 * approval (2-step sequential). BQ-2 confirmed: both must sign off.
 */
export async function triggerTerminationApproval(input: {
  personId:          string
  personNumber:      string
  personFullName:    string
  legalEntityId:     string
  lineManagerId:     string | null
  terminationDate:   string
  terminationReason: string
  contractId:        string
}): Promise<TerminationWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const {
      personId, personNumber, personFullName,
      legalEntityId, lineManagerId, terminationDate, terminationReason, contractId,
    } = input

    let instanceId       = ''
    let lineManagerName: string | null = null
    let hrDirectorFound  = false

    await db.transaction(async tx => {
      const { defId, step1Id, step2Id } = await upsertTwoStepDef(tx, actor, {
        code: TERMINATION_WF_CODE,
        nameEn: 'Termination Approval', nameAr: 'موافقة إنهاء الخدمة',
        trigger: 'TERMINATION',
        step1Code: 'LINE_MANAGER_APPROVAL', step1NameEn: 'Line Manager Approval',  step1NameAr: 'موافقة المدير المباشر',       step1HType: 'LINE_MANAGER',
        step2Code: 'HR_DIRECTOR_APPROVAL',  step2NameEn: 'HR Director Approval',   step2NameAr: 'موافقة مدير الموارد البشرية', step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_DIRECTOR',
      })

      // Resolve line manager
      let lmPersonId: string | null = null
      if (lineManagerId) {
        const [mgr] = await tx
          .select({ id: persons.id, fullNameEn: persons.fullNameEn })
          .from(persons)
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId)))
          .limit(1)
        if (mgr) { lmPersonId = mgr.id; lineManagerName = mgr.fullNameEn ?? null }
      }

      const hrPersonId = await resolvePersonByRole(tx, 'HR_DIRECTOR', 'HR_ADMIN')
      if (hrPersonId) hrDirectorFound = true

      const now = new Date()
      const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const resolvedApprovers: ResolvedApprover[] = []

      if (lmPersonId) resolvedApprovers.push({ personId: lmPersonId, personName: lineManagerName ?? '', stepOrder: 1, stepCode: 'LINE_MANAGER_APPROVAL', hierarchyType: 'LINE_MANAGER', resolvedAt: now.toISOString() })
      if (hrPersonId) resolvedApprovers.push({ personId: hrPersonId, personName: '', stepOrder: 2, stepCode: 'HR_DIRECTOR_APPROVAL', hierarchyType: 'CUSTOM_GROUP', resolvedAt: now.toISOString() })

      const hierarchySnapshot: HierarchySnapshot = { encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2' }
      const contextSnapshot: ContextSnapshot = { encryptedAt: now.toISOString(), resourceType: 'contracts', resourceId: contractId, fields: { personId, personNumber, terminationDate, terminationReason } }

      instanceId = randomUUID()
      await tx.insert(workflowInstancesV2).values({
        id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId, legalEntityId,
        resourceType: 'contracts', resourceId: contractId,
        initiatedByPersonId: actor.personId ?? personId,
        status: 'IN_PROGRESS', currentStepOrder: 1,
        hierarchySnapshot: hierarchySnapshot as never, contextSnapshot: contextSnapshot as never, resolvedSteps: resolvedApprovers as never,
        slaDeadline, startedAt: now, createdBy: actor.id, createdByName: actor.name, createdDate: now,
      })

      if (step1Id && lmPersonId) {
        await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step1Id, stepOrder: 1, status: 'PENDING', assignedToPersonId: lmPersonId, slaDeadline, createdBy: actor.id, createdByName: actor.name, createdDate: now })
      }
      if (step2Id && hrPersonId) {
        await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step2Id, stepOrder: 2, status: 'WAITING', assignedToPersonId: hrPersonId, createdBy: actor.id, createdByName: actor.name, createdDate: now })
      }

      type NotifRow = typeof notificationLog.$inferInsert
      const notifs: NotifRow[] = []
      if (lmPersonId) {
        notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: lmPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Termination approval required — ${personFullName}`, bodyEn: `${actor.name} has initiated termination for ${personFullName} (${personNumber}) effective ${terminationDate}. Reason: ${terminationReason}. Your approval is required as line manager before HR Director review.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      }
      if (hrPersonId) {
        notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: hrPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Termination pending HR Director review — ${personFullName}`, bodyEn: `Termination of ${personFullName} (${personNumber}) effective ${terminationDate} is awaiting Line Manager approval before reaching you.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      }
      if (notifs.length) await tx.insert(notificationLog).values(notifs)

      await writeAuditLog({ actorId: actor.id, actorName: actor.name, actorRole: actor.role, actorEntityId: legalEntityId, channel: 'WEB', eventType: 'WORKFLOW.TERMINATION_INITIATED', resourceType: 'workflow_instances_v2', resourceId: instanceId, entityId: legalEntityId, newValues: { personId, personNumber, terminationDate, terminationReason } }, tx)
    })

    return { instanceId, lineManagerName, hrDirectorFound }
  } catch (e) { translateError(e, 'triggerTerminationApproval') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Unit 10 — Probation & Exit Clearance workflow triggers (P2-3 / P2-4)
// ══════════════════════════════════════════════════════════════════════════════

const PROBATION_WF_CODE    = 'PROBATION_CONFIRMATION'
const EXIT_CLEARANCE_WF_CODE = 'EXIT_CLEARANCE'

// ── triggerProbationConfirmationWorkflow ──────────────────────────────────────

export interface ProbationWorkflowResult {
  instanceId:      string
  lineManagerName: string | null
  hrAdminFound:    boolean
}

/**
 * P2-4 — Probation completion triggers LINE_MANAGER → HR_ADMIN 2-step review.
 * HR admin initiates; line manager confirms pass/extend/fail; HR Admin approves.
 */
export async function triggerProbationConfirmationWorkflow(input: {
  reviewId:       string
  personId:       string
  personNumber:   string
  personFullName: string
  legalEntityId:  string
  lineManagerId:  string | null
  probationEndDate: string
}): Promise<ProbationWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const { reviewId, personId, personNumber, personFullName, legalEntityId, lineManagerId, probationEndDate } = input

    let instanceId    = ''
    let lineManagerName: string | null = null
    let hrAdminFound  = false

    await db.transaction(async tx => {
      const { defId, step1Id, step2Id } = await upsertTwoStepDef(tx, actor, {
        code:       PROBATION_WF_CODE,
        nameEn:     'Probation Confirmation',       nameAr: 'تأكيد فترة التجربة',
        trigger:    'PROBATION_CONFIRM',
        step1Code:  'LINE_MANAGER_REVIEW',   step1NameEn: 'Line Manager Review',    step1NameAr: 'مراجعة المدير المباشر',       step1HType: 'LINE_MANAGER',
        step2Code:  'HR_ADMIN_CONFIRMATION', step2NameEn: 'HR Admin Confirmation',  step2NameAr: 'تأكيد مدير الموارد البشرية',   step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_ADMIN',
      })

      let lmPersonId: string | null = null
      if (lineManagerId) {
        const [mgr] = await tx.select({ id: persons.id, fullNameEn: persons.fullNameEn })
          .from(persons).where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId))).limit(1)
        if (mgr) { lmPersonId = mgr.id; lineManagerName = mgr.fullNameEn ?? null }
      }

      const hrPersonId = await resolvePersonByRole(tx, 'HR_ADMIN', 'HR_DIRECTOR')
      if (hrPersonId) hrAdminFound = true

      const now = new Date()
      const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const resolvedApprovers: ResolvedApprover[] = []

      if (lmPersonId) resolvedApprovers.push({ personId: lmPersonId, personName: lineManagerName ?? '', stepOrder: 1, stepCode: 'LINE_MANAGER_REVIEW',   hierarchyType: 'LINE_MANAGER',  resolvedAt: now.toISOString() })
      if (hrPersonId) resolvedApprovers.push({ personId: hrPersonId, personName: '',                  stepOrder: 2, stepCode: 'HR_ADMIN_CONFIRMATION', hierarchyType: 'CUSTOM_GROUP', resolvedAt: now.toISOString() })

      const hierarchySnapshot: HierarchySnapshot = { encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2' }
      // resourceType: 'probation_review' so dispatchResourceCompletion routes to applyProbationOutcome
      const contextSnapshot: ContextSnapshot = { encryptedAt: now.toISOString(), resourceType: 'probation_review', resourceId: reviewId, fields: { reviewId, personId, personNumber, probationEndDate } }

      instanceId = randomUUID()
      await tx.insert(workflowInstancesV2).values({ id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId, legalEntityId, resourceType: 'probation_review', resourceId: reviewId, initiatedByPersonId: actor.personId ?? personId, status: 'IN_PROGRESS', currentStepOrder: 1, hierarchySnapshot: hierarchySnapshot as never, contextSnapshot: contextSnapshot as never, resolvedSteps: resolvedApprovers as never, slaDeadline, startedAt: now, createdBy: actor.id, createdByName: actor.name, createdDate: now })

      if (step1Id && lmPersonId) await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step1Id, stepOrder: 1, status: 'PENDING',  assignedToPersonId: lmPersonId, slaDeadline, createdBy: actor.id, createdByName: actor.name, createdDate: now })
      if (step2Id && hrPersonId) await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step2Id, stepOrder: 2, status: 'WAITING', assignedToPersonId: hrPersonId,              createdBy: actor.id, createdByName: actor.name, createdDate: now })

      type N = typeof notificationLog.$inferInsert
      const notifs: N[] = []
      if (lmPersonId) notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: lmPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Probation review required — ${personFullName}`, bodyEn: `${personFullName} (${personNumber}) probation ends ${probationEndDate}. Please review performance and recommend: Confirm / Extend / Fail.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      if (hrPersonId) notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: hrPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Probation confirmation pending — ${personFullName}`,  bodyEn: `Probation of ${personFullName} (${personNumber}, end date ${probationEndDate}) is awaiting Line Manager review before HR confirmation.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      if (notifs.length) await tx.insert(notificationLog).values(notifs)

      await writeAuditLog({ actorId: actor.id, actorName: actor.name, actorRole: actor.role, actorEntityId: legalEntityId, channel: 'WEB', eventType: 'WORKFLOW.PROBATION_INITIATED', resourceType: 'workflow_instances_v2', resourceId: instanceId, entityId: legalEntityId, newValues: { personId, personNumber, probationEndDate } }, tx)
    })

    return { instanceId, lineManagerName, hrAdminFound }
  } catch (e) { translateError(e, 'triggerProbationConfirmationWorkflow') }
}

// ── triggerExitClearanceWorkflow ──────────────────────────────────────────────

export interface ExitClearanceWorkflowResult {
  instanceId:   string
  notifiedRoles: string[]
}

/**
 * P2-3 — Exit clearance notification workflow (FYI broadcast, not blocking).
 * Notifies IT, Payroll Admin, Line Manager, and HR Admin simultaneously
 * so each department can complete their offboarding checklist items.
 */
export async function triggerExitClearanceWorkflow(input: {
  personId:          string
  personNumber:      string
  personFullName:    string
  legalEntityId:     string
  lineManagerId:     string | null
  terminationDate:   string
  checklistId:       string
}): Promise<ExitClearanceWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const { personId, personNumber, personFullName, legalEntityId, lineManagerId, terminationDate, checklistId } = input

    let instanceId    = ''
    const notifiedRoles: string[] = []

    await db.transaction(async tx => {
      // Single-step FYI workflow — all notified parties see it in /workflows
      const { defId, step1Id } = await upsertTwoStepDef(tx, actor, {
        code:      EXIT_CLEARANCE_WF_CODE,
        nameEn:    'Exit Clearance',         nameAr: 'إجراءات المغادرة',
        trigger:   'EXIT_CLEARANCE',
        step1Code: 'HR_ADMIN_COORDINATION',  step1NameEn: 'HR Admin Coordination', step1NameAr: 'تنسيق الموارد البشرية', step1HType: 'CUSTOM_GROUP',
      })

      const hrPersonId = await resolvePersonByRole(tx, 'HR_ADMIN', 'HR_DIRECTOR')
      if (hrPersonId) notifiedRoles.push('HR_ADMIN')

      // Resolve line manager
      let lmPersonId: string | null = null
      if (lineManagerId) {
        const [mgr] = await tx.select({ id: persons.id }).from(persons).where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId))).limit(1)
        if (mgr) { lmPersonId = mgr.id; notifiedRoles.push('MANAGER') }
      }

      // Resolve IT and Payroll notificants
      const [itAccount]      = await tx.select({ personId: userAccounts.personId }).from(userAccounts).where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.avaniisRole, 'IT_ADMIN'),    eq(userAccounts.isActive, true))).limit(1)
      const [payrollAccount] = await tx.select({ personId: userAccounts.personId }).from(userAccounts).where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.avaniisRole, 'PAYROLL_ADMIN'), eq(userAccounts.isActive, true))).limit(1)

      const itPersonId      = itAccount?.personId      ?? null
      const payrollPersonId = payrollAccount?.personId ?? null
      if (itPersonId)      notifiedRoles.push('IT_ADMIN')
      if (payrollPersonId) notifiedRoles.push('PAYROLL_ADMIN')

      const resolvedApprovers: ResolvedApprover[] = []
      if (hrPersonId) resolvedApprovers.push({ personId: hrPersonId, personName: '', stepOrder: 1, stepCode: 'HR_ADMIN_COORDINATION', hierarchyType: 'CUSTOM_GROUP', resolvedAt: new Date().toISOString() })

      const now = new Date()
      const slaDeadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // 5 days
      const hierarchySnapshot: HierarchySnapshot = { encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2' }
      const contextSnapshot: ContextSnapshot = { encryptedAt: now.toISOString(), resourceType: 'onboarding_checklists', resourceId: checklistId, fields: { personId, personNumber, terminationDate, checklistId } }

      instanceId = randomUUID()
      await tx.insert(workflowInstancesV2).values({ id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId, legalEntityId, resourceType: 'onboarding_checklists', resourceId: checklistId, initiatedByPersonId: actor.personId ?? personId, status: 'IN_PROGRESS', currentStepOrder: 1, hierarchySnapshot: hierarchySnapshot as never, contextSnapshot: contextSnapshot as never, resolvedSteps: resolvedApprovers as never, slaDeadline, startedAt: now, createdBy: actor.id, createdByName: actor.name, createdDate: now })

      if (step1Id && hrPersonId) await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step1Id, stepOrder: 1, status: 'PENDING', assignedToPersonId: hrPersonId, slaDeadline, createdBy: actor.id, createdByName: actor.name, createdDate: now })

      // Broadcast IN_APP notifications to all relevant parties
      type N = typeof notificationLog.$inferInsert
      const notifs: N[] = []
      const baseNotif = (recipientPersonId: string, roleLabel: string): N => ({
        tenantId: TENANT_ID, legalEntityId, recipientPersonId,
        notificationType: 'ACTION_REQUIRED', channel: 'IN_APP',
        subjectEn: `Exit clearance initiated — ${personFullName}`,
        bodyEn: `${personFullName} (${personNumber}) is leaving on ${terminationDate}. Complete your assigned offboarding items before this date. View the checklist in Exit Clearance.`,
        referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId,
        status: 'PENDING', createdBy: actor.id, createdByName: actor.name,
      })
      if (hrPersonId)      notifs.push(baseNotif(hrPersonId,      'HR Admin'))
      if (lmPersonId)      notifs.push(baseNotif(lmPersonId,      'Line Manager'))
      if (itPersonId)      notifs.push(baseNotif(itPersonId,      'IT Admin'))
      if (payrollPersonId) notifs.push(baseNotif(payrollPersonId, 'Payroll Admin'))
      if (notifs.length) await tx.insert(notificationLog).values(notifs)

      await writeAuditLog({ actorId: actor.id, actorName: actor.name, actorRole: actor.role, actorEntityId: legalEntityId, channel: 'WEB', eventType: 'WORKFLOW.EXIT_CLEARANCE_INITIATED', resourceType: 'workflow_instances_v2', resourceId: instanceId, entityId: legalEntityId, newValues: { personId, personNumber, terminationDate, checklistId } }, tx)
    })

    return { instanceId, notifiedRoles }
  } catch (e) { translateError(e, 'triggerExitClearanceWorkflow') }
}
