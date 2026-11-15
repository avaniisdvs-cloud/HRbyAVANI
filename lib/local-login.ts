/**
 * Controlled LOCAL password login — pure decision helpers.
 *
 * These functions contain the eligibility + lockout logic for non-SSO password
 * login. They are PURE (no DB, no I/O) so they can be unit-tested exhaustively.
 * The DB reads/writes live in lib/auth.ts authorize(), which calls these.
 *
 * Policy (approved 2026-06-05): SSO vs password is decided by IDENTITY, not role.
 *   • Users WITH a corporate email / SSO identity → must use Microsoft Entra SSO.
 *   • Users WITHOUT a corporate email (e.g. drivers, office boys, blue-collar
 *     staff) → may use LOCAL password login, WHATEVER their assigned role.
 * The gate is the account's `primarySsoProvider = 'LOCAL'` (set when no corporate
 * SSO email exists). RBAC is ALWAYS enforced by the assigned role — a LOCAL user
 * gets exactly their role's permissions, no more. SUPER_ADMIN break-glass login
 * is handled separately in authorize() and is NOT governed by these helpers.
 *
 * MFA note: LOCAL accounts cannot perform Entra MFA, so the step-up is exempted
 * for LOCAL sessions in requireRole(). Re-enabling MFA is tracked as OP-001
 * (docs/OPEN-POINTS.md) and must be revisited before go-live.
 */

// Roles allowed to use LOCAL password login (SUPER_ADMIN handled separately via
// break-glass in authorize()). All non-super roles are permitted because the
// real gate is primarySsoProvider='LOCAL' (no corporate SSO email), not the role.
export const LOCAL_LOGIN_ROLES = [
  'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE',
] as const

// Lockout policy.
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MINUTES     = 15

export interface LoginAccount {
  avaniisRole:        string
  isActive:           boolean
  primarySsoProvider: string
  passwordHash:       string | null
  failedLoginCount:   number
  lockedUntil:        Date | null
}

/**
 * Can this account use LOCAL password login at all (evaluated BEFORE the
 * password is compared)? Requires: active, provider=LOCAL, a password hash is
 * set, and an allow-listed role. Does NOT consider lockout (see isLocked).
 */
export function isLocalLoginEligible(a: LoginAccount): boolean {
  return (
    a.isActive === true &&
    a.primarySsoProvider === 'LOCAL' &&
    a.passwordHash != null &&
    a.passwordHash !== '' &&
    (LOCAL_LOGIN_ROLES as readonly string[]).includes(a.avaniisRole)
  )
}

/** Is the account currently locked out? */
export function isLocked(a: Pick<LoginAccount, 'lockedUntil'>, now: Date): boolean {
  return a.lockedUntil != null && a.lockedUntil.getTime() > now.getTime()
}

// Employment statuses that end access (B1, approved Option A). persons.isActive
// stays TRUE (record-active / soft-delete flag); employment state is owned by
// assignmentStatus + separationDate. A separated worker must not authenticate or
// reach ESS even though their person record remains queryable for history.
export const ACCESS_ENDING_STATUSES = ['TERMINATED', 'RETIRED', 'DECEASED'] as const

/**
 * Has this worker's employment ended (so login/ESS access must be blocked)?
 * PURE — no DB. True when assignmentStatus is access-ending, OR a separationDate
 * is set and on/before `today`. SUPER_ADMIN break-glass is exempted by the caller.
 * @param assignmentStatus persons.assignment_status (may be null/unknown)
 * @param separationDate    persons.separation_date as ISO yyyy-mm-dd (or null)
 * @param todayIso          current date as ISO yyyy-mm-dd (caller supplies)
 */
export function isSeparated(
  assignmentStatus: string | null | undefined,
  separationDate: string | null | undefined,
  todayIso: string,
): boolean {
  if (assignmentStatus && (ACCESS_ENDING_STATUSES as readonly string[]).includes(assignmentStatus)) {
    return true
  }
  if (separationDate && separationDate <= todayIso) return true
  return false
}

/**
 * DB fields to write after a FAILED password attempt. Increments the failure
 * counter and, once the threshold is reached, sets lockedUntil.
 */
export function failureUpdate(
  a: Pick<LoginAccount, 'failedLoginCount'>,
  now: Date,
): { failedLoginCount: number; lockedUntil: Date | null } {
  const failedLoginCount = (a.failedLoginCount ?? 0) + 1
  const lockedUntil =
    failedLoginCount >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
      : null
  return { failedLoginCount, lockedUntil }
}

/**
 * DB fields to write after a SUCCESSFUL login. Resets the failure counter,
 * clears any lock, and stamps the last-login time. (loginCount is incremented
 * separately in authorize() via a SQL expression to avoid a read-modify-write.)
 */
export function successUpdate(now: Date): {
  failedLoginCount: number
  lockedUntil: Date | null
  lastLoginAt: Date
} {
  return { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now }
}
