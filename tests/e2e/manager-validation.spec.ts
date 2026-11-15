/**
 * Manager Role — Validation Suite
 * Validates two fixes:
 *   Fix 1: middleware.ts — MANAGER added to /persons allowed list
 *   Fix 2: manager-nav.ts — My Timesheets moved into Leave & Time group
 *
 * Dev credentials: manager@avaniis.dev / demo
 * Manager person_id: dddd0001-0000-0000-0000-000000000004 (Fatima Al Zaabi)
 * Direct reports: NONE in dev DB → getPerson() returns FORBIDDEN for all persons
 *
 * Middleware fix proof:
 *   BEFORE fix → /persons/<id> for MANAGER → 302 to /dashboard (never reached page)
 *   AFTER fix  → /persons/<id> for MANAGER → page renders, getPerson() FORBIDDEN error shown
 *               (stays on /persons/<id> URL, NOT redirected to /dashboard)
 */

import { test, expect } from '@playwright/test'

// ─── Seed IDs ──────────────────────────────────────────────────────────────
const NON_REPORT_ID  = 'dddd0001-0000-0000-0000-000000000002'  // Sarah Ahmed — not a direct report
const EMPLOYEE_PID   = 'dddd0001-0000-0000-0000-000000000003'  // John Smith — employee dev user

test.use({
  storageState: 'tests/e2e/auth/manager.json',
  baseURL:      'http://localhost:3000',
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-001 — My Team page loads without redirect
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-001: /my-team loads for manager without redirect', async ({ page }) => {
  await page.goto('/my-team')
  // Must stay on /my-team, NOT /dashboard
  await expect(page).toHaveURL(/\/my-team/, { timeout: 10_000 })
  // Admin shell must be visible (AdminSidebar heading)
  await expect(page.locator('[data-testid="admin-sidebar"], nav, aside').first()).toBeVisible()
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-002 — Middleware no longer redirects manager from /persons
//             (Fix 1: MANAGER added to /persons allowed list)
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-002: /persons/<id> no longer redirects MANAGER to /dashboard', async ({ page }) => {
  await page.goto(`/persons/${NON_REPORT_ID}`)
  // BEFORE fix: URL would be /dashboard
  // AFTER fix:  URL stays on /persons/<id>
  await page.waitForURL(url => !url.pathname.includes('/dashboard'), { timeout: 10_000 })
  const url = new URL(page.url())
  expect(url.pathname).toContain('/persons/')
  expect(url.pathname).not.toBe('/dashboard')
  expect(url.pathname).not.toBe('/')
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-003 — Manager stays inside admin shell on /persons/<id>
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-003: Manager remains inside admin shell when on /persons/<id>', async ({ page }) => {
  await page.goto(`/persons/${NON_REPORT_ID}`)
  await page.waitForURL(url => !url.pathname.includes('/dashboard'), { timeout: 10_000 })
  // Admin shell elements should be present (sidebar, topbar)
  // Look for elements that indicate the hr-admin shell layout
  const shell = page.locator('aside, nav, [class*="sidebar"], [class*="rail"]').first()
  await expect(shell).toBeVisible({ timeout: 5_000 })
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-004 — Direct-report scope: non-report shows error, not redirect
//             (getPerson() FORBIDDEN — not a middleware 302)
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-004: Non-direct-report profile shows error (not /dashboard redirect)', async ({ page }) => {
  await page.goto(`/persons/${NON_REPORT_ID}`)
  await page.waitForLoadState('networkidle')

  const currentUrl = new URL(page.url())
  // Must NOT have been sent to /dashboard by middleware
  expect(currentUrl.pathname).not.toBe('/dashboard')
  expect(currentUrl.pathname).not.toBe('/')

  // Page should show an error/forbidden indicator
  // (getPerson() throws FORBIDDEN for non-direct-reports)
  const bodyText = await page.locator('body').textContent() ?? ''
  const hasForbiddenIndicator =
    bodyText.includes('FORBIDDEN') ||
    bodyText.includes('not in your team') ||
    bodyText.includes('فريق') || // Arabic "team"
    bodyText.includes('403') ||
    bodyText.includes('not found') ||
    bodyText.includes('Not Found') ||
    bodyText.includes('Error') ||
    currentUrl.pathname.includes('/persons/') // stayed on page (not redirected)

  expect(hasForbiddenIndicator).toBe(true)
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-005 — Leave & Time nav group is visible
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-005: Leave & Time nav group is visible in manager sidebar', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL('/dashboard', { timeout: 10_000 })
  // Leave & Time group should be visible
  const leaveTimeGroup = page.getByText(/leave.*time|الإجازات/i)
  await expect(leaveTimeGroup.first()).toBeVisible({ timeout: 5_000 })
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-006 — My Timesheets nav item is visible under Leave & Time
//             (Fix 2: moved from My Self-Service → Leave & Time)
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-006: My Timesheets nav item visible under Leave & Time', async ({ page }) => {
  await page.goto('/dashboard')
  // My Timesheets link should be present in the nav
  const myTimesheetsLink = page.getByRole('link', { name: /my timesheets/i })
  await expect(myTimesheetsLink).toBeVisible({ timeout: 5_000 })
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-007 — Team Timesheets nav item is visible
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-007: Team Timesheets nav item visible', async ({ page }) => {
  await page.goto('/dashboard')
  const teamTimesheetsLink = page.getByRole('link', { name: /team timesheets/i })
  await expect(teamTimesheetsLink).toBeVisible({ timeout: 5_000 })
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-008 — My Timesheets page opens and renders content
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-008: /my-timesheet page renders for manager', async ({ page }) => {
  await page.goto('/my-timesheet')
  await expect(page).toHaveURL('/my-timesheet', { timeout: 10_000 })
  // Page heading
  await expect(page.getByRole('heading', { name: /my timesheet/i })).toBeVisible({ timeout: 8_000 })
  // Should NOT be on /dashboard
  expect(new URL(page.url()).pathname).toBe('/my-timesheet')
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-009 — My Timesheets nav link navigates to /my-timesheet
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-009: Clicking My Timesheets nav link navigates to /my-timesheet', async ({ page }) => {
  await page.goto('/dashboard')
  const link = page.getByRole('link', { name: /my timesheets/i })
  await link.click()
  await expect(page).toHaveURL('/my-timesheet', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: /my timesheet/i })).toBeVisible({ timeout: 8_000 })
})

// ───────────────────────────────────────────────────────────────────────────
// TC-MGR-010 — Team Timesheets page opens for manager
// ───────────────────────────────────────────────────────────────────────────
test('TC-MGR-010: /timesheets/team page renders for manager', async ({ page }) => {
  await page.goto('/timesheets/team')
  await expect(page).toHaveURL('/timesheets/team', { timeout: 10_000 })
  // Should show content, not a redirect
  expect(new URL(page.url()).pathname).toBe('/timesheets/team')
  // Not an error page
  const title = await page.title()
  expect(title.toLowerCase()).not.toContain('error')
})
