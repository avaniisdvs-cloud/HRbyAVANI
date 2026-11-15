'use server'

import { and, asc, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { positions, departments, grades, persons, locations, projects, workerAssignments } from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'

export interface PicklistOption { id: string; label: string; legalEntityId?: string | null }

export interface PersonPicklists {
  positions:   PicklistOption[]
  departments: PicklistOption[]
  grades:      PicklistOption[]
  locations:   PicklistOption[]
  managers:    PicklistOption[]
  projects:    PicklistOption[]
}

/**
 * Returns active positions, departments, grades, and managers for a given
 * legal entity — used by PersonEditDrawer to populate select dropdowns.
 *
 * Anchor guarantee: if the person already has a currentPositionId or
 * lineManagerId saved, those records are ALWAYS included in the returned
 * options even if they are inactive or belong to a different entity. This
 * ensures edit forms hydrate correctly regardless of data drift.
 *
 * Manager labels include employee number and department so duplicate names
 * are always distinguishable:
 *   "Dorabababu Kethari — AVN-001-000123 — Technology & Digital Transformation"
 */
export async function getPersonPicklists(
  legalEntityId: string,
  excludePersonId?: string,
): Promise<PersonPicklists> {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  // ── Fetch current position, manager, and project for the edited person so
  //    we can anchor them in the option lists regardless of entity/active
  //    filters. This ensures the edit form always shows the saved value even
  //    if the record was deactivated or moved to another entity since last edit.
  let anchorPositionId: string | null = null
  let anchorManagerId:  string | null = null
  let anchorProjectId:  string | null = null

  if (excludePersonId) {
    const [personRow] = await db
      .select({ currentPositionId: persons.currentPositionId, lineManagerId: persons.lineManagerId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, excludePersonId)))
      .limit(1)
    anchorPositionId = personRow?.currentPositionId ?? null
    anchorManagerId  = personRow?.lineManagerId     ?? null

    // Fetch project from the current worker_assignment (source of truth for project)
    const [waRow] = await db
      .select({ projectId: workerAssignments.projectId })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, excludePersonId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)
    anchorProjectId = waRow?.projectId ?? null
  }

  // ── Build WHERE clauses with anchor OR conditions ──────────────────────────

  const positionWhere = anchorPositionId
    ? or(
        and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true), eq(positions.legalEntityId, legalEntityId)),
        and(eq(positions.tenantId, TENANT_ID), eq(positions.id, anchorPositionId)),
      )!
    : and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true), eq(positions.legalEntityId, legalEntityId))!

  const managerWhere = anchorManagerId
    ? or(
        and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.legalEntityId, legalEntityId)),
        and(eq(persons.tenantId, TENANT_ID), eq(persons.id, anchorManagerId)),
      )!
    : and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.legalEntityId, legalEntityId))!

  const [positionRows, departmentRows, gradeRows, locationRows, managerRows, projectRows] = await Promise.all([
    db.select({ id: positions.id, titleEn: positions.positionTitleEn, code: positions.positionCode })
      .from(positions)
      .where(positionWhere)
      .orderBy(asc(positions.positionTitleEn)),

    // Departments unfiltered by entity so cross-entity assignments always appear.
    db.select({ id: departments.id, nameEn: departments.nameEn, legalEntityId: departments.legalEntityId })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
      .orderBy(asc(departments.nameEn)),

    db.select({ id: grades.id, gradeNameEn: grades.gradeNameEn, gradeCode: grades.gradeCode })
      .from(grades)
      .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
      .orderBy(asc(grades.gradeLevel)),

    db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
      .from(locations)
      .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true), eq(locations.legalEntityId, legalEntityId)))
      .orderBy(asc(locations.nameEn)),

    // Join departments to show department name in manager label.
    db.select({
        id:              persons.id,
        fullNameEn:      persons.fullNameEn,
        personNumber:    persons.personNumber,
        departmentNameEn: departments.nameEn,
      })
      .from(persons)
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(managerWhere)
      .orderBy(asc(persons.fullNameEn)),

    // Include the person's currently-assigned project even if it becomes
    // inactive, so the dropdown never shows blank for a saved value.
    db.select({ id: projects.id, code: projects.code, nameEn: projects.nameEn })
      .from(projects)
      .where(
        anchorProjectId
          ? or(
              and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true)),
              and(eq(projects.tenantId, TENANT_ID), eq(projects.id, anchorProjectId)),
            )!
          : and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true))!,
      )
      .orderBy(asc(projects.code)),
  ])

  return {
    positions:   positionRows.map(p => ({ id: p.id, label: `${p.titleEn}${p.code ? ` (${p.code})` : ''}` })),
    departments: departmentRows.map(d => ({ id: d.id, label: d.nameEn ?? d.id, legalEntityId: d.legalEntityId })),
    grades:      gradeRows.map(g => ({ id: g.id, label: `${g.gradeCode} — ${g.gradeNameEn}` })),
    locations:   locationRows.map(l => ({ id: l.id, label: `${l.code} — ${l.nameEn}${l.nameAr ? ` · ${l.nameAr}` : ''}` })),
    managers:    managerRows
      .filter(m => m.id !== excludePersonId)
      .map(m => {
        const name = m.fullNameEn ?? m.personNumber ?? m.id
        const label = m.personNumber && m.departmentNameEn
          ? `${name} — ${m.personNumber} — ${m.departmentNameEn}`
          : m.personNumber
            ? `${name} — ${m.personNumber}`
            : name
        return { id: m.id, label }
      }),
    projects: projectRows.map(p => ({ id: p.id, label: `${p.code} — ${p.nameEn}` })),
  }
}
