import { describe, it, expect } from 'vitest'

/**
 * S6-Q2 / S6-Q3 — Unit tests for `lib/csv.ts`.
 *
 * Covers:
 *   • RFC 4180 quoting (commas, quotes, CR, LF)
 *   • Inner-quote doubling
 *   • Formula-injection guard (CWE-1236) — prefix `'` for cells starting
 *     with `=`, `+`, `-`, `@`, `\t`, `\r`
 *   • Null / undefined → empty cell
 *   • Numeric coercion
 *   • UTF-8 BOM + CRLF row terminator in `buildCsv`
 */
import { csvField, csvRow, buildCsv } from '@/lib/csv'

describe('csvField — RFC 4180 quoting', () => {
  it('returns plain string when no special chars', () => {
    expect(csvField('hello')).toBe('hello')
    expect(csvField('Sara Ahmed')).toBe('Sara Ahmed')
  })

  it('quotes when value contains a comma', () => {
    expect(csvField('Doe, John')).toBe('"Doe, John"')
  })

  it('quotes when value contains a double-quote and escapes by doubling', () => {
    expect(csvField('She said "hi"')).toBe('"She said ""hi"""')
  })

  it('quotes when value contains CR or LF (mid-string — no formula prefix)', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField('line1\rline2')).toBe('"line1\rline2"')
  })

  it('coerces null and undefined to empty string', () => {
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })

  it('coerces numbers via String()', () => {
    expect(csvField(0)).toBe('0')
    expect(csvField(22.5)).toBe('22.5')
    expect(csvField(-3)).toBe("'-3") // formula trigger — neutralised
  })
})

describe('csvField — formula-injection guard (S6-Q2 / CWE-1236)', () => {
  it('prefixes apostrophe when value starts with =', () => {
    expect(csvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)")
  })

  it('prefixes apostrophe when value starts with +', () => {
    expect(csvField('+1234')).toBe("'+1234")
  })

  it('prefixes apostrophe when value starts with - (could be negative number OR formula)', () => {
    expect(csvField('-3')).toBe("'-3")
    expect(csvField('-cmd|/c calc')).toBe("'-cmd|/c calc")
  })

  it('prefixes apostrophe when value starts with @', () => {
    // `@SUM(...)` then RFC-quotes the embedded comma → "'@SUM(1,2)"
    expect(csvField('@SUM(1,2)')).toBe('"\'@SUM(1,2)"')
  })

  it('prefixes apostrophe when value starts with tab', () => {
    expect(csvField('\tinjected')).toBe("'\tinjected")
  })

  it('does NOT prefix when formula trigger appears mid-string', () => {
    // `=` is neither a quote-trigger nor at the start, so the cell stays raw.
    expect(csvField('Bob = legend')).toBe('Bob = legend')
  })

  it('combines formula prefix + RFC quoting when both apply', () => {
    expect(csvField('=cmd,evil')).toBe("\"'=cmd,evil\"")
  })
})

describe('csvRow — comma-joins cells with per-cell escape', () => {
  it('joins simple cells with commas', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('escapes each cell independently', () => {
    expect(csvRow(['a,b', 'c"d', '=evil'])).toBe('"a,b",' + '"c""d",' + "'=evil")
  })

  it('handles mixed types — numbers, null, strings', () => {
    expect(csvRow(['Sara', 22.5, null, 'pending'])).toBe('Sara,22.5,,pending')
  })
})

describe('buildCsv — header + body assembly', () => {
  it('prepends UTF-8 BOM so Excel renders Arabic correctly', () => {
    const out = buildCsv(['name'], [['Sara']])
    expect(out.charCodeAt(0)).toBe(0xFEFF) // BOM
  })

  it('uses CRLF row terminator (RFC 4180 §2.1)', () => {
    const out = buildCsv(['a', 'b'], [['1', '2']])
    // Strip BOM, body should have one CRLF between lines + trailing CRLF.
    const body = out.slice(1)
    expect(body).toBe('a,b\r\n1,2\r\n')
  })

  it('preserves Arabic characters end-to-end', () => {
    const out = buildCsv(['name_ar'], [['سارة أحمد']])
    expect(out).toContain('سارة أحمد')
  })

  it('neutralises a malicious Arabic-language injection cell', () => {
    const out = buildCsv(['notes'], [['=cmd|"/c calc"']])
    expect(out).toContain("'=cmd")
  })
})
