import { and, eq, inArray, count as sqlCount } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userAccounts, workerAssignments } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'

// Roles that the auto-promotion/demotion engine must never touch.
const PROTECTED_ROLES = new Set([
  'SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE',
])

// Statuses that count as "active reporting relationship"
const ACTIVE_STATUSES = ['ACTIVE', 'ON_LEAVE']

type Actor = { id: string; name: string; role: string }
type Tx    = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Evaluates whether a person's system role should be promoted to MANAGER
 * or demoted back to EMPLOYEE based on current active subordinate count.
 *
 * Rules:
 *   - Protected roles (SUPER_ADMIN, HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, FINANCE) are never touched.
 *   - EMPLOYEE → MANAGER: person has ≥1 active subordinate and role is EMPLOYEE
 *   - MANAGER  → EMPLOYEE: person has 0 active subordinates and role is MANAGER
 *
 * Safe to call inside a running Drizzle transaction — pass `tx` to use it.
 * If `personId` has no user_account, the function returns without error.
 */
export async function evaluateManagerRole(
  personId: string,
  actor: Actor,
  tx?: Tx,
): Promise<void> {
  if (!personId) return

  const conn = tx ?? db

  // 1. Find the user_account for this person
  const [account] = await conn
    .select({ id: userAccounts.id, avaniisRole: userAccounts.avaniisRole })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.personId, personId),
      eq(userAccounts.isActive, true),
    ))
    .limit(1)

  if (!account) return
  if (PROTECTED_ROLES.has(account.avaniisRole)) return

  // 2. Count active subordinates
  const [{ n }] = await conn
    .select({ n: sqlCount() })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.lineManagerId, personId),
      inArray(workerAssignments.assignmentStatus, ACTIVE_STATUSES),
      eq(workerAssignments.isCurrent, true),
    ))

  const hasSubordinates = Number(n) > 0
  const currentRole     = account.avaniisRole

  let newRole: string | null = null
  if (hasSubordinates  && currentRole === 'EMPLOYEE') newRole = 'MANAGER'
  if (!hasSubordinates && currentRole === 'MANAGER')  newRole = 'EMPLOYEE'

  if (!newRole) return

  // 3. Update the role
  await conn
    .update(userAccounts)
    .set({
      avaniisRole:   newRole,
      updatedBy:     actor.id,
      updatedByName: actor.name,
      updatedDate:   new Date(),
    })
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.id, account.id),
    ))

  // 4. Audit trail
  await writeAuditLog({
    actorId:      actor.id,
    actorName:    actor.name,
    actorRole:    actor.role,
    channel:      'SYSTEM',
    eventType:    newRole === 'MANAGER' ? 'USER.AUTO_PROMOTED_MANAGER' : 'USER.AUTO_DEMOTED_EMPLOYEE',
    resourceType: 'user_accounts',
    resourceId:   account.id,
    oldValues:    { avaniisRole: currentRole },
    newValues:    { avaniisRole: newRole },
    metadata: {
      reason:           newRole === 'MANAGER'
        ? 'Auto-promoted: employee has active subordinates'
        : 'Auto-demoted: employee has no active subordinates',
      subordinateCount: Number(n),
      personId,
    },
  }, tx)
}
