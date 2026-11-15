/** Migration Load Console — public module barrel. */
export { getMigrationStatus, seedMasterData, backfillDepartmentHeads, getResetPreview, resetStagingData } from './seed-actions'
export { getBranchSafety } from './branch-safety'
export * as MigrationManifest from './manifest'
export type {
  BranchSafety, MigrationStatus, MasterDataItemStatus, SeedResult, BackfillResult, ResetPreview, ResetResult,
} from './types'

// V2
export { parseMigrationPackageFile } from './v2-package-parser'
// Source ingestion (Phase A)
export { classifySourceFile, summarizeSheet, effectiveType } from './source-classifier'
export { normalizeUaeMobile, formatSourceDate, resolveNationalityCode, transformSourceFiles } from './source-transformer'
export type {
  SourceFileType, ClassificationConfidence, SheetSummary,
  SourceFileAnalysis, ClassifiedSourceFile, RawSourceRow,
  TransformContext, TransformPosition, TransformDepartment,
  TransformOptions, MigrationMode,
  TransformWarning, TransformBlocker, TransformationSummary,
} from './source-types'
export type { TransformResult } from './source-transformer'
// Source ingestion (Phase B)
export {
  saveSession, loadSession, savePackage, loadPackage,
  sessionExists, packageExists, clearSession,
} from './package-store'
export type { StoredFileEntry, StoredSession, StoredPackage } from './package-store'
export {
  analyzeSourceFiles, buildMigrationPackage, getSessionPackage, clearSessionFiles,
} from './source-actions'
export type { AnalyzeResult, BuildResult } from './source-actions'
export { buildDryRunSummary } from './v2-dry-run'
export { validateMigrationPackage } from './v2-validator'
export { executeMigrationV2 } from './v2-executor'
export { parseMigrationPackage, validateMigrationPackage as validateMigrationPackageAction, executeMigration, getPostLoadScorecard } from './v2-actions'
export type {
  V2ParsedPackage, V2ValidationResult, V2ExecutionResult, V2Issue, DryRunSummary,
  PostLoadScorecard, PostLoadScorecardRow, SignOffVerdict,
  RawManagerRow, RawDeptHeadRow, RawLeaveBalanceRow, V2ResolvedLeaveBalance,
} from './v2-types'
