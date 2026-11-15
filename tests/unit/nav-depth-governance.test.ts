/**
 * AVANIIS HCM — Navigation Depth Governance (platform rule: MAX DEPTH = 2)
 *
 * Enforces the platform-wide navigation rule established by the Navigation
 * Simplification Program:
 *
 *     Allowed:      Workspace → Page selector            (depth 2)
 *     Forbidden:    Workspace → Selector → Selector → …  (depth 3+)
 *
 * A section heading (WorkspaceNavGroup / NavGroup / AdminGroup / SettingsCategory)
 * is NOT a navigable step — it renders as a static label or an in-place accordion.
 * The navigable chain is: top-level entry (L1) → leaf page (L2). The real
 * regression risk is a future developer giving a *leaf item* its own nested
 * collection (children / items / cards / subItems), which turns L2 into L3.
 *
 * This suite imports the ACTUAL configs (not regexes of arbitrary source) and:
 *   - computes navigable depth per workspace and asserts <= 2;
 *   - asserts every leaf item across every nav surface is a true leaf;
 *   - adds a TYPE-LEVEL guard so the leaf interfaces can never gain a `children`
 *     / nested `items` field without this test failing at the moment of change.
 *
 * Covers all six nav surfaces:
 *   WORKSPACE_NAV  (HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN rail)
 *   ADMIN_NAV      (MANAGER sidebar)
 *   MANAGER_NAV    (manager nav, shared NavConfig shape)
 *   EMPLOYEE_NAV   (employee nav, shared NavConfig shape)
 *   ADMIN_LANDING  (Administration in-page card grid)
 *   SETTINGS_HUB   (settings breadcrumbs / command palette)
 *
 * Tests: NAVDEPTH-001 .. NAVDEPTH-012
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { WORKSPACE_NAV } from '@/config/workspace-nav'
import { ADMIN_NAV } from '@/config/admin-nav'
import { MANAGER_NAV } from '@/config/manager-nav'
import { EMPLOYEE_NAV } from '@/config/employee-nav'
import { ADMIN_LANDING } from '@/config/admin-landing'
import { SETTINGS_HUB } from '@/config/settings-hub'

const ROOT = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8')

const MAX_DEPTH = 2

// Any key that would represent a *further* navigable nesting level under a leaf.
const COLLECTION_KEYS = ['items', 'children', 'cards', 'subItems', 'nav'] as const

/**
 * The longest chain of nested item-collections rooted at a single leaf item.
 * A pure leaf (route + label, no nested collection) = 1. If an item carries a
 * non-empty nested collection, = 1 + max(child chains). This is what would push
 * navigation past depth 2.
 */
function itemChainDepth(item: unknown): number {
  if (item === null || typeof item !== 'object') return 1
  const rec = item as Record<string, unknown>
  let deepestChild = 0
  for (const key of COLLECTION_KEYS) {
    const coll = rec[key]
    if (Array.isArray(coll) && coll.length > 0) {
      for (const child of coll) {
        deepestChild = Math.max(deepestChild, itemChainDepth(child))
      }
    }
  }
  return 1 + deepestChild
}

/** True when an item is a genuine leaf (carries no nested navigable collection). */
function isLeaf(item: unknown): boolean {
  return itemChainDepth(item) === 1
}

describe('Navigation depth governance (max depth = 2)', () => {
  // ── WORKSPACE_NAV (admin rail) ───────────────────────────────────────────
  it('NAVDEPTH-001: every WORKSPACE_NAV workspace is navigable in <= 2 levels', () => {
    for (const ws of WORKSPACE_NAV) {
      // L1 = the rail workspace entry. The deepest navigable click below it is
      // the longest leaf chain among all its group items. Section-heading groups
      // do not add a navigable level.
      let deepestItem = 0
      for (const group of ws.nav) {
        for (const item of group.items) {
          deepestItem = Math.max(deepestItem, itemChainDepth(item))
        }
      }
      const navigableDepth = 1 + deepestItem
      expect(
        navigableDepth,
        `workspace "${ws.id}" exceeds max nav depth (${navigableDepth} > ${MAX_DEPTH})`,
      ).toBeLessThanOrEqual(MAX_DEPTH)
    }
  })

  it('NAVDEPTH-002: the 12 expected workspaces are all present and depth-compliant', () => {
    const ids = WORKSPACE_NAV.map(w => w.id)
    for (const expected of [
      'overview', 'people', 'org', 'leave', 'payroll', 'workflows',
      'documents', 'reports', 'admin', 'ai', 'dataops', 'migration',
    ]) {
      expect(ids, `missing workspace "${expected}"`).toContain(expected)
    }
  })

  it('NAVDEPTH-002b: the Migration workspace is SUPER_ADMIN-only and never leaks to MANAGER/EMPLOYEE', () => {
    const migration = WORKSPACE_NAV.find(w => w.id === 'migration')
    expect(migration, 'migration workspace must exist').toBeTruthy()
    // It must be flagged SUPER_ADMIN-only in the admin rail …
    expect(migration!.superAdminOnly, 'migration workspace must be superAdminOnly').toBe(true)
    // … and must NOT be duplicated into the MANAGER (ADMIN_NAV) surface.
    const adminNavStr = JSON.stringify(ADMIN_NAV).toLowerCase()
    expect(adminNavStr.includes('/admin/migration')).toBe(false)
    expect(adminNavStr.includes('migration')).toBe(false)
  })

  it('NAVDEPTH-003: every WORKSPACE_NAV item is a true leaf (no nested collection)', () => {
    for (const ws of WORKSPACE_NAV) {
      for (const group of ws.nav) {
        for (const item of group.items) {
          expect(
            isLeaf(item),
            `workspace "${ws.id}" item "${item.id}" has a nested navigable collection — depth-3 violation`,
          ).toBe(true)
        }
      }
    }
  })

  // ── NavConfig surfaces (ADMIN_NAV, MANAGER_NAV, EMPLOYEE_NAV) ─────────────
  const navConfigs: Array<[string, typeof ADMIN_NAV]> = [
    ['ADMIN_NAV', ADMIN_NAV],
    ['MANAGER_NAV', MANAGER_NAV],
    ['EMPLOYEE_NAV', EMPLOYEE_NAV],
  ]

  it('NAVDEPTH-004: every NavConfig group is navigable in <= 2 levels', () => {
    for (const [name, cfg] of navConfigs) {
      for (const group of cfg) {
        let deepestItem = 0
        for (const item of group.items) {
          deepestItem = Math.max(deepestItem, itemChainDepth(item))
        }
        const navigableDepth = 1 + deepestItem // L1 group accordion → L2 item
        expect(
          navigableDepth,
          `${name} group "${group.id}" exceeds max nav depth (${navigableDepth} > ${MAX_DEPTH})`,
        ).toBeLessThanOrEqual(MAX_DEPTH)
      }
    }
  })

  it('NAVDEPTH-005: every NavConfig item is a true leaf (no nested collection)', () => {
    for (const [name, cfg] of navConfigs) {
      for (const group of cfg) {
        for (const item of group.items) {
          expect(
            isLeaf(item),
            `${name} group "${group.id}" item "${item.id}" has a nested collection — depth-3 violation`,
          ).toBe(true)
        }
      }
    }
  })

  // ── ADMIN_LANDING (Administration card grid) ─────────────────────────────
  it('NAVDEPTH-006: every ADMIN_LANDING card is a true leaf (grid is depth 2)', () => {
    for (const group of ADMIN_LANDING) {
      for (const card of group.cards) {
        expect(
          isLeaf(card),
          `ADMIN_LANDING group "${group.id}" card "${card.id}" has a nested collection — depth-3 violation`,
        ).toBe(true)
      }
    }
  })

  // ── SETTINGS_HUB (breadcrumbs / command palette) ─────────────────────────
  it('NAVDEPTH-007: every SETTINGS_HUB item is a true leaf', () => {
    for (const cat of SETTINGS_HUB) {
      for (const item of cat.items) {
        expect(
          isLeaf(item),
          `SETTINGS_HUB category "${cat.id}" item "${item.id}" has a nested collection — depth-3 violation`,
        ).toBe(true)
      }
    }
  })

  // ── Self-test of the depth detector ──────────────────────────────────────
  it('NAVDEPTH-008: itemChainDepth detects a synthetic depth-3 nesting', () => {
    expect(itemChainDepth({ id: 'leaf', route: '/x' })).toBe(1)
    expect(itemChainDepth({ id: 'g', items: [{ id: 'leaf', route: '/x' }] })).toBe(2)
    // A leaf that grew children — the exact regression this suite guards against.
    expect(
      itemChainDepth({ id: 'g', items: [{ id: 'mid', children: [{ id: 'leaf', route: '/x' }] }] }),
    ).toBe(3)
  })

  // ── TYPE-LEVEL guards — fail the instant a leaf interface gains nesting ───
  it('NAVDEPTH-009: WorkspaceItem interface declares no nested collection field', () => {
    const src = read('config/workspace-nav.ts')
    const body = src.slice(
      src.indexOf('export interface WorkspaceItem'),
      src.indexOf('export interface WorkspaceNavGroup'),
    )
    expect(body.length).toBeGreaterThan(0)
    expect(body).not.toMatch(/\bchildren\s*\??:/)
    expect(body).not.toMatch(/\bitems\s*\??:/)
    expect(body).not.toMatch(/\bsubItems\s*\??:/)
  })

  it('NAVDEPTH-010: NavItem interface declares no nested collection field', () => {
    const src = read('config/admin-nav.ts')
    const body = src.slice(
      src.indexOf('export interface NavItem'),
      src.indexOf('export interface NavGroup'),
    )
    expect(body.length).toBeGreaterThan(0)
    expect(body).not.toMatch(/\bchildren\s*\??:/)
    expect(body).not.toMatch(/\bitems\s*\??:/)
    expect(body).not.toMatch(/\bsubItems\s*\??:/)
  })

  it('NAVDEPTH-011: AdminCard interface declares no nested collection field', () => {
    const src = read('config/admin-landing.ts')
    const body = src.slice(
      src.indexOf('export interface AdminCard'),
      src.indexOf('export interface AdminGroup'),
    )
    expect(body.length).toBeGreaterThan(0)
    expect(body).not.toMatch(/\bchildren\s*\??:/)
    expect(body).not.toMatch(/\bcards\s*\??:/)
    expect(body).not.toMatch(/\bitems\s*\??:/)
  })

  it('NAVDEPTH-012: SettingsItem interface declares no nested collection field', () => {
    const src = read('config/settings-hub.ts')
    const body = src.slice(
      src.indexOf('export interface SettingsItem'),
      src.indexOf('export interface SettingsCategory'),
    )
    expect(body.length).toBeGreaterThan(0)
    expect(body).not.toMatch(/\bchildren\s*\??:/)
    expect(body).not.toMatch(/\bitems\s*\??:/)
    expect(body).not.toMatch(/\bsubItems\s*\??:/)
  })
})
