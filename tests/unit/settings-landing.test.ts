/**
 * AVANIIS HCM — Administration Landing Tests (Option C1)
 *
 * Verifies the simplified, grouped, role-aware /settings landing:
 *  - HR Admin sees only HR-operational groups (no Payroll, no Platform & System);
 *  - HR Director adds Payroll + director access items, still no Platform;
 *  - Super Admin sees all 7 groups incl. Platform & System;
 *  - every visible card matches its target page guard (no card leads to a
 *    forbidden redirect);
 *  - the landing page is wired to the config + real DB counts (no demo data).
 *
 * `visibleAdminGroups` is a pure function — imported directly. Page wiring is
 * verified by source inspection.
 *
 * Tests: SL-001 .. SL-012
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'
import { ADMIN_LANDING, visibleAdminGroups } from '@/config/admin-landing'

const ROOT = path.resolve(__dirname, '../..')
const pageSrc = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/settings/page.tsx'), 'utf-8')

const groupIds  = (role: string) => visibleAdminGroups(role).map(g => g.id)
const cardIds   = (role: string) => visibleAdminGroups(role).flatMap(g => g.cards.map(c => c.id))

describe('Administration landing (Option C1)', () => {
  it('SL-001: HR Admin sees no Platform & System; Payroll shows only Company Currency', () => {
    const ids = groupIds('HR_ADMIN')
    expect(ids).not.toContain('platform')
    // B1b — Currency restored for HR Admin, so the Payroll group is visible but
    // contains ONLY the currency card (no runs / pay components / WPS exposure).
    const payroll = visibleAdminGroups('HR_ADMIN').find(g => g.id === 'payroll')
    expect(payroll?.cards.map(c => c.id)).toEqual(['currency'])
  })

  it('SL-002: HR Admin sees the HR-operational groups', () => {
    const ids = groupIds('HR_ADMIN')
    expect(ids).toEqual(expect.arrayContaining(['hr-policies', 'org-setup', 'leave-time', 'lifecycle', 'access']))
  })

  it('SL-003: HR Admin never sees super-admin platform cards', () => {
    const ids = cardIds('HR_ADMIN')
    for (const forbidden of ['ai-agent', 'branding', 'permissions', 'feature-permissions', 'integrations', 'api-webhooks']) {
      expect(ids).not.toContain(forbidden)
    }
  })

  it('SL-004: HR Director sees Payroll but not Platform & System', () => {
    const ids = groupIds('HR_DIRECTOR')
    expect(ids).toContain('payroll')
    expect(ids).not.toContain('platform')
  })

  it('SL-005: Super Admin sees all groups including Platform & System', () => {
    const ids = groupIds('SUPER_ADMIN')
    expect(ids).toContain('platform')
    expect(ids.length).toBe(ADMIN_LANDING.length)
    // 8 groups after B1b added the Insurance group.
    expect(ADMIN_LANDING.length).toBe(8)
    expect(ids).toContain('insurance')
  })

  it('SL-006: every visible card matches the role guard (no forbidden card)', () => {
    for (const role of ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']) {
      for (const g of visibleAdminGroups(role)) {
        for (const c of g.cards) {
          expect(c.roles).toContain(role)
        }
      }
    }
  })

  it('SL-007: Platform group is superAdminOnly with super-only cards', () => {
    const platform = ADMIN_LANDING.find(g => g.id === 'platform')!
    expect(platform.superAdminOnly).toBe(true)
    for (const c of platform.cards) {
      expect(c.roles).toEqual(['SUPER_ADMIN'])
    }
  })

  it('SL-008: Document Branding excludes HR Director (matches A,S guard)', () => {
    const ids = cardIds('HR_DIRECTOR')
    expect(ids).not.toContain('doc-branding')
    expect(cardIds('HR_ADMIN')).toContain('doc-branding')
  })

  it('SL-009: Leave Rules card routes to the Option-A viewer, not /absence/rules', () => {
    const leave = ADMIN_LANDING.flatMap(g => g.cards).find(c => c.id === 'leave-rules')!
    expect(leave.route).toBe('/settings/leave-rules')
  })

  it('SL-010: landing page is wired to the config (not the old hub client)', () => {
    expect(pageSrc).toMatch(/visibleAdminGroups\(role\)/)
    expect(pageSrc).not.toMatch(/SettingsHubClient/)
  })

  it('SL-011: counts come from real DB queries (no demo data)', () => {
    expect(pageSrc).toMatch(/\.from\(leaveRuleSets\)/)
    expect(pageSrc).toMatch(/\.from\(absenceTypes\)/)
    expect(pageSrc).not.toMatch(/2026-0[0-9]-[0-9]{2}/)
  })

  it('SL-012: HR Admin sees the operational config cards (no org master-data duplication)', () => {
    const ids = cardIds('HR_ADMIN')
    // Genuine Administration config remains.
    expect(ids).toEqual(expect.arrayContaining([
      'compliance', 'leave-rules', 'absence-types', 'backdate-policy',
      'employee-numbers', 'delegations',
    ]))
    // Organization workspace is the single owner — Administration only shortcuts in.
    expect(ids).toContain('open-org')
    const openOrg = ADMIN_LANDING.flatMap(g => g.cards).find(c => c.id === 'open-org')!
    expect(openOrg.route).toBe('/master-data')
    // The duplicated org master-data cards must NOT appear under Administration.
    for (const dup of ['departments', 'positions', 'grades', 'jobs', 'legal-ent', 'locations', 'business-units', 'projects', 'work-schedules', 'holidays']) {
      expect(ids).not.toContain(dup)
    }
  })

  // ── B1b — restored HR-Admin-visible items ──────────────────────────────────

  it('SL-013: HR Admin sees Insurance Plans & Insurance Policy (restored)', () => {
    const ids = cardIds('HR_ADMIN')
    expect(ids).toEqual(expect.arrayContaining(['insurance-plans', 'insurance-policy']))
    const plans = ADMIN_LANDING.flatMap(g => g.cards).find(c => c.id === 'insurance-plans')!
    const pol   = ADMIN_LANDING.flatMap(g => g.cards).find(c => c.id === 'insurance-policy')!
    expect(plans.route).toBe('/settings/insurance-plans')
    expect(pol.route).toBe('/settings/insurance-policy')
    expect(plans.roles).toEqual(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    expect(pol.roles).toEqual(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  })

  it('SL-014: HR Admin sees Company Currency Setup (restored)', () => {
    expect(cardIds('HR_ADMIN')).toContain('currency')
    const cur = ADMIN_LANDING.flatMap(g => g.cards).find(c => c.id === 'currency')!
    expect(cur.route).toBe('/settings/currency-setup')
    expect(cur.roles).toEqual(expect.arrayContaining(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']))
  })

  it('SL-015: HR Admin is NOT exposed to payroll run / pay-component items', () => {
    const ids = cardIds('HR_ADMIN')
    for (const forbidden of ['payroll-runs', 'pay-components', 'salary-elements', 'wps']) {
      expect(ids).not.toContain(forbidden)
    }
  })

  it('SL-016: Appearance restored for HR Director, hidden from HR Admin (matches guard)', () => {
    expect(cardIds('HR_DIRECTOR')).toContain('appearance')
    expect(cardIds('HR_ADMIN')).not.toContain('appearance')
    const app = ADMIN_LANDING.flatMap(g => g.cards).find(c => c.id === 'appearance')!
    expect(app.roles).toEqual(['HR_DIRECTOR', 'SUPER_ADMIN'])
  })

  it('SL-017: super-admin-only platform items stay hidden from HR Admin', () => {
    const ids = cardIds('HR_ADMIN')
    for (const f of ['feature-permissions', 'permissions', 'ai-agent', 'branding', 'integrations', 'api-webhooks']) {
      expect(ids).not.toContain(f)
    }
  })
})
