/**
 * Employee Assignment History report — data layer.
 *
 * HISTORY-ONLY report (read-only). It deliberately reads the FULL effective-dated
 * timeline (every worker_assignments slice, not just isCurrent) plus the immutable
 * employment_actions narrative — so it answers: what happened to the employee over
 * time, what changed and when, who the current manager is, and how many promotions /
 * grade changes / transfers / manager changes occurred.
 *
 * It does NOT touch any operational read path: aggregate reports and workflows
 * continue to read the current/active record. This module is additive.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  workerAssignments, employmentActions, persons, positions, grades, departments,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import type { SessionUser } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'

const HR_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

// ── Pure summary computation (unit-testable, no DB) ─────────────────────────

export interface ActionForSummary {
  actionType:        string
  beforeGradeId:     string | null
  afterGradeId:      string | null
  beforeManagerId:   string | null
  afterManagerId:    string | null
  beforeDepartmentId:string | null
  afterDepartmentId: string | null
  beforePositionId:  string | null
  afterPositionId:   string | null
}

export interface HistorySummary {
  totalActions:    number
  promotions:      number
  demotions:       number
  gradeChanges:    number
  transfers:       number
  managerChanges:  number
  positionChanges: number
}

/**
 * Counts lifecycle events from the employment_actions narrative.
 * Promotions/demotions key off actionType; grade/manager/dept/position changes
 * key off an actual before≠after value difference (a TRANSFER that didn't move
 * department, for example, won't be counted as a department change).
 */
export function summariseEmploymentActions(actions: ActionForSummary[]): HistorySummary {
  const changed = (a: string | null, b: string | null) => (a ?? null) !== (b ?? null)
  return {
    totalActions:    actions.length,
    promotions:      actions.filter(a => a.actionType === 'PROMOTION').length,
    demotions:       actions.filter(a => a.actionType === 'DEMOTION').length,
    gradeChanges:    actions.filter(a => changed(a.beforeGradeId, a.afterGradeId)).length,
    transfers:       actions.filter(a => changed(a.beforeDepartmentId, a.afterDepartmentId)).length,
    managerChanges:  actions.filter(a => changed(a.beforeManagerId, a.afterManagerId)).length,
    positionChanges: actions.filter(a => changed(a.beforePositionId, a.afterPositionId)).length,
  }
}

// ── Types returned to the page ──────────────────────────────────────────────

export interface HistoryTimelineRow {
  assignmentId:       string
  assignmentNumber:   string
  effectiveStartDate: string
  effectiveEndDate:   string
  isCurrent:          boolean
  actionType:         string
  actionMode:         string
  assignmentStatus:   string
  positionTitle:      string | null
  gradeName:          string | null
  departmentName:     string | null
  managerName:        string | null
}

export interface HistoryActionRow {
  actionType:    string
  actionMode?:   string
  effectiveDate: string
  reasonText:    string | null
  fromGrade:     string | null
  toGrade:       string | null
  fromManager:   string | null
  toManager:     string | null
  fromDept:      string | null
  toDept:        string | null
  fromPosition:  string | null
  toPosition:    string | null
}

export interface EmployeeHistory {
  person: {
    id: string; personNumber: string; fullNameEn: string | null; fullNameAr: string
    hireDate: string; assignmentStatus: string; legalEntityId: string
  }
  current: {
    positionTitle: string | null; gradeName: string | null
    departmentName: string | null; managerName: string | null; since: string | null
  }
  summary:  HistorySummary
  timeline: HistoryTimelineRow[]
  actions:  HistoryActionRow[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function buildNameMaps(ids: {
  positionIds: string[]; gradeIds: string[]; deptIds: string[]; personIds: string[]
}) {
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))] as string[]
  const [pos, grd, dep, ppl] = await Promise.all([
    uniq(ids.positionIds).length
      ? db.select({ id: positions.id, t: positions.positionTitleEn }).from(positions).where(inArray(positions.id, uniq(ids.positionIds)))
      : Promise.resolve([] as { id: string; t: string }[]),
    uniq(ids.gradeIds).length
      ? db.select({ id: grades.id, t: grades.gradeNameEn }).from(grades).where(inArray(grades.id, uniq(ids.gradeIds)))
      : Promise.resolve([] as { id: string; t: string }[]),
    uniq(ids.deptIds).length
      ? db.select({ id: departments.id, t: departments.nameEn }).from(departments).where(inArray(departments.id, uniq(ids.deptIds)))
      : Promise.resolve([] as { id: string; t: string }[]),
    uniq(ids.personIds).length
      ? db.select({ id: persons.id, t: persons.fullNameEn }).from(persons).where(inArray(persons.id, uniq(ids.personIds)))
      : Promise.resolve([] as { id: string; t: string | null }[]),
  ])
  const m = (rows: { id: string; t: string | null }[]) => new Map(rows.map(r => [r.id, r.t]))
  return { pos: m(pos), grd: m(grd), dep: m(dep), ppl: m(ppl) }
}

// ── Employee picker (entity-scoped) ─────────────────────────────────────────

export async function listHistoryEmployees(user: SessionUser, search = ''): Promise<
  { id: string; personNumber: string; fullNameEn: string | null; fullNameAr: string }[]
> {
  // P3-D2: feature-permission layer (legacy-allow if no REPORTS row configured)
  await requirePermission(user, 'REPORTS', 'view')
  const conds = [eq(persons.tenantId, TENANT_ID)]
  if (user.role !== 'SUPER_ADMIN') conds.push(eq(persons.legalEntityId, user.legalEntityId))
  const rows = await db
    .select({ id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
    .from(persons)
    .where(and(...conds))
    .orderBy(asc(persons.personNumber))
    .limit(1000)
  const q = search.trim().toLowerCase()
  return q
    ? rows.filter(r =>
        r.personNumber.toLowerCase().includes(q) ||
        (r.fullNameEn ?? '').toLowerCase().includes(q) ||
        r.fullNameAr.includes(search.trim()))
    : rows.slice(0, 50)
}

// ── Main: full assignment history for one employee ──────────────────────────

export async function getEmployeeAssignmentHistory(
  user: SessionUser, personId: string,
): Promise<EmployeeHistory | null> {
  const [person] = await db
    .select({
      id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn,
      fullNameAr: persons.fullNameAr, hireDate: persons.hireDate,
      assignmentStatus: persons.assignmentStatus, legalEntityId: persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (!person) return null

  // Entity scope — HR sees only their own entity (SUPER_ADMIN sees all).
  if (!HR_ROLES.has(user.role)) return null
  if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) return null

  // Full effective-dated timeline (ALL slices, oldest first).
  const slices = await db
    .select()
    .from(workerAssignments)
    .where(and(eq(workerAssignments.tenantId, TENANT_ID), eq(workerAssignments.personId, personId)))
    .orderBy(asc(workerAssignments.effectiveStartDate), asc(workerAssignments.effectiveSequence))

  // Immutable change narrative (oldest first).
  const actions = await db
    .select()
    .from(employmentActions)
    .where(and(eq(employmentActions.tenantId, TENANT_ID), eq(employmentActions.personId, personId)))
    .orderBy(asc(employmentActions.effectiveDate), asc(employmentActions.actionDate))

  // Resolve names in one batched pass.
  const names = await buildNameMaps({
    positionIds: [...slices.map(s => s.positionId), ...actions.flatMap(a => [a.beforePositionId, a.afterPositionId])].filter(Boolean) as string[],
    gradeIds:    [...slices.map(s => s.gradeId), ...actions.flatMap(a => [a.beforeGradeId, a.afterGradeId])].filter(Boolean) as string[],
    deptIds:     [...slices.map(s => s.departmentId), ...actions.flatMap(a => [a.beforeDepartmentId, a.afterDepartmentId])].filter(Boolean) as string[],
    personIds:   [...slices.map(s => s.lineManagerId), ...actions.flatMap(a => [a.beforeManagerId, a.afterManagerId])].filter(Boolean) as string[],
  })

  const timeline: HistoryTimelineRow[] = slices.map(s => ({
    assignmentId:       s.id,
    assignmentNumber:   s.assignmentNumber,
    effectiveStartDate: String(s.effectiveStartDate),
    effectiveEndDate:   String(s.effectiveEndDate),
    isCurrent:          s.isCurrent,
    actionType:         s.actionType,
    actionMode:         s.actionMode,
    assignmentStatus:   s.assignmentStatus,
    positionTitle:      s.positionId ? names.pos.get(s.positionId) ?? null : null,
    gradeName:          s.gradeId ? names.grd.get(s.gradeId) ?? null : null,
    departmentName:     s.departmentId ? names.dep.get(s.departmentId) ?? null : null,
    managerName:        s.lineManagerId ? names.ppl.get(s.lineManagerId) ?? null : null,
  }))

  const actionRows: HistoryActionRow[] = actions.map(a => ({
    actionType:    a.actionType,
    effectiveDate: String(a.effectiveDate),
    reasonText:    a.reasonText ?? null,
    fromGrade:     a.beforeGradeId ? names.grd.get(a.beforeGradeId) ?? null : null,
    toGrade:       a.afterGradeId ? names.grd.get(a.afterGradeId) ?? null : null,
    fromManager:   a.beforeManagerId ? names.ppl.get(a.beforeManagerId) ?? null : null,
    toManager:     a.afterManagerId ? names.ppl.get(a.afterManagerId) ?? null : null,
    fromDept:      a.beforeDepartmentId ? names.dep.get(a.beforeDepartmentId) ?? null : null,
    toDept:        a.afterDepartmentId ? names.dep.get(a.afterDepartmentId) ?? null : null,
    fromPosition:  a.beforePositionId ? names.pos.get(a.beforePositionId) ?? null : null,
    toPosition:    a.afterPositionId ? names.pos.get(a.afterPositionId) ?? null : null,
  }))

  const summary = summariseEmploymentActions(actions as ActionForSummary[])

  const cur = slices.find(s => s.isCurrent) ?? slices[slices.length - 1]
  const current = {
    positionTitle:  cur?.positionId ? names.pos.get(cur.positionId) ?? null : null,
    gradeName:      cur?.gradeId ? names.grd.get(cur.gradeId) ?? null : null,
    departmentName: cur?.departmentId ? names.dep.get(cur.departmentId) ?? null : null,
    managerName:    cur?.lineManagerId ? names.ppl.get(cur.lineManagerId) ?? null : null,
    since:          cur ? String(cur.effectiveStartDate) : null,
  }

  return { person: { ...person, hireDate: String(person.hireDate) }, current, summary, timeline, actions: actionRows }
}
