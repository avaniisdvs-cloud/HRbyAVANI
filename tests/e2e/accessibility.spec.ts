/**
 * Accessibility E2E Tests — NFR-17 (WCAG 2.1 AA)
 *
 * Runs axe-core against live pages via Playwright.
 * Requires a running dev server: pnpm dev
 *
 * Run: npx playwright test tests/e2e/accessibility.spec.ts
 *
 * NOTE: These tests require authentication. The dev server must be running
 * and the DEV_ADMIN_EMAIL credentials provider must be active (NODE_ENV=development).
 * In CI, set up the test database and run with a seeded test user.
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ── Auth helper ─────────────────────────────────────────────────────────────

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/sign-in')
  // Use dev credentials provider
  await page.fill('[name="email"]', 'hr.admin@avaniis.dev')
  await page.fill('[name="password"]', 'demo')
  await page.click('[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 10_000 })
}

// ── WCAG 2.1 AA tests ────────────────────────────────────────────────────────

test.describe('NFR-17 — WCAG 2.1 AA compliance', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('Dashboard page: no WCAG AA violations', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toHaveLength(0)
  })

  test('Persons list page: no WCAG AA violations', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toHaveLength(0)
  })

  test('Absence page: no WCAG AA violations', async ({ page }) => {
    await page.goto('/absence')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toHaveLength(0)
  })

  test('Workflows page: no WCAG AA violations', async ({ page }) => {
    await page.goto('/workflows')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toHaveLength(0)
  })

  test('Settings page: no WCAG AA violations', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toHaveLength(0)
  })

  test('Sign-in page: no WCAG AA violations (unauthenticated)', async ({ page }) => {
    // Sign out first to test the unauthenticated sign-in page
    await page.goto('/sign-out')
    await page.waitForURL('**/sign-in')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toHaveLength(0)
  })
})

// ── RTL layout tests (NFR-14) ────────────────────────────────────────────────

test.describe('NFR-14 — RTL Arabic layout', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('switching to Arabic sets dir=rtl on <html>', async ({ page }) => {
    await page.goto('/dashboard')
    await page.context().addCookies([{ name: 'avaniis_locale', value: 'ar', domain: 'localhost', path: '/' }])
    await page.reload()
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(dir).toBe('rtl')
  })

  test('switching to English sets dir=ltr on <html>', async ({ page }) => {
    await page.goto('/dashboard')
    await page.context().addCookies([{ name: 'avaniis_locale', value: 'en', domain: 'localhost', path: '/' }])
    await page.reload()
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
    expect(dir).toBe('ltr')
  })
})

// ── Multi-browser smoke tests (NFR-19) ───────────────────────────────────────

test.describe('NFR-19 — Multi-browser smoke', () => {
  test('sign-in page renders and accepts input', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
    await expect(page.locator('[type="submit"]')).toBeVisible()
  })

  test('unauthenticated root redirects to /sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/sign-in/)
  })

  test('unauthenticated /dashboard redirects to /sign-in', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/sign-in/)
  })

  test('sign-in page has page title', async ({ page }) => {
    await page.goto('/sign-in')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })
})
