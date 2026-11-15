/**
 * Regression tests — MANAGER leave application defects.
 *
 * Defect 1: Manager → My Profile → Leave tab → "Apply for Leave" redirected the
 *   manager back to /dashboard instead of opening the leave request form.
 *   Root cause: the shared ESS ProfilePageClient pushed to /me/leave, which lives
 *   in the (employee) route group whose layout redirects every admin-shell role
 *   (incl. MANAGER, who renders this component via /my-profile) to /dashboard.
 *   Fix: the button now pushes to the shell-neutral /absence/new request form
 *   with ?scope=self so the personal-profile entry is locked to the logged-in
 *   applicant (self-service), hiding the manager team-member toggle. Team-leave
 *   entry from /absence (no scope param) is unchanged.
 *
 * Defect 2 (companion): the MANAGER Team Leave entry points (/absence, /absence/my)
 *   route to /absence/new, which admits MANAGER and does NOT live in (employee) —
 *   so the manager is never bounced. Locked here so a future nav change cannot
 *   reintroduce a /me/* target for the admin-shell leave flow.
 *
 * Source-inspection tests (no DB / no React render) — consistent with the
 * project's existing nav/source regression suites.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('MANAGER self-leave navigation (Defect 1)', () => {
  const PROFILE = read('app/(employee)/me/ProfilePageClient.tsx')

  it('Apply for Leave routes to the self-scoped /absence/new form', () => {
    expect(PROFILE).toContain("router.push('/absence/new?scope=self')")
  })

  it('no longer pushes the manager into the (employee)-only /me/leave route', () => {
    expect(PROFILE).not.toContain("router.push('/me/leave')")
  })

  it('keeps the "Apply for Leave" label on the Leave tab action', () => {
    expect(PROFILE).toContain('Apply for Leave')
  })
})

describe('Self-service scope locks the applicant to self (Req #3)', () => {
  const PAGE  = read('app/(hr-admin)/absence/new/page.tsx')
  const SHELL = read('app/(hr-admin)/absence/new/LeaveRequestShell.tsx')
  const FORM  = read('app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx')

  it('page reads ?scope=self and threads lockToSelf into the shell', () => {
    expect(PAGE).toContain("sp?.scope === 'self'")
    expect(PAGE).toContain('lockToSelf={lockToSelf}')
  })

  it('self-scope loads self only and never calls the team-scoped picklist', () => {
    // When self-scoped, getLeavePersonOptions (which runs the recursive team CTE
    // for a MANAGER) must be bypassed in favour of the self-only loader.
    expect(PAGE).toMatch(/lockToSelf\s*\?\s*await loadSelf\(\)/)
  })

  it('shell forwards lockToSelf to the form', () => {
    expect(SHELL).toContain('lockToSelf')
    expect(SHELL).toContain('lockToSelf={lockToSelf}')
  })

  it('form locks the person to the logged-in user when self-scoped', () => {
    expect(FORM).toContain('const selfLocked = lockToSelf === true && !!currentPersonId')
    // The self-locked render branch is evaluated before the manager toggle.
    expect(FORM.indexOf('{selfLocked ?')).toBeGreaterThan(-1)
    expect(FORM.indexOf('{selfLocked ?')).toBeLessThan(FORM.indexOf('Apply for team member'))
  })

  it('does NOT change team-leave behaviour (manager toggle still present for non-self entry)', () => {
    // The team-member toggle must remain in the component for the /absence entry.
    // i18n remediation: the label is now single-language-per-locale (no longer the
    // bilingual "English · Arabic" literal), so assert both locale branches exist.
    expect(FORM).toContain('Apply for team member')      // English (en mode)
    expect(FORM).toContain('لأحد أعضاء الفريق')           // Arabic (ar mode)
    expect(FORM).toContain("personMode === 'team_member'")
  })
})

describe('/absence/new is reachable by MANAGER and EMPLOYEE (no bounce)', () => {
  const PAGE = read('app/(hr-admin)/absence/new/page.tsx')
  const HR_LAYOUT = read('app/(hr-admin)/layout.tsx')

  it('the request form page explicitly allows MANAGER and EMPLOYEE', () => {
    expect(PAGE).toMatch(/allowed\s*=\s*\[[^\]]*'MANAGER'[^\]]*\]/)
    expect(PAGE).toMatch(/allowed\s*=\s*\[[^\]]*'EMPLOYEE'[^\]]*\]/)
  })

  it('lives in the (hr-admin) shell, whose layout admits MANAGER and EMPLOYEE', () => {
    expect(HR_LAYOUT).toMatch(/allowed\s*=\s*\[[\s\S]*'MANAGER'[\s\S]*'EMPLOYEE'[\s\S]*\]/)
  })
})
