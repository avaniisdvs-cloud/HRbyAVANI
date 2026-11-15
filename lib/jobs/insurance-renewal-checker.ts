/**
 * Insurance renewal alert background job.
 *
 * Scans `medical_insurance_enrolments` (status=ACTIVE) for policies whose
 * `expiry_date` falls exactly `N` days ahead, where N comes from
 * `medical_insurance_policy_settings.renewal_alert_days` per legal entity.
 * Falls back to [90, 60, 30, 14] when no policy row exists.
 *
 * Recipients per alert:
 *   - The enrolled person (employee awareness)
 *   - Every HR_ADMIN / HR_DIRECTOR in the same legal entity (action owners)
 *
 * Idempotency: de-dup key is (recipientPersonId, referenceId, subjectEn).
 * subjectEn carries both the plan name and the day-window, so each
 * threshold produces a distinct row per enrolment.
 *
 * Runs at 07:30 UAE (03:30 UTC) — 30 min after document-expiry-checker
 * to avoid peak DB contention.
 *
 * Hard Rule 1 — writes audit row in the same transaction as notification inserts.
 * Hard Rule 5 — every notification has bilingual subject + body.
 */

import { and, eq, inArray } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '@/lib/db'
import {
  medicalInsuranceEnrolments,
  medicalInsurancePlans,
  medicalInsurancePolicySettings,
  notificationLog,
  persons,
  userAccounts,
} from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { isoDateAddDays, todayUae } from '@/lib/date-utils'

const DEFAULT_ALERT_WINDOWS = [90, 60, 30, 14] as const

const SYSTEM_ACTOR_ID   = '00000000-0000-0000-0000-000000000000'
const SYSTEM_ACTOR_NAME = 'system: insurance-renewal-checker'

interface CheckResult {
  scanDate:      string
  alertsCreated: number
  duplicatesSkipped: number
  errors:        string[]
}

interface PendingAlert {
  recipientPersonId: string
  legalEntityId:     string
  notificationType:  string
  subjectEn:         string
  subjectAr:         string
  bodyEn:            string
  bodyAr:            string
  referenceType:     string
  referenceId:       string
}

/**
 * Run the insurance renewal scan once. Safe to call manually for
 * testing or backfills.
 */
export async function runInsuranceRenewalCheck(): Promise<CheckResult> {
  const scanDate = todayUae()
  const errors: string[] = []
  let alertsCreated     = 0
  let duplicatesSkipped = 0

  try {
    // Load distinct legal entities that have active enrolments.
    const entityRows = await db
      .selectDistinct({ legalEntityId: medicalInsuranceEnrolments.legalEntityId })
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
      ))

    for (const { legalEntityId } of entityRows) {
      if (!legalEntityId) continue

      try {
        // Load policy alert thresholds for this entity (fallback to defaults).
        const [policy] = await db
          .select({ renewalAlertDays: medicalInsurancePolicySettings.renewalAlertDays })
          .from(medicalInsurancePolicySettings)
          .where(and(
            eq(medicalInsurancePolicySettings.tenantId, TENANT_ID),
            eq(medicalInsurancePolicySettings.legalEntityId, legalEntityId),
          ))
          .limit(1)

        const alertWindows: number[] = policy?.renewalAlertDays?.length
          ? policy.renewalAlertDays
          : [...DEFAULT_ALERT_WINDOWS]

        // Resolve HR Admin + HR Director person IDs for this entity.
        const adminUsers = await db
          .select({ personId: userAccounts.personId })
          .from(userAccounts)
          .where(and(
            eq(userAccounts.tenantId, TENANT_ID),
            eq(userAccounts.primaryEntityId, legalEntityId),
            inArray(userAccounts.avaniisRole, ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']),
          ))
        const hrAdminPersonIds = adminUsers.map(u => u.personId).filter((id): id is string => id !== null)

        for (const window of alertWindows) {
          try {
            const targetDate = isoDateAddDays(scanDate, window)

            // Find ACTIVE enrolments expiring on targetDate for this entity.
            const expiring = await db
              .select({
                id:           medicalInsuranceEnrolments.id,
                personId:     medicalInsuranceEnrolments.personId,
                expiryDate:   medicalInsuranceEnrolments.expiryDate,
                enrolmentType: medicalInsuranceEnrolments.enrolmentType,
                planNameEn:   medicalInsurancePlans.planNameEn,
                planNameAr:   medicalInsurancePlans.planNameAr,
              })
              .from(medicalInsuranceEnrolments)
              .leftJoin(
                medicalInsurancePlans,
                eq(medicalInsuranceEnrolments.planId, medicalInsurancePlans.id),
              )
              .where(and(
                eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
                eq(medicalInsuranceEnrolments.legalEntityId, legalEntityId),
                eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
                eq(medicalInsuranceEnrolments.expiryDate, targetDate),
              ))

            if (expiring.length === 0) continue

            // Resolve employee names in one round-trip.
            const personIds = Array.from(new Set(expiring.map(e => e.personId).filter((id): id is string => id !== null)))
            if (personIds.length === 0) continue
            const nameRows = await db
              .select({ id: persons.id, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
              .from(persons)
              .where(inArray(persons.id, personIds))
            const nameById = new Map(nameRows.map(n => [n.id, n]))

            // Build pending alerts for each expiring enrolment.
            const pending: PendingAlert[] = []

            for (const enrol of expiring) {
              const person    = nameById.get(enrol.personId)
              const nameEn    = person?.fullNameEn ?? 'Employee'
              const nameAr    = person?.fullNameAr ?? 'الموظف'
              const planEn    = enrol.planNameEn ?? 'Insurance'
              const planAr    = enrol.planNameAr ?? 'التأمين'
              const typeLabel = enrol.enrolmentType === 'DEPENDENT' ? 'dependent ' : ''
              const subjectEn = `${nameEn} — ${typeLabel}insurance expires in ${window} days (${planEn})`
              const subjectAr = `تأمين ${nameAr} ينتهي خلال ${window} يومًا (${planAr})`
              const bodyEn    =
                `The ${typeLabel}insurance coverage for ${nameEn} under plan "${planEn}" ` +
                `expires on ${targetDate}. Please arrange renewal or notify the insurer.`
              const bodyAr    =
                `تنتهي تغطية التأمين ${typeLabel === 'dependent ' ? 'للمُعال ' : ''}للموظف ${nameAr} ` +
                `ضمن خطة "${planAr}" بتاريخ ${targetDate}. يُرجى ترتيب التجديد أو إشعار المؤمِّن.`

              // Encode the window in notificationType so de-dup key is stable even
              // if the plan is renamed between runs (L21).
              const windowType = `INSURANCE_RENEWAL_DUE_${window}D` as const

              // Notify the employee themselves.
              pending.push({
                recipientPersonId: enrol.personId,
                legalEntityId,
                notificationType:  windowType,
                subjectEn,
                subjectAr,
                bodyEn,
                bodyAr,
                referenceType: 'medical_insurance_enrolments',
                referenceId:   enrol.id,
              })

              // Notify each HR Admin (distinct person IDs only).
              for (const adminId of hrAdminPersonIds) {
                if (adminId === enrol.personId) continue // already added above
                pending.push({
                  recipientPersonId: adminId,
                  legalEntityId,
                  notificationType:  windowType,
                  subjectEn,
                  subjectAr,
                  bodyEn,
                  bodyAr,
                  referenceType: 'medical_insurance_enrolments',
                  referenceId:   enrol.id,
                })
              }
            }

            if (pending.length === 0) continue

            const result = await db.transaction(async tx => {
              // De-dup on (recipientPersonId, referenceId, notificationType).
              // notificationType encodes the window (e.g. INSURANCE_RENEWAL_DUE_90D)
              // so this key is stable even if the plan is renamed between cron runs.
              const refIds       = pending.map(p => p.referenceId)
              const notifTypes   = Array.from(new Set(pending.map(p => p.notificationType)))
              const existing     = await tx
                .select({
                  recipientPersonId: notificationLog.recipientPersonId,
                  referenceId:       notificationLog.referenceId,
                  notificationType:  notificationLog.notificationType,
                })
                .from(notificationLog)
                .where(and(
                  eq(notificationLog.tenantId, TENANT_ID),
                  inArray(notificationLog.notificationType, notifTypes),
                  inArray(notificationLog.referenceId, refIds),
                ))

              const existingKey = new Set(
                existing.map(e =>
                  `${e.recipientPersonId}|${e.referenceId}|${e.notificationType}`,
                ),
              )

              const fresh  = pending.filter(p =>
                !existingKey.has(`${p.recipientPersonId}|${p.referenceId}|${p.notificationType}`),
              )
              const skipped = pending.length - fresh.length

              if (fresh.length > 0) {
                await tx.insert(notificationLog).values(fresh.map(p => ({
                  tenantId:          TENANT_ID,
                  legalEntityId:     p.legalEntityId,
                  recipientPersonId: p.recipientPersonId,
                  notificationType:  p.notificationType,
                  channel:           'IN_APP' as const,
                  subjectEn:         p.subjectEn,
                  subjectAr:         p.subjectAr,
                  bodyEn:            p.bodyEn,
                  bodyAr:            p.bodyAr,
                  referenceType:     p.referenceType,
                  referenceId:       p.referenceId,
                  status:            'PENDING' as const,
                  createdBy:         SYSTEM_ACTOR_ID,
                  createdByName:     SYSTEM_ACTOR_NAME,
                })))

                await writeAuditLog({
                  actorId:      SYSTEM_ACTOR_ID,
                  actorName:    SYSTEM_ACTOR_NAME,
                  actorRole:    'SUPER_ADMIN',
                  channel:      'BATCH',
                  eventType:    'INSURANCE.RENEWAL_ALERTS_GENERATED',
                  resourceType: 'notification_log',
                  entityId:     legalEntityId,
                  metadata: {
                    scanDate,
                    window,
                    legalEntityId,
                    inserted:          fresh.length,
                    skippedDuplicates: skipped,
                  },
                  description: `Generated ${fresh.length} insurance renewal alerts at the ${window}-day window (skipped ${skipped} duplicates).`,
                }, tx)
              }

              return { inserted: fresh.length, skipped }
            })

            alertsCreated     += result.inserted
            duplicatesSkipped += result.skipped
          } catch (err) {
            errors.push(
              `[entity=${legalEntityId}][window=${window}] ` +
              (err instanceof Error ? err.message : String(err)),
            )
          }
        }
      } catch (err) {
        errors.push(
          `[entity=${legalEntityId}] ` +
          (err instanceof Error ? err.message : String(err)),
        )
      }
    }
  } catch (err) {
    errors.push(`[outer] ${err instanceof Error ? err.message : String(err)}`)
  }

  return { scanDate, alertsCreated, duplicatesSkipped, errors }
}

/**
 * Starts the daily cron schedule. 07:30 UAE = 03:30 UTC.
 * Returns the cron task handle so callers can stop it on shutdown.
 */
export function startInsuranceRenewalCron(): cron.ScheduledTask {
  return cron.schedule('30 3 * * *', async () => {
    try {
      const r = await runInsuranceRenewalCheck()
      // eslint-disable-next-line no-console
      console.info('[insurance-renewal-checker]', r)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[insurance-renewal-checker] fatal', err)
    }
  }, { timezone: 'UTC' })
}
