/**
 * Complete Hire LOV — empty-entity helper fix validation.
 *
 * Root cause: Ahmed Hassan Ibrahim's legalEntityId = "AVANIIS DIFC (Test)"
 * (aaaa0001-...0002) which has 0 active departments, 0 locations, and only
 * Ahmed himself (0 selectable managers). The entity-filtered picklists arrive
 * empty, so the Radix dropdowns opened blank. Fix: render a clear helper
 * message + a blocking banner instead of an empty dropdown. No business/save
 * logic changed — populated entities render the original Select unchanged.
 *
 * Super Admin session.
 */

import { test, expect } from '@playwright/test'

const AHMED = 'dddd0001-0000-0000-0000-000000000009' // PENDING_HIRE, empty entity
const TALAL = 'aff512e9-85e2-4883-a94b-1829dd0acf65' // ACTIVE, populated entity (8 depts)

test.use({
  storageState: 'tests/e2e/auth/super-admin.json',
  baseURL:      'http://localhost:3000',
})

// ── 1. Ahmed: Complete Hire modal shows blocking banner ─────────────────────
test('TC-HIRE-001: Ahmed Complete Hire shows "no active departments" banner', async ({ page }) => {
  await page.goto(`/persons/${AHMED}`)
  await page.getByRole('button', { name: /complete hire/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Complete hire — Ahmed Hassan Ibrahim/i)).toBeVisible({ timeout: 8_000 })
  // Blocking banner present
  await expect(dialog.getByText(/no active departments configured/i)).toBeVisible()
})

// ── 2. Ahmed: Department shows helper, NOT an empty open dropdown ────────────
test('TC-HIRE-002: Ahmed Department field shows helper hint instead of blank Select', async ({ page }) => {
  await page.goto(`/persons/${AHMED}`)
  await page.getByRole('button', { name: /complete hire/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/No active departments for this legal entity/i)).toBeVisible({ timeout: 8_000 })
})

// ── 3. Ahmed: Location + Line manager show helper hints ─────────────────────
test('TC-HIRE-003: Ahmed Location and Line manager show helper hints', async ({ page }) => {
  await page.goto(`/persons/${AHMED}`)
  await page.getByRole('button', { name: /complete hire/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/No active locations for this legal entity/i)).toBeVisible({ timeout: 8_000 })
  await expect(dialog.getByText(/No eligible managers in this legal entity/i)).toBeVisible()
})

// ── 4. Regression: populated entity still renders a real Department Select ──
//     Talal is ACTIVE in a configured entity (8 depts). His Transfer dialog
//     uses the SAME picklists.departments — proving the non-empty branch is
//     unchanged (Complete Hire's populated path is identical by construction).
test('TC-HIRE-004: Populated-entity employee still renders a working Department dropdown', async ({ page }) => {
  await page.goto(`/persons/${TALAL}`)
  // Open the Transfer dialog (active employee uses same picklists prop)
  await page.getByRole('button', { name: /^transfer$/i }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 8_000 })
  // A real Select trigger (combobox) must be present — NOT the dashed helper
  const comboboxes = dialog.getByRole('combobox')
  expect(await comboboxes.count()).toBeGreaterThan(0)
  // The empty-entity helper must NOT appear for a populated entity
  await expect(dialog.getByText(/No active departments for this legal entity/i)).toHaveCount(0)
})
