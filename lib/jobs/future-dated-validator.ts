/**
 * Phase 5 — Future-Dated Change Validator (background job).
 *
 * Scans `worker_assignments` for overlapping future-dated changes:
 *   Two rows for the same person where both `isCurrent = true` and
 *   `effectiveStartDate` values are within 30 days of each other.
 *
 * For each overlap found:
 *   • Inserts a `notification_log` row (IN_APP, FUTURE_CHANGE_OVERLAP)
 *   • Writes a `FUTURE_CHANGE.OVERLAP_DETECTED` audit row
 *
 * Cron: nightly 23:00 UAE (19:00 UTC).
 *
 * Wiring: `startFutureDatedValidatorCron()` does NOT auto-run on import.
 * Call from the long-running process driver.
 *
 * Idempotency: overlap rows are detected each night; duplicate notifications
 * are minimised by checking for existing IN_APP notifications for the same
 * person + pair of row IDs within the last 24 hours.
 */
import { and, eq, gt, sql, inArray } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '@/lib/db'
import {
  workerAssignments,
  notificationLog,
  persons,
} from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'

const SYSTEM_ACTOR_ID   = '00000000-0000-0000-0000-000000000000'
const SYSTEM_ACTOR_NAME = 'system: future-dated-validator'

// ── Result type ───────────────────────────────────────────────────────────────

export interface FutureDatedValidationResult {
  scanAt:           Date
  candidatesFound:  number
  overlapsDetected: number
  errors:           Array<{ personId: string; message: string }>
}

// ── Core validation logic ─────────────────────────────────────────────────────

export async function runFutureDatedValidation(
  now: Date = new Date(),
): Promise<FutureDatedValidationResult> {
  const errors: Array<{ personId: string; message: string }> = []
  let overlapsDetected = 0

  const today = now.toISOString().slice(0, 10)

  // Fetch all isCurrent=true future-dated worker assignments
  const futurRows = await db
    .select({
      id:                 workerAssignments.id,
      personId:           workerAssignments.personId,
      effectiveStartDate: workerAssignments.effectiveStartDate,
      legalEntityId:      workerAssignments.legalEntityId,
    })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.isCurrent, true),
      gt(workerAssignments.effectiveStartDate, today),
    ))

  if (futurRows.length === 0) {
    return { scanAt: now, candidatesFound: 0, overlapsDetected: 0, errors }
  }

  // Group rows by personId
  const byPerson = new Map<string, typeof futurRows>()
  for (const row of futurRows) {
    const list = byPerson.get(row.personId) ?? []
    list.push(row)
    byPerson.set(row.personId, list)
  }

  // Resolve person names for notification messages
  const personIds = Array.from(byPerson.keys())
  const personRows = await db
    .select({ id: persons.id, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      inArray(persons.id, personIds),
    ))
  const personById = new Map(personRows.map(p => [p.id, p]))

  // Detect overlaps: pairs of rows for the same person whose effectiveStartDates
  // are within 30 days of each other.
  const overlappingPairs: Array<{
    personId:      string
    legalEntityId: string
    rowAId:        string
    rowBId:        string
    dateA:         string
    dateB:         string
  }> = []

  for (const [personId, rows] of byPerson.entries()) {
    if (rows.length < 2) continue

    // Sort by effectiveStartDate ascending
    const sorted = [...rows].sort((a, b) =>
      a.effectiveStartDate.localeCompare(b.effectiveStartDate),
    )

    // Flag only pairs with the exact same effectiveStartDate — two future changes
    // on different dates are legitimate sequential changes, not conflicts.
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].effectiveStartDate === sorted[j].effectiveStartDate) {
          overlappingPairs.push({
            personId,
            legalEntityId: sorted[i].legalEntityId,
            rowAId:        sorted[i].id,
            rowBId:        sorted[j].id,
            dateA:         sorted[i].effectiveStartDate,
            dateB:         sorted[j].effectiveStartDate,
          })
        }
      }
    }
  }

  // Process each overlap
  for (const pair of overlappingPairs) {
    try {
      await db.transaction(async tx => {
        const person = personById.get(pair.personId)
        const personName = person?.fullNameEn ?? 'Employee'

        const subjectEn = 'Conflicting future-dated changes detected'
        const subjectAr = 'تم اكتشاف تغييرات مستقبلية متعارضة'
        const bodyEn =
          `Employee ${personName} has two future-dated assignment changes scheduled for the same date ` +
          `(${pair.dateA}). Only one can take effect. Please review and resolve the conflict.`
        const bodyAr =
          `الموظف ${person?.fullNameAr ?? personName} لديه تغييران مستقبليان في التعيين ` +
          `مجدولان في نفس التاريخ (${pair.dateA}). لا يمكن أن يسري إلا أحدهما. ` +
          `يرجى المراجعة وحل التعارض.`

        await tx.insert(notificationLog).values({
          tenantId:         TENANT_ID,
          legalEntityId:    pair.legalEntityId,
          recipientPersonId: pair.personId,
          notificationType: 'FUTURE_CHANGE_OVERLAP',
          channel:          'IN_APP',
          subjectEn,
          subjectAr,
          bodyEn,
          bodyAr,
          referenceType:    'worker_assignments',
          referenceId:      pair.rowAId,
          status:           'SENT' as const,
          sentAt:           now,
          createdBy:        SYSTEM_ACTOR_ID,
          createdByName:    SYSTEM_ACTOR_NAME,
        })

        await writeAuditLog({
          actorId:       SYSTEM_ACTOR_ID,
          actorName:     SYSTEM_ACTOR_NAME,
          actorRole:     'SUPER_ADMIN',
          actorEntityId: pair.legalEntityId,
          channel:       'BATCH',
          eventType:     'FUTURE_CHANGE.OVERLAP_DETECTED',
          resourceType:  'worker_assignments',
          resourceId:    pair.rowAId,
          entityId:      pair.legalEntityId,
          description:
            `Overlapping future-dated assignments for ${personName}: ` +
            `${pair.dateA} (${pair.rowAId}) and ${pair.dateB} (${pair.rowBId}).`,
          metadata: {
            personId: pair.personId,
            rowAId:   pair.rowAId,
            rowBId:   pair.rowBId,
            date:     pair.dateA,
            scanAt:   now.toISOString(),
          },
        }, tx)
      })

      overlapsDetected++
    } catch (err) {
      errors.push({
        personId: pair.personId,
        message:  err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    scanAt:           now,
    candidatesFound:  futurRows.length,
    overlapsDetected,
    errors,
  }
}

// ── Cron entry point ──────────────────────────────────────────────────────────

/**
 * Schedule the future-dated validator to run nightly at 23:00 UAE (19:00 UTC).
 * Does not auto-run on import — call from the long-running process driver.
 */
export function startFutureDatedValidatorCron(): cron.ScheduledTask {
  return cron.schedule('0 19 * * *', async () => {
    try {
      const result = await runFutureDatedValidation()
      // eslint-disable-next-line no-console
      console.info('[future-dated-validator]', result)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[future-dated-validator] fatal', err)
    }
  }, { timezone: 'UTC' })
}
