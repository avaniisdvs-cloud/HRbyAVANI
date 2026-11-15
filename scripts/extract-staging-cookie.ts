/**
 * extract-staging-cookie.ts
 *
 * Headless Playwright script — logs into Vercel staging with dev credentials
 * and extracts the authjs.session-token cookie for use by k6.
 *
 * Usage:
 *   npx tsx scripts/extract-staging-cookie.ts
 *
 * Output:
 *   tests/e2e/auth/staging-hr-admin.json  — full storageState (Playwright format)
 *   tests/performance/staging-auth-cookie.txt — single cookie string for k6
 */

import { chromium } from '@playwright/test'
import type { Cookie } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const STAGING_URL    = process.env.STAGING_URL ?? 'http://localhost:3001'
const LOGIN_EMAIL    = process.env.STAGING_EMAIL    ?? 'hr.admin@avaniis.dev'
const LOGIN_PASSWORD = process.env.STAGING_PASSWORD ?? 'demo'

const STORAGE_STATE_PATH = path.join('tests/e2e/auth/staging-hr-admin.json')
const COOKIE_TXT_PATH    = path.join('tests/performance/staging-auth-cookie.txt')

async function extractCookie(): Promise<void> {
  console.log(`\n🔑 Extracting staging cookie from ${STAGING_URL}`)
  console.log(`   Email: ${LOGIN_EMAIL}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page    = await context.newPage()

  // ── Step 1: Navigate to sign-in ─────────────────────────────────────────────
  console.log('   → Navigating to /sign-in …')
  await page.goto(`${STAGING_URL}/sign-in`, { waitUntil: 'networkidle', timeout: 30_000 })
  console.log(`   → Page title: ${await page.title()}`)
  console.log(`   → URL: ${page.url()}`)

  // ── Step 2: Fill credentials ──────────────────────────────────────────────
  console.log('   → Filling credentials …')

  // Try multiple locator strategies for the email input
  const emailInput = page.getByPlaceholder(/you@avaniis\.example/i)
    .or(page.getByPlaceholder(/email/i))
    .or(page.locator('input[type="email"]'))
    .or(page.locator('input[name="email"]'))
  await emailInput.first().waitFor({ state: 'visible', timeout: 15_000 })
  await emailInput.first().fill(LOGIN_EMAIL)

  const passwordInput = page.getByPlaceholder(/password/i)
    .or(page.locator('input[type="password"]'))
    .or(page.locator('input[name="password"]'))
  await passwordInput.first().fill(LOGIN_PASSWORD)

  // ── Step 3: Submit and wait for navigation ────────────────────────────────
  console.log('   → Submitting login …')
  const navPromise = page.waitForURL(
    (url: URL) => !url.toString().includes('/sign-in') && !url.toString().includes('/login'),
    { timeout: 30_000 },
  )
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await navPromise

  const finalUrl = page.url()
  console.log(`   → Redirected to: ${finalUrl}`)

  if (finalUrl.includes('/sign-in') || finalUrl.includes('/login')) {
    // Take a screenshot for debugging
    await page.screenshot({ path: 'tests/performance/login-failure.png' })
    await browser.close()
    throw new Error(
      `❌ Login failed — still on login page: ${finalUrl}\n` +
      `   Screenshot saved to tests/performance/login-failure.png\n` +
      `   Check: ENABLE_DEV_ACCOUNTS is set on Vercel, DB has seed data`
    )
  }

  // ── Step 4: Extract cookies ───────────────────────────────────────────────
  const cookies = await context.cookies()
  console.log(`   → Cookies found: ${cookies.map((c: Cookie) => c.name).join(', ')}`)

  const sessionCookie = cookies.find((c: Cookie) =>
    c.name === '__Secure-authjs.session-token' ||
    c.name === 'authjs.session-token'
  ) ?? cookies.find((c: Cookie) => c.name.includes('session-token'))

  if (!sessionCookie) {
    await browser.close()
    throw new Error(
      `❌ No session cookie found after login.\n` +
      `   Available cookies: ${cookies.map((c: Cookie) => c.name).join(', ')}`
    )
  }

  console.log(`   → Session cookie: ${sessionCookie.name}`)
  console.log(`   → Cookie length: ${sessionCookie.value.length} chars`)
  console.log(`   → Expires: ${sessionCookie.expires ? new Date(sessionCookie.expires * 1000).toISOString() : 'session'}`)

  // ── Step 5: Save storageState (for Playwright reuse) ──────────────────────
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true })
  await context.storageState({ path: STORAGE_STATE_PATH })
  console.log(`   ✅ StorageState saved → ${STORAGE_STATE_PATH}`)

  // ── Step 6: Save cookie string for k6 ──────────────────────────────────────
  // Build full cookie string from all cookies (not just session token)
  const cookieString = cookies
    .filter((c: Cookie) => c.domain.includes('vercel.app') || c.domain.includes('avaniishcm'))
    .map((c: Cookie) => `${c.name}=${c.value}`)
    .join('; ')

  fs.mkdirSync(path.dirname(COOKIE_TXT_PATH), { recursive: true })
  fs.writeFileSync(COOKIE_TXT_PATH, cookieString, 'utf8')
  console.log(`   ✅ k6 cookie string saved → ${COOKIE_TXT_PATH}`)
  console.log(`   → Cookie preview: ${cookieString.substring(0, 80)}…`)

  // ── Step 7: Verify a protected page is accessible ─────────────────────────
  console.log('   → Verifying dashboard access …')
  await page.goto(`${STAGING_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20_000 })
  const dashUrl = page.url()
  if (dashUrl.includes('/sign-in') || dashUrl.includes('/login')) {
    await browser.close()
    throw new Error(`❌ Dashboard unreachable with obtained cookie — got redirected to ${dashUrl}`)
  }
  console.log(`   ✅ Dashboard accessible: ${dashUrl}`)

  await browser.close()
  console.log('\n✅ Cookie extraction complete.\n')
  console.log('k6 AUTH_COOKIE value:')
  console.log(`   ${sessionCookie.name}=${sessionCookie.value.substring(0, 40)}…`)
}

extractCookie().catch(err => {
  console.error(err)
  process.exit(1)
})
