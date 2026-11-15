/**
 * leave-person-scope.ts — scoped person resolution for leave requests.
 *
 * Rules (relationship-based — every user is an employee with a functional role):
 *   HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN → any active employee in the entity
 *   anyone else (EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE) → self, plus any
 *     direct/indirect report if they are a line manager (worker_assignments)
 *
 * Both helpers are used server-side only:
 *   • getLeavePersonOptions  — page data loader (person picklist)
 *   • assertCanRequestLeaveFor — action guard (blocks unauthorised submissions)
 */
import { sql, and, eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { persons } from '@/drizzle/schema'
import type { SessionUser } from '@/lib/auth'

export type LeavePersonOption = {
  id: string
  personNumber: string
  fullNameEn: string | null
  fullNameAr: string
  legalEntityId: string
}

const HR_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

// ── Recursive team CTE (MANAGER scope) ─────────────────────────────────────

/**
 * Returns all person IDs reachable downward from managerId via
 * worker_assignments.line_manager_id (current assignments only).
 * Does NOT include the manager themselves.
 *
 * CYCLE SAFETY: worker_assignments.line_manager_id is only an FK to persons.id —
 * nothing prevents a cycle (A→B→A) or self-reference (person → themselves) in the
 * manager chain. A plain `UNION ALL` recursion over such data never terminates,
 * and there is no statement_timeout on the connection (lib/db.ts), so the query
 * hangs the request indefinitely. We carry the visited-path array and:
 *   • skip any person already on the path        (breaks A→B→A cycles)
 *   • never re-add the manager themselves         (preserves the "excludes self" contract under a cycle)
 *   • cap recursion depth at 100                  (defensive bound for pathological data)
 * The extra `depth`/`path` columns are internal; all callers reference `person_id` only.
 */
const teamCte = (managerId: string) => sql`
  WITH RECURSIVE team(person_id, depth, path) AS (
    SELECT wa.person_id, 1, ARRAY[wa.person_id]
    FROM   worker_assignments wa
    WHERE  wa.line_manager_id = ${managerId}::uuid
      AND  wa.is_current      = true
      AND  wa.tenant_id       = ${TENANT_ID}::uuid
    UNION ALL
    SELECT wa.person_id, t.depth + 1, t.path || wa.person_id
    FROM   worker_assignments wa
    JOIN   team t ON wa.line_manager_id = t.person_id
    WHERE  wa.is_current = true
      AND  wa.tenant_id  = ${TENANT_ID}::uuid
      AND  wa.person_id <> ${managerId}::uuid
      AND  wa.person_id <> ALL(t.path)
      AND  t.depth < 100
  )
`

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the scoped list of persons the caller may file a leave request for.
 *
 * Scope is RELATIONSHIP-based, not role-label-based — every user is an employee
 * with a functional role on top, so the ability to file for others follows the
 * actual line-manager relationship:
 *   HR_ADMIN / HR_DIRECTOR → all active employees in the caller's legal entity
 *   SUPER_ADMIN            → all active employees across all entities
 *   everyone else (EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE) →
 *       [self + all recursive direct/indirect reports]: self only unless they
 *       are a line manager (have direct reports), regardless of role label.
 */
export async function getLeavePersonOptions(
  user: SessionUser,
): Promise<LeavePersonOption[]> {
  const { role, personId, legalEntityId } = user

  // ── Non-HR roles → self + recursive reports (relationship-driven) ──
  // EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE. No reports → just self; a line
  // manager also gets their team — independent of which functional role they hold.
  if (!HR_ROLES.has(role)) {
    if (!personId) return []

    type Row = {
      id: string
      person_number: string
      full_name_en: string | null
      full_name_ar: string
      legal_entity_id: string
    }

    const rows = await db.execute<Row>(sql`
      ${teamCte(personId)}
      SELECT DISTINCT
        per.id,
        per.person_number,
        per.full_name_en,
        per.full_name_ar,
        per.legal_entity_id
      FROM   persons per
      WHERE  per.id          = ${personId}::uuid
        AND  per.tenant_id   = ${TENANT_ID}::uuid
        AND  per.is_active   = true

      UNION ALL

      SELECT DISTINCT
        per.id,
        per.person_number,
        per.full_name_en,
        per.full_name_ar,
        per.legal_entity_id
      FROM   persons per
      JOIN   team t ON per.id = t.person_id
      WHERE  per.tenant_id = ${TENANT_ID}::uuid
        AND  per.is_active = true

      ORDER BY person_number
      LIMIT 200
    `)

    return rows.map(r => ({
      id:            r.id,
      personNumber:  r.person_number,
      fullNameEn:    r.full_name_en,
      fullNameAr:    r.full_name_ar,
      legalEntityId: r.legal_entity_id,
    }))
  }

  // ── HR roles (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN) ──
  const conds = [eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true)]
  if (role !== 'SUPER_ADMIN' && legalEntityId) {
    conds.push(eq(persons.legalEntityId, legalEntityId))
  }
  return db
    .select({
      id:            persons.id,
      personNumber:  persons.personNumber,
      fullNameEn:    persons.fullNameEn,
      fullNameAr:    persons.fullNameAr,
      legalEntityId: persons.legalEntityId,
    })
    .from(persons)
    .where(and(...conds))
    .orderBy(asc(persons.personNumber))
    .limit(500)
}

/**
 * Returns all person IDs the manager is authorised to view as subordinates:
 * all recursive direct/indirect reports (NOT including the manager themselves).
 *
 * Used to scope listLeaveRequests and getLeaveRequest for MANAGER callers.
 * Returns an empty array if the manager has no active reports.
 */
export async function resolveManagerViewablePersonIds(
  managerId: string,
): Promise<string[]> {
  type Row = { person_id: string }
  const rows = await db.execute<Row>(sql`
    ${teamCte(managerId)}
    SELECT person_id::text FROM team
  `)
  return rows.map(r => r.person_id)
}

/**
 * Server-side authorization guard — must be called before any DB write.
 *
 * Throws `FORBIDDEN` if the caller is not permitted to file a leave request
 * for `targetPersonId`. Direct URL manipulation / payload tampering is blocked
 * here regardless of what the UI sent.
 */
export async function assertCanRequestLeaveFor(
  user: SessionUser,
  targetPersonId: string,
): Promise<void> {
  // HR roles may file for any employee.
  if (HR_ROLES.has(user.role)) return

  // Everyone may file for themselves.
  if (user.personId === targetPersonId) return

  // Anyone who is a line manager may file for anyone in their recursive team —
  // relationship-based, independent of functional role label (a PAYROLL_ADMIN /
  // FINANCE / etc. who manages people can file for their reports; a user with no
  // reports gets an empty team and is blocked for anyone but themselves).
  if (user.personId) {
    type Row = { found: number }
    const rows = await db.execute<Row>(sql`
      ${teamCte(user.personId)}
      SELECT 1 AS found FROM team WHERE person_id = ${targetPersonId}::uuid LIMIT 1
    `)
    if (rows.length > 0) return
  }

  throw new Error(
    'FORBIDDEN: you are not authorised to file a leave request for this employee',
  )
}
