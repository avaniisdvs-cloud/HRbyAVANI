/**
 * CSV utilities — RFC 4180 compliant + formula-injection guard.
 *
 * `csvField` quotes per RFC 4180 (commas, quotes, CR, LF) AND prefixes
 * the value with `'` when the first character would otherwise be
 * interpreted as a formula by Excel / LibreOffice / Numbers (`=`, `+`,
 * `-`, `@`, `\t`, `\r`). That is the OWASP-recommended mitigation for
 * CWE-1236 (S6-Q2).
 *
 * Extracted from the absence-balances export route so the same
 * guarantees apply to every future CSV endpoint (payroll, audit, GL).
 */

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/

/** RFC 4180 + formula-injection-safe single-cell escape. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // OWASP CWE-1236 — neutralise leading formula triggers BEFORE quoting.
  if (FORMULA_TRIGGERS.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Joins a row of cells with commas; each cell escaped via `csvField`. */
export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvField).join(',')
}

/**
 * Builds a complete CSV body from a header row + data rows. Prepends a
 * UTF-8 BOM so Excel opens Arabic / encoded names without garbling.
 * Lines end with CRLF per RFC 4180 §2.1.
 */
export function buildCsv(
  header: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>,
): string {
  const lines = [csvRow(header), ...rows.map(csvRow)]
  return '﻿' + lines.join('\r\n') + '\r\n'
}
