/** UAT Migration Load Console — shared types. */

export interface BranchSafety {
  /** Feature flag ENABLE_MIGRATION_CONSOLE === 'true' */
  enabled: boolean
  /** DATABASE_ENV classification used for governance. */
  databaseEnv: string
  /** Current repository-side environment model. */
  governanceMode: string
  /** Masked DB host (no credentials). */
  hostMasked: string
  /** True if the target DB host matches production by PROD_DATABASE_URL or legacy fragment. */
  isProductionHost: boolean
  /** True when PROD_DATABASE_URL was configured for host comparison. */
  prodHostConfigured: boolean
  /** True when DATABASE_URL host differs from PROD_DATABASE_URL host. */
  targetDiffersFromProduction: boolean
  /** True when production host comparison is mandatory. */
  productionComparisonRequired: boolean
  /** Explicit non-production cloud write approval flag. */
  allowNonProdCloudWrite: boolean
  /** Explicit UAT/Test reload approval flag. */
  allowUatReloadWrite: boolean
  /** Safe to write = dedicated Test/UAT branch + all approval flags. */
  safe: boolean
  /** Human-readable reason when not safe. */
  reason: string
}

export interface MasterDataItemStatus {
  kind: 'business_unit' | 'grade' | 'location' | 'department' | 'job' | 'position'
  code: string
  label: string
  exists: boolean
}

export interface MigrationStatus {
  branch: BranchSafety
  summary: typeof import('./manifest').MANIFEST_SUMMARY
  items: MasterDataItemStatus[]
  toCreate: number
  alreadyPresent: number
}

export interface SeedResult {
  ok: boolean
  created: { kind: string; code: string }[]
  skipped: { kind: string; code: string }[]
  failed:  { kind: string; code: string; error: string }[]
  message: string
}

export interface BackfillResult {
  ok: boolean
  updated: { departmentCode: string; headEmployeeNumber: string }[]
  skipped: { departmentCode: string; reason: string }[]
  message: string
}

export interface ResetPreview {
  /** Per-table row counts that WILL be deleted. */
  counts: { table: string; rows: number }[]
  totalRows: number
}

export interface ResetResult {
  ok: boolean
  clearedTables: string[]
  message: string
}
