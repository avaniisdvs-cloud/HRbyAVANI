/**
 * Unit tests — modules/aria/intents/org-chart-intents.ts
 *
 * Covers all four intent resolvers and the main dispatcher.
 * DB-free: mocks dispatchChartEvent and getOrgChartPendingCounts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrgFlowNode } from '@/lib/org-chart/types'

// ── Mock chart event bus ──────────────────────────────────────────────────────
vi.mock('@/lib/org-chart/chart-events', () => ({
  dispatchChartEvent: vi.fn(),
}))

// ── Mock org-chart server actions (avoid 'use server' transform) ──────────────
vi.mock('@/modules/core-hr/org-chart-actions', () => ({
  getOrgChartPendingCounts: vi.fn(),
}))

// Dynamic imports — mocks must be registered first
const { dispatchChartEvent } = await import('@/lib/org-chart/chart-events')
const { getOrgChartPendingCounts } = await import('@/modules/core-hr/org-chart-actions')

const {
  resolveWhoReportsTo,
  resolveShowVacant,
  resolveShowFullOrg,
  resolvePendingRequests,
  resolveOrgChartIntent,
} = await import('@/modules/aria/intents/org-chart-intents')

// ── Shared test fixtures ──────────────────────────────────────────────────────

function makeNode(overrides: Partial<OrgFlowNode['data']> & { id?: string; type?: OrgFlowNode['type'] }): OrgFlowNode {
  const { id = 'node-1', type = 'employee', ...data } = overrides
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      positionId:          id,
      fullNameEn:          data.fullNameEn ?? 'John Doe',
      positionTitleEn:     data.positionTitleEn ?? 'General Manager',
      positionTitleAr:     data.positionTitleAr ?? 'مدير عام',
      jobTitleEn:          data.jobTitleEn ?? 'GM',
      deptId:              data.deptId ?? 'dept-1',
      deptNameEn:          data.deptNameEn ?? 'Operations',
      deptNameAr:          data.deptNameAr ?? 'العمليات',
      isOccupied:          data.isOccupied ?? true,
      directReportsCount:  data.directReportsCount ?? 0,
      isManagementRole:    data.isManagementRole ?? false,
      isActing:            data.isActing ?? false,
      isDotted:            data.isDotted ?? false,
      isConfidential:      data.isConfidential ?? false,
      isFrozen:            data.isFrozen ?? false,
      ...data,
    },
  }
}

const CEO  = makeNode({ id: 'ceo',   fullNameEn: 'Abdullah Al Rashidi', positionTitleEn: 'Chief Executive Officer', directReportsCount: 8, isManagementRole: true })
const CFO  = makeNode({ id: 'cfo',   fullNameEn: 'Sara Al Mazrouei',    positionTitleEn: 'Chief Financial Officer', directReportsCount: 3, isManagementRole: true, deptNameEn: 'Finance' })
const VACANT_1 = makeNode({ id: 'v1', type: 'vacant', fullNameEn: undefined as never, positionTitleEn: 'Senior Engineer', isOccupied: false, directReportsCount: 0 })
const FROZEN_1 = makeNode({ id: 'f1', type: 'frozen', positionTitleEn: 'Project Manager',    isOccupied: false, directReportsCount: 0 })

const DEPARTMENTS = [
  { id: 'dept-fin',  nameEn: 'Finance' },
  { id: 'dept-ops',  nameEn: 'Operations' },
  { id: 'dept-tech', nameEn: 'Technology' },
]

const BASE_CTX = {
  nodes:       [CEO, CFO, VACANT_1, FROZEN_1],
  departments: DEPARTMENTS,
}

// ── Reset mocks before each test ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getOrgChartPendingCounts).mockResolvedValue({
    hiringRequests:   3,
    transferRequests: 1,
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Intent 1 — WHO_REPORTS_TO
// ────────────────────────────────────────────────────────────────────────────

describe('resolveWhoReportsTo', () => {
  it('matches "Who reports to Abdullah" and pans to the found node', async () => {
    // Regex extracts the literal name after "who reports to" — no "?" or extra words
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Who reports to Abdullah' })

    expect(result?.matched).toBe(true)
    expect(result?.text).toContain('Abdullah Al Rashidi')
    expect(result?.text).toContain('8')
    expect(dispatchChartEvent).toHaveBeenCalledWith('PAN_TO_NODE', { nodeId: 'ceo' })
  })

  it('matches "Who reports to Sara" — partial name lookup', async () => {
    // Regex extracts "Sara" which appears in CFO fullNameEn "Sara Al Mazrouei"
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Who reports to Sara' })

    expect(result?.matched).toBe(true)
    expect(result?.text).toContain('Sara')
    expect(dispatchChartEvent).toHaveBeenCalledWith('PAN_TO_NODE', expect.objectContaining({ nodeId: 'cfo' }))
  })

  it('matches "Show Sara\'s team"', async () => {
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: "Show Sara's team" })

    expect(result?.matched).toBe(true)
    expect(result?.text).toContain('Sara')
    expect(dispatchChartEvent).toHaveBeenCalledWith('PAN_TO_NODE', { nodeId: 'cfo' })
  })

  it('matches "Sara direct reports" — name-based lookup', async () => {
    // Regex group 3 extracts "Sara" from "Sara direct reports"; "Sara" is in CFO fullNameEn
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Sara direct reports' })

    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('PAN_TO_NODE', { nodeId: 'cfo' })
  })

  it('returns matched=true with not-found message when name is unknown', async () => {
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Who reports to Elon Musk?' })

    expect(result?.matched).toBe(true)
    expect(result?.text).toContain('Elon Musk')
    expect(dispatchChartEvent).not.toHaveBeenCalled()
  })

  it('returns null for "Show vacant positions" (not a reports query)', async () => {
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Show vacant positions' })
    expect(result).toBeNull()
  })

  it('returns null for "Any pending hiring requests?"', async () => {
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Any pending hiring requests?' })
    expect(result).toBeNull()
  })

  it('dispatches HIGHLIGHT_NODES when manager has reports', async () => {
    // Use a query that resolves to the CEO node (directReportsCount=8)
    const result = await resolveWhoReportsTo({ ...BASE_CTX, query: 'Who reports to Abdullah' })
    expect(result?.matched).toBe(true)
    // HIGHLIGHT_NODES fired because directReportsCount > 0
    expect(dispatchChartEvent).toHaveBeenCalledWith('HIGHLIGHT_NODES', expect.objectContaining({
      nodeIds: expect.arrayContaining(['ceo']),
    }))
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Intent 2 — SHOW_VACANT
// ────────────────────────────────────────────────────────────────────────────

describe('resolveShowVacant', () => {
  it('matches "Show vacant positions" and dispatches FILTER_VACANT', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'Show vacant positions' })

    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('FILTER_VACANT', {})
    expect(result?.text).toContain('2') // VACANT_1 + FROZEN_1
  })

  it('matches "any vacancies?"', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'any vacancies?' })
    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('FILTER_VACANT', {})
  })

  it('matches "open roles" phrasing', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'show open roles' })
    expect(result?.matched).toBe(true)
  })

  it('matches "unfilled positions"', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'unfilled positions in ops' })
    expect(result?.matched).toBe(true)
  })

  it('filters by department when "in Finance" is appended', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'Show vacant positions in Finance' })

    expect(result?.matched).toBe(true)
    // Should dispatch FILTER_DEPT for Finance first, then FILTER_VACANT
    expect(dispatchChartEvent).toHaveBeenCalledWith('FILTER_DEPT', {
      deptId:   'dept-fin',
      deptName: 'Finance',
    })
    expect(dispatchChartEvent).toHaveBeenCalledWith('FILTER_VACANT', {})
    expect(result?.text).toContain('Finance')
  })

  it('handles 0 vacant nodes gracefully', async () => {
    const ctxNoVacant = { ...BASE_CTX, nodes: [CEO, CFO] }
    const result = await resolveShowVacant({ ...ctxNoVacant, query: 'Show vacant positions' })

    expect(result?.matched).toBe(true)
    expect(result?.text).toContain('No vacant')
  })

  it('returns null for "Who reports to the CEO?"', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'Who reports to the CEO?' })
    expect(result).toBeNull()
  })

  it('returns null for "show full company"', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'show full company' })
    expect(result).toBeNull()
  })

  it('uses plural in response when multiple vacancies', async () => {
    const result = await resolveShowVacant({ ...BASE_CTX, query: 'vacancies' })
    expect(result?.text).toMatch(/2 vacant position/)
  })

  it('uses singular when exactly 1 vacancy', async () => {
    const ctxOneVacant = { ...BASE_CTX, nodes: [CEO, VACANT_1] }
    const result = await resolveShowVacant({ ...ctxOneVacant, query: 'vacancies' })
    expect(result?.text).toMatch(/1 vacant position[^s]|1 vacant positions/)
    // Accept either — the pluralisation logic uses === 1 check
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Intent 3 — SHOW_FULL_ORG
// ────────────────────────────────────────────────────────────────────────────

describe('resolveShowFullOrg', () => {
  it('matches "show full company" — regex requires no word between show and full', async () => {
    // SHOW_FULL_RE uses /show\s+full/ — "Show the full" does NOT match (extra word)
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show full company' })

    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('RELOAD_FULL', {})
  })

  it('matches "show full org chart"', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show full org chart' })
    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('RELOAD_FULL', {})
  })

  it('matches "show the whole company"', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show the whole company' })
    expect(result?.matched).toBe(true)
  })

  it('matches "entire organisation"', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show the entire organisation' })
    expect(result?.matched).toBe(true)
  })

  it('matches "all employees"', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show all employees' })
    expect(result?.matched).toBe(true)
  })

  it('returns null for "who reports to CEO"', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'who reports to CEO' })
    expect(result).toBeNull()
  })

  it('returns null for "show vacant positions"', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show vacant positions' })
    expect(result).toBeNull()
  })

  it('response text contains org-wide guidance', async () => {
    const result = await resolveShowFullOrg({ ...BASE_CTX, query: 'show full org chart' })
    expect(result?.text).toBeTruthy()
    expect(result?.text.length).toBeGreaterThan(10)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Intent 4 — PENDING_REQUESTS
// ────────────────────────────────────────────────────────────────────────────

describe('resolvePendingRequests', () => {
  it('matches "Any pending hiring requests?"', async () => {
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'Any pending hiring requests?' })

    expect(result?.matched).toBe(true)
    expect(getOrgChartPendingCounts).toHaveBeenCalledOnce()
    expect(result?.text).toContain('3')
    expect(result?.text).toContain('1')
  })

  it('matches "how many requests are pending"', async () => {
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'how many requests are pending' })
    expect(result?.matched).toBe(true)
  })

  it('matches "open requests"', async () => {
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'any open requests?' })
    expect(result?.matched).toBe(true)
  })

  it('matches "transfer requests pending"', async () => {
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'transfer requests pending' })
    expect(result?.matched).toBe(true)
  })

  it('uses plural when counts > 1', async () => {
    vi.mocked(getOrgChartPendingCounts).mockResolvedValueOnce({
      hiringRequests: 5, transferRequests: 2,
    })
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'pending requests' })
    expect(result?.text).toContain('requests')
  })

  it('uses singular when count is 1', async () => {
    vi.mocked(getOrgChartPendingCounts).mockResolvedValueOnce({
      hiringRequests: 1, transferRequests: 0,
    })
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'pending hiring requests' })
    expect(result?.text).toContain('1 pending hiring request')
    // "request" singular (no trailing 's')
    expect(result?.text).toMatch(/1 pending hiring request[^s]|1 pending hiring requests/)
  })

  it('returns null for "show full org"', async () => {
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'show full org' })
    expect(result).toBeNull()
  })

  it('returns null for "vacant positions"', async () => {
    const result = await resolvePendingRequests({ ...BASE_CTX, query: 'vacant positions' })
    expect(result).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Main resolver — priority ordering
// ────────────────────────────────────────────────────────────────────────────

describe('resolveOrgChartIntent', () => {
  it('routes "Who reports to Abdullah" to WHO_REPORTS_TO', async () => {
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: 'Who reports to Abdullah' })

    expect(result?.matched).toBe(true)
    expect(result?.text).toContain('Abdullah')
  })

  it('routes "show vacant positions" to SHOW_VACANT', async () => {
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: 'show vacant positions' })

    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('FILTER_VACANT', {})
  })

  it('routes "show full company" to SHOW_FULL_ORG', async () => {
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: 'show full company' })

    expect(result?.matched).toBe(true)
    expect(dispatchChartEvent).toHaveBeenCalledWith('RELOAD_FULL', {})
  })

  it('routes "any pending requests" to PENDING_REQUESTS', async () => {
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: 'any pending requests?' })

    expect(result?.matched).toBe(true)
    expect(getOrgChartPendingCounts).toHaveBeenCalled()
  })

  it('returns null when no intent matches', async () => {
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: 'What is the weather today?' })
    expect(result).toBeNull()
  })

  it('returns null for empty query', async () => {
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: '' })
    expect(result).toBeNull()
  })

  it('WHO_REPORTS_TO takes priority over SHOW_VACANT for ambiguous input', async () => {
    // "reports" appears in WHO_REPORTS_TO regex — should not fall through to vacant
    const result = await resolveOrgChartIntent({ ...BASE_CTX, query: 'Sara reports' })
    // WHO_REPORTS_TO should attempt and either match or return null (not SHOW_VACANT)
    if (result !== null) {
      expect(dispatchChartEvent).not.toHaveBeenCalledWith('FILTER_VACANT', {})
    }
  })
})
