/**
 * Reports — HR Admin / Super Admin Regression Guard
 * Ensures the manager-specific filter changes did NOT alter admin behavior:
 *   - HR Admin / Super Admin still see Department dropdown on leave reports
 *   - They do NOT get the manager-only Team Member (person) dropdown
 *   - Leave Type dropdown (new, additive) is available to them too
 */

import { test, expect } from '@playwright/test'

// ── HR Admin ─────────────────────────────────────────────────────────────────
test.describe('HR Admin reports regression', () => {
  test.use({ storageState: 'tests/e2e/auth/hr-admin.json', baseURL: 'http://localhost:3000' })

  test('TC-RPT-REG-001: HR Admin still sees Department dropdown on Leave Summary', async ({ page }) => {
    await page.goto('/reports?report=leave-summary')
    await expect(page).toHaveURL(/report=leave-summary/, { timeout: 10_000 })
    await expect(page.locator('select[name="dept"]')).toBeVisible({ timeout: 8_000 })
    // HR Admin must NOT get the manager-only person dropdown
    await expect(page.locator('select[name="person"]')).toHaveCount(0)
  })

  test('TC-RPT-REG-002: HR Admin Leave Type dropdown present (additive)', async ({ page }) => {
    await page.goto('/reports?report=leave-summary')
    await expect(page.locator('select[name="ltype"]')).toBeVisible({ timeout: 8_000 })
  })

  test('TC-RPT-REG-003: HR Admin Leave Balances still shows Department dropdown', async ({ page }) => {
    await page.goto('/reports?report=leave-balances')
    await expect(page.locator('select[name="dept"]')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('select[name="person"]')).toHaveCount(0)
  })

  test('TC-RPT-REG-004: HR Admin CSV export still works', async ({ page }) => {
    const res = await page.request.get('/reports/export?type=leave-summary')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')
  })
})

// ── Super Admin ────────────────────────────────────────────────────────────────
test.describe('Super Admin reports regression', () => {
  test.use({ storageState: 'tests/e2e/auth/super-admin.json', baseURL: 'http://localhost:3000' })

  test('TC-RPT-REG-005: Super Admin sees Department + Entity, not person dropdown', async ({ page }) => {
    await page.goto('/reports?report=leave-summary')
    await expect(page).toHaveURL(/report=leave-summary/, { timeout: 10_000 })
    await expect(page.locator('select[name="dept"]')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('select[name="person"]')).toHaveCount(0)
  })

  test('TC-RPT-REG-006: Super Admin CSV export still works', async ({ page }) => {
    const res = await page.request.get('/reports/export?type=leave-balances')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')
  })
})
