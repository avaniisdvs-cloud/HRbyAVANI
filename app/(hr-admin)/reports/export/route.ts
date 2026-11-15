/**
 * GET /reports/export?type=headcount|leave-summary|leave-balances|doc-expiry|contracts|audit-trail
 *
 * Role-scoped CSV export for each report type.
 * UTF-8 BOM prepended so Arabic text opens correctly in Excel.
 */
import { NextResponse }  from 'next/server'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { z }             from 'zod'
import { auth }          from '@/lib/auth'
import { db }            from '@/lib/db'
import {
  absenceBalances,
  absenceEntries,
  absenceTypes,
  auditLog,
  contracts,
  departments,
  legalEntities,
  personDocuments,
  persons,
} from '@/drizzle/schema'
import { TENANT_ID }     from '@/lib/constants'
import { buildCsv }      from '@/lib/csv'
import { resolveManagerPersonScope } from '@/modules/absence/report-scope'
import { getEmployeeMovement, type MovementFilters } from '@/modules/reports/employee-movement'
import type { TemporalState } from '@/modules/core-hr/assignment-history'

type ReportType = 'headcount' | 'leave-summary' | 'leave-balances' | 'doc-expiry' | 'contracts' | 'audit-trail' | 'employee-movement'

const ROLE_ACCESS: Record<ReportType, string[]> = {
  'headcount':      ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'FINANCE'],
  'leave-summary':  ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
  'leave-balances': ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
  'doc-expiry':     ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'FINANCE'],
  'contracts':      ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'FINANCE'],
  'audit-trail':    ['SUPER_ADMIN'],
  'employee-movement': ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
}

const QuerySchema = z.object({
  type:   z.enum(['headcount', 'leave-summary', 'leave-balances', 'doc-expiry', 'contracts', 'audit-trail', 'employee-movement']),
  entity: z.string().uuid().optional(),
  dept:   z.string().uuid().optional(),
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  window: z.coerce.number().int().min(1).max(365).optional(),
  status: z.string().optional(),
  person: z.string().uuid().optional(),   // direct-report employee filter (MANAGER)
  ltype:  z.string().uuid().optional(),   // leave type filter
  // ── Employee Movement report filters ──────────────────────────────────────
  bu:         z.string().uuid().optional(),
  job:        z.string().uuid().optional(),
  position:   z.string().uuid().optional(),
  grade:      z.string().uuid().optional(),
  manager:    z.string().uuid().optional(),
  actionType: z.string().optional(),
  q:          z.string().optional(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const url    = new URL(req.url)
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_query' }, { status: 400 })

  const { type, entity, dept, from, to, window: expiryWindow, status, person, ltype,
          bu, job, position, grade, manager, actionType, q } = parsed.data
  const role     = session.user.role
  const isManager = role === 'MANAGER'
  const entityId = session.user.legalEntityId ?? null
  const personId = session.user.personId ?? null
  const isSA     = role === 'SUPER_ADMIN'

  const allowed = ROLE_ACCESS[type]
  if (!allowed.includes(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const scopeEntityId = isSA ? (entity ?? null) : (entityId ?? null)

  let csvBody = ''
  const filename = `${type}-${new Date().toISOString().slice(0, 10)}.csv`

  // ── 1. Headcount ──────────────────────────────────────────────────────────
  if (type === 'headcount') {
    const conds = [eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)]
    if (scopeEntityId) conds.push(eq(departments.legalEntityId, scopeEntityId))
    if (dept)          conds.push(eq(departments.id, dept))

    const rows = await db
      .select({
        deptNameEn:   departments.nameEn,
        deptNameAr:   departments.nameAr,
        entityNameEn: legalEntities.nameEn,
        active:       sql<number>`count(${persons.id})::int`,
      })
      .from(departments)
      .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
      .leftJoin(persons, and(
        eq(persons.currentDepartmentId, departments.id),
        eq(persons.assignmentStatus, 'ACTIVE'),
        eq(persons.isActive, true),
      ))
      .where(and(...conds))
      .groupBy(departments.id, departments.nameEn, departments.nameAr, legalEntities.nameEn)
      .orderBy(desc(sql<number>`count(${persons.id})`))

    csvBody = buildCsv(
      ['department_en', 'department_ar', 'entity', 'headcount'],
      rows.map(r => [r.deptNameEn, r.deptNameAr ?? '', r.entityNameEn ?? '', r.active]),
    )
  }

  // ── 2. Leave Summary ──────────────────────────────────────────────────────
  if (type === 'leave-summary') {
    const conds = [eq(absenceEntries.tenantId, TENANT_ID)]
    // MANAGER: team allow-list is the authority (mirrors the report page) —
    // skip the redundant entity filter so CSV matches the on-screen rows.
    if (scopeEntityId && !isManager) conds.push(eq(absenceEntries.legalEntityId, scopeEntityId))
    if (from)   conds.push(gte(absenceEntries.startDate, from))
    if (to)     conds.push(lte(absenceEntries.endDate, to))
    if (status) conds.push(eq(absenceEntries.status, status))
    if (ltype)  conds.push(eq(absenceEntries.absenceTypeId, ltype))

    if (isManager && personId) {
      const team = await db.select({ id: persons.id }).from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.lineManagerId, personId), eq(persons.isActive, true)))
      const scope = resolveManagerPersonScope(team.map(t => t.id), person)
      conds.push(scope.mode === 'NO_TEAM'
        ? sql`1=0`
        : inArray(absenceEntries.personId, scope.personIds))
    }
    if (dept && !isManager) {
      const dp = await db.select({ id: persons.id }).from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, dept), eq(persons.isActive, true)))
      const ids = dp.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(absenceEntries.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        requestNumber: absenceEntries.requestNumber,
        personNameEn:  persons.fullNameEn,
        personNameAr:  persons.fullNameAr,
        deptNameEn:    departments.nameEn,
        typeNameEn:    absenceTypes.typeNameEn,
        startDate:     absenceEntries.startDate,
        endDate:       absenceEntries.endDate,
        durationDays:  absenceEntries.durationDays,
        status:        absenceEntries.status,
      })
      .from(absenceEntries)
      .leftJoin(persons,      eq(absenceEntries.personId, persons.id))
      .leftJoin(departments,  eq(persons.currentDepartmentId, departments.id))
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(...conds))
      .orderBy(desc(absenceEntries.startDate))
      .limit(5000)

    csvBody = buildCsv(
      ['request_number', 'employee_en', 'employee_ar', 'department', 'leave_type', 'start_date', 'end_date', 'days', 'status'],
      rows.map(r => [r.requestNumber, r.personNameEn ?? '', r.personNameAr ?? '', r.deptNameEn ?? '', r.typeNameEn ?? '', r.startDate ?? '', r.endDate ?? '', r.durationDays ?? '', r.status ?? '']),
    )
  }

  // ── 3. Leave Balances ─────────────────────────────────────────────────────
  if (type === 'leave-balances') {
    const year  = new Date().getUTCFullYear()
    const conds = [eq(absenceBalances.tenantId, TENANT_ID), eq(absenceBalances.balanceYear, year)]
    if (scopeEntityId) conds.push(eq(absenceBalances.legalEntityId, scopeEntityId))
    if (ltype)         conds.push(eq(absenceBalances.absenceTypeId, ltype))

    if (isManager && personId) {
      const team = await db.select({ id: persons.id }).from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.lineManagerId, personId), eq(persons.isActive, true)))
      const scope = resolveManagerPersonScope(team.map(t => t.id), person)
      conds.push(scope.mode === 'NO_TEAM'
        ? sql`1=0`
        : inArray(absenceBalances.personId, scope.personIds))
    }
    if (dept && !isManager) {
      const dp = await db.select({ id: persons.id }).from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, dept), eq(persons.isActive, true)))
      const ids = dp.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(absenceBalances.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        personNumber: persons.personNumber,
        personNameEn: persons.fullNameEn,
        personNameAr: persons.fullNameAr,
        deptNameEn:   departments.nameEn,
        typeNameEn:   absenceTypes.typeNameEn,
        opening:      absenceBalances.openingBalanceDays,
        accrued:      absenceBalances.accruedDays,
        taken:        absenceBalances.takenDays,
        pending:      absenceBalances.pendingDays,
        closing:      absenceBalances.closingBalanceDays,
      })
      .from(absenceBalances)
      .leftJoin(persons,      eq(absenceBalances.personId, persons.id))
      .leftJoin(departments,  eq(persons.currentDepartmentId, departments.id))
      .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(and(...conds))
      .orderBy(asc(persons.personNumber), asc(absenceTypes.typeNameEn))
      .limit(5000)

    csvBody = buildCsv(
      ['emp_number', 'employee_en', 'employee_ar', 'department', 'leave_type', 'opening', 'accrued', 'taken', 'pending', 'closing', 'year'],
      rows.map(r => [r.personNumber ?? '', r.personNameEn ?? '', r.personNameAr ?? '', r.deptNameEn ?? '', r.typeNameEn ?? '', r.opening ?? 0, r.accrued ?? 0, r.taken ?? 0, r.pending ?? 0, r.closing ?? 0, year]),
    )
  }

  // ── 4. Document Expiry ────────────────────────────────────────────────────
  if (type === 'doc-expiry') {
    const winDays = expiryWindow ?? 90
    const today   = new Date().toISOString().slice(0, 10)
    const winEnd  = new Date(Date.now() + winDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const conds = [eq(personDocuments.tenantId, TENANT_ID), gte(personDocuments.expiryDate, today), lte(personDocuments.expiryDate, winEnd)]
    if (scopeEntityId) conds.push(eq(personDocuments.legalEntityId, scopeEntityId))
    if (dept) {
      const dp = await db.select({ id: persons.id }).from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, dept), eq(persons.isActive, true)))
      const ids = dp.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(personDocuments.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        personNumber:  persons.personNumber,
        personNameEn:  persons.fullNameEn,
        personNameAr:  persons.fullNameAr,
        deptNameEn:    departments.nameEn,
        documentType:  personDocuments.documentType,
        documentTitle: personDocuments.documentTitle,
        expiryDate:    personDocuments.expiryDate,
        status:        personDocuments.documentStatus,
      })
      .from(personDocuments)
      .leftJoin(persons,     eq(personDocuments.personId, persons.id))
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(and(...conds))
      .orderBy(asc(personDocuments.expiryDate))
      .limit(2000)

    csvBody = buildCsv(
      ['emp_number', 'employee_en', 'employee_ar', 'department', 'doc_type', 'doc_title', 'expiry_date', 'status'],
      rows.map(r => [r.personNumber ?? '', r.personNameEn ?? '', r.personNameAr ?? '', r.deptNameEn ?? '', r.documentType, r.documentTitle, r.expiryDate ?? '', r.status]),
    )
  }

  // ── 5. Contract Renewals ──────────────────────────────────────────────────
  if (type === 'contracts') {
    const winDays = expiryWindow ?? 90
    const today   = new Date().toISOString().slice(0, 10)
    const winEnd  = new Date(Date.now() + winDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const conds = [eq(contracts.tenantId, TENANT_ID), eq(contracts.status, 'ACTIVE'), gte(contracts.endDate, today), lte(contracts.endDate, winEnd)]
    if (scopeEntityId) conds.push(eq(contracts.legalEntityId, scopeEntityId))
    if (dept) {
      const dp = await db.select({ id: persons.id }).from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.currentDepartmentId, dept), eq(persons.isActive, true)))
      const ids = dp.map(p => p.id)
      if (ids.length > 0) conds.push(inArray(contracts.personId, ids))
      else conds.push(sql`1=0`)
    }

    const rows = await db
      .select({
        contractNumber: contracts.contractNumber,
        personNumber:   persons.personNumber,
        personNameEn:   persons.fullNameEn,
        personNameAr:   persons.fullNameAr,
        deptNameEn:     departments.nameEn,
        contractType:   contracts.contractType,
        startDate:      contracts.startDate,
        endDate:        contracts.endDate,
        renewalCount:   contracts.renewalCount,
      })
      .from(contracts)
      .leftJoin(persons,     eq(contracts.personId, persons.id))
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(and(...conds))
      .orderBy(asc(contracts.endDate))
      .limit(2000)

    csvBody = buildCsv(
      ['contract_number', 'emp_number', 'employee_en', 'employee_ar', 'department', 'type', 'start_date', 'end_date', 'renewals'],
      rows.map(r => [r.contractNumber, r.personNumber ?? '', r.personNameEn ?? '', r.personNameAr ?? '', r.deptNameEn ?? '', r.contractType, r.startDate ?? '', r.endDate ?? '', r.renewalCount]),
    )
  }

  // ── 6. Audit Trail ────────────────────────────────────────────────────────
  if (type === 'audit-trail') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const conds = [eq(auditLog.tenantId, TENANT_ID), gte(auditLog.eventTime, sevenDaysAgo)]
    if (from) conds.push(gte(auditLog.eventTime, new Date(from)))
    if (to)   conds.push(lte(auditLog.eventTime, new Date(to + 'T23:59:59Z')))

    const rows = await db
      .select({
        eventTime:    auditLog.eventTime,
        actorName:    auditLog.actorName,
        actorRole:    auditLog.actorRole,
        eventType:    auditLog.eventType,
        resourceType: auditLog.resourceType,
        channel:      auditLog.channel,
        ipAddress:    auditLog.ipAddress,
        description:  auditLog.description,
      })
      .from(auditLog)
      .where(and(...conds))
      .orderBy(desc(auditLog.eventTime))
      .limit(5000)

    csvBody = buildCsv(
      ['event_time', 'actor', 'role', 'event_type', 'resource_type', 'channel', 'ip_address', 'description'],
      rows.map(r => [
        r.eventTime ? new Date(r.eventTime).toISOString() : '',
        r.actorName, r.actorRole, r.eventType, r.resourceType, r.channel,
        r.ipAddress ?? '', r.description ?? '',
      ]),
    )
  }

  // ── 7. Employee Movement ──────────────────────────────────────────────────
  // Reuses getEmployeeMovement(): identical RBAC scope (manager→team,
  // HR→entity, SA→all), identical filters, and the same salary exclusion as the
  // on-screen report. NON-SENSITIVE columns only — no salary/compensation.
  if (type === 'employee-movement') {
    const filters: MovementFilters = {
      entity, bu, dept, job, position, grade, manager, from, to, actionType,
      status: (status as TemporalState) || undefined,
      q,
    }
    let result: Awaited<ReturnType<typeof getEmployeeMovement>>
    try {
      result = await getEmployeeMovement(session.user, filters)
    } catch (e) {
      // REPORTS:view matrix deny → 403 (no data leak).
      if (e instanceof Error && e.message.startsWith('FORBIDDEN')) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      throw e
    }
    // Never silently export an incomplete (capped) result set.
    if (result.truncated) {
      return NextResponse.json(
        { error: 'Export result exceeds the row limit. Please narrow filters and try again.' },
        { status: 400 },
      )
    }
    const rows = result.rows
    csvBody = buildCsv(
      ['emp_number', 'employee_en', 'employee_ar', 'effective_start', 'effective_end',
       'state', 'change_type', 'change_mode', 'department', 'position', 'job', 'grade',
       'business_unit', 'company', 'location', 'line_manager', 'assignment_status', 'reason'],
      rows.map(r => [
        r.personNumber, r.fullNameEn ?? '', r.fullNameAr,
        r.effectiveStartDate, r.effectiveEndDate, r.temporalState,
        r.actionType, r.actionMode,
        r.departmentEn ?? '', r.positionEn ?? '', r.jobEn ?? '', r.gradeEn ?? '',
        r.businessUnitEn ?? '', r.legalEntityEn ?? '', r.locationEn ?? '',
        r.lineManagerEn ?? '', r.assignmentStatus, r.actionReason ?? '',
      ]),
    )
  }

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
