/**
 * Shared, security-scoped Employee Assignment History reader.
 *
 * SINGLE SOURCE OF TRUTH for the effective-dated worker_assignments timeline,
 * consumed by every surface in the Employee Assignment History workstream:
 *   • Employee Self-Service profile      (self)
 *   • Manager team-member profile        (direct reports)
 *   • HR Admin / Super Admin person page (entity-scoped / all)
 *   • Employee Movement report + export  (Phase 5 / 7)
 *
 * It returns the FULL timeline (past / current / future slices) with
 * NON-SENSITIVE assignment fields only.
 *
 * ── SECURITY ────────────────────────────────────────────────────────────────
 * Access is decided by {@link decideHistoryAccess} — a pure, unit-tested
 * function that mirrors the EXISTING getPerson() / employee-history report scope
 * exactly. No RBAC broadening: roles and entity scoping match what is already
 * enforced elsewhere in the app.
 *
 * ── SALARY EXCLUSION (hard rule for this workstream) ─────────────────────────
 * This module deliberately NEVER selects or returns basic_salary, compensation,
 * allowance, or any payroll value. The `assignment-history-reader` unit test
 * scans this source file to enforce that no salary column is ever referenced.
 */
import { and, desc, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import {
  workerAssignments, persons, positions, jobs, grades,
  departments, businessUnits, legalEntities, locations,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import type { SessionUser } from '@/lib/auth'
import { isManagerDirectReport } from './manager-scope'

// ── Access decision (pure, unit-testable) ───────────────────────────────────

export type HistoryAccessInput = {
  /** Caller's role (lib/auth role string). */
  role: string
  /** Caller's legal entity (session). */
  userLegalEntityId: string
  /** True when the caller is viewing their own record. */
  isSelf: boolean
  /** True only for a MANAGER viewing a confirmed direct report (DB-resolved). */
  isManagerDirectReport: boolean
  /** The viewed person's legal entity. */
  personLegalEntityId: string
}

/**
 * Decides whether `role` may read the assignment history of a person.
 *
 * Mirrors the live getPerson() / employee-history report rules — do NOT widen:
 *   • SUPER_ADMIN .................. all employees
 *   • self (any role) ............. own history
 *   • MANAGER ..................... direct reports only (DB-resolved)
 *   • HR_ADMIN / HR_DIRECTOR ...... same legal entity only (entity scope)
 *   • everyone else (incl. EMPLOYEE viewing others, PAYROLL_ADMIN, FINANCE) DENY
 */
export function decideHistoryAccess(i: HistoryAccessInput): 'ALLOW' | 'DENY' {
  if (i.role === 'SUPER_ADMIN') return 'ALLOW'
  if (i.isSelf) return 'ALLOW'
  if (i.role === 'MANAGER') return i.isManagerDirectReport ? 'ALLOW' : 'DENY'
  if (i.role === 'HR_ADMIN' || i.role === 'HR_DIRECTOR') {
    return i.userLegalEntityId === i.personLegalEntityId ? 'ALLOW' : 'DENY'
  }
  return 'DENY'
}

// ── Temporal classification (pure, unit-testable) ───────────────────────────

export type TemporalState = 'PAST' | 'CURRENT' | 'FUTURE'

/**
 * Classifies a slice relative to `asOfISO` using yyyy-mm-dd lexicographic
 * comparison (open-ended end = sentinel '9999-12-31'):
 *   • start  > asOf            → FUTURE (pre-loaded future-dated change)
 *   • end    < asOf            → PAST   (closed slice)
 *   • otherwise                → CURRENT (covers today)
 */
export function classifyTemporal(startISO: string, endISO: string, asOfISO: string): TemporalState {
  if (startISO > asOfISO) return 'FUTURE'
  if (endISO < asOfISO) return 'PAST'
  return 'CURRENT'
}

// ── Returned shape (NON-SENSITIVE: no salary / compensation / payroll) ───────

export interface AssignmentHistoryRow {
  assignmentId:       string
  assignmentNumber:   string
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

export interface AssignmentHistory {
  person: {
    id: string; personNumber: string
    fullNameEn: string | null; fullNameAr: string
    legalEntityId: string
  }
  /** Slices ordered effective_start_date DESC (newest first). */
  rows: AssignmentHistoryRow[]
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Main reader ─────────────────────────────────────────────────────────────

/**
 * Reads the full assignment-history timeline for one person, AFTER enforcing
 * server-side access via {@link decideHistoryAccess}. Returns `null` when the
 * person does not exist OR the caller is not permitted (caller treats both as
 * "not found / no access" — no information leak).
 */
export async function getAssignmentHistory(
  user: SessionUser,
  personId: string,
): Promise<AssignmentHistory | null> {
  const [person] = await db
    .select({
      id: persons.id, personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr,
      legalEntityId: persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (!person) return null

  const isSelf = Boolean(user.personId && user.personId === person.id)
  const mgrDirect =
    user.role === 'MANAGER' && !isSelf && Boolean(user.personId)
      ? await isManagerDirectReport(person.id, user.personId as string)
      : false

  const access = decideHistoryAccess({
    role: user.role,
    userLegalEntityId: user.legalEntityId,
    isSelf,
    isManagerDirectReport: mgrDirect,
    personLegalEntityId: person.legalEntityId,
  })
  if (access === 'DENY') return null

  const mgr = alias(persons, 'history_line_manager')

  const slices = await db
    .select({
      assignmentId:       workerAssignments.id,
      assignmentNumber:   workerAssignments.assignmentNumber,
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
    .leftJoin(departments,   eq(workerAssignments.departmentId,   departments.id))
    .leftJoin(positions,     eq(workerAssignments.positionId,     positions.id))
    .leftJoin(jobs,          eq(workerAssignments.jobId,          jobs.id))
    .leftJoin(grades,        eq(workerAssignments.gradeId,        grades.id))
    .leftJoin(businessUnits, eq(workerAssignments.businessUnitId, businessUnits.id))
    .leftJoin(legalEntities, eq(workerAssignments.legalEntityId,  legalEntities.id))
    .leftJoin(locations,     eq(workerAssignments.locationId,     locations.id))
    .leftJoin(mgr,           eq(workerAssignments.lineManagerId,  mgr.id))
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, person.id),
      // Salary-change history is out of scope for this workstream — exclude
      // pay-only SALARY_REVISION slices from every surface using this reader.
      ne(workerAssignments.actionType, 'SALARY_REVISION'),
    ))
    .orderBy(desc(workerAssignments.effectiveStartDate), desc(workerAssignments.effectiveSequence))

  const asOf = todayISO()
  const rows: AssignmentHistoryRow[] = slices.map(s => {
    const start = String(s.effectiveStartDate)
    const end   = String(s.effectiveEndDate ?? '9999-12-31')
    return {
      assignmentId:       s.assignmentId,
      assignmentNumber:   s.assignmentNumber,
      effectiveStartDate: start,
      effectiveEndDate:   end,
      temporalState:      classifyTemporal(start, end, asOf),
      isCurrent:          s.isCurrent,
      assignmentStatus:   s.assignmentStatus,
      actionType:         s.actionType,
      actionMode:         s.actionMode,
      actionReason:       s.actionReason ?? null,
      departmentEn:       s.departmentEn ?? null,
      departmentAr:       s.departmentAr ?? null,
      positionEn:         s.positionEn ?? null,
      positionAr:         s.positionAr ?? null,
      jobEn:              s.jobEn ?? null,
      jobAr:              s.jobAr ?? null,
      gradeEn:            s.gradeEn ?? null,
      gradeAr:            s.gradeAr ?? null,
      businessUnitEn:     s.businessUnitEn ?? null,
      businessUnitAr:     s.businessUnitAr ?? null,
      legalEntityEn:      s.legalEntityEn ?? null,
      legalEntityAr:      s.legalEntityAr ?? null,
      locationEn:         s.locationEn ?? null,
      locationAr:         s.locationAr ?? null,
      lineManagerEn:      s.lineManagerEn ?? null,
      lineManagerAr:      s.lineManagerAr ?? null,
    }
  })

  return {
    person: {
      id: person.id, personNumber: person.personNumber,
      fullNameEn: person.fullNameEn, fullNameAr: person.fullNameAr,
      legalEntityId: person.legalEntityId,
    },
    rows,
  }
}
