'use server'

import { db } from '@/lib/db'
import { featurePermissions } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '@/lib/auth'
import { invalidatePermissionCache, requirePermission } from '@/lib/permissions'
import { translateError } from '@/lib/app-error'
import type { PermSet, FeaturePermission } from '@/drizzle/schema'

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listFeaturePermissions(): Promise<FeaturePermission[]> {
  try {
    const user = await requireRole(['SUPER_ADMIN'])
    await requirePermission(user, 'FEATURE_PERMISSIONS', 'view')

    return db
      .select()
      .from(featurePermissions)
      .orderBy(featurePermissions.featureGroup, featurePermissions.featureLabel)
  } catch (e) { translateError(e, 'listFeaturePermissions') }
}

// ── Write ─────────────────────────────────────────────────────────────────────

interface SavePermissionsPayload {
  featureKey:    string
  employeePerms: PermSet
  managerPerms:  PermSet
  hrAdminPerms:  PermSet
}

export async function saveFeaturePermissions(
  rows: SavePermissionsPayload[],
): Promise<{ ok: boolean; error?: string }> {
  try {
  const user = await requireRole(['SUPER_ADMIN'])
  await requirePermission(user, 'FEATURE_PERMISSIONS', 'edit')

  try {
    await db.transaction(async tx => {
      for (const row of rows) {
        await tx
          .update(featurePermissions)
          .set({
            employeePerms: row.employeePerms,
            managerPerms:  row.managerPerms,
            hrAdminPerms:  row.hrAdminPerms,
            updatedAt:     new Date(),
          })
          .where(
            eq(featurePermissions.featureKey, row.featureKey),
          )
        // P3-D2: drop the runtime resolver's cache so saved permissions
        // take effect immediately (lib/permissions.ts).
        invalidatePermissionCache(row.featureKey)
      }
    })
    return { ok: true }
  } catch (err) {
    console.error('[access] saveFeaturePermissions error:', err)
    return { ok: false, error: 'Failed to save permissions' }
  }
  } catch (e) { translateError(e, 'saveFeaturePermissions') }
}
