/**
 * Manager Org Chart actions — View Profile route fix + direct-report scope.
 *
 * View Profile in the org chart now routes to /persons/[id] (was /employees/[id]
 * → 404). The destination getPerson() enforces a UNIFIED direct-report scope
 * (persons.lineManagerId OR current worker_assignments.lineManagerId), so all of
 * Fatima's reports resolve — including Aisha (no worker_assignments row) and
 * John (whose WA manager drifted to Shakeel).
 *
 * Manager: manager@avaniis.dev = Fatima Al Zaabi (dddd…004).
 * Reports (persons.lineManagerId): John AVN-T000003, Aisha AVN-T000006, Nour AVN-T000008.
 * Non-report with data: K001 (Dorababu, d92aaabf…).
 */
import { test, expect } from '@playwright/test'

const JOHN  = 'dddd0001-0000-0000-0000-000000000003' // report, WA mgr drifted
const AISHA = 'dddd0001-0000-0000-0000-000000000006' // report, NO WA row
const NOUR  = 'dddd0001-0000-0000-0000-000000000008' // report, WA mgr = Fatima
const NON_REPORT = 'd92aaabf-333d-4222-b81b-613729e14666' // NOT Fatima's report

test.use({ storageState: 'tests/e2e/auth/manager.json', baseURL: 'http://localhost:3000' })

// ── Org chart page loads (validation #1) ────────────────────────────────────
test('TC-OCA-001: Org chart loads for manager', async ({ page }) => {
  await page.goto('/org-chart')
  await expect(page).toHaveURL(/\/org-chart/, { timeout: 10_000 })
  // Did NOT redirect to /dashboard
  expect(new URL(page.url()).pathname).toContain('/org-chart')
})

// ── View Profile destination resolves for all 3 reports (no 404/notFound) ───
for (const [label, id, num] of [
  ['John Smith',          JOHN,  'AVN-T000003'],
  ['Aisha Binti Abdullah', AISHA, 'AVN-T000006'],
  ['Nour Al Hashimi',     NOUR,  'AVN-T000008'],
] as const) {
  test(`TC-OCA-002 [${num}]: View Profile target /persons/<${label}> renders (not 404)`, async ({ page }) => {
    const resp = await page.goto(`/persons/${id}`)
    // Page must resolve (200) and stay on /persons/<id> — not 404, not /dashboard
    expect(resp?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(new RegExp(`/persons/${id}`), { timeout: 10_000 })
    // Profile content present, no Next.js notFound copy
    await expect(page.locator('body')).toContainText(num, { timeout: 8_000 })
    await expect(page.getByText(/This page could not be found|404/i)).toHaveCount(0)
  })
}

// ── Scope enforced: non-report is blocked (validation #11) ──────────────────
test('TC-OCA-003: Manager blocked from /persons/<non-report> (scope enforced)', async ({ page }) => {
  await page.goto(`/persons/${NON_REPORT}`)
  await page.waitForLoadState('domcontentloaded')
  const body = (await page.locator('body').textContent()) ?? ''
  // getPerson throws FORBIDDEN → notFound() → "could not be found"; must NOT show K001 data
  const blocked =
    /could not be found|404|not found|not in your team/i.test(body) ||
    !body.includes('K001')
  expect(blocked).toBe(true)
})

// ── No new tab: org chart uses same-tab navigation only ─────────────────────
test('TC-OCA-004: Org chart page exposes no target=_blank links', async ({ page }) => {
  await page.goto('/org-chart')
  await page.waitForLoadState('domcontentloaded')
  const blankLinks = await page.locator('a[target="_blank"]').count()
  expect(blankLinks).toBe(0)
})
