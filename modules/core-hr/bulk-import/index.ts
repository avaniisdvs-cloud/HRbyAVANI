/**
 * Bulk Employee Import — public barrel.
 *
 * IMPORTANT: Do NOT export anything that imports lib/db here.
 * row-validator, import-engine, and template all import Node.js-only
 * modules (postgres → net). Exporting them would bundle them into
 * Client Components that import @/modules/core-hr.
 *
 * Safe to export: types, Server Actions ('use server'), EMPLOYEE_HEADERS.
 * Internal only: parseSheet, validateImportRows, importEmployeesTx, buildImportTemplate.
 */
export type {
  RawImportRow,
  ValidatedImportRow,
  ResolvedRefs,
  RowIssue,
  IssueSeverity,
  ImportPreview,
  ImportRowResult,
  ImportResult,
} from './types'

export type { TemplateRefData } from './template'

// EMPLOYEE_HEADERS is a plain const array — safe for client bundles.
export { EMPLOYEE_HEADERS } from './template'

// Server Actions — Next.js isolates these via 'use server'; safe to export.
export {
  validateImportFile,
  confirmImport,
  getTemplateRefData,
} from './actions'
