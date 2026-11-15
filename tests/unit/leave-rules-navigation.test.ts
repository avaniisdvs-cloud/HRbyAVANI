/**
 * AVANIIS HCM — Leave Rules Navigation & RBAC Tests (Option A fix)
 *
 * Verifies the low-risk Leave Rules navigation/RBAC fix:
 *  - the "Leave & Time → Leave Rules" nav item points to the HR-Admin-safe
 *    viewer (/settings/leave-rules), not the editor (/absence/rules);
 *  - the "Edit rules" button is only rendered for editors (HR_DIRECTOR/SUPER_ADMIN);
 *  - the /absence/rules guard redirects non-editors to /settings/leave-rules
 *    (same route group) — never /me or /dashboard.
 *
 * Source-inspection only (fs.readFileSync) — no module imports, no DB.
 *
 * Tests:
 *   LRN-001: workspace-nav Leave Rules item routes to /settings/leave-rules
 *   LRN-002: workspace-nav Leave Rules item no longer routes to /absence/rules
 *   LRN-003: settings/leave-rules computes a canEdit flag for HR_DIRECTOR/SUPER_ADMIN
 *   LRN-004: "Edit rules" button is gated behind canEdit
 *   LRN-005: settings/leave-rules viewer still permits HR_ADMIN to view
 *   LRN-006: /absence/rules editor guard stays restricted to HR_DIRECTOR/SUPER_ADMIN
 *   LRN-007: /absence/rules non-editor redirect target is /settings/leave-rules (not /me, not /dashboard)
 */

import { describe, it, expect } from 'vitest'
import fs   from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

const navSrc      = fs.readFileSync(path.join(ROOT, 'config/workspace-nav.ts'),                          'utf-8')
const viewerSrc   = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/settings/leave-rules/page.tsx'),      'utf-8')
const editorSrc   = fs.readFileSync(path.join(ROOT, 'app/(hr-admin)/absence/rules/page.tsx'),             'utf-8')


describe('Leave Rules navigation & RBAC (Option A)', () => {
  it('LRN-001: Leave Rules is no longer a Leave & Time workspace nav item (C2-R1)', () => {
    // C2-R1 moved Leave Rules out of the operational workspace into Administration.
    // (The landing routes Leave Rules to /settings/leave-rules — see SL-009.)
    expect(navSrc).not.toMatch(/id: 'leave-rules'/)
    expect(navSrc).not.toMatch(/route: '\/settings\/leave-rules'/)
  })

  it('LRN-002: workspace nav no longer references the /absence/rules editor', () => {
    expect(navSrc).not.toMatch(/'\/absence\/rules'/)
  })

  it('LRN-003: viewer computes canEdit for HR_DIRECTOR/SUPER_ADMIN only', () => {
    expect(viewerSrc).toMatch(/const canEdit\s*=\s*\['HR_DIRECTOR',\s*'SUPER_ADMIN'\]\.includes\(session\.user\.role\)/)
  })

  it('LRN-004: "Edit rules" button is gated behind canEdit', () => {
    // The gated block must wrap the /absence/rules link + Edit rules button.
    // i18n: button label is now single-language-per-locale; assert the gated
    // link + Button with the localized 'Edit rules' EN branch.
    expect(viewerSrc).toMatch(
      /\{canEdit && \(\s*<Link href="\/absence\/rules">\s*<Button[^>]*>\s*\{locale === 'ar' \? '[^']*' : 'Edit rules'\}\s*<\/Button>\s*<\/Link>\s*\)\}/,
    )
  })

  it('LRN-005: viewer still permits HR_ADMIN to view', () => {
    expect(viewerSrc).toMatch(/const allowed = \['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'\]/)
  })

  it('LRN-006: editor guard stays restricted to HR_DIRECTOR/SUPER_ADMIN', () => {
    expect(editorSrc).toMatch(/const allowed = \['HR_DIRECTOR', 'SUPER_ADMIN'\]/)
  })

  it('LRN-007: editor redirects non-editors to /settings/leave-rules (not /me, not /dashboard)', () => {
    expect(editorSrc).toMatch(/if \(!allowed\.includes\(session\.user\.role\)\) redirect\('\/settings\/leave-rules'\)/)
    // Ensure the old cross-group redirect targets are gone from the guard.
    expect(editorSrc).not.toMatch(/redirect\('\/me'\)/)
  })
})
