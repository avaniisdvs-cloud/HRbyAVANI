'use server'

/**
 * Config module Server Actions — Task 8c.
 * Five fully-implemented mutations, stubs for all other public API functions
 * listed in Task 8a (implemented in Sprint 2 when entity modules are built).
 *
 * Hard Rule 2: every DB write uses db.transaction() with writeAuditLog()
 *              called inside the same transaction.
 * Hard Rule 6: all cross-module access goes through each module's index.ts.
 */
import { translateError } from '@/lib/app-error'
import { db }         from '@/lib/db'
import { eq, and, count as sqlCount, inArray, lte, gte, asc, desc, sql } from 'drizzle-orm'
import { z }          from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'
import {
  customFieldDefinitions,
  notificationTemplates,
  notificationLog,
  policySettings,
  workflowDefinitions,
  workflowStages,
  workflowInstances,
  approvalDelegations,
  leaveRuleSets,
  leaveRuleLines,
  events,
  formConfigurations,
  persons,
  workerAssignments,
  userAccounts,
} from '@/drizzle/schema'
import { writeAuditLog }  from '@/lib/audit'
import { requireRole, getCurrentUser } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import {
  assertNotSystemField,
  assertLeaveRuleNotBelowMinimum,
  assertMaxCustomFields,
  assertWorkflowRoleValid,
  assertEscalationRoleHigher,
  assertPlaceholdersValid,
} from './guards'
import { resolveWorkflowTemplate, invalidateConfigCache } from '@/lib/config-resolver'
import { evaluateManagerRole } from '@/lib/evaluate-manager-role'

// ══════════════════════════════════════════════════════════════════════════════
// 1 — createCustomField
// ══════════════════════════════════════════════════════════════════════════════

const CreateCustomFieldSchema = z.object({
  legalEntityId: z.string().uuid(),
  objectType:    z.string().min(1),
  // API name must be snake_case — used as JSONB key in entity extra_data
  apiName:       z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/),
  labelEn:       z.string().min(1).max(200),
  labelAr:       z.string().max(200).optional(),
  dataType:      z.enum([
    'TEXT', 'NUMBER', 'DATE', 'CURRENCY', 'CHECKBOX',
    'PICKLIST', 'MULTI_PICKLIST', 'LONG_TEXT', 'URL',
  ]),
  isRequired:   z.boolean().default(false),
  isSearchable: z.boolean().default(false),
  isEncrypted:  z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
  sectionCode:  z.string().optional(),
  helpTextEn:   z.string().optional(),
  helpTextAr:   z.string().optional(),
})

export type CreateCustomFieldInput = z.infer<typeof CreateCustomFieldSchema>

export async function createCustomField(
  input: CreateCustomFieldInput,
): Promise<{ id: string }> {
  try {
  // 1. auth — HR_ADMIN only
  const user = await requireRole(['HR_ADMIN'])

  // 2. validate
  const data = CreateCustomFieldSchema.parse(input)

  // 3. domain guard — cap at 50 active fields per entity type
  await assertMaxCustomFields(data.objectType, TENANT_ID)

  // 4. db.transaction — Hard Rule 2
  let newId = ''
  await db.transaction(async tx => {
    const [row] = await tx
      .insert(customFieldDefinitions)
      .values({
        tenantId:      TENANT_ID,
        legalEntityId: data.legalEntityId,
        objectType:    data.objectType,
        apiName:       data.apiName,
        labelEn:       data.labelEn,
        labelAr:       data.labelAr,
        dataType:      data.dataType,
        isRequired:    data.isRequired,
        isSearchable:  data.isSearchable,
        isEncrypted:   data.isEncrypted,
        displayOrder:  data.displayOrder,
        sectionCode:   data.sectionCode,
        helpTextEn:    data.helpTextEn,
        helpTextAr:    data.helpTextAr,
        isActive:      true,
        createdBy:     user.id,
        createdByName: user.name,
      })
      .returning({ id: customFieldDefinitions.id })

    newId = row.id

    // 5. audit inside same transaction — Hard Rule 1 (QA-Audit-H2: pass tx).
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId,
      channel:       'WEB',
      eventType:     'CUSTOM_FIELD.CREATED',
      resourceType:  'custom_field_definitions',
      resourceId:    newId,
      entityId:      data.legalEntityId,
      newValues:     data as Record<string, unknown>,
    }, tx)
  })

  return { id: newId }
  } catch (e) { translateError(e, 'createCustomField') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2 — updateNotificationTemplate
// Hard Rule 3: HR records are never deleted — insert a new version row,
// mark the old one inactive (preserves full history).
// ══════════════════════════════════════════════════════════════════════════════

const UpdateNotificationTemplatePatchSchema = z.object({
  subjectEn: z.string().max(500).optional(),
  subjectAr: z.string().max(500).optional(),
  bodyEn:    z.string().min(1),
  bodyAr:    z.string().optional(),
})

export type UpdateNotificationTemplatePatch =
  z.infer<typeof UpdateNotificationTemplatePatchSchema>

export async function updateNotificationTemplate(
  id:    string,
  patch: UpdateNotificationTemplatePatch,
): Promise<{ id: string }> {
  try {
  // 1. auth
  const user = await requireRole(['HR_ADMIN'])

  // 2. validate patch
  const data = UpdateNotificationTemplatePatchSchema.parse(patch)

  // 3. fetch existing
  const [existing] = await db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.id, id))
    .limit(1)

  if (!existing) throw new Error(`NOT_FOUND: notification template ${id}`)

  // assertNotSystemField — system templates have no legalEntityId
  assertNotSystemField({ isSystemField: existing.legalEntityId === null })

  // 4. assertPlaceholdersValid — BR-NOTIF-001: only known tokens allowed
  await assertPlaceholdersValid(data.bodyEn, existing.eventType)
  if (data.bodyAr) await assertPlaceholdersValid(data.bodyAr, existing.eventType)

  // 5. db.transaction — deactivate old + insert new version — Hard Rule 2 & 3
  let newId = ''
  await db.transaction(async tx => {
    await tx
      .update(notificationTemplates)
      .set({ isActive: false, updatedBy: user.id, updatedByName: user.name, lastUpdatedDate: new Date() })
      .where(eq(notificationTemplates.id, id))

    const [row] = await tx
      .insert(notificationTemplates)
      .values({
        tenantId:      existing.tenantId,
        legalEntityId: existing.legalEntityId,
        templateCode:  existing.templateCode,
        templateNameEn: existing.templateNameEn,
        eventType:     existing.eventType,
        channel:       existing.channel,
        language:      existing.language,
        subjectEn:     data.subjectEn ?? existing.subjectEn ?? undefined,
        subjectAr:     data.subjectAr ?? existing.subjectAr ?? undefined,
        bodyEn:        data.bodyEn,
        bodyAr:        data.bodyAr ?? existing.bodyAr ?? undefined,
        availableVarsJson: existing.availableVarsJson ?? undefined,
        recipientRoles: existing.recipientRoles,
        isActive:      true,
        createdBy:     user.id,
        createdByName: user.name,
      })
      .returning({ id: notificationTemplates.id })

    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      channel:       'WEB',
      eventType:     'NOTIFICATION_TEMPLATE.UPDATED',
      resourceType:  'notification_templates',
      resourceId:    newId,
      oldValues:     { id, bodyEn: existing.bodyEn, bodyAr: existing.bodyAr },
      newValues:     data as Record<string, unknown>,
    }, tx)  // QA-Audit-H2
  })

  // TD-14: invalidate cached config so next read picks up the new template body
  invalidateConfigCache()

  return { id: newId }
  } catch (e) { translateError(e, 'updateNotificationTemplate') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3 — updatePolicySetting
// Hard Rule 10: SYSTEM_ONLY / non-overridable settings must never be updated.
// The policySettings.isOverridable flag carries this distinction.
// ══════════════════════════════════════════════════════════════════════════════

export async function updatePolicySetting(
  settingKey:    string,
  legalEntityId: string,
  newValue:      string,
): Promise<{ success: true }> {
  try {
  // 1. auth — HR_ADMIN, HR_DIRECTOR, and SUPER_ADMIN may all update policy settings
  const user     = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (settingKey.startsWith('COMPANY_BRANDING_')) throw new Error('FORBIDDEN: use the Super Admin company branding action')
  const actorName = user.name ?? user.email ?? 'system'

  // 2. fetch — scope to caller's entity
  const [existing] = await db
    .select()
    .from(policySettings)
    .where(
      and(
        eq(policySettings.tenantId, TENANT_ID),
        eq(policySettings.legalEntityId, legalEntityId),
        eq(policySettings.settingKey, settingKey),
      ),
    )
    .limit(1)

  if (existing) {
    // Hard Rule 10: isOverridable=false → SYSTEM_ONLY, never update
    if (!existing.isOverridable) {
      throw new Error(
        `FORBIDDEN: policy setting "${settingKey}" is SYSTEM_ONLY and cannot be updated`,
      )
    }

    // 3a. update the existing entity-scoped row — db.transaction (Hard Rule 2)
    await db.transaction(async tx => {
      await tx
        .update(policySettings)
        .set({
          settingValue:    newValue,
          updatedBy:       user.id,
          updatedByName:   actorName,
          lastUpdatedDate: new Date(),
        })
        .where(eq(policySettings.id, existing.id))

      await writeAuditLog({
        actorId:       user.id,
        actorName,
        actorRole:     user.role,
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'POLICY_SETTING.UPDATED',
        resourceType:  'policy_settings',
        resourceId:    existing.id,
        entityId:      legalEntityId,
        oldValues:     { settingKey, settingValue: existing.settingValue },
        newValues:     { settingKey, settingValue: newValue },
      }, tx)  // QA-Audit-H2
    })
  } else {
    // 3b. No entity-scoped row yet → create an entity override from the default/definition
    // row for this key. This lets any entity (incl. accounts whose entity has no seeded
    // rows) save an overridable setting instead of hitting NOT_FOUND. Hard Rule 10 is
    // preserved: SYSTEM_ONLY (non-overridable) definitions still cannot be overridden.
    const templates = await db
      .select()
      .from(policySettings)
      .where(
        and(
          eq(policySettings.tenantId, TENANT_ID),
          eq(policySettings.settingKey, settingKey),
        ),
      )

    if (templates.length === 0) {
      throw new Error(`NOT_FOUND: policy setting "${settingKey}"`)
    }

    // Prefer the global (NULL-entity) definition; else any existing row for this key.
    const template = templates.find(t => t.legalEntityId === null) ?? templates[0]

    if (!template.isOverridable) {
      throw new Error(
        `FORBIDDEN: policy setting "${settingKey}" is SYSTEM_ONLY and cannot be updated`,
      )
    }

    await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(policySettings)
        .values({
          tenantId:        TENANT_ID,
          legalEntityId,
          settingKey,
          settingNameEn:   template.settingNameEn,
          settingNameAr:   template.settingNameAr,
          valueType:       template.valueType,
          settingValue:    newValue,
          moduleCode:      template.moduleCode,
          isOverridable:   true,
          effectiveFrom:   template.effectiveFrom,
          effectiveTo:     template.effectiveTo,
          notes:           template.notes,
          createdBy:       user.id,
          createdByName:   actorName,
          updatedBy:       user.id,
          updatedByName:   actorName,
          lastUpdatedDate: new Date(),
        })
        .returning({ id: policySettings.id })

      await writeAuditLog({
        actorId:       user.id,
        actorName,
        actorRole:     user.role,
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'POLICY_SETTING.CREATED',
        resourceType:  'policy_settings',
        resourceId:    inserted.id,
        entityId:      legalEntityId,
        newValues:     { settingKey, settingValue: newValue, legalEntityId, source: 'entity-override' },
      }, tx)
    })
  }

  // TD-13: invalidate cached config so next policy read picks up the new value
  invalidateConfigCache()

  return { success: true }
  } catch (e) { translateError(e, 'updatePolicySetting') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4 — initiateWorkflow
// Resolves the correct workflow definition for the trigger event, creates an
// immutable snapshot of its stages, and inserts a workflow_instances row.
// ══════════════════════════════════════════════════════════════════════════════

export async function initiateWorkflow(
  triggerEvent: string,
  subjectType:  string,
  subjectId:    string,
  legalEntityId: string,
  context:      Record<string, unknown> = {},
): Promise<{ instanceId: string }> {
  try {
  // 1. auth — any authenticated role may initiate a workflow
  const user = await getCurrentUser()

  // 2. resolve the matching workflow template + apply routing rules
  const resolved = await resolveWorkflowTemplate(triggerEvent, context, TENANT_ID)
  if (!resolved) {
    throw new Error(`NOT_FOUND: no active workflow template for event "${triggerEvent}"`)
  }

  // 3. db.transaction — insert instance with immutable stage snapshot — Hard Rule 2
  let instanceId = ''
  await db.transaction(async tx => {
    // Fetch the first stage to set as current
    const [firstStage] = await tx
      .select({ id: workflowStages.id })
      .from(workflowStages)
      .where(eq(workflowStages.workflowDefinitionId, resolved.workflowDefinitionId))
      .orderBy(workflowStages.stageOrder)
      .limit(1)

    // Chain JSON shape: { stages: ResolvedStage[], events: ChainEvent[] }.
    // - `stages` is the immutable snapshot of resolved approver stages at
    //   initiation time. Routing rules don't apply retroactively.
    // - `events` is appended to by actOnWorkflowStep on every decision.
    // Both keys are surfaced by S9-06 history viewer.
    const initialChain = {
      stages: resolved.stages,
      events: [],
    }

    const [row] = await tx
      .insert(workflowInstances)
      .values({
        tenantId:             TENANT_ID,
        workflowDefinitionId: resolved.workflowDefinitionId,
        resourceType:         subjectType,
        resourceId:           subjectId,
        initiatedByPersonId:  user.personId ?? user.id,
        legalEntityId,
        currentStageId:       firstStage?.id,
        currentStageOrder:    1,
        status:               'IN_PROGRESS',
        approvalChainJson:    initialChain,
        createdBy:            user.id,
        createdByName:        user.name,
      })
      .returning({ id: workflowInstances.id })

    instanceId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: legalEntityId,
      channel:       'WEB',
      eventType:     'WORKFLOW.INITIATED',
      resourceType:  'workflow_instances',
      resourceId:    instanceId,
      entityId:      legalEntityId,
      metadata:      { triggerEvent, subjectType, subjectId, stages: resolved.stages },
    }, tx)  // QA-Audit-H2

    // S2-10 — domain event ships atomically with the state change via the outbox.
    await tx.insert(events).values({
      tenantId:  TENANT_ID,
      eventType: 'workflow.initiated',
      payload:   {
        instanceId,
        triggerEvent,
        subjectType,
        subjectId,
        legalEntityId,
        initiatedBy: user.id,
      },
    })
  })

  return { instanceId }
  } catch (e) { translateError(e, 'initiateWorkflow') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5 — actOnWorkflowStep
// Records an approve/reject decision on the current stage of a workflow instance.
// If it's the final stage approval, transitions the instance to APPROVED.
// ══════════════════════════════════════════════════════════════════════════════

export async function actOnWorkflowStep(
  instanceId:           string,
  action:               'APPROVE' | 'REJECT' | 'DELEGATE',
  comment?:             string,
  delegateToPersonId?:  string,
): Promise<{ status: string }> {
  try {
  // 1. auth — any authenticated role
  const user = await getCurrentUser()

  // 2. fetch instance + validate it's still in progress
  const [instance] = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1)

  if (!instance) throw new Error(`NOT_FOUND: workflow instance ${instanceId}`)
  if (instance.status !== 'IN_PROGRESS' && instance.status !== 'PENDING') {
    throw new Error(
      `CONFLICT: workflow instance is already ${instance.status}`,
    )
  }

  // S9-03: DELEGATE inputs validated up-front so we never hit the role
  // gate on a malformed call.
  if (action === 'DELEGATE') {
    if (!delegateToPersonId) {
      throw new Error('DELEGATE_REQUIRES_TARGET: delegateToPersonId is required for DELEGATE action')
    }
    if (delegateToPersonId === user.id) {
      throw new Error('DELEGATE_TO_SELF_FORBIDDEN: cannot delegate a workflow back to yourself')
    }
    // Shape check — delegate target must be a UUID. Catches form
    // tampering before we hit the FK constraint with a Postgres error.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(delegateToPersonId)) {
      throw new Error('INVALID_TARGET: delegateToPersonId must be a UUID')
    }
    // Existence + scope check — prevents an attacker from delegating to
    // a non-existent person id, an inactive person, or someone outside
    // the workflow's legal entity. The form's getDelegateCandidates()
    // already filters these out, but Server Actions are an open API.
  }

  // 3. verify actor has the role required by the current stage. The actor
  // is allowed if (a) their role matches the stage's approverRoleCode,
  // (b) they are HR_ADMIN / SUPER_ADMIN, or (c) the instance was previously
  // delegated TO them (S9-03 per-instance delegation).
  const [currentStage] = instance.currentStageId
    ? await db
        .select()
        .from(workflowStages)
        .where(eq(workflowStages.id, instance.currentStageId))
        .limit(1)
    : []

  // DELEGATE: existence + same-entity check — done after loading the
  // instance so we know the workflow's legalEntityId. Hard fail on any of
  // (not found, inactive, cross-entity) — the form prevents this but the
  // Server Action is an open API and must not trust the client.
  if (action === 'DELEGATE' && delegateToPersonId) {
    const [target] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId, isActive: persons.isActive })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, delegateToPersonId)))
      .limit(1)
    if (!target || !target.isActive) {
      throw new Error('NOT_FOUND: delegate target is not an active person')
    }
    if (target.legalEntityId !== instance.legalEntityId && user.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: cannot delegate across legal entities')
    }
  }

  const wasDelegatedToMe =
    !!instance.currentDelegateePersonId && instance.currentDelegateePersonId === user.id

  // TD-47: check ongoing approval_delegations so a delegate who has
  // been granted an ongoing (date-range) delegation by a role holder can
  // act directly, not just view the workflow in their dashboard.
  let isOngoingDelegate = false
  if (
    !wasDelegatedToMe &&
    user.personId &&
    currentStage?.approverRoleCode
  ) {
    const today = new Date().toISOString().slice(0, 10)
    const [activeDelegation] = await db
      .select({ id: approvalDelegations.id })
      .from(approvalDelegations)
      .innerJoin(userAccounts, eq(userAccounts.personId, approvalDelegations.delegatorId))
      .where(
        and(
          eq(approvalDelegations.tenantId, TENANT_ID),
          eq(approvalDelegations.delegateId, user.personId),
          eq(approvalDelegations.isActive, true),
          lte(approvalDelegations.delegationFrom, today),
          gte(approvalDelegations.delegationTo, today),
          eq(userAccounts.avaniisRole, currentStage.approverRoleCode),
        ),
      )
      .limit(1)
    isOngoingDelegate = !!activeDelegation
  }

  // Allow approval if the current user was explicitly notified as the
  // designated approver for this instance — covers the case where a person
  // acts as line manager in the org chart but holds a non-manager system role.
  let isDesignatedApprover = false
  if (user.personId && !wasDelegatedToMe && !isOngoingDelegate) {
    const [notifRow] = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(and(
        eq(notificationLog.tenantId,          TENANT_ID),
        eq(notificationLog.recipientPersonId, user.personId),
        eq(notificationLog.referenceId,       instanceId),
        eq(notificationLog.referenceType,     'WORKFLOW_INSTANCE'),
      ))
      .limit(1)
    isDesignatedApprover = !!notifRow
  }

  if (currentStage?.approverRoleCode) {
    assertWorkflowRoleValid(currentStage.approverRoleCode)
    if (
      user.role !== currentStage.approverRoleCode &&
      !(user.role === 'MANAGER' && currentStage.approverRoleCode === 'LINE_MANAGER') &&
      user.role !== 'HR_ADMIN' &&
      user.role !== 'SUPER_ADMIN' &&
      !wasDelegatedToMe &&
      !isOngoingDelegate &&
      !isDesignatedApprover
    ) {
      throw new Error(
        `FORBIDDEN: current stage requires role "${currentStage.approverRoleCode}", got "${user.role}"`,
      )
    }
  }

  // Determine next stage. DELEGATE is non-advancing — the instance stays on
  // the current stage but ownership transfers to the delegate.
  // Tolerate both the new chain shape `{ stages, events }` and the legacy
  // top-level array (pre-S9-06 instances). `hasNextStage` uses the snapshot.
  const rawForStages = instance.approvalChainJson
  const stagesForCheck: Array<{ stageOrder: number }> = Array.isArray(rawForStages)
    ? (rawForStages as Array<{ stageOrder: number }>)
    : (((rawForStages as { stages?: Array<{ stageOrder: number }> } | null)?.stages) ?? [])
  const nextOrder = (instance.currentStageOrder ?? 0) + 1
  // Tolerate old instances (created before S9-06) that stored `order` instead of `stageOrder`
  const hasNextStage = stagesForCheck.some(s =>
    ((s.stageOrder ?? (s as unknown as { order?: number }).order) === nextOrder)
  )

  const newStatus =
    action === 'REJECT'   ? 'REJECTED'
    : action === 'DELEGATE' ? instance.status // unchanged — still in-flight
    : hasNextStage          ? 'IN_PROGRESS'
    : 'APPROVED'

  // 4. db.transaction — update instance + audit — Hard Rule 2
  await db.transaction(async tx => {
    // Append the decision event to approvalChainJson so S9-06 (history
    // viewer) renders the full audit trail of acts taken on this instance.
    // The chain JSON started as a snapshot of resolved stages at initiation
    // (see initiateWorkflow); we now also push action events under `events`.
    type ChainEvent = {
      kind:       'STAGE_DECISION'
      action:     'APPROVE' | 'REJECT' | 'DELEGATE'
      stageOrder: number | null
      actorId:    string
      actorName:  string
      actorRole:  string
      comment:    string | null
      delegateToPersonId?: string
      at:         string
    }
    // Chain JSON has two shapes in the wild:
    //   • New (post-S9-06): { stages: ResolvedStage[], events: ChainEvent[] }
    //   • Legacy (pre-S9-06): ResolvedStage[]  (array, no event log)
    // Normalise both into the new shape so the events log can grow.
    const raw = instance.approvalChainJson
    const isLegacyArray = Array.isArray(raw)
    const stagesSnapshot = isLegacyArray ? (raw as unknown[]) : (raw as { stages?: unknown[] } | null)?.stages ?? []
    const priorEvents: ChainEvent[] = isLegacyArray
      ? []
      : Array.isArray((raw as { events?: ChainEvent[] } | null)?.events)
        ? (raw as { events: ChainEvent[] }).events
        : []
    const events_log: ChainEvent[] = [...priorEvents]
    events_log.push({
      kind:       'STAGE_DECISION',
      action,
      stageOrder: instance.currentStageOrder ?? null,
      actorId:    user.id,
      actorName:  user.name,
      actorRole:  user.role,
      comment:    comment ?? null,
      delegateToPersonId: action === 'DELEGATE' ? delegateToPersonId : undefined,
      at:         new Date().toISOString(),
    })
    const newChain = { stages: stagesSnapshot, events: events_log }

    if (action === 'DELEGATE') {
      // Reassign ownership without advancing the stage. A subsequent
      // APPROVE / REJECT by the delegate will clear the delegatee.
      await tx
        .update(workflowInstances)
        .set({
          currentDelegateePersonId: delegateToPersonId!,
          approvalChainJson:        newChain,
          updatedBy:                user.id,
          updatedByName:            user.name,
          lastUpdatedDate:          new Date(),
        })
        .where(eq(workflowInstances.id, instanceId))
    } else if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      await tx
        .update(workflowInstances)
        .set({
          status:                   newStatus,
          completedAt:              new Date(),
          finalDecisionBy:          user.personId ?? null,
          finalDecisionNote:        comment,
          rejectionReason:          action === 'REJECT' ? comment : null,
          // Clear any per-instance delegation when the workflow terminates.
          currentDelegateePersonId: null,
          approvalChainJson:        newChain,
          updatedBy:                user.id,
          updatedByName:            user.name,
          lastUpdatedDate:          new Date(),
        })
        .where(eq(workflowInstances.id, instanceId))
    } else {
      // Advance to next stage — find its id
      const [nextStageRow] = await tx
        .select({ id: workflowStages.id })
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.workflowDefinitionId, instance.workflowDefinitionId),
            eq(workflowStages.stageOrder, nextOrder),
          ),
        )
        .limit(1)

      await tx
        .update(workflowInstances)
        .set({
          currentStageId:           nextStageRow?.id ?? null,
          currentStageOrder:        nextOrder,
          // Each new stage starts fresh — clear any prior delegate.
          currentDelegateePersonId: null,
          approvalChainJson:        newChain,
          updatedBy:                user.id,
          updatedByName:            user.name,
          lastUpdatedDate:          new Date(),
        })
        .where(eq(workflowInstances.id, instanceId))
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    `WORKFLOW.STEP_${action}D`, // APPROVED / REJECTED / DELEGATED
      resourceType: 'workflow_instances',
      resourceId:   instanceId,
      oldValues:    { status: instance.status, stage: instance.currentStageOrder },
      newValues: {
        status:    newStatus,
        action,
        comment,
        delegateToPersonId: action === 'DELEGATE' ? delegateToPersonId : undefined,
      },
    }, tx)  // QA-Audit-H2

    // S2-10 — emit a step decision event; final-stage decisions also emit a
    // terminal `workflow.completed` event so downstream consumers (notifications,
    // ARIA, finance integrations) can branch without re-querying the instance.
    const eventType =
      action === 'APPROVE'  ? 'workflow.step_approved'
      : action === 'REJECT' ? 'workflow.step_rejected'
      :                       'workflow.step_delegated'
    await tx.insert(events).values({
      tenantId:  TENANT_ID,
      eventType,
      payload: {
        instanceId,
        action,
        comment: comment ?? null,
        actorId: user.id,
        delegateToPersonId: action === 'DELEGATE' ? delegateToPersonId : undefined,
        previousStageOrder: instance.currentStageOrder,
        newStatus,
      },
    })
    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      await tx.insert(events).values({
        tenantId:  TENANT_ID,
        eventType: newStatus === 'APPROVED' ? 'workflow.completed' : 'workflow.rejected',
        payload:   { instanceId, finalDecisionBy: user.id, comment: comment ?? null },
      })

      // Activate employee when a backdated-hire approval workflow is fully approved.
      // The workflow instance carries resourceType='persons' and resourceId=personId.
      if (newStatus === 'APPROVED' && instance.resourceType === 'persons' && instance.resourceId) {
        const personId = instance.resourceId

        await tx
          .update(persons)
          .set({
            assignmentStatus: 'ACTIVE',
            updatedBy:        user.id,
            updatedByName:    user.name,
          })
          .where(and(
            eq(persons.tenantId, TENANT_ID),
            eq(persons.id,       personId),
          ))

        await tx
          .update(workerAssignments)
          .set({
            assignmentStatus: 'ACTIVE',
            updatedBy:        user.id,
            updatedByName:    user.name,
          })
          .where(and(
            eq(workerAssignments.tenantId, TENANT_ID),
            eq(workerAssignments.personId, personId),
          ))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'PERSON.ACTIVATED_VIA_WORKFLOW',
          resourceType: 'persons',
          resourceId:   personId,
          oldValues:    { assignmentStatus: 'PENDING_HIRE' },
          newValues:    { assignmentStatus: 'ACTIVE', workflowInstanceId: instanceId },
        }, tx)

        // Auto-promote line manager if this newly active employee is their subordinate.
        const [activatedPerson] = await tx
          .select({ lineManagerId: persons.lineManagerId })
          .from(persons)
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
          .limit(1)
        if (activatedPerson?.lineManagerId) {
          await evaluateManagerRole(activatedPerson.lineManagerId, user, tx)
        }
      }
    }
  })

  return { status: newStatus }
  } catch (e) { translateError(e, 'actOnWorkflowStep') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 6 — updateFormConfiguration  (S4-06)
// Persists the form layout (section ordering + labels) for an
// (entityType, role) pair. The 'ALL' role is the fallback layout used by
// every role that doesn't have a more specific override.
//
// Audit + cache invalidation — Hard Rule 1 + TD-13/14.
// ══════════════════════════════════════════════════════════════════════════════

const FormSectionSchema = z.object({
  sectionCode: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/, 'sectionCode must be UPPER_SNAKE'),
  labelEn:     z.string().min(1).max(200),
  labelAr:     z.string().min(1).max(200),
  fields:      z.array(z.string().min(1).max(80)).default([]),
})

const UpdateFormConfigSchema = z.object({
  entityType: z.string().min(1).max(50),
  role:       z.string().min(1).max(50),
  sections:   z.array(FormSectionSchema).min(1).max(20),
})

export type UpdateFormConfigInput = z.infer<typeof UpdateFormConfigSchema>

export async function updateFormConfiguration(
  input: UpdateFormConfigInput,
): Promise<{ id: string; created: boolean }> {
  try {
  // Only HR_DIRECTOR / SUPER_ADMIN can reshape form layouts (Security spec §2.2).
  const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = UpdateFormConfigSchema.parse(input)

  // Reject duplicate sectionCodes — UNIQUE within a config.
  const codes = new Set<string>()
  for (const s of data.sections) {
    if (codes.has(s.sectionCode)) {
      throw new Error(`duplicate sectionCode: ${s.sectionCode}`)
    }
    codes.add(s.sectionCode)
  }

  let rowId  = ''
  let created = false

  await db.transaction(async tx => {
    const [existing] = await tx
      .select({ id: formConfigurations.id })
      .from(formConfigurations)
      .where(and(
        eq(formConfigurations.tenantId, TENANT_ID),
        eq(formConfigurations.entityType, data.entityType),
        eq(formConfigurations.role, data.role),
      ))
      .limit(1)

    const config = { sections: data.sections }

    if (existing) {
      rowId = existing.id
      await tx
        .update(formConfigurations)
        .set({
          config,
          isActive:        true,
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(formConfigurations.id, existing.id))
    } else {
      const [row] = await tx
        .insert(formConfigurations)
        .values({
          tenantId:      TENANT_ID,
          entityType:    data.entityType,
          role:          data.role,
          config,
          isActive:      true,
          createdBy:     user.id,
          createdByName: user.name,
        })
        .returning({ id: formConfigurations.id })
      rowId = row.id
      created = true
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    created ? 'FORM_CONFIG.CREATED' : 'FORM_CONFIG.UPDATED',
      resourceType: 'form_configurations',
      resourceId:   rowId,
      newValues: {
        entityType: data.entityType,
        role:       data.role,
        sectionCount:  data.sections.length,
        sectionCodes:  data.sections.map(s => s.sectionCode),
      },
    }, tx)
  })

  // Cache holds resolved sections — purge so the next resolveFormConfig
  // hits the DB and picks up the new layout (TD-13/14 align).
  invalidateConfigCache()

  return { id: rowId, created }
  } catch (e) { translateError(e, 'updateFormConfiguration') }
}

// ══════════════════════════════════════════════════════════════════════════════
// STUBS — remaining unimplemented public-API entries.
// Implemented as the consuming entity modules ship (D-07 carry-forward).
// ══════════════════════════════════════════════════════════════════════════════

// ── S10-01 getPolicySettings ───────────────────────────────────────────────

export interface PolicySettingRow {
  id:            string
  settingKey:    string
  settingNameEn: string
  settingNameAr: string | null
  valueType:     string
  settingValue:  string
  moduleCode:    string
  isOverridable: boolean
  effectiveFrom: string
  effectiveTo:   string | null
  notes:         string | null
}

export async function getPolicySettings(legalEntityId?: string): Promise<PolicySettingRow[]> {
  try {
  await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  const entityId = legalEntityId ?? TENANT_ID

  return db
    .select({
      id:            policySettings.id,
      settingKey:    policySettings.settingKey,
      settingNameEn: policySettings.settingNameEn,
      settingNameAr: policySettings.settingNameAr,
      valueType:     policySettings.valueType,
      settingValue:  policySettings.settingValue,
      moduleCode:    policySettings.moduleCode,
      isOverridable: policySettings.isOverridable,
      effectiveFrom: policySettings.effectiveFrom,
      effectiveTo:   policySettings.effectiveTo,
      notes:         policySettings.notes,
    })
    .from(policySettings)
    .where(and(
      eq(policySettings.tenantId, TENANT_ID),
      sql`(${policySettings.legalEntityId} IS NULL OR ${policySettings.legalEntityId} = ${entityId})`,
    ))
    .orderBy(asc(policySettings.moduleCode), asc(policySettings.settingKey))
  } catch (e) { translateError(e, 'getPolicySettings') }
}

// ── S10-04 getNotificationTemplates ───────────────────────────────────────

export interface NotificationTemplateRow {
  id:             string
  templateCode:   string
  templateNameEn: string
  eventType:      string
  channel:        string
  language:       string
  subjectEn:      string | null
  subjectAr:      string | null
  bodyEn:         string
  bodyAr:         string | null
  recipientRoles: string[]
  isActive:       boolean
}

export async function getNotificationTemplates(): Promise<NotificationTemplateRow[]> {
  try {
  await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])

  return db
    .select({
      id:             notificationTemplates.id,
      templateCode:   notificationTemplates.templateCode,
      templateNameEn: notificationTemplates.templateNameEn,
      eventType:      notificationTemplates.eventType,
      channel:        notificationTemplates.channel,
      language:       notificationTemplates.language,
      subjectEn:      notificationTemplates.subjectEn,
      subjectAr:      notificationTemplates.subjectAr,
      bodyEn:         notificationTemplates.bodyEn,
      bodyAr:         notificationTemplates.bodyAr,
      recipientRoles: notificationTemplates.recipientRoles,
      isActive:       notificationTemplates.isActive,
    })
    .from(notificationTemplates)
    .where(eq(notificationTemplates.tenantId, TENANT_ID))
    .orderBy(asc(notificationTemplates.eventType), asc(notificationTemplates.channel))
  } catch (e) { translateError(e, 'getNotificationTemplates') }
}

// ── S10-03 getCustomFields ─────────────────────────────────────────────────

export interface CustomFieldRow {
  id:           string
  objectType:   string
  apiName:      string
  labelEn:      string
  labelAr:      string | null
  dataType:     string
  isRequired:   boolean
  isSearchable: boolean
  isEncrypted:  boolean
  displayOrder: number
  sectionCode:  string | null
  isActive:     boolean
}

export async function getCustomFields(objectType?: string): Promise<CustomFieldRow[]> {
  try {
  await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])

  return db
    .select({
      id:           customFieldDefinitions.id,
      objectType:   customFieldDefinitions.objectType,
      apiName:      customFieldDefinitions.apiName,
      labelEn:      customFieldDefinitions.labelEn,
      labelAr:      customFieldDefinitions.labelAr,
      dataType:     customFieldDefinitions.dataType,
      isRequired:   customFieldDefinitions.isRequired,
      isSearchable: customFieldDefinitions.isSearchable,
      isEncrypted:  customFieldDefinitions.isEncrypted,
      displayOrder: customFieldDefinitions.displayOrder,
      sectionCode:  customFieldDefinitions.sectionCode,
      isActive:     customFieldDefinitions.isActive,
    })
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.tenantId, TENANT_ID),
      objectType ? eq(customFieldDefinitions.objectType, objectType) : undefined,
    ))
    .orderBy(asc(customFieldDefinitions.objectType), asc(customFieldDefinitions.displayOrder))
  } catch (e) { translateError(e, 'getCustomFields') }
}

// ── S10-06 getLeaveRuleSets ────────────────────────────────────────────────

export interface LeaveRuleSetRow {
  id:                  string
  ruleSetCode:         string
  ruleSetNameEn:       string
  ruleSetNameAr:       string | null
  entityTypeScope:     string | null
  nationalityScope:    string | null
  employmentTypeScope: string | null
  effectiveFrom:       string
  effectiveTo:         string | null
  isActive:            boolean
  isDefault:           boolean
  lineCount:           number
}

export async function getLeaveRuleSets(): Promise<LeaveRuleSetRow[]> {
  try {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const rows = await db
    .select({
      id:                  leaveRuleSets.id,
      ruleSetCode:         leaveRuleSets.ruleSetCode,
      ruleSetNameEn:       leaveRuleSets.ruleSetNameEn,
      ruleSetNameAr:       leaveRuleSets.ruleSetNameAr,
      entityTypeScope:     leaveRuleSets.entityTypeScope,
      nationalityScope:    leaveRuleSets.nationalityScope,
      employmentTypeScope: leaveRuleSets.employmentTypeScope,
      effectiveFrom:       leaveRuleSets.effectiveFrom,
      effectiveTo:         leaveRuleSets.effectiveTo,
      isActive:            leaveRuleSets.isActive,
      isDefault:           leaveRuleSets.isDefault,
      lineCount:           sqlCount(leaveRuleLines.id),
    })
    .from(leaveRuleSets)
    .leftJoin(leaveRuleLines, eq(leaveRuleLines.leaveRuleSetId, leaveRuleSets.id))
    .where(eq(leaveRuleSets.tenantId, TENANT_ID))
    .groupBy(leaveRuleSets.id)
    .orderBy(desc(leaveRuleSets.isDefault), asc(leaveRuleSets.ruleSetCode))

  return rows.map(r => ({ ...r, lineCount: Number(r.lineCount) }))
  } catch (e) { translateError(e, 'getLeaveRuleSets') }
}

// ── remaining stubs (implemented in later sprints) ─────────────────────────

const NOT_IMPLEMENTED = (name: string) => (): never => {
  throw new Error(`NOT_IMPLEMENTED: ${name} — scheduled for a later sprint`)
}

export const updateCustomField          = NOT_IMPLEMENTED('updateCustomField')
export const saveCustomFieldValue       = NOT_IMPLEMENTED('saveCustomFieldValue')
export const getCustomFieldValues       = NOT_IMPLEMENTED('getCustomFieldValues')
export const createLeaveRuleSet         = NOT_IMPLEMENTED('createLeaveRuleSet')
export const updateLeaveRuleSet         = NOT_IMPLEMENTED('updateLeaveRuleSet')
export const resolveLeaveRule           = NOT_IMPLEMENTED('resolveLeaveRule')
export const createNotificationSchedule = NOT_IMPLEMENTED('createNotificationSchedule')
export const getFormConfiguration       = NOT_IMPLEMENTED('getFormConfiguration')

// ══════════════════════════════════════════════════════════════════════════════
// 7 — Workflow templates CRUD (S9-01)
// HR_DIRECTOR / SUPER_ADMIN only. Stages are validated via
// assertWorkflowRoleValid + assertEscalationRoleHigher (Hard Rule 7 — every
// workflow rule cited in code: BR-WF-001..003). Audit row writes inside the
// same transaction as the template + stages (Hard Rule 1).
// ══════════════════════════════════════════════════════════════════════════════

const WorkflowStageInputSchema = z.object({
  stageOrder:        z.number().int().min(1).max(10), // BR-WF-002: max 10 stages
  stageNameEn:       z.string().min(1).max(200),
  stageNameAr:       z.string().min(1).max(200),
  approverRoleCode:  z.string().min(1).max(50),
  stageSlaHours:     z.number().int().min(1).max(720),
  escalationRoleCode: z.string().min(1).max(50).nullable().optional(),
  canDelegate:       z.boolean().default(true),
  isOptional:        z.boolean().default(false),
  actionType:        z.enum(['APPROVE_REJECT', 'ACKNOWLEDGE', 'INFO_ONLY']).default('APPROVE_REJECT'),
})

const SaveWorkflowTemplateSchema = z.object({
  legalEntityId:   z.string().uuid().nullable().optional(),
  workflowCode:    z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/, 'workflowCode must be UPPER_SNAKE / dash'),
  workflowNameEn:  z.string().min(1).max(200),
  workflowNameAr:  z.string().min(1).max(200),
  triggerEvent:    z.enum([
    'HIRE','TRANSFER','LEAVE_REQUEST','LEAVE','SALARY_REVISION',
    'TERMINATION','DEPENDENT_ADD','DOCUMENT_VERIFY','OVERTIME','EXIT_CLEARANCE',
    'BACKDATED_HIRE',
  ]),
  approvalMode:    z.enum(['SEQUENTIAL','PARALLEL']).default('SEQUENTIAL'),
  slaHours:        z.number().int().min(1).max(2160).default(48),
  escalationHours: z.number().int().min(1).max(2160).default(72),
  isActive:        z.boolean().default(true),
  stages: z.array(WorkflowStageInputSchema).min(1).max(10), // BR-WF-002
})

export type SaveWorkflowTemplateInput = z.infer<typeof SaveWorkflowTemplateSchema>

function validateStages(stages: SaveWorkflowTemplateInput['stages']): void {
  // BR-WF-002: stage_order must be unique 1..N contiguous.
  const orders = stages.map(s => s.stageOrder).sort((a, b) => a - b)
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      throw new Error(`INVALID_STAGES: stage_order must be contiguous 1..${orders.length} (got ${orders.join(',')})`)
    }
  }
  // BR-WF-001: all approver roles must be in VALID_APPROVER_ROLES; escalation
  // must outrank the step role when supplied.
  for (const s of stages) {
    assertWorkflowRoleValid(s.approverRoleCode)
    if (s.escalationRoleCode) {
      assertEscalationRoleHigher(s.approverRoleCode, s.escalationRoleCode)
    }
  }
}

export async function createWorkflowTemplate(
  input: SaveWorkflowTemplateInput,
): Promise<{ id: string }> {
  try {
  // BR-WF-003: HR_DIRECTOR / SUPER_ADMIN only — workflow templates are policy artefacts.
  const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = SaveWorkflowTemplateSchema.parse(input)
  validateStages(data.stages)

  let templateId = ''
  await db.transaction(async tx => {
    const [row] = await tx
      .insert(workflowDefinitions)
      .values({
        tenantId:        TENANT_ID,
        legalEntityId:   data.legalEntityId ?? null,
        workflowCode:    data.workflowCode,
        workflowNameEn:  data.workflowNameEn,
        workflowNameAr:  data.workflowNameAr,
        triggerEvent:    data.triggerEvent,
        approvalMode:    data.approvalMode,
        slaHours:        data.slaHours,
        escalationHours: data.escalationHours,
        isActive:        data.isActive,
        version:         1,
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: workflowDefinitions.id })
    templateId = row.id

    for (const s of data.stages) {
      await tx
        .insert(workflowStages)
        .values({
          tenantId:             TENANT_ID,
          workflowDefinitionId: templateId,
          stageOrder:           s.stageOrder,
          stageNameEn:          s.stageNameEn,
          stageNameAr:          s.stageNameAr,
          approverType:         'ROLE',
          approverRoleCode:     s.approverRoleCode,
          escalationRoleCode:   s.escalationRoleCode ?? null,
          stageSlaHours:        s.stageSlaHours,
          canDelegate:          s.canDelegate,
          isOptional:           s.isOptional,
          actionType:           s.actionType ?? 'APPROVE_REJECT',
          createdBy:            user.id,
          createdByName:        user.name,
        })
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId ?? undefined,
      channel:       'WEB',
      eventType:     'WORKFLOW_TEMPLATE.CREATED',
      resourceType:  'workflow_definitions',
      resourceId:    templateId,
      entityId:      data.legalEntityId ?? undefined,
      newValues: {
        workflowCode:   data.workflowCode,
        triggerEvent:   data.triggerEvent,
        stageCount:     data.stages.length,
        approvalMode:   data.approvalMode,
        slaHours:       data.slaHours,
      },
    }, tx)
  })

  invalidateConfigCache()
  return { id: templateId }
  } catch (e) { translateError(e, 'createWorkflowTemplate') }
}

export async function updateWorkflowTemplate(
  id: string,
  input: SaveWorkflowTemplateInput,
): Promise<{ id: string }> {
  try {
  // BR-WF-003: HR_DIRECTOR / SUPER_ADMIN only.
  const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = SaveWorkflowTemplateSchema.parse(input)
  validateStages(data.stages)

  const [existing] = await db
    .select()
    .from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.tenantId, TENANT_ID), eq(workflowDefinitions.id, id)))
    .limit(1)
  if (!existing) throw new Error(`NOT_FOUND: workflow template ${id}`)

  await db.transaction(async tx => {
    await tx
      .update(workflowDefinitions)
      .set({
        workflowNameEn:  data.workflowNameEn,
        workflowNameAr:  data.workflowNameAr,
        triggerEvent:    data.triggerEvent,
        approvalMode:    data.approvalMode,
        slaHours:        data.slaHours,
        escalationHours: data.escalationHours,
        isActive:        data.isActive,
        version:         existing.version + 1,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(workflowDefinitions.id, id))

    // Replace stages — Hard Rule 2 says HR records are never deleted, but
    // workflow_stages is a config artefact, not an HR record. The new stage
    // set fully supersedes the old. Audit log captures the transition.
    //
    // FK safety: workflow_instances.current_stage_id → workflow_stages.id is
    // RESTRICT by default.  Null it out on any in-flight instances before
    // deleting the old stage rows, so the constraint is never violated.
    await tx.execute(
      sql`UPDATE workflow_instances
          SET    current_stage_id = NULL
          WHERE  current_stage_id IN (
            SELECT id FROM workflow_stages
            WHERE  workflow_definition_id = ${id}
          )`,
    )
    await tx.delete(workflowStages).where(eq(workflowStages.workflowDefinitionId, id))

    for (const s of data.stages) {
      await tx
        .insert(workflowStages)
        .values({
          tenantId:             TENANT_ID,
          workflowDefinitionId: id,
          stageOrder:           s.stageOrder,
          stageNameEn:          s.stageNameEn,
          stageNameAr:          s.stageNameAr,
          approverType:         'ROLE',
          approverRoleCode:     s.approverRoleCode,
          escalationRoleCode:   s.escalationRoleCode ?? null,
          stageSlaHours:        s.stageSlaHours,
          canDelegate:          s.canDelegate,
          isOptional:           s.isOptional,
          actionType:           s.actionType ?? 'APPROVE_REJECT',
          createdBy:            user.id,
          createdByName:        user.name,
        })
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: existing.legalEntityId ?? undefined,
      channel:       'WEB',
      eventType:     'WORKFLOW_TEMPLATE.UPDATED',
      resourceType:  'workflow_definitions',
      resourceId:    id,
      entityId:      existing.legalEntityId ?? undefined,
      oldValues:     {
        version:        existing.version,
        triggerEvent:   existing.triggerEvent,
        slaHours:       existing.slaHours,
      },
      newValues: {
        version:        existing.version + 1,
        triggerEvent:   data.triggerEvent,
        stageCount:     data.stages.length,
        slaHours:       data.slaHours,
      },
    }, tx)
  })

  invalidateConfigCache()
  return { id }
  } catch (e) { translateError(e, 'updateWorkflowTemplate') }
}

// ── Disable / Enable workflow template ────────────────────────────────────────

export async function disableWorkflowTemplate(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
  try {
    const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    await db
      .update(workflowDefinitions)
      .set({
        isActive:        false,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(and(eq(workflowDefinitions.tenantId, TENANT_ID), eq(workflowDefinitions.id, id)))
    invalidateConfigCache()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to disable template' }
  }
  } catch (e) { translateError(e, 'disableWorkflowTemplate') }
}

export async function enableWorkflowTemplate(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
  try {
    const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    await db
      .update(workflowDefinitions)
      .set({
        isActive:        true,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(and(eq(workflowDefinitions.tenantId, TENANT_ID), eq(workflowDefinitions.id, id)))
    invalidateConfigCache()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to enable template' }
  }
  } catch (e) { translateError(e, 'enableWorkflowTemplate') }
}

export async function getWorkflowTemplates(
  legalEntityId?: string,
): Promise<Array<{
  id: string
  workflowCode: string
  workflowNameEn: string
  workflowNameAr: string | null
  triggerEvent: string
  approvalMode: string
  slaHours: number
  escalationHours: number
  isActive: boolean
  version: number
  legalEntityId: string | null
  stageCount: number
}>> {
  try {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const conds = [eq(workflowDefinitions.tenantId, TENANT_ID)]
  if (legalEntityId) conds.push(eq(workflowDefinitions.legalEntityId, legalEntityId))
  const rows = await db
    .select({
      id:              workflowDefinitions.id,
      workflowCode:    workflowDefinitions.workflowCode,
      workflowNameEn:  workflowDefinitions.workflowNameEn,
      workflowNameAr:  workflowDefinitions.workflowNameAr,
      triggerEvent:    workflowDefinitions.triggerEvent,
      approvalMode:    workflowDefinitions.approvalMode,
      slaHours:        workflowDefinitions.slaHours,
      escalationHours: workflowDefinitions.escalationHours,
      isActive:        workflowDefinitions.isActive,
      version:         workflowDefinitions.version,
      legalEntityId:   workflowDefinitions.legalEntityId,
    })
    .from(workflowDefinitions)
    .where(and(...conds))
    .orderBy(workflowDefinitions.workflowCode)

  // Per-template stage count; one query per template is fine at config-table
  // scale (~10 templates per tenant). Collapses to a GROUP BY when this grows.
  const out: typeof rows[number] extends infer R ? Array<R & { stageCount: number }> : never = []
  for (const r of rows) {
    const [c] = await db
      .select({ n: sqlCount() })
      .from(workflowStages)
      .where(eq(workflowStages.workflowDefinitionId, r.id))
    out.push({ ...r, stageCount: Number(c?.n ?? 0) })
  }
  return out
  } catch (e) { translateError(e, 'getWorkflowTemplates') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 8 — getPendingApprovalsForCurrentUser (S9-02)
// @deprecated — V1 role-based inbox. Superseded by getPendingApprovalsV2
// in modules/workflow/queries.ts (person-UUID-based, v2 engine).
// Retained only because integration tests reference it directly.
// ══════════════════════════════════════════════════════════════════════════════

export interface PendingApprovalRow {
  instanceId:        string
  workflowCode:      string
  workflowNameEn:    string
  workflowNameAr:    string | null
  triggerEvent:      string
  resourceType:      string
  resourceId:        string
  initiatorPersonId: string
  initiatorNameEn:   string | null
  initiatorNameAr:   string | null
  startedAt:         Date
  slaDeadline:       Date | null
  currentStageOrder: number
  currentStageNameEn: string | null
  currentStageNameAr: string | null
  approverRoleCode:  string | null
  stageSlaHours:     number
  isBreached:        boolean
}

export async function getPendingApprovalsForCurrentUser(): Promise<PendingApprovalRow[]> {
  try {
  const user = await getCurrentUser()

  // CF-02: Resolve ongoing approval_delegations for this user as delegate.
  // If another person (delegator) has an active delegation covering today,
  // this user inherits visibility of that delegator's role-based approvals.
  // Map: approverRoleCode → Set<triggerEvent> | null (null = all scopes).
  type ScopeSet = Set<string> | null
  const inheritedRoles = new Map<string, ScopeSet>()

  if (user.personId) {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const activeDelegations = await db
      .select({
        delegatorRole: userAccounts.avaniisRole,
        scopeTypes:    approvalDelegations.scopeTypes,
      })
      .from(approvalDelegations)
      .innerJoin(
        userAccounts,
        eq(userAccounts.personId, approvalDelegations.delegatorId),
      )
      .where(
        and(
          eq(approvalDelegations.tenantId, TENANT_ID),
          eq(approvalDelegations.delegateId, user.personId),
          eq(approvalDelegations.isActive, true),
          lte(approvalDelegations.delegationFrom, today),
          gte(approvalDelegations.delegationTo, today),
        ),
      )

    for (const d of activeDelegations) {
      const role = d.delegatorRole
      // null scopeTypes means "all trigger events"
      if (d.scopeTypes === null || d.scopeTypes.length === 0) {
        inheritedRoles.set(role, null) // null = all scopes
      } else {
        const existing = inheritedRoles.get(role)
        if (existing === undefined) {
          inheritedRoles.set(role, new Set(d.scopeTypes))
        } else if (existing !== null) {
          // merge scope sets; null (all-scopes) always wins
          for (const s of d.scopeTypes) existing.add(s)
        }
        // if existing === null (all-scopes already set), leave it
      }
    }
  }

  // Fetch in-flight instances + current stage + workflow definition + initiator.
  // Drizzle doesn't support ergonomic 4-way joins through inferred columns, so
  // we structure as a single SELECT with explicit refs.
  const rows = await db
    .select({
      instanceId:               workflowInstances.id,
      tenantId:                 workflowInstances.tenantId,
      legalEntityId:            workflowInstances.legalEntityId,
      resourceType:             workflowInstances.resourceType,
      resourceId:               workflowInstances.resourceId,
      initiatorPersonId:        workflowInstances.initiatedByPersonId,
      startedAt:                workflowInstances.startedAt,
      slaDeadline:              workflowInstances.slaDeadline,
      status:                   workflowInstances.status,
      currentStageId:           workflowInstances.currentStageId,
      currentStageOrder:        workflowInstances.currentStageOrder,
      currentDelegateePersonId: workflowInstances.currentDelegateePersonId,
      workflowCode:             workflowDefinitions.workflowCode,
      workflowNameEn:           workflowDefinitions.workflowNameEn,
      workflowNameAr:           workflowDefinitions.workflowNameAr,
      triggerEvent:             workflowDefinitions.triggerEvent,
      stageNameEn:              workflowStages.stageNameEn,
      stageNameAr:              workflowStages.stageNameAr,
      approverRoleCode:         workflowStages.approverRoleCode,
      stageSlaHours:            workflowStages.stageSlaHours,
    })
    .from(workflowInstances)
    .leftJoin(workflowDefinitions, eq(workflowInstances.workflowDefinitionId, workflowDefinitions.id))
    .leftJoin(workflowStages, eq(workflowInstances.currentStageId, workflowStages.id))
    .where(
      and(
        eq(workflowInstances.tenantId, TENANT_ID),
        // 'PENDING' and 'IN_PROGRESS' are both in-flight — actOnWorkflowStep
        // accepts either. Exclude APPROVED / REJECTED / CANCELLED / ESCALATED.
        // Drizzle's `or` would help but we use an inline status check.
      ),
    )

  // Filter & shape in app code — collapses to a SQL WHERE if this dashboard
  // grows past a few hundred rows per role.
  const now = Date.now()
  const out: PendingApprovalRow[] = []
  for (const r of rows) {
    if (r.status !== 'PENDING' && r.status !== 'IN_PROGRESS') continue
    // SUPER_ADMIN sees every entity; everyone else only their own.
    if (user.role !== 'SUPER_ADMIN' && r.legalEntityId !== user.legalEntityId) continue

    // Role gate — three ways to see an instance:
    // 1. Per-instance one-shot delegation (S9-03): caller is the named delegate.
    // 2. Direct role match (or admin): no per-instance delegate set, role matches.
    // 3. CF-02 ongoing approval_delegation: delegator's role matches approverRoleCode
    //    and no per-instance delegation overrides it, and scope allows this trigger.
    const isDelegate = r.currentDelegateePersonId === user.id
    const isRoleApprover =
      !r.currentDelegateePersonId &&
      (user.role === 'HR_ADMIN' || user.role === 'SUPER_ADMIN' || r.approverRoleCode === user.role ||
       (user.role === 'MANAGER' && r.approverRoleCode === 'LINE_MANAGER'))

    // CF-02: ongoing delegation check — only when no per-instance delegate is set
    let isOngoingDelegate = false
    if (!r.currentDelegateePersonId && r.approverRoleCode) {
      const scopeSet = inheritedRoles.get(r.approverRoleCode)
      if (scopeSet !== undefined) {
        // scopeSet === null means all scopes; otherwise check triggerEvent membership
        isOngoingDelegate = scopeSet === null || (r.triggerEvent !== null && scopeSet.has(r.triggerEvent))
      }
    }

    if (!isDelegate && !isRoleApprover && !isOngoingDelegate) continue

    out.push({
      instanceId:         r.instanceId,
      workflowCode:       r.workflowCode ?? '',
      workflowNameEn:     r.workflowNameEn ?? '',
      workflowNameAr:     r.workflowNameAr,
      triggerEvent:       r.triggerEvent ?? '',
      resourceType:       r.resourceType,
      resourceId:         r.resourceId,
      initiatorPersonId:  r.initiatorPersonId,
      initiatorNameEn:    null, // resolved below in a small batch lookup
      initiatorNameAr:    null,
      startedAt:          r.startedAt,
      slaDeadline:        r.slaDeadline,
      currentStageOrder:  r.currentStageOrder ?? 0,
      currentStageNameEn: r.stageNameEn ?? null,
      currentStageNameAr: r.stageNameAr ?? null,
      approverRoleCode:   r.approverRoleCode ?? null,
      stageSlaHours:      r.stageSlaHours ?? 0,
      isBreached:         r.slaDeadline ? r.slaDeadline.getTime() < now : false,
    })
  }

  // Batch resolve initiator names. One round-trip even for hundreds of rows.
  if (out.length > 0) {
    const ids = Array.from(new Set(out.map(r => r.initiatorPersonId)))
    const personRows = await db
      .select({
        id:         persons.id,
        fullNameEn: persons.fullNameEn,
        fullNameAr: persons.fullNameAr,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, ids)))
    const byId = new Map(personRows.map(p => [p.id, p]))
    for (const r of out) {
      const p = byId.get(r.initiatorPersonId)
      r.initiatorNameEn = p?.fullNameEn ?? null
      r.initiatorNameAr = p?.fullNameAr ?? null
    }
  }

  out.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  return out
  } catch (e) { translateError(e, 'getPendingApprovalsForCurrentUser') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 10 — Approval delegations CRUD (S9-04)
// Pre-arranged delegations: an approver hands off all (or scoped) approvals
// to another person for a date window — typically while on leave. Different
// from S9-03's per-instance one-shot delegation.
//
// Hard Rule 2: rows are NEVER deleted. "Deactivate" sets is_active=false.
// ══════════════════════════════════════════════════════════════════════════════

const CreateApprovalDelegationSchema = z.object({
  delegateId:    z.string().uuid(),
  delegationFrom: hrDateString(),
  delegationTo:   hrDateString(),
  // NULL/empty = all transaction types; otherwise a list of triggerEvent codes.
  scopeTypes:    z.array(z.string().min(1).max(50)).max(20).default([]),
  reason:        z.string().max(500).optional(),
}).refine(d => d.delegationFrom <= d.delegationTo, {
  path: ['delegationTo'],
  message: 'delegationTo must be on or after delegationFrom',
})

export type CreateApprovalDelegationInput = z.infer<typeof CreateApprovalDelegationSchema>

export async function createApprovalDelegation(
  input: CreateApprovalDelegationInput,
): Promise<{ id: string }> {
  try {
  // Any role with an approver-eligible session can create a delegation.
  // The delegator is always the caller — no admin override (would let an
  // attacker forge approvals on behalf of someone else).
  const user = await getCurrentUser()
  if (!user.personId) {
    throw new Error('NO_PERSON_LINK: account is not linked to a person record')
  }
  const data = CreateApprovalDelegationSchema.parse(input)

  if (data.delegateId === user.personId) {
    throw new Error('DELEGATE_TO_SELF_FORBIDDEN: cannot delegate approvals to yourself')
  }

  // Both delegator + delegate must belong to the same legal entity (Phase 1
  // guard — cross-entity delegation needs explicit policy review).
  const [delegate] = await db
    .select({ id: persons.id, legalEntityId: persons.legalEntityId, isActive: persons.isActive })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.delegateId)))
    .limit(1)
  if (!delegate || !delegate.isActive) {
    throw new Error('NOT_FOUND: delegate is not an active person')
  }
  if (delegate.legalEntityId !== user.legalEntityId && user.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: cannot delegate across legal entities — cross-entity delegation is not permitted')
  }

  let newId = ''
  await db.transaction(async tx => {
    const [row] = await tx
      .insert(approvalDelegations)
      .values({
        tenantId:       TENANT_ID,
        delegatorId:    user.personId!,
        delegateId:     data.delegateId,
        legalEntityId:  delegate.legalEntityId,
        delegationFrom: data.delegationFrom,
        delegationTo:   data.delegationTo,
        // Empty array stored as NULL so the SQL `IS NULL` predicate resolves
        // "applies to all" without needing array containment checks.
        scopeTypes:     data.scopeTypes.length > 0 ? data.scopeTypes : null,
        reason:         data.reason,
        isActive:       true,
        createdBy:      user.id,
        createdByName:  user.name,
      })
      .returning({ id: approvalDelegations.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: delegate.legalEntityId,
      channel:       'WEB',
      eventType:     'APPROVAL_DELEGATION.CREATED',
      resourceType:  'approval_delegations',
      resourceId:    newId,
      entityId:      delegate.legalEntityId,
      newValues: {
        delegatorId:    user.personId,
        delegateId:     data.delegateId,
        delegationFrom: data.delegationFrom,
        delegationTo:   data.delegationTo,
        scopeTypes:     data.scopeTypes,
      },
    }, tx)
  })

  return { id: newId }
  } catch (e) { translateError(e, 'createApprovalDelegation') }
}

export async function deactivateApprovalDelegation(
  id: string,
): Promise<{ success: true }> {
  try {
  // Only the delegator (or HR_ADMIN / SUPER_ADMIN as override) can deactivate.
  // Hard Rule 2: never delete; flip is_active to false.
  const user = await getCurrentUser()
  const [existing] = await db
    .select()
    .from(approvalDelegations)
    .where(and(eq(approvalDelegations.tenantId, TENANT_ID), eq(approvalDelegations.id, id)))
    .limit(1)
  if (!existing) throw new Error(`NOT_FOUND: approval delegation ${id}`)

  const isOwner = !!user.personId && existing.delegatorId === user.personId
  const isAdmin = user.role === 'HR_ADMIN' || user.role === 'SUPER_ADMIN'
  if (!isOwner && !isAdmin) {
    throw new Error('FORBIDDEN: only the delegator (or an admin) can deactivate this delegation')
  }
  if (!existing.isActive) {
    return { success: true }
  }

  await db.transaction(async tx => {
    await tx
      .update(approvalDelegations)
      .set({
        isActive:        false,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(approvalDelegations.id, id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: existing.legalEntityId,
      channel:       'WEB',
      eventType:     'APPROVAL_DELEGATION.DEACTIVATED',
      resourceType:  'approval_delegations',
      resourceId:    id,
      entityId:      existing.legalEntityId,
      oldValues:     { isActive: true },
      newValues:     { isActive: false },
    }, tx)
  })

  return { success: true }
  } catch (e) { translateError(e, 'deactivateApprovalDelegation') }
}

export interface ApprovalDelegationRow {
  id:              string
  direction:       'OUTGOING' | 'INCOMING' // i.e. you delegated, or you received
  delegatorPersonId: string
  delegatorNameEn:   string | null
  delegatorNameAr:   string | null
  delegatePersonId:  string
  delegateNameEn:    string | null
  delegateNameAr:    string | null
  delegationFrom:    string
  delegationTo:      string
  scopeTypes:        string[] | null
  reason:            string | null
  isActive:          boolean
  createdDate:       Date
}

export async function listApprovalDelegations(): Promise<ApprovalDelegationRow[]> {
  try {
  const user = await getCurrentUser()
  if (!user.personId) return []

  const conds = [eq(approvalDelegations.tenantId, TENANT_ID)]
  // Non-admins see only their own outgoing + incoming delegations.
  // Admin override: HR_ADMIN / SUPER_ADMIN see all delegations in their entity.
  const rows = await db
    .select({
      id:                 approvalDelegations.id,
      delegatorId:        approvalDelegations.delegatorId,
      delegateId:         approvalDelegations.delegateId,
      legalEntityId:      approvalDelegations.legalEntityId,
      delegationFrom:     approvalDelegations.delegationFrom,
      delegationTo:       approvalDelegations.delegationTo,
      scopeTypes:         approvalDelegations.scopeTypes,
      reason:             approvalDelegations.reason,
      isActive:           approvalDelegations.isActive,
      createdDate:        approvalDelegations.createdDate,
    })
    .from(approvalDelegations)
    .where(and(...conds))
    .orderBy(approvalDelegations.delegationFrom)

  // Filter by visibility + entity scope.
  const visible = rows.filter(r => {
    if (user.role === 'SUPER_ADMIN') return true
    if (r.legalEntityId !== user.legalEntityId) return false
    if (user.role === 'HR_ADMIN') return true
    return r.delegatorId === user.personId || r.delegateId === user.personId
  })

  if (visible.length === 0) return []

  const personIds = Array.from(new Set(visible.flatMap(r => [r.delegatorId, r.delegateId])))
  const personRows = await db
    .select({
      id:         persons.id,
      fullNameEn: persons.fullNameEn,
      fullNameAr: persons.fullNameAr,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, personIds)))
  const byId = new Map(personRows.map(p => [p.id, p]))

  return visible.map(r => ({
    id:                 r.id,
    direction:          r.delegatorId === user.personId ? 'OUTGOING' : 'INCOMING',
    delegatorPersonId:  r.delegatorId,
    delegatorNameEn:    byId.get(r.delegatorId)?.fullNameEn ?? null,
    delegatorNameAr:    byId.get(r.delegatorId)?.fullNameAr ?? null,
    delegatePersonId:   r.delegateId,
    delegateNameEn:     byId.get(r.delegateId)?.fullNameEn ?? null,
    delegateNameAr:     byId.get(r.delegateId)?.fullNameAr ?? null,
    delegationFrom:     r.delegationFrom,
    delegationTo:       r.delegationTo,
    scopeTypes:         r.scopeTypes ?? null,
    reason:             r.reason,
    isActive:           r.isActive,
    createdDate:        r.createdDate,
  }))
  } catch (e) { translateError(e, 'listApprovalDelegations') }
}

// ══════════════════════════════════════════════════════════════════════════════
// 9 — getWorkflowInstance (S9-03 / S9-06)
// Loads a single workflow instance with its stage, definition, initiator, and
// the chain JSON's event log. Read-only; entity-scoped.
// ══════════════════════════════════════════════════════════════════════════════

export interface WorkflowChainEvent {
  kind:               'STAGE_DECISION'
  action:             'APPROVE' | 'REJECT' | 'DELEGATE'
  stageOrder:         number | null
  actorId:            string
  actorName:          string
  actorRole:          string
  comment:            string | null
  delegateToPersonId?: string
  at:                 string
}

export interface WorkflowChainStageSnapshot {
  stageOrder:       number
  stageNameEn:      string | null
  approverType:     string | null
  approverRoleCode: string | null
  stageSlaHours:    number | null
}

export interface WorkflowInstanceDetail {
  instance: {
    id:                       string
    workflowCode:             string
    workflowNameEn:           string
    workflowNameAr:           string | null
    triggerEvent:             string
    resourceType:             string
    resourceId:               string
    legalEntityId:            string
    status:                   string
    startedAt:                Date
    completedAt:              Date | null
    slaDeadline:              Date | null
    currentStageOrder:        number
    currentStageNameEn:       string | null
    currentStageNameAr:       string | null
    approverRoleCode:         string | null
    stageSlaHours:            number | null
    currentDelegateePersonId: string | null
    currentDelegateeNameEn:   string | null
    currentDelegateeNameAr:   string | null
    initiatorPersonId:        string
    initiatorNameEn:          string | null
    initiatorNameAr:          string | null
    finalDecisionBy:          string | null
    finalDecisionNote:        string | null
    rejectionReason:          string | null
  }
  events: WorkflowChainEvent[]
  /** Snapshot of resolved approver stages at initiation time. */
  stagesSnapshot: WorkflowChainStageSnapshot[]
  /** True when the current session user can act on the current step. */
  callerCanAct: boolean
  /** True when the instance was delegated to the current user. */
  isDelegate:   boolean
}

export async function getWorkflowInstance(
  instanceId: string,
): Promise<WorkflowInstanceDetail | null> {
  try {
  const user = await getCurrentUser()

  const [row] = await db
    .select({
      i: workflowInstances,
      d: workflowDefinitions,
      s: workflowStages,
    })
    .from(workflowInstances)
    .leftJoin(workflowDefinitions, eq(workflowInstances.workflowDefinitionId, workflowDefinitions.id))
    .leftJoin(workflowStages, eq(workflowInstances.currentStageId, workflowStages.id))
    .where(and(eq(workflowInstances.tenantId, TENANT_ID), eq(workflowInstances.id, instanceId)))
    .limit(1)
  if (!row) return null

  // Entity scope.
  if (user.role !== 'SUPER_ADMIN' && row.i.legalEntityId !== user.legalEntityId) {
    throw new Error('FORBIDDEN: cross-entity workflow read denied')
  }

  // Resolve initiator + delegatee names.
  const peopleIds = [row.i.initiatedByPersonId, row.i.currentDelegateePersonId].filter(
    (v): v is string => !!v,
  )
  const personRows = peopleIds.length > 0
    ? await db
        .select({ id: persons.id, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, peopleIds)))
    : []
  const byId = new Map(personRows.map(p => [p.id, p]))

  // Tolerate both new shape `{ stages, events }` and legacy `ResolvedStage[]`.
  const rawChain = row.i.approvalChainJson
  const events_log: WorkflowChainEvent[] = Array.isArray(rawChain)
    ? []
    : Array.isArray((rawChain as { events?: WorkflowChainEvent[] } | null)?.events)
      ? (rawChain as { events: WorkflowChainEvent[] }).events
      : []
  const rawStages = Array.isArray(rawChain)
    ? (rawChain as unknown[])
    : (rawChain as { stages?: unknown[] } | null)?.stages ?? []
  const stagesSnapshot: WorkflowChainStageSnapshot[] = (rawStages as Array<Record<string, unknown>>).map(s => ({
    stageOrder:       Number(s.stageOrder ?? 0),
    stageNameEn:      typeof s.stageNameEn === 'string' ? s.stageNameEn : null,
    approverType:     typeof s.approverType === 'string' ? s.approverType : null,
    approverRoleCode: typeof s.approverRoleCode === 'string' ? s.approverRoleCode : null,
    stageSlaHours:    typeof s.stageSlaHours === 'number' ? s.stageSlaHours : null,
  }))

  const isDelegate =
    !!row.i.currentDelegateePersonId && row.i.currentDelegateePersonId === user.id
  const isRoleApprover =
    !row.i.currentDelegateePersonId &&
    (user.role === 'HR_ADMIN' || user.role === 'SUPER_ADMIN' || row.s?.approverRoleCode === user.role ||
     (user.role === 'MANAGER' && row.s?.approverRoleCode === 'LINE_MANAGER'))
  const isInFlight = row.i.status === 'PENDING' || row.i.status === 'IN_PROGRESS'

  return {
    instance: {
      id:                       row.i.id,
      workflowCode:             row.d?.workflowCode ?? '',
      workflowNameEn:           row.d?.workflowNameEn ?? '',
      workflowNameAr:           row.d?.workflowNameAr ?? null,
      triggerEvent:             row.d?.triggerEvent ?? '',
      resourceType:             row.i.resourceType,
      resourceId:               row.i.resourceId,
      legalEntityId:            row.i.legalEntityId,
      status:                   row.i.status,
      startedAt:                row.i.startedAt,
      completedAt:              row.i.completedAt,
      slaDeadline:              row.i.slaDeadline,
      currentStageOrder:        row.i.currentStageOrder ?? 0,
      currentStageNameEn:       row.s?.stageNameEn ?? null,
      currentStageNameAr:       row.s?.stageNameAr ?? null,
      approverRoleCode:         row.s?.approverRoleCode ?? null,
      stageSlaHours:            row.s?.stageSlaHours ?? null,
      currentDelegateePersonId: row.i.currentDelegateePersonId,
      currentDelegateeNameEn:   row.i.currentDelegateePersonId ? byId.get(row.i.currentDelegateePersonId)?.fullNameEn ?? null : null,
      currentDelegateeNameAr:   row.i.currentDelegateePersonId ? byId.get(row.i.currentDelegateePersonId)?.fullNameAr ?? null : null,
      initiatorPersonId:        row.i.initiatedByPersonId,
      initiatorNameEn:          byId.get(row.i.initiatedByPersonId)?.fullNameEn ?? null,
      initiatorNameAr:          byId.get(row.i.initiatedByPersonId)?.fullNameAr ?? null,
      finalDecisionBy:          row.i.finalDecisionBy,
      finalDecisionNote:        row.i.finalDecisionNote,
      rejectionReason:          row.i.rejectionReason,
    },
    events:         events_log,
    stagesSnapshot,
    callerCanAct:   isInFlight && (isDelegate || isRoleApprover),
    isDelegate,
  }
  } catch (e) { translateError(e, 'getWorkflowInstance') }
}

export async function getDelegateCandidates(
  legalEntityId: string,
): Promise<Array<{ id: string; personNumber: string; fullNameEn: string | null; fullNameAr: string | null }>> {
  try {
  // The decision UI lets an approver pick from active employees in the same
  // legal entity (excluding the caller). Phase 1: simple list scope; future
  // sprints can narrow to "people with approver-eligible roles".
  await getCurrentUser()
  const rows = await db
    .select({
      id:           persons.id,
      personNumber: persons.personNumber,
      fullNameEn:   persons.fullNameEn,
      fullNameAr:   persons.fullNameAr,
    })
    .from(persons)
    .where(
      and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.legalEntityId, legalEntityId),
        eq(persons.isActive, true),
      ),
    )
    .orderBy(persons.personNumber)
    .limit(500)
  return rows
  } catch (e) { translateError(e, 'getDelegateCandidates') }
}

export async function getWorkflowTemplate(id: string): Promise<{
  template: {
    id: string
    workflowCode: string
    workflowNameEn: string
    workflowNameAr: string | null
    triggerEvent: string
    approvalMode: string
    slaHours: number
    escalationHours: number
    isActive: boolean
    legalEntityId: string | null
    version: number
  }
  stages: Array<{
    id: string
    stageOrder: number
    stageNameEn: string
    stageNameAr: string | null
    approverRoleCode: string | null
    escalationRoleCode: string | null
    stageSlaHours: number
    canDelegate: boolean
    isOptional: boolean
    actionType: string
  }>
} | null> {
  try {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const [t] = await db
    .select()
    .from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.tenantId, TENANT_ID), eq(workflowDefinitions.id, id)))
    .limit(1)
  if (!t) return null
  const stages = await db
    .select({
      id:                 workflowStages.id,
      stageOrder:         workflowStages.stageOrder,
      stageNameEn:        workflowStages.stageNameEn,
      stageNameAr:        workflowStages.stageNameAr,
      approverRoleCode:   workflowStages.approverRoleCode,
      escalationRoleCode: workflowStages.escalationRoleCode,
      stageSlaHours:      workflowStages.stageSlaHours,
      canDelegate:        workflowStages.canDelegate,
      isOptional:         workflowStages.isOptional,
      actionType:         workflowStages.actionType,
    })
    .from(workflowStages)
    .where(eq(workflowStages.workflowDefinitionId, id))
    .orderBy(workflowStages.stageOrder)
  return {
    template: {
      id:              t.id,
      workflowCode:    t.workflowCode,
      workflowNameEn:  t.workflowNameEn,
      workflowNameAr:  t.workflowNameAr,
      triggerEvent:    t.triggerEvent,
      approvalMode:    t.approvalMode,
      slaHours:        t.slaHours,
      escalationHours: t.escalationHours,
      isActive:        t.isActive,
      legalEntityId:   t.legalEntityId,
      version:         t.version,
    },
    stages,
  }
  } catch (e) { translateError(e, 'getWorkflowTemplate') }
}
