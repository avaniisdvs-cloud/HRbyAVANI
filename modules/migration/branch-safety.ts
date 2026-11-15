/**
 * UAT Migration Load Console — write-safety guard.
 *
 * ENV-GOV: single active DEV/UAT today, future Production later.
 *
 * Migration console writes are allowed only when all checks pass:
 *
 *   1. ENABLE_MIGRATION_CONSOLE === 'true'
 *   2. DATABASE_ENV is test or uat
 *   3. In uat-prod mode, PROD_DATABASE_URL is configured and differs
 *   4. ALLOW_NON_PROD_CLOUD_DB_WRITE === 'true'
 *   5. ALLOW_UAT_RELOAD_WRITE === 'true'
 *
 * Production writes and reload/clear operations are never enabled here.
 * SUPER_ADMIN role + typed confirmations remain per-action barriers.
 */
import 'server-only'
import {
  getDatabaseEnv,
  getEnvironmentGovernanceMode,
  isKnownDatabaseEnv,
  isProductionDatabaseEnv,
  isProductionComparisonRequired,
  isUatDatabaseEnv,
} from '@/lib/environment-guardrails'
import type { BranchSafety } from './types'

function resolveHost(rawUrl: string | undefined): string {
  if (!rawUrl) return ''
  try {
    return new URL(rawUrl).hostname
  } catch {
    const m = rawUrl.match(/@([^/:?]+)/)
    return m?.[1] ?? ''
  }
}

function maskHost(host: string): string {
  if (!host) return '(unknown)'
  return host.replace(/^([a-z0-9-]{4})[^.]*(\..*)?$/i, '$1***')
}

export function getBranchSafety(): BranchSafety {
  const enabled                 = process.env.ENABLE_MIGRATION_CONSOLE === 'true'
  const allowNonProdCloudWrite  = process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE === 'true'
  const allowUatReloadWrite     = process.env.ALLOW_UAT_RELOAD_WRITE === 'true'
  const databaseEnv             = getDatabaseEnv()
  const governanceMode          = getEnvironmentGovernanceMode()
  const productionComparisonRequired = isProductionComparisonRequired()
  const host                    = resolveHost(process.env.DATABASE_URL)
  const productionHost          = resolveHost(process.env.PROD_DATABASE_URL)
  const prodHostConfigured      = !!productionHost
  const targetDiffersFromProduction = !!host && !!productionHost && host !== productionHost
  const isProductionHost = !!host && !!productionHost && host === productionHost
  const isProductionEnv = isProductionDatabaseEnv()

  const safe = enabled &&
    !!host &&
    isKnownDatabaseEnv(databaseEnv) &&
    isUatDatabaseEnv(databaseEnv) &&
    (!productionComparisonRequired || (prodHostConfigured && targetDiffersFromProduction)) &&
    !isProductionEnv &&
    !isProductionHost &&
    allowNonProdCloudWrite &&
    allowUatReloadWrite

  let reason: string
  if (!enabled) {
    reason = 'ENABLE_MIGRATION_CONSOLE is not "true" - console disabled. / وحدة الترحيل معطلة.'
  } else if (!host) {
    reason = 'DATABASE_URL host could not be resolved. / تعذر تحديد قاعدة البيانات المستهدفة.'
  } else if (!databaseEnv) {
    reason = 'BLOCKED - DATABASE_ENV is required. / تم الإيقاف: يجب تحديد بيئة قاعدة البيانات.'
  } else if (!isKnownDatabaseEnv(databaseEnv)) {
    reason = 'BLOCKED - DATABASE_ENV must be development, test, uat, or production. / تم الإيقاف: قيمة بيئة قاعدة البيانات غير معتمدة.'
  } else if (isProductionEnv || isProductionHost) {
    reason = 'BLOCKED - production database detected. Migration reloads are never allowed in production. / تم الإيقاف: لا يسمح بإعادة التحميل على الإنتاج.'
  } else if (!isUatDatabaseEnv(databaseEnv)) {
    reason = 'BLOCKED - migration console writes require DATABASE_ENV=test or uat. / تم الإيقاف: عمليات الترحيل مسموحة فقط في الاختبار أو UAT.'
  } else if (productionComparisonRequired && !prodHostConfigured) {
    reason = 'BLOCKED - PROD_DATABASE_URL is required when ENV_GOVERNANCE_MODE=uat-prod. / تم الإيقاف: يجب ضبط رابط قاعدة الإنتاج عند تفعيل وضع الإنتاج.'
  } else if (productionComparisonRequired && !targetDiffersFromProduction) {
    reason = 'BLOCKED - target host must differ from PROD_DATABASE_URL. / تم الإيقاف: يجب أن تختلف قاعدة الهدف عن الإنتاج.'
  } else if (!allowNonProdCloudWrite) {
    reason = 'BLOCKED - ALLOW_NON_PROD_CLOUD_DB_WRITE must be "true". / تم الإيقاف: يجب تفعيل إذن الكتابة لبيئة غير إنتاجية.'
  } else if (!allowUatReloadWrite) {
    reason = 'BLOCKED - ALLOW_UAT_RELOAD_WRITE must be "true" for clear/reload writes. / تم الإيقاف: يجب تفعيل إذن إعادة تحميل UAT.'
  } else {
    reason = governanceMode === 'single-dev-uat'
      ? 'OK - writes enabled for the single active DEV/UAT environment. / مسموح: الكتابة مفعلة لبيئة DEV/UAT الحالية.'
      : 'OK - writes enabled for dedicated Test/UAT branch only. / مسموح: الكتابة مفعلة لفرع الاختبار أو UAT فقط.'
  }

  return {
    enabled,
    databaseEnv,
    governanceMode,
    hostMasked: maskHost(host),
    isProductionHost,
    prodHostConfigured,
    targetDiffersFromProduction,
    productionComparisonRequired,
    allowNonProdCloudWrite,
    allowUatReloadWrite,
    safe,
    reason,
  }
}

/** Throws if it is not safe to write. Call at the top of every migration write action. */
export function assertBranchSafe(): void {
  const s = getBranchSafety()
  if (!s.safe) {
    throw new Error(`MIGRATION_WRITE_BLOCKED: ${s.reason}`)
  }
}
