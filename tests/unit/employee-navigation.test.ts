/**
 * Employee Navigation Order — Task 2F unit tests (NAV-001–NAV-010)
 *
 * Guards the EmployeeSidebar NAV_ITEMS order so regressions are caught
 * at the unit layer without requiring a running browser.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Read the sidebar source and extract href order ────────────────────────────

const sidebarSrc = readFileSync(
  resolve(__dirname, '../../components/employee/EmployeeSidebar.tsx'),
  'utf8',
)

// Extract href values from NAV_ITEMS in order of appearance
const hrefMatches = [...sidebarSrc.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1])

// The NAV_ITEMS block ends before the Props interface; we only care about
// hrefs that are nav routes (not the logo link or sign-out link which appear later)
const NAV_ROUTES = ['/me', '/me/profile', '/absence/my', '/me/requests', '/approvals', '/me/timesheet',
  '/me/insurance', '/me/documents', '/me/letters', '/me/directory',
  '/me/aria', '/org-chart']

// Filter to just the NAV_ITEMS routes (these appear in NAV_ITEMS before any JSX)
// Strategy: parse from the NAV_ITEMS const block
const navItemsBlock = sidebarSrc.match(/const NAV_ITEMS = \[([\s\S]*?)\]/)![1]
const navHrefs = [...navItemsBlock.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1])

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmployeeSidebar NAV_ITEMS order (NAV-001–010)', () => {
  it('NAV-001: contains exactly 12 nav items', () => {
    expect(navHrefs).toHaveLength(12)
  })

  it('NAV-002: Home is first', () => {
    expect(navHrefs[0]).toBe('/me')
  })

  it('NAV-003: My Profile is second (immediately after Home)', () => {
    expect(navHrefs[1]).toBe('/me/profile')
  })

  it('NAV-004: My Leave is third', () => {
    expect(navHrefs[2]).toBe('/absence/my')
  })

  it('NAV-005: My Requests fourth, Approvals fifth, Timesheet sixth', () => {
    expect(navHrefs[3]).toBe('/me/requests')
    expect(navHrefs[4]).toBe('/approvals')
    expect(navHrefs[5]).toBe('/me/timesheet')
  })

  it('NAV-006: Organisation Chart is last', () => {
    expect(navHrefs[navHrefs.length - 1]).toBe('/org-chart')
  })

  it('NAV-007: ARIA is second-to-last (separator logic still fires before it)', () => {
    expect(navHrefs[navHrefs.length - 2]).toBe('/me/aria')
  })

  it('NAV-008: all original routes are present (no routes removed)', () => {
    expect(navHrefs).toContain('/me')
    expect(navHrefs).toContain('/me/profile')
    expect(navHrefs).toContain('/absence/my')
    expect(navHrefs).toContain('/me/requests')
    expect(navHrefs).toContain('/approvals')
    expect(navHrefs).toContain('/me/timesheet')
    expect(navHrefs).toContain('/me/insurance')
    expect(navHrefs).toContain('/me/documents')
    expect(navHrefs).toContain('/me/letters')
    expect(navHrefs).toContain('/me/directory')
    expect(navHrefs).toContain('/me/aria')
    expect(navHrefs).toContain('/org-chart')
  })

  it('NAV-009: My Profile appears before My Leave', () => {
    const profileIdx = navHrefs.indexOf('/me/profile')
    const leaveIdx   = navHrefs.indexOf('/absence/my')
    expect(profileIdx).toBeLessThan(leaveIdx)
  })

  it('NAV-010: Organisation Chart appears after ARIA', () => {
    const orgIdx  = navHrefs.indexOf('/org-chart')
    const ariaIdx = navHrefs.indexOf('/me/aria')
    expect(orgIdx).toBeGreaterThan(ariaIdx)
  })
})
