/**
 * W3 — Leave balance reservation / terminated-target / ESS balance math.
 * W3-001–015.
 *
 * P2-L1: pendingDays is reserved at submit (under the per-person advisory lock),
 *        released on reject, and moved to taken on approve — a symmetric ledger
 *        that makes the balance gate able to stop concurrent/sequential overspend.
 * P2-L3: createLeaveRequest rejects a terminated/inactive target.
 * P2-L4: the ESS My-Leave "total" includes carried-forward + adjusted so that
 *        available (= closing) can never exceed total.
 *
 * Calendar-day vs working-day (P2-L2) is intentionally NOT changed (business
 * decision) — asserted as a guard below.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// computeClosingBalance is pure, but its module imports '@/lib/db' (which calls
// createDb()/DATABASE_URL at import). Stub it so the pure helper can load.
vi.mock('@/lib/db', () => ({ db: {} }))

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const actions = read('modules/absence/actions.ts')

// ── P2-L1 — pendingDays lifecycle symmetry ──────────────────────────────────

describe('P2-L1 — pendingDays is reserved at submit and released symmetrically', () => {
  it('W3-001 submitLeaveRequest reserves pendingDays (increment) under the per-person lock', () => {
    const fn = actions.slice(actions.indexOf('async function submitLeaveRequest'), actions.indexOf('async function decideLeaveRequest'))
    // advisory lock acquired in the submit transaction
    expect(fn).toMatch(/pg_advisory_xact_lock\(hashtext\('leave:' \|\| \$\{row\.personId\}\)\)/)
    // pendingDays incremented by the per-year portion (C2 split: dur → seg.days)
    expect(fn).toMatch(/const newPending = Number\(bal\.pendingDays\) \+ seg\.days/)
    expect(fn).toMatch(/pendingDays:\s*String\(newPending\)/)
    // re-checks balance before reserving (authoritative gate)
    expect(fn).toMatch(/INSUFFICIENT_BALANCE/)
  })

  it('W3-002 reject RELEASES pendingDays (was previously leaked) — via per-year split helper', () => {
    const fn = actions.slice(actions.indexOf('async function decideLeaveRequest'))
    expect(fn).toMatch(/else if \(finalStatus === 'REJECTED'\)/)
    // the release path decrements pendingDays via the applyLeaveBalanceSplitTx
    // closure (C2): pendingDays = max(0, cur.pendingDays - d); taken unchanged
    const rejectBlock = fn.slice(fn.indexOf("else if (finalStatus === 'REJECTED')"))
    expect(rejectBlock).toMatch(/applyLeaveBalanceSplitTx/)
    expect(rejectBlock).toMatch(/pendingDays:\s*Math\.max\(0,\s*cur\.pendingDays\s*-\s*d\),\s*takenDays:\s*cur\.takenDays/)
  })

  it('W3-003 approve still moves pending → taken — via per-year split helper (C2)', () => {
    const fn = actions.slice(actions.indexOf('async function decideLeaveRequest'))
    const approveBlock = fn.slice(fn.indexOf("if (finalStatus === 'APPROVED')"))
    expect(approveBlock).toMatch(/applyLeaveBalanceSplitTx/)
    // closure: pendingDays = max(0, cur.pendingDays - d); takenDays = cur.takenDays + d
    expect(approveBlock).toMatch(/pendingDays:\s*Math\.max\(0,\s*cur\.pendingDays\s*-\s*d\),\s*takenDays:\s*cur\.takenDays\s*\+\s*d/)
  })

  it('W3-004 cancel still releases PENDING/APPROVED (unchanged)', () => {
    const fn = actions.slice(actions.indexOf('async function cancelLeaveRequest'), actions.indexOf('async function decideLeaveRequest'))
    expect(fn).toMatch(/row\.status === 'PENDING' \|\| row\.status === 'APPROVED'/)
  })

  it('W3-005 the submit reservation uses the SAME lock key as createLeaveRequest', () => {
    const createLock = actions.match(/pg_advisory_xact_lock\(hashtext\('leave:' \|\| \$\{data\.personId\}\)\)/)
    const submitLock = actions.match(/pg_advisory_xact_lock\(hashtext\('leave:' \|\| \$\{row\.personId\}\)\)/)
    expect(createLock).not.toBeNull()
    expect(submitLock).not.toBeNull()
  })
})

// ── P2-L3 — terminated/inactive target ──────────────────────────────────────

describe('P2-L3 — leave cannot be filed for a terminated/inactive employee', () => {
  it('W3-006 createLeaveRequest calls assertActivePersonTarget pre-flight', () => {
    expect(actions).toMatch(/import \{ assertActivePersonTarget \} from '@\/lib\/access'/)
    const fn = actions.slice(actions.indexOf('export async function createLeaveRequest'), actions.indexOf('export async function', actions.indexOf('export async function createLeaveRequest') + 1))
    expect(fn).toMatch(/await assertActivePersonTarget\(data\.personId\)/)
  })
  it('W3-007 the active check runs before db.transaction (avoids max:1 deadlock)', () => {
    const fn = actions.slice(actions.indexOf('export async function createLeaveRequest'))
    expect(fn.indexOf('assertActivePersonTarget(data.personId)')).toBeLessThan(fn.indexOf('db.transaction'))
  })
})

// ── P2-L4 — ESS balance math invariant ──────────────────────────────────────

describe('P2-L4 — ESS My-Leave total includes carried-forward + adjusted', () => {
  const page = read('app/(employee)/me/leave/page.tsx')
  it('W3-008 selects carriedForwardDays and adjustedDays', () => {
    expect(page).toMatch(/carriedForwardDays:absenceBalances\.carriedForwardDays/)
    expect(page).toMatch(/adjustedDays:\s*absenceBalances\.adjustedDays/)
  })
  it('W3-009 total = opening + accrued + carried + adjusted', () => {
    expect(page).toMatch(/const total\s*=\s*parseFloat\(String\(b\.openingBalanceDays[\s\S]*?carriedForwardDays[\s\S]*?adjustedDays/)
  })
})

describe('P2-L4 — computeClosingBalance keeps available ≤ total', () => {
  it('W3-010 closing never exceeds (opening+accrued+carried+adjusted) for any non-negative consumption', async () => {
    const { computeClosingBalance } = await import('@/modules/absence/services')
    const cases = [
      { openingBalanceDays: 5, accruedDays: 30, carriedForwardDays: 4, adjustedDays: 2, takenDays: 10, pendingDays: 6, forfeitedDays: 1 },
      { openingBalanceDays: 0, accruedDays: 0,  carriedForwardDays: 0, adjustedDays: 0, takenDays: 0,  pendingDays: 0, forfeitedDays: 0 },
      { openingBalanceDays: 0, accruedDays: 12, carriedForwardDays: 10, adjustedDays: -3, takenDays: 0, pendingDays: 0, forfeitedDays: 0 },
    ]
    for (const c of cases) {
      const total = c.openingBalanceDays + c.accruedDays + c.carriedForwardDays + c.adjustedDays
      const closing = computeClosingBalance(c)
      expect(closing).toBeLessThanOrEqual(total)
    }
  })
})

// ── P2-L2 — explicitly NOT changed (business decision) ──────────────────────

describe('P2-L2 — calendar-day arithmetic preserved (NEEDS_BUSINESS_DECISION)', () => {
  it('W3-011 computeRequestDurationDays still uses inclusive calendar-day span', () => {
    const services = read('modules/absence/services.ts')
    expect(services).toMatch(/BR-AL-002/)
    // still daysBetween + 1 (no working-day / holiday exclusion introduced)
    expect(services).toMatch(/daysBetween\([^)]*\)\s*\+\s*1/)
  })
})
