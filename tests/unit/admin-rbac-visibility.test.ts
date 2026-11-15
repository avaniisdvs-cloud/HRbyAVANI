/**
 * AVANIIS HCM — Administration RBAC Visibility Tests (Option B)
 *
 * Verifies SUPER_ADMIN-only platform/system items are hidden from HR_ADMIN and
 * HR_DIRECTOR across the settings hub cards, the settings sidebar, and the
 * workspace secondary nav — AND that the underlying pages are guarded at the
 * route level (defense-in-depth, not menu hiding only). SUPER_ADMIN keeps full
 * visibility. HR-operational items remain ungated.
 *
 * Source-inspection only (fs.readFileSync) — no module imports, no DB.
 *
 * Tests:
 *   RBAC-V-001: settings-hub marks branding/ai-agent/permissions/feature-access/integrations/api-webhooks superAdminOnly
 *   RBAC-V-002: settings-hub leaves HR-operational items ungated (leave-rules, compliance, absence-types, delegations)
 *   RBAC-V-003: REMOVED — pinned dead SettingsHubClient.tsx (coverage now in RBAC-V-001/004)
 *   RBAC-V-004: settings/page passes isSuperAdmin to the hub
 *   RBAC-V-005: REMOVED — pinned dead SettingsNav.tsx (coverage now in RBAC-V-001/009/010/011)
 *   RBAC-V-006: workspace-nav Feature Permissions item is superAdminOnly; WorkspaceItem type supports the flag
 *   RBAC-V-007: WorkspaceSecondaryNav filters superAdminOnly items for non-SUPER_ADMIN
 *   RBAC-V-008: feature-permissions page guard is SUPER_ADMIN only
 *   RBAC-V-009: settings/permissions page guard is SUPER_ADMIN only
 *   RBAC-V-010: settings/ai-agent page guard is SUPER_ADMIN only
 *   RBAC-V-011: settings/branding page guard is SUPER_ADMIN only
 *   RBAC-V-012: hardened guards no longer admit HR_ADMIN/HR_DIRECTOR via an allow-list
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8')

const hubCfg     = read('config/settings-hub.ts')
const settingsPg = read('app/(hr-admin)/settings/page.tsx')
const wsNav      = read('config/workspace-nav.ts')
const wsSecondary= read('components/layout/WorkspaceSecondaryNav.tsx')
const gFeature   = read('app/(hr-admin)/access/feature-permissions/page.tsx')
const gPerms     = read('app/(hr-admin)/settings/permissions/page.tsx')
const gAria      = read('app/(hr-admin)/settings/ai-agent/page.tsx')
const gBrand     = read('app/(hr-admin)/settings/branding/page.tsx')

// Helper: the settings-hub line for a given item id.
const hubLine = (id: string) => hubCfg.split('\n').find(l => l.includes(`id: '${id}'`)) ?? ''

describe('Administration RBAC visibility (Option B)', () => {
  it('RBAC-V-001: super-admin-only hub items are flagged', () => {
    for (const id of ['branding', 'ai-agent', 'permissions', 'feature-access', 'integrations', 'api-webhooks']) {
      expect(hubLine(id)).toMatch(/superAdminOnly:\s*true/)
    }
  })

  it('RBAC-V-002: HR-operational hub items stay ungated', () => {
    for (const id of ['leave-rules', 'compliance', 'absence-types', 'delegations']) {
      expect(hubLine(id)).not.toMatch(/superAdminOnly/)
    }
  })

  // RBAC-V-003 removed — it pinned the internal logic of SettingsHubClient.tsx,
  // a dead component deleted during the navigation closure sprint. Its RBAC
  // coverage is fully provided by the live config in RBAC-V-001/002 and by the
  // role-aware landing in RBAC-V-004 / settings-landing.test.ts (SL-001..017).

  it('RBAC-V-004: settings landing page is role-aware (Option C1)', () => {
    // C1 replaced the flat hub client with the role-filtered grouped landing.
    // The page derives the session role and filters groups/cards via the config.
    expect(settingsPg).toMatch(/const role = session\.user\.role/)
    expect(settingsPg).toMatch(/visibleAdminGroups\(role\)/)
  })

  // RBAC-V-005 removed — it pinned the contents of SettingsNav.tsx, the nested
  // settings sidebar deleted during the navigation closure sprint (the 2-level
  // rule forbids that nested nav). SUPER_ADMIN gating of branding/ai-agent/
  // permissions is enforced by the live config (RBAC-V-001) and by the page
  // guards (RBAC-V-009/010/011).

  it('RBAC-V-006: workspace-nav Feature Permissions is superAdminOnly', () => {
    expect(wsNav).toMatch(/superAdminOnly\?:\s*boolean/)  // item type supports the flag
    const fp = wsNav.split('\n').find(l => l.includes("id: 'feature-permissions'")) ?? ''
    expect(fp).toMatch(/superAdminOnly:\s*true/)
  })

  it('RBAC-V-007: secondary nav filters superAdminOnly items for non-SUPER_ADMIN', () => {
    expect(wsSecondary).toMatch(/role === 'SUPER_ADMIN' \|\| !item\.superAdminOnly/)
    // It must iterate the filtered list, not the raw group.items.
    expect(wsSecondary).toMatch(/items\.map\(item =>/)
  })

  it('RBAC-V-008: feature-permissions guard is SUPER_ADMIN only', () => {
    expect(gFeature).toMatch(/session\.user\.role !== 'SUPER_ADMIN'\) redirect\(/)
  })

  it('RBAC-V-009: settings/permissions guard is SUPER_ADMIN only', () => {
    expect(gPerms).toMatch(/session\.user\.role !== 'SUPER_ADMIN'\) redirect\('\/settings'\)/)
  })

  it('RBAC-V-010: ai-agent guard is SUPER_ADMIN only', () => {
    expect(gAria).toMatch(/session\.user\.role !== 'SUPER_ADMIN'\) redirect\('\/settings'\)/)
  })

  it('RBAC-V-011: branding guard is SUPER_ADMIN only', () => {
    expect(gBrand).toMatch(/session\.user\.role !== 'SUPER_ADMIN'\) redirect\('\/settings'\)/)
  })

  it('RBAC-V-012: hardened guards no longer admit HR_ADMIN/HR_DIRECTOR', () => {
    for (const g of [gFeature, gPerms, gAria, gBrand]) {
      expect(g).not.toMatch(/\['HR_ADMIN',\s*'HR_DIRECTOR',\s*'SUPER_ADMIN'\]/)
    }
  })
})
