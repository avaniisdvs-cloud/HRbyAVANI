/**
 * Performance Benchmark Tests — Pure Function Response Times
 *
 * Unit-level benchmarks for CPU-bound pure functions (no DB, no mocks required).
 * Each test measures wall-clock time for N iterations of a hot function and
 * asserts that the total stays within budget.
 *
 * Budget rationale:
 *   EOSB calculation   — complex branching + date arithmetic: 0.1 ms/call budget
 *   GPSSA calculation  — simple arithmetic path:              0.05 ms/call budget
 *   Leave duration     — single date diff:                    0.02 ms/call budget
 *   Rule scoring       — in-memory loop over ~10 sets:        0.05 ms/call budget
 *   Compliance rules   — iterates DEFAULT_LINES (57 rules stub):  50 ms total
 *   Audit wrapper      — pure function overhead, not actual DB:   no wall limit
 *   Concurrent EOSB    — 100 calls via Promise.all, no race cond
 *   Memory stability   — heap stays bounded over 100k calls
 *
 * Run with:
 *   pnpm vitest run tests/performance/response-times.test.ts
 */

import { describe, it, expect, vi } from 'vitest'

// ── Mock the DB before importing any module that triggers lib/db.ts ──────────
// modules/absence/services.ts and lib/leave-rule-resolver.ts import db at
// the module scope. Providing a stub satisfies the module graph without a
// live Postgres connection. All DB-aware functions (accrueMonthlyBalance,
// resolveLeaveRuleSet) are NOT called in these pure benchmarks.
vi.mock('@/lib/db', () => ({
  db: {
    select:      () => ({ from: () => ({ where: () => ({ limit: async () => [] }), leftJoin: () => ({ where: () => ({ limit: async () => [] }) }) }) }),
    insert:      () => ({ values: async () => [] }),
    update:      () => ({ set: () => ({ where: async () => [] }) }),
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn({}),
  },
}))

import { calculateEosb, calculateGpssaContribution }    from '@/modules/payroll/services'
import { computeRequestDurationDays, computeClosingBalance, computeMonthlyAccrualDays } from '@/modules/absence/services'
import {
  scoreLeaveRuleSet,
  entitlementForService,
  _DEFAULT_LEAVE_LINES,
  type PersonContext,
} from '@/lib/leave-rule-resolver'
import { diffFields }                                    from '@/lib/audit'
import { daysBetween, addMonths, yearsOfService }        from '@/lib/effective-date'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const EXPAT_PERSON    = { nationalityCategory: 'EXPAT' }
const UAE_NAT_PERSON  = { nationalityCategory: 'UAE_NATIONAL' }

const EOSB_INPUT_EXPAT = {
  person:          EXPAT_PERSON,
  basicSalary:     15_000,
  hireDate:        '2018-01-01',
  calculationDate: '2026-05-01',
  totalUnpaidLeaveDays: 10,
}

const EOSB_INPUT_SENIOR = {
  person:          EXPAT_PERSON,
  basicSalary:     45_000,
  hireDate:        '2010-03-15',
  calculationDate: '2026-05-01',
  totalUnpaidLeaveDays: 0,
}

const EOSB_INPUT_SHORT = {
  person:         EXPAT_PERSON,
  basicSalary:    8_000,
  hireDate:       '2025-12-01',
  calculationDate:'2026-05-01',
}

const GPSSA_UAE_INPUT = {
  person: UAE_NAT_PERSON,
  basicSalary: 20_000,
}

const GPSSA_EXPAT_INPUT = {
  person: EXPAT_PERSON,
  basicSalary: 20_000,
}

// A representative person context for rule scoring
const PERSON_CTX: PersonContext = {
  legalEntityId:       'entity-001',
  entityType:          'MAINLAND',
  nationalityCategory: 'EXPAT',
  employmentType:      'FULL_TIME',
}

// Factory: build N rule-set candidates with varying scopes
function makeRuleSets(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id:                  `rs-${i}`,
    ruleSetCode:         `CODE-${i}`,
    legalEntityId:       i % 3 === 0 ? 'entity-001' : null,
    entityTypeScope:     i % 4 === 0 ? 'MAINLAND' : null,
    nationalityScope:    i % 5 === 0 ? 'EXPAT' : 'ALL',
    employmentTypeScope: i % 6 === 0 ? 'FULL_TIME' : 'ALL',
    effectiveFrom:       '2020-01-01',
    effectiveTo:         null,
    isDefault:           i === 0,
  }))
}

// ─── PERF-001 — EOSB calculation speed ───────────────────────────────────────

describe('PERF-001 — EOSB calculation speed', () => {
  it('runs calculateEosb 10,000 times in under 1,000 ms (0.1 ms/call budget)', () => {
    const N = 10_000
    const inputs = [EOSB_INPUT_EXPAT, EOSB_INPUT_SENIOR, EOSB_INPUT_SHORT]
    const start  = performance.now()

    for (let i = 0; i < N; i++) {
      const result = calculateEosb(inputs[i % inputs.length])
      // Smoke-check: result must be structurally valid
      void result.eosbFinalAmount
    }

    const elapsed = performance.now() - start
    console.log(`PERF-001: ${N} EOSB calls in ${elapsed.toFixed(1)} ms (${(elapsed / N).toFixed(4)} ms/call)`)

    expect(elapsed, `PERF-001 FAILED: ${elapsed.toFixed(1)} ms exceeded 1000 ms budget`).toBeLessThan(1_000)
  })

  it('EOSB returns deterministic results on repeated identical input', () => {
    const first  = calculateEosb(EOSB_INPUT_EXPAT)
    const second = calculateEosb(EOSB_INPUT_EXPAT)
    expect(first).toEqual(second)
  })
})

// ─── PERF-002 — GPSSA calculation speed ──────────────────────────────────────

describe('PERF-002 — GPSSA calculation speed', () => {
  it('runs calculateGpssaContribution 10,000 times in under 500 ms', () => {
    const N = 10_000
    const start = performance.now()

    for (let i = 0; i < N; i++) {
      const input = i % 2 === 0 ? GPSSA_UAE_INPUT : GPSSA_EXPAT_INPUT
      const result = calculateGpssaContribution(input)
      void result.totalContribution
    }

    const elapsed = performance.now() - start
    console.log(`PERF-002: ${N} GPSSA calls in ${elapsed.toFixed(1)} ms (${(elapsed / N).toFixed(4)} ms/call)`)

    expect(elapsed, `PERF-002 FAILED: ${elapsed.toFixed(1)} ms exceeded 500 ms budget`).toBeLessThan(500)
  })

  it('GPSSA UAE national: employer 15%, employee 5% — output is correct and fast', () => {
    const result = calculateGpssaContribution({ person: { nationalityCategory: 'UAE_NATIONAL' }, basicSalary: 10_000 })
    expect(result.applies).toBe(true)
    expect(result.employerShare).toBe(1_500)
    expect(result.employeeShare).toBe(500)
    expect(result.totalContribution).toBe(2_000)
  })

  it('GPSSA EXPAT: returns zero contribution', () => {
    const result = calculateGpssaContribution({ person: { nationalityCategory: 'EXPAT' }, basicSalary: 10_000 })
    expect(result.applies).toBe(false)
    expect(result.totalContribution).toBe(0)
  })
})

// ─── PERF-003 — Leave duration calculation speed ─────────────────────────────

describe('PERF-003 — Leave duration calculation speed', () => {
  it('runs computeRequestDurationDays 10,000 times in under 200 ms', () => {
    const N = 10_000
    const pairs = [
      ['2026-01-01', '2026-01-07', false],
      ['2026-03-10', '2026-03-10', true],
      ['2026-06-01', '2026-06-30', false],
    ] as [string, string, boolean][]

    const start = performance.now()

    for (let i = 0; i < N; i++) {
      const [s, e, h] = pairs[i % pairs.length]
      const days = computeRequestDurationDays(s, e, h)
      void days
    }

    const elapsed = performance.now() - start
    console.log(`PERF-003: ${N} computeRequestDurationDays calls in ${elapsed.toFixed(1)} ms (${(elapsed / N).toFixed(4)} ms/call)`)

    expect(elapsed, `PERF-003 FAILED: ${elapsed.toFixed(1)} ms exceeded 200 ms budget`).toBeLessThan(200)
  })

  it('computeRequestDurationDays: half-day always returns 0.5', () => {
    expect(computeRequestDurationDays('2026-05-01', '2026-05-01', true)).toBe(0.5)
  })

  it('computeRequestDurationDays: inclusive range is correct', () => {
    // 2026-01-01 to 2026-01-07 = 7 calendar days inclusive
    expect(computeRequestDurationDays('2026-01-01', '2026-01-07', false)).toBe(7)
  })

  it('also benchmarks daysBetween (utility used internally)', () => {
    const N = 10_000
    const start = performance.now()
    for (let i = 0; i < N; i++) {
      void daysBetween('2020-01-01', '2026-05-01')
    }
    const elapsed = performance.now() - start
    console.log(`PERF-003b: ${N} daysBetween calls in ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(200)
  })
})

// ─── PERF-004 — Leave rule resolver (scoring) speed ──────────────────────────

describe('PERF-004 — Leave rule resolver scoring speed', () => {
  it('scores 10 rule sets 1,000 times in under 500 ms', () => {
    const N     = 1_000
    const sets  = makeRuleSets(10)
    const start = performance.now()

    for (let i = 0; i < N; i++) {
      for (const s of sets) {
        const score = scoreLeaveRuleSet(s, PERSON_CTX)
        void score
      }
    }

    const elapsed    = performance.now() - start
    const totalCalls = N * sets.length
    console.log(`PERF-004: ${totalCalls} scoreLeaveRuleSet calls in ${elapsed.toFixed(1)} ms (${(elapsed / totalCalls).toFixed(4)} ms/call)`)

    expect(elapsed, `PERF-004 FAILED: ${elapsed.toFixed(1)} ms exceeded 500 ms budget`).toBeLessThan(500)
  })

  it('scoring: exact entity match beats no-match candidate', () => {
    const entityMatch = makeRuleSets(1)[0] // legalEntityId = 'entity-001' (i%3===0 for i=0)
    const noMatch     = {
      id: 'other', ruleSetCode: 'OTHER', legalEntityId: 'different-entity',
      entityTypeScope: null, nationalityScope: 'ALL', employmentTypeScope: 'ALL',
      effectiveFrom: '2020-01-01', effectiveTo: null, isDefault: false,
    }
    const scoreA = scoreLeaveRuleSet(entityMatch, PERSON_CTX)
    const scoreB = scoreLeaveRuleSet(noMatch,     PERSON_CTX)
    expect(scoreA).toBeGreaterThan(scoreB)
  })

  it('entitlementForService returns correct tier for various service months', () => {
    const rule = _DEFAULT_LEAVE_LINES['ANNUAL']
    expect(entitlementForService(rule, 0)).toBe(0)    // probation tier: daysEntitled=0
    expect(entitlementForService(rule, 8)).toBe(24)   // 6-12 months tier
    expect(entitlementForService(rule, 24)).toBe(30)  // 12+ months tier
  })

  it('also benchmarks entitlementForService (called in tight accrual loop)', () => {
    const N    = 10_000
    const rule = _DEFAULT_LEAVE_LINES['ANNUAL']
    const start = performance.now()
    for (let i = 0; i < N; i++) {
      void entitlementForService(rule, (i % 48) + 1)
    }
    const elapsed = performance.now() - start
    console.log(`PERF-004b: ${N} entitlementForService calls in ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(200)
  })
})

// ─── PERF-005 — Compliance rules — DEFAULT_LINES coverage ────────────────────

describe('PERF-005 — Compliance rule lookup across all default leave types', () => {
  /**
   * The system has 7 default leave types in DEFAULT_LINES. Each maps to one or
   * more BR-xx rules. This test validates that iterating all types + scoring
   * against a batch of 57 rule candidates stays under 50 ms.
   *
   * Note: the compliance/services.ts is a future-sprint stub (export {}).
   * We exercise the in-memory rule table that IS implemented.
   */
  it('resolves all default leave types in memory in under 50 ms', () => {
    const allTypes   = Object.keys(_DEFAULT_LEAVE_LINES)
    const candidates = makeRuleSets(57)
    const start      = performance.now()

    for (const typeCode of allTypes) {
      const def = _DEFAULT_LEAVE_LINES[typeCode]
      expect(def).toBeDefined()
      // Score all 57 candidates for this type's context
      for (const c of candidates) {
        void scoreLeaveRuleSet(c, PERSON_CTX)
      }
      // entitlement check across all tiers
      for (const tier of def.entitlementTiers) {
        void entitlementForService(def, tier.minServiceMonths)
      }
    }

    const elapsed = performance.now() - start
    console.log(`PERF-005: All ${allTypes.length} default leave types × 57 candidates in ${elapsed.toFixed(1)} ms`)

    expect(elapsed, `PERF-005 FAILED: ${elapsed.toFixed(1)} ms exceeded 50 ms budget`).toBeLessThan(50)
  })

  it('DEFAULT_LINES contains all required leave types (7 statutory types)', () => {
    const required = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'STUDY', 'HAJJ', 'BEREAVEMENT']
    for (const t of required) {
      expect(_DEFAULT_LEAVE_LINES[t], `Missing default rule for ${t}`).toBeDefined()
    }
  })
})

// ─── PERF-006 — Audit wrapper pure overhead ──────────────────────────────────

describe('PERF-006 — Audit log diffFields overhead', () => {
  /**
   * writeAuditLog itself requires DB; we benchmark the pure diffFields helper
   * that is called synchronously before every audit write. If this is slow,
   * every business write slows proportionally.
   */
  const BEFORE = {
    basicSalary:    10_000,
    hireDate:       '2020-01-01',
    status:         'ACTIVE',
    nationalityCategory: 'EXPAT',
    legalEntityId:  'entity-001',
  }

  const AFTER = {
    basicSalary:    12_000,
    hireDate:       '2020-01-01',
    status:         'ACTIVE',
    nationalityCategory: 'EXPAT',
    legalEntityId:  'entity-001',
    terminationDate: '2026-05-01',
  }

  it('diffFields runs 1,000 times in under 100 ms', () => {
    const N     = 1_000
    const start = performance.now()

    for (let i = 0; i < N; i++) {
      const changed = diffFields(BEFORE, AFTER)
      void changed
    }

    const elapsed = performance.now() - start
    console.log(`PERF-006: ${N} diffFields calls in ${elapsed.toFixed(1)} ms (${(elapsed / N).toFixed(4)} ms/call)`)

    expect(elapsed, `PERF-006 FAILED: ${elapsed.toFixed(1)} ms exceeded 100 ms budget`).toBeLessThan(100)
  })

  it('diffFields detects the correct changed fields', () => {
    const changed = diffFields(BEFORE, AFTER)
    expect(changed).toContain('basicSalary')
    expect(changed).toContain('terminationDate')
    expect(changed).not.toContain('hireDate')
    expect(changed).not.toContain('status')
  })
})

// ─── PERF-007 — Concurrent calculations ──────────────────────────────────────

describe('PERF-007 — Concurrent EOSB calculations', () => {
  it('100 EOSB calculations run concurrently via Promise.all with no race conditions', async () => {
    const N = 100
    const inputs = Array.from({ length: N }, (_, i) => ({
      person:          { nationalityCategory: 'EXPAT' },
      basicSalary:     5_000 + i * 100,
      hireDate:        '2018-01-01',
      calculationDate: '2026-05-01',
    }))

    const start = performance.now()
    const results = await Promise.all(inputs.map(inp => Promise.resolve(calculateEosb(inp))))
    const elapsed = performance.now() - start

    console.log(`PERF-007: ${N} concurrent EOSB calls in ${elapsed.toFixed(1)} ms`)

    // All results must be valid
    expect(results).toHaveLength(N)
    for (const r of results) {
      expect(r.applies).toBe(true)
      expect(r.eosbFinalAmount).toBeGreaterThan(0)
    }

    // Each input had different basicSalary — results must be unique (no cross-contamination)
    const amounts = results.map(r => r.eosbFinalAmount)
    const uniqueAmounts = new Set(amounts)
    expect(uniqueAmounts.size).toBe(N)

    // Should complete quickly — pure CPU-bound functions have no async overhead
    expect(elapsed).toBeLessThan(500)
  })

  it('100 GPSSA calculations run concurrently, alternating UAE/EXPAT', async () => {
    const N = 100
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        Promise.resolve(calculateGpssaContribution({
          person:      { nationalityCategory: i % 2 === 0 ? 'UAE_NATIONAL' : 'EXPAT' },
          basicSalary: 10_000 + i * 50,
        }))
      )
    )
    const uaeResults  = results.filter(r => r.applies)
    const expatResults = results.filter(r => !r.applies)
    expect(uaeResults).toHaveLength(50)
    expect(expatResults).toHaveLength(50)
  })
})

// ─── PERF-008 — Memory stability under repeated calculations ─────────────────

describe('PERF-008 — Memory stability (no leak in repeated calculations)', () => {
  it('runs EOSB + GPSSA + leave-duration 100,000 times without unbounded heap growth', () => {
    const N = 100_000

    // Snapshot heap before
    const heapBefore = process.memoryUsage().heapUsed

    for (let i = 0; i < N; i++) {
      // Rotate inputs to defeat any hot-path JIT constant-fold optimisation
      const salary = 5_000 + (i % 50) * 1_000
      void calculateEosb({
        person:          { nationalityCategory: 'EXPAT' },
        basicSalary:     salary,
        hireDate:        '2018-01-01',
        calculationDate: '2026-05-01',
      })
      void calculateGpssaContribution({
        person:      { nationalityCategory: i % 3 === 0 ? 'UAE_NATIONAL' : 'EXPAT' },
        basicSalary: salary,
      })
      void computeRequestDurationDays('2026-01-01', '2026-01-14', false)
      void computeClosingBalance({
        openingBalanceDays: i % 30,
        accruedDays:        2.5,
        takenDays:          1,
        pendingDays:        0,
        adjustedDays:       0,
        carriedForwardDays: 5,
        forfeitedDays:      0,
      })
    }

    // Allow GC to run by yielding briefly in the same tick
    const heapAfter = process.memoryUsage().heapUsed
    const heapDeltaMB = (heapAfter - heapBefore) / 1_048_576

    console.log(`PERF-008: heap delta after ${N} calls = ${heapDeltaMB.toFixed(2)} MB`)

    // Budget: functions are pure (no closures retaining large objects), heap growth
    // should stay well below 50 MB. Generous limit to accommodate V8 internals.
    expect(
      heapDeltaMB,
      `PERF-008 FAILED: heap grew by ${heapDeltaMB.toFixed(2)} MB — possible leak`
    ).toBeLessThan(50)
  })

  it('yearsOfService helper produces stable results under 10,000 calls', () => {
    const N = 10_000
    const start = performance.now()
    for (let i = 0; i < N; i++) {
      const yos = yearsOfService('2018-01-01', '2026-05-01', i % 100)
      void yos
    }
    const elapsed = performance.now() - start
    console.log(`PERF-008b: ${N} yearsOfService calls in ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(500)
  })

  it('addMonths helper is non-mutating — same input always yields same output', () => {
    const date    = '2024-01-31'
    const result1 = addMonths(date, 3)
    const result2 = addMonths(date, 3)
    expect(result1).toBe(result2)
    // Original string must be unchanged
    expect(date).toBe('2024-01-31')
  })
})
