/**
 * AVANIIS HCM — C2-R1 Navigation Rationalization Tests
 *
 * Verifies that Leave & Time (an operational workspace) no longer carries
 * configuration links (Leave Rules / Backdate Policy), while those pages remain
 * owned by Administration (the config landing). No routes/guards/pages changed.
 *
 * Tests: C2R1-001 .. C2R1-006
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'
import { WORKSPACE_NAV } from '@/config/workspace-nav'
import { ADMIN_LANDING } from '@/config/admin-landing'
import { ADMIN_NAV } from '@/config/admin-nav'

const ROOT = path.resolve(__dirname, '../..')
const secondaryNavSrc   = fs.readFileSync(path.join(ROOT, 'components/layout/WorkspaceSecondaryNav.tsx'), 'utf-8')
const settingsLayoutSrc = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/settings/layout.tsx'), 'utf-8')

const leaveWs = WORKSPACE_NAV.find(w => w.id === 'leave')!
const leaveItems = leaveWs.nav.flatMap(g => g.items)
const leaveRoutes = leaveItems.map(i => i.route)
const allWorkspaceRoutes = WORKSPACE_NAV.flatMap(w => w.nav.flatMap(g => g.items.map(i => i.route)))

const landingCards = ADMIN_LANDING.flatMap(g => g.cards)
const leaveTimeGroupCards = ADMIN_LANDING.find(g => g.id === 'leave-time')!.cards

const adminNavRoutes = ADMIN_NAV.flatMap(g => g.items.map(i => i.route))

describe('C2-R1 — Leave configuration removed from operational workspace', () => {
  it('C2R1-001: Leave & Time workspace has no Leave Rules / Backdate Policy links', () => {
    expect(leaveRoutes).not.toContain('/settings/leave-rules')
    expect(leaveRoutes).not.toContain('/absence/backdate-policy')
    expect(leaveItems.map(i => i.id)).not.toContain('leave-rules')
    expect(leaveItems.map(i => i.id)).not.toContain('leave-backdate-policy')
  })

  it('C2R1-002: Leave & Time workspace has no "Configuration" subgroup', () => {
    const labels = leaveWs.nav.map(g => g.label ?? '')
    expect(labels).not.toContain('Configuration')
  })

  it('C2R1-003: Leave & Time shows only operational items', () => {
    expect(leaveItems.map(i => i.id)).toEqual([
      'leave-requests', 'leave-balances', 'leave-calendar', 'timesheets', 'team-timesheets',
    ])
  })

  it('C2R1-004: no workspace anywhere links to the leave config pages', () => {
    // Leave Rules / Backdate Policy are now reachable only via Administration.
    expect(allWorkspaceRoutes).not.toContain('/settings/leave-rules')
    expect(allWorkspaceRoutes).not.toContain('/absence/backdate-policy')
  })

  it('C2R1-005: Administration landing still owns Leave Rules & Backdate Policy', () => {
    const leaveRules = landingCards.find(c => c.id === 'leave-rules')
    const backdate   = landingCards.find(c => c.id === 'backdate-policy')
    expect(leaveRules?.route).toBe('/settings/leave-rules')
    expect(backdate?.route).toBe('/absence/backdate-policy')
    // Both live in the Administration "Leave & Time" group.
    expect(leaveTimeGroupCards.map(c => c.id)).toEqual(expect.arrayContaining(['leave-rules', 'backdate-policy']))
  })

  it('C2R1-006: HR Admin can still reach Leave Rules from Administration', () => {
    const leaveRules = leaveTimeGroupCards.find(c => c.id === 'leave-rules')!
    expect(leaveRules.roles).toContain('HR_ADMIN')
  })

  it('C2R1-007: admin-nav.ts no longer carries the orphan Backdate Policy item', () => {
    expect(adminNavRoutes).not.toContain('/absence/backdate-policy')
    const flat = JSON.stringify(ADMIN_NAV)
    expect(flat).not.toContain('leave-backdate-policy')
    expect(flat).not.toContain('Backdate Policy')
  })

  it('C2R1-008: temporary runtime build marker removed (Phase A)', () => {
    expect(secondaryNavSrc).not.toMatch(/data-nav-build/)
    expect(secondaryNavSrc).not.toMatch(/c2r1-03e6b43/)
  })

  it('C2R1-009: settings layout has no nested SettingsNav sidebar (2-level rule)', () => {
    // Administration → HR Configuration landing → detail page (depth 2).
    // No import of and no render of the SettingsNav sidebar component.
    expect(settingsLayoutSrc).not.toMatch(/import\s*\{\s*SettingsNav/)
    expect(settingsLayoutSrc).not.toMatch(/<SettingsNav/)
    // The per-page header/breadcrumb shell is retained (not a nav column).
    expect(settingsLayoutSrc).toMatch(/SettingsDetailShell/)
  })
})
