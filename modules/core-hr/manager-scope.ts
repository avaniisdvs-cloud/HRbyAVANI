import { and, eq, sql as drizzleSql } from 'drizzle-orm'
import { db, type DbOrTx } from '@/lib/db'
import { persons, workerAssignments } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

/**
 * Returns the full set of personIds in a manager's reporting chain
 * (direct + all indirect / recursive descendants) using a single
 * recursive CTE.
 *
 * Reporting edges are resolved from BOTH sources at every level — identical
 * to the single-level rule in {@link isManagerDirectReport}:
 *   1. persons.line_manager_id — the denormalised "current manager" pointer
 *      that drives My Team, manager reports, and the org chart visible tree; AND
 *   2. a current worker_assignments row with line_manager_id — the effective-
 *      dated assignment source.
 *
 * Using BOTH (OR) is required: employees with no worker_assignments row yet
 * (a known seed/data gap) are correctly included via persons.line_manager_id.
 * A worker_assignments-only walk under-counts the team (e.g. it returned 1 of
 * Fatima's 3 reports because Aisha and John have no current WA row).
 *
 * Safe defaults:
 *   • Returns [] immediately for empty/invalid managerId.
 *   • UNION (not UNION ALL) bounds the walk and prevents infinite loops on
 *     circular data.
 *   • Catches and returns [] on any DB error so callers never crash.
 *
 * Use this wherever the full manager hierarchy must be respected
 * (ARIA metrics, People Intelligence, Home KPIs, chat scope).
 */
export async function getManagerTeamIds(managerId: string): Promise<string[]> {
  if (!managerId) return []
  try {
    // Seed the walk with the manager themselves, then recursively pull in any
    // person managed by a team member via EITHER pointer. The manager node is
    // stripped from the final result.
    const rows = await db.execute<{ person_id: string }>(drizzleSql`
      WITH RECURSIVE team AS (
        SELECT ${managerId}::uuid AS person_id
        UNION
        SELECT p.id
        FROM   team t
        JOIN   persons p ON p.tenant_id = ${TENANT_ID}::uuid
        LEFT JOIN worker_assignments wa
               ON wa.person_id      = p.id
              AND wa.tenant_id      = ${TENANT_ID}::uuid
              AND wa.is_current     = true
        WHERE  p.line_manager_id = t.person_id
            OR wa.line_manager_id = t.person_id
      )
      SELECT person_id FROM team WHERE person_id <> ${managerId}::uuid
    `)
    return rows.map((r) => r.person_id)
  } catch {
    return []
  }
}

/**
 * Direct-report scope check for the MANAGER role.
 *
 * A person counts as a manager's direct report if EITHER:
 *   1. persons.line_manager_id = managerPersonId — the denormalised "current
 *      manager" pointer that drives My Team, manager reports, and the org chart
 *      visible tree; OR
 *   2. a current worker_assignments row has line_manager_id = managerPersonId —
 *      the effective-dated assignment source historically used by getPerson().
 *
 * Using BOTH sources (OR) is deliberate:
 *   • It is a strict SUPERSET of the previous worker_assignments-only check, so
 *     no manager who could previously act on a report is newly blocked
 *     (zero regression).
 *   • It also covers active employees that have no worker_assignments row yet
 *     (a known seed/data gap), which the WA-only check incorrectly excluded.
 *
 * This is the single source of truth for "is X a direct report of manager Y".
 */
export async function isManagerDirectReport(
  personId: string,
  managerPersonId: string,
  client: DbOrTx = db,
): Promise<boolean> {
  if (!personId || !managerPersonId) return false

  const [p] = await client
    .select({ lineManagerId: persons.lineManagerId })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (p?.lineManagerId === managerPersonId) return true

  const [wa] = await client
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      eq(workerAssignments.lineManagerId, managerPersonId),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)

  return Boolean(wa)
}
