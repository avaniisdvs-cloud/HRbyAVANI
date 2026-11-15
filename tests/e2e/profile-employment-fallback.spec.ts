/**
 * My Profile Employment tab — persons.current_* fallback (Option B).
 *
 * AVN-T000004 (Fatima Al Zaabi, manager@avaniis.dev) has employment details on
 * persons.current_* but NO worker_assignments row. Before the fix the Employment
 * tab showed "No employment record found.". The fallback now renders the details.
 *
 * employee@avaniis.dev (John Smith, AVN-T000003) HAS a worker_assignments row —
 * confirms the real assignment path is unchanged.
 */
import { test, expect } from '@playwright/test'

// ── Manager AVN-T000004: no worker_assignments row → fallback path ──────────
test.describe('Manager profile employment fallback', () => {
  test.use({ storageState: 'tests/e2e/auth/manager.json', baseURL: 'http://localhost:3000' })

  test('TC-PEF-001: Employment tab no longer shows "No employment record found"', async ({ page }) => {
    await page.goto('/my-profile')
    await expect(page).toHaveURL('/my-profile', { timeout: 10_000 })
    await page.getByRole('button', { name: /^Employment$/ }).click()
    await expect(page.getByText(/No employment record found/i)).toHaveCount(0)
  })

  test('TC-PEF-002: Employment tab shows department/position/grade/location/manager from current_*', async ({ page }) => {
    await page.goto('/my-profile')
    await page.getByRole('button', { name: /^Employment$/ }).click()
    const main = page.locator('body')
    // Values resolved from persons.current_* via master tables
    await expect(main).toContainText('TECHNOLOGY & DIGITAL TRANSFORMATION', { timeout: 8_000 })
    await expect(main).toContainText('IT Engineer')
    await expect(main).toContainText('Grade 3 — Associate')
    await expect(main).toContainText('AVANIIS Tower Business Bay')
    await expect(main).toContainText('Shakeel Haider Khan') // line manager
  })

  test('TC-PEF-003: Employee number still renders in Employment tab', async ({ page }) => {
    await page.goto('/my-profile')
    await page.getByRole('button', { name: /^Employment$/ }).click()
    await expect(page.locator('body')).toContainText('AVN-T000004', { timeout: 8_000 })
  })
})

// ── Employee with a worker_assignments row: real path unchanged ─────────────
test.describe('Employee profile real assignment path (regression)', () => {
  test.use({ storageState: 'tests/e2e/auth/employee.json', baseURL: 'http://localhost:3000' })

  test('TC-PEF-004: Employee with worker_assignments still sees Employment details', async ({ page }) => {
    await page.goto('/me/profile')
    await expect(page).toHaveURL('/me/profile', { timeout: 10_000 })
    await page.getByRole('button', { name: /^Employment$/ }).click()
    // John Smith AVN-T000003 has a real assignment row — tab populated, no empty state
    await expect(page.getByText(/No employment record found/i)).toHaveCount(0)
    await expect(page.locator('body')).toContainText('AVN-T000003', { timeout: 8_000 })
  })
})
