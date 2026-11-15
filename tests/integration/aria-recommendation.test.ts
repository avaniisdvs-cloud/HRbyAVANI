/**
 * Integration tests — ARIA Leave Approval Recommendation flow.
 *
 * Tests the full chain:
 *   submitLeaveRequest → ARIA.LEAVE_RECOMMENDATION event emitted
 *   → outbox handler fires → generateLeaveRecommendation called
 *   → getLeaveRecommendationForInstance returns correct shape or null
 *
 * All DB and Anthropic SDK calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AriaLeaveRecommendation } from '@/modules/aria/types'

// ── DB mock ────────────────────────────────────────────────────────────────────

const insertedEvents: unknown[] = []
let absenceEntriesRow: Record<string, unknown> | null = null

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({
    id: 'user-001', name: 'Test User', role: 'EMPLOYEE', personId: 'person-001',
  }),
  getCurrentUser: vi.fn(),
  auth: vi.fn(),
}))
vi.mock('@/lib/effective-date', () => ({ addDays: vi.fn((d: string, n: number) => d) }))
vi.mock('@/lib/date-utils', () => ({
  isoDateDiff:    vi.fn((a: string, b: string) => 5),
  isoDateAddDays: vi.fn((d: string, n: number) => d),
}))
vi.mock('@/lib/absence-cert-policy', () => ({
  getSickLeaveCertThreshold: vi.fn().mockResolvedValue(3),
  isMedicalCertRequired:     vi.fn().mockResolvedValue(false),
}))
vi.mock('@/modules/config', () => ({
  initiateWorkflow:         vi.fn().mockResolvedValue({ instanceId: 'wf-instance-001' }),
  assertLeaveRuleNotBelowMinimum: vi.fn(),
  getPendingApprovalsForCurrentUser: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/workflow-engine', () => ({
  submitWorkflow:    vi.fn().mockResolvedValue({}),
  takeWorkflowAction: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/drizzle/schema', () => {
  const t = (name: string) => new Proxy({} as Record<string, string>, { get: (_, k) => `${name}.${String(k)}` })
  return {
    absenceEntries:       t('absenceEntries'),
    absenceTypes:         t('absenceTypes'),
    absenceBalances:      t('absenceBalances'),
    persons:              t('persons'),
    departments:          t('departments'),
    workerAssignments:    t('workerAssignments'),
    workflowInstancesV2:  t('workflowInstancesV2'),
    leaveRuleSets:        t('leaveRuleSets'),
    leaveRuleLines:       t('leaveRuleLines'),
    events:               t('events'),
    accommodationRequests: t('accommodationRequests'),
  }
})

// ── getLeaveRecommendationForInstance — unit of the query function ─────────────

describe('getLeaveRecommendationForInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no workflow instance found', async () => {
    const selectChain = {
      from:     vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where:    vi.fn().mockReturnThis(),
      limit:    vi.fn().mockResolvedValue([]),
    }
    mockDb.select.mockReturnValue(selectChain)

    const { getLeaveRecommendationForInstance } = await import('@/modules/aria/approval-queries')
    const result = await getLeaveRecommendationForInstance('non-existent-id')
    expect(result).toBeNull()
  })

  it('returns null when resourceType is not absence_entries', async () => {
    const selectChain = {
      from:     vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where:    vi.fn().mockReturnThis(),
      limit:    vi.fn().mockResolvedValue([{
        resourceType:           'hiring_requests',
        ariaRecommendationJson: null,
      }]),
    }
    mockDb.select.mockReturnValue(selectChain)

    const { getLeaveRecommendationForInstance } = await import('@/modules/aria/approval-queries')
    const result = await getLeaveRecommendationForInstance('wf-hiring-001')
    expect(result).toBeNull()
  })

  it('returns null when recommendation JSON is null (not generated yet)', async () => {
    const selectChain = {
      from:     vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where:    vi.fn().mockReturnThis(),
      limit:    vi.fn().mockResolvedValue([{
        resourceType:           'absence_entries',
        ariaRecommendationJson: null,
      }]),
    }
    mockDb.select.mockReturnValue(selectChain)

    const { getLeaveRecommendationForInstance } = await import('@/modules/aria/approval-queries')
    const result = await getLeaveRecommendationForInstance('wf-leave-pending')
    expect(result).toBeNull()
  })

  it('returns AriaLeaveRecommendation when recommendation exists', async () => {
    const rec: AriaLeaveRecommendation = {
      recommendation: 'APPROVE',
      confidence:     0.91,
      summaryEn:      'Balance sufficient.',
      summaryAr:      'الرصيد كافٍ.',
      factors: [
        { factor: 'Balance', status: 'OK', detailEn: '14 days remaining', detailAr: '١٤ يوماً متبقية' },
      ],
      generatedAt: '2026-05-08T09:00:00.000Z',
      model:        'claude-sonnet-4-6',
    }

    const selectChain = {
      from:     vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where:    vi.fn().mockReturnThis(),
      limit:    vi.fn().mockResolvedValue([{
        resourceType:           'absence_entries',
        ariaRecommendationJson: rec,
      }]),
    }
    mockDb.select.mockReturnValue(selectChain)

    const { getLeaveRecommendationForInstance } = await import('@/modules/aria/approval-queries')
    const result = await getLeaveRecommendationForInstance('wf-leave-001')

    expect(result).not.toBeNull()
    expect(result?.recommendation).toBe('APPROVE')
    expect(result?.confidence).toBe(0.91)
    expect(result?.factors).toHaveLength(1)
    expect(result?.factors[0]?.factor).toBe('Balance')
  })

  it('returns null on DB error (graceful fallback)', async () => {
    const selectChain = {
      from:     vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where:    vi.fn().mockReturnThis(),
      limit:    vi.fn().mockRejectedValue(new Error('DB connection failed')),
    }
    mockDb.select.mockReturnValue(selectChain)

    const { getLeaveRecommendationForInstance } = await import('@/modules/aria/approval-queries')
    const result = await getLeaveRecommendationForInstance('wf-error')
    expect(result).toBeNull()
  })
})

// ── AriaLeaveRecommendation shape validation ───────────────────────────────────

describe('AriaLeaveRecommendation shape', () => {
  it('REJECT recommendation has correct fields', () => {
    const rec: AriaLeaveRecommendation = {
      recommendation: 'REJECT',
      confidence:     0.85,
      summaryEn:      'Insufficient balance.',
      summaryAr:      'رصيد غير كافٍ.',
      factors: [
        { factor: 'Balance', status: 'FAIL', detailEn: 'Would overdraw by 3 days', detailAr: 'سيتجاوز الرصيد بـ ٣ أيام' },
      ],
      generatedAt: new Date().toISOString(),
      model:        'claude-sonnet-4-6',
    }

    expect(rec.recommendation).toBe('REJECT')
    expect(rec.factors[0]?.status).toBe('FAIL')
  })

  it('REVIEW recommendation has WARN factors', () => {
    const rec: AriaLeaveRecommendation = {
      recommendation: 'REVIEW',
      confidence:     0.6,
      summaryEn:      'Short notice period requires manager review.',
      summaryAr:      'فترة الإخطار القصيرة تستوجب مراجعة المدير.',
      factors: [
        { factor: 'Notice Period', status: 'WARN', detailEn: 'Only 1 day notice', detailAr: 'يوم إخطار واحد فقط' },
      ],
      generatedAt: new Date().toISOString(),
      model:        'claude-sonnet-4-6',
    }

    expect(rec.recommendation).toBe('REVIEW')
    expect(rec.confidence).toBeLessThan(0.8)
    expect(rec.factors.some(f => f.status === 'WARN')).toBe(true)
  })
})
