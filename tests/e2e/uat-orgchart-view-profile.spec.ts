/**
 * UAT (DEPLOYED) — Manager Org Chart → View Profile.
 * Runs against http://localhost:3001 (NOT localhost).
 * Signs in with dev credentials (ENABLE_DEV_ACCOUNTS active on UAT).
 *
 * Proves on the deployed build (dpl_AdXsL4 / commit 1c85c73):
 *   - the real three-dot → View Profile click navigates to /persons/<id> (not /employees/)
 *   - the destination renders for John, Aisha, Nour (no 404 "could not be found")
 */
import { test, expect, type Page } from '@playwright/test'

const UAT = 'http://localhost:3001'
const JOHN  = 'dddd0001-0000-0000-0000-000000000003'
const AISHA = 'dddd0001-0000-0000-0000-000000000006'
const NOUR  = 'dddd0001-0000-0000-0000-000000000008'

// NOTE: UAT restricts password login to SUPER_ADMIN ("Password login is
// restricted to Super Admin accounts only" + dev manager login disabled).
// We log in as SUPER_ADMIN to exercise the DEPLOYED build's View Profile route.
// This proves the headline 404 (wrong /employees route) is fixed in production.
// Manager direct-report SCOPE is validated on localhost (same deployed commit)
// and must be confirmed by the user via their Microsoft SSO manager session.
async function loginSuperAdmin(page: Page) {
  await page.goto(`${UAT}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').fill('super.admin@avaniis.dev')
  await page.locator('#login-password').fill('demo')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/sign-in'), { timeout: 30_000 })
}

test.use({ baseURL: UAT })
test.describe.configure({ mode: 'serial' })

// ── Real click: capture the generated View Profile URL ──────────────────────
test('UAT-001: three-dot → View Profile navigates to /persons/<id> (not /employees/)', async ({ page }) => {
  await loginSuperAdmin(page)
  await page.goto(`${UAT}/org-chart`, { waitUntil: 'domcontentloaded' })

  // Wait for an occupied node's three-dot ("Actions") button to appear.
  const actions = page.getByRole('button', { name: 'Actions' }).first()
  await expect(actions).toBeVisible({ timeout: 30_000 })
  await actions.click()

  // Action panel → View Profile
  const viewProfile = page.getByText('View Profile', { exact: true }).first()
  await expect(viewProfile).toBeVisible({ timeout: 10_000 })
  await viewProfile.click()

  await page.waitForURL(/\/persons\//, { timeout: 15_000 })
  const url = new URL(page.url())
  console.log('CLICKED VIEW PROFILE URL =', url.pathname)
  expect(url.pathname).toMatch(/^\/persons\/[0-9a-f-]{36}$/i)
  expect(url.pathname).not.toContain('/employees/')
  // Destination must render (not Next.js notFound)
  await expect(page.getByText(/This page could not be found/i)).toHaveCount(0)
})

// ── Direct destination render for the 3 named reports ───────────────────────
for (const [label, id, num] of [
  ['John Smith',           JOHN,  'AVN-T000003'],
  ['Aisha Binti Abdullah', AISHA, 'AVN-T000006'],
  ['Nour Al Hashimi',      NOUR,  'AVN-T000008'],
] as const) {
  test(`UAT-002 [${num}]: /persons/<${label}> renders on UAT (no 404)`, async ({ page }) => {
    await loginSuperAdmin(page)
    const resp = await page.goto(`${UAT}/persons/${id}`, { waitUntil: 'domcontentloaded' })
    console.log(`${num} status =`, resp?.status())
    await expect(page).toHaveURL(new RegExp(`/persons/${id}`), { timeout: 15_000 })
    await expect(page.locator('body')).toContainText(num, { timeout: 12_000 })
    await expect(page.getByText(/This page could not be found/i)).toHaveCount(0)
  })
}

// ── UX: Position Hierarchy hidden, Reporting Manager present ────────────────
test('UAT-003: org chart hides Position Hierarchy, shows Reporting Manager', async ({ page }) => {
  await loginSuperAdmin(page)
  await page.goto(`${UAT}/org-chart`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Reporting Manager').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Position Hierarchy')).toHaveCount(0)
})
