/**
 * Foundation Stewardship P1-H4 — identity uniqueness (BR-ID-UNIQ-001).
 * Hash determinism/normalisation, enforcement gating, migration content,
 * and source wiring into createPerson / updatePerson.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const TEST_KEY = 'ab'.repeat(32) // 64 hex chars

beforeAll(() => { process.env.ENCRYPTION_KEY = TEST_KEY })
afterEach(() => { delete process.env.IDENTITY_UNIQUENESS_ENFORCEMENT })

describe('P1-H4 identity hashing', () => {
  it('is deterministic for the same identifier across formatting variants', async () => {
    const { emiratesIdHash } = await import('@/lib/identity-hash')
    const a = emiratesIdHash('784-1987-1234567-1')
    const b = emiratesIdHash('784 1987 1234567 1')
    const c = emiratesIdHash('784198712345671')
    expect(a).toBeTruthy()
    expect(a).toBe(b)
    expect(a).toBe(c)
  })

  it('passport hashing is case- and separator-insensitive', async () => {
    const { passportNumberHash } = await import('@/lib/identity-hash')
    expect(passportNumberHash('n1234567')).toBe(passportNumberHash('N-123 4567'))
  })

  it('different identifiers produce different hashes; null/blank produce null', async () => {
    const { emiratesIdHash, passportNumberHash } = await import('@/lib/identity-hash')
    expect(emiratesIdHash('784-1987-1234567-1')).not.toBe(emiratesIdHash('784-1987-1234567-2'))
    expect(emiratesIdHash(null)).toBeNull()
    expect(emiratesIdHash('---')).toBeNull()
    expect(passportNumberHash(undefined)).toBeNull()
  })

  it('hash output is a 64-char hex digest (HMAC-SHA256), never the identifier', async () => {
    const { emiratesIdHash } = await import('@/lib/identity-hash')
    const h = emiratesIdHash('784-1987-1234567-1')!
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('784')
  })

  it('hash-backed enforcement is OFF by default (pre-0065 compatibility)', async () => {
    const { isIdentityHashEnforcementEnabled } = await import('@/lib/identity-hash')
    expect(isIdentityHashEnforcementEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(isIdentityHashEnforcementEnabled({ IDENTITY_UNIQUENESS_ENFORCEMENT: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it('identityHashColumns writes nothing while enforcement is disabled', async () => {
    const { identityHashColumns } = await import('@/lib/identity-uniqueness')
    expect(identityHashColumns('784-1987-1234567-1', 'N1234567')).toEqual({})
    process.env.IDENTITY_UNIQUENESS_ENFORCEMENT = 'true'
    const cols = identityHashColumns('784-1987-1234567-1', 'N1234567')
    expect(cols.emiratesIdHash).toMatch(/^[0-9a-f]{64}$/)
    expect(cols.passportNumberHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('P1-H4 migration 0065 content', () => {
  const sql = readFileSync(resolve(__dirname, '../../drizzle/migrations/0065_identity_uniqueness.sql'), 'utf8')

  it('adds hash columns and three partial UNIQUE indexes', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS emirates_id_hash/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS passport_number_hash/)
    expect(sql).toMatch(/uq_persons_employee_code[\s\S]*lower\(employee_code\)/)
    expect(sql).toMatch(/uq_persons_emirates_id_hash[\s\S]*WHERE emirates_id_hash IS NOT NULL/)
    expect(sql).toMatch(/uq_persons_passport_number_hash[\s\S]*WHERE passport_number_hash IS NOT NULL/)
  })

  it('is additive only — no DROP/DELETE/UPDATE of person data', () => {
    expect(sql).not.toMatch(/\bDROP\b(?!.*INDEX IF EXISTS)/i)
    expect(sql).not.toMatch(/^\s*DELETE\b/im)
    expect(sql).not.toMatch(/^\s*UPDATE\b/im)
  })
})

describe('P1-H4 source wiring', () => {
  const actions = readFileSync(resolve(__dirname, '../../modules/core-hr/actions.ts'), 'utf8')
  const schema  = readFileSync(resolve(__dirname, '../../drizzle/schema/foundation.ts'), 'utf8')

  it('createPerson asserts identity uniqueness inside the insert transaction', () => {
    const insertIdx = actions.indexOf('.insert(persons)')
    // Tolerant of the `tx as unknown as DbOrTx` cast required by Drizzle's tx type.
    const assertIdx = actions.search(/assertPersonIdentityUnique\(tx[^,]*,\s*\{\s*employeeCode:/)
    expect(assertIdx).toBeGreaterThan(-1)
    expect(assertIdx).toBeLessThan(insertIdx)
  })

  it('updatePerson asserts identity uniqueness (excluding self) before the UPDATE', () => {
    expect(actions).toMatch(/assertPersonIdentityUnique\(tx[^,]*,\s*\{\s*excludePersonId:\s*id/)
  })

  it('persons schema declares the hash columns', () => {
    expect(schema).toMatch(/emiratesIdHash:\s*varchar\('emirates_id_hash'/)
    expect(schema).toMatch(/passportNumberHash:\s*varchar\('passport_number_hash'/)
  })
})
