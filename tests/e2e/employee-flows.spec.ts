import { expect, test } from '@playwright/test'

/**
 * AGENT-6B — Employee Self-Service E2E Flows
 *
 * E2E-EMP-001  Sign-in page renders correctly
 * E2E-EMP-002  Unauthenticated redirect to sign-in
 * E2E-EMP-003  Employee portal access (profile visible, no admin nav)
 * E2E-EMP-004  Leave balance widgets on /me
 * E2E-EMP-005  ARIA floating chat button present and opens chat
 *
 * Credentials: DEV_ACCOUNTS in LoginClient (employee@avaniis.dev / demo)
 * The sign-in form is a client component — wait for hydration before asserting.
 */

// Dev account baked into LoginClient DEV_ACCOUNTS list
const EMPLOYEE_EMAIL    = 'employee@avaniis.dev'
const EMPLOYEE_PASSWORD = 'demo'

// ── Shared helper ─────────────────────────────────────────────────────────────

async function signInAsEmployee(page: import('@playwright/test').Page) {
  await page.goto('/sign-in')
  // LoginClient is a CSR component — wait for the email input to be in DOM
  const emailInput = page.getByPlaceholder(/you@avaniis.example/i)
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 })

  // Fill credentials and click the form submit button.
  // The sign-in page has two buttons matching /sign in/i (SSO + form submit),
  // so target the form submit by type="submit".
  await emailInput.fill(EMPLOYEE_EMAIL)
  await page.getByPlaceholder(/password/i).fill(EMPLOYEE_PASSWORD)

  // handleCredentials → handleSubmit → fetch /api/auth/callback/credentials
  // → session check → window.location.href = '/dashboard'
  // Capture the URL change: Playwright watches all navigations including window.location.
  const navigationPromise = page.waitForURL(
    url => !url.toString().includes('/sign-in'),
    { timeout: 25_000 },
  )
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await navigationPromise
  // EMPLOYEE role hits /dashboard then hr-admin layout bounces them to /me
  if (!page.url().includes('/me')) {
    await page.waitForURL(/\/me/, { timeout: 15_000 })
  }
  await page.waitForLoadState('networkidle')
}

// ── E2E-EMP-001 ───────────────────────────────────────────────────────────────

test('E2E-EMP-001: sign-in page renders correctly', async ({ page }) => {
  await page.goto('/sign-in')

  // Page title includes AVANIIS — title set in metadata, appears immediately
  await expect(page).toHaveTitle(/AVANIIS/i)

  // LoginClient is a CSR component — wait for hydration
  const emailInput = page.getByPlaceholder(/you@avaniis.example/i)
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
  await expect(emailInput).toBeVisible()

  // Password input present
  await expect(page.getByPlaceholder(/password/i)).toBeVisible()

  // Sign In submit button present (type="submit" avoids SSO button ambiguity)
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

// ── E2E-EMP-002 ───────────────────────────────────────────────────────────────

test('E2E-EMP-002: unauthenticated access to /me redirects to sign-in', async ({ page }) => {
  // Navigate directly to the employee self-service root without a session
  await page.goto('/me')
  // The (employee)/layout.tsx calls redirect('/sign-in') when session is absent
  await page.waitForURL(/\/sign-in/, { timeout: 10_000 })
  await expect(page).toHaveURL(/\/sign-in/)
})

test('E2E-EMP-002b: unauthenticated access to /dashboard redirects to sign-in', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForURL(/\/sign-in/, { timeout: 10_000 })
  await expect(page).toHaveURL(/\/sign-in/)
})

// ── E2E-EMP-003 ───────────────────────────────────────────────────────────────

test('E2E-EMP-003: employee portal shows profile and no admin-only nav', async ({ page }) => {
  await signInAsEmployee(page)

  // Employee's own name should appear somewhere in the shell
  // The EmployeeSidebar shows userName in the footer area.
  // emp-test-003 persons row uses firstNameEn/lastNameEn from seed.
  // We assert at least the sidebar nav is present (role="navigation")
  const nav = page.getByRole('navigation', { name: /main navigation/i })
  await expect(nav).toBeVisible()

  // Employee-only nav items should be present
  await expect(nav.getByRole('link', { name: /home/i })).toBeVisible()
  await expect(nav.getByRole('link', { name: /my leave/i })).toBeVisible()

  // Admin-shell items like "Employees" or "Persons" must NOT appear
  await expect(page.getByRole('link', { name: /^employees$/i })).not.toBeVisible()
  await expect(page.getByRole('link', { name: /^persons$/i })).not.toBeVisible()
  await expect(page.getByRole('link', { name: /org chart/i })).not.toBeVisible()
})

// ── E2E-EMP-004 ───────────────────────────────────────────────────────────────

test('E2E-EMP-004: leave balance section is visible on /me', async ({ page }) => {
  await signInAsEmployee(page)

  // The /me page always renders SEED_BALANCES with LeaveBalanceBand.
  // The component renders a heading "Leave balance — <year>"
  await expect(
    page.getByText(/leave balance/i, { exact: false })
  ).toBeVisible({ timeout: 10_000 })

  // Three leave type labels rendered in the band (may appear in multiple places)
  await expect(page.getByText(/annual/i).first()).toBeVisible()
  await expect(page.getByText(/sick/i).first()).toBeVisible()
  await expect(page.getByText(/emergency/i).first()).toBeVisible()

  // Each card shows "/ N days" pattern
  await expect(page.getByText(/\/ \d+ days/i).first()).toBeVisible()
})

// ── E2E-EMP-005 ───────────────────────────────────────────────────────────────

test('E2E-EMP-005: ARIA floating button is present and opens chat interface', async ({ page }) => {
  await signInAsEmployee(page)

  // AriaAuthWidget mounts in the employee layout.
  // The FAB button has aria-label="Open ARIA Assistant"
  const ariaFab = page.getByRole('button', { name: /open aria assistant/i })
  await expect(ariaFab).toBeVisible({ timeout: 10_000 })

  // Click the FAB — the widget should expand and show a chat interface
  await ariaFab.click()

  // After opening, a "Close ARIA" button should appear
  await expect(
    page.getByRole('button', { name: /close aria/i })
  ).toBeVisible({ timeout: 5_000 })
})
