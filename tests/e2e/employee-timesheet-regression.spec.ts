/**
 * Regression guard — Employee Timesheet still works after manager fixes.
 * Uses employee dev credentials: employee@avaniis.dev / demo
 */

import { test, expect } from '@playwright/test'

test.use({
  storageState: 'tests/e2e/auth/employee.json',
  baseURL:      'http://localhost:3000',
})

// ───────────────────────────────────────────────────────────────────────────
// TC-EMP-REG-001 — Employee /me/timesheet still works
// ───────────────────────────────────────────────────────────────────────────
test('TC-EMP-REG-001: /me/timesheet renders for employee (regression)', async ({ page }) => {
  await page.goto('/me/timesheet')
  await expect(page).toHaveURL('/me/timesheet', { timeout: 10_000 })
  // Heading confirms page loaded
  await expect(
    page.getByRole('heading', { name: /timesheet/i }).or(page.getByText(/my timesheet/i))
  ).toBeVisible({ timeout: 8_000 })
  // Must NOT have been redirected away
  expect(new URL(page.url()).pathname).toBe('/me/timesheet')
})

// ───────────────────────────────────────────────────────────────────────────
// TC-EMP-REG-002 — Employee cannot access /persons/<id>
// ───────────────────────────────────────────────────────────────────────────
test('TC-EMP-REG-002: Employee is redirected from /persons/<id>', async ({ page }) => {
  await page.goto('/persons/dddd0001-0000-0000-0000-000000000002')
  await page.waitForLoadState('networkidle')
  // Employee should NOT reach /persons — they go to /me
  const url = new URL(page.url())
  expect(url.pathname).not.toContain('/persons/')
})

// ───────────────────────────────────────────────────────────────────────────
// TC-EMP-REG-003 — Employee profile (/me/profile) still works
// ───────────────────────────────────────────────────────────────────────────
test('TC-EMP-REG-003: /me/profile still works for employee (regression)', async ({ page }) => {
  await page.goto('/me/profile')
  await expect(page).toHaveURL('/me/profile', { timeout: 10_000 })
  expect(new URL(page.url()).pathname).toBe('/me/profile')
})
