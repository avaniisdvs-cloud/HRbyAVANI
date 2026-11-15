'use server'

/**
 * BQ-4 — Employee self-service bank details update.
 *
 * Business rule (BQ-4):
 *   • If no Salary Transfer Letter (STL) was issued in the last 30 days →
 *     employee may update their IBAN directly (immediate effect).
 *   • If an STL was issued within the last 30 days →
 *     the change is held pending HR Admin approval (BANK_CHANGE_APPROVAL workflow).
 *
 * Hard Rule 4: IBAN always encrypted before persisting.
 * Hard Rule 1: every DB write + audit in same transaction.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  personBankDetails, persons, employeeLetters, notificationLog, userAccounts,
} from '@/drizzle/schema'
import {
  workflowDefinitionsV2, workflowStepsV2, workflowInstancesV2,
  workflowStepInstances,
  type ResolvedApprover, type HierarchySnapshot, type ContextSnapshot,
} from '@/drizzle/schema/workflow-engine'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { addDays } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import { assertUaeIbanFormat, maskTail } from '../services'
import { randomUUID } from 'crypto'
import { asc } from 'drizzle-orm'

const BANK_CHANGE_WF_CODE = 'BANK_DETAILS_CHANGE_APPROVAL'

// ── Input schema ──────────────────────────────────────────────────────────────

const SelfServiceBankDetailsSchema = z.object({
  bankName:     z.string().min(1).max(200),
  bankCode:     z.string().min(1).max(20),
  iban:         z.string().regex(/^AE\d{21}$/, 'BR-WPS-004: UAE IBAN required (AE + 21 digits)'),
  accountName:  z.string().min(1).max(200),
  accountType:  z.enum(['CURRENT', 'SAVINGS', 'SALARY']).default('CURRENT'),
  isWpsAccount: z.boolean().default(true),
})

type SelfServiceBankDetailsInput = z.infer<typeof SelfServiceBankDetailsSchema>

export type SelfServiceBankDetailsResult =
  | { outcome: 'UPDATED'; bankDetailsId: string }
  | { outcome: 'PENDING_APPROVAL'; workflowInstanceId: string }

/**
 * Employee-initiated bank details update.
 * Caller must be the employee whose record is being changed (self-only).
 */
export async function selfServiceUpdateBankDetails(
  input: SelfServiceBankDetailsInput,
): Promise<SelfServiceBankDetailsResult> {
  try {
    const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!user.personId) throw new Error('NO_PERSON_RECORD: link your user account to an employee record first.')

    const data = SelfServiceBankDetailsSchema.parse(input)
    assertUaeIbanFormat(data.iban)

    const personId = user.personId
    const today    = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = addDays(today, -30)

    return await db.transaction(async tx => {
      // Person + entity scope
      const [person] = await tx
        .select({ id: persons.id, legalEntityId: persons.legalEntityId, fullNameEn: persons.fullNameEn })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
        .limit(1)
      if (!person) throw new Error('person not found')

      // BQ-4 — check for any STL issued in the last 30 days.
      // typeCode 'STL' = Salary Transfer Letter. Active statuses only.
      const [recentStl] = await tx
        .select({ id: employeeLetters.id, letterNumber: employeeLetters.letterNumber })
        .from(employeeLetters)
        .where(and(
          eq(employeeLetters.tenantId, TENANT_ID),
          eq(employeeLetters.personId, personId),
          eq(employeeLetters.typeCode, 'STL'),
          inArray(employeeLetters.status, ['APPROVED', 'SIGNED', 'SENT']),
          gte(employeeLetters.createdDate, new Date(thirtyDaysAgo + 'T00:00:00Z')),
        ))
        .limit(1)

      if (recentStl) {
        // ── Path B: STL exists → create workflow approval request ─────────────
        const workflowInstanceId = await createBankChangeWorkflow(
          tx, actor(user), person, data, recentStl.letterNumber,
        )
        return { outcome: 'PENDING_APPROVAL', workflowInstanceId }
      }

      // ── Path A: No recent STL → update immediately ─────────────────────────
      const closeDate    = addDays(today, -1)
      const ibanCiphertext = encrypt(data.iban)

      // Close existing primary record (effective-date pattern, Hard Rule 3).
      await tx
        .update(personBankDetails)
        .set({
          effectiveTo: closeDate, isPrimary: false,
          updatedBy: user.id, updatedByName: user.name,
          updatedDate: new Date(), lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          eq(personBankDetails.personId, personId),
          eq(personBankDetails.isPrimary, true),
        ))

      const [row] = await tx
        .insert(personBankDetails)
        .values({
          tenantId:      TENANT_ID,
          personId,
          bankName:      data.bankName,
          bankCode:      data.bankCode,
          iban:          ibanCiphertext,
          accountName:   data.accountName,
          accountType:   data.accountType,
          currency:      'AED',
          isPrimary:     true,
          isWpsAccount:  data.isWpsAccount,
          effectiveFrom: today,
          effectiveTo:   null,
          actionMode:    'UPDATE',
          createdBy:     user.id,
          createdByName: user.name,
        })
        .returning({ id: personBankDetails.id })

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: person.legalEntityId,
        channel: 'WEB',
        eventType: 'BANK_DETAILS.SELF_SERVICE_UPDATED',
        resourceType: 'person_bank_details',
        resourceId: row.id,
        entityId: person.legalEntityId,
        newValues: {
          personId, bankName: data.bankName, bankCode: data.bankCode,
          ibanMasked: maskTail(data.iban, 4), isWpsAccount: data.isWpsAccount,
          triggeredByStl: false,
        },
      }, tx)

      return { outcome: 'UPDATED', bankDetailsId: row.id }
    })
  } catch (e) { translateError(e, 'selfServiceUpdateBankDetails') }
}

// ── Internal helper ───────────────────────────────────────────────────────────

function actor(user: { id: string; name: string; role: string }) {
  return { id: user.id, name: user.name }
}

async function createBankChangeWorkflow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorRef: { id: string; name: string },
  person: { id: string; legalEntityId: string; fullNameEn: string | null },
  data: SelfServiceBankDetailsInput,
  stlLetterNumber: string,
): Promise<string> {
  // Upsert workflow definition (self-seeding)
  const [existingDef] = await tx
    .select({ id: workflowDefinitionsV2.id })
    .from(workflowDefinitionsV2)
    .where(and(
      eq(workflowDefinitionsV2.tenantId, TENANT_ID),
      eq(workflowDefinitionsV2.workflowCode, BANK_CHANGE_WF_CODE),
    ))
    .limit(1)

  let defId   = ''
  let step1Id = ''

  if (existingDef) {
    defId = existingDef.id
    const [s1] = await tx
      .select({ id: workflowStepsV2.id })
      .from(workflowStepsV2)
      .where(and(
        eq(workflowStepsV2.tenantId, TENANT_ID),
        eq(workflowStepsV2.workflowDefinitionId, defId),
        eq(workflowStepsV2.stepOrder, 1),
      ))
      .limit(1)
    step1Id = s1?.id ?? ''
  } else {
    const [created] = await tx
      .insert(workflowDefinitionsV2)
      .values({
        tenantId: TENANT_ID, workflowCode: BANK_CHANGE_WF_CODE,
        workflowNameEn: 'Bank Details Change Approval',
        workflowNameAr: 'موافقة تغيير البيانات البنكية',
        triggerEvent: 'BANK_DETAILS_CHANGE',
        defaultHierarchyType: 'CUSTOM_GROUP',
        defaultSlaHours: 48, defaultEscalationHours: 72,
        isActive: true, version: 1,
        createdBy: actorRef.id, createdByName: actorRef.name,
      })
      .returning({ id: workflowDefinitionsV2.id })
    defId = created.id

    const [s1] = await tx
      .insert(workflowStepsV2)
      .values({
        tenantId: TENANT_ID, workflowDefinitionId: defId,
        stepOrder: 1, stepCode: 'HR_ADMIN_APPROVAL',
        stepNameEn: 'HR Admin Approval', stepNameAr: 'موافقة مدير الموارد البشرية',
        hierarchyType: 'CUSTOM_GROUP', hierarchyRole: 'HR_ADMIN',
        hierarchyLevel: 1, slaHours: 48, onSlaBreach: 'ESCALATE',
        canDelegate: true, isOptional: false,
        createdBy: actorRef.id, createdByName: actorRef.name,
      })
      .returning({ id: workflowStepsV2.id })
    step1Id = s1.id
  }

  // Resolve HR Admin approver
  const [hrRow] = await tx
    .select({ personId: userAccounts.personId })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      inArray(userAccounts.avaniisRole, ['HR_ADMIN', 'HR_DIRECTOR']),
      eq(userAccounts.isActive, true),
    ))
    .orderBy(asc(userAccounts.avaniisRole)) // HR_ADMIN before HR_DIRECTOR
    .limit(1)

  const hrPersonId = hrRow?.personId ?? null

  const now = new Date()
  const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const resolvedApprovers: ResolvedApprover[] = []
  if (hrPersonId) {
    resolvedApprovers.push({
      personId: hrPersonId, personName: '',
      stepOrder: 1, stepCode: 'HR_ADMIN_APPROVAL',
      hierarchyType: 'CUSTOM_GROUP', resolvedAt: now.toISOString(),
    })
  }

  const hierarchySnapshot: HierarchySnapshot = {
    encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2',
  }
  const contextSnapshot: ContextSnapshot = {
    encryptedAt: now.toISOString(),
    resourceType: 'person_bank_details',
    resourceId: person.id,
    fields: {
      personId: person.id,
      bankName: data.bankName, bankCode: data.bankCode,
      ibanMasked: maskTail(data.iban, 4),
      stlLetterNumber,
      reason: `Employee self-service IBAN change blocked by STL ${stlLetterNumber} (issued within 30 days)`,
    },
  }

  const instanceId = randomUUID()
  await tx.insert(workflowInstancesV2).values({
    id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId,
    legalEntityId: person.legalEntityId,
    resourceType: 'person_bank_details', resourceId: person.id,
    initiatedByPersonId: person.id,
    status: 'IN_PROGRESS', currentStepOrder: 1,
    hierarchySnapshot: hierarchySnapshot as never,
    contextSnapshot: contextSnapshot as never,
    resolvedSteps: resolvedApprovers as never,
    slaDeadline, startedAt: now,
    createdBy: actorRef.id, createdByName: actorRef.name, createdDate: now,
  })

  if (step1Id && hrPersonId) {
    await tx.insert(workflowStepInstances).values({
      id: randomUUID(), tenantId: TENANT_ID, instanceId,
      stepId: step1Id, stepOrder: 1, status: 'PENDING',
      assignedToPersonId: hrPersonId, slaDeadline,
      createdBy: actorRef.id, createdByName: actorRef.name, createdDate: now,
    })
  }

  if (hrPersonId) {
    await tx.insert(notificationLog).values([{
      tenantId: TENANT_ID, legalEntityId: person.legalEntityId,
      recipientPersonId: hrPersonId,
      notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP',
      subjectEn: `Bank details change requires approval — ${person.fullNameEn}`,
      bodyEn: `${person.fullNameEn} has requested a change to their bank account (${data.bankName} · ${maskTail(data.iban, 4)}). ` +
              `A Salary Transfer Letter (${stlLetterNumber}) was issued within the last 30 days, so your approval is required before this change takes effect.`,
      referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId,
      status: 'PENDING', createdBy: actorRef.id, createdByName: actorRef.name,
    }])
  }

  await writeAuditLog({
    actorId: actorRef.id, actorName: actorRef.name, actorRole: 'EMPLOYEE',
    actorEntityId: person.legalEntityId,
    channel: 'WEB',
    eventType: 'BANK_DETAILS.SELF_SERVICE_CHANGE_PENDING',
    resourceType: 'workflow_instances_v2',
    resourceId: instanceId,
    entityId: person.legalEntityId,
    newValues: {
      personId: person.id, bankName: data.bankName,
      ibanMasked: maskTail(data.iban, 4), stlLetterNumber, instanceId,
    },
  }, tx)

  return instanceId
}
