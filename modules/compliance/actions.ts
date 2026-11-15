'use server'

/**
 * compliance Server Actions — Sprint 10 (GAP-N08).
 *
 * Hard Rules in force:
 *   #1  every DB write → writeAuditLog inside the SAME tx
 *   #3  no deletes — effective dates only
 *   #5  config guardrails: isOverridable guard before update
 *   #8  SUPER_ADMIN-only actions — compliance rules are governance-critical
 *
 * GAP-N08: Compliance rules were writable without governance controls.
 * This action adds: SUPER_ADMIN-only gate, mandatory changeReason, and an
 * immutable audit trail event COMPLIANCE_RULE.UPDATED.
 */

import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'
import { complianceRules } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'

// ── Validation ─────────────────────────────────────────────────────────────

const UpdateComplianceRuleSchema = z.object({
  ruleId:        z.string().uuid('must be a UUID (compliance_rules.id)'),
  // At least one updatable field must be present
  descriptionEn: z.string().trim().min(1).max(2000).optional(),
  descriptionAr: z.string().trim().max(2000).optional(),
  formula:       z.record(z.string(), z.unknown()).optional(),
  isActive:      z.boolean().optional(),
  sunsetDate:    hrDateString().optional().nullable(),
  notes:         z.string().trim().max(2000).optional(),
  // GAP-N08: change reason is MANDATORY — no silent governance changes.
  changeReason:  z.string().trim().min(10, 'changeReason must be at least 10 characters'),
})

export type UpdateComplianceRuleInput = z.infer<typeof UpdateComplianceRuleSchema>

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * GAP-N08 — SUPER_ADMIN-only governance action for updating compliance rules.
 *
 * Requires:
 *   • Caller must have SUPER_ADMIN role (no HR_ADMIN escalation path — these
 *     are system-level governance records tied to UAE law citations).
 *   • `isOverridable` must be true on the target row; non-overridable rules
 *     are immutable system constants (e.g. BR-AL-001 annual leave minimum).
 *   • `changeReason` is mandatory (min 10 chars) and is stored in the audit
 *     metadata for every change — required for regulatory audit trail.
 */
export async function updateComplianceRule(
  input: UpdateComplianceRuleInput,
): Promise<{ id: string }> {
  try {
    // Hard Rule 8: SUPER_ADMIN only — compliance rules are law-tied constants.
    const user = await requireRole(['SUPER_ADMIN'])

    const data = UpdateComplianceRuleSchema.parse(input)

    await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(complianceRules)
      .where(and(
        eq(complianceRules.tenantId, TENANT_ID),
        eq(complianceRules.id, data.ruleId),
      ))
      .limit(1)
    if (!current) throw new Error('NOT_FOUND: compliance rule not found')

    // GAP-N08 guard: non-overridable rules are managed by Anthropic/legal
    // and can only be changed via a migration, not via the UI.
    if (!current.isOverridable) {
      throw new Error(
        `GOVERNANCE_LOCK: rule ${current.ruleId} is marked isOverridable=false — `
        + 'update requires a migration with law-change justification.',
      )
    }

    const patch: Partial<typeof complianceRules.$inferInsert> = {
      updatedBy:       user.id,
      updatedByName:   user.name,
      updatedDate:     new Date(),
      lastUpdatedDate: new Date(),
    }
    if (data.descriptionEn !== undefined) patch.descriptionEn = data.descriptionEn
    if (data.descriptionAr !== undefined) patch.descriptionAr = data.descriptionAr
    if (data.formula       !== undefined) patch.formula       = data.formula
    if (data.isActive      !== undefined) patch.isActive      = data.isActive
    if ('sunsetDate' in data)             patch.sunsetDate    = data.sunsetDate ?? null
    if (data.notes         !== undefined) patch.notes         = data.notes

    await tx
      .update(complianceRules)
      .set(patch)
      .where(eq(complianceRules.id, data.ruleId))

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'COMPLIANCE_RULE.UPDATED',
      resourceType: 'compliance_rules',
      resourceId:   data.ruleId,
      entityId:     current.legalEntityId ?? undefined,
      oldValues: {
        descriptionEn: current.descriptionEn,
        formula:       current.formula,
        isActive:      current.isActive,
        sunsetDate:    current.sunsetDate,
        notes:         current.notes,
      },
      newValues:    { ...patch, changeReason: data.changeReason },
      metadata:     { ruleCode: current.ruleId, changeReason: data.changeReason },
    }, tx)
    })

    return { id: data.ruleId }
  } catch (e) { translateError(e, 'updateComplianceRule') }
}
