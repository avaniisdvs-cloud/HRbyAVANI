'use server'

/**
 * Company Currency Setup — Server Actions.
 *
 * Hard Rule 2: every DB write uses db.transaction() with writeAuditLog()
 *              called inside the same transaction.
 * Hard Rule 3: no hard deletes — deactivate or effective-end records only.
 * Hard Rule 10: tenant_id on every insert.
 *
 * Access: SUPER_ADMIN | HR_DIRECTOR | HR_ADMIN (read + write)
 *         All other roles: no access.
 *
 * BR-CCY-001: Only one active config may overlap a given effective date range
 *             per legal entity.
 * BR-CCY-002: Default AED / 2 dp / HALF_UP when no config found.
 */

import { z } from 'zod'
import { db } from '@/lib/db'
import { eq, and, or, lte, gte, isNull, ne, desc } from 'drizzle-orm'
import { companyCurrencySettings, legalEntities } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { translateError } from '@/lib/app-error'
import { revalidatePath } from 'next/cache'
import type { CurrencyConfig } from '@/lib/utils/currency-format'
import { DEFAULT_CURRENCY_CONFIG } from '@/lib/utils/currency-format'

// ── Validation schemas ──────────────────────────────────────────────────────

const ROUNDING_METHODS = ['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL', 'TRUNCATE'] as const

const CurrencySettingSchema = z.object({
  legalEntityId:  z.string().uuid('Legal entity is required'),
  currencyCode:   z.string()
                   .length(3, 'Currency code must be exactly 3 characters')
                   .regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters'),
  currencyNameEn: z.string().trim().min(1, 'Currency name (English) is required').max(100),
  currencyNameAr: z.string().trim().min(1, 'Currency name (Arabic) is required').max(100),
  currencySymbol: z.string().trim().min(1, 'Currency symbol is required').max(10)
                   .regex(
                     /^[\x20-\x7E¢-¥₠-⃏]+$/,
                     'Currency symbol must contain only printable characters or standard currency symbols',
                   ),
  decimalPlaces:  z.number()
                   .int('Decimal places must be a whole number')
                   .min(0, 'Decimal places must be 0 or more')
                   .max(6, 'Decimal places cannot exceed 6'),
  roundingMethod: z.enum(ROUNDING_METHODS, {
    errorMap: () => ({ message: 'Rounding method must be one of: HALF_UP, HALF_EVEN, FLOOR, CEIL, TRUNCATE' }),
  }),
  effectiveFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective from must be YYYY-MM-DD'),
  effectiveTo:    z.string()
                   .regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective to must be YYYY-MM-DD')
                   .nullable()
                   .optional(),
}).refine(
  d => !d.effectiveTo || d.effectiveFrom <= d.effectiveTo,
  { message: 'Effective to must be on or after effective from', path: ['effectiveTo'] },
)

export type CreateCurrencySettingInput = z.infer<typeof CurrencySettingSchema>

// Partial update — only id + fields being changed; decimalPlaces/roundingMethod
// stay numeric/enum even when partial so they cannot be nulled out accidentally.
const UpdateCurrencySettingSchema = z.object({
  id:             z.string().uuid(),
  legalEntityId:  z.string().uuid().optional(),
  currencyCode:   z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
  currencyNameEn: z.string().trim().min(1).max(100).optional(),
  currencyNameAr: z.string().trim().min(1).max(100).optional(),
  currencySymbol: z.string().trim().min(1).max(10)
                   .regex(/^[\x20-\x7E¢-¥₠-⃏]+$/, 'Currency symbol must contain only printable characters or standard currency symbols')
                   .optional(),
  decimalPlaces:  z.number().int().min(0).max(6).optional(),
  roundingMethod: z.enum(ROUNDING_METHODS).optional(),
  effectiveFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // undefined = not changing; null = explicitly clear to open-ended
  effectiveTo:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine(
  d => {
    if (!d.effectiveTo || !d.effectiveFrom) return true
    return d.effectiveFrom <= d.effectiveTo
  },
  { message: 'Effective to must be on or after effective from', path: ['effectiveTo'] },
)
export type UpdateCurrencySettingInput = z.infer<typeof UpdateCurrencySettingSchema>

// ── Row type returned to the UI ─────────────────────────────────────────────

export interface CurrencySettingRow {
  id:              string
  legalEntityId:   string
  legalEntityName: string
  currencyCode:    string
  currencyNameEn:  string
  currencyNameAr:  string
  currencySymbol:  string
  decimalPlaces:   number
  roundingMethod:  string
  effectiveFrom:   string
  effectiveTo:     string | null
  isActive:        boolean
  createdByName:   string
  createdDate:     string
  updatedByName:   string | null
  lastUpdatedDate: string | null
}

// ── Guard: overlap check (BR-CCY-001) ───────────────────────────────────────

async function assertNoOverlap(
  legalEntityId: string,
  effectiveFrom: string,
  effectiveTo:   string | null | undefined,
  excludeId?:    string,
) {
  // Fetch existing active configs for this entity
  const existing = await db
    .select({
      id:            companyCurrencySettings.id,
      effectiveFrom: companyCurrencySettings.effectiveFrom,
      effectiveTo:   companyCurrencySettings.effectiveTo,
    })
    .from(companyCurrencySettings)
    .where(
      and(
        eq(companyCurrencySettings.tenantId, TENANT_ID),
        eq(companyCurrencySettings.legalEntityId, legalEntityId),
        eq(companyCurrencySettings.isActive, true),
        ...(excludeId ? [ne(companyCurrencySettings.id, excludeId)] : []),
      ),
    )

  const newFrom = new Date(effectiveFrom)
  const newTo   = effectiveTo ? new Date(effectiveTo) : null

  for (const row of existing) {
    const rowFrom = new Date(row.effectiveFrom)
    const rowTo   = row.effectiveTo ? new Date(row.effectiveTo) : null

    // Two date ranges overlap if: start1 <= end2 AND start2 <= end1
    // Open-ended (null effectiveTo) means it extends to infinity.
    const newEndAfterRowStart  = newTo   === null || newTo   >= rowFrom
    const rowEndAfterNewStart  = rowTo   === null || rowTo   >= newFrom

    if (newEndAfterRowStart && rowEndAfterNewStart) {
      throw new Error(
        `VALIDATION: An active currency configuration for this company already covers ${effectiveFrom}` +
        (effectiveTo ? ` to ${effectiveTo}` : ' onwards') +
        '. Please end-date the existing configuration first, or choose non-overlapping dates.',
      )
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1 — listCompanyCurrencySettings
// ══════════════════════════════════════════════════════════════════════════════

export async function listCompanyCurrencySettings(): Promise<CurrencySettingRow[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const rows = await db
      .select({
        id:              companyCurrencySettings.id,
        legalEntityId:   companyCurrencySettings.legalEntityId,
        legalEntityName: legalEntities.nameEn,
        currencyCode:    companyCurrencySettings.currencyCode,
        currencyNameEn:  companyCurrencySettings.currencyNameEn,
        currencyNameAr:  companyCurrencySettings.currencyNameAr,
        currencySymbol:  companyCurrencySettings.currencySymbol,
        decimalPlaces:   companyCurrencySettings.decimalPlaces,
        roundingMethod:  companyCurrencySettings.roundingMethod,
        effectiveFrom:   companyCurrencySettings.effectiveFrom,
        effectiveTo:     companyCurrencySettings.effectiveTo,
        isActive:        companyCurrencySettings.isActive,
        createdByName:   companyCurrencySettings.createdByName,
        createdDate:     companyCurrencySettings.createdDate,
        updatedByName:   companyCurrencySettings.updatedByName,
        lastUpdatedDate: companyCurrencySettings.lastUpdatedDate,
      })
      .from(companyCurrencySettings)
      .innerJoin(legalEntities, eq(companyCurrencySettings.legalEntityId, legalEntities.id))
      .where(eq(companyCurrencySettings.tenantId, TENANT_ID))
      .orderBy(
        desc(companyCurrencySettings.isActive),
        desc(companyCurrencySettings.effectiveFrom),
      )

    return rows.map(r => ({
      id:              r.id,
      legalEntityId:   r.legalEntityId,
      legalEntityName: r.legalEntityName,
      currencyCode:    r.currencyCode,
      currencyNameEn:  r.currencyNameEn,
      currencyNameAr:  r.currencyNameAr,
      currencySymbol:  r.currencySymbol,
      decimalPlaces:   r.decimalPlaces,
      roundingMethod:  r.roundingMethod,
      effectiveFrom:   r.effectiveFrom,
      effectiveTo:     r.effectiveTo ?? null,
      isActive:        r.isActive,
      createdByName:   r.createdByName,
      createdDate:     r.createdDate?.toISOString() ?? '',
      updatedByName:   r.updatedByName ?? null,
      lastUpdatedDate: r.lastUpdatedDate?.toISOString() ?? null,
    }))
  } catch (e) {
    translateError(e, 'listCompanyCurrencySettings')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2 — getCompanyCurrencySetting
// Resolves the active currency config for a legal entity on a given date.
// Returns DEFAULT_CURRENCY_CONFIG when no config is found (BR-CCY-002).
// ══════════════════════════════════════════════════════════════════════════════

export async function getCompanyCurrencySetting(
  legalEntityId: string,
  date: string = new Date().toISOString().slice(0, 10),
): Promise<CurrencyConfig> {
  try {
    const rows = await db
      .select({
        currencyCode:   companyCurrencySettings.currencyCode,
        currencySymbol: companyCurrencySettings.currencySymbol,
        decimalPlaces:  companyCurrencySettings.decimalPlaces,
        roundingMethod: companyCurrencySettings.roundingMethod,
      })
      .from(companyCurrencySettings)
      .where(
        and(
          eq(companyCurrencySettings.tenantId, TENANT_ID),
          eq(companyCurrencySettings.legalEntityId, legalEntityId),
          eq(companyCurrencySettings.isActive, true),
          lte(companyCurrencySettings.effectiveFrom, date),
          or(
            isNull(companyCurrencySettings.effectiveTo),
            gte(companyCurrencySettings.effectiveTo, date),
          ),
        ),
      )
      .orderBy(desc(companyCurrencySettings.effectiveFrom))
      .limit(1)

    if (rows.length === 0) return DEFAULT_CURRENCY_CONFIG

    const r = rows[0]
    return {
      currencyCode:   r.currencyCode,
      currencySymbol: r.currencySymbol,
      decimalPlaces:  r.decimalPlaces,
      roundingMethod: r.roundingMethod as CurrencyConfig['roundingMethod'],
    }
  } catch {
    // Fail-safe: always return a usable default (BR-CCY-002)
    return DEFAULT_CURRENCY_CONFIG
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3 — createCompanyCurrencySetting
// ══════════════════════════════════════════════════════════════════════════════

export async function createCompanyCurrencySetting(
  input: CreateCurrencySettingInput,
): Promise<{ id: string }> {
  try {
    // 1. Auth
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // 2. Validate
    const data = CurrencySettingSchema.parse(input)

    // 3. Business rule — BR-CCY-001: no overlapping active configs
    await assertNoOverlap(data.legalEntityId, data.effectiveFrom, data.effectiveTo)

    // 4. DB transaction + audit
    let newId = ''
    await db.transaction(async tx => {
      const [row] = await tx
        .insert(companyCurrencySettings)
        .values({
          tenantId:       TENANT_ID,
          legalEntityId:  data.legalEntityId,
          currencyCode:   data.currencyCode,
          currencyNameEn: data.currencyNameEn,
          currencyNameAr: data.currencyNameAr,
          currencySymbol: data.currencySymbol,
          decimalPlaces:  data.decimalPlaces,
          roundingMethod: data.roundingMethod,
          effectiveFrom:  data.effectiveFrom,
          effectiveTo:    data.effectiveTo ?? null,
          isActive:       true,
          createdBy:      user.id,
          createdByName:  user.name,
        })
        .returning({ id: companyCurrencySettings.id })

      newId = row.id

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: data.legalEntityId,
        channel:       'WEB',
        eventType:     'CURRENCY_SETUP.CREATED',
        resourceType:  'company_currency_settings',
        resourceId:    newId,
        entityId:      data.legalEntityId,
        newValues:     data as Record<string, unknown>,
      }, tx)
    })

    revalidatePath('/settings/currency-setup')
    return { id: newId }
  } catch (e) {
    translateError(e, 'createCompanyCurrencySetting')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4 — updateCompanyCurrencySetting
// ══════════════════════════════════════════════════════════════════════════════

export async function updateCompanyCurrencySetting(
  input: UpdateCurrencySettingInput,
): Promise<void> {
  try {
    // 1. Auth
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // 2. Validate
    const data = UpdateCurrencySettingSchema.parse(input)

    // 3. Fetch existing record
    const [existing] = await db
      .select()
      .from(companyCurrencySettings)
      .where(
        and(
          eq(companyCurrencySettings.id, data.id),
          eq(companyCurrencySettings.tenantId, TENANT_ID),
        ),
      )
      .limit(1)

    if (!existing) throw new Error('NOT_FOUND: currency setting')

    // 4. Business rule — BR-CCY-001: overlap check excluding current record
    // Guard against inversion when only one of the two date fields is changing.
    const resolvedFrom = data.effectiveFrom ?? existing.effectiveFrom
    const resolvedTo   = data.effectiveTo !== undefined ? data.effectiveTo : existing.effectiveTo
    if (resolvedTo && resolvedFrom > resolvedTo) {
      throw new Error('VALIDATION: Effective to must be on or after effective from.')
    }

    if (data.effectiveFrom || data.effectiveTo !== undefined) {
      await assertNoOverlap(
        data.legalEntityId ?? existing.legalEntityId,
        data.effectiveFrom ?? existing.effectiveFrom,
        data.effectiveTo !== undefined ? data.effectiveTo : existing.effectiveTo,
        data.id,
      )
    }

    // 5. DB transaction + audit
    await db.transaction(async tx => {
      await tx
        .update(companyCurrencySettings)
        .set({
          currencyCode:    data.currencyCode    ?? existing.currencyCode,
          currencyNameEn:  data.currencyNameEn  ?? existing.currencyNameEn,
          currencyNameAr:  data.currencyNameAr  ?? existing.currencyNameAr,
          currencySymbol:  data.currencySymbol  ?? existing.currencySymbol,
          decimalPlaces:   data.decimalPlaces   ?? existing.decimalPlaces,
          roundingMethod:  data.roundingMethod  ?? existing.roundingMethod,
          effectiveFrom:   data.effectiveFrom   ?? existing.effectiveFrom,
          // Use explicit undefined check so null (clear end date) passes through correctly
          effectiveTo:     data.effectiveTo !== undefined ? data.effectiveTo : existing.effectiveTo,
          updatedBy:       user.id,
          updatedByName:   user.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(companyCurrencySettings.id, data.id))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: existing.legalEntityId,
        channel:       'WEB',
        eventType:     'CURRENCY_SETUP.UPDATED',
        resourceType:  'company_currency_settings',
        resourceId:    data.id,
        entityId:      existing.legalEntityId,
        oldValues:     {
          currencyCode:   existing.currencyCode,
          currencyNameEn: existing.currencyNameEn,
          currencyNameAr: existing.currencyNameAr,
          currencySymbol: existing.currencySymbol,
          decimalPlaces:  existing.decimalPlaces,
          roundingMethod: existing.roundingMethod,
          effectiveFrom:  existing.effectiveFrom,
          effectiveTo:    existing.effectiveTo,
        },
        newValues: data as Record<string, unknown>,
      }, tx)
    })

    revalidatePath('/settings/currency-setup')
  } catch (e) {
    translateError(e, 'updateCompanyCurrencySetting')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5 — deactivateCompanyCurrencySetting
// Hard Rule 3: no delete — set isActive = false.
// ══════════════════════════════════════════════════════════════════════════════

export async function deactivateCompanyCurrencySetting(id: string): Promise<void> {
  try {
    // 1. Auth
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // 2. Validate id
    const { id: validId } = z.object({ id: z.string().uuid() }).parse({ id })

    // 3. Fetch to confirm exists
    const [existing] = await db
      .select()
      .from(companyCurrencySettings)
      .where(
        and(
          eq(companyCurrencySettings.id, validId),
          eq(companyCurrencySettings.tenantId, TENANT_ID),
        ),
      )
      .limit(1)

    if (!existing) throw new Error('NOT_FOUND: currency setting')
    if (!existing.isActive) throw new Error('VALIDATION: This currency configuration is already inactive.')

    // 4. DB transaction + audit
    await db.transaction(async tx => {
      await tx
        .update(companyCurrencySettings)
        .set({
          isActive:        false,
          updatedBy:       user.id,
          updatedByName:   user.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(companyCurrencySettings.id, validId))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: existing.legalEntityId,
        channel:       'WEB',
        eventType:     'CURRENCY_SETUP.DEACTIVATED',
        resourceType:  'company_currency_settings',
        resourceId:    validId,
        entityId:      existing.legalEntityId,
        oldValues:     { isActive: true },
        newValues:     { isActive: false },
      }, tx)
    })

    revalidatePath('/settings/currency-setup')
  } catch (e) {
    translateError(e, 'deactivateCompanyCurrencySetting')
  }
}
