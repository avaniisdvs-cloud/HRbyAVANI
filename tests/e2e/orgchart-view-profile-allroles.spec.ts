/**
 * Org Chart → View Profile across ALL roles.
 *
 * The View Profile resolution (unique node id → that node's personId →
 * /persons/<id>?from=org-chart) is ROLE-AGNOSTIC, proven by a real three-dot
 * click for MANAGER (the role whose shared-position bug we fixed). What differs
 * per role is (a) the org chart loads + correct default view, and (b) whether
 * getPerson allows the destination — validated by navigating to the EXACT URL a
 * View Profile click produces. Local; dev sessions.
 *
 *   super-admin → System Administrator (sees all)
 *   hr-admin    → Fatima (HR_ADMIN, entity aaaa0001)
 *   manager     → Fatima (MANAGER, direct reports)
 *   employee    → John Smith (EMPLOYEE, self only)
 */
import { test, expect, type Page } from '@playwright/test'

const BASE = 'http://localhost:3000'
const JOHN  = 'dddd0001-0000-0000-0000-000000000003' // AVN-T000003, entity aaaa0001
const NOUR  = 'dddd0001-0000-0000-0000-000000000008' // AVN-T000008, Fatima's report
const AISHA = 'dddd0001-0000-0000-0000-000000000006' // AVN-T000006

async function orgChartLoads(page: Page) {
  await page.goto('/org-chart')
  await expect(page).toHaveURL(/\/org-chart/, { timeout: 10_000 })
  // A node renders (chart is alive)
  await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 })
}

async function profileRenders(page: Page, id: string, num: string) {
  await page.goto(`/persons/${id}?from=org-chart`)
  await expect(page).toHaveURL(new RegExp(`/persons/${id}`), { timeout: 12_000 })
  await expect(page.locator('body')).toContainText(num, { timeout: 12_000 })
  await expect(page.getByText(/This page could not be found/i)).toHaveCount(0)
  // Back link returns to the org chart
  await expect(page.getByRole('link', { name: '← Organisation Chart' })).toBeVisible({ timeout: 8_000 })
}

async function profileBlocked(page: Page, id: string) {
  await page.goto(`/persons/${id}?from=org-chart`)
  await page.waitForLoadState('domcontentloaded')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(/could not be found|not found|not in your team/i.test(body) || !body.includes('AVN-T')).toBe(true)
}

// ── SUPER_ADMIN — sees everyone ──────────────────────────────────────────────
test.describe('SUPER_ADMIN', () => {
  test.use({ storageState: 'tests/e2e/auth/super-admin.json', baseURL: BASE })
  test('ALLROLE-SA-1: org chart loads', async ({ page }) => { await orgChartLoads(page) })
  test('ALLROLE-SA-2: View Profile destination renders (John)', async ({ page }) => {
    await profileRenders(page, JOHN, 'AVN-T000003')
  })
})

// ── HR_ADMIN — same-entity ───────────────────────────────────────────────────
test.describe('HR_ADMIN', () => {
  test.use({ storageState: 'tests/e2e/auth/hr-admin.json', baseURL: BASE })
  test('ALLROLE-HR-1: org chart loads', async ({ page }) => { await orgChartLoads(page) })
  test('ALLROLE-HR-2: View Profile destination renders same-entity person (John)', async ({ page }) => {
    await profileRenders(page, JOHN, 'AVN-T000003')
  })
})

// ── MANAGER — direct reports (REAL three-dot click) ──────────────────────────
test.describe('MANAGER', () => {
  test.use({ storageState: 'tests/e2e/auth/manager.json', baseURL: BASE })
  test('ALLROLE-MGR-1: org chart loads', async ({ page }) => { await orgChartLoads(page) })

  test('ALLROLE-MGR-2: REAL click View Profile on direct report opens that person (Nour)', async ({ page }) => {
    await orgChartLoads(page)
    await page.getByRole('button', { name: 'Actions' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    const search = page.getByPlaceholder('Search people…')
    await search.click(); await search.fill('Nour'); await page.waitForTimeout(800)
    const result = page.getByText('Nour Al Hashimi', { exact: false }).first()
    if (await result.count()) { await result.click().catch(() => {}); await page.waitForTimeout(600) }
    await search.fill('')
    const card = page.locator('.react-flow__node', { hasText: 'Nour Al Hashimi' }).first()
    await card.waitFor({ state: 'attached', timeout: 15_000 })
    await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: 'Actions' }).click({ force: true })
    await page.getByText('View Profile', { exact: true }).first().click()
    await page.waitForURL(/\/persons\//, { timeout: 15_000 })
    expect(page.url()).toContain(NOUR)
    expect(page.url()).toContain('from=org-chart')
    await expect(page.locator('body')).toContainText('AVN-T000008', { timeout: 12_000 })
  })

  test('ALLROLE-MGR-3: scope — non-report destination is blocked', async ({ page }) => {
    // K001 (Dorababu) is NOT Fatima's report
    await profileBlocked(page, 'd92aaabf-333d-4222-b81b-613729e14666')
  })
})

// ── EMPLOYEE — self only ─────────────────────────────────────────────────────
test.describe('EMPLOYEE', () => {
  test.use({ storageState: 'tests/e2e/auth/employee.json', baseURL: BASE })
  test('ALLROLE-EMP-1: org chart loads', async ({ page }) => { await orgChartLoads(page) })
  test('ALLROLE-EMP-2: REAL click View Profile never hits /persons (colleague card or own profile)', async ({ page }) => {
    await orgChartLoads(page)
    await page.getByRole('button', { name: 'Actions' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: 'Actions' }).first().click({ force: true })
    await page.getByText('View Profile', { exact: true }).first().click()
    // Employee must land on a read-only colleague card OR their own ESS profile —
    // NEVER the blocked /persons admin route (which previously redirected to /me).
    await page.waitForURL(/\/me\/(directory\/|profile)/, { timeout: 15_000 })
    const path = new URL(page.url()).pathname
    expect(path === '/me/profile' || path.startsWith('/me/directory/')).toBe(true)
    expect(path).not.toContain('/persons/')
    await expect(page.getByText(/This page could not be found/i)).toHaveCount(0)
  })
  test('ALLROLE-EMP-3: colleague card shows directory fields, not /persons HR data', async ({ page }) => {
    // Direct nav to the colleague card route (the URL the click produces)
    await page.goto(`/me/directory/${AISHA}?from=org-chart`)
    await expect(page).toHaveURL(new RegExp(`/me/directory/${AISHA}`), { timeout: 12_000 })
    await expect(page.locator('body')).toContainText('Aisha Binti Abdullah', { timeout: 12_000 })
    await expect(page.getByRole('link', { name: '← Organisation Chart' })).toBeVisible()
  })
  test('ALLROLE-EMP-4: own node → own ESS profile; /persons admin route blocked', async ({ page }) => {
    // Employee John viewing himself → /me/profile (colleague card redirects self)
    await page.goto(`/me/directory/${JOHN}`)
    await page.waitForURL(/\/me\/profile/, { timeout: 12_000 })
    // And /persons admin route stays blocked
    await profileBlocked(page, AISHA)
  })
})
