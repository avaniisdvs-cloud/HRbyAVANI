/**
 * Manager Reports — UI contract for the /reports page.
 *
 * Source-level assertions (the page is an async Server Component that calls
 * auth(), getLocale() and many DB queries, so it is verified structurally —
 * the behavioural query logic is covered by report-manager-scope.test.ts and
 * report-pending-approvers.test.ts).
 *
 * Tests:
 *   RMU-001: the in-page duplicate "Reports" left-nav is hidden for MANAGER.
 *   RMU-002: admins still keep the in-page left nav (it is their 2-level nav).
 *   RMU-003: Leave Summary skips the redundant entity filter for MANAGER.
 *   RMU-004: Leave Balances remains UNCHANGED — entity filter still applies to
 *            all roles (no !isManager guard added).
 *   RMU-005: PENDING rows render "with <approver>" inline in the Status column
 *            (EN + AR), using the batched approver resolver — no new column.
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const src  = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/reports/page.tsx'), 'utf-8')

describe('Manager Reports — /reports page UI contract', () => {
  it('RMU-001: the in-page Reports left-nav is suppressed for MANAGER', () => {
    // The left-nav block is gated on !isManager.
    expect(src).toMatch(/\{!isManager && \(\s*<div className="reports-navigation"/)
  })

  it('RMU-002: admins still render the in-page left nav as their secondary nav', () => {
    // Insurance Reports link (admin-only) lives inside that same nav block.
    expect(src).toMatch(/href="\/reports\/insurance"/)
  })

  it('RMU-003: Leave Summary skips the redundant entity filter for MANAGER', () => {
    expect(src).toMatch(/if \(scopeEntityId && !isManager\) conds\.push\(eq\(absenceEntries\.legalEntityId/)
  })

  it('RMU-004: Leave Balances entity filter is unchanged (applies to all roles)', () => {
    // Still the unguarded form — must NOT have gained a !isManager guard.
    expect(src).toMatch(/if \(scopeEntityId\) conds\.push\(eq\(absenceBalances\.legalEntityId/)
    expect(src).not.toMatch(/scopeEntityId && !isManager\) conds\.push\(eq\(absenceBalances/)
  })

  it('RMU-005: PENDING rows show "with <approver>" inline (EN + AR), no new column', () => {
    expect(src).toContain('resolvePendingApprovers')
    expect(src).toMatch(/with \$\{approverLabel\}/)
    expect(src).toMatch(/بانتظار \$\{approverLabel\}/)
    // Still exactly 7 Leave Summary columns (Request#, Employee, Dept, Type,
    // Period, Days, Status) — the approver is rendered inside the Status cell.
    // i18n: the Status header is now single-language-per-locale.
    expect(src).toContain("<th style={TH}>{locale === 'ar' ? 'الحالة' : 'Status'}</th>")
  })
})
