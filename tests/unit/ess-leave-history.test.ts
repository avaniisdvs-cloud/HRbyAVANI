/**
 * ESS-LH — ESS Leave History Panel unit tests.
 *
 * Tests the server action `getLeaveHistoryForEmployee` and the supporting
 * UI logic (pending-duration calculation) without touching the DB.
 * All DB calls are mocked at the drizzle layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Helpers copied from component layer (pure functions) ──────────────────

function pendingDuration(since: Date | string | null, locale: string): string {
  if (!since) return ''
  const sinceMs = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (isNaN(sinceMs)) return ''
  const diffMs   = Date.now() - sinceMs
  const diffHrs  = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays >= 1) {
    return locale === 'ar'
      ? `منذ ${diffDays} ${diffDays === 1 ? 'يوم' : 'أيام'}`
      : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
  }
  return locale === 'ar' ? `منذ ${diffHrs} ساعة` : `${diffHrs} ${diffHrs === 1 ? 'hour' : 'hours'} ago`
}

// ── Mock setup ────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(),
  getCurrentUser: vi.fn(),
  auth: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const select  = vi.fn()
  const mockDb  = { select, transaction: vi.fn() }
  return { db: mockDb, default: mockDb }
})

vi.mock('@/lib/constants', () => ({ TENANT_ID: 'test-tenant-id' }))

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ESS-LH: pending duration calculation', () => {
  it('ESS-LH-001 — returns empty string for null since', () => {
    expect(pendingDuration(null, 'en')).toBe('')
  })

  it('ESS-LH-002 — returns hours when < 24h pending', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const result = pendingDuration(twoHoursAgo, 'en')
    expect(result).toMatch(/2 hours ago/)
  })

  it('ESS-LH-003 — returns days when >= 24h pending', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const result = pendingDuration(threeDaysAgo, 'en')
    expect(result).toBe('3 days ago')
  })

  it('ESS-LH-004 — singular "day" for exactly 1 day', () => {
    const oneDayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const result = pendingDuration(oneDayAgo, 'en')
    expect(result).toBe('1 day ago')
  })

  it('ESS-LH-005 — returns Arabic text when locale=ar', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const result = pendingDuration(threeDaysAgo, 'ar')
    expect(result).toMatch(/منذ/)
    expect(result).toMatch(/أيام/)
  })

  it('ESS-LH-006 — handles ISO string input', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const result = pendingDuration(twoHoursAgo, 'en')
    expect(result).toMatch(/hours ago/)
  })

  it('ESS-LH-007 — returns empty for invalid date string', () => {
    expect(pendingDuration('not-a-date', 'en')).toBe('')
  })
})

describe('ESS-LH: getLeaveHistoryForEmployee server action', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('ESS-LH-008 — returns empty result when user has no personId', async () => {
    const { requireRole } = await import('@/lib/auth')
    vi.mocked(requireRole).mockResolvedValueOnce({
      id: 'u1', name: 'Test', email: 'test@test.com',
      role: 'EMPLOYEE', personId: null, legalEntityId: 'e1',
      mfaVerified: true,
    } as never)

    const { getLeaveHistoryForEmployee } = await import('@/modules/absence/actions')
    const result = await getLeaveHistoryForEmployee({})
    expect(result.rows).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('ESS-LH-009 — action module is in "use server" scope', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/actions.ts'),
      'utf-8',
    )
    expect(src.startsWith("'use server'")).toBe(true)
  })

  it('ESS-LH-010 — getLeaveHistoryForEmployee is exported from modules/absence/index.ts', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/index.ts'),
      'utf-8',
    )
    expect(src).toContain('getLeaveHistoryForEmployee')
  })

  it('ESS-LH-011 — employee personId is always injected into the conditions', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/actions.ts'),
      'utf-8',
    )
    // Confirm the security gate: personId must be in conditions before any filter
    const fnStart = src.indexOf('async function getLeaveHistoryForEmployee')
    const fnBody  = src.slice(fnStart, fnStart + 1500)
    expect(fnBody).toContain('eq(absenceEntries.personId, user.personId)')
  })

  it('ESS-LH-012 — year filter uses startDate range (not endDate)', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/actions.ts'),
      'utf-8',
    )
    const fnStart = src.indexOf('async function getLeaveHistoryForEmployee')
    const fnBody  = src.slice(fnStart, fnStart + 2000)
    expect(fnBody).toContain('absenceEntries.startDate, `${input.year}-01-01`')
    expect(fnBody).toContain('absenceEntries.startDate, `${input.year}-12-31`')
  })

  it('ESS-LH-013 — approver join uses alias() to prevent ambiguous column names', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/actions.ts'),
      'utf-8',
    )
    expect(src).toContain("alias(persons, 'approver')")
    expect(src).toContain("alias(persons, 'delegate')")
  })

  it('ESS-LH-014 — delegateName takes priority over approverName in approverMap', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/actions.ts'),
      'utf-8',
    )
    expect(src).toContain('s.delegateName ?? s.approverName ?? null')
  })

  it('ESS-LH-015 — pageSize capped at 50 to prevent over-fetching', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'modules/absence/actions.ts'),
      'utf-8',
    )
    const fnStart = src.indexOf('async function getLeaveHistoryForEmployee')
    const fnBody  = src.slice(fnStart, fnStart + 1000)
    expect(fnBody).toContain('Math.min(50,')
  })
})

describe('ESS-LH: component structure', () => {
  it('ESS-LH-016 — LeaveShell is a client component', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'components/employee/LeaveShell.tsx'),
      'utf-8',
    )
    expect(src.startsWith("'use client'")).toBe(true)
  })

  it('ESS-LH-017 — LeaveHistoryPanel is a client component', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'components/employee/LeaveHistoryPanel.tsx'),
      'utf-8',
    )
    expect(src.startsWith("'use client'")).toBe(true)
  })

  it('ESS-LH-018 — LeaveShell imports LeaveHistoryPanel', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'components/employee/LeaveShell.tsx'),
      'utf-8',
    )
    expect(src).toContain("from './LeaveHistoryPanel'")
  })

  it('ESS-LH-019 — LeaveBalanceBand accepts onTypeClick prop', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'components/employee/LeaveBalanceBand.tsx'),
      'utf-8',
    )
    expect(src).toContain('onTypeClick')
    expect(src).toContain('selectedTypeCode')
  })

  it('ESS-LH-020 — RecentActivityCard renders pending approver info', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'components/employee/RecentActivityCard.tsx'),
      'utf-8',
    )
    expect(src).toContain('pendingApproverName')
    expect(src).toContain('pendingApproverSince')
    expect(src).toContain('With:')
  })

  it('ESS-LH-021 — ESS page uses LeaveShell instead of LeaveBalanceBand', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'app/(employee)/me/page.tsx'),
      'utf-8',
    )
    expect(src).toContain('LeaveShell')
    expect(src).not.toContain('LeaveBalanceBand')
  })

  it('ESS-LH-022 — ESS page enriches recent requests with approver data', async () => {
    const fs   = await import('fs')
    const path = await import('path')
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'app/(employee)/me/page.tsx'),
      'utf-8',
    )
    expect(src).toContain('pendingApproverName')
    expect(src).toContain('pendingApproverSince')
    expect(src).toContain('workflowStepInstances')
  })
})
