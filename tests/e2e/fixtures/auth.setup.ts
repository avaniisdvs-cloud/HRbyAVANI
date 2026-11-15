/**
 * Auth setup fixture — saves browser storage state for each dev role.
 * Consumed by the 4 role-based Playwright projects in playwright.config.ts.
 *
 * Dev credentials are the hardcoded demo accounts in lib/auth.ts.
 * Override via TEST_* env vars if needed.
 */
import { test as setup } from '@playwright/test'
import path from 'path'

// ── Storage state output paths ────────────────────────────────────────────────

export const AUTH_STATES = {
  SUPER_ADMIN: path.join('tests/e2e/auth/super-admin.json'),
  HR_ADMIN:    path.join('tests/e2e/auth/hr-admin.json'),
  MANAGER:     path.join('tests/e2e/auth/manager.json'),
  EMPLOYEE:    path.join('tests/e2e/auth/employee.json'),
} as const

// ── Credentials (env-overridable, falls back to dev defaults) ─────────────────

const CREDS = {
  SUPER_ADMIN: {
    email:    process.env.TEST_SUPER_ADMIN_EMAIL    ?? 'super.admin@avaniis.dev',
    password: process.env.TEST_SUPER_ADMIN_PASSWORD ?? 'demo',
  },
  HR_ADMIN: {
    email:    process.env.TEST_HR_ADMIN_EMAIL    ?? 'hr.admin@avaniis.dev',
    password: process.env.TEST_HR_ADMIN_PASSWORD ?? 'demo',
  },
  MANAGER: {
    email:    process.env.TEST_MANAGER_EMAIL    ?? 'manager@avaniis.dev',
    password: process.env.TEST_MANAGER_PASSWORD ?? 'demo',
  },
  EMPLOYEE: {
    email:    process.env.TEST_EMPLOYEE_EMAIL    ?? 'employee@avaniis.dev',
    password: process.env.TEST_EMPLOYEE_PASSWORD ?? 'demo',
  },
}

// ── Shared sign-in helper ─────────────────────────────────────────────────────

async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  role: string,
  statePath: string,
): Promise<void> {
  await page.goto('/sign-in')

  const emailInput = page.getByPlaceholder(/you@avaniis.example/i)
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
  await emailInput.fill(email)
  await page.getByPlaceholder(/password/i).fill(password)

  const navPromise = page.waitForURL(
    url => !url.toString().includes('/sign-in'),
    { timeout: 25_000 },
  )
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await navPromise

  if (page.url().includes('/sign-in')) {
    throw new Error(
      `Login failed for ${role}: ${email} — check DB seed and dev server`,
    )
  }

  await page.context().storageState({ path: statePath })
}

// ── One setup test per role (not a loop) ─────────────────────────────────────

setup('authenticate as super-admin', async ({ page }) => {
  await loginAs(
    page,
    CREDS.SUPER_ADMIN.email,
    CREDS.SUPER_ADMIN.password,
    'SUPER_ADMIN',
    AUTH_STATES.SUPER_ADMIN,
  )
})

setup('authenticate as hr-admin', async ({ page }) => {
  await loginAs(
    page,
    CREDS.HR_ADMIN.email,
    CREDS.HR_ADMIN.password,
    'HR_ADMIN',
    AUTH_STATES.HR_ADMIN,
  )
})

setup('authenticate as manager', async ({ page }) => {
  await loginAs(
    page,
    CREDS.MANAGER.email,
    CREDS.MANAGER.password,
    'MANAGER',
    AUTH_STATES.MANAGER,
  )
})

setup('authenticate as employee', async ({ page }) => {
  await loginAs(
    page,
    CREDS.EMPLOYEE.email,
    CREDS.EMPLOYEE.password,
    'EMPLOYEE',
    AUTH_STATES.EMPLOYEE,
  )
})
