/**
 * DataOps write-guard — EPRC-01 B1 (closes P3-D3).
 *
 * The DataOps console is a SUPER_ADMIN break-glass tool that executes raw SQL
 * and structured row writes outside the normal service layer. Left unguarded it
 * can (a) write plaintext into encrypted PII columns, (b) hard-DELETE protected
 * HR / effective-dated rows, and (c) mutate CoreHR tables outside their service
 * layer / effective-dated actions.
 *
 * This module centralises three additive safeguards. It NEVER widens access — it
 * can only narrow what an already-SUPER_ADMIN-gated route is allowed to do. All
 * denials are returned as safe verdicts; callers must also write an audit event.
 *
 * Companion: routes additionally MIRROR every accepted mutation into the main
 * audit_log (lib/audit.ts) via mirrorDataopsAudit() so DataOps writes are no
 * longer invisible to the primary audit trail.
 */
import type { AuditEvent } from '@/lib/audit'

/**
 * Columns that are field-level encrypted (lib/encryption.ts) or are keyed-hash
 * uniqueness columns (migration 0065). They MUST be written by the application
 * service layer, never as raw values through DataOps.
 */
export const PROTECTED_PII_COLUMNS = new Set<string>([
  'emirates_id',
  'passport_number',
  'iban',
  'emirates_id_hash',
  'passport_number_hash',
])

/**
 * Effective-dated timeline columns. DataOps must not edit these directly —
 * timeline transitions go through lib/effective-date.ts (close + open).
 */
export const TEMPORAL_COLUMNS = new Set<string>([
  'effective_start_date',
  'effective_end_date',
])

/**
 * Tables protected from raw hard-DELETE and raw temporal mutation via DataOps:
 * effective-dated entities, identity/PII masters, financial/payroll outputs, the
 * immutable audit log, and workflow-integrity tables. SUPER_ADMIN must use the
 * proper service functions (close + open, void, cancel) for these.
 */
export const PROTECTED_TABLES = new Set<string>([
  'persons',
  'worker_assignments',
  'contracts',
  'positions',
  'employment_actions',
  'person_bank_details',
  'payroll_results',
  'payroll_runs',
  'eosb_calculations',
  'wps_sif_records',
  'gpssa_contributions',
  'dews_contributions',
  // PPCDA-01 J7: payroll source-of-truth inputs. Effective-dated / range-keyed
  // comp data that drives every payroll calculation. A raw-SQL UPDATE here would
  // silently corrupt pay; these must go through the payroll service actions
  // (upsertSalaryElement / upsertPayrollDefinition) which audit + sequence them.
  'salary_elements',
  'grade_salary_ranges',
  'payroll_definitions',
  'audit_log',
  'workflow_instances',
  'workflow_step_instances',
  'absence_entries',
  'absence_balances',
])

/**
 * Structured row-editor writes are default-deny. Keep this list intentionally
 * tiny; operational HR/config changes should use the owning service action.
 */
export const STRUCTURED_WRITE_ALLOWLIST = new Set<string>([
  'lookup_values',
  'saved_queries',
])

export type WriteOp = 'INSERT' | 'UPDATE' | 'DELETE'

export interface WriteVerdict {
  allowed: boolean
  /** Stable code for audit + tests. */
  code?:
    | 'PII_COLUMN_BLOCKED'
    | 'TEMPORAL_COLUMN_BLOCKED'
    | 'PROTECTED_TABLE_DELETE_BLOCKED'
    | 'PROTECTED_TABLE_RAW_WRITE_BLOCKED'
    | 'MULTI_TABLE_OR_UNPARSEABLE_WRITE_BLOCKED'
    | 'STRUCTURED_TABLE_NOT_ALLOWLISTED'
  /** Safe, user-facing reason. */
  reason?: string
}

const ALLOWED: WriteVerdict = { allowed: true }

/**
 * Structured (row-editor) write guard — used by the PATCH/POST/DELETE row routes
 * where the table name and column keys are known explicitly.
 */
export function evaluateStructuredWrite(
  table: string,
  columns: string[],
  op: WriteOp,
): WriteVerdict {
  const t = table.toLowerCase()

  if (op === 'DELETE') {
    if (PROTECTED_TABLES.has(t)) {
      return {
        allowed: false,
        code: 'PROTECTED_TABLE_DELETE_BLOCKED',
        reason: `Hard delete of '${t}' is not permitted through DataOps. Use the appropriate service action (close/void/cancel) — HR records are never physically deleted.`,
      }
    }
    return ALLOWED
  }

  // INSERT / UPDATE
  const lowerCols = columns.map(c => c.toLowerCase())

  const pii = lowerCols.find(c => PROTECTED_PII_COLUMNS.has(c))
  if (pii) {
    return {
      allowed: false,
      code: 'PII_COLUMN_BLOCKED',
      reason: `Column '${pii}' is encrypted/keyed-hash PII and cannot be written through DataOps. Use the service layer so encryption and uniqueness hashing are applied.`,
    }
  }

  const temporal = lowerCols.find(c => TEMPORAL_COLUMNS.has(c))
  if (temporal && PROTECTED_TABLES.has(t)) {
    return {
      allowed: false,
      code: 'TEMPORAL_COLUMN_BLOCKED',
      reason: `Column '${temporal}' controls effective-dated timeline integrity on '${t}' and cannot be edited through DataOps. Use lib/effective-date.ts (close + open).`,
    }
  }

  if (PROTECTED_TABLES.has(t)) {
    return {
      allowed: false,
      code: 'PROTECTED_TABLE_RAW_WRITE_BLOCKED',
      reason: `Direct ${op} on protected CoreHR table '${t}' is not permitted through DataOps. Use the owning service action so validation, encryption, effective dating, and audit controls run.`,
    }
  }

  if (!STRUCTURED_WRITE_ALLOWLIST.has(t)) {
    return {
      allowed: false,
      code: 'STRUCTURED_TABLE_NOT_ALLOWLISTED',
      reason: `Structured ${op} on '${t}' is not allowlisted for DataOps. Read-only inspection remains available; writes require an explicitly approved service path or allowlist entry.`,
    }
  }

  return ALLOWED
}

/**
 * Raw-SQL write guard — used by the /execute route. SQL parsing is intentionally
 * conservative: when in doubt about a write touching protected data, block it.
 * Reads (SELECT) are never blocked here (read access is governed elsewhere).
 *
 * @param sql  SQL with string literals already stripped is NOT required — we
 *             strip literals/comments internally to avoid matching on content.
 */
export function evaluateRawSqlWrite(sql: string): WriteVerdict {
  const stripped = stripSqlNoise(sql).trim()
  const op = detectWriteOp(stripped)
  if (!op) return ALLOWED // SELECT / non-write — not this guard's concern

  const tables = referencedProtectedTables(stripped)

  if (op === 'DELETE') {
    if (tables.length > 0) {
      return {
        allowed: false,
        code: 'PROTECTED_TABLE_DELETE_BLOCKED',
        reason: `Raw DELETE targeting a protected table (${tables.join(', ')}) is not permitted. HR/effective-dated rows are never hard-deleted.`,
      }
    }
    return ALLOWED
  }

  // INSERT / UPDATE — block if it touches a protected table at all (we cannot
  // reliably prove a raw statement avoids PII/temporal columns), or if it names
  // any protected PII / temporal column anywhere.
  if (tables.length > 0) {
    return {
      allowed: false,
      code: 'PROTECTED_TABLE_RAW_WRITE_BLOCKED',
      reason: `Raw ${op} on a protected table (${tables.join(', ')}) is not permitted through DataOps. Use the row editor on a non-protected table or the service layer.`,
    }
  }

  const piiHit = [...PROTECTED_PII_COLUMNS].find(c => columnReferenced(stripped, c))
  if (piiHit) {
    return {
      allowed: false,
      code: 'PII_COLUMN_BLOCKED',
      reason: `Raw ${op} references encrypted/keyed-hash PII column '${piiHit}' and is not permitted through DataOps.`,
    }
  }

  return ALLOWED
}

// ── audit mirror ────────────────────────────────────────────────────────────

export interface DataopsAuditParams {
  actorId: string
  actorName: string
  actorRole: string
  ipAddress?: string
  op: WriteOp | 'WRITE_SQL'
  schema: string
  table: string
  pk?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  /** When set, records a BLOCKED attempt instead of an applied mutation. */
  blockedCode?: string
  sqlText?: string
}

/** Builds the main-audit event for a DataOps mutation (pure — unit-testable). */
export function buildDataopsAuditEvent(p: DataopsAuditParams): AuditEvent {
  const blocked = Boolean(p.blockedCode)
  return {
    actorId:   p.actorId,
    actorName: p.actorName,
    actorRole: p.actorRole,
    channel:   'API',
    ipAddress: p.ipAddress,
    eventType: blocked ? `DATAOPS.${p.op}.BLOCKED` : `DATAOPS.${p.op}`,
    resourceType: `${p.schema}.${p.table}`,
    resourceId: p.pk,
    oldValues: p.oldValues,
    newValues: p.newValues,
    metadata: {
      source: 'DATAOPS_CONSOLE',
      ...(p.blockedCode ? { blockedCode: p.blockedCode } : {}),
      ...(p.sqlText ? { sqlText: p.sqlText.slice(0, 2000) } : {}),
    },
    description: blocked
      ? `DataOps ${p.op} on ${p.schema}.${p.table} BLOCKED (${p.blockedCode})`
      : `DataOps ${p.op} on ${p.schema}.${p.table}`,
  }
}

/**
 * Mirrors a DataOps mutation (or blocked attempt) into the MAIN audit_log so the
 * primary audit trail is complete. Uses the global pool (no tx) — the raw SQL has
 * already committed by call time; an audit-mirror failure must not mask it.
 */
export async function mirrorDataopsAudit(p: DataopsAuditParams): Promise<void> {
  // Lazy import keeps the pure guard logic (and its unit tests) free of the
  // db/env import chain that lib/audit pulls in.
  const { writeAuditLog } = await import('@/lib/audit')
  await writeAuditLog(buildDataopsAuditEvent(p))
}

// ── internal SQL heuristics ───────────────────────────────────────────────────

function stripSqlNoise(sql: string): string {
  return sql
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

function detectWriteOp(stripped: string): WriteOp | null {
  if (/^\s*insert\b/i.test(stripped) || /\binsert\s+into\b/i.test(stripped)) return 'INSERT'
  if (/^\s*update\b/i.test(stripped) || /\bupdate\s+[\w".]+\s+set\b/i.test(stripped)) return 'UPDATE'
  if (/^\s*delete\b/i.test(stripped) || /\bdelete\s+from\b/i.test(stripped)) return 'DELETE'
  return null
}

/** Returns protected table names referenced anywhere in the (write) statement. */
function referencedProtectedTables(stripped: string): string[] {
  const lower = stripped.toLowerCase()
  const hits: string[] = []
  for (const t of PROTECTED_TABLES) {
    // word-boundary match, tolerate optional schema qualifier and quotes
    const re = new RegExp(`(^|[\\s."'(])${t}([\\s."')]|$)`, 'i')
    if (re.test(lower)) hits.push(t)
  }
  return hits
}

function columnReferenced(stripped: string, col: string): boolean {
  return new RegExp(`(^|[\\s."',(])${col}([\\s."',)=]|$)`, 'i').test(stripped.toLowerCase())
}
