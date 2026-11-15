/**
 * S6/A-01 — CSV download for the absence balance report.
 *
 * GET /absence/balances/export?year=2026&entityId=&typeId=&q=&startDate=&endDate=&status=&cf=
 *   - Auth: HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, MANAGER, FINANCE, SUPER_ADMIN
 *   - Entity-scoped: caller's legalEntityId unless SUPER_ADMIN
 *   - Inherits the full active filter set from the Balances page (spec §8) so
 *     the CSV equals the on-screen grid.
 *   - Includes REQUIRED computed `balance_status` + `carry_forward_status`
 *     columns (Phase 1 plan-level expiry).
 *   - Audited: ABSENCE_BALANCES.EXPORTED (BR-AUDIT-001).
 *
 * Note: Next.js App Router forbids a page.tsx + route.ts in the same dir,
 * so this lives under .../balances/export/ rather than .../balances/.
 */
import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { absenceBalances, absencePlans, absenceTypes, persons } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { buildCsv } from '@/lib/csv'
import { TENANT_ID } from '@/lib/constants'
import {
  BalancesSearchSchema, balanceWhere, deriveBalanceStatus, deriveCarryForwardStatus,
  computePlanExpiryISO, BALANCE_STATUS_LABEL_EN, CARRY_FORWARD_STATUS_LABEL_EN,
} from '../filters'

const ALLOWED_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'FINANCE', 'SUPER_ADMIN']

const CSV_HEADER = [
  'person_number',
  'full_name_en',
  'full_name_ar',
  'leave_type',
  'opening',
  'accrued',
  'carried_forward',
  'adjusted',
  'taken',
  'pending',
  'forfeited',
  'closing',
  'balance_status',
  'carry_forward_status',
  'year',
] as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const raw: Record<string, string | undefined> = {}
  for (const k of ['year', 'entityId', 'typeId', 'departmentId', 'projectId', 'q', 'startDate', 'endDate', 'status', 'cf']) {
    raw[k] = url.searchParams.get(k) ?? undefined
  }
  const parsed = BalancesSearchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', details: parsed.error.flatten() }, { status: 400 })
  }
  const f = parsed.data
  const year = f.year ?? new Date().getUTCFullYear()
  const todayISO = new Date().toISOString().slice(0, 10)

  // Entity scope: SUPER_ADMIN may narrow by entityId; everyone else is pinned.
  const scopedEntityId =
    session.user.role === 'SUPER_ADMIN' ? null : session.user.legalEntityId

  const where = balanceWhere(
    { year, entityId: f.entityId, typeId: f.typeId, departmentId: f.departmentId, projectId: f.projectId, q: f.q, startDate: f.startDate, endDate: f.endDate, status: f.status, cf: f.cf },
    scopedEntityId,
  )

  const rows = await db
    .select({
      personNumber:        persons.personNumber,
      personFullNameEn:    persons.fullNameEn,
      personFullNameAr:    persons.fullNameAr,
      absenceTypeCode:     absenceTypes.typeCode,
      openingBalanceDays:  absenceBalances.openingBalanceDays,
      accruedDays:         absenceBalances.accruedDays,
      carriedForwardDays:  absenceBalances.carriedForwardDays,
      adjustedDays:        absenceBalances.adjustedDays,
      takenDays:           absenceBalances.takenDays,
      pendingDays:         absenceBalances.pendingDays,
      forfeitedDays:       absenceBalances.forfeitedDays,
      closingBalanceDays:  absenceBalances.closingBalanceDays,
      balanceYear:         absenceBalances.balanceYear,
      carryForwardExpiryMonths: absencePlans.carryForwardExpiryMonths,
    })
    .from(absenceBalances)
    .leftJoin(persons,      eq(absenceBalances.personId, persons.id))
    .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
    .leftJoin(absencePlans, eq(absenceTypes.absencePlanId, absencePlans.id))
    .where(where)
    .orderBy(asc(persons.personNumber), asc(absenceTypes.typeCode))

  const num = (v: unknown) => (v == null ? 0 : Number(v))

  // Audit the export — BR-AUDIT-001 / Hard Rule 1 spirit. Read but tracked.
  await writeAuditLog({
    actorId:      session.user.id,
    actorName:    session.user.name ?? session.user.email ?? 'unknown',
    actorRole:    session.user.role,
    actorEntityId: session.user.legalEntityId ?? undefined,
    channel:      'WEB',
    eventType:    'ABSENCE_BALANCES.EXPORTED',
    resourceType: 'absence_balances',
    entityId:     scopedEntityId ?? f.entityId ?? undefined,
    metadata:     { year, rowCount: rows.length, format: 'csv', filters: { entityId: f.entityId, typeId: f.typeId, departmentId: f.departmentId, projectId: f.projectId, q: f.q, startDate: f.startDate, endDate: f.endDate, status: f.status, cf: f.cf } },
    description:  `Exported ${rows.length} absence balance row(s) for year ${year}`,
  })

  // S6-Q2: every cell goes through `csvField` (formula-injection-safe).
  const body = buildCsv(
    CSV_HEADER,
    rows.map(r => {
      const expiryISO = computePlanExpiryISO(r.balanceYear, num(r.carryForwardExpiryMonths))
      const carried = num(r.carriedForwardDays)
      const forfeited = num(r.forfeitedDays)
      const closing = r.closingBalanceDays == null ? null : Number(r.closingBalanceDays)
      const bal = deriveBalanceStatus({ closingBalanceDays: closing, carriedForwardDays: carried, forfeitedDays: forfeited, expiryISO, todayISO })
      const cf = deriveCarryForwardStatus({ carriedForwardDays: carried, forfeitedDays: forfeited, expiryISO, todayISO })
      return [
        r.personNumber ?? '',
        r.personFullNameEn ?? '',
        r.personFullNameAr ?? '',
        r.absenceTypeCode ?? '',
        r.openingBalanceDays ?? '',
        r.accruedDays ?? '',
        r.carriedForwardDays ?? '',
        r.adjustedDays ?? '',
        r.takenDays ?? '',
        r.pendingDays ?? '',
        r.forfeitedDays ?? '',
        r.closingBalanceDays ?? '',
        bal ? BALANCE_STATUS_LABEL_EN[bal] : '',
        CARRY_FORWARD_STATUS_LABEL_EN[cf],
        r.balanceYear ?? year,
      ]
    }),
  )

  const filename = `absence-balances-${year}.csv`
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
