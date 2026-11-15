/**
 * LOCAL reproduction + fix verification for Org Chart View Profile.
 * Manager dev session. Drives the ACTUAL three-dot → View Profile click.
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/auth/manager.json', baseURL: 'http://localhost:3000' })

async function openOrgChart(page: import('@playwright/test').Page) {
  await page.goto('/org-chart')
  await expect(page).toHaveURL(/\/org-chart/, { timeout: 10_000 })
  // Wait for nodes to render
  await page.getByRole('button', { name: 'Actions' }).first().waitFor({ state: 'visible', timeout: 30_000 })
}

// Click the three-dot on the card containing `name`, then View Profile.
async function viewProfileFor(page: import('@playwright/test').Page, name: string) {
  // The node card contains the employee name; find its Actions button.
  // Use the org chart search to pan/centre the target node so its Actions
  // button is reliably in the viewport (React Flow off-screen nodes don't
  // receive clicks). Then click Actions on the centred card.
  const search = page.getByPlaceholder('Search people…')
  await search.click()
  await search.fill(name.split(' ')[0]) // first name is enough
  await page.waitForTimeout(800)        // debounce
  // Click the matching search result to pan to the node, if a result list shows.
  const result = page.getByRole('button', { name: new RegExp(name, 'i') })
    .or(page.getByText(name, { exact: false })).first()
  if (await result.count()) { await result.click().catch(() => {}) ; await page.waitForTimeout(600) }
  await search.fill('')

  const card = page.locator('.react-flow__node', { hasText: name }).first()
  await card.waitFor({ state: 'attached', timeout: 15_000 })
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: 'Actions' }).click({ force: true })
  const vp = page.getByText('View Profile', { exact: true }).first()
  await expect(vp).toBeVisible({ timeout: 8_000 })
  await vp.click()
  await page.waitForURL(/\/persons\//, { timeout: 15_000 })
}

test('REPRO-001: diagnostics — active engine + rendered node names', async ({ page }) => {
  await openOrgChart(page)
  const names = await page.locator('.react-flow__node').allInnerTexts()
  console.log('RENDERED NODES:\n' + names.join('\n---\n'))
  // Reporting Manager pill should be the active/selected one
  const reporting = page.getByText('Reporting Manager').first()
  await expect(reporting).toBeVisible()
})

for (const [name, num] of [
  ['John Smith', 'AVN-T000003'],
  ['Nour Al Hashimi', 'AVN-T000008'],
  ['Aisha Binti Abdullah', 'AVN-T000006'],
] as const) {
  test(`REPRO [${num}]: View Profile on ${name} opens ${name} (not Fatima)`, async ({ page }) => {
    await openOrgChart(page)
    await viewProfileFor(page, name)
    const url = page.url()
    console.log(`${name} → URL = ${url}`)
    // Must land on a profile that shows THIS person's number, not Fatima's
    await expect(page.locator('body')).toContainText(num, { timeout: 12_000 })
    expect(page.url()).toContain('from=org-chart')
    // Back link should target org chart (exact back-link label, not the nav rail item)
    await expect(page.getByRole('link', { name: '← Organisation Chart' })).toBeVisible({ timeout: 8_000 })
  })
}
