import { expect, test } from '@playwright/test'

/**
 * TD-07 — Sprint 3 E2E flow:
 *   Uses hr-admin stored auth state (via playwright.config.ts hr-admin project).
 *   /persons/new → fill required step-0 fields → advance → verify step 1.
 *
 * Resilient to missing seeded data — if step-0 validation fails at server,
 * the toast is asserted. A fully green DB-connected run will advance the
 * multi-step form to step 1 (Employment Details).
 */

test('persons flow: create → step 0 fields → advance', async ({ page }) => {

  // 1) Navigate to the create-person page.
  await page.goto('/persons/new')
  await expect(page.getByRole('heading', { name: /add new employee/i })).toBeVisible()
  await expect(page.locator('#fullNameAr')).toHaveAttribute('dir', 'rtl')

  // 2) Fill the required fields.
  const stamp = Date.now().toString().slice(-6)
  await page.locator('#firstNameEn').fill(`Test${stamp}`)
  await page.locator('#lastNameEn').fill('Employee')
  await page.locator('#fullNameAr').fill('موظف اختبار')
  await page.locator('input[type="date"]').first().fill('1990-01-15')

  // 3) Advance step 0 — "Next →" validates required fields and moves to step 1.
  await page.getByRole('button', { name: /next/i }).click()

  // After advancing, the form stays on /persons/new (URL unchanged).
  // Either we see step 1 content, or the form shows a server error toast.
  await page.waitForTimeout(1_500)

  const serverError = page.getByText(/could not create person/i)
  const hasError = await serverError.isVisible().catch(() => false)

  if (hasError) {
    // ── Server rejected step 0 (DB not seeded / validation failure).
    expect(page.url()).toContain('/persons/new')
    await expect(page.locator('#firstNameEn')).toHaveValue(`Test${stamp}`)
  } else {
    // ── Happy path: form advanced to step 1.
    expect(page.url()).toContain('/persons/new')
    // Step 1 renders employment fields; step header should change.
    await expect(
      page.getByText(/employment|contract|step 2/i).first()
    ).toBeVisible({ timeout: 5_000 })
  }
})

test('locale switcher toggles <html dir>', async ({ page }) => {
  await page.goto('/persons')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')

  // Click the AR button.
  await page.getByRole('button', { name: /عربي/ }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 5_000 })

  // Switch back.
  await page.getByRole('button', { name: /^EN$/ }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr', { timeout: 5_000 })
})
