/**
 * Employee Movement Report — data layer (HISTORY-ONLY, read-only).
 *
 * Cross-employee view of the effective-dated worker_assignments timeline:
 * every assignment slice (past / current / future) for the employees in the
 * caller's security scope, with rich filters. Built for HR Admin, Super Admin
 * and Managers (direct team). NON-SENSITIVE fields only — never salary.
 *
 * SECURITY (mirrors existing scope; no RBAC broadening):
 *   • SUPER_ADMIN ............ all employees (optional entity filter)
 *   • HR_ADMIN / HR_DIRECTOR . own legal entity only (entity scope forced)
 *   • MANAGER ................ direct reports only (DB-resolved, this phase)
 *   • everyone else .......... no access (empty result)
 *
 * This module is additive: it does not touch any operational read path.
 */
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import {
  workerAssignments, persons, positions, jobs, grades,
  departments, businessUnits, legalEntities, locations,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import type { SessionUser } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { classifyTemporal, type TemporalState } from '@/modules/core-hr/assignment-history'

const MOVEMENT_ROLES = new Set(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
const RESULT_LIMIT = 2000

/**
 * Authorised person scope for the movement report/export and filter options.
 * Single source of truth — mirrors getPerson() / employee-history scope and is
 * resolved from the person's CURRENT legal entity (NOT a historical assignment
 * slice), so an employee who has since moved entities cannot leak.
 *
 *   • SUPER_ADMIN ............ ALL persons (optional entity filter, by current entity)
 *   • HR_ADMIN / HR_DIRECTOR . ENTITY — persons whose current legalEntityId = user's
 *   • MANAGER ................ PERSONS — direct reports only (DB-resolved)
 *   • everyone else .......... NONE (denied)
 *
 * URL params can only NARROW within scope, never widen it.
 */
type MovementScope =
  | { kind: 'ALL'; entityFilter: string | null }
  | { kind: 'ENTITY'; entityId: string }
  | { kind: 'PERSONS'; ids: string[] }
  | { kind: 'NONE' }

export async function resolveMovementScope(user: SessionUser, requestedEntity?: string): Promise<MovementScope> {
  if (!MOVEMENT_ROLES.has(user.role)) return { kind: 'NONE' }
  if (user.role === 'SUPER_ADMIN') return { kind: 'ALL', entityFilter: requestedEntity ?? null }
  if (user.role === 'HR_ADMIN' || user.role === 'HR_DIRECTOR') {
    return { kind: 'ENTITY', entityId: user.legalEntityId }
  }
  // MANAGER — direct reports only. requestedEntity is ignored (cannot widen).
  if (!user.personId) return { kind: 'NONE' }
  const ids = await directReportIds(user.personId)
  return ids.length ? { kind: 'PERSONS', ids } : { kind: 'NONE' }
}

/** Person-scope SQL condition (applied to the `persons` table) for a resolved scope. */
function personScopeCondition(scope: MovementScope) {
  switch (scope.kind) {
    case 'ALL':     return scope.entityFilter ? eq(persons.legalEntityId, scope.entityFilter) : undefined
    case 'ENTITY':  return eq(persons.legalEntityId, scope.entityId)
    case 'PERSONS': return inArray(persons.id, scope.ids)
    case 'NONE':    return sql`1=0`
  }
}

/**
 * Movement / change action types (organisational / role categories only).
 *
 * SALARY_REVISION is deliberately EXCLUDED: a pay-only revision carries no
 * org/role movement and would constitute salary-change history, which is out of
 * scope for this workstream. Such slices are also filtered out of the results.
 */
export const MOVEMENT_ACTION_TYPES = [
  'HIRE', 'TRANSFER', 'PROMOTION', 'DEMOTION',
  'CONTRACT_EXTEND', 'SUSPEND', 'REINSTATE', 'TERMINATE', 'RETIRE',
  'SECONDMENT', 'RETURN_FROM_SECONDMENT',
] as const

export interface MovementFilters {
  entity?:     string   // legal entity (company)
  bu?:         string   // business unit
  dept?:       string
  job?:        string
  position?:   string
  grade?:      string
  manager?:    string   // line manager personId
  from?:       string   // effective date range start (yyyy-mm-dd)
  to?:         string   // effective date range end (yyyy-mm-dd)
  actionType?: string
  status?:     TemporalState   // CURRENT | PAST | FUTURE
  q?:          string   // employee name / number search
}

export interface MovementRow {
  personId:           string
  personNumber:       string
  fullNameEn:         string | null
  fullNameAr:         string
  effectiveStartDate: string
  effectiveEndDate:   string
  temporalState:      TemporalState
  isCurrent:          boolean
  assignmentStatus:   string
  actionType:         string
  actionMode:         string
  actionReason:       string | null
  departmentEn:       string | null
  departmentAr:       string | null
  positionEn:         string | null
  positionAr:         string | null
  jobEn:              string | null
  jobAr:              string | null
  gradeEn:            string | null
  gradeAr:            string | null
  businessUnitEn:     string | null
  businessUnitAr:     string | null
  legalEntityEn:      string | null
  legalEntityAr:      string | null
  locationEn:         string | null
  locationAr:         string | null
  lineManagerEn:      string | null
  lineManagerAr:      string | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Direct-report personIds for a manager (mirrors isManagerDirectReport OR-logic). */
async function directReportIds(managerPersonId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT p.id
    FROM   persons p
    LEFT JOIN worker_assignments wa
           ON wa.person_id  = p.id
          AND wa.tenant_id  = ${TENANT_ID}::uuid
          AND wa.is_current = true
    WHERE  p.tenant_id = ${TENANT_ID}::uuid
      AND (p.line_manager_id = ${managerPersonId}::uuid OR wa.line_manager_id = ${managerPersonId}::uuid)
  `)
  return rows.map(r => r.id)
}

/**
 * Returns the scoped, filtered movement rows. `truncated` is true when the
 * result hit the row cap (so the UI can warn instead of silently dropping).
 */
export async function getEmployeeMovement(
  user: SessionUser,
  filters: MovementFilters = {},
): Promise<{ rows: MovementRow[]; truncated: boolean }> {
  if (!MOVEMENT_ROLES.has(user.role)) return { rows: [], truncated: false }
  // Feature-permission gate (matches employee-history report). Throws FORBIDDEN
  // on an explicit matrix deny; legacy-allow when no REPORTS row is configured.
  await requirePermission(user, 'REPORTS', 'view')

  const scope = await resolveMovementScope(user, filters.entity)
  if (scope.kind === 'NONE') return { rows: [], truncated: false }

  const today = todayISO()

  // Exclude pay-only salary revisions — out of scope (no salary history).
  const conds = [
    eq(workerAssignments.tenantId, TENANT_ID),
    ne(workerAssignments.actionType, 'SALARY_REVISION'),
  ]

  // ── Security scope (by CURRENT person entity / direct reports) ──────────────
  const scopeCond = personScopeCondition(scope)
  if (scopeCond) conds.push(scopeCond)

  // ── Attribute filters (can only NARROW within scope) ───────────────────────
  if (filters.bu)         conds.push(eq(workerAssignments.businessUnitId, filters.bu))
  if (filters.dept)       conds.push(eq(workerAssignments.departmentId, filters.dept))
  if (filters.job)        conds.push(eq(workerAssignments.jobId, filters.job))
  if (filters.position)   conds.push(eq(workerAssignments.positionId, filters.position))
  if (filters.grade)      conds.push(eq(workerAssignments.gradeId, filters.grade))
  if (filters.manager)    conds.push(eq(workerAssignments.lineManagerId, filters.manager))
  if (filters.actionType && filters.actionType !== 'SALARY_REVISION') {
    conds.push(eq(workerAssignments.actionType, filters.actionType))
  }
  // Effective-date range = slices overlapping [from, to].
  if (filters.from)       conds.push(gte(workerAssignments.effectiveEndDate, filters.from))
  if (filters.to)         conds.push(lte(workerAssignments.effectiveStartDate, filters.to))

  // Temporal status filter — applied in-query BEFORE the limit (parameterised).
  if (filters.status === 'CURRENT') {
    conds.push(lte(workerAssignments.effectiveStartDate, today), gte(workerAssignments.effectiveEndDate, today))
  } else if (filters.status === 'PAST') {
    conds.push(lt(workerAssignments.effectiveEndDate, today))
  } else if (filters.status === 'FUTURE') {
    conds.push(gt(workerAssignments.effectiveStartDate, today))
  }

  // Employee search — parameterised ILIKE before the limit (no injection risk).
  const q = filters.q?.trim()
  if (q) {
    const like = `%${q}%`
    conds.push(or(
      ilike(persons.personNumber, like),
      ilike(persons.fullNameEn, like),
      ilike(persons.fullNameAr, like),
    )!)
  }

  const mgr = alias(persons, 'movement_line_manager')

  let rows = await db
    .select({
      personId:           workerAssignments.personId,
      personNumber:       persons.personNumber,
      fullNameEn:         persons.fullNameEn,
      fullNameAr:         persons.fullNameAr,
      effectiveStartDate: workerAssignments.effectiveStartDate,
      effectiveEndDate:   workerAssignments.effectiveEndDate,
      isCurrent:          workerAssignments.isCurrent,
      assignmentStatus:   workerAssignments.assignmentStatus,
      actionType:         workerAssignments.actionType,
      actionMode:         workerAssignments.actionMode,
      actionReason:       workerAssignments.actionReason,
      departmentEn:       departments.nameEn,
      departmentAr:       departments.nameAr,
      positionEn:         positions.positionTitleEn,
      positionAr:         positions.positionTitleAr,
      jobEn:              jobs.jobTitleEn,
      jobAr:              jobs.jobTitleAr,
      gradeEn:            grades.gradeNameEn,
      gradeAr:            grades.gradeNameAr,
      businessUnitEn:     businessUnits.nameEn,
      businessUnitAr:     businessUnits.nameAr,
      legalEntityEn:      legalEntities.nameEn,
      legalEntityAr:      legalEntities.nameAr,
      locationEn:         locations.nameEn,
      locationAr:         locations.nameAr,
      lineManagerEn:      mgr.fullNameEn,
      lineManagerAr:      mgr.fullNameAr,
    })
    .from(workerAssignments)
    .innerJoin(persons,      eq(workerAssignments.personId, persons.id))
    .leftJoin(departments,   eq(workerAssignments.departmentId,   departments.id))
    .leftJoin(positions,     eq(workerAssignments.positionId,     positions.id))
    .leftJoin(jobs,          eq(workerAssignments.jobId,          jobs.id))
    .leftJoin(grades,        eq(workerAssignments.gradeId,        grades.id))
    .leftJoin(businessUnits, eq(workerAssignments.businessUnitId, businessUnits.id))
    .leftJoin(legalEntities, eq(workerAssignments.legalEntityId,  legalEntities.id))
    .leftJoin(locations,     eq(workerAssignments.locationId,     locations.id))
    .leftJoin(mgr,           eq(workerAssignments.lineManagerId,  mgr.id))
    .where(and(...conds))
    .orderBy(asc(persons.personNumber), desc(workerAssignments.effectiveStartDate), desc(workerAssignments.effectiveSequence))
    .limit(RESULT_LIMIT + 1)

  const truncated = rows.length > RESULT_LIMIT
  if (truncated) rows = rows.slice(0, RESULT_LIMIT)

  // q + status are already applied in-query (before the limit), so the mapped
  // rows are the final result — no post-limit JS filtering that could drop
  // matching rows beyond the cap.
  const mapped: MovementRow[] = rows.map(r => {
    const start = String(r.effectiveStartDate)
    const end   = String(r.effectiveEndDate ?? '9999-12-31')
    return {
      personId:           r.personId,
      personNumber:       r.personNumber,
      fullNameEn:         r.fullNameEn,
      fullNameAr:         r.fullNameAr,
      effectiveStartDate: start,
      effectiveEndDate:   end,
      temporalState:      classifyTemporal(start, end, today),
      isCurrent:          r.isCurrent,
      assignmentStatus:   r.assignmentStatus,
      actionType:         r.actionType,
      actionMode:         r.actionMode,
      actionReason:       r.actionReason ?? null,
      departmentEn:       r.departmentEn ?? null,
      departmentAr:       r.departmentAr ?? null,
      positionEn:         r.positionEn ?? null,
      positionAr:         r.positionAr ?? null,
      jobEn:              r.jobEn ?? null,
      jobAr:              r.jobAr ?? null,
      gradeEn:            r.gradeEn ?? null,
      gradeAr:            r.gradeAr ?? null,
      businessUnitEn:     r.businessUnitEn ?? null,
      businessUnitAr:     r.businessUnitAr ?? null,
      legalEntityEn:      r.legalEntityEn ?? null,
      legalEntityAr:      r.legalEntityAr ?? null,
      locationEn:         r.locationEn ?? null,
      locationAr:         r.locationAr ?? null,
      lineManagerEn:      r.lineManagerEn ?? null,
      lineManagerAr:      r.lineManagerAr ?? null,
    }
  })

  return { rows: mapped, truncated }
}

// ── Scoped filter dropdown options ──────────────────────────────────────────

export interface MovementFilterOptions {
  entities:      { id: string; nameEn: string; nameAr: string }[]
  businessUnits: { id: string; nameEn: string; nameAr: string }[]
  departments:   { id: string; nameEn: string; nameAr: string | null }[]
  jobs:          { id: string; nameEn: string; nameAr: string | null }[]
  positions:     { id: string; nameEn: string; nameAr: string | null }[]
  grades:        { id: string; nameEn: string; nameAr: string | null }[]
  managers:      { id: string; nameEn: string | null; nameAr: string }[]
  actionTypes:   string[]
}

/**
 * Filter dropdown options, scoped to the SAME authorised person set as the
 * report query (no entity-wide leak):
 *   • SUPER_ADMIN ............ all master data + all persons
 *   • HR_ADMIN / HR_DIRECTOR . own-entity master data + own-entity persons
 *   • MANAGER ................ ONLY values present on direct reports' current
 *                              assignments; managers list = direct reports only
 *   • denied roles ........... empty
 */
export async function getMovementFilterOptions(user: SessionUser): Promise<MovementFilterOptions> {
  const empty: MovementFilterOptions = {
    entities: [], businessUnits: [], departments: [], jobs: [],
    positions: [], grades: [], managers: [], actionTypes: [...MOVEMENT_ACTION_TYPES],
  }
  if (!MOVEMENT_ROLES.has(user.role)) return empty
  await requirePermission(user, 'REPORTS', 'view')

  const scope = await resolveMovementScope(user)
  if (scope.kind === 'NONE') return empty

  // ── MANAGER: derive options strictly from direct reports' current rows ──────
  if (scope.kind === 'PERSONS') {
    const bu = alias(businessUnits, 'opt_bu')
    const dep = alias(departments, 'opt_dep')
    const job = alias(jobs, 'opt_job')
    const pos = alias(positions, 'opt_pos')
    const grd = alias(grades, 'opt_grade')
    const ent = alias(legalEntities, 'opt_ent')
    const rows = await db
      .select({
        personId: persons.id, personEn: persons.fullNameEn, personAr: persons.fullNameAr,
        buId: bu.id, buEn: bu.nameEn, buAr: bu.nameAr,
        depId: dep.id, depEn: dep.nameEn, depAr: dep.nameAr,
        jobId: job.id, jobEn: job.jobTitleEn, jobAr: job.jobTitleAr,
        posId: pos.id, posEn: pos.positionTitleEn, posAr: pos.positionTitleAr,
        grdId: grd.id, grdEn: grd.gradeNameEn, grdAr: grd.gradeNameAr,
        entId: ent.id, entEn: ent.nameEn, entAr: ent.nameAr,
      })
      .from(persons)
      .leftJoin(workerAssignments, and(
        eq(workerAssignments.personId, persons.id),
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.isCurrent, true),
      ))
      .leftJoin(bu,  eq(workerAssignments.businessUnitId, bu.id))
      .leftJoin(dep, eq(workerAssignments.departmentId, dep.id))
      .leftJoin(job, eq(workerAssignments.jobId, job.id))
      .leftJoin(pos, eq(workerAssignments.positionId, pos.id))
      .leftJoin(grd, eq(workerAssignments.gradeId, grd.id))
      .leftJoin(ent, eq(workerAssignments.legalEntityId, ent.id))
      .where(and(eq(persons.tenantId, TENANT_ID), inArray(persons.id, scope.ids)))

    const dedup = <T extends { id: string }>(arr: T[]) => {
      const m = new Map<string, T>()
      for (const x of arr) if (x.id) m.set(x.id, x)
      return [...m.values()]
    }
    return {
      entities:      dedup(rows.filter(r => r.entId).map(r => ({ id: r.entId!, nameEn: r.entEn!, nameAr: r.entAr! }))),
      businessUnits: dedup(rows.filter(r => r.buId).map(r => ({ id: r.buId!, nameEn: r.buEn!, nameAr: r.buAr! }))),
      departments:   dedup(rows.filter(r => r.depId).map(r => ({ id: r.depId!, nameEn: r.depEn!, nameAr: r.depAr }))),
      jobs:          dedup(rows.filter(r => r.jobId).map(r => ({ id: r.jobId!, nameEn: r.jobEn!, nameAr: r.jobAr }))),
      positions:     dedup(rows.filter(r => r.posId).map(r => ({ id: r.posId!, nameEn: r.posEn!, nameAr: r.posAr }))),
      grades:        dedup(rows.filter(r => r.grdId).map(r => ({ id: r.grdId!, nameEn: r.grdEn!, nameAr: r.grdAr }))),
      // Managers list = direct reports only (no entity-wide person leak).
      managers:      dedup(rows.map(r => ({ id: r.personId, nameEn: r.personEn, nameAr: r.personAr }))),
      actionTypes:   [...MOVEMENT_ACTION_TYPES],
    }
  }

  // ── ENTITY (HR) / ALL (SA): entity-scoped or global master data ─────────────
  const entityScoped = scope.kind === 'ENTITY'
  const entId = entityScoped ? scope.entityId : ''

  const [entities, bus, depts, jobRows, posRows, gradeRows, mgrRows] = await Promise.all([
    db.select({ id: legalEntities.id, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
      .from(legalEntities)
      .where(entityScoped ? and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.id, entId)) : eq(legalEntities.tenantId, TENANT_ID))
      .orderBy(asc(legalEntities.nameEn)),
    db.select({ id: businessUnits.id, nameEn: businessUnits.nameEn, nameAr: businessUnits.nameAr })
      .from(businessUnits)
      .where(and(eq(businessUnits.tenantId, TENANT_ID), ...(entityScoped ? [eq(businessUnits.legalEntityId, entId)] : [])))
      .orderBy(asc(businessUnits.nameEn)),
    db.select({ id: departments.id, nameEn: departments.nameEn, nameAr: departments.nameAr })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), ...(entityScoped ? [eq(departments.legalEntityId, entId)] : [])))
      .orderBy(asc(departments.nameEn)),
    db.select({ id: jobs.id, nameEn: jobs.jobTitleEn, nameAr: jobs.jobTitleAr })
      .from(jobs)
      .where(and(eq(jobs.tenantId, TENANT_ID), ...(entityScoped ? [eq(jobs.legalEntityId, entId)] : [])))
      .orderBy(asc(jobs.jobTitleEn)),
    db.select({ id: positions.id, nameEn: positions.positionTitleEn, nameAr: positions.positionTitleAr })
      .from(positions)
      .where(and(eq(positions.tenantId, TENANT_ID), ...(entityScoped ? [eq(positions.legalEntityId, entId)] : [])))
      .orderBy(asc(positions.positionTitleEn)),
    db.select({ id: grades.id, nameEn: grades.gradeNameEn, nameAr: grades.gradeNameAr })
      .from(grades)
      .where(and(eq(grades.tenantId, TENANT_ID), ...(entityScoped ? [eq(grades.legalEntityId, entId)] : [])))
      .orderBy(asc(grades.gradeNameEn)),
    db.select({ id: persons.id, nameEn: persons.fullNameEn, nameAr: persons.fullNameAr })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), ...(entityScoped ? [eq(persons.legalEntityId, entId)] : [])))
      .orderBy(asc(persons.fullNameEn))
      .limit(1000),
  ])

  return {
    entities, businessUnits: bus, departments: depts, jobs: jobRows,
    positions: posRows, grades: gradeRows, managers: mgrRows,
    actionTypes: [...MOVEMENT_ACTION_TYPES],
  }
}
