'use server'

import { redirect }        from 'next/navigation'
import { revalidatePath }  from 'next/cache'
import { auth }            from '@/lib/auth'
import { db }              from '@/lib/db'
import { legalEntities, persons } from '@/drizzle/schema'
import { eq, and, sql }    from 'drizzle-orm'
import { TENANT_ID }       from '@/lib/constants'
import { writeAuditLog }   from '@/lib/audit'
import { translateError }  from '@/lib/app-error'

// ── Auth guard ─────────────────────────────────────────────────────────────

async function guardSuperAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/settings')
  return session.user
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmpNumberEntityRow {
  id:              string
  entityCode:      string
  nameEn:          string
  empNumberPrefix: string | null
  empNumberDigits: number
  empNumberSeed:   number
  currentMax:      number   // highest numeric suffix in use right now
  nextPreview:     string   // what the NEXT number would look like
}

// ── listEmpNumberConfig ────────────────────────────────────────────────────
// Returns all active entities with their current emp-number config + stats.

export async function listEmpNumberConfig(): Promise<EmpNumberEntityRow[]> {
  try {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const entities = await db
    .select({
      id:              legalEntities.id,
      entityCode:      legalEntities.entityCode,
      nameEn:          legalEntities.nameEn,
      empNumberPrefix: legalEntities.empNumberPrefix,
      empNumberDigits: legalEntities.empNumberDigits,
      empNumberSeed:   legalEntities.empNumberSeed,
    })
    .from(legalEntities)
    .where(
      and(
        eq(legalEntities.tenantId, TENANT_ID),
        eq(legalEntities.isActive, true),
      ),
    )
    .orderBy(legalEntities.nameEn)

  // For each entity, compute current max numeric suffix
  const rows: EmpNumberEntityRow[] = await Promise.all(
    entities.map(async (e) => {
      const hasConfig      = !!e.empNumberPrefix?.trim()
      const prefix         = hasConfig ? e.empNumberPrefix!.trim().toUpperCase() : e.entityCode.toUpperCase()
      const digits         = Math.max(3, Math.min(8, e.empNumberDigits))
      const seed           = e.empNumberSeed

      const numberPattern  = hasConfig ? `^${prefix}[0-9]+$` : `^${prefix}-[0-9]+$`
      const replacePattern = hasConfig ? `^${prefix}` : `^${prefix}-`

      const [stat] = await db
        .select({
          maxN: sql<number>`COALESCE(MAX(
            CASE WHEN ${persons.personNumber} ~ ${numberPattern}
              THEN REGEXP_REPLACE(${persons.personNumber}, ${replacePattern}, '', 'g')::int
              ELSE NULL END
          ), 0)`,
        })
        .from(persons)
        .where(
          and(
            eq(persons.tenantId, TENANT_ID),
            eq(persons.legalEntityId, e.id),
          ),
        )

      const currentMax = stat?.maxN ?? 0
      const next       = Math.max(seed, currentMax) + 1
      const nextPreview = hasConfig
        ? `${prefix}${String(next).padStart(digits, '0')}`
        : `${prefix}-${String(next).padStart(6, '0')}`

      return {
        id:              e.id,
        entityCode:      e.entityCode,
        nameEn:          e.nameEn,
        empNumberPrefix: e.empNumberPrefix,
        empNumberDigits: e.empNumberDigits,
        empNumberSeed:   e.empNumberSeed,
        currentMax,
        nextPreview,
      }
    }),
  )

  return rows
  } catch (e) { translateError(e, 'listEmpNumberConfig') }
}

// ── saveEmpNumberConfig ────────────────────────────────────────────────────
// SUPER_ADMIN only. Updates prefix, digits, and seed for one entity.

export async function saveEmpNumberConfig(
  entityId: string,
  config: {
    empNumberPrefix: string
    empNumberDigits: number
    empNumberSeed:   number
  },
): Promise<{ success: boolean; error?: string }> {
  try {
  const user = await guardSuperAdmin()

  // Validate prefix: letters + digits only, 1-10 chars
  const prefix = config.empNumberPrefix.trim().toUpperCase()
  if (!prefix) {
    return { success: false, error: 'Prefix code is required.' }
  }
  if (!/^[A-Z0-9]{1,10}$/.test(prefix)) {
    return { success: false, error: 'Prefix must be letters and digits only (e.g. EMP, STAFF). Max 10 chars.' }
  }

  const digits = Math.max(3, Math.min(8, Math.floor(config.empNumberDigits)))
  if (isNaN(digits)) {
    return { success: false, error: 'Invalid digit count.' }
  }

  const seed = Math.max(0, Math.floor(config.empNumberSeed))
  if (isNaN(seed)) {
    return { success: false, error: 'Invalid starting number.' }
  }

  try {
    await db.transaction(async tx => {
      const [prev] = await tx
        .select({ empNumberPrefix: legalEntities.empNumberPrefix, empNumberDigits: legalEntities.empNumberDigits, empNumberSeed: legalEntities.empNumberSeed })
        .from(legalEntities)
        .where(and(eq(legalEntities.id, entityId), eq(legalEntities.tenantId, TENANT_ID)))
        .limit(1)

      await tx
        .update(legalEntities)
        .set({
          empNumberPrefix: prefix,
          empNumberDigits: digits,
          empNumberSeed:   seed,
          updatedBy:       user.id,
          updatedByName:   user.name ?? user.id,
          updatedDate:     new Date(),
        })
        .where(and(eq(legalEntities.id, entityId), eq(legalEntities.tenantId, TENANT_ID)))

      await writeAuditLog(
        {
          actorId:      user.id,
          actorName:    user.name ?? user.id,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'SETTINGS.EMP_NUMBER_CONFIG_UPDATED',
          resourceType: 'legal_entities',
          resourceId:   entityId,
          changedFields: ['emp_number_prefix', 'emp_number_digits', 'emp_number_seed'],
          oldValues: {
            empNumberPrefix: prev?.empNumberPrefix,
            empNumberDigits: prev?.empNumberDigits,
            empNumberSeed:   prev?.empNumberSeed,
          },
          newValues: { empNumberPrefix: prefix, empNumberDigits: digits, empNumberSeed: seed },
          description: `Employee number config updated: prefix=${prefix}, digits=${digits}, seed=${seed}`,
        },
        tx,
      )
    })

    revalidatePath('/settings/employee-numbers')
    return { success: true }
  } catch (e: unknown) {
    console.error('[saveEmpNumberConfig]', e)
    return { success: false, error: e instanceof Error ? e.message : 'Failed to save configuration.' }
  }
  } catch (e) { translateError(e, 'saveEmpNumberConfig') }
}
