'use server'

/**
 * Department Head — workflow-actor data-availability helper.
 *
 * Read-only resolver that exposes a department's head so a FUTURE workflow
 * approver resolver can route to it without re-architecture. No routing
 * behaviour is implemented here. The returned personId resolves to the full
 * person record and, from there, to position / current worker_assignment —
 * satisfying the "resolvable to person → position → org assignment" requirement.
 *
 * Design note: departments.head_person_id is the denormalised "current head"
 * pointer. If effective-dated head history or delegation is needed later, add a
 * department_head_assignments side table (mirroring work_schedule_assignments)
 * without changing this read contract.
 */

import { db } from '@/lib/db'
import { departments, persons } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'

export interface DepartmentHead {
  departmentId: string
  personId:     string
  personName:   string
  personNumber: string
}

export async function getDepartmentHead(
  departmentId: string,
): Promise<DepartmentHead | null> {
  const [row] = await db
    .select({
      personId:     persons.id,
      personName:   persons.fullNameEn,
      personNumber: persons.personNumber,
    })
    .from(departments)
    .innerJoin(persons, eq(persons.id, departments.headPersonId))
    .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.id, departmentId)))
    .limit(1)

  if (!row) return null

  return {
    departmentId,
    personId:     row.personId,
    personName:   row.personName ?? '',
    personNumber: row.personNumber,
  }
}
