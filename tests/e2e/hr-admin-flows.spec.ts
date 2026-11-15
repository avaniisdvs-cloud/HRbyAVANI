import { expect, test } from '@playwright/test'

/**
 * HR Admin E2E flows — AGENT-6A
 *
 * E2E-ADMIN-001  Sign-in page renders
 * E2E-ADMIN-002  Sign-in with valid credentials
 * E2E-ADMIN-003  Sign-in with invalid credentials
 * E2E-ADMIN-004  Dashboard loads after login
 * E2E-ADMIN-005  Navigate to MDM (master-data)
 * E2E-ADMIN-006  Persons list page
 *
 * Credentials: demo accounts baked into the Login page DEV_ACCOUNTS list
 *   HR Admin  → hr.admin@avaniis.dev / demo
 */

const HR_ADMIN_EMAIL    = 'hr.admin@avaniis.dev'
const HR_ADMIN_PASSWORD = 'demo'

// ── Shared helper ─────────────────────────────────────────────────────────────

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/sign-in', { timeout: 10_000 })
  await page.getByPlaceholder(/you@avaniis.example/i).fill(HR_ADMIN_EMAIL)
  await page.getByPlaceholder(/password/i).fill(HR_ADMIN_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  // Accept any authenticated landing page
  await page.waitForURL(/\/(dashboard|persons|org-chart|master-data|users|workflows|settings)/, {
    timeout: 15_000,
  })
}

// ── E2E-ADMIN-001: Sign-in page renders ──────────────────────────────────────

test('E2E-ADMIN-001: sign-in page renders', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 10_000 })

  // The page title or heading should mention AVANIIS HR
  const titleOrHeading = page.getByText(/AVANIIS HR|Welcome back|Sign In/i).first()
  await expect(titleOrHeading).toBeVisible({ timeout: 10_000 })

  // Email input
  await expect(page.getByPlaceholder(/you@avaniis.example/i)).toBeVisible()

  // Password input (label or placeholder)
  await expect(page.getByPlaceholder(/password/i)).toBeVisible()
})

// ── E2E-ADMIN-002: Sign-in with valid credentials ────────────────────────────

test('E2E-ADMIN-002: sign-in with valid credentials redirects', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 10_000 })

  await page.getByPlaceholder(/you@avaniis.example/i).fill(HR_ADMIN_EMAIL)
  await page.getByPlaceholder(/password/i).fill(HR_ADMIN_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()

  // Should navigate away from /sign-in to a protected page
  await page.waitForURL(/\/(dashboard|persons|org-chart|master-data|users|workflows|settings)/, {
    timeout: 15_000,
  })

  // URL must no longer be /sign-in
  expect(page.url()).not.toContain('/sign-in')

  // No generic error message on screen
  await expect(page.getByText(/invalid.*credentials|wrong.*password|incorrect.*password/i)).not.toBeVisible()
})

// ── E2E-ADMIN-003: Sign-in with invalid credentials ──────────────────────────

test('E2E-ADMIN-003: sign-in with invalid credentials shows error', async ({ page }) => {
  await page.goto('/sign-in', { timeout: 10_000 })

  await page.getByPlaceholder(/you@avaniis.example/i).fill('invalid@example.com')
  await page.getByPlaceholder(/password/i).fill('wrongpassword123')
  await page.getByRole('button', { name: /^sign in$/i }).click()

  // Should stay on sign-in (or return to it)
  // Give it a moment for the error to appear
  await page.waitForTimeout(3_000)

  // Either stayed on /sign-in or an error is visible
  const stayedOnSignIn = page.url().includes('/sign-in')
  const errorLocator = page.getByText(
    /invalid|incorrect|wrong|not found|error|failed|unauthorized|credentials/i,
  ).first()

  if (stayedOnSignIn) {
    // Verify an error is shown
    await expect(errorLocator).toBeVisible({ timeout: 8_000 })
  } else {
    // If redirected, it must be back to /sign-in
    expect(page.url()).toContain('/sign-in')
  }
})

// ── E2E-ADMIN-004: Dashboard loads after login ───────────────────────────────

test('E2E-ADMIN-004: dashboard renders after login', async ({ page }) => {
  await signIn(page)

  // Navigate explicitly to /dashboard
  await page.goto('/dashboard', { timeout: 10_000 })

  // Either renders the dashboard or redirects to another auth page
  // (some apps redirect dashboard→ home landing — just confirm no error page)
  const is500 = await page.locator('text=500').isVisible().catch(() => false)
  expect(is500).toBe(false)

  // Navigation / sidebar should be present (nav element or aside)
  const navOrSidebar = page.locator('nav, aside, [role="navigation"]').first()
  await expect(navOrSidebar).toBeVisible({ timeout: 10_000 })
})

// ── E2E-ADMIN-005: Navigate to MDM (master-data) ─────────────────────────────

test('E2E-ADMIN-005: master-data page loads without error', async ({ page }) => {
  await signIn(page)

  await page.goto('/master-data', { timeout: 10_000 })

  // Should not be a hard error page
  const is500 = await page.locator('text=500').isVisible().catch(() => false)
  expect(is500).toBe(false)

  // Page should have rendered some content (heading, list, or card)
  const content = page.locator('h1, h2, h3, [role="heading"], table, ul, [class*="card"]').first()
  await expect(content).toBeVisible({ timeout: 10_000 })
})

// ── E2E-ADMIN-006: Persons list page ─────────────────────────────────────────

test('E2E-ADMIN-006: persons list page renders with table or list', async ({ page }) => {
  await signIn(page)

  await page.goto('/persons', { timeout: 10_000 })

  // Should not 500
  const is500 = await page.locator('text=500').isVisible().catch(() => false)
  expect(is500).toBe(false)

  // Table, list, or heading confirming the page rendered
  const tableOrList = page
    .locator('table, [role="table"], [role="list"], [role="grid"], tbody')
    .first()

  // Also accept a heading as a fallback (empty state is still a rendered page)
  const heading = page.locator('h1, h2').first()

  const tableVisible  = await tableOrList.isVisible().catch(() => false)
  const headingVisible = await heading.isVisible().catch(() => false)

  expect(tableVisible || headingVisible).toBe(true)
})
