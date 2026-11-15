/**
 * Foundation Stewardship P3-D2 — runtime feature-permission enforcement.
 *
 * Second authorisation layer on top of requireRole(): evaluates the
 * admin-managed feature_permissions matrix (Access → Feature Permissions)
 * at runtime inside server actions.
 *
 * Design decisions (board-approved, additive — no schema change):
 *   • requireRole() remains the FIRST gate — requirePermission() never widens
 *     access, it can only narrow it further.
 *   • The matrix stores per-role PermSets for EMPLOYEE / MANAGER / HR_ADMIN.
 *     Roles outside the matrix (HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN,
 *     FINANCE) pass through — their authority is defined by requireRole and,
 *     for SUPER_ADMIN/HR_DIRECTOR, deliberately not curtailable from a UI
 *     that HR_ADMIN can reach.
 *   • Backward compatibility: if NO matrix row exists for a featureKey the
 *     check passes (legacy-allow). Enforcement begins the moment an admin
 *     creates the row. This prevents a big-bang lockout while making every
 *     wired action immediately governable.
 *   • Denials are structured-logged and throw 'FORBIDDEN:' errors identical
 *     in shape to requireRole failures, so existing catch blocks behave.
 *   • 60s in-process cache keeps the per-action overhead at one indexed read
 *     per minute per feature.
 *
 * Wiring pattern for ALL future modules (Payroll inherits automatically):
 *   const session = await auth()
 *   requireRole(session, 'HR_ADMIN')
 *   await requirePermission(session.user, 'payroll.runs', 'create')
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { featurePermissions, type PermAction, type PermSet } from '@/drizzle/schema'
import { logger } from '@/lib/logger'

interface MatrixRow {
  employeePerms: PermSet
  managerPerms:  PermSet
  hrAdminPerms:  PermSet
}

interface PermissionActor {
  role?:     string | null
  personId?: string | null
  id?:       string | null
}

const MATRIXED_ROLES: Record<string, keyof MatrixRow> = {
  EMPLOYEE: 'employeePerms',
  MANAGER:  'managerPerms',
  HR_ADMIN: 'hrAdminPerms',
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { row: MatrixRow | null; expires: number }>()

/** Test hook + admin-save hook: drop cached matrix rows immediately. */
export function invalidatePermissionCache(featureKey?: string): void {
  if (featureKey) cache.delete(featureKey)
  else cache.clear()
}

async function loadMatrixRow(featureKey: string): Promise<MatrixRow | null> {
  const cached = cache.get(featureKey)
  if (cached && cached.expires > Date.now()) return cached.row

  const rows = await db
    .select({
      employeePerms: featurePermissions.employeePerms,
      managerPerms:  featurePermissions.managerPerms,
      hrAdminPerms:  featurePermissions.hrAdminPerms,
    })
    .from(featurePermissions)
    .where(eq(featurePermissions.featureKey, featureKey))
    .limit(1)

  const row = rows[0] ?? null
  cache.set(featureKey, { row, expires: Date.now() + CACHE_TTL_MS })
  return row
}

/**
 * Pure evaluation — exported for unit tests.
 * Returns 'ALLOW' | 'DENY' | 'LEGACY_ALLOW' | 'ROLE_NOT_MATRIXED'.
 */
export function evaluatePermission(
  role: string | null | undefined,
  row: MatrixRow | null,
  action: PermAction,
): 'ALLOW' | 'DENY' | 'LEGACY_ALLOW' | 'ROLE_NOT_MATRIXED' {
  const permsKey = MATRIXED_ROLES[role ?? '']
  if (!permsKey) return 'ROLE_NOT_MATRIXED'
  if (!row) return 'LEGACY_ALLOW'
  return row[permsKey]?.[action] ? 'ALLOW' : 'DENY'
}

/**
 * Runtime permission gate. Throws 'FORBIDDEN:' on deny; resolves on allow.
 * Never widens access — call AFTER requireRole().
 */
export async function requirePermission(
  actor: PermissionActor,
  featureKey: string,
  action: PermAction,
): Promise<void> {
  const row = await loadMatrixRow(featureKey)
  const verdict = evaluatePermission(actor.role, row, action)

  if (verdict === 'DENY') {
    logger.warn('permissions', 'permission.denied', {
      featureKey,
      action,
      role:     actor.role ?? 'UNKNOWN',
      personId: actor.personId ?? actor.id ?? 'UNKNOWN',
    })
    throw new Error(`FORBIDDEN: role ${actor.role} lacks '${action}' permission on '${featureKey}'`)
  }
}
