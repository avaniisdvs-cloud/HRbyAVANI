/**
 * Manager Reports — Filter & Security Validation
 *
 * Validates:
 *   Fix: reports/page.tsx + reports/export/route.ts
 *     - MANAGER sees direct-report Employee picker (not Department dropdown)
 *     - Leave Type filter added for leave-summary / leave-balances
 *     - ?person= param enforced server-side against the manager's own team
 *     - CSV export respects the same direct-report scope
 *
 * Dev manager: manager@avaniis.dev / demo → Fatima Al Zaabi
 *   person_id: dddd0001-0000-0000-0000-000000000004
 *   Direct reports (persons.line_manager_id): 3
 *     - Aisha Binti Abdullah  (AVN-T000006)
 *     - John Smith            (AVN-T000003)
 *     - Nour Al Hashimi       (AVN-T000008)
 *   Non-report with leave data: Dorababu Kethari (d92aaabf-...) — 4 entries LR-0000001..4
 */

import { test, expect } from '@playwright/test'

const NON_REPORT_WITH_LEAVE = 'd92aaabf-333d-4222-b81b-613729e14666' // Dorababu — NOT Fatima's report
const LEAKED_REQUEST_NUMBERS = ['LR-0000001', 'LR-0000002', 'LR-0000003', 'LR-0000004']

test.use({
  storageState: 'tests/e2e/auth/manager.json',
  baseURL:      'http://localhost:3000',
})

// ── 1. Leave Summary: Employee dropdown shown, NOT Department ────────────────
test('TC-RPT-001: Leave Summary shows Team Member dropdown, hides Department (manager)', async ({ page }) => {
  await page.goto('/reports?report=leave-summary')
  await expect(page).toHaveURL(/report=leave-summary/, { timeout: 10_000 })

  // Team Member (person) select present
  await expect(page.locator('select[name="person"]')).toBeVisible({ timeout: 8_000 })
  // Department select must NOT be present for manager
  await expect(page.locator('select[name="dept"]')).toHaveCount(0)
})

// ── 2. Employee dropdown contains ONLY direct reports ────────────────────────
test('TC-RPT-002: Team Member dropdown contains only the 3 direct reports', async ({ page }) => {
  await page.goto('/reports?report=leave-summary')
  const options = page.locator('select[name="person"] option')
  // "All direct reports" + 3 reports = 4
  await expect(options).toHaveCount(4, { timeout: 8_000 })

  const texts = (await options.allTextContents()).map(t => t.trim())
  expect(texts.some(t => /All direct reports|أعضاء الفريق/i.test(t))).toBe(true)
  expect(texts.some(t => t.includes('Aisha Binti Abdullah') && t.includes('AVN-T000006'))).toBe(true)
  expect(texts.some(t => t.includes('John Smith')           && t.includes('AVN-T000003'))).toBe(true)
  expect(texts.some(t => t.includes('Nour Al Hashimi')      && t.includes('AVN-T000008'))).toBe(true)
  // Must NOT contain the non-report
  expect(texts.some(t => t.includes('Dorababu') || t.includes('Sarah Ahmed'))).toBe(false)
})

// ── 3. Leave Type dropdown is available ──────────────────────────────────────
test('TC-RPT-003: Leave Type dropdown is present on Leave Summary', async ({ page }) => {
  await page.goto('/reports?report=leave-summary')
  await expect(page.locator('select[name="ltype"]')).toBeVisible({ timeout: 8_000 })
  // Has the "All leave types" option + at least one type
  const count = await page.locator('select[name="ltype"] option').count()
  expect(count).toBeGreaterThan(1)
})

// ── 4. Date range filters available on Leave Summary ─────────────────────────
test('TC-RPT-004: Date range (from/to) filters available on Leave Summary', async ({ page }) => {
  await page.goto('/reports?report=leave-summary')
  await expect(page.locator('input[name="from"]')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('input[name="to"]')).toBeVisible()
})

// ── 5. Report shows only direct-report scope (no cross-team rows) ────────────
test('TC-RPT-005: Leave Summary contains no non-direct-report leave rows', async ({ page }) => {
  await page.goto('/reports?report=leave-summary')
  await page.locator('table').first().waitFor({ state: 'visible', timeout: 10_000 })
  const body = (await page.locator('table').textContent()) ?? ''
  // Dorababu's leave requests (he is NOT a report) must never appear
  for (const rn of LEAKED_REQUEST_NUMBERS) {
    expect(body).not.toContain(rn)
  }
})

// ── 6. URL param escalation blocked: ?person=<non-report> returns no data ────
test('TC-RPT-006: ?person=<non-report> does NOT leak that person\'s leave data', async ({ page }) => {
  await page.goto(`/reports?report=leave-summary&person=${NON_REPORT_WITH_LEAVE}`)
  await page.locator('table').first().waitFor({ state: 'visible', timeout: 10_000 })
  // Should NOT redirect away (manager allowed on /reports)
  expect(new URL(page.url()).pathname).toBe('/reports')
  const body = (await page.locator('table').textContent()) ?? ''
  // Dorababu's request numbers must NOT appear — backend dropped the param
  for (const rn of LEAKED_REQUEST_NUMBERS) {
    expect(body).not.toContain(rn)
  }
})

// ── 7. CSV export respects direct-report scope ───────────────────────────────
test('TC-RPT-007: CSV export with ?person=<non-report> excludes that data', async ({ page }) => {
  const res = await page.request.get(
    `/reports/export?type=leave-summary&person=${NON_REPORT_WITH_LEAVE}`,
  )
  expect(res.status()).toBe(200)
  const csv = await res.text()
  // No cross-team leave rows in the export
  for (const rn of LEAKED_REQUEST_NUMBERS) {
    expect(csv).not.toContain(rn)
  }
})

// ── 8. Leave Balances: same employee dropdown behavior ───────────────────────
test('TC-RPT-008: Leave Balances shows Team Member dropdown, hides Department (manager)', async ({ page }) => {
  await page.goto('/reports?report=leave-balances')
  await expect(page).toHaveURL(/report=leave-balances/, { timeout: 10_000 })
  await expect(page.locator('select[name="person"]')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('select[name="dept"]')).toHaveCount(0)
})

// ── 9. Leave Balances: Leave Type dropdown present ───────────────────────────
test('TC-RPT-009: Leave Balances has Leave Type dropdown', async ({ page }) => {
  await page.goto('/reports?report=leave-balances')
  await expect(page.locator('select[name="ltype"]')).toBeVisible({ timeout: 8_000 })
})

// ── 10. Leave Balances backend scope: no cross-team rows ─────────────────────
test('TC-RPT-010: Leave Balances export with ?person=<non-report> stays scoped', async ({ page }) => {
  const res = await page.request.get(
    `/reports/export?type=leave-balances&person=${NON_REPORT_WITH_LEAVE}`,
  )
  expect(res.status()).toBe(200)
  const csv = await res.text()
  // Dorababu's name must not appear (he is not a report)
  expect(csv).not.toContain('Dorababu')
})
