'use server'

import { db } from '@/lib/db'
import { departments, positions, persons, workSchedules } from '@/drizzle/schema'
import { eq, and, count } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { writeDepartmentHistory } from '@/lib/mdm-history'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { translateError } from '@/lib/app-error'
import { translateToArabic } from '@/lib/translation'

// ── Zod schema ──────────────────────────────────────────────────────────────

const GL_ACCOUNT_RE = /^[0-9]{4,10}$/

const departmentSchema = z.object({
  legalEntityId:      z.string().uuid({ message: 'Legal entity is required' }),
  businessUnitId:     z.string().uuid({ message: 'Business unit is required' }),
  code:               z.string().min(1, 'Code is required').max(30),
  nameEn:             z.string().min(1, 'English name is required').max(200),
  nameAr:             z.string().max(200).default(''),
  departmentType:     z.string().max(50).optional().nullable(),
  parentDepartmentId: z.string().uuid().optional().nullable(),
  approvedHeadcount:  z.coerce.number().int().min(0, 'Headcount must be ≥ 0'),
  costCentreCode:     z.string().max(50).optional().nullable(),
  glAccountCode:      z.string().max(50).optional().nullable(),
  // Department Head — mandatory on CREATE (enforced in createDepartment), optional
  // on edit/correct so legacy departments with a NULL head are not blocked.
  headPersonId:       z.string().uuid().optional().nullable(),
  // Department default Work Schedule — optional (blank = inherit entity/system default).
  workScheduleId:     z.string().uuid().optional().nullable(),
})

type DepartmentInput = z.infer<typeof departmentSchema>

function parseDepartmentForm(fd: FormData): DepartmentInput {
  return departmentSchema.parse({
    legalEntityId:      fd.get('legalEntityId'),
    businessUnitId:     fd.get('businessUnitId'),
    code:               fd.get('code'),
    nameEn:             fd.get('nameEn'),
    nameAr:             fd.get('nameAr'),
    departmentType:     fd.get('departmentType') || null,
    parentDepartmentId: fd.get('parentDepartmentId') || null,
    approvedHeadcount:  fd.get('approvedHeadcount'),
    costCentreCode:     fd.get('costCentreCode') || null,
    glAccountCode:      fd.get('glAccountCode') || null,
    headPersonId:       fd.get('headPersonId') || null,
    workScheduleId:     fd.get('workScheduleId') || null,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateGlAccountCode(code: string | null | undefined): void {
  if (code && !GL_ACCOUNT_RE.test(code)) {
    throw new Error('BR-DEPT-005: GL account code must be 4–10 digits only.')
  }
}

async function assertCodeUnique(
  legalEntityId: string,
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db
    .select({ id: departments.id })
    .from(departments)
    .where(
      and(
        eq(departments.legalEntityId, legalEntityId),
        eq(departments.code, code),
        eq(departments.tenantId, TENANT_ID),
      ),
    )
    .limit(1)

  const conflict = existing.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error('BR-DEPT-001: Department code already exists for this legal entity.')
  }
}

async function assertParentSameEntity(
  parentId: string | null | undefined,
  legalEntityId: string,
): Promise<void> {
  if (!parentId) return
  const parent = await db
    .select({ id: departments.id, legalEntityId: departments.legalEntityId })
    .from(departments)
    .where(eq(departments.id, parentId))
    .limit(1)

  if (!parent[0] || parent[0].legalEntityId !== legalEntityId) {
    throw new Error('BR-DEPT-004: Parent department must belong to the same legal entity.')
  }
}

/**
 * BR-DEPT-006 — the Department Head must be an ACTIVE employee in the SAME
 * tenant and legal entity. Re-validated server-side (never trust the client).
 * Note: persons.isActive is NOT flipped on termination — assignmentStatus is —
 * so both axes are checked to exclude terminated/retired/etc. employees.
 */
async function assertHeadPersonValid(
  headPersonId: string,
  legalEntityId: string,
): Promise<void> {
  const [head] = await db
    .select({
      isActive:         persons.isActive,
      assignmentStatus: persons.assignmentStatus,
      legalEntityId:    persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.id, headPersonId), eq(persons.tenantId, TENANT_ID)))
    .limit(1)

  if (!head) {
    throw new Error('BR-DEPT-006: Selected department head was not found.')
  }
  if (!head.isActive || head.assignmentStatus !== 'ACTIVE') {
    throw new Error('BR-DEPT-006: Department head must be an active employee.')
  }
  if (head.legalEntityId !== legalEntityId) {
    throw new Error('BR-DEPT-006: Department head must belong to the same legal entity as the department.')
  }
}

/**
 * BR-DEPT-007 — the Work Schedule must be ACTIVE, in the same tenant, and either
 * global (no legal entity) or belong to the department's legal entity.
 */
async function assertWorkScheduleValid(
  workScheduleId: string,
  legalEntityId: string,
): Promise<void> {
  const [sch] = await db
    .select({ isActive: workSchedules.isActive, legalEntityId: workSchedules.legalEntityId })
    .from(workSchedules)
    .where(and(eq(workSchedules.id, workScheduleId), eq(workSchedules.tenantId, TENANT_ID)))
    .limit(1)

  if (!sch) {
    throw new Error('BR-DEPT-007: Selected work schedule was not found.')
  }
  if (!sch.isActive) {
    throw new Error('BR-DEPT-007: Work schedule must be active.')
  }
  if (sch.legalEntityId && sch.legalEntityId !== legalEntityId) {
    throw new Error('BR-DEPT-007: Work schedule must belong to the same legal entity as the department.')
  }
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function createDepartment(fd: FormData): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseDepartmentForm(fd)

    // Auto-translate Arabic name if not provided (EN → AR only)
    if (!input.nameAr) {
      input.nameAr = (await translateToArabic(input.nameEn)) ?? ''
    }

    validateGlAccountCode(input.glAccountCode)
    await assertCodeUnique(input.legalEntityId, input.code)
    await assertParentSameEntity(input.parentDepartmentId, input.legalEntityId)

    // BR-DEPT-006 — Department Head is mandatory on create.
    if (!input.headPersonId) {
      throw new Error('Department Head is required.')
    }
    await assertHeadPersonValid(input.headPersonId, input.legalEntityId)
    if (input.workScheduleId) {
      await assertWorkScheduleValid(input.workScheduleId, input.legalEntityId)
    }

    // Hard Rule 1 — insert + audit in the SAME transaction.
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(departments)
        .values({
          tenantId:           TENANT_ID,
          legalEntityId:      input.legalEntityId,
          businessUnitId:     input.businessUnitId,
          code:               input.code,
          nameEn:             input.nameEn,
          nameAr:             input.nameAr,
          departmentType:     input.departmentType ?? null,
          parentDepartmentId: input.parentDepartmentId ?? null,
          approvedHeadcount:  input.approvedHeadcount,
          costCentreCode:     input.costCentreCode ?? null,
          glAccountCode:      input.glAccountCode ?? null,
          headPersonId:       input.headPersonId ?? null,
          workScheduleId:     input.workScheduleId ?? null,
          isActive:           true,
          actionMode:         'UPDATE',
          createdBy:          actor.id,
          createdByName:      actor.name,
        })
        .returning({ id: departments.id })

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'WEB',
        eventType:     'DEPARTMENT_CREATED',
        resourceType:  'departments',
        resourceId:    created.id,
        entityId:      input.legalEntityId,
        newValues:     input as unknown as Record<string, unknown>,
        description:   `Department ${input.code} created`,
      }, tx)

      return created
    })

    void row
    revalidatePath('/master-data/departments')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function updateDepartment(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseDepartmentForm(fd)

    // Fetch before-snapshot (needed for audit diff and EN-change detection)
    const [before] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1)

    if (!before) throw new Error('Department not found.')

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.nameAr || input.nameEn !== before.nameEn) {
      input.nameAr = (await translateToArabic(input.nameEn)) ?? input.nameAr ?? ''
    }

    validateGlAccountCode(input.glAccountCode)
    await assertCodeUnique(input.legalEntityId, input.code, id)
    await assertParentSameEntity(input.parentDepartmentId, input.legalEntityId)

    // Head is optional on edit (legacy departments may have a NULL head and must
    // remain editable). Only re-validate when a NEW/CHANGED head is supplied.
    if (input.headPersonId && input.headPersonId !== before.headPersonId) {
      await assertHeadPersonValid(input.headPersonId, input.legalEntityId)
    }
    if (input.workScheduleId && input.workScheduleId !== before.workScheduleId) {
      await assertWorkScheduleValid(input.workScheduleId, input.legalEntityId)
    }

    const afterValues  = input as unknown as Record<string, unknown>
    const beforeValues = before as unknown as Record<string, unknown>

    await db.transaction(async (tx) => {
      await tx
        .update(departments)
        .set({
          legalEntityId:      input.legalEntityId,
          businessUnitId:     input.businessUnitId,
          code:               input.code,
          nameEn:             input.nameEn,
          nameAr:             input.nameAr,
          departmentType:     input.departmentType ?? null,
          parentDepartmentId: input.parentDepartmentId ?? null,
          approvedHeadcount:  input.approvedHeadcount,
          costCentreCode:     input.costCentreCode ?? null,
          glAccountCode:      input.glAccountCode ?? null,
          headPersonId:       input.headPersonId ?? null,
          workScheduleId:     input.workScheduleId ?? null,
          updatedBy:          actor.id,
          updatedByName:      actor.name,
          lastUpdatedDate:    new Date(),
        })
        .where(eq(departments.id, id))

      await writeDepartmentHistory(tx, id, {
        code:               input.code,
        nameEn:             input.nameEn,
        nameAr:             input.nameAr,
        departmentType:     input.departmentType ?? null,
        approvedHeadcount:  input.approvedHeadcount,
        costCentreCode:     input.costCentreCode ?? null,
        glAccountCode:      input.glAccountCode ?? null,
        parentDepartmentId: input.parentDepartmentId ?? null,
      }, actor.personId ?? undefined, changeReason.trim())

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'WEB',
        eventType:     'DEPARTMENT_UPDATED',
        resourceType:  'departments',
        resourceId:    id,
        entityId:      input.legalEntityId,
        oldValues:     beforeValues,
        newValues:     afterValues,
        changedFields: diffFields(beforeValues, afterValues),
        metadata:      { changeReason, resourceName: before.nameEn, resourceNameAr: before.nameAr },
        description:   `Department ${input.code} updated: ${changeReason}`,
      }, tx)
    })

    revalidatePath('/master-data/departments')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function disableDepartment(
  id: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [dept] = await db
      .select({ code: departments.code, nameEn: departments.nameEn, legalEntityId: departments.legalEntityId })
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1)

    if (!dept) throw new Error('Department not found.')

    // BR-DEPT-002: block if any active positions exist in this department
    const [{ activePositions }] = await db
      .select({ activePositions: count() })
      .from(positions)
      .where(and(eq(positions.departmentId, id), eq(positions.isActive, true)))
    if (activePositions > 0) {
      throw new Error(
        `Cannot disable: ${activePositions} active position${activePositions === 1 ? '' : 's'} belong to this department. Disable all positions first. (BR-DEPT-002)`,
      )
    }

    await db
      .update(departments)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(departments.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'DEPARTMENT_DISABLED',
      resourceType:  'departments',
      resourceId:    id,
      entityId:      dept.legalEntityId ?? undefined,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Department ${dept.code} disabled: ${reason}`,
    })

    revalidatePath('/master-data/departments')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function correctDepartment(
  id:             string,
  fd:             FormData,
  correctionNote: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    if (!correctionNote || correctionNote.trim().length < 5) {
      return { error: 'Correction note must be at least 5 characters.' }
    }

    const input = parseDepartmentForm(fd)
    validateGlAccountCode(input.glAccountCode)
    await assertParentSameEntity(input.parentDepartmentId, input.legalEntityId)

    const [before] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1)

    if (!before) throw new Error('Department not found.')

    if (input.headPersonId && input.headPersonId !== before.headPersonId) {
      await assertHeadPersonValid(input.headPersonId, input.legalEntityId)
    }
    if (input.workScheduleId && input.workScheduleId !== before.workScheduleId) {
      await assertWorkScheduleValid(input.workScheduleId, input.legalEntityId)
    }

    const snapshot: Record<string, unknown> = {
      nameEn:             before.nameEn,
      nameAr:             before.nameAr,
      departmentType:     before.departmentType,
      parentDepartmentId: before.parentDepartmentId,
      approvedHeadcount:  before.approvedHeadcount,
      costCentreCode:     before.costCentreCode,
      glAccountCode:      before.glAccountCode,
      headPersonId:       before.headPersonId,
      workScheduleId:     before.workScheduleId,
    }

    await db
      .update(departments)
      .set({
        nameEn:             input.nameEn,
        nameAr:             input.nameAr,
        departmentType:     input.departmentType ?? null,
        parentDepartmentId: input.parentDepartmentId ?? null,
        approvedHeadcount:  input.approvedHeadcount,
        costCentreCode:     input.costCentreCode ?? null,
        glAccountCode:      input.glAccountCode ?? null,
        headPersonId:       input.headPersonId ?? null,
        workScheduleId:     input.workScheduleId ?? null,
        actionMode:         'CORRECTION',
        correctsRowId:      null,
        updatedBy:          actor.id,
        updatedByName:      actor.name,
        lastUpdatedDate:    new Date(),
      })
      .where(eq(departments.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'DEPARTMENT_CORRECTED',
      resourceType:  'departments',
      resourceId:    id,
      entityId:      input.legalEntityId,
      oldValues:     snapshot,
      newValues:     input as unknown as Record<string, unknown>,
      changedFields: diffFields(snapshot, input as unknown as Record<string, unknown>),
      metadata:      { correctionNote: correctionNote.trim(), resourceName: before.nameEn, resourceNameAr: before.nameAr },
      description:   `Department ${before.code} corrected: ${correctionNote.trim()}`,
    })

    revalidatePath('/master-data/departments')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function enableDepartment(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [dept] = await db
      .select({ code: departments.code, legalEntityId: departments.legalEntityId })
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1)

    if (!dept) throw new Error('Department not found.')

    await db
      .update(departments)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(departments.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'DEPARTMENT_ENABLED',
      resourceType:  'departments',
      resourceId:    id,
      entityId:      dept.legalEntityId ?? undefined,
      newValues:     { isActive: true },
      description:   `Department ${dept.code} re-enabled`,
    })

    revalidatePath('/master-data/departments')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}
