/**
 * EPRC-01 B1 — DataOps write-guard (P3-D3 closure) unit tests.
 *
 * Verifies the additive safeguards that prevent the DataOps console from:
 *  - writing plaintext into encrypted / keyed-hash PII columns,
 *  - hard-deleting protected / effective-dated HR rows,
 *  - editing effective-dated timeline columns,
 * and that every mutation is mirrored into the MAIN audit trail.
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateStructuredWrite,
  evaluateRawSqlWrite,
  buildDataopsAuditEvent,
  PROTECTED_PII_COLUMNS,
  PROTECTED_TABLES,
  STRUCTURED_WRITE_ALLOWLIST,
} from '@/lib/dataops/write-guard'

describe('evaluateStructuredWrite — PII column protection', () => {
  it('blocks UPDATE that writes a plaintext PII column (emirates_id)', () => {
    const v = evaluateStructuredWrite('persons', ['full_name', 'emirates_id'], 'UPDATE')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PII_COLUMN_BLOCKED')
  })

  it('blocks INSERT that writes iban', () => {
    const v = evaluateStructuredWrite('person_bank_details', ['iban', 'bank_name'], 'INSERT')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PII_COLUMN_BLOCKED')
  })

  it('blocks writing the keyed-hash uniqueness columns', () => {
    expect(evaluateStructuredWrite('persons', ['emirates_id_hash'], 'UPDATE').allowed).toBe(false)
    expect(evaluateStructuredWrite('persons', ['passport_number_hash'], 'INSERT').allowed).toBe(false)
  })

  it('is case-insensitive on column names', () => {
    expect(evaluateStructuredWrite('persons', ['EMIRATES_ID'], 'UPDATE').allowed).toBe(false)
  })

  it('allows a non-PII column write on a non-protected table', () => {
    const v = evaluateStructuredWrite('lookup_values', ['label_en', 'label_ar'], 'UPDATE')
    expect(v.allowed).toBe(true)
  })
})

describe('evaluateStructuredWrite — hard delete protection', () => {
  it('blocks DELETE on persons (identity master)', () => {
    const v = evaluateStructuredWrite('persons', [], 'DELETE')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PROTECTED_TABLE_DELETE_BLOCKED')
  })

  it('blocks DELETE on worker_assignments and contracts (effective-dated)', () => {
    expect(evaluateStructuredWrite('worker_assignments', [], 'DELETE').allowed).toBe(false)
    expect(evaluateStructuredWrite('contracts', [], 'DELETE').allowed).toBe(false)
  })

  it('blocks DELETE on the immutable audit_log', () => {
    expect(evaluateStructuredWrite('audit_log', [], 'DELETE').allowed).toBe(false)
  })

  it('allows DELETE on a non-protected reference table', () => {
    expect(evaluateStructuredWrite('saved_queries', [], 'DELETE').allowed).toBe(true)
  })
})

describe('evaluateStructuredWrite — effective-dated timeline protection', () => {
  it('blocks editing effective_end_date on an effective-dated table', () => {
    const v = evaluateStructuredWrite('worker_assignments', ['effective_end_date'], 'UPDATE')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('TEMPORAL_COLUMN_BLOCKED')
  })

  it('allows a temporal-named column on an allowlisted NON-protected table (no false positive)', () => {
    const v = evaluateStructuredWrite('lookup_values', ['effective_start_date'], 'UPDATE')
    expect(v.allowed).toBe(true)
  })
})

describe('evaluateStructuredWrite — protected table and allowlist posture', () => {
  it('blocks non-PII UPDATE on a protected CoreHR table', () => {
    const v = evaluateStructuredWrite('persons', ['full_name_en'], 'UPDATE')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PROTECTED_TABLE_RAW_WRITE_BLOCKED')
  })

  it('blocks INSERT on a protected CoreHR table even when columns are non-PII', () => {
    const v = evaluateStructuredWrite('contracts', ['contract_number', 'status'], 'INSERT')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PROTECTED_TABLE_RAW_WRITE_BLOCKED')
  })

  it('blocks structured writes to non-allowlisted tables by default', () => {
    const v = evaluateStructuredWrite('public_holidays', ['holiday_name_en'], 'UPDATE')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('STRUCTURED_TABLE_NOT_ALLOWLISTED')
  })

  // PPCDA-01 J7: payroll source-of-truth inputs must be protected like other
  // CoreHR masters — raw writes / hard deletes blocked, service layer mandated.
  it.each(['salary_elements', 'grade_salary_ranges', 'payroll_definitions'])(
    'blocks raw UPDATE on payroll source-of-truth table %s',
    table => {
      const v = evaluateStructuredWrite(table, ['amount'], 'UPDATE')
      expect(v.allowed).toBe(false)
      expect(v.code).toBe('PROTECTED_TABLE_RAW_WRITE_BLOCKED')
    },
  )

  it.each(['salary_elements', 'grade_salary_ranges', 'payroll_definitions'])(
    'blocks DELETE on payroll source-of-truth table %s',
    table => {
      const v = evaluateStructuredWrite(table, [], 'DELETE')
      expect(v.allowed).toBe(false)
      expect(v.code).toBe('PROTECTED_TABLE_DELETE_BLOCKED')
    },
  )
})

describe('evaluateRawSqlWrite — raw SQL guard', () => {
  it('does not interfere with SELECT (reads)', () => {
    expect(evaluateRawSqlWrite('SELECT * FROM persons WHERE id = 1').allowed).toBe(true)
  })

  it('blocks raw DELETE FROM a protected table', () => {
    const v = evaluateRawSqlWrite('DELETE FROM persons WHERE id = \'x\'')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PROTECTED_TABLE_DELETE_BLOCKED')
  })

  it('blocks raw UPDATE on a protected table', () => {
    const v = evaluateRawSqlWrite('UPDATE worker_assignments SET position_id = 2 WHERE id = 1')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PROTECTED_TABLE_RAW_WRITE_BLOCKED')
  })

  it('blocks raw UPDATE on salary_elements (payroll source-of-truth — PPCDA-01 J7)', () => {
    const v = evaluateRawSqlWrite("UPDATE salary_elements SET amount = '99999' WHERE id = '1'")
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PROTECTED_TABLE_RAW_WRITE_BLOCKED')
  })

  it('blocks raw write referencing a PII column even on an unknown table', () => {
    const v = evaluateRawSqlWrite('UPDATE some_table SET iban = \'AE12\' WHERE id = 1')
    expect(v.allowed).toBe(false)
    expect(v.code).toBe('PII_COLUMN_BLOCKED')
  })

  it('does not match keyword inside a string literal (no false positive)', () => {
    // "persons" appears only inside a string literal value, not as a table.
    const v = evaluateRawSqlWrite("UPDATE lookup_values SET label_en = 'about persons page' WHERE id = 1")
    expect(v.allowed).toBe(true)
  })

  it('allows a benign write to a non-protected table', () => {
    expect(evaluateRawSqlWrite('UPDATE lookup_values SET sort_order = 3 WHERE id = 1').allowed).toBe(true)
  })
})

describe('buildDataopsAuditEvent — main-audit mirror', () => {
  it('builds an applied-mutation event with DATAOPS event type and source marker', () => {
    const ev = buildDataopsAuditEvent({
      actorId: 'u1', actorName: 'Super Admin', actorRole: 'SUPER_ADMIN',
      op: 'UPDATE', schema: 'public', table: 'lookup_values', pk: '42',
      newValues: { label_en: 'x' },
    })
    expect(ev.eventType).toBe('DATAOPS.UPDATE')
    expect(ev.resourceType).toBe('public.lookup_values')
    expect(ev.resourceId).toBe('42')
    expect(ev.channel).toBe('API')
    expect((ev.metadata as Record<string, unknown>).source).toBe('DATAOPS_CONSOLE')
  })

  it('builds a BLOCKED event carrying the block code', () => {
    const ev = buildDataopsAuditEvent({
      actorId: 'u1', actorName: 'Super Admin', actorRole: 'SUPER_ADMIN',
      op: 'DELETE', schema: 'public', table: 'persons', pk: '7',
      blockedCode: 'PROTECTED_TABLE_DELETE_BLOCKED',
    })
    expect(ev.eventType).toBe('DATAOPS.DELETE.BLOCKED')
    expect((ev.metadata as Record<string, unknown>).blockedCode).toBe('PROTECTED_TABLE_DELETE_BLOCKED')
  })
})

describe('guard config sanity', () => {
  it('protects the core PII columns', () => {
    for (const c of ['emirates_id', 'passport_number', 'iban']) {
      expect(PROTECTED_PII_COLUMNS.has(c)).toBe(true)
    }
  })
  it('protects the core effective-dated / identity tables', () => {
    for (const t of ['persons', 'worker_assignments', 'contracts', 'audit_log']) {
      expect(PROTECTED_TABLES.has(t)).toBe(true)
    }
  })
  it('keeps the structured write allowlist intentionally small', () => {
    expect(STRUCTURED_WRITE_ALLOWLIST.has('lookup_values')).toBe(true)
    expect(STRUCTURED_WRITE_ALLOWLIST.has('saved_queries')).toBe(true)
    expect(STRUCTURED_WRITE_ALLOWLIST.has('persons')).toBe(false)
  })
})
