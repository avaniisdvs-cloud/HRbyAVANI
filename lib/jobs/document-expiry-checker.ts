/**
 * S6-06 — Document expiry alerts (background job).
 *
 * Scans `person_documents` and `person_dependents` for upcoming expiries at
 * 90 / 60 / 30 / 14 day horizons (BR-DOC-001 alert thresholds) and inserts
 * `notification_log` rows for each. Runs daily at 07:00 UAE time
 * (03:00 UTC).
 *
 * Hard Rule 1 — `runDocumentExpiryCheck` writes audit rows in the same
 * Drizzle transaction as the notification inserts. The audit row is a
 * batch summary (count of alerts created), not one-per-notification —
 * that pattern is established for system batch jobs.
 *
 * Hard Rule 5 — every notification has bilingual subject + body.
 *
 * Idempotency: the (recipientPersonId, referenceId, subjectEn) tuple is
 * the de-dup key. subjectEn carries both the document-type label and the
 * window (e.g. "VISA expires in 30 days"), so a single dependent can
 * still get distinct alerts for visa / passport / emirates_id without
 * collapsing into one (S6-Q1 fix). Same-day re-runs produce zero
 * duplicates because every alert's subject is deterministic in
 * (referenceId, documentType, window).
 *
 * Wiring: the `start*` exports schedule the cron but DO NOT auto-run on
 * import. Call `startDocumentExpiryCron()` from the long-running process
 * driver (TD-09 outbox poller, Sprint 7) to activate.
 */
import { and, eq, inArray, lte, isNotNull } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '@/lib/db'
import {
  notificationLog,
  personDependents,
  personDocuments,
  persons,
} from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { isoDateAddDays, todayUae } from '@/lib/date-utils'

/** BR-DOC-001 alert thresholds — 90/60/30/14 days before expiry. */
export const ALERT_WINDOWS_DAYS = [90, 60, 30, 14] as const
export type AlertWindow = typeof ALERT_WINDOWS_DAYS[number]

const SYSTEM_ACTOR_ID   = '00000000-0000-0000-0000-000000000000'
const SYSTEM_ACTOR_NAME = 'system: document-expiry-checker'

interface CheckResult {
  scanDate:      string
  windowsScanned: AlertWindow[]
  alertsCreated: number
  duplicatesSkipped: number
  errors:        Array<{ window: AlertWindow; message: string }>
}

interface PendingAlert {
  recipientPersonId: string
  legalEntityId:     string | null
  notificationType:  string
  subjectEn:         string
  subjectAr:         string
  bodyEn:            string
  bodyAr:            string
  referenceType:     string
  referenceId:       string
  daysAhead:         AlertWindow
}

/**
 * Run the expiry scan once. Pure function from a clock+DB snapshot to a
 * batch of alert inserts. Safe to call manually for testing / backfills.
 */
export async function runDocumentExpiryCheck(): Promise<CheckResult> {
  const scanDate = todayUae()
  const errors: Array<{ window: AlertWindow; message: string }> = []
  let alertsCreated     = 0
  let duplicatesSkipped = 0

  for (const window of ALERT_WINDOWS_DAYS) {
    try {
      const targetDate = isoDateAddDays(scanDate, window)
      const pending = await collectPendingAlerts(targetDate, window)

      if (pending.length === 0) continue

      const result = await db.transaction(async tx => {
        // De-dup check: skip alerts already written for the same
        // (recipientPersonId, referenceId, subjectEn) tuple. subjectEn
        // carries the document-type AND the window so we can distinguish
        // visa-vs-passport-vs-emirates_id on the same dependent row
        // (S6-Q1 fix: prior key collapsed all dependent docs into one).
        const refIds = pending.map(p => p.referenceId)
        const existing = await tx
          .select({
            recipientPersonId: notificationLog.recipientPersonId,
            referenceId:       notificationLog.referenceId,
            subjectEn:         notificationLog.subjectEn,
          })
          .from(notificationLog)
          .where(and(
            eq(notificationLog.tenantId, TENANT_ID),
            eq(notificationLog.notificationType, 'DOCUMENT_EXPIRY'),
            inArray(notificationLog.referenceId, refIds),
          ))

        const existingKey = new Set(
          existing.map(e =>
            `${e.recipientPersonId}|${e.referenceId}|${e.subjectEn ?? ''}`,
          ),
        )

        const fresh = pending.filter(p =>
          !existingKey.has(`${p.recipientPersonId}|${p.referenceId}|${p.subjectEn}`),
        )
        const skipped = pending.length - fresh.length

        if (fresh.length === 0) {
          return { inserted: 0, skipped }
        }

        await tx.insert(notificationLog).values(fresh.map(p => ({
          tenantId:          TENANT_ID,
          legalEntityId:     p.legalEntityId,
          recipientPersonId: p.recipientPersonId,
          notificationType:  p.notificationType,
          channel:           'IN_APP',
          subjectEn:         p.subjectEn,
          subjectAr:         p.subjectAr,
          bodyEn:            p.bodyEn,
          bodyAr:            p.bodyAr,
          referenceType:     p.referenceType,
          referenceId:       p.referenceId,
          status:            'PENDING',
          createdBy:         SYSTEM_ACTOR_ID,
          createdByName:     SYSTEM_ACTOR_NAME,
        })))

        // Hard Rule 1: batch-summary audit row for the system insert.
        await writeAuditLog({
          actorId:      SYSTEM_ACTOR_ID,
          actorName:    SYSTEM_ACTOR_NAME,
          actorRole:    'SUPER_ADMIN',
          channel:      'BATCH',
          eventType:    'DOCUMENT_EXPIRY.ALERTS_GENERATED',
          resourceType: 'notification_log',
          metadata: {
            scanDate,
            window,
            inserted: fresh.length,
            skippedDuplicates: skipped,
          },
          description:
            `Generated ${fresh.length} document-expiry alerts at the ${window}-day window (skipped ${skipped} duplicates).`,
        }, tx)

        return { inserted: fresh.length, skipped }
      })

      alertsCreated     += result.inserted
      duplicatesSkipped += result.skipped
    } catch (err) {
      errors.push({
        window,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // CF-03 — Clear nursing-break entitlements whose 18-month window has
  // passed (BR-NB-001, Art 30 FDL 33/2021). Run in the same nightly job
  // so no separate cron is needed. Failures are non-fatal: a retry on the
  // next nightly run will catch any rows missed by a transient error.
  try {
    await clearExpiredNursingBreaks()
  } catch (err) {
    errors.push({
      window: 14, // sentinel — 14d bucket is the narrowest; reuse type slot
      message: `clearExpiredNursingBreaks: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  return {
    scanDate,
    windowsScanned: [...ALERT_WINDOWS_DAYS],
    alertsCreated,
    duplicatesSkipped,
    errors,
  }
}

/** Builds the PendingAlert list for a single window/target-date pair. */
async function collectPendingAlerts(
  targetDate: string,
  window: AlertWindow,
): Promise<PendingAlert[]> {
  const out: PendingAlert[] = []

  // ── 1. person_documents.expiry_date == targetDate ─────────────────────
  const docRows = await db
    .select({
      id:             personDocuments.id,
      personId:       personDocuments.personId,
      legalEntityId:  personDocuments.legalEntityId,
      documentType:   personDocuments.documentType,
      documentNumber: personDocuments.documentNumber,
    })
    .from(personDocuments)
    .where(and(
      eq(personDocuments.tenantId,   TENANT_ID),
      eq(personDocuments.expiryDate, targetDate),
    ))

  for (const d of docRows) {
    out.push({
      recipientPersonId: d.personId,
      legalEntityId:     d.legalEntityId,
      notificationType:  'DOCUMENT_EXPIRY',
      subjectEn:         `${d.documentType} expires in ${window} days`,
      subjectAr:         `تنتهي صلاحية ${d.documentType} خلال ${window} يومًا`,
      bodyEn:
        `Your ${d.documentType.toLowerCase()} ` +
        `${d.documentNumber ? `(${d.documentNumber}) ` : ''}expires on ${targetDate}. ` +
        `Please contact HR to renew it.`,
      bodyAr:
        `تنتهي صلاحية ${d.documentType} ` +
        `${d.documentNumber ? `(${d.documentNumber}) ` : ''}بتاريخ ${targetDate}. ` +
        `يُرجى التواصل مع الموارد البشرية للتجديد.`,
      referenceType: 'person_documents',
      referenceId:   d.id,
      daysAhead:     window,
    })
  }

  // ── 2. person_dependents — visa / passport / emirates-ID expiry ───────
  const depRows = await db
    .select({
      id:                 personDependents.id,
      personId:           personDependents.personId,
      firstNameEn:        personDependents.firstNameEn,
      lastNameEn:         personDependents.lastNameEn,
      passportExpiry:     personDependents.passportExpiry,
      emiratesIdExpiry:   personDependents.emiratesIdExpiry,
      visaExpiry:         personDependents.visaExpiry,
    })
    .from(personDependents)
    .where(eq(personDependents.tenantId, TENANT_ID))

  // Resolve dependents' owning legal entity in one round-trip.
  const ownerIds = Array.from(new Set(depRows.map(d => d.personId)))
  const ownerEntityById = new Map<string, string>()
  if (ownerIds.length > 0) {
    const owners = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons)
      .where(inArray(persons.id, ownerIds))
    for (const o of owners) ownerEntityById.set(o.id, o.legalEntityId)
  }

  for (const dep of depRows) {
    const depName = `${dep.firstNameEn} ${dep.lastNameEn}`.trim()
    const legalEntityId = ownerEntityById.get(dep.personId) ?? null
    const checks: Array<{ field: 'PASSPORT' | 'EMIRATES_ID' | 'VISA'; value: string | null }> = [
      { field: 'PASSPORT',    value: dep.passportExpiry },
      { field: 'EMIRATES_ID', value: dep.emiratesIdExpiry },
      { field: 'VISA',        value: dep.visaExpiry },
    ]

    for (const c of checks) {
      if (c.value !== targetDate) continue
      out.push({
        recipientPersonId: dep.personId,
        legalEntityId,
        notificationType:  'DOCUMENT_EXPIRY',
        subjectEn:         `Dependent ${c.field.replace('_', ' ').toLowerCase()} expires in ${window} days`,
        subjectAr:         `تنتهي وثيقة المُعال خلال ${window} يومًا`,
        bodyEn:
          `${depName}'s ${c.field.replace('_', ' ').toLowerCase()} expires on ${targetDate}. ` +
          `Please coordinate renewal.`,
        bodyAr:
          `تنتهي صلاحية وثيقة المُعال "${depName}" بتاريخ ${targetDate}. ` +
          `يُرجى تنسيق التجديد.`,
        referenceType: 'person_dependents',
        referenceId:   dep.id,
        daysAhead:     window,
      })
    }
  }

  return out
}

/**
 * GAP-C09 — Clears `nursing_break_end_date` on persons whose entitlement
 * window has passed (nursingBreakEndDate < today). Runs as part of the same
 * nightly job so no separate cron is needed.
 *
 * Returns count of person records cleared.
 */
export async function clearExpiredNursingBreaks(): Promise<number> {
  const today = todayUae()
  const expired = await db
    .select({ id: persons.id, legalEntityId: persons.legalEntityId })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      isNotNull(persons.nursingBreakEndDate),
      lte(persons.nursingBreakEndDate, today),
    ))
  if (expired.length === 0) return 0

  const SYSTEM = '00000000-0000-0000-0000-000000000000'
  await db.transaction(async tx => {
    for (const p of expired) {
      await tx
        .update(persons)
        .set({ nursingBreakEndDate: null, updatedBy: SYSTEM, lastUpdatedDate: new Date() })
        .where(eq(persons.id, p.id))

      await writeAuditLog({
        actorId:      SYSTEM,
        actorName:    'System',
        actorRole:    'SYSTEM',
        channel:      'SYSTEM',
        eventType:    'PERSON.NURSING_BREAK_EXPIRED',
        resourceType: 'persons',
        resourceId:   p.id,
        entityId:     p.legalEntityId ?? undefined,
        newValues:    { nursingBreakEndDate: null },
      }, tx)
    }
  })

  return expired.length
}

/**
 * Starts the daily cron schedule. 07:00 UAE = 03:00 UTC.
 * Returns the cron task handle so callers can stop it on shutdown.
 *
 * Idempotent re-arming is safe; node-cron schedules are independent.
 */
export function startDocumentExpiryCron(): cron.ScheduledTask {
  // `0 3 * * *` = every day at 03:00 UTC = 07:00 UAE (UTC+4, no DST).
  // Using UTC explicitly so server timezone configuration can't drift the
  // execution time when ops moves the host between regions.
  return cron.schedule('0 3 * * *', async () => {
    try {
      const r = await runDocumentExpiryCheck()
      // Production drivers should ship this to structured logs; using
      // console here keeps the helper standalone and dependency-free.
      // eslint-disable-next-line no-console
      console.info('[document-expiry-checker]', r)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[document-expiry-checker] fatal', err)
    }
  }, { timezone: 'UTC' })
}
