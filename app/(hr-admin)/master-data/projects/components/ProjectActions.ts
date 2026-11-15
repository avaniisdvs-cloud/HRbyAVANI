'use server'

import { db } from '@/lib/db'
import { projects, workerAssignments } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and, count } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ── Zod schema ──────────────────────────────────────────────────────────────

const projectSchema = z.object({
  legalEntityId: z.string().uuid().optional().nullable(),
  code:          z.string().min(1, 'Code is required').max(30),
  nameEn:        z.string().min(1, 'English name is required').max(200),
  nameAr:        z.string().max(200).optional().nullable(),
  projectType:   z.string().max(50).optional().nullable(),
  glMappingCode: z.string().max(50).optional().nullable(),
  description:   z.string().optional().nullable(),
  startDate:     z.string().optional().nullable(),
  endDate:       z.string().optional().nullable(),
})

type ProjectInput = z.infer<typeof projectSchema>

function parseProjectForm(fd: FormData): ProjectInput {
  return projectSchema.parse({
    legalEntityId: fd.get('legalEntityId') || null,
    code:          fd.get('code'),
    nameEn:        fd.get('nameEn'),
    nameAr:        fd.get('nameAr') || null,
    projectType:   fd.get('projectType') || null,
    glMappingCode: fd.get('glMappingCode') || null,
    description:   fd.get('description') || null,
    startDate:     fd.get('startDate') || null,
    endDate:       fd.get('endDate') || null,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function assertCodeUnique(
  code: string,
  legalEntityId: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  // BR-PROJ-001: code unique within tenant + legal entity scope
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.tenantId, TENANT_ID),
        eq(projects.code, code),
        legalEntityId
          ? eq(projects.legalEntityId, legalEntityId)
          : eq(projects.tenantId, TENANT_ID),
      ),
    )
    .limit(1)

  const conflict = existing.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error('BR-PROJ-001: Project code already exists. Use a unique code.')
  }
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function createProject(fd: FormData): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseProjectForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.nameAr) {
      input.nameAr = (await translateToArabic(input.nameEn)) ?? null
    }

    await assertCodeUnique(input.code, input.legalEntityId)

    const [row] = await db
      .insert(projects)
      .values({
        tenantId:      TENANT_ID,
        legalEntityId: input.legalEntityId ?? null,
        code:          input.code,
        nameEn:        input.nameEn,
        nameAr:        input.nameAr ?? null,
        projectType:   input.projectType ?? null,
        glMappingCode: input.glMappingCode ?? null,
        description:   input.description ?? null,
        startDate:     input.startDate ?? null,
        endDate:       input.endDate ?? null,
        isActive:      true,
        actionMode:    'UPDATE',
        createdBy:     actor.id,
        createdByName: actor.name,
      })
      .returning({ id: projects.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'PROJECT_CREATED',
      resourceType:  'projects',
      resourceId:    row.id,
      entityId:      input.legalEntityId ?? undefined,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Project ${input.code} created`,
    })

    revalidatePath('/master-data/projects')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function updateProject(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseProjectForm(fd)

    await assertCodeUnique(input.code, input.legalEntityId, id)

    const [before] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)

    if (!before) throw new Error('Project not found.')

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.nameAr || input.nameEn !== before.nameEn) {
      input.nameAr = (await translateToArabic(input.nameEn)) ?? input.nameAr ?? null
    }

    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          legalEntityId:   input.legalEntityId ?? null,
          code:            input.code,
          nameEn:          input.nameEn,
          nameAr:          input.nameAr ?? null,
          projectType:     input.projectType ?? null,
          glMappingCode:   input.glMappingCode ?? null,
          description:     input.description ?? null,
          startDate:       input.startDate ?? null,
          endDate:         input.endDate ?? null,
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(projects.id, id))

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'WEB',
        eventType:     'PROJECT_UPDATED',
        resourceType:  'projects',
        resourceId:    id,
        entityId:      input.legalEntityId ?? undefined,
        oldValues:     before as unknown as Record<string, unknown>,
        newValues:     input as unknown as Record<string, unknown>,
        changedFields: diffFields(
          before as unknown as Record<string, unknown>,
          input as unknown as Record<string, unknown>,
        ),
        metadata:    { changeReason, resourceName: before.nameEn, resourceNameAr: before.nameAr },
        description: `Project ${input.code} updated: ${changeReason}`,
      }, tx)
    })

    revalidatePath('/master-data/projects')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function disableProject(
  id: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [proj] = await db
      .select({ code: projects.code, nameEn: projects.nameEn, legalEntityId: projects.legalEntityId })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)

    if (!proj) throw new Error('Project not found.')

    // BR-PROJ-002: block if active assignments reference this project
    const [{ activeAssignments }] = await db
      .select({ activeAssignments: count() })
      .from(workerAssignments)
      .where(
        and(
          eq(workerAssignments.projectId, id),
          eq(workerAssignments.isCurrent, true),
        ),
      )

    if (activeAssignments > 0) {
      throw new Error(
        `Cannot disable: ${activeAssignments} active employee assignment${activeAssignments === 1 ? '' : 's'} reference this project. Update assignments first. (BR-PROJ-002)`,
      )
    }

    await db
      .update(projects)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(projects.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'PROJECT_DISABLED',
      resourceType:  'projects',
      resourceId:    id,
      entityId:      proj.legalEntityId ?? undefined,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Project ${proj.code} disabled: ${reason}`,
    })

    revalidatePath('/master-data/projects')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}

export async function enableProject(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [proj] = await db
      .select({ code: projects.code, legalEntityId: projects.legalEntityId })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)

    if (!proj) throw new Error('Project not found.')

    await db
      .update(projects)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(projects.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'PROJECT_ENABLED',
      resourceType:  'projects',
      resourceId:    id,
      entityId:      proj.legalEntityId ?? undefined,
      newValues:     { isActive: true },
      description:   `Project ${proj.code} re-enabled`,
    })

    revalidatePath('/master-data/projects')
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { error: msg }
  }
}
