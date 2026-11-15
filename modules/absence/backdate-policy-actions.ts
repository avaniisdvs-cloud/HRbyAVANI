'use server'
/**
 * backdate-policy-actions.ts — CRUD for leave_backdate_policies.
 *
 * BR-LV-BDP-001: Only HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN may configure backdate policies.
 * BR-LV-BDP-002: One policy row per (tenant, legal_entity, absence_type) combination
 *                — enforced by DB UNIQUE constraint uq_leave_backdate_policy.
 */
import { and, eq, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { leaveBackdatePolicies, absenceTypes, legalEntities } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { translateError } from '@/lib/app-error'
import { UpsertBackdatePolicySchema, type UpsertBackdatePolicyInput } from './validations'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BackdatePolicyRow = {
  id:                string
  legalEntityId:     string
  legalEntityName:   string
  absenceTypeId:     string
  typeCode:          string
  typeNameEn:        string
  typeNameAr:        string | null
  backdatingEnabled: boolean
  backdateLimitDays: number | null
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all configured backdate policies for a legal entity,
 * joined with absence type names.
 */
export async function listBackdatePolicies(
  legalEntityId: string,
): Promise<BackdatePolicyRow[]> {
  const rows = await db
    .select({
      id:                leaveBackdatePolicies.id,
      legalEntityId:     leaveBackdatePolicies.legalEntityId,
      legalEntityName:   legalEntities.nameEn,
      absenceTypeId:     leaveBackdatePolicies.absenceTypeId,
      typeCode:          absenceTypes.typeCode,
      typeNameEn:        absenceTypes.typeNameEn,
      typeNameAr:        absenceTypes.typeNameAr,
      backdatingEnabled: leaveBackdatePolicies.backdatingEnabled,
      backdateLimitDays: leaveBackdatePolicies.backdateLimitDays,
    })
    .from(leaveBackdatePolicies)
    .innerJoin(absenceTypes,  eq(leaveBackdatePolicies.absenceTypeId,  absenceTypes.id))
    .innerJoin(legalEntities, eq(leaveBackdatePolicies.legalEntityId,  legalEntities.id))
    .where(and(
      eq(leaveBackdatePolicies.tenantId,      TENANT_ID),
      eq(leaveBackdatePolicies.legalEntityId, legalEntityId),
    ))
    .orderBy(asc(absenceTypes.typeCode))
  return rows
}

/**
 * Internal: resolve the effective backdate policy for a (entity, absenceType) pair.
 * Returns null when no policy row exists → no restriction applies (any past date allowed).
 * Used by createLeaveRequest validation pre-flight check (BR-LV-BDP-003).
 */
export async function resolveBackdatePolicy(
  legalEntityId: string,
  absenceTypeId: string,
): Promise<{ backdatingEnabled: boolean; backdateLimitDays: number | null } | null> {
  const [row] = await db
    .select({
      backdatingEnabled: leaveBackdatePolicies.backdatingEnabled,
      backdateLimitDays: leaveBackdatePolicies.backdateLimitDays,
    })
    .from(leaveBackdatePolicies)
    .where(and(
      eq(leaveBackdatePolicies.tenantId,      TENANT_ID),
      eq(leaveBackdatePolicies.legalEntityId, legalEntityId),
      eq(leaveBackdatePolicies.absenceTypeId, absenceTypeId),
    ))
    .limit(1)
  return row ?? null
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * BR-LV-BDP-001: Create or update a backdate policy for one (entity, type) pair.
 * Upsert pattern: INSERT … ON CONFLICT DO UPDATE.
 * BR-LV-BDP-002: The DB UNIQUE constraint uq_leave_backdate_policy enforces one row
 * per (tenant_id, legal_entity_id, absence_type_id).
 */
export async function upsertBackdatePolicy(
  input: UpsertBackdatePolicyInput,
): Promise<{ id: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = UpsertBackdatePolicySchema.parse(input)

    let resultId = ''
    await db.transaction(async tx => {
      const now = new Date()
      const [row] = await tx
        .insert(leaveBackdatePolicies)
        .values({
          tenantId:          TENANT_ID,
          legalEntityId:     data.legalEntityId,
          absenceTypeId:     data.absenceTypeId,
          backdatingEnabled: data.backdatingEnabled,
          backdateLimitDays: data.backdateLimitDays,
          createdBy:         user.id,
          createdByName:     user.name ?? '',
          createdDate:       now,
          updatedBy:         user.id,
          updatedByName:     user.name ?? '',
          lastUpdatedDate:   now,
          updatedDate:       now,
        })
        .onConflictDoUpdate({
          target: [
            leaveBackdatePolicies.tenantId,
            leaveBackdatePolicies.legalEntityId,
            leaveBackdatePolicies.absenceTypeId,
          ],
          set: {
            backdatingEnabled: data.backdatingEnabled,
            backdateLimitDays: data.backdateLimitDays,
            updatedBy:         user.id,
            updatedByName:     user.name ?? '',
            lastUpdatedDate:   now,
            updatedDate:       now,
          },
        })
        .returning({ id: leaveBackdatePolicies.id })

      resultId = row.id
      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name,
        actorRole:    user.role,
        actorEntityId: data.legalEntityId,
        channel:      'WEB',
        eventType:    'LEAVE_BACKDATE_POLICY.UPSERT',
        resourceType: 'leave_backdate_policies',
        resourceId:   row.id,
        entityId:     data.legalEntityId,
        newValues: {
          legalEntityId:     data.legalEntityId,
          absenceTypeId:     data.absenceTypeId,
          backdatingEnabled: data.backdatingEnabled,
          backdateLimitDays: data.backdateLimitDays,
        },
      }, tx)
    })

    revalidatePath('/absence/backdate-policy')
    return { id: resultId }
  } catch (e) {
    translateError(e, 'upsertBackdatePolicy')
  }
}
