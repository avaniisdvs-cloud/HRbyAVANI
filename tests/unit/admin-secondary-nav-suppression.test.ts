/**
 * AVANIIS HCM — Phase B1: Administration 2-level navigation
 *
 * Verifies the Administration workspace collapses to 2 levels:
 *   rail (L1) → HR Configuration landing (L2) → detail page.
 * The intermediate WorkspaceSecondaryNav panel is suppressed for the admin
 * workspace ONLY; all other workspaces keep their secondary nav. RBAC unchanged:
 * Feature Permissions stays Super-Admin-only via the Platform & System group.
 *
 * Tests: PB1-001 .. PB1-006
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'
import { WORKSPACE_NAV } from '@/config/workspace-nav'
import { ADMIN_LANDING, visibleAdminGroups } from '@/config/admin-landing'

const ROOT = path.resolve(__dirname, '../..')
const secondaryNavSrc = fs.readFileSync(path.join(ROOT, 'components/layout/WorkspaceSecondaryNav.tsx'), 'utf-8')
const reportsPageSrc  = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/reports/page.tsx'), 'utf-8')

const adminWs = WORKSPACE_NAV.find(w => w.id === 'admin')!
const firstLiveItem = adminWs.nav.flatMap(g => g.items).find(i => !i.comingSoon)!
const cardIds = (role: string) => visibleAdminGroups(role).flatMap(g => g.cards.map(c => c.id))

describe('Phase B1 — Administration two-level navigation', () => {
  it('PB1-001: secondary nav is suppressed via a SUPPRESS_SECONDARY_NAV set', () => {
    expect(secondaryNavSrc).toMatch(/SUPPRESS_SECONDARY_NAV\.has\(workspace\.id\)\)?\s*return null/)
    expect(secondaryNavSrc).toMatch(/const SUPPRESS_SECONDARY_NAV = new Set\(\[[^\]]*\]\)/)
  })

  it('PB1-007: the suppression set covers admin, ai, reports, documents, dataops', () => {
    const m = secondaryNavSrc.match(/SUPPRESS_SECONDARY_NAV = new Set\(\[([^\]]*)\]\)/)
    expect(m).toBeTruthy()
    const ids = m![1]
    for (const id of ['admin', 'ai', 'reports', 'documents', 'dataops']) {
      expect(ids).toContain(`'${id}'`)
    }
  })

  it('PB1-002: operational/multi-function workspaces are NOT suppressed', () => {
    const m = secondaryNavSrc.match(/SUPPRESS_SECONDARY_NAV = new Set\(\[([^\]]*)\]\)/)
    const ids = m![1]
    for (const id of ['overview', 'people', 'org', 'leave', 'payroll', 'workflows']) {
      expect(ids).not.toContain(`'${id}'`)
    }
  })

  it('PB1-003: Administration rail opens /settings directly (first live item)', () => {
    expect(firstLiveItem.route).toBe('/settings')
  })

  it('PB1-004: Feature Permissions remains available to Super Admin via the landing', () => {
    const platform = ADMIN_LANDING.find(g => g.id === 'platform')!
    const fp = platform.cards.find(c => c.id === 'feature-permissions')!
    expect(fp.route).toBe('/access/feature-permissions')
    expect(fp.roles).toEqual(['SUPER_ADMIN'])
    expect(cardIds('SUPER_ADMIN')).toContain('feature-permissions')
  })

  it('PB1-005: HR Admin & HR Director do NOT see Feature Permissions', () => {
    expect(cardIds('HR_ADMIN')).not.toContain('feature-permissions')
    expect(cardIds('HR_DIRECTOR')).not.toContain('feature-permissions')
  })

  it('PB1-008: /reports left-nav keeps Insurance Reports reachable after suppression', () => {
    // Reports secondary-nav is suppressed; the report left-nav must still expose
    // the Insurance Reports route so no functionality is lost.
    expect(reportsPageSrc).toMatch(/href="\/reports\/insurance"/)
    expect(reportsPageSrc).toMatch(/\['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'\]\.includes\(role\)/)
  })

  it('PB1-006: Workflows keeps its secondary nav (multi-function, not suppressed)', () => {
    // Workflows has 4 distinct functional items (runs, builder, groups, delegations)
    // and is depth-2 compliant — it must NOT be in the suppression set.
    const wf = WORKSPACE_NAV.find(w => w.id === 'workflows')!
    const itemCount = wf.nav.flatMap(g => g.items).length
    expect(itemCount).toBeGreaterThanOrEqual(2)
    const m = secondaryNavSrc.match(/SUPPRESS_SECONDARY_NAV = new Set\(\[([^\]]*)\]\)/)
    expect(m![1]).not.toContain("'workflows'")
  })
})
