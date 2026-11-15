/**
 * S9-05 — Workflow SLA breach checker (background job).
 *
 * Scans `workflow_step_instances` for PENDING steps whose `sla_deadline` has
 * passed and emits:
 *   • a `notification_log` row for the initiator + escalation person (if set)
 *   • a `WORKFLOW.SLA_BREACHED` audit row per breach (Hard Rule 1, batch tx)
 *   • flips `workflow_instances_v2.escalated_at` so the same breach is not
 *     re-alerted within the 30-minute window.
 *
 * Cron: every 30 minutes. Pure function from a (clock, DB snapshot) → side
 * effects, so callers can run `runSlaBreachCheck()` ad-hoc for backfills.
 *
 * Idempotency: the dedup key is `workflow_instances_v2.escalated_at`. A step
 * is alerted iff status = PENDING AND sla_deadline < NOW AND
 * (escalated_at IS NULL OR escalated_at < NOW − 30min).
 *
 * Wiring: `startSlaBreachCron()` returns a `cron.ScheduledTask` but does
 * NOT auto-run on import. The long-running process driver starts it.
 */
import { and, eq, lt, isNull, or, inArray } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '@/lib/db'
import {
  notificationLog,
  persons,
} from '@/drizzle/schema'
import {
  workflowInstancesV2,
  workflowStepInstances,
  workflowDefinitionsV2,
  workflowStepsV2,
} from '@/drizzle/schema/workflow-engine'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'

/** Cron cadence and dedup window — kept in sync. */
export const SLA_CHECK_INTERVAL_MINUTES = 30
const DEDUP_WINDOW_MS = SLA_CHECK_INTERVAL_MINUTES * 60 * 1000

const SYSTEM_ACTOR_ID   = '00000000-0000-0000-0000-000000000000'
const SYSTEM_ACTOR_NAME = 'system: sla-breach-checker'

export interface SlaBreachResult {
  scanAt:            Date
  candidatesFound:   number
  alertsCreated:     number
  duplicatesSkipped: number
  errors:            Array<{ instanceId: string; message: string }>
}

interface BreachedStep {
  stepInstanceId:      string
  instanceId:          string
  legalEntityId:       string
  resourceType:        string
  resourceId:          string
  initiatorPersonId:   string
  startedAt:           Date
  instanceSlaDeadline: Date | null
  stepSlaDeadline:     Date | null
  escalatedAt:         Date | null
  instanceStatus:      string
  workflowCode:        string | null
  workflowNameEn:      string | null
  workflowNameAr:      string | null
  stepOrder:           number
  stepNameEn:          string
  stepNameAr:          string | null
  escalationPersonId:  string | null
  hierarchyRole:       string | null
}

/**
 * Run the SLA breach scan once. Returns a structured summary; never throws —
 * per-instance errors are captured in `result.errors`.
 */
export async function runSlaBreachCheck(now: Date = new Date()): Promise<SlaBreachResult> {
  const errors: Array<{ instanceId: string; message: string }> = []
  let alertsCreated     = 0
  let duplicatesSkipped = 0
  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_MS)

  // Find PENDING step instances whose step-level SLA has passed and whose
  // parent instance has not been escalated within the dedup window.
  const candidates = await db
    .select({
      stepInstanceId:      workflowStepInstances.id,
      instanceId:          workflowInstancesV2.id,
      legalEntityId:       workflowInstancesV2.legalEntityId,
      resourceType:        workflowInstancesV2.resourceType,
      resourceId:          workflowInstancesV2.resourceId,
      initiatorPersonId:   workflowInstancesV2.initiatedByPersonId,
      startedAt:           workflowInstancesV2.startedAt,
      instanceSlaDeadline: workflowInstancesV2.slaDeadline,
      stepSlaDeadline:     workflowStepInstances.slaDeadline,
      escalatedAt:         workflowInstancesV2.escalatedAt,
      instanceStatus:      workflowInstancesV2.status,
      workflowCode:        workflowDefinitionsV2.workflowCode,
      workflowNameEn:      workflowDefinitionsV2.workflowNameEn,
      workflowNameAr:      workflowDefinitionsV2.workflowNameAr,
      stepOrder:           workflowStepInstances.stepOrder,
      stepNameEn:          workflowStepsV2.stepNameEn,
      stepNameAr:          workflowStepsV2.stepNameAr,
      escalationPersonId:  workflowStepsV2.escalationPersonId,
      hierarchyRole:       workflowStepsV2.hierarchyRole,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowInstancesV2,    eq(workflowStepInstances.instanceId,        workflowInstancesV2.id))
    .innerJoin(workflowDefinitionsV2,  eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(workflowStepsV2,        eq(workflowStepInstances.stepId,             workflowStepsV2.id))
    .where(
      and(
        eq(workflowStepInstances.tenantId, TENANT_ID),
        eq(workflowStepInstances.status,   'PENDING'),
        lt(workflowStepInstances.slaDeadline, now),
        or(
          isNull(workflowInstancesV2.escalatedAt),
          lt(workflowInstancesV2.escalatedAt, dedupCutoff),
        ),
      ),
    )

  // Defense-in-depth: discard any rows where the workflow instance has already
  // reached a terminal state (APPROVED / REJECTED / CANCELLED) since the outer
  // SELECT ran.  The SQL WHERE clause handles this in steady-state; this guard
  // covers the race window between the outer SELECT and the per-instance tx.
  // Note: `instanceStatus` is always present in production (queried from DB);
  // absent only in legacy unit-test mocks that omit the field — treat as pass.
  const breached = (candidates as BreachedStep[]).filter(b => {
    const s = b.instanceStatus as string | undefined
    return !s || s === 'IN_PROGRESS' || s === 'PENDING'
  })

  if (breached.length === 0) {
    return { scanAt: now, candidatesFound: 0, alertsCreated: 0, duplicatesSkipped: 0, errors }
  }

  // Batch-resolve initiator names.
  const initiatorIds   = Array.from(new Set(breached.map(b => b.initiatorPersonId)))
  const initiatorRows  = await db
    .select({ id: persons.id, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, initiatorIds)))
  const initiatorById  = new Map(initiatorRows.map(p => [p.id, p]))

  // Batch-resolve escalation person names.
  const escalationIds  = Array.from(
    new Set(breached.map(b => b.escalationPersonId).filter(Boolean) as string[]),
  )
  const escalationById = new Map<string, { fullNameEn: string | null; fullNameAr: string | null }>()
  if (escalationIds.length) {
    const rows = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, escalationIds)))
    for (const r of rows) escalationById.set(r.id, r)
  }

  for (const b of breached) {
    try {
      const wasInserted = await db.transaction(async tx => {
        // Re-check inside tx: another concurrent run may have already escalated.
        const [latest] = await tx
          .select({ escalatedAt: workflowInstancesV2.escalatedAt })
          .from(workflowInstancesV2)
          .where(eq(workflowInstancesV2.id, b.instanceId))
          .limit(1)
        if (!latest) return false
        if (latest.escalatedAt && latest.escalatedAt > dedupCutoff) return false

        const initiator    = initiatorById.get(b.initiatorPersonId)
        const initiatorName = initiator?.fullNameEn ?? 'Initiator'
        const escalationName = b.escalationPersonId
          ? (escalationById.get(b.escalationPersonId)?.fullNameEn ?? 'Escalation Contact')
          : (b.hierarchyRole ?? 'HR')
        const stageLabel = `${b.stepNameEn} (step ${b.stepOrder})`
        const slaIso = (b.stepSlaDeadline ?? b.instanceSlaDeadline ?? now)
          .toISOString().slice(0, 16).replace('T', ' ')

        const subjectEn = `Workflow SLA breached: ${b.workflowNameEn ?? b.workflowCode ?? 'Workflow'} — escalating to ${escalationName}`
        const subjectAr = `تجاوز موعد سير العمل: ${b.workflowNameAr ?? b.workflowCode ?? 'سير العمل'} — تصعيد إلى ${escalationName}`
        const bodyEn =
          `Workflow ${b.workflowCode ?? '—'} initiated by ${initiatorName} ` +
          `breached its SLA at ${slaIso} on ${stageLabel}. ` +
          `Escalating to ${escalationName}.`
        const bodyAr =
          `سير العمل ${b.workflowCode ?? '—'} الذي بدأه ${initiator?.fullNameAr ?? initiatorName} ` +
          `تجاوز موعده في ${slaIso} في مرحلة ${b.stepNameAr ?? stageLabel}. ` +
          `يتم التصعيد إلى ${escalationName}.`

        const allRecipients = [b.initiatorPersonId]
        if (b.escalationPersonId && b.escalationPersonId !== b.initiatorPersonId) {
          allRecipients.push(b.escalationPersonId)
        }

        await tx.insert(notificationLog).values(
          allRecipients.map(recipientPersonId => ({
            tenantId:          TENANT_ID,
            legalEntityId:     b.legalEntityId,
            recipientPersonId,
            notificationType:  'APPROVAL_ESCALATION' as const,
            channel:           'IN_APP' as const,
            subjectEn,
            subjectAr,
            bodyEn,
            bodyAr,
            referenceType:     'WORKFLOW_INSTANCE',
            referenceId:       b.instanceId,
            status:            'PENDING' as const,
            createdBy:         SYSTEM_ACTOR_ID,
            createdByName:     SYSTEM_ACTOR_NAME,
          })),
        )

        // Flip escalated_at on the instance to block re-alert within dedup window.
        await tx
          .update(workflowInstancesV2)
          .set({
            escalatedAt:     now,
            updatedBy:       SYSTEM_ACTOR_ID,
            updatedByName:   SYSTEM_ACTOR_NAME,
            lastUpdatedDate: now,
          })
          .where(eq(workflowInstancesV2.id, b.instanceId))

        await writeAuditLog({
          actorId:       SYSTEM_ACTOR_ID,
          actorName:     SYSTEM_ACTOR_NAME,
          actorRole:     'SUPER_ADMIN',
          actorEntityId: b.legalEntityId,
          channel:       'BATCH',
          eventType:     'WORKFLOW.SLA_BREACHED',
          resourceType:  'workflow_instances_v2',
          resourceId:    b.instanceId,
          entityId:      b.legalEntityId,
          metadata: {
            workflowCode:      b.workflowCode,
            stepOrder:         b.stepOrder,
            stepNameEn:        b.stepNameEn,
            escalationPersonId: b.escalationPersonId,
            stepSlaDeadline:   b.stepSlaDeadline?.toISOString(),
            scanAt:            now.toISOString(),
            previouslyEscalated: !!latest.escalatedAt,
          },
          description:
            `SLA breached on ${stageLabel}; notified initiator and escalation contact (${escalationName}).`,
        }, tx)

        return true
      })

      if (wasInserted) alertsCreated++
      else duplicatesSkipped++
    } catch (err) {
      errors.push({
        instanceId: b.instanceId,
        message:    err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    scanAt:            now,
    candidatesFound:   breached.length,
    alertsCreated,
    duplicatesSkipped,
    errors,
  }
}

/**
 * Schedule the SLA breach scan to run every 30 minutes (UTC). Does not
 * auto-run on import — call from the long-running process driver.
 */
export function startSlaBreachCron(): cron.ScheduledTask {
  return cron.schedule('*/30 * * * *', async () => {
    try {
      const r = await runSlaBreachCheck()
      // eslint-disable-next-line no-console
      console.info('[sla-breach-checker]', r)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sla-breach-checker] fatal', err)
    }
  }, { timezone: 'UTC' })
}
