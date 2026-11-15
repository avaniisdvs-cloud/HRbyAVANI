/**
 * SQL safety validator for DataOps — prevents destructive or dangerous statements.
 */

const BLOCKED_KEYWORDS = [
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bSET\s+ROLE\b/i,
  /\bpg_sleep\b/i,
  /\bpg_read_file\b/i,
  /\bpg_write_file\b/i,
  /\bCOPY\s+.*\s+FROM\s+PROGRAM\b/i,
  /\bCOPY\s+.*\s+TO\s+PROGRAM\b/i,
  /\bLO_IMPORT\b/i,
  /\bLO_EXPORT\b/i,
]

const BLOCKED_SCHEMAS = ['pg_catalog', 'pg_toast', 'pg_temp', 'information_schema']

// Only SELECT is allowed for non-SUPER_ADMIN
const WRITE_KEYWORDS = [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i]

export interface ValidationResult {
  ok:    boolean
  error: string | null
  isWrite: boolean
}

/** Strips string literals to avoid false positives on content matching keywords */
function stripStringLiterals(sql: string): string {
  return sql
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/\$\$[\s\S]*?\$\$/g, "$$$$")
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

export function validateSql(sql: string, canWrite: boolean): ValidationResult {
  const stripped = stripStringLiterals(sql.trim())

  for (const pattern of BLOCKED_KEYWORDS) {
    if (pattern.test(stripped)) {
      return { ok: false, error: `Blocked keyword matched: ${pattern.source.replace(/\\b/g, '')}`, isWrite: false }
    }
  }

  for (const schema of BLOCKED_SCHEMAS) {
    if (stripped.toLowerCase().includes(schema.toLowerCase())) {
      return { ok: false, error: `Access to schema '${schema}' is not permitted`, isWrite: false }
    }
  }

  // Multi-statement detection
  const statements = stripped.split(';').map(s => s.trim()).filter(Boolean)
  if (statements.length > 1) {
    return { ok: false, error: 'Multi-statement queries are not allowed', isWrite: false }
  }

  const isWrite = WRITE_KEYWORDS.some(p => p.test(stripped))

  if (isWrite && !canWrite) {
    return { ok: false, error: 'Write operations require SUPER_ADMIN role', isWrite: true }
  }

  return { ok: true, error: null, isWrite }
}
