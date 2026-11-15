/**
 * lib/access — shared server-side authorization guards (W0 Foundation).
 *
 * Single source of truth for the four authorization primitives that the QA/QC
 * fix waves depend on. Every guard is server-only and derives or verifies the
 * actor from the authenticated session — NEVER from caller-supplied arguments.
 *
 * Primitives:
 *   • deriveActorIdentity()        — canonical session-truth identity. Use this
 *                                    instead of trusting any client-supplied
 *                                    { personId, role, legalEntityId } context.
 *   • assertSameEntity(...)        — block cross-legal-entity access (SUPER_ADMIN
 *                                    bypass). Pure/sync.
 *   • assertSelfOrTeam(...)        — relationship-based person-data gate: self,
 *                                    recursive direct/indirect reports, or HR.
 *   • assertActivePersonTarget(...)— reject actions targeting a terminated /
 *                                    inactive employee (isActive + assignmentStatus).
 *
 * Lock helpers are intentionally NOT added here: createLeaveRequest already holds
 * a per-person pg_advisory_xact_lock('leave:'||personId); introducing a second
 * key would not serialize against it (a residual-issue risk). Callers that need
 * serialization reuse the existing in-transaction lock.
 *
 * No behavior change on its own — these are consumed by W1–W3 fixes.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getCurrentUser, type KRole } from '@/lib/auth'
import { resolveManagerViewablePersonIds } from '@/lib/leave-person-scope'
import { TENANT_ID } from '@/lib/constants'
import { persons } from '@/drizzle/schema'

/** Roles authorised to act across the whole entity / any person (relationship-free). */
const HR_ROLES = new Set<string>(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

/**
 * Canonical, server-derived actor identity. The shape every authorization fix
 * keys off. Built ONLY from the authenticated session — callers must never
 * substitute client-supplied identity fields.
 */
export type ActorIdentity = {
  userId:        string
  role:          KRole
  legalEntityId: string
  personId?:     string
  mfaVerified?:  boolean
}

/**
 * Re-derive the acting user from auth() / the current session.
 *
 * This is the reference fix for the "trust caller-supplied identity" defect
 * class (P3-A1 etc.): server actions that previously read a client-passed
 * sessionCtx must call deriveActorIdentity() and use its values instead.
 *
 * Throws `UNAUTHENTICATED` (via getCurrentUser) if there is no valid session.
 */
export async function deriveActorIdentity(): Promise<ActorIdentity> {
  const u = await getCurrentUser()
  return {
    userId:        u.id,
    role:          u.role as KRole,
    legalEntityId: u.legalEntityId,
    personId:      u.personId,
    mfaVerified:   u.mfaVerified,
  }
}

/**
 * Block cross-legal-entity access. SUPER_ADMIN bypasses (multi-entity).
 * Pure/synchronous — pass the already-derived actor and the resource's entity.
 *
 * Throws `FORBIDDEN` when the actor's entity does not match the target entity,
 * or when the target entity is missing for a non-SUPER_ADMIN actor.
 */
export function assertSameEntity(
  actor: { role: string; legalEntityId: string },
  targetEntityId: string | null | undefined,
): void {
  if (actor.role === 'SUPER_ADMIN') return
  if (!targetEntityId || actor.legalEntityId !== targetEntityId) {
    throw new Error('FORBIDDEN: cross-entity access is not permitted')
  }
}

/**
 * Relationship-based person-data gate (IDOR guard).
 *   HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN → any person
 *   self                                 → always allowed
 *   line manager                         → any recursive direct/indirect report
 *   everyone else                        → FORBIDDEN
 *
 * Mirrors the leave-request scope (assertCanRequestLeaveFor) so person-data
 * reads/writes share one consistent rule. Reuses the cycle-safe team CTE.
 *
 * Throws `FORBIDDEN` when the actor may not access the target person's data.
 */
export async function assertSelfOrTeam(
  actor: { role: string; personId?: string },
  targetPersonId: string,
): Promise<void> {
  if (HR_ROLES.has(actor.role)) return
  if (actor.personId && actor.personId === targetPersonId) return
  if (actor.personId) {
    const team = await resolveManagerViewablePersonIds(actor.personId)
    if (team.includes(targetPersonId)) return
  }
  throw new Error('FORBIDDEN: not authorised to access this employee\'s data')
}

/**
 * Reject an action whose target employee is terminated or otherwise inactive.
 *
 * Termination clears `worker_assignments`/`persons.assignment_status` but NOT
 * `persons.is_active` (documented invariant) — so BOTH must be checked to
 * exclude terminated staff. Used to stop leave (and similar lifecycle actions)
 * being filed for an employee who is no longer active.
 *
 * Throws `PERSON_NOT_FOUND` if no such person, `PERSON_INACTIVE` if not active.
 */
export async function assertActivePersonTarget(targetPersonId: string): Promise<void> {
  const [p] = await db
    .select({ isActive: persons.isActive, assignmentStatus: persons.assignmentStatus })
    .from(persons)
    .where(and(eq(persons.id, targetPersonId), eq(persons.tenantId, TENANT_ID)))
    .limit(1)

  if (!p) {
    throw new Error('PERSON_NOT_FOUND: target employee does not exist')
  }
  if (!p.isActive || p.assignmentStatus !== 'ACTIVE') {
    throw new Error(
      'PERSON_INACTIVE: cannot perform this action for a terminated or inactive employee',
    )
  }
}
