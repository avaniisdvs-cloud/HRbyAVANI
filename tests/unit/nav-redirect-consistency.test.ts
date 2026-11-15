/**
 * AVANIIS HCM — BL-06 (MANAGER nav cleanup) + BL-08 (redirect consistency).
 *
 * BL-06: the SUPER_ADMIN-only "Data Console" (/admin/dataops) orphan was removed
 *        from MANAGER_NAV (it bounced for MANAGER and leaked a super-only route).
 * BL-08: roleHome() helper added to lib/auth.ts; /login redirects corrected to
 *        /sign-in; role-rejection guards send rejected users to roleHome(role)
 *        instead of a hardcoded /me (removes the /me → /dashboard double-hop for
 *        privileged roles). Visibility/UX only — no allow/deny change.
 *
 * Tests: BL06-001..002, BL08-001..005
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { MANAGER_NAV } from '@/config/manager-nav'

const ROOT = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8')

// Recursively collect *.tsx/*.ts under a dir.
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(full)
  }
  return acc
}

describe('BL-06 — MANAGER nav cleanup', () => {
  const allItems = MANAGER_NAV.flatMap(g => g.items)

  it('BL06-001: MANAGER_NAV contains no /admin/dataops item (SUPER-only orphan removed)', () => {
    expect(allItems.some(i => i.route === '/admin/dataops')).toBe(false)
    expect(allItems.some(i => i.id === 'dataops')).toBe(false)
  })

  it('BL06-002: MANAGER_NAV has no "data" group and the source no longer references /admin/dataops', () => {
    expect(MANAGER_NAV.some(g => g.id === 'data')).toBe(false)
    const src = read('config/manager-nav.ts')
    // No actual route entry pointing at the console (a comment mentioning it is fine).
    expect(src).not.toMatch(/route:\s*'\/admin\/dataops'/)
  })

  it('BL06-003: MANAGER keeps its genuine manager-scoped items (no functionality loss)', () => {
    const routes = allItems.map(i => i.route)
    for (const r of ['/dashboard', '/my-team', '/org-chart', '/directory', '/aria']) {
      expect(routes).toContain(r)
    }
  })
})

describe('BL-08 — redirect consistency', () => {
  const authSrc = read('lib/auth.ts')

  it('BL08-001: roleHome() helper exists and maps EMPLOYEE→/me, others→/dashboard', () => {
    expect(authSrc).toMatch(/export function roleHome\(role\??:\s*string\)/)
    // EMPLOYEE → /me ; everything else → /dashboard
    expect(authSrc).toMatch(/role === 'EMPLOYEE'\s*\?\s*'\/me'\s*:\s*'\/dashboard'/)
  })

  it('BL08-002: no redirect(\'/login\') remains anywhere under app/', () => {
    const offenders = walk(path.join(ROOT, 'app'))
      .filter(f => /redirect\(['"]\/login['"]\)/.test(fs.readFileSync(f, 'utf-8')))
      .map(f => path.relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it('BL08-003: ESS + signing pages now redirect unauthenticated users to /sign-in', () => {
    for (const p of [
      'app/(employee)/me/letters/page.tsx',
      'app/(employee)/me/documents/page.tsx',
      'app/(signing)/me/letters/sign/[letterId]/page.tsx',
    ]) {
      expect(read(p)).toMatch(/redirect\('\/sign-in'\)/)
    }
  })

  it('BL08-004: representative hr-admin role-rejection guards use roleHome(), not hardcoded /me', () => {
    for (const p of [
      'app/(hr-admin)/users/page.tsx',
      'app/(hr-admin)/persons/page.tsx',
      'app/(hr-admin)/approvals/page.tsx',
      'app/(hr-admin)/org-chart/page.tsx',
      'app/(hr-admin)/absence/page.tsx',
    ]) {
      const src = read(p)
      expect(src).toMatch(/redirect\(roleHome\(session\.user\.role\)\)/)
      expect(src).toMatch(/import \{ auth, roleHome \}/)
    }
  })

  it('BL08-005: intentional /me redirects are preserved (personId + EMPLOYEE-home), no over-reach', () => {
    // absence/my redirects on missing personId; dashboard sends EMPLOYEE to /me — both correct.
    expect(read('app/(hr-admin)/absence/my/page.tsx')).toMatch(/!session\.user\.personId\) redirect\('\/me'\)/)
    expect(read('app/(hr-admin)/dashboard/page.tsx')).toMatch(/role === 'EMPLOYEE'\) redirect\('\/me'\)/)
  })
})
