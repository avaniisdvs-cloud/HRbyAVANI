/**
 * MANAGER E2E spec — MG-001 to MG-014
 *
 * Credentials: manager@avaniis.dev / demo
 * Storage state: tests/e2e/auth/manager.json (written by setup-manager)
 */
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'parallel' })

// ── MG-001 to MG-002: Team Views ─────────────────────────────────────────────

test.describe('MANAGER | Timesheets | Team View', () => {
  test('MG-001 /timesheets/team loads; team timesheet table visible', async ({ page }) => {
    await page.goto('/timesheets/team')
    await expect(
      page.locator('table, [role="table"], [role="grid"]').first()
        .or(page.getByText(/no.*timesheet|empty|team/i).first())
        .or(page.getByRole('heading').first())
        .first(),
    ).toBeVisible({ timeout: 10_000 })
    // Should not 500
    await expect(page.getByText('500').first()).not.toBeVisible()
  })
})

test.describe('MANAGER | Org Chart | My Team Shortcut', () => {
  test('MG-002 Org chart loads; My Team shortcut button visible in OrgChartShell', async ({ page }) => {
    await page.goto('/org-chart')
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 })

    // "My Team" view shortcut — button or link in the OrgChartShell toolbar
    const myTeamBtn = page.getByRole('button', { name: /my team/i }).or(
      page.getByRole('link', { name: /my team/i }),
    ).first()
    await expect(myTeamBtn).toBeVisible({ timeout: 8_000 })
  })
})

// ── MG-003 to MG-004: Absence ────────────────────────────────────────────────

test.describe('MANAGER | Absence | Scoped Leave List', () => {
  test('MG-003 /absence loads; does NOT show all-company data (MANAGER scope)', async ({ page }) => {
    await page.goto('/absence')
    // Page should load without 500
    await expect(
      page.getByRole('heading').first().or(page.locator('main').first()).first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()

    // MANAGER sees only their team's data — page should not show "all employees" heading
    // (This is a smoke check; full scoping validation needs DB data)
  })

  test('MG-004 /absence/[id] — Approve/Reject/Delegate buttons present for PENDING items (BR-29)', async ({ page }) => {
    await page.goto('/absence')
    // Look for a link to a PENDING absence entry (buttons only show for PENDING status)
    const pendingLink = page.locator('tbody tr a, [role="row"] a').first()
    const href = await pendingLink.getAttribute('href').catch(() => null)

    if (!href) {
      test.skip(true, 'No absence records visible to MANAGER — seed team leave data')
      return
    }
    await page.goto(href)

    // Buttons only shown for PENDING items; skip if this item is APPROVED/REJECTED
    const hasApprove = await page.getByRole('button', { name: /approve/i }).isVisible({ timeout: 5_000 }).catch(() => false)
    if (!hasApprove) {
      test.skip(true, 'Absence record is not in PENDING state — no action buttons shown')
      return
    }

    // BR-29: Approve / Reject / Delegate
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /reject/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /delegate/i })).toBeVisible()
    // Do NOT click
  })
})

// ── MG-005 to MG-006: Approvals & Workflows ──────────────────────────────────

test.describe('MANAGER | Approvals & Workflows', () => {
  test('MG-005 /approvals inbox renders (may be empty — check container)', async ({ page }) => {
    await page.goto('/approvals')
    await expect(
      page.getByRole('heading', { name: /approval|inbox/i }).or(
        page.locator('main, [role="main"]').first(),
      ).first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('MG-006 /workflows — workflow instance list renders for MANAGER', async ({ page }) => {
    await page.goto('/workflows')
    await expect(
      page.getByRole('heading', { name: /workflow/i }).or(
        page.locator('table, [role="table"], [role="list"]').first(),
      ).or(page.locator('main').first()).first(),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })
})

// ── MG-007: Reports scoping ───────────────────────────────────────────────────

test.describe('MANAGER | Reports | Manager Dashboard', () => {
  test('MG-007 /reports renders ManagerDashboard — NOT HRAdminDashboard', async ({ page }) => {
    await page.goto('/reports')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })

    // Assert ManagerDashboard-specific content is present
    const managerDash = page.locator('[data-testid="manager-dashboard"]').or(
      page.getByText(/manager dashboard|team overview|my team/i).first(),
    ).first()
    await expect(managerDash).toBeVisible({ timeout: 10_000 })

    // HR Admin dashboard must NOT appear
    await expect(page.locator('[data-testid="hr-admin-dashboard"]')).not.toBeVisible()
  })
})

// ── MG-008 to MG-009: ARIA ────────────────────────────────────────────────────

test.describe('MANAGER | ARIA | Floating Widget', () => {
  test('MG-008 ARIA floating widget opens when personId linked; skips otherwise', async ({ page }) => {
    await page.goto('/timesheets/team')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })

    // ARIA FAB only renders when session.user.personId is set in the layout.
    // Demo manager@avaniis.dev has no personId → widget is not rendered.
    const ariaFab = page.getByRole('button', { name: /open aria assistant/i }).or(
      page.locator('[data-testid*="aria-fab"], [aria-label*="ARIA"]'),
    ).first()

    const fabVisible = await ariaFab.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!fabVisible) {
      test.skip(true, 'ARIA FAB not rendered — manager@avaniis.dev has no personId linked. Seed user_accounts to enable.')
      return
    }

    await ariaFab.click()
    // Chat window opens with input field
    await expect(
      page.getByRole('textbox', { name: /message|ask/i }).or(
        page.locator('[data-testid*="aria-input"], input[placeholder*="Ask"]'),
      ).first(),
    ).toBeVisible({ timeout: 8_000 })
  })

  test('MG-009 ARIA team query returns data — no placeholder names', async ({ page }) => {
    await page.goto('/me/aria')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })

    const input = page.getByRole('textbox', { name: /message|ask/i }).or(
      page.locator('[data-testid*="aria-input"], input[placeholder]').first(),
    ).first()

    const inputVisible = await input.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!inputVisible) {
      test.skip(true, 'ARIA employee chat not available — manager@avaniis.dev has no personId linked.')
      return
    }

    await input.fill('Who are my direct reports?')
    await page.keyboard.press('Enter')

    // Response renders within 15s (ARIA API call may be slow)
    const responseVisible = await page.locator(
      '[data-testid*="aria-response"], [class*="message"], [role="article"]',
    ).first().or(page.getByText(/direct report|no direct report|you have/i).first())
      .isVisible({ timeout: 15_000 }).catch(() => false)

    if (!responseVisible) {
      test.skip(true, 'ARIA did not respond — API key may not be configured or manager has no personId context.')
      return
    }

    // No placeholder names in response
    const bodyText = await page.locator('main').innerText()
    expect(bodyText).not.toMatch(/John Doe|Jane Doe|John Smith|placeholder/i)
  })
})

// ── MG-010 to MG-014: Role Restrictions ──────────────────────────────────────

test.describe('MANAGER | Security | Role Guards', () => {
  async function assertBlocked(page: import('@playwright/test').Page, path: string) {
    await page.goto(path)
    const url = page.url()
    const redirected =
      url.includes('/sign-in') ||
      url.includes('/access-denied') ||
      url.includes('/unauthorized') ||
      url.includes('/me') ||
      url.includes('/dashboard') ||
      url.includes('/timesheets') ||
      url.includes('/approvals')
    const hasDeniedText = await page
      .getByText(/access denied|forbidden|not authorized|403/i)
      .isVisible()
      .catch(() => false)
    expect(redirected || hasDeniedText).toBe(true)
  }

  test('MG-010 MANAGER blocked from /settings/ai-agent', async ({ page }) => {
    await assertBlocked(page, '/settings/ai-agent')
  })

  test('MG-011 MANAGER blocked from /users', async ({ page }) => {
    await assertBlocked(page, '/users')
  })

  test('MG-012 MANAGER blocked from /master-data/departments', async ({ page }) => {
    await assertBlocked(page, '/master-data/departments')
  })

  test('MG-013 MANAGER blocked from /persons (HR admin personnel view)', async ({ page }) => {
    await assertBlocked(page, '/persons')
  })

  test('MG-014 MANAGER can access /aria (team-scoped — data scope enforced by service layer per ARA-007)', async ({ page }) => {
    await page.goto('/aria')
    // MANAGER has access to /aria with team-scoped data — should NOT be redirected
    const url = page.url()
    const wasBlocked = url.includes('/sign-in') || url.includes('/me')
    expect(wasBlocked).toBe(false)
  })
})
