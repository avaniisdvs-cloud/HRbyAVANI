/**
 * Resolves the person IDs of a manager's active direct reports.
 * Used to build team-scoped row filters in the DataOps Console.
 */
import { rawSql } from './db'

const cache = new Map<string, { ts: number; ids: string[] }>()
const TTL_MS = 60_000

export async function getTeamPersonIds(managerPersonId: string): Promise<string[]> {
  const hit = cache.get(managerPersonId)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.ids

  const rows = await rawSql<{ person_id: string }[]>`
    SELECT person_id
    FROM worker_assignments
    WHERE line_manager_id = ${managerPersonId}
      AND effective_end_date >= CURRENT_DATE
      AND assignment_status IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED')
  `

  const ids = rows.map(r => r.person_id)
  cache.set(managerPersonId, { ts: Date.now(), ids })
  return ids
}
