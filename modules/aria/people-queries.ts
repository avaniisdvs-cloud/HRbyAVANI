'use server'

import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db }          from '@/lib/db'
import { TENANT_ID }   from '@/lib/constants'
import { getManagerTeamIds } from '@/modules/core-hr/manager-scope'
import {
  persons,
  departments,
  absenceEntries,
} from '@/drizzle/schema'

export interface DeptStat {
  deptName: string
  count:    number
}

export interface PeopleIntelligence {
  totalActive:  number
  onLeaveToday: number
  newThisMonth: number
  byDepartment: DeptStat[]
}

/**
 * Returns people intelligence metrics.
 * @param managerId  When provided (MANAGER role), scopes all counts to the full
 *                   reporting hierarchy (direct + indirect) via recursive CTE.
 *                   Omit for HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN (org-wide).
 */
export async function getPeopleIntelligence(managerId?: string): Promise<PeopleIntelligence> {
  const today      = new Date()
  const todayStr   = today.toISOString().slice(0, 10)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10)

  // MANAGER scope: recursive CTE resolves full team hierarchy
  let teamIds: string[] | null = null
  if (managerId) {
    teamIds = await getManagerTeamIds(managerId)
    // Manager with no reports → return zeroed metrics immediately
    if (teamIds.length === 0) {
      return { totalActive: 0, onLeaveToday: 0, newThisMonth: 0, byDepartment: [] }
    }
  }

  const activeWhere = teamIds
    ? and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.assignmentStatus, 'ACTIVE'), inArray(persons.id, teamIds))
    : and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.assignmentStatus, 'ACTIVE'))

  const onLeaveWhere = teamIds
    ? and(eq(persons.tenantId, TENANT_ID), eq(absenceEntries.status, 'APPROVED'), lte(absenceEntries.startDate, todayStr), gte(absenceEntries.endDate, todayStr), inArray(persons.id, teamIds))
    : and(eq(persons.tenantId, TENANT_ID), eq(absenceEntries.status, 'APPROVED'), lte(absenceEntries.startDate, todayStr), gte(absenceEntries.endDate, todayStr))

  const newHiresWhere = teamIds
    ? and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), gte(persons.hireDate, monthStart), inArray(persons.id, teamIds))
    : and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), gte(persons.hireDate, monthStart))

  const [[{ total: totalActive }], onLeaveRows, [{ total: newThisMonth }], deptRows] =
    await Promise.all([

      // 1. Total active employees
      db.select({ total: count() })
        .from(persons)
        .where(activeWhere),

      // 2. On leave today — approved absences that span today
      db.select({ total: count() })
        .from(absenceEntries)
        .innerJoin(persons, eq(absenceEntries.personId, persons.id))
        .where(onLeaveWhere),

      // 3. New hires this calendar month
      db.select({ total: count() })
        .from(persons)
        .where(newHiresWhere),

      // 4. Headcount by department
      db.select({ deptName: departments.nameEn, total: count() })
        .from(persons)
        .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
        .where(activeWhere)
        .groupBy(departments.nameEn)
        .orderBy(desc(count()))
        .limit(20),
    ])

  return {
    totalActive,
    onLeaveToday: onLeaveRows[0]?.total ?? 0,
    newThisMonth,
    byDepartment: deptRows.map(r => ({
      deptName: r.deptName ?? 'Unassigned',
      count:    r.total,
    })),
  }
}
