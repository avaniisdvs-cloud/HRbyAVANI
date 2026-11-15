/**
 * GAP-M01 FIX (FIX-S9-01) — Sick-leave medical-certificate policy.
 *
 * Resolves the sick-leave medical-certificate threshold for an entity.
 * The threshold is configurable per organisation, not hardcoded.
 *
 * Returns the number of sick-leave days allowed WITHOUT a certificate:
 *   • 0 = certificate required from Day 1 (UAE Labour Law Article 31 minimum)
 *   • 2 = certificate required only if leave > 2 days (Avaniis policy)
 *   • 3 = certificate required only if leave > 3 days (max grace allowed)
 *
 * BR-SL-002: Article 31, FDL 33/2021 — UAE minimum is Day 1 (threshold=0).
 * Values above 0 are an employer concession. The seed value defaults to 0
 * (most compliant); HR_DIRECTOR may raise it via Settings → Policy Settings.
 */
import { getPolicy } from './config-resolver'
import type { DbOrTx } from './db'

const SETTING_KEY = 'SICK_LEAVE_CERT_THRESHOLD_DAYS'
const SICK_LEAVE_TYPE_CODE = 'SICK'
const MAX_GRACE_DAYS = 3 // Hard cap — anything higher is legally risky.

/**
 * Reads `SICK_LEAVE_CERT_THRESHOLD_DAYS` from policy_settings for an entity
 * and clamps the result into the legal range [0, 3].
 *
 * If the policy is missing or malformed, falls back to 0 (UAE statutory
 * minimum) — this is the safe default; never relax to a more lenient value
 * when the configuration is absent.
 */
export async function getSickLeaveCertThreshold(
  entityId: string,
  // DEADLOCK-FIX: pass the active transaction when calling from inside a
  // db.transaction() (production pool is max:1 — a global-pool read inside an
  // open transaction deadlocks). Defaults to the global `db` for normal calls.
  executor?: DbOrTx,
): Promise<number> {
  const raw = await getPolicy(SETTING_KEY, entityId, undefined, executor)
  const parsed = parseInt(raw ?? '0', 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(Math.max(parsed, 0), MAX_GRACE_DAYS)
}

/**
 * Determines if a medical certificate is required for a leave request.
 * Pure helper — exhaustively unit-tested in `tests/unit/absence-cert-policy.test.ts`.
 *
 *   threshold=0 → required from day 1 (any duration > 0 triggers)
 *   threshold=2 → required only when duration > 2
 *   threshold=3 → required only when duration > 3
 *
 * Non-sick leave types never require a medical certificate via this policy.
 */
export function isMedicalCertRequired(
  absenceTypeCode: string,
  durationDays: number,
  certThresholdDays: number,
): boolean {
  if (absenceTypeCode !== SICK_LEAVE_TYPE_CODE) return false
  return durationDays > certThresholdDays
}
