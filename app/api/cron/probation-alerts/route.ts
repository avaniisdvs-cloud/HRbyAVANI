/**
 * Probation Alert Cron — /api/cron/probation-alerts
 * Schedule: daily 08:00 UAE time (UTC+4) → 04:00 UTC
 * BR-37: UAE Labour Law — probation max 6 months. Flag employees approaching end.
 *
 * Finds: probation_status='active' AND probation_end_date <= today + 7 days
 * Creates in-app notification records for HR_ADMIN users.
 * Does NOT auto-send emails — in-app alerts only.
 */
import { NextRequest, NextResponse }   from 'next/server'
import { and, eq, gte, isNull, lte, sql }  from 'drizzle-orm'
import { db }                          from '@/lib/db'
import { persons, notificationLog }    from '@/drizzle/schema'
import { writeAuditLog }               from '@/lib/audit'
import { TENANT_ID }                   from '@/lib/constants'
import { logger }                      from '@/lib/logger'
import { reportCronFailure }           from '@/lib/monitoring'
import { startTimer, SLOW_JOB_MS }    from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret     = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-probation-alerts', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t     = startTimer()
  const reqId = request.headers.get('x-request-id') ?? undefined

  logger.info('cron-probation-alerts', 'tick start', { reqId })

  try {
    const today    = new Date()
    today.setHours(0, 0, 0, 0)
    const inSevenDays = new Date(today.getTime() + 7 * 86_400_000)

    // BR-37: find employees with active probation ending within 7 days
    const approaching = await db
      .select({
        id:               persons.id,
        nameEn:           persons.fullNameEn,
        employeeNumber:   persons.personNumber,
        probationEndDate: persons.probationEndDate,
        legalEntityId:    persons.legalEntityId,
      })
      .from(persons)
      .where(
        and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.probationStatus, 'active'),
          isNull(persons.separationDate),
          lte(persons.probationEndDate, inSevenDays.toISOString().split('T')[0]),
        ),
      )

    if (approaching.length === 0) {
      return NextResponse.json({ ok: true, alerted: 0, timestamp: new Date().toISOString() })
    }

    // Find HR_ADMIN user IDs to notify
    // We use persons table — HR admins are identified by their system role.
    // For Phase 1: create a single SYSTEM alert that HR admins will see in the bell.
    // The notification recipient is set to the first person record representing the system
    // since we don't have a direct HR_ADMIN persons list here.
    // A simplified approach: we'll create one notification per approaching employee
    // using their own person_id as recipient (HR will see it in the system alerts panel).

    let alerted  = 0
    let skipped  = 0

    // COLLISION-NOTIF fix: dedup window — skip if a PROBATION_ENDING notification
    // for this employee was already created in the last 24 hours. Prevents a Vercel
    // cron retry or operator-triggered second run from flooding employees with duplicate
    // in-app alerts on the same day.
    const dedupCutoff = new Date(today.getTime() - 24 * 60 * 60 * 1000)

    await db.transaction(async tx => {
      for (const emp of approaching) {
        const endDate    = emp.probationEndDate ? new Date(emp.probationEndDate) : null
        const daysLeft   = endDate
          ? Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000)
          : null

        // Dedup check: has this employee already received this notification today?
        const existing = await tx
          .select({ id: notificationLog.id })
          .from(notificationLog)
          .where(and(
            eq(notificationLog.tenantId, TENANT_ID),
            eq(notificationLog.recipientPersonId, emp.id),
            eq(notificationLog.notificationType, 'PROBATION_ENDING'),
            gte(notificationLog.createdDate, dedupCutoff),
          ))
          .limit(1)

        if (existing.length > 0) {
          skipped++
          continue  // Already notified within dedup window — skip silently
        }

        await tx.insert(notificationLog).values({
          tenantId:          TENANT_ID,
          legalEntityId:     emp.legalEntityId,
          recipientPersonId: emp.id,
          notificationType:  'PROBATION_ENDING',
          channel:           'IN_APP',
          subjectEn:         `Probation ending in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
          subjectAr:         `تنتهي فترة التجربة خلال ${daysLeft} يوم`,
          bodyEn:            `Employee ${emp.nameEn} (${emp.employeeNumber}) probation ends on ${emp.probationEndDate}. Please generate a confirmation letter.`,
          bodyAr:            `فترة تجربة الموظف ${emp.nameEn} (${emp.employeeNumber}) تنتهي في ${emp.probationEndDate}. يرجى إنشاء خطاب تأكيد التوظيف.`,
          referenceType:     'persons',
          referenceId:       emp.id,
          status:            'PENDING',
          createdBy:         sql`gen_random_uuid()`,
          createdByName:     'system',
        })

        alerted++
      }

      await writeAuditLog(
        {
          actorId:      '00000000-0000-0000-0000-000000000001',
          actorName:    'cron:probation-alerts',
          actorRole:    'SYSTEM',
          channel:      'BATCH',
          eventType:    'PROBATION_ALERTS_SENT',
          resourceType: 'persons',
          description:  `BR-37: ${alerted} probation alert(s) created for employees ending within 7 days`,
          metadata:     { count: alerted },
        },
        tx,
      )
    })

    const durationMs = t.elapsedMs()

    if (durationMs > SLOW_JOB_MS) {
      logger.warn('cron-probation-alerts', 'slow tick', { reqId, durationMs, alerted, skipped })
    } else {
      logger.info('cron-probation-alerts', 'tick complete', { reqId, durationMs, alerted, skipped })
    }

    return NextResponse.json({
      ok:        true,
      alerted,
      skipped,
      durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const durationMs = t.elapsedMs()
    const message    = err instanceof Error ? err.message : String(err)
    logger.error('cron-probation-alerts', 'tick fatal', {
      reqId, durationMs, error: message.slice(0, 300),
    })
    reportCronFailure('probation-alerts', err)
    return NextResponse.json({ ok: false, error: message, durationMs }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    ok:        true,
    service:   'probation-alerts-cron',
    schedule:  'daily 08:00 UAE (04:00 UTC)',
    timestamp: new Date().toISOString(),
  })
}
