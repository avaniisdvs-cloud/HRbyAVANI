/**
 * Payroll workstream feature gate (production-readiness — Core HR-only release).
 *
 * WHY THIS EXISTS
 * ---------------
 * The first intended production release is Core HR / non-payroll only. Payroll is
 * fully built, routed and role-gated, but is DEFERRED from the first release until
 * a full payroll UAT cycle and Payroll Owner sign-off (see
 * docs/environment/PRODUCTION-GO-LIVE-READINESS.md, blocker P-4).
 *
 * Nav-hiding alone is not enough: an authorized HR-tier user could still reach
 * `/payroll/runs/new` by URL and create/calculate a run. This gate is the
 * ADDITIONAL, defence-in-depth control that blocks payroll at the route AND
 * server-action layers when the workstream is not explicitly enabled.
 *
 * SECURITY MODEL
 * --------------
 *  - This is ADDITIONAL protection, NOT a replacement for RBAC. Existing role
 *    checks (`requireRole`, `PAYROLL_ROLES`, entity scoping) remain in place and
 *    still run. The gate fails closed: payroll is DISABLED unless the server-side
 *    env flag `PAYROLL_WORKSTREAM_ENABLED` is exactly the string "true".
 *  - The authoritative gate is server-side (`PAYROLL_WORKSTREAM_ENABLED`). A
 *    client-readable cosmetic mirror (`NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED`)
 *    only controls nav visibility — it can never grant access on its own.
 *
 * USAGE
 * -----
 *  - Page/layout:        `if (!isPayrollWorkstreamEnabled()) <disabled notice>`
 *  - Server action:      `if (!isPayrollWorkstreamEnabled()) return { success:false, error: PAYROLL_DISABLED_MESSAGE }`
 *  - Imperative guard:   `assertPayrollWorkstreamEnabled()` (throws PayrollDisabledError)
 */

type EnvMap = Partial<Record<string, string | undefined>>

/** User-facing safe message shown when payroll is disabled in this environment. */
export const PAYROLL_DISABLED_MESSAGE = 'Payroll is disabled in this environment.'

/** Server-side env flag name (authoritative gate). */
export const PAYROLL_WORKSTREAM_ENV_FLAG = 'PAYROLL_WORKSTREAM_ENABLED'

/**
 * Client-readable cosmetic mirror (nav visibility only; never grants access).
 * NOTE: NEXT_PUBLIC_* values are inlined at BUILD time. To surface payroll in nav
 * you must set this at build and rebuild; the authoritative server gate
 * (PAYROLL_WORKSTREAM_ENABLED) is read at RUNTIME. Both default to off/blocked.
 */
export const PAYROLL_WORKSTREAM_PUBLIC_ENV_FLAG = 'NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED'

/**
 * Is the payroll workstream explicitly enabled in this environment?
 * Fails closed: returns true ONLY when the flag is exactly "true".
 */
export function isPayrollWorkstreamEnabled(env: EnvMap = process.env): boolean {
  return env[PAYROLL_WORKSTREAM_ENV_FLAG] === 'true'
}

/** Thrown by assertPayrollWorkstreamEnabled when payroll is disabled. */
export class PayrollDisabledError extends Error {
  readonly code = 'PAYROLL_WORKSTREAM_DISABLED'
  constructor(message: string = PAYROLL_DISABLED_MESSAGE) {
    super(message)
    this.name = 'PayrollDisabledError'
  }
}

/**
 * Imperative guard for code paths that cannot return a result object.
 * Throws PayrollDisabledError when payroll is disabled.
 */
export function assertPayrollWorkstreamEnabled(env: EnvMap = process.env): void {
  if (!isPayrollWorkstreamEnabled(env)) {
    throw new PayrollDisabledError()
  }
}
