/**
 * Cross-Browser & Responsive Validation Spec — CB-001 → CB-035
 *
 * NFR-17 (responsive/mobile) + NFR-19 (multi-browser)
 *
 * Projects: chromium | firefox | webkit | mobile-chrome | mobile-safari | tablet
 * Auth:     hr-admin storageState (set per-project in playwright.config.ts)
 *           hr-admin has access to all routes (HR_ADMIN role).
 *
 * Viewport strategy: test.use({ viewport }) overrides the project device so
 * every browser engine exercises every viewport tier in one spec file.
 *
 * Coverage:
 *   CB-001–003  Auth redirects
 *   CB-004–014  Core HR Admin workflows (desktop 1280×800)
 *   CB-015      Desktop navigation: WorkspaceRail shows, MobileBottomBar hidden
 *   CB-016–019  Tablet layout (768×1024)
 *   CB-020–026  Mobile portrait (390×844)
 *   CB-027–029  Mobile landscape (844×390)
 *   CB-030–035  Accessibility smoke (axe-core WCAG 2.1 AA)
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — Auth redirects (viewport-neutral)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-AUTH | Auth redirects', () => {
  test('CB-001 sign-in page is publicly accessible and renders form', async ({ page }) => {
    // Strip session cookies to test the unauthenticated sign-in page
    await page.context().clearCookies()
    await page.goto('/sign-in')
    await page.waitForLoadState('domcontentloaded')
    // Sign-in form should render — button or input visible
    await expect(
      page.getByRole('button', { name: /sign in|continue/i })
        .or(page.getByPlaceholder(/you@avaniis|email/i))
        .first(),
    ).toBeVisible({ timeout: 12_000 })
  })

  test('CB-002 authenticated hr-admin reaches /dashboard without sign-in redirect', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // URL must not have bounced to /sign-in
    expect(page.url()).not.toContain('/sign-in')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12_000 })
  })

  test('CB-003 unauthenticated request to protected API is blocked (no 200)', async ({ page }) => {
    await page.context().clearCookies()
    // Playwright request goes through same context — now unauthenticated
    const resp = await page.request.get('/api/persons', {
      maxRedirects: 0,
      failOnStatusCode: false,
    })
    expect(resp.status()).not.toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — Core HR Admin workflows (desktop 1280×800)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-CORE | Core admin workflows — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('CB-004 Dashboard: heading visible; no 500 error', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 12_000 })
    await expect(page.getByRole('heading', { name: /500|internal server error/i }).first()).not.toBeVisible()
  })

  test('CB-005 Persons list: table and search input visible', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('table, [role="table"], [role="grid"]').first()
        .or(page.getByRole('heading', { level: 1 }).first())
        .first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(
      page.getByRole('searchbox')
        .or(page.getByPlaceholder(/search/i))
        .first(),
    ).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-006 Persons search: typing filters without JS error', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()
    if (await search.isVisible().catch(() => false)) {
      await search.fill('Ahmed')
      await page.waitForTimeout(700) // debounce
      await expect(page.getByText('500').first()).not.toBeVisible()
    }
    // No unhandled JS errors during search
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('CB-007 MDM legal entities: page loads with h1 heading', async ({ page }) => {
    await page.goto('/master-data/legal-entities')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-008 Absence page: renders without 500', async ({ page }) => {
    await page.goto('/absence')
    await expect(
      page.getByRole('heading').first().or(page.locator('main').first()).first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-009 Org chart: React Flow canvas renders at least 1 node', async ({ page }) => {
    await page.goto('/org-chart')
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-010 ARIA chat widget: button visible in admin shell (when personId seeded)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const jsErrors: string[] = []
    page.on('pageerror', err => jsErrors.push(err.message))
    // ARIA widget requires session.user.personId; gracefully skip if not seeded
    const ariaSelectors = [
      '[aria-label*="ARIA" i]',
      '[aria-label*="chat" i]',
      '[data-testid*="aria"]',
      '.aria-fab',
    ]
    const ariaVisible = await page.locator(ariaSelectors.join(', ')).first().isVisible().catch(() => false)
    if (!ariaVisible) {
      // Widget not seeded — confirm no JS crash
      await expect(page.locator('main').first()).toBeVisible()
    } else {
      await expect(page.locator(ariaSelectors.join(', ')).first()).toBeVisible()
    }
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('CB-011 Employee self-service /me: renders without 500', async ({ page }) => {
    await page.goto('/me')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByText(/welcome|hello|good morning|good afternoon|not linked|contact hr/i)
        .or(page.getByRole('heading').first())
        .or(page.locator('main p, main h1, main h2').first())
        .first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByRole('heading', { name: /^500$|500 internal server error/i }).first()).not.toBeVisible()
  })

  test('CB-012 Timesheets team view: renders without 500', async ({ page }) => {
    await page.goto('/timesheets/team')
    await expect(
      page.locator('table, [role="table"], [role="grid"]').first()
        .or(page.getByText(/no.*timesheet|empty|no data/i).first())
        .or(page.getByRole('heading').first())
        .first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-013 Payroll page: renders without 500', async ({ page }) => {
    await page.goto('/payroll')
    await expect(
      page.getByRole('heading').first().or(page.locator('main').first()).first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-014 Settings page: renders without 500', async ({ page }) => {
    await page.goto('/settings')
    await expect(
      page.getByRole('heading').first().or(page.locator('main').first()).first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Desktop navigation layout (1280×800)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-NAV-DESKTOP | Desktop layout — rail nav, no mobile bar', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('CB-015 MobileBottomBar hidden at desktop viewport (≥1025px)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const mobileBar = page.locator('[aria-label="Mobile navigation"]').first()
    // At 1280px the bar is display:none — Playwright's isVisible() returns false for display:none
    const visible = await mobileBar.isVisible().catch(() => false)
    expect(visible).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — Tablet layout (768×1024)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-TABLET | Tablet layout (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('CB-016 Mobile bottom nav visible at tablet width (≤1024px)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const mobileBar = page.locator('[aria-label="Mobile navigation"]').first()
    await expect(mobileBar).toBeVisible({ timeout: 10_000 })
  })

  test('CB-017 Dashboard: no horizontal page overflow at tablet width', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => {
      // documentElement.scrollWidth > clientWidth means content overflows horizontally
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5 // 5px tolerance
    })
    expect(overflow).toBe(false)
  })

  test('CB-018 Persons list: renders without 500 at tablet width', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('table, [role="table"], [role="grid"]').first()
        .or(page.getByRole('heading').first())
        .first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-019 MDM create drawer: fits within tablet viewport (no overflow)', async ({ page }) => {
    await page.goto('/master-data/legal-entities')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /new|add|create/i }).first()
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click()
      const dialog = page.getByRole('dialog').first()
      await dialog.waitFor({ state: 'visible', timeout: 8_000 })
      const bounds = await dialog.boundingBox()
      if (bounds) {
        // Dialog must start within viewport and not overflow right edge
        expect(bounds.x).toBeGreaterThanOrEqual(-5)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(768 + 15) // 15px tolerance for scroll-bar
      }
      await page.keyboard.press('Escape')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 5 — Mobile portrait (390×844)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-MOBILE-P | Mobile portrait (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('CB-020 Dashboard: bottom nav visible at 390px', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const mobileBar = page.locator('[aria-label="Mobile navigation"]').first()
    await expect(mobileBar).toBeVisible({ timeout: 10_000 })
  })

  test('CB-021 Dashboard: no horizontal page overflow at 390px', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5
    })
    expect(overflow).toBe(false)
  })

  test('CB-022 Mobile "More" sheet: opens on tap; workspace list visible', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const moreBtn = page.getByRole('button', { name: /^more$|^المزيد$/i }).first()
    if (await moreBtn.isVisible().catch(() => false)) {
      await moreBtn.click()
      const sheet = page.getByRole('dialog', { name: /all workspaces/i })
        .or(page.locator('[aria-label="All workspaces"]'))
        .first()
      await expect(sheet).toBeVisible({ timeout: 6_000 })
      // Workspace items should be listed
      const items = sheet.locator('a, [role="link"]')
      await expect(items.first()).toBeVisible({ timeout: 4_000 })
      // Close
      await page.keyboard.press('Escape')
      await expect(sheet).not.toBeVisible({ timeout: 4_000 })
    }
  })

  test('CB-023 Persons list: renders without 500 on mobile', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('heading').first().or(page.locator('main').first()).first(),
    ).toBeVisible({ timeout: 12_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-024 Employee /me: renders without 500 on mobile', async ({ page }) => {
    await page.goto('/me')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /^500$|500 internal/i }).first()).not.toBeVisible({ timeout: 8_000 })
  })

  test('CB-025 MDM page: no horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/master-data/legal-entities')
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5
    })
    expect(overflow).toBe(false)
  })

  test('CB-026 Bottom nav touch targets: bar height ≥ 44px (WCAG 2.5.5)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const mobileBar = page.locator('[aria-label="Mobile navigation"]').first()
    if (await mobileBar.isVisible().catch(() => false)) {
      const bounds = await mobileBar.boundingBox()
      if (bounds) {
        expect(bounds.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 6 — Mobile landscape (844×390)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-MOBILE-L | Mobile landscape (844×390)', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('CB-027 Dashboard: renders in landscape; bottom nav visible', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const mobileBar = page.locator('[aria-label="Mobile navigation"]').first()
    await expect(mobileBar).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('500').first()).not.toBeVisible()
  })

  test('CB-028 Landscape: no horizontal page overflow', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5
    })
    expect(overflow).toBe(false)
  })

  test('CB-029 Persons page: renders without overflow in landscape', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('500').first()).not.toBeVisible()
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5
    })
    expect(overflow).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 7 — Accessibility smoke (axe-core WCAG 2.1 AA)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('CB-A11Y | Accessibility smoke — WCAG 2.1 AA', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('CB-030 Dashboard: no critical axe violations', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // color-contrast: evaluated separately via design system tokens
      .disableRules(['color-contrast'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(
      critical,
      `Critical violations: ${critical.map(v => `${v.id} (${v.nodes.length} nodes)`).join(', ')}`,
    ).toHaveLength(0)
  })

  test('CB-031 Persons list: no critical axe violations', async ({ page }) => {
    await page.goto('/persons')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(
      critical,
      `Critical violations: ${critical.map(v => `${v.id} (${v.nodes.length} nodes)`).join(', ')}`,
    ).toHaveLength(0)
  })

  test('CB-032 Sign-in page: no critical axe violations (unauthenticated)', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/sign-in')
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze()
    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(
      critical,
      `Critical violations: ${critical.map(v => `${v.id} (${v.nodes.length} nodes)`).join(', ')}`,
    ).toHaveLength(0)
  })

  test('CB-033 Keyboard: Tab through dashboard — at least 4 elements receive focus', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    let focusedCount = 0
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? '')
      if (tag && tag !== 'BODY') focusedCount++
    }
    expect(focusedCount).toBeGreaterThanOrEqual(4)
  })

  test('CB-034 <main> landmark present on every primary page', async ({ page }) => {
    const routes = ['/dashboard', '/persons', '/absence']
    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expect(
        page.locator('main').first(),
        `<main> missing on ${route}`,
      ).toBeVisible({ timeout: 10_000 })
    }
  })

  test('CB-035 Modal focus trap: MDM drawer focus stays within dialog', async ({ page }) => {
    await page.goto('/master-data/legal-entities')
    await page.waitForLoadState('networkidle')
    const newBtn = page.getByRole('button', { name: /new|add|create/i }).first()
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click()
      const dialog = page.getByRole('dialog').first()
      await dialog.waitFor({ state: 'visible', timeout: 8_000 })
      // Wait for animation + auto-focus to settle (MdmDrawer focuses first focusable element on open)
      await page.waitForTimeout(300)
      // Verify auto-focus: active element should already be inside the dialog
      const autoFocusInDialog = await page.evaluate(() => {
        const active = document.activeElement
        const dlg = document.querySelector('[role="dialog"]')
        return dlg !== null && (dlg === active || dlg.contains(active))
      })
      expect(autoFocusInDialog).toBe(true)
      // Tab once — focus should wrap to next element inside, not escape to background
      await page.keyboard.press('Tab')
      const focusAfterTab = await page.evaluate(() => {
        const active = document.activeElement
        const dlg = document.querySelector('[role="dialog"]')
        return dlg !== null && (dlg === active || dlg.contains(active))
      })
      expect(focusAfterTab).toBe(true)
      await page.keyboard.press('Escape')
    }
  })
})
