'use server'

import { db } from '@/lib/db'
import { jobs } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { writeJobHistory } from '@/lib/mdm-history'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'

// ── Zod schema ───────────────────────────────────────────────────────────────

const jobSchema = z.object({
  legalEntityId:          z.string().uuid().optional().nullable(),
  jobCode:                z.string().min(1, 'Job code is required').max(30),
  jobTitleEn:             z.string().min(1, 'Job title (EN) is required').max(200),
  jobTitleAr:             z.string().max(200).default(''),
  jobFamily:              z.string().max(100).optional().nullable(),
  jobFunction:            z.string().max(100).optional().nullable(),
  minGradeId:             z.string().uuid().optional().nullable(),
  maxGradeId:             z.string().uuid().optional().nullable(),
  isEmiratisationTarget:  z.boolean().default(false),
  isManagementRole:       z.boolean().default(false),
  isExemptFromOvertime:   z.boolean().default(false),
  jobDescriptionEn:       z.string().max(2000).optional().nullable(),
  jobDescriptionAr:       z.string().max(2000).optional().nullable(),
})

type JobInput = z.infer<typeof jobSchema>

function parseJobForm(fd: FormData): JobInput {
  return jobSchema.parse({
    legalEntityId:         fd.get('legalEntityId') || null,
    jobCode:               fd.get('jobCode'),
    jobTitleEn:            fd.get('jobTitleEn'),
    jobTitleAr:            fd.get('jobTitleAr'),
    jobFamily:             fd.get('jobFamily') || null,
    jobFunction:           fd.get('jobFunction') || null,
    minGradeId:            fd.get('minGradeId') || null,
    maxGradeId:            fd.get('maxGradeId') || null,
    isEmiratisationTarget: fd.get('isEmiratisationTarget') === 'true',
    isManagementRole:      fd.get('isManagementRole') === 'true',
    isExemptFromOvertime:  fd.get('isExemptFromOvertime') === 'true',
    jobDescriptionEn:      fd.get('jobDescriptionEn') || null,
    jobDescriptionAr:      fd.get('jobDescriptionAr') || null,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertJobCodeUnique(jobCode: string, excludeId?: string): Promise<void> {
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.tenantId, TENANT_ID), eq(jobs.jobCode, jobCode)))
    .limit(1)

  const conflict = existing.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error(`BR-JOB-001: Job code "${jobCode}" already exists.`)
  }
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function createJob(fd: FormData): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseJobForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.jobTitleAr) {
      input.jobTitleAr = (await translateToArabic(input.jobTitleEn)) ?? ''
    }
    if (input.jobDescriptionEn && !input.jobDescriptionAr) {
      input.jobDescriptionAr = (await translateToArabic(input.jobDescriptionEn)) ?? null
    }

    await assertJobCodeUnique(input.jobCode)

    const [row] = await db
      .insert(jobs)
      .values({
        tenantId:              TENANT_ID,
        legalEntityId:         input.legalEntityId ?? null,
        jobCode:               input.jobCode,
        jobTitleEn:            input.jobTitleEn,
        jobTitleAr:            input.jobTitleAr,
        jobFamily:             input.jobFamily ?? null,
        jobFunction:           input.jobFunction ?? null,
        minGradeId:            input.minGradeId ?? null,
        maxGradeId:            input.maxGradeId ?? null,
        isEmiratisationTarget: input.isEmiratisationTarget,
        isManagementRole:      input.isManagementRole,
        isExemptFromOvertime:  input.isExemptFromOvertime,
        jobDescriptionEn:      input.jobDescriptionEn ?? null,
        jobDescriptionAr:      input.jobDescriptionAr ?? null,
        isActive:              true,
        actionMode:            'UPDATE',
        createdBy:             actor.id,
        createdByName:         actor.name,
      })
      .returning({ id: jobs.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'JOB_CREATED',
      resourceType:  'jobs',
      resourceId:    row.id,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Job ${input.jobCode} (${input.jobTitleEn}) created`,
    })

    revalidatePath('/master-data/jobs')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'createJob') }
  }
}

export async function updateJob(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseJobForm(fd)

    // BR-JOB-001: jobCode immutable — we don't allow changing it via update
    // (the form sends back the same code, but we don't update it)
    const [before] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)

    if (!before) throw new Error('Job not found.')

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.jobTitleAr || input.jobTitleEn !== before.jobTitleEn) {
      input.jobTitleAr = (await translateToArabic(input.jobTitleEn)) ?? input.jobTitleAr ?? ''
    }
    if (input.jobDescriptionEn && (!input.jobDescriptionAr || input.jobDescriptionEn !== before.jobDescriptionEn)) {
      input.jobDescriptionAr = (await translateToArabic(input.jobDescriptionEn)) ?? input.jobDescriptionAr ?? null
    }

    const afterValues  = input as unknown as Record<string, unknown>
    const beforeValues = before as unknown as Record<string, unknown>

    await db.transaction(async (tx) => {
      await tx
        .update(jobs)
        .set({
          legalEntityId:         input.legalEntityId ?? null,
          jobTitleEn:            input.jobTitleEn,
          jobTitleAr:            input.jobTitleAr,
          jobFamily:             input.jobFamily ?? null,
          jobFunction:           input.jobFunction ?? null,
          minGradeId:            input.minGradeId ?? null,
          maxGradeId:            input.maxGradeId ?? null,
          isEmiratisationTarget: input.isEmiratisationTarget,
          isManagementRole:      input.isManagementRole,
          isExemptFromOvertime:  input.isExemptFromOvertime,
          jobDescriptionEn:      input.jobDescriptionEn ?? null,
          jobDescriptionAr:      input.jobDescriptionAr ?? null,
          updatedBy:             actor.id,
          updatedByName:         actor.name,
          lastUpdatedDate:       new Date(),
        })
        .where(eq(jobs.id, id))

      await writeJobHistory(tx, id, {
        jobCode:               before.jobCode,
        jobTitleEn:            input.jobTitleEn,
        jobTitleAr:            input.jobTitleAr,
        jobFamily:             input.jobFamily ?? null,
        jobFunction:           input.jobFunction ?? null,
        isEmiratisationTarget: input.isEmiratisationTarget,
        isManagementRole:      input.isManagementRole,
        minGradeId:            input.minGradeId ?? null,
        maxGradeId:            input.maxGradeId ?? null,
      }, actor.personId ?? undefined, changeReason.trim())

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'WEB',
        eventType:     'JOB_UPDATED',
        resourceType:  'jobs',
        resourceId:    id,
        oldValues:     beforeValues,
        newValues:     afterValues,
        changedFields: diffFields(beforeValues, afterValues),
        metadata:      { changeReason, resourceName: before.jobTitleEn, resourceNameAr: before.jobTitleAr },
        description:   `Job ${before.jobCode} updated: ${changeReason}`,
      }, tx)
    })

    revalidatePath('/master-data/jobs')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'updateJob') }
  }
}

export async function disableJob(
  id: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [record] = await db
      .select({ jobCode: jobs.jobCode, jobTitleEn: jobs.jobTitleEn })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)

    if (!record) throw new Error('Job not found.')

    await db
      .update(jobs)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(jobs.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'JOB_DISABLED',
      resourceType:  'jobs',
      resourceId:    id,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Job ${record.jobCode} disabled: ${reason}`,
    })

    revalidatePath('/master-data/jobs')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'disableJob') }
  }
}

export async function correctJob(
  id:             string,
  fd:             FormData,
  correctionNote: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    if (!correctionNote || correctionNote.trim().length < 5) {
      return { error: 'Correction note must be at least 5 characters.' }
    }

    const input = parseJobForm(fd)

    const [before] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)

    if (!before) throw new Error('Job not found.')

    const snapshot: Record<string, unknown> = {
      jobTitleEn:            before.jobTitleEn,
      jobTitleAr:            before.jobTitleAr,
      jobFamily:             before.jobFamily,
      jobFunction:           before.jobFunction,
      minGradeId:            before.minGradeId,
      maxGradeId:            before.maxGradeId,
      isEmiratisationTarget: before.isEmiratisationTarget,
      isManagementRole:      before.isManagementRole,
      isExemptFromOvertime:  before.isExemptFromOvertime,
      jobDescriptionEn:      before.jobDescriptionEn,
      jobDescriptionAr:      before.jobDescriptionAr,
    }

    await db
      .update(jobs)
      .set({
        jobTitleEn:            input.jobTitleEn,
        jobTitleAr:            input.jobTitleAr,
        jobFamily:             input.jobFamily ?? null,
        jobFunction:           input.jobFunction ?? null,
        minGradeId:            input.minGradeId ?? null,
        maxGradeId:            input.maxGradeId ?? null,
        isEmiratisationTarget: input.isEmiratisationTarget,
        isManagementRole:      input.isManagementRole,
        isExemptFromOvertime:  input.isExemptFromOvertime,
        jobDescriptionEn:      input.jobDescriptionEn ?? null,
        jobDescriptionAr:      input.jobDescriptionAr ?? null,
        actionMode:            'CORRECTION',
        correctsRowId:         null,
        updatedBy:             actor.id,
        updatedByName:         actor.name,
        lastUpdatedDate:       new Date(),
      })
      .where(eq(jobs.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'JOB_CORRECTED',
      resourceType:  'jobs',
      resourceId:    id,
      oldValues:     snapshot,
      newValues:     input as unknown as Record<string, unknown>,
      changedFields: diffFields(snapshot, input as unknown as Record<string, unknown>),
      metadata:      { correctionNote: correctionNote.trim(), resourceName: before.jobTitleEn, resourceNameAr: before.jobTitleAr },
      description:   `Job ${before.jobCode} corrected: ${correctionNote.trim()}`,
    })

    revalidatePath('/master-data/jobs')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'correctJob') }
  }
}

export async function enableJob(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [record] = await db
      .select({ jobCode: jobs.jobCode })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)

    if (!record) throw new Error('Job not found.')

    await db
      .update(jobs)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(jobs.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'JOB_ENABLED',
      resourceType:  'jobs',
      resourceId:    id,
      newValues:     { isActive: true },
      description:   `Job ${record.jobCode} re-enabled`,
    })

    revalidatePath('/master-data/jobs')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'enableJob') }
  }
}
