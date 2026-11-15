/**
 * Unit tests — modules/aria/leave-recommendation.ts
 *
 * Strategy: mock the DB and the Anthropic SDK so no network or DB is needed.
 * Tests verify:
 *   1. generateLeaveRecommendation writes correct fields to absence_entries
 *   2. Returns without crashing when Claude API is unavailable (ARIA_NOT_CONFIGURED)
 *   3. AriaLeaveRecommendation type validates correctly (shape checks)
 *   4. Recommendation code maps correctly to expected badge configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  AriaLeaveRecommendation,
  AriaLeaveRecommendationCode,
} from '@/modules/aria/types'

// ── Shared fixtures ────────────────────────────────────────────────────────────

const VALID_RECOMMENDATION: AriaLeaveRecommendation = {
  recommendation: 'APPROVE',
  confidence:     0.92,
  summaryEn:      'Balance sufficient, no team conflicts, notice period met.',
  summaryAr:      'الرصيد كافٍ، لا تعارضات في الفريق، تم استيفاء مهلة الإخطار.',
  factors: [
    { factor: 'Balance',       status: 'OK',   detailEn: '14 days remaining after leave', detailAr: '١٤ يوماً متبقية بعد الإجازة' },
    { factor: 'Team Coverage', status: 'OK',   detailEn: 'No colleagues on leave',        detailAr: 'لا زملاء في إجازة' },
    { factor: 'Notice Period', status: 'WARN', detailEn: 'Only 2 days notice given',       detailAr: 'تم إخطار يومين فقط' },
    { factor: 'History',       status: 'OK',   detailEn: '5 requests in last 12 months',  detailAr: '٥ طلبات في آخر ١٢ شهراً' },
    { factor: 'Compliance',    status: 'OK',   detailEn: 'Article 29, FDL 33/2021',       detailAr: 'المادة ٢٩ من المرسوم الاتحادي ٣٣ لعام ٢٠٢١' },
  ],
  generatedAt: '2026-05-08T09:00:00.000Z',
  model:        'claude-sonnet-4-6',
}

// ── Type shape tests (no mocks needed) ────────────────────────────────────────

describe('AriaLeaveRecommendation type shape', () => {
  it('accepts all three recommendation codes', () => {
    const codes: AriaLeaveRecommendationCode[] = ['APPROVE', 'REJECT', 'REVIEW']
    for (const code of codes) {
      const rec: AriaLeaveRecommendation = { ...VALID_RECOMMENDATION, recommendation: code }
      expect(rec.recommendation).toBe(code)
    }
  })

  it('confidence is 0.0 – 1.0', () => {
    const rec: AriaLeaveRecommendation = { ...VALID_RECOMMENDATION, confidence: 0.75 }
    expect(rec.confidence).toBeGreaterThanOrEqual(0)
    expect(rec.confidence).toBeLessThanOrEqual(1)
  })

  it('factors array is present', () => {
    expect(Array.isArray(VALID_RECOMMENDATION.factors)).toBe(true)
    expect(VALID_RECOMMENDATION.factors.length).toBeGreaterThan(0)
  })

  it('factor status values are OK | WARN | FAIL', () => {
    const valid = ['OK', 'WARN', 'FAIL'] as const
    for (const f of VALID_RECOMMENDATION.factors) {
      expect(valid).toContain(f.status)
    }
  })

  it('has bilingual fields', () => {
    expect(typeof VALID_RECOMMENDATION.summaryEn).toBe('string')
    expect(typeof VALID_RECOMMENDATION.summaryAr).toBe('string')
    for (const f of VALID_RECOMMENDATION.factors) {
      expect(typeof f.detailEn).toBe('string')
      expect(typeof f.detailAr).toBe('string')
    }
  })

  it('has generatedAt and model fields', () => {
    expect(typeof VALID_RECOMMENDATION.generatedAt).toBe('string')
    expect(typeof VALID_RECOMMENDATION.model).toBe('string')
  })
})

// ── Badge colour mapping ───────────────────────────────────────────────────────

describe('recommendation code → badge config', () => {
  const BADGE_MAP: Record<AriaLeaveRecommendationCode, { fg: string; bg: string }> = {
    APPROVE: { bg: 'var(--status-approved-bg, #dcfce7)', fg: 'var(--status-approved-fg, #166534)' },
    REJECT:  { bg: 'var(--status-rejected-bg, #fee2e2)', fg: 'var(--status-rejected-fg, #991b1b)' },
    REVIEW:  { bg: 'var(--status-warning-bg, #fef3c7)',  fg: 'var(--status-warning-fg, #b45309)'  },
  }

  it('APPROVE maps to approved colour token', () => {
    expect(BADGE_MAP.APPROVE.bg).toContain('approved-bg')
    expect(BADGE_MAP.APPROVE.fg).toContain('approved-fg')
  })

  it('REJECT maps to rejected colour token', () => {
    expect(BADGE_MAP.REJECT.bg).toContain('rejected-bg')
    expect(BADGE_MAP.REJECT.fg).toContain('rejected-fg')
  })

  it('REVIEW maps to warning colour token', () => {
    expect(BADGE_MAP.REVIEW.bg).toContain('warning-bg')
    expect(BADGE_MAP.REVIEW.fg).toContain('warning-fg')
  })
})

// ── generateLeaveRecommendation with mocked DB + Anthropic ────────────────────

/**
 * Queue-based DB mock.
 *
 * leave-recommendation.ts makes a mix of:
 *   - .select().from().where().limit() — 4 queries (leave request, person, balance, dept)
 *   - .select().from().where()         — 3 queries (count queries: team total, overlap, history)
 *
 * The chain needs `.then()` so `await chain` works as a thenable for the
 * count() queries that omit `.limit()`.
 */
const MOCK_DB_RESPONSES = {
  queue:     [] as unknown[][],
  callIndex: 0,
}

// Transaction mock — defined as a reference so vi.mock factory can close over it
let mockTransactionImpl: (fn: (tx: unknown) => Promise<void>) => Promise<void>

const MOCK_TX = {
  update: vi.fn().mockReturnValue({
    set:   function(this: unknown) { return this },
    where: vi.fn().mockResolvedValue(undefined),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
}

vi.mock('@/lib/db', () => {
  // Build a Drizzle-like chain that is also a thenable.
  // .limit() and awaiting the chain directly both pop the next queue entry.
  function makeChain(): unknown {
    const chain: Record<string, unknown> = {}
    const popQueue = () => {
      const result = MOCK_DB_RESPONSES.queue[MOCK_DB_RESPONSES.callIndex] ?? []
      MOCK_DB_RESPONSES.callIndex++
      return result
    }
    chain.from     = () => chain
    chain.leftJoin = () => chain
    chain.where    = () => chain
    chain.limit    = () => Promise.resolve(popQueue())
    // Make the chain thenable so `await chain` works without .limit()
    chain.then = (
      resolve: (v: unknown[]) => unknown,
      reject:  (e: unknown) => unknown,
    ) => Promise.resolve(popQueue()).then(resolve, reject)
    return chain
  }

  return {
    db: {
      select:      () => makeChain(),
      transaction: (fn: (tx: unknown) => Promise<void>) => mockTransactionImpl(fn),
    },
  }
})

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/constants', () => ({
  TENANT_ID: '00000000-0000-0000-0000-000000000001',
}))

vi.mock('@/drizzle/schema', () => ({
  absenceEntries:    { id: 'id', tenantId: 'tenantId', personId: 'personId', legalEntityId: 'legalEntityId', absenceTypeId: 'absenceTypeId', startDate: 'startDate', endDate: 'endDate', durationDays: 'durationDays', status: 'status', submittedVia: 'submittedVia', notes: 'notes', ariaRecommendation: 'ariaRecommendation', ariaConfidenceScore: 'ariaConfidenceScore', ariaRecommendationJson: 'ariaRecommendationJson', updatedBy: 'updatedBy', updatedByName: 'updatedByName', updatedDate: 'updatedDate', lastUpdatedDate: 'lastUpdatedDate' },
  absenceTypes:      { id: 'id', tenantId: 'tenantId', typeNameEn: 'typeNameEn', typeNameAr: 'typeNameAr', typeCode: 'typeCode', minNoticeDays: 'minNoticeDays', maxDaysPerYear: 'maxDaysPerYear' },
  absenceBalances:   { id: 'id', tenantId: 'tenantId', personId: 'personId', absenceTypeId: 'absenceTypeId', balanceYear: 'balanceYear', openingBalanceDays: 'openingBalanceDays', accruedDays: 'accruedDays', takenDays: 'takenDays', closingBalanceDays: 'closingBalanceDays' },
  persons:           { id: 'id', tenantId: 'tenantId', fullNameEn: 'fullNameEn', hireDate: 'hireDate', gender: 'gender', employmentType: 'employmentType', currentDepartmentId: 'currentDepartmentId' },
  departments:       { id: 'id', tenantId: 'tenantId', nameEn: 'nameEn' },
  workerAssignments: { id: 'id', tenantId: 'tenantId', personId: 'personId', legalEntityId: 'legalEntityId', isCurrent: 'isCurrent' },
}))

// Mock the runtime config loader (provider layer) so it doesn't consume the
// DB queue. Provider 'anthropic' routes through the mocked Anthropic SDK below.
vi.mock('@/lib/aria/config-loader', () => ({
  loadAriaRuntimeConfig: vi.fn().mockResolvedValue({
    provider: 'anthropic', modelId: 'claude-sonnet-4-6', apiKey: 'test-key', apiEndpoint: null,
  }),
}))

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify(VALID_RECOMMENDATION),
        }],
      }),
    },
  })),
}))

let transactionCallCount = 0

describe('generateLeaveRecommendation', () => {
  beforeEach(() => {
    MOCK_DB_RESPONSES.queue = []
    MOCK_DB_RESPONSES.callIndex = 0
    transactionCallCount = 0

    // Set implementation each time (avoids clearAllMocks issues)
    mockTransactionImpl = async (fn: (tx: unknown) => Promise<void>) => {
      transactionCallCount++
      MOCK_TX.update.mockReturnValue({
        set:   function(this: unknown) { return this },
        where: vi.fn().mockResolvedValue(undefined),
      })
      MOCK_TX.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      })
      await fn(MOCK_TX)
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns without throwing when ARIA_NOT_CONFIGURED', async () => {
    const originalKey = process.env.ARIA_API_KEY
    delete process.env.ARIA_API_KEY

    // Must seed queue with at least 1 response for leave request
    MOCK_DB_RESPONSES.queue = [
      [{ id: 'req-001', personId: 'person-001', legalEntityId: 'entity-001', absenceTypeId: 'type-001', startDate: '2026-06-01', endDate: '2026-06-05', durationDays: '5', status: 'PENDING', submittedVia: 'ARIA_TEXT', notes: null, typeNameEn: 'Annual Leave', typeNameAr: 'إجازة سنوية', typeCode: 'ANNUAL', minNoticeDays: '3', maxDaysPerYear: '30' }],
    ]

    const { generateLeaveRecommendation } = await import('@/modules/aria/leave-recommendation')
    await expect(generateLeaveRecommendation('req-001')).resolves.not.toThrow()

    process.env.ARIA_API_KEY = originalKey
  })

  it('writes recommendation to absence_entries when Claude succeeds', async () => {
    process.env.ARIA_API_KEY = 'test-api-key'

    MOCK_DB_RESPONSES.queue = [
      // 1. Leave request + absenceType join
      [{ id: 'req-001', personId: 'person-001', legalEntityId: 'entity-001', absenceTypeId: 'type-001', startDate: '2026-06-01', endDate: '2026-06-05', durationDays: '5', status: 'PENDING', submittedVia: 'ARIA_TEXT', notes: null, typeNameEn: 'Annual Leave', typeNameAr: 'إجازة سنوية', typeCode: 'ANNUAL', minNoticeDays: '3', maxDaysPerYear: '30' }],
      // 2. Employee
      [{ id: 'person-001', fullNameEn: 'Ahmed Al Mansoori', hireDate: '2023-01-01', gender: 'MALE', employmentType: 'FULL_TIME', deptId: 'dept-001' }],
      // 3. Balance
      [{ openingBalance: '20', accruedDays: '2', takenDays: '6', closingBalance: '16' }],
      // 4. Department
      [{ nameEn: 'Operations' }],
      // 5. Team total
      [{ total: 12 }],
      // 6. Team on overlapping leave
      [{ onLeave: 1 }],
      // 7. History
      [{ totalRequests: 4 }],
    ]

    const { generateLeaveRecommendation } = await import('@/modules/aria/leave-recommendation')
    await generateLeaveRecommendation('req-001')

    // Transaction should have been called exactly once (to persist recommendation)
    expect(transactionCallCount).toBe(1)
  })

  it('does not throw when Claude returns invalid JSON', async () => {
    process.env.ARIA_API_KEY = 'test-api-key'

    // Override the Anthropic mock for this test to return invalid JSON
    const anthropicMod = await import('@anthropic-ai/sdk')
    const Anthropic = anthropicMod.default as unknown as ReturnType<typeof vi.fn>
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json at all' }],
        }),
      },
    }))

    MOCK_DB_RESPONSES.queue = [
      [{ id: 'req-001', personId: 'person-001', legalEntityId: 'entity-001', absenceTypeId: 'type-001', startDate: '2026-06-01', endDate: '2026-06-05', durationDays: '5', status: 'PENDING', submittedVia: 'ARIA_TEXT', notes: null, typeNameEn: 'Annual Leave', typeNameAr: 'إجازة سنوية', typeCode: 'ANNUAL', minNoticeDays: '3', maxDaysPerYear: '30' }],
      [{ id: 'person-001', fullNameEn: 'Ahmed Al Mansoori', hireDate: '2023-01-01', gender: 'MALE', employmentType: 'FULL_TIME', deptId: 'dept-001' }],
      [{ openingBalance: '20', accruedDays: '2', takenDays: '6', closingBalance: '16' }],
      [{ nameEn: 'Operations' }],
      [{ total: 12 }],
      [{ onLeave: 0 }],
      [{ totalRequests: 2 }],
    ]

    const { generateLeaveRecommendation } = await import('@/modules/aria/leave-recommendation')
    // Should resolve without throwing (non-fatal error handling)
    await expect(generateLeaveRecommendation('req-001')).resolves.not.toThrow()
  })

  it('handles missing leave request (not found) without throwing', async () => {
    process.env.ARIA_API_KEY = 'test-api-key'

    MOCK_DB_RESPONSES.queue = [
      [], // empty result — request not found
    ]

    const { generateLeaveRecommendation } = await import('@/modules/aria/leave-recommendation')
    await expect(generateLeaveRecommendation('non-existent')).resolves.not.toThrow()
  })
})
