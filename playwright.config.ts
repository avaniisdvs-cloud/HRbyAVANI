import { defineConfig, devices } from '@playwright/test'

// ── Target base URL ───────────────────────────────────────────────────────────
// PLAYWRIGHT_BASE_URL overrides everything else.
// Set it to https://staging.avaniis.dev (or the Vercel preview URL) to run
// setup / soak tests against a remote deployment without starting a local server.
// Falls back to NEXT_PUBLIC_APP_URL then localhost for normal local dev runs.
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'http://localhost:3000'

const IS_REMOTE = BASE_URL.startsWith('https://')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['json', { outputFile: 'tests/e2e/results.json' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // ── Cross-browser / responsive projects (NFR-19 + NFR-17) ───────────────
    // All target cross-browser.spec.ts only; use saved hr-admin storageState.
    // No dependency on setup projects — auth states are pre-saved.
    {
      name: 'chromium',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },
    {
      name: 'firefox',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },
    {
      name: 'webkit',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },
    {
      name: 'edge',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },
    // Mobile viewports (NFR-17 responsive)
    {
      name: 'mobile-chrome',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },
    {
      name: 'mobile-safari',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['iPhone 12'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },
    // Tablet viewport (iPad)
    {
      name: 'tablet',
      testMatch: /cross-browser\.spec\.ts/,
      use: {
        ...devices['iPad (gen 7)'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },

    // ── RTL + Arabic certification (Phase 2 Task 6) ─────────────────────────
    {
      name: 'rtl',
      testMatch: /rtl-certification\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
    },

    // ── Role-based auth setup projects ──────────────────────────────────────
    // Each setup project runs auth.setup.ts for its role and saves storage state.
    // BASE_URL is parameterized so these projects can target localhost (dev) or
    // a remote staging deployment (set PLAYWRIGHT_BASE_URL=https://staging.avaniis.dev).
    {
      name: 'setup-super-admin',
      testMatch: /auth\.setup\.ts/,
      grep: /authenticate as super-admin/,
      use: { baseURL: BASE_URL },
    },
    {
      name: 'setup-hr-admin',
      testMatch: /auth\.setup\.ts/,
      grep: /authenticate as hr-admin/,
      use: { baseURL: BASE_URL },
    },
    {
      name: 'setup-manager',
      testMatch: /auth\.setup\.ts/,
      grep: /authenticate as manager/,
      use: { baseURL: BASE_URL },
    },
    {
      name: 'setup-employee',
      testMatch: /auth\.setup\.ts/,
      grep: /authenticate as employee/,
      use: { baseURL: BASE_URL },
    },

    // ── Role-based spec projects (each depends on its setup project) ─────────
    {
      name: 'super-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/auth/super-admin.json',
      },
      testMatch: 'tests/e2e/super-admin.spec.ts',
      dependencies: ['setup-super-admin'],
    },
    {
      name: 'hr-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/auth/hr-admin.json',
      },
      testMatch: /tests\/e2e\/(hr-admin|persons)\.spec\.ts/,
      dependencies: ['setup-hr-admin'],
    },
    {
      name: 'manager',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/auth/manager.json',
      },
      testMatch: 'tests/e2e/manager.spec.ts',
      dependencies: ['setup-manager'],
    },
    {
      name: 'employee',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/auth/employee.json',
      },
      testMatch: 'tests/e2e/employee.spec.ts',
      dependencies: ['setup-employee'],
    },

    // ── Document Management UAT suite ──────────────────────────────────────
    // Signs in inside the test (no pre-saved auth state needed).
    // Targets documents-uat.spec.ts only. No webServer dependency — uses
    // whatever is running on BASE_URL (local dev or remote UAT).
    {
      name: 'documents-uat',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
      },
      testMatch: 'tests/e2e/documents-uat.spec.ts',
    },
  ],
  // Only spin up a local dev server when targeting localhost.
  // When PLAYWRIGHT_BASE_URL points to a remote deployment, skip the web server —
  // Playwright will connect directly to the remote URL.
  ...(!IS_REMOTE && {
    webServer: {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    },
  }),
})
