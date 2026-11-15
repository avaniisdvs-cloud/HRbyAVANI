# AVANIIS HR — Enterprise Review Extraction Bundle
## PRIORITY 4 — BONUS (config, schema, middleware)
Generated: 2026-06-13 · Source repo: /Users/d.kethari/D_Drive/AVANIIS_HR_SYS · Branch: main
Delimiter: each file begins at a line of '=' with FILE [id]: <path>. Content is verbatim, unmodified.

>>> NOTE: P4-01 schema: no db/schema.ts; canonical schema is drizzle/schema/*.ts (12 files) — all included. P4-03 Supabase config: NONE (project uses Drizzle/Neon, not Supabase) — marked NOT FOUND. P4-06: .env example templates only (placeholders verified, no real secrets).

================================================================================
FILE [P4-02]: middleware.ts
LINES: 178
================================================================================
/**
 * Auth + role routing middleware — OBS-003: request correlation IDs.
 *
 * 1. Public paths bypass auth entirely.
 * 2. Unauthenticated requests → /sign-in (callbackUrl preserved).
 * 3. After sign-in, / and /dashboard redirect to the role-appropriate home.
 * 4. Role-restricted path groups (master-data, access, users, persons, aria)
 *    redirect non-permitted roles to their role home rather than showing a 403.
 * 5. OBS-003: generates x-request-id if absent; echoes it in every response.
 *    API routes and Server Actions read this via headers() for log correlation.
 */
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Role → landing page after successful sign-in
const ROLE_HOME: Record<string, string> = {
  HR_ADMIN:     '/dashboard',
  HR_DIRECTOR:  '/dashboard',
  SUPER_ADMIN:  '/dashboard',
  PAYROLL_ADMIN:'/dashboard',
  FINANCE:      '/dashboard',
  MANAGER:      '/dashboard',
  EMPLOYEE:     '/me',
}

// Path prefixes that require specific roles (beyond the shell gate in layout.tsx)
// These entries are checked in order — first match wins.
const ROLE_GATED_PATHS: { prefix: string; allowed: string[] }[] = [
  // RBAC-BL-07: DataOps is a raw DB console — SUPER_ADMIN only. Gates both the
  // page and its data API. The read API otherwise treats the HR_ADMIN group as
  // full-access (no row filter) over audit_log / user_accounts / refresh_tokens /
  // sso_provider_config / person_bank_details / payroll. Listed first so the
  // narrow /admin/dataops match wins before any broader future /admin entry.
  {
    prefix:  '/admin/dataops',
    allowed: ['SUPER_ADMIN'],
  },
  {
    prefix:  '/api/dataops',
    allowed: ['SUPER_ADMIN'],
  },
  // UAT Migration Load Console — SUPER_ADMIN only (request-boundary backstop;
  // page also guards). Listed alongside the other narrow /admin matches.
  {
    prefix:  '/admin/migration',
    allowed: ['SUPER_ADMIN'],
  },
  {
    prefix:  '/api/migration',
    allowed: ['SUPER_ADMIN'],
  },
  // RBAC-BL-03: config-grade routes previously protected ONLY by per-page guards
  // now get a middleware backstop (defense-in-depth). Each gate's role set EXACTLY
  // matches the route's existing page guard(s) — no expansion, no loss.
  // Listed after /admin/dataops so the SUPER_ADMIN-only dataops match wins first;
  // these are distinct /admin/* sub-prefixes (no shadowing). NEVER add a broad
  // '/admin' entry — it would mis-gate /admin/dataops.
  {
    // Workflow Operations console — org-wide oversight, HR leadership only.
    // The /approvals base stays open to all approver roles; only this sub-path
    // is gated. /approvals itself is NOT listed (deliberately open).
    prefix:  '/approvals/operations',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/configuration',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/admin/probation',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    // SUPER-SET of both pages: the list page (/admin/exit-clearance) is HR-only,
    // but the detail page (/admin/exit-clearance/[personId]) intentionally also
    // admits MANAGER + PAYROLL_ADMIN (they own clearance tasks). The middleware
    // gate must be the union so it never strips the detail page's legitimate
    // users; the per-page guards keep the narrower list-vs-detail enforcement.
    prefix:  '/admin/exit-clearance',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/master-data',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/access',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/users',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/settings',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/dashboard',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'],
  },
  {
    prefix:  '/persons',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'],
  },
  {
    prefix:  '/aria',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'],
  },
]

export default auth((req) => {
  const { pathname } = req.nextUrl

  // ── OBS-003: request correlation ID ──────────────────────────────────────
  // Reuse existing header (from upstream proxy/load balancer) or generate one.
  // Edge runtime has crypto.randomUUID() available since Node 18 / CF Workers.
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()

  // ── Public paths ──────────────────────────────────────────────────────────
  const isPublic =
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/cron') ||
    pathname === '/api/workflow/action' ||
    pathname.startsWith('/_next') ||
    /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(pathname)

  if (isPublic) {
    const res = NextResponse.next()
    res.headers.set('x-request-id', reqId)
    return res
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!req.auth) {
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    const res = NextResponse.redirect(signInUrl)
    res.headers.set('x-request-id', reqId)
    return res
  }

  const role = (req.auth.user as { role?: string })?.role ?? 'EMPLOYEE'

  // ── Root redirect → role home ─────────────────────────────────────────────
  if (pathname === '/') {
    const home = ROLE_HOME[role] ?? '/me'
    const res = NextResponse.redirect(new URL(home, req.url))
    res.headers.set('x-request-id', reqId)
    return res
  }

  // ── Role-gated path protection ────────────────────────────────────────────
  for (const gate of ROLE_GATED_PATHS) {
    if (pathname.startsWith(gate.prefix)) {
      if (!gate.allowed.includes(role)) {
        const home = ROLE_HOME[role] ?? '/me'
        const res = NextResponse.redirect(new URL(home, req.url))
        res.headers.set('x-request-id', reqId)
        return res
      }
      break
    }
  }

  // ── Authenticated pass-through: inject request ID into downstream headers ─
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', reqId)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-request-id', reqId)
  return res
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}


================================================================================
FILE [P4-03]: supabase/config.toml
STATUS: FILE NOT FOUND
================================================================================


================================================================================
FILE [P4-04]: package.json
LINES: 91
================================================================================
{
  "name": "avaniis-hr",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "NODE_OPTIONS=--no-experimental-webstorage next dev --port 3000",
    "fresh": "rm -rf .next && NODE_OPTIONS=--no-experimental-webstorage next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node scripts/guard-db-write.js && drizzle-kit migrate",
    "db:push": "node scripts/guard-db-write.js && drizzle-kit push",
    "db:seed": "node scripts/guard-db-write.js && tsx drizzle/seed.ts",
    "db:seed:dev": "node scripts/guard-db-write.js && tsx drizzle/seeds/seed-dev.ts",
    "db:seed:prod": "node scripts/guard-db-write.js && tsx drizzle/seeds/seed-prod.ts",
    "db:reset:dev": "node scripts/guard-db-write.js && drizzle-kit migrate && tsx drizzle/seeds/seed-dev.ts",
    "db:studio": "drizzle-kit studio",
    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:e2e": "node scripts/guard-db-write.js && playwright test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.91.1",
    "@auth/drizzle-adapter": "^1.4.0",
    "@aws-sdk/client-s3": "^3.1055.0",
    "@aws-sdk/s3-request-presigner": "^3.1055.0",
    "@azure/communication-email": "^1.1.0",
    "@azure/storage-blob": "^12.31.0",
    "@internationalized/date": "^3.12.1",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-toast": "^1.2.15",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@react-pdf/renderer": "^4.5.1",
    "@types/nodemailer": "^8.0.0",
    "@xyflow/react": "^12.10.2",
    "bcryptjs": "^3.0.3",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "drizzle-orm": "0.45.2",
    "html-to-image": "^1.11.11",
    "i18next": "^23.11.5",
    "i18next-resources-to-backend": "^1.2.1",
    "isomorphic-dompurify": "^3.14.0",
    "jspdf": "^4.2.1",
    "lucide-react": "^0.400.0",
    "next": "15.3.9",
    "next-auth": "^5.0.0-beta.31",
    "node-cron": "^3.0.3",
    "nodemailer": "^8.0.7",
    "postgres": "^3.4.4",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-i18next": "^14.1.2",
    "tailwind-merge": "^2.3.0",
    "xlsx": "^0.18.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.11.2",
    "@playwright/test": "^1.44.0",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@types/bcryptjs": "^3.0.0",
    "@types/node": "^20.14.0",
    "@types/node-cron": "^3.0.11",
    "@types/react": "^19.2.15",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.3.0",
    "@vitest/coverage-v8": "^1.6.1",
    "autoprefixer": "^10.4.19",
    "dotenv": "^16.4.5",
    "drizzle-kit": "0.31.10",
    "eslint": "^8.57.1",
    "eslint-config-next": "15.3.9",
    "eslint-plugin-security": "^4.0.0",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "tsx": "^4.15.6",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  },
  "packageManager": "pnpm@9.4.0"
}


================================================================================
FILE [P4-05]: tsconfig.json
LINES: 23
================================================================================
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}


================================================================================
FILE [P4-06a]: .env.example
LINES: 130
================================================================================
# ─────────────────────────────────────────────────────────────────────────────
# AVANIIS HR — Environment Variable Reference
#
# Copy this file to .env.local and fill in your values.
# See docs/local-development.md for full setup instructions.
#
# ⚠️  NEVER commit .env.local to version control.
# ⚠️  NEVER point DATABASE_URL to the production Neon database for local dev.
#     Use .env.local.example as your safe local template.
# ─────────────────────────────────────────────────────────────────────────────

# ── Database ──────────────────────────────────────────────────────────────────
# Current operating model:
#   single-dev-uat → one active DEV/UAT database today; production does not exist yet
#   uat-prod       → future split mode with separate UAT and Production databases
ENV_GOVERNANCE_MODE=single-dev-uat

# Local development: use Docker Postgres or a Neon branch — NOT future production Neon.
# See docs/local-development.md → "Database setup" for safe options.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev

# Environment classification for repo guardrails. This must match the database
# behind DATABASE_URL.
#   development | dev → local Docker or a personal development branch
#   test | uat        → current DEV/UAT or future dedicated Test/UAT branch
#   production        → future production Neon branch only; reload/clear is blocked
DATABASE_ENV=development

# Set this once a future Production database exists so guards can detect when
# DATABASE_URL accidentally points at production (host comparison only — no connection made).
# Required when ENV_GOVERNANCE_MODE=uat-prod.
# PROD_DATABASE_URL=postgresql://neondb_owner:...@ep-xxxx.neon.tech/neondb

# ── Database write-safety overrides ──────────────────────────────────────────
# These must NOT be set in .env.local under normal circumstances.
# Set them only as one-off shell exports for explicit, authorised operations.
#
# ALLOW_NON_PROD_CLOUD_DB_WRITE=true
#   Permits write commands against a non-production cloud database (Neon branch,
#   test/UAT branch, etc.) when DATABASE_ENV is development|dev|test|uat AND
#   DATABASE_URL host does not match PROD_DATABASE_URL host if one is configured.
#
# ALLOW_UAT_RELOAD_WRITE=true
#   Permits approved Test/UAT clear/reload operations only when DATABASE_ENV is
#   test|uat and ALLOW_NON_PROD_CLOUD_DB_WRITE=true is also set. In future
#   uat-prod mode, PROD_DATABASE_URL must also be configured and different.
#
# ALLOW_PRODUCTION_DB_WRITE=true
#   Permits write commands against the production database.
#   Only for authorised maintenance windows. Prints a severe warning.
#   ALLOW_NON_PROD_CLOUD_DB_WRITE is NOT sufficient for production.
#   Reload/clear operations are never allowed in production.
ALLOW_NON_PROD_CLOUD_DB_WRITE=false
ALLOW_UAT_RELOAD_WRITE=false
ALLOW_PRODUCTION_DB_WRITE=false

# ── Migration console ────────────────────────────────────────────────────────
# UAT/Test only. Production must keep this false.
ENABLE_MIGRATION_CONSOLE=false

# ── Auth.js v5 ────────────────────────────────────────────────────────────────
# Generate a secret: openssl rand -base64 32
AUTH_SECRET=replace_with_32_char_random_string_here
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# ── Microsoft Entra ID / Azure AD (SSO — leave empty for local dev) ───────────
# Obtain from Azure Portal → App registrations → your app → Overview
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

# Auth.js v5 canonical env var names for MicrosoftEntraID provider:
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=

# ── Dev credentials provider ──────────────────────────────────────────────────
# Set to "true" to enable hardcoded demo accounts (super.admin@avaniis.dev etc.)
# Safe only for local development or explicitly approved UAT.
# Ignored when DATABASE_ENV=production.
ENABLE_DEV_ACCOUNTS=true

# ── Field-level encryption (AES-256-GCM — PII fields) ────────────────────────
# Must be exactly 64 hex characters (= 32 bytes).
# Generate: openssl rand -hex 32
ENCRYPTION_KEY=replace_with_64_hex_chars_0123456789abcdef0123456789abcdef01234567

# ── ARIA AI Agent (Anthropic Claude API) ─────────────────────────────────────
# Obtain from console.anthropic.com → API Keys
# In production this is loaded from Azure Key Vault (UAE North).
ARIA_API_KEY=sk-ant-api03-replace-with-real-key

# ── Workflow engine ───────────────────────────────────────────────────────────
# JWT secret for signing internal workflow continuation tokens.
# Generate: openssl rand -base64 32
WORKFLOW_JWT_SECRET=replace_with_random_secret_for_workflow_jwt

# ── Biometric device sync ─────────────────────────────────────────────────────
# Shared secret between AVANIIS HR and biometric attendance devices.
BIOMETRIC_API_KEY=replace_with_biometric_api_key

# ── Email delivery governance ────────────────────────────────────────────────
# disabled  → no outbound delivery
# allowlist → Test/UAT delivery only to EMAIL_TEST_ALLOWLIST
# live      → production delivery only when DATABASE_ENV=production
EMAIL_DELIVERY_MODE=disabled
EMAIL_TEST_ALLOWLIST=

# ── Legacy Email / SMTP (Microsoft 365) ───────────────────────────────────────
# Use an App Password — NOT your regular Microsoft 365 password.
# To create one: https://account.microsoft.com → Security → App passwords
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your.name@yourdomain.com
SMTP_PASS=your_app_password_here
SMTP_FROM=your.name@yourdomain.com

# ── Azure Blob Storage (document vault — leave empty for local dev) ───────────
AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_KEY=
AZURE_STORAGE_CONTAINER=avaniis-hr-docs

# ── Cron job secret (protects /api/cron/* routes) ────────────────────────────
# Generate: openssl rand -base64 32
CRON_SECRET=replace_with_random_cron_secret

# ── Public / Next.js app ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=en


================================================================================
FILE [P4-06b]: .env.local.example
LINES: 117
================================================================================
# ─────────────────────────────────────────────────────────────────────────────
# AVANIIS HR — Local Development Template
#
# Copy this file to .env.local to start local development.
#
# ⚠️  CRITICAL: DO NOT point DATABASE_URL at the production Neon database.
#     Using the Neon production URL here means every migration, seed script,
#     and Playwright E2E test will run directly against production data.
#
# Current state: .env.local still points to the Neon production database.
# You must replace DATABASE_URL with a safe local URL before running any
# write command (db:migrate, db:seed:dev, db:reset:dev, test:e2e).
#
# Safe local options:
#   Option A — Docker Postgres (recommended)
#     docker run --rm -d \
#       --name avaniis-dev-db \
#       -e POSTGRES_DB=avaniis_hcm_dev \
#       -e POSTGRES_USER=postgres \
#       -e POSTGRES_PASSWORD=postgres \
#       -p 5432:5432 postgres:16-alpine
#     Then set: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev
#
#   Option B — Neon branch (copy-on-write, free tier)
#     neon branches create --name my-feature-branch
#     neon connection-string my-feature-branch
#     Then paste the branch URL as DATABASE_URL below, and also set:
#       DATABASE_ENV=development
#       PROD_DATABASE_URL=<production-neon-url>
#       ALLOW_NON_PROD_CLOUD_DB_WRITE=true
#
# See docs/local-development.md for full setup instructions.
# ─────────────────────────────────────────────────────────────────────────────

# ── Environment governance ───────────────────────────────────────────────────
# single-dev-uat → current model: one active DEV/UAT database, production later
# uat-prod       → future model: separate UAT and Production databases
ENV_GOVERNANCE_MODE=single-dev-uat

# ── Database (SAFE LOCAL PLACEHOLDER — replace with your actual local URL) ────
# ⚠️  Do NOT paste the production Neon URL here.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev

# Database environment — tells repo guardrails what tier this DB is.
# Local Docker: use "development"
# Neon personal branch: use "development"
# Current active DEV/UAT: use "uat"
# Future Production: use "production" only in production deployment.
DATABASE_ENV=development

# Set this once a future Production database exists (host comparison only).
# Required when ENV_GOVERNANCE_MODE=uat-prod.
# PROD_DATABASE_URL=postgresql://neondb_owner:...@ep-xxxx.neon.tech/neondb

# ── Database write-safety overrides ──────────────────────────────────────────
# For local Docker: leave both as false (not needed — local is always allowed).
# For Neon branch:  set ALLOW_NON_PROD_CLOUD_DB_WRITE=true (not ALLOW_PRODUCTION).
# For current DEV/UAT reload/clear: set ALLOW_UAT_RELOAD_WRITE=true only during approved windows.
# For production writes: only set ALLOW_PRODUCTION_DB_WRITE=true when explicitly authorised.
# Reload/clear operations are never allowed in production.
# DO NOT commit either override as "true" — export as a one-off shell variable instead.
ALLOW_NON_PROD_CLOUD_DB_WRITE=false
ALLOW_UAT_RELOAD_WRITE=false
ALLOW_PRODUCTION_DB_WRITE=false

# ── Migration console ────────────────────────────────────────────────────────
# Dedicated Test/UAT only. Production must keep this false.
ENABLE_MIGRATION_CONSOLE=false

# ── Auth.js v5 ────────────────────────────────────────────────────────────────
AUTH_SECRET=dev_secret_replace_in_production_32chars
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# ── Microsoft Entra ID (leave empty — use dev accounts locally) ───────────────
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

# ── Dev credentials provider (demo accounts) ─────────────────────────────────
# Enables super.admin@avaniis.dev, hr.admin@avaniis.dev etc. (password: demo)
# Ignored when DATABASE_ENV=production.
ENABLE_DEV_ACCOUNTS=true

# ── Field-level encryption ────────────────────────────────────────────────────
# Generate your own: openssl rand -hex 32
ENCRYPTION_KEY=replace_with_your_own_64_hex_char_key_do_not_use_this_placeholder_xx

# ── ARIA AI Agent ─────────────────────────────────────────────────────────────
ARIA_API_KEY=sk-ant-api03-replace-with-your-own-key

# ── Workflow engine ───────────────────────────────────────────────────────────
WORKFLOW_JWT_SECRET=local-dev-workflow-jwt-secret-replace-before-uat

# ── Biometric device sync ─────────────────────────────────────────────────────
BIOMETRIC_API_KEY=local-dev-biometric-key

# ── Email delivery governance ────────────────────────────────────────────────
# disabled  → no outbound delivery
# allowlist → Test/UAT delivery only to EMAIL_TEST_ALLOWLIST
# live      → production delivery only when DATABASE_ENV=production
EMAIL_DELIVERY_MODE=disabled
EMAIL_TEST_ALLOWLIST=

# ── Legacy Email / SMTP ───────────────────────────────────────────────────────
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your.name@yourdomain.com
SMTP_PASS=your_app_password_here
SMTP_FROM=your.name@yourdomain.com

# ── Cron job secret (protects /api/cron/* routes) ────────────────────────────
CRON_SECRET=local-dev-cron-secret-replace-before-uat

# ── Public / Next.js app ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=en


================================================================================
FILE [P4-07]: drizzle.config.ts
LINES: 15
================================================================================
import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default {
  schema: './drizzle/schema',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config


### P4-01 — Drizzle schema (drizzle/schema/*.ts)

================================================================================
FILE [P4-01]: drizzle/schema/actions.ts
LINES: 90
================================================================================
/**
 * AVANIIS HR — HR Action Request Tables (Task E)
 * Hiring requests, transfer/promotion requests.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  decimal,
} from 'drizzle-orm/pg-core'
import { positions }    from './foundation'
import { TENANT_ID }    from '../../lib/constants'

// ─── Shared helpers (local — can't import from foundation.ts internals) ───────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// hiring_requests
// ══════════════════════════════════════════════════════════════════════════════

export const hiringRequests = pgTable('hiring_requests', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  positionId:      uuid('position_id').notNull().references(() => positions.id),
  departmentId:    uuid('department_id').notNull(),
  // NEW_HIRE | REPLACEMENT | TEMPORARY_STAFF | INTERNAL_TRANSFER
  requestType:     varchar('request_type', { length: 30 }).notNull(),
  replacementFor:  varchar('replacement_for', { length: 200 }),
  requiredByDate:  date('required_by_date'),
  budgetApproved:  boolean('budget_approved').default(false),
  budgetAmount:    decimal('budget_amount', { precision: 12, scale: 2 }),
  justification:   text('justification').notNull(),
  // STANDARD | URGENT | CRITICAL
  urgency:         varchar('urgency', { length: 20 }).default('STANDARD'),
  // PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED | FULFILLED
  status:          varchar('status', { length: 30 }).notNull().default('PENDING_APPROVAL'),
  requestedById:   uuid('requested_by_id').notNull(),
  requestedByName: varchar('requested_by_name', { length: 200 }).notNull(),
  requestedDate:   date('requested_date').notNull().defaultNow(),
  ...audit(),
})

export type HiringRequest    = typeof hiringRequests.$inferSelect
export type NewHiringRequest = typeof hiringRequests.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// transfer_requests
// ══════════════════════════════════════════════════════════════════════════════

export const transferRequests = pgTable('transfer_requests', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull(),
  currentPositionId:   uuid('current_position_id').notNull(),
  targetPositionId:    uuid('target_position_id'),
  targetDepartmentId:  uuid('target_department_id'),
  // Target grade for PROMOTION requests (FK to grades.id enforced in DB — migration 0062).
  targetGradeId:       uuid('target_grade_id'),
  // TRANSFER | PROMOTION
  requestType:         varchar('request_type', { length: 20 }).notNull(),
  effectiveDate:       date('effective_date').notNull(),
  // CAREER_GROWTH | ORG_NEED | PERFORMANCE | PERSONAL | OTHER
  reason:              varchar('reason', { length: 50 }).notNull(),
  notes:               text('notes'),
  // PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED
  status:              varchar('status', { length: 30 }).notNull().default('PENDING_APPROVAL'),
  requestedById:       uuid('requested_by_id').notNull(),
  requestedByName:     varchar('requested_by_name', { length: 200 }).notNull(),
  ...audit(),
})

export type TransferRequest    = typeof transferRequests.$inferSelect
export type NewTransferRequest = typeof transferRequests.$inferInsert


================================================================================
FILE [P4-01]: drizzle/schema/communication.ts
LINES: 242
================================================================================
/**
 * AVANIIS HR — Communication / Email Platform Schema
 *
 * Enterprise, multi-tenant, provider-agnostic email communication platform.
 * Administrators choose the active provider (Microsoft Graph API or SMTP) from
 * Administration → Settings → Communication Settings; all modules send through
 * the admin-selected provider via the EmailService abstraction.
 *
 * BR-COMM-001: Provider secrets (Graph client secret, SMTP password) are stored
 *   AES-256-GCM encrypted (lib/encryption.ts) and NEVER returned in plaintext.
 * BR-COMM-002: Only ONE provider row may be active per (tenant, legal entity).
 * BR-AUDIT-001 / BR-TENANT-001: every table carries audit columns + tenant_id.
 *
 * Approval-action tokens are intentionally NOT defined here — the existing,
 * fully-wired workflow_email_tokens table (drizzle/schema/workflow-engine.ts)
 * + app/api/workflow/action route are reused for secure email approve/reject.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers (mirror foundation.ts) ──────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ─── Enums ───────────────────────────────────────────────────────────────────

export const emailProviderTypeEnum = pgEnum('email_provider_type', [
  'GRAPH_API',
  'SMTP',
])

export const smtpEncryptionEnum = pgEnum('smtp_encryption_type', [
  'NONE',
  'SSL',
  'TLS',
  'STARTTLS',
])

export const emailTestStatusEnum = pgEnum('email_test_status', [
  'UNTESTED',
  'PASSED',
  'FAILED',
])

export const emailMessageStatusEnum = pgEnum('email_message_status', [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
])

export const emailDeliveryEventEnum = pgEnum('email_delivery_event_type', [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'RETRY',
  'BOUNCED',
  'OPENED',
])

// ══════════════════════════════════════════════════════════════════════════════
// email_provider_settings — one active row per (tenant, legal entity)
// ══════════════════════════════════════════════════════════════════════════════

export const emailProviderSettings = pgTable('email_provider_settings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // Nullable now (single global config). Future: per-legal-entity override.
  legalEntityId: uuid('legal_entity_id'),

  providerType:  emailProviderTypeEnum('provider_type').notNull(),
  isActive:      boolean('is_active').notNull().default(false),

  // ── Microsoft Graph API fields ──
  graphTenantId:        varchar('graph_tenant_id', { length: 200 }),
  graphClientId:        varchar('graph_client_id', { length: 200 }),
  graphClientSecretEnc: varchar('graph_client_secret_enc', { length: 500 }), // encrypted
  graphSenderMailbox:   varchar('graph_sender_mailbox', { length: 320 }),
  graphSenderName:      varchar('graph_sender_name', { length: 200 }),
  graphAuthorityUrl:    varchar('graph_authority_url', { length: 500 }),
  graphBaseUrl:         varchar('graph_base_url', { length: 500 }),
  graphMailSendEndpoint: varchar('graph_mail_send_endpoint', { length: 500 }),
  graphScope:           varchar('graph_scope', { length: 500 }),
  graphUseSharedMailbox: boolean('graph_use_shared_mailbox').notNull().default(false),

  // ── SMTP fields ──
  smtpHost:        varchar('smtp_host', { length: 255 }),
  smtpPort:        integer('smtp_port'),
  smtpUsername:    varchar('smtp_username', { length: 320 }),
  smtpPasswordEnc: varchar('smtp_password_enc', { length: 500 }), // encrypted
  smtpEncryption:  smtpEncryptionEnum('smtp_encryption'),
  smtpSenderEmail: varchar('smtp_sender_email', { length: 320 }),
  smtpSenderName:  varchar('smtp_sender_name', { length: 200 }),
  smtpAuthRequired: boolean('smtp_auth_required').notNull().default(true),

  // ── Shared behaviour flags ──
  replyToEmail:         varchar('reply_to_email', { length: 320 }),
  enableTracking:       boolean('enable_tracking').notNull().default(false),
  enableWorkflowActions: boolean('enable_workflow_actions').notNull().default(true),
  tokenExpiryMinutes:   integer('token_expiry_minutes').notNull().default(2880), // 48h
  retryCount:           integer('retry_count').notNull().default(3),
  retryIntervalSec:     integer('retry_interval_sec').notNull().default(300),

  // ── Test / activation governance ──
  lastTestedAt:   timestamp('last_tested_at', { withTimezone: true }),
  lastTestStatus: emailTestStatusEnum('last_test_status').notNull().default('UNTESTED'),
  lastTestError:  text('last_test_error'),
  activationOverrideReason: text('activation_override_reason'),

  ...audit(),
}, (t) => ({
  byTenant: index('idx_email_provider_tenant').on(t.tenantId),
  byActive: index('idx_email_provider_active').on(t.tenantId, t.isActive),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_sender_defaults — per-tenant sender identities (module overrides)
// ══════════════════════════════════════════════════════════════════════════════

export const emailSenderDefaults = pgTable('email_sender_defaults', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id'),

  defaultFromName:  varchar('default_from_name', { length: 200 }),
  defaultFromEmail: varchar('default_from_email', { length: 320 }),
  defaultReplyTo:   varchar('default_reply_to', { length: 320 }),

  hrSender:           varchar('hr_sender', { length: 320 }),
  payrollSender:      varchar('payroll_sender', { length: 320 }),
  workflowSender:     varchar('workflow_sender', { length: 320 }),
  systemSender:       varchar('system_sender', { length: 320 }),
  announcementSender: varchar('announcement_sender', { length: 320 }),
  fallbackSender:     varchar('fallback_sender', { length: 320 }),

  ...audit(),
}, (t) => ({
  byTenant: index('idx_email_sender_defaults_tenant').on(t.tenantId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_templates — reusable, bilingual, branded templates with placeholders
// ══════════════════════════════════════════════════════════════════════════════

export const emailTemplates = pgTable('email_templates', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),

  templateCode:    varchar('template_code', { length: 80 }).notNull(),
  templateName:    varchar('template_name', { length: 200 }).notNull(),
  subjectTemplate: text('subject_template').notNull(),
  bodyHtmlTemplate: text('body_html_template').notNull(),
  bodyTextTemplate: text('body_text_template'),
  module:          varchar('module', { length: 60 }).notNull().default('system'),
  languageCode:    varchar('language_code', { length: 5 }).notNull().default('en'),
  isActive:        boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  byCode: index('idx_email_templates_code').on(t.tenantId, t.templateCode, t.languageCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_messages — one row per outbound email (queue + delivery log)
// ══════════════════════════════════════════════════════════════════════════════

export const emailMessages = pgTable('email_messages', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),

  providerType:      emailProviderTypeEnum('provider_type'),
  templateCode:      varchar('template_code', { length: 80 }),
  module:            varchar('module', { length: 60 }),
  recipientEmail:    varchar('recipient_email', { length: 320 }).notNull(),
  recipientPersonId: uuid('recipient_person_id'),
  senderEmail:       varchar('sender_email', { length: 320 }),
  subject:           text('subject'),

  status:        emailMessageStatusEnum('status').notNull().default('QUEUED'),

  businessObjectType: varchar('business_object_type', { length: 80 }),
  businessObjectId:   uuid('business_object_id'),
  workflowRequestId:  uuid('workflow_request_id'),
  workflowStepId:     uuid('workflow_step_id'),

  providerMessageId: varchar('provider_message_id', { length: 255 }),
  correlationId:     uuid('correlation_id').notNull().defaultRandom(),
  retryCount:        integer('retry_count').notNull().default(0),
  lastError:         text('last_error'),
  // Rendered placeholder values + rendered html, kept for retry/audit/inspection.
  payloadJson:       jsonb('payload_json').$type<Record<string, unknown>>(),

  sendAfter:     timestamp('send_after', { withTimezone: true }).defaultNow().notNull(),
  sentAt:        timestamp('sent_at', { withTimezone: true }),

  ...audit(),
}, (t) => ({
  byStatus:   index('idx_email_messages_status').on(t.tenantId, t.status, t.sendAfter),
  byObject:   index('idx_email_messages_object').on(t.businessObjectType, t.businessObjectId),
  byWorkflow: index('idx_email_messages_workflow').on(t.workflowRequestId),
  byCorrelation: index('idx_email_messages_correlation').on(t.correlationId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_delivery_events — append-only delivery lifecycle events per message
// ══════════════════════════════════════════════════════════════════════════════

export const emailDeliveryEvents = pgTable('email_delivery_events', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  emailMessageId: uuid('email_message_id').notNull(),
  eventType:      emailDeliveryEventEnum('event_type').notNull(),
  eventPayload:   jsonb('event_payload').$type<Record<string, unknown>>(),
  occurredAt:     timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byMessage: index('idx_email_delivery_events_message').on(t.emailMessageId),
}))


================================================================================
FILE [P4-01]: drizzle/schema/configuration.ts
LINES: 738
================================================================================
/**
 * AVANIIS HR — Configuration Schema
 * Configurable tables managed by HR Admins via the Config module.
 *
 * Updated: April 2026 — aligned to ERD_PHASE1_DATA_MODEL.md v3
 *   • work_schedules      — added per-day time cols + Ramadan cols (ERD 7.1)
 *   • public_holidays     — aligned column names + added missing cols (ERD 7.10)
 *   • compliance_rules    — aligned to ERD 10.1 structure
 *   • grade_salary_ranges — added housing/transport allowance cols (ERD 10.6)
 *   • medical_insurance_plans — added full ERD 9.1 columns
 *
 * BR-AUDIT-001: All tables carry 7 audit columns.
 * BR-TENANT-001: All tables carry tenant_id.
 */
import {
  pgTable,
  uuid,
  varchar,
  char,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { legalEntities, grades, absenceTypes } from './foundation'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers ────────────────────────────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// 1 — DYNAMIC SCHEMA BUILDER
// Replaces the old hardcoded department_extra_fields table.
// Values stored as JSONB in entities.extra_data column.
// ══════════════════════════════════════════════════════════════════════════════

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  // persons | worker_assignments | positions | departments
  objectType:    varchar('object_type', { length: 50 }).notNull(),
  // Unique API identifier — used as JSONB key in extra_data
  apiName:       varchar('api_name', { length: 100 }).notNull(),
  labelEn:       varchar('label_en', { length: 200 }).notNull(),
  labelAr:       varchar('label_ar', { length: 200 }),
  // TEXT | NUMBER | DATE | CURRENCY | CHECKBOX | PICKLIST | MULTI_PICKLIST | LONG_TEXT | URL
  dataType:      varchar('data_type', { length: 30 }).notNull(),
  // Optional: validates against a lookup_type for PICKLIST fields
  picklistLookupType: varchar('picklist_lookup_type', { length: 100 }),
  isRequired:    boolean('is_required').notNull().default(false),
  isSearchable:  boolean('is_searchable').notNull().default(false),
  isEncrypted:   boolean('is_encrypted').notNull().default(false),
  // Which department types see this field (NULL = all)
  visibleToDepartmentTypes: text('visible_to_department_types').array(),
  // Validation rules JSON: { min, max, regex, ... }
  validationRules: jsonb('validation_rules'),
  defaultValue:  text('default_value'),
  helpTextEn:    text('help_text_en'),
  helpTextAr:    text('help_text_ar'),
  displayOrder:  integer('display_order').notNull().default(0),
  sectionCode:   varchar('section_code', { length: 50 }),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 2 — WORKFLOW ENGINE (ERD §7.2–7.4)
// Configurable multi-step approval workflows.
// workflow_instances lives in transactions.ts (operational, not config).
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDefinitions = pgTable('workflow_definitions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:  uuid('legal_entity_id').references(() => legalEntities.id),
  workflowCode:   varchar('workflow_code', { length: 50 }).notNull(),
  workflowNameEn: varchar('workflow_name_en', { length: 200 }).notNull(),
  workflowNameAr: varchar('workflow_name_ar', { length: 200 }),
  // HIRE | TRANSFER | LEAVE | SALARY_REVISION | TERMINATION |
  // DEPENDENT_ADD | DOCUMENT_VERIFY | OVERTIME | EXIT_CLEARANCE
  triggerEvent:   varchar('trigger_event', { length: 50 }).notNull(),
  conditionRules: jsonb('condition_rules'),
  // SEQUENTIAL | PARALLEL
  approvalMode:   varchar('approval_mode', { length: 20 }).notNull().default('SEQUENTIAL'),
  slaHours:        integer('sla_hours').notNull().default(48),
  escalationHours: integer('escalation_hours').notNull().default(72),
  isActive:       boolean('is_active').notNull().default(true),
  version:        integer('version').notNull().default(1),
  ...audit(),
})

export const workflowStages = pgTable('workflow_stages', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  stageOrder:           integer('stage_order').notNull(),
  stageNameEn:          varchar('stage_name_en', { length: 200 }).notNull(),
  stageNameAr:          varchar('stage_name_ar', { length: 200 }),
  // ROLE | PERSON | POSITION | DYNAMIC
  approverType:         varchar('approver_type', { length: 20 }).notNull(),
  // DIRECT_MANAGER | HR_MANAGER | FINANCE_HEAD | LEGAL_ENTITY_HEAD | SYSTEM | CUSTOM
  approverRoleCode:     varchar('approver_role_code', { length: 50 }),
  approverPersonId:     uuid('approver_person_id'),
  dynamicApproverExpr:  varchar('dynamic_approver_expr', { length: 200 }),
  canDelegate:          boolean('can_delegate').notNull().default(true),
  isOptional:           boolean('is_optional').notNull().default(false),
  stageSlaHours:        integer('stage_sla_hours').notNull().default(24),
  // S9-01 — per-stage escalation role; must outrank approverRoleCode
  // (assertEscalationRoleHigher). NULL = use the workflow-level escalationHours
  // window with no role-targeted escalation.
  escalationRoleCode:   varchar('escalation_role_code', { length: 50 }),
  // APPROVE_REJECT | ACKNOWLEDGE | INFO_ONLY
  actionType:           varchar('action_type', { length: 30 }).notNull().default('APPROVE_REJECT'),
  ...audit(),
})

export const workflowRoutingRules = pgTable('workflow_routing_rules', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  priority:          integer('priority').notNull(),
  conditionField:    varchar('condition_field', { length: 100 }).notNull(),
  // = | != | > | < | >= | <= | IN | NOT_IN | IS_NULL | IS_NOT_NULL
  conditionOperator: varchar('condition_operator', { length: 20 }).notNull(),
  conditionValue:    text('condition_value').notNull(),
  // AND | OR
  logicalOperator:   varchar('logical_operator', { length: 5 }).notNull().default('AND'),
  isActive:          boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 3 — WORK SCHEDULES (ERD §7.1)
// Added per-day time columns + Ramadan columns to match ERD.
// work_schedule_patterns kept for detailed day-pattern support.
// ══════════════════════════════════════════════════════════════════════════════

export const workSchedules = pgTable('work_schedules', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:       uuid('legal_entity_id').references(() => legalEntities.id),
  scheduleCode:        varchar('schedule_code', { length: 30 }).notNull(),
  scheduleNameEn:      varchar('schedule_name_en', { length: 200 }).notNull(),
  scheduleNameAr:      varchar('schedule_name_ar', { length: 200 }),
  // STANDARD | RAMADAN | SHIFT | FLEXIBLE | PART_TIME
  scheduleType:        varchar('schedule_type', { length: 30 }).notNull().default('STANDARD'),
  // Per-day start/end times (HH:MM; NULL = non-working day) — ERD 7.1
  mondayStart:         varchar('monday_start', { length: 5 }),
  mondayEnd:           varchar('monday_end', { length: 5 }),
  tuesdayStart:        varchar('tuesday_start', { length: 5 }),
  tuesdayEnd:          varchar('tuesday_end', { length: 5 }),
  wednesdayStart:      varchar('wednesday_start', { length: 5 }),
  wednesdayEnd:        varchar('wednesday_end', { length: 5 }),
  thursdayStart:       varchar('thursday_start', { length: 5 }),
  thursdayEnd:         varchar('thursday_end', { length: 5 }),
  fridayStart:         varchar('friday_start', { length: 5 }),
  fridayEnd:           varchar('friday_end', { length: 5 }),
  saturdayStart:       varchar('saturday_start', { length: 5 }),
  saturdayEnd:         varchar('saturday_end', { length: 5 }),
  sundayStart:         varchar('sunday_start', { length: 5 }),
  sundayEnd:           varchar('sunday_end', { length: 5 }),
  totalHoursPerWeek:   numeric('total_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // Weekend days as array: [5,6] = Friday+Saturday (UAE standard)
  weekendDays:         integer('weekend_days').array().notNull().default([5, 6]),
  breakMinutes:        integer('break_minutes').notNull().default(60),
  isRamadanSchedule:   boolean('is_ramadan_schedule').notNull().default(false),
  ramadanHoursPerDay:  numeric('ramadan_hours_per_day', { precision: 4, scale: 2 }).default('6.00'),
  isActive:            boolean('is_active').notNull().default(true),
  isDefault:           boolean('is_default').notNull().default(false),
  ...audit(),
})

export const workSchedulePatterns = pgTable('work_schedule_patterns', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workScheduleId: uuid('work_schedule_id').notNull().references(() => workSchedules.id),
  // 0=Sunday, 1=Monday, … 6=Saturday
  dayOfWeek:      integer('day_of_week').notNull(),
  isWorkingDay:   boolean('is_working_day').notNull().default(true),
  startTime:      varchar('start_time', { length: 5 }),
  endTime:        varchar('end_time', { length: 5 }),
  breakMinutes:   integer('break_minutes').notNull().default(60),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 4 — PUBLIC HOLIDAYS (ERD §7.10)
// Aligned column names and added: holidayCode, holidayNameEn/Ar, holidayYear,
// endDate, durationDays, isFloating, announcedDate, appliesTo.
// ══════════════════════════════════════════════════════════════════════════════

export const publicHolidays = pgTable('public_holidays', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  holidayYear:   integer('holiday_year').notNull(),
  holidayCode:   varchar('holiday_code', { length: 30 }).notNull(),
  holidayNameEn: varchar('holiday_name_en', { length: 200 }).notNull(),
  holidayNameAr: varchar('holiday_name_ar', { length: 200 }).notNull(),
  holidayDate:   date('holiday_date').notNull(),
  // Multi-day holidays (Eid = 3 days)
  endDate:       date('end_date'),
  durationDays:  integer('duration_days').notNull().default(1),
  // Hijri calendar-based holidays (float each year)
  isFloating:    boolean('is_floating').notNull().default(false),
  announcedDate: date('announced_date'),
  isConfirmed:   boolean('is_confirmed').notNull().default(false),
  // ALL | MUSLIMS_ONLY | PUBLIC_SECTOR_ONLY
  appliesTo:     varchar('applies_to', { length: 20 }).notNull().default('ALL'),
  emirate:       varchar('emirate', { length: 50 }),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 5 — LEAVE RULE SETS (ERD §4 config tables)
// ══════════════════════════════════════════════════════════════════════════════

export const leaveRuleSets = pgTable('leave_rule_sets', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:   uuid('legal_entity_id').references(() => legalEntities.id),
  ruleSetCode:     varchar('rule_set_code', { length: 50 }).notNull(),
  ruleSetNameEn:   varchar('rule_set_name_en', { length: 200 }).notNull(),
  ruleSetNameAr:   varchar('rule_set_name_ar', { length: 200 }),
  // MAINLAND | DIFC | ADGM | FREEZONE
  entityTypeScope:    varchar('entity_type_scope', { length: 20 }),
  // UAE_NATIONAL | GCC_NATIONAL | EXPAT | ALL
  nationalityScope:   varchar('nationality_scope', { length: 20 }).default('ALL'),
  // FULL_TIME | PART_TIME | ALL
  employmentTypeScope: varchar('employment_type_scope', { length: 30 }).default('ALL'),
  effectiveFrom:   date('effective_from').notNull(),
  effectiveTo:     date('effective_to'),
  isActive:        boolean('is_active').notNull().default(true),
  isDefault:       boolean('is_default').notNull().default(false),
  ...audit(),
})

export const leaveRuleLines = pgTable('leave_rule_lines', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  leaveRuleSetId:       uuid('leave_rule_set_id').notNull().references(() => leaveRuleSets.id),
  absenceTypeCode:      varchar('absence_type_code', { length: 30 }).notNull(),
  // [{ minServiceMonths: 0, maxServiceMonths: 12, daysEntitled: 22 }, ...]
  entitlementTiersJson: jsonb('entitlement_tiers_json').notNull(),
  maxCarryForwardDays:  numeric('max_carry_forward_days', { precision: 5, scale: 1 }).notNull().default('0'),
  carryForwardExpiryMonths: integer('carry_forward_expiry_months').notNull().default(0),
  isProRated:           boolean('is_pro_rated').notNull().default(true),
  // MONTHLY | DAILY | ANNUALLY
  accrualFrequency:     varchar('accrual_frequency', { length: 20 }).notNull().default('MONTHLY'),
  minServiceMonths:     integer('min_service_months').notNull().default(0),
  maxDaysPerYear:       numeric('max_days_per_year', { precision: 6, scale: 2 }),
  encashmentAllowed:    boolean('encashment_allowed').notNull().default(false),
  encashmentMaxDays:    numeric('encashment_max_days', { precision: 5, scale: 1 }),
  isActive:             boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 6 — NOTIFICATION TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

export const notificationTemplates = pgTable('notification_templates', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:   uuid('legal_entity_id').references(() => legalEntities.id),
  templateCode:    varchar('template_code', { length: 100 }).notNull(),
  templateNameEn:  varchar('template_name_en', { length: 200 }).notNull(),
  // LEAVE_APPROVED | DOCUMENT_EXPIRING | SALARY_PROCESSED | WORKFLOW_PENDING | etc.
  eventType:       varchar('event_type', { length: 100 }).notNull(),
  // EMAIL | PUSH | IN_APP | SMS | WHATSAPP
  channel:         varchar('channel', { length: 20 }).notNull(),
  language:        varchar('language', { length: 10 }).notNull().default('en'),
  subjectEn:       varchar('subject_en', { length: 500 }),
  subjectAr:       varchar('subject_ar', { length: 500 }),
  bodyEn:          text('body_en').notNull(),
  bodyAr:          text('body_ar'),
  availableVarsJson: jsonb('available_vars_json'),
  // EMPLOYEE | MANAGER | HR_ADMIN | PAYROLL_ADMIN | FINANCE
  recipientRoles:  text('recipient_roles').array().notNull().default(['EMPLOYEE']),
  advanceNoticeDays: integer('advance_notice_days').array(),
  isActive:        boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 7 — POLICY SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export const policySettings = pgTable('policy_settings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  settingKey:    varchar('setting_key', { length: 200 }).notNull(),
  settingNameEn: varchar('setting_name_en', { length: 300 }).notNull(),
  settingNameAr: varchar('setting_name_ar', { length: 300 }),
  // STRING | NUMBER | BOOLEAN | JSON | DATE
  valueType:     varchar('value_type', { length: 20 }).notNull().default('STRING'),
  settingValue:  text('setting_value').notNull(),
  moduleCode:    varchar('module_code', { length: 50 }).notNull(),
  isOverridable: boolean('is_overridable').notNull().default(false),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:   date('effective_to'),
  notes:         text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 8 — COMPLIANCE RULES (ERD §10.1)
// Aligned to ERD 10.1: rule_id, module, entity_types[], article_ref,
// rule_type, formula JSONB, effective_date, sunset_date, priority.
// ══════════════════════════════════════════════════════════════════════════════

export const complianceRules = pgTable('compliance_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // Per-entity override support (NULL = system-wide rule)
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  // e.g., BR-EOSB-001 | BR-AL-001 | BR-WPS-001 | BR-GPSSA-001
  ruleId:        varchar('rule_id', { length: 30 }).notNull(),
  // CORE_HR | ABSENCE | PAYROLL | INSURANCE | WORKFLOW | ALL
  module:        varchar('module', { length: 30 }).notNull(),
  // ARRAY['MAINLAND'] | ARRAY['MAINLAND','FREEZONE'] | ARRAY['DIFC']
  entityTypes:   varchar('entity_types', { length: 20 }).array().notNull().default(['MAINLAND']),
  // e.g., 'Article 51, FDL 33/2021'
  articleRef:    text('article_ref').notNull(),
  // CALCULATION | VALIDATION | ALERT | ROUTING
  ruleType:      varchar('rule_type', { length: 20 }).notNull(),
  descriptionEn: text('description_en').notNull(),
  descriptionAr: text('description_ar'),
  // Formula JSON: { "type": "EOSB_BAND", "rate_yr1_5": 21, "rate_yr5_plus": 30, "cap_months": 24 }
  formula:       jsonb('formula'),
  effectiveDate: date('effective_date').notNull(),
  sunsetDate:    date('sunset_date'),
  isActive:      boolean('is_active').notNull().default(true),
  isOverridable: boolean('is_overridable').notNull().default(false),
  priority:      integer('priority').notNull().default(0),
  // Keeps backward-compat column for entity-specific scope
  nationalityScope: varchar('nationality_scope', { length: 20 }).default('ALL'),
  notes:         text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 9 — GRADE SALARY RANGES (ERD §10.6)
// Added: basic_min/mid/max (renamed from min/mid/max_salary),
// housing_type, housing_value, transport_type, transport_value,
// phone_allowance, car_allowance.
// ══════════════════════════════════════════════════════════════════════════════

export const gradeSalaryRanges = pgTable('grade_salary_ranges', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  gradeId:           uuid('grade_id').notNull().references(() => grades.id),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  effectiveStartDate: date('effective_start_date').notNull(),
  effectiveEndDate:   date('effective_end_date'),
  // Basic salary range (AED/month)
  basicMin:        numeric('basic_min', { precision: 12, scale: 2 }).notNull(),
  basicMid:        numeric('basic_mid', { precision: 12, scale: 2 }).notNull(),
  basicMax:        numeric('basic_max', { precision: 12, scale: 2 }).notNull(),
  // Housing allowance config — PERCENTAGE of basic OR FIXED_AMOUNT
  housingType:     varchar('housing_type', { length: 20 }).notNull().default('PERCENTAGE'),
  // 0.25 = 25% of basic, OR fixed AED amount
  housingValue:    numeric('housing_value', { precision: 10, scale: 4 }).notNull().default('0.25'),
  // Transport allowance config
  transportType:   varchar('transport_type', { length: 20 }).notNull().default('FIXED_AMOUNT'),
  transportValue:  numeric('transport_value', { precision: 10, scale: 4 }).notNull().default('1500'),
  phoneAllowance:  numeric('phone_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  carAllowance:    numeric('car_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  currency:        char('currency', { length: 3 }).notNull().default('AED'),
  // Optional per-step ranges (array of { step: 1, amount: 15000 })
  stepsJson:       jsonb('steps_json'),
  approvedBy:      uuid('approved_by'),
  notes:           text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 10 — MEDICAL INSURANCE PLANS (ERD §9.1)
// Fully aligned to ERD 9.1: added tpaName, policyNumber, coverage details,
// per-role premiums, policy dates, gradeIds[], employmentTypes[], isDefaultPlan.
// ══════════════════════════════════════════════════════════════════════════════

export const medicalInsurancePlans = pgTable('medical_insurance_plans', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:    uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  planCode:         varchar('plan_code', { length: 50 }).notNull(),
  planNameEn:       varchar('plan_name_en', { length: 200 }).notNull(),
  planNameAr:       varchar('plan_name_ar', { length: 200 }),
  // Provider details
  providerName:     varchar('provider_name', { length: 200 }).notNull(),
  tpaName:          varchar('tpa_name', { length: 200 }),
  policyNumber:     varchar('policy_number', { length: 100 }).notNull(),
  networkName:      varchar('network_name', { length: 100 }),
  // ESSENTIAL_BENEFITS | BASIC | ENHANCED | PREMIUM | EXECUTIVE | CUSTOM
  planCategory:     varchar('plan_category', { length: 30 }).notNull(),
  // Coverage limits
  inpatientLimitAed:   numeric('inpatient_limit_aed', { precision: 12, scale: 2 }),
  outpatientLimitAed:  numeric('outpatient_limit_aed', { precision: 12, scale: 2 }),
  dentalCovered:       boolean('dental_covered').notNull().default(false),
  opticalCovered:      boolean('optical_covered').notNull().default(false),
  maternityCovered:    boolean('maternity_covered').notNull().default(true),
  preExistingCovered:  boolean('pre_existing_covered').notNull().default(false),
  repatriationCovered: boolean('repatriation_covered').notNull().default(false),
  // Eligibility
  gradeIds:            uuid('grade_ids').array(),           // NULL = all grades
  employmentTypes:     text('employment_types').array(),    // NULL = all types
  minServiceMonths:    integer('min_service_months').notNull().default(0),
  dependentsCovered:   boolean('dependents_covered').notNull().default(true),
  maxDependents:       integer('max_dependents').notNull().default(9),
  // Annual premiums per person type
  employeePremiumAed:  numeric('employee_premium_aed', { precision: 10, scale: 2 }).notNull(),
  spousePremiumAed:    numeric('spouse_premium_aed', { precision: 10, scale: 2 }),
  childPremiumAed:     numeric('child_premium_aed', { precision: 10, scale: 2 }),
  parentPremiumAed:    numeric('parent_premium_aed', { precision: 10, scale: 2 }),
  // Policy dates
  policyStartDate:     date('policy_start_date').notNull(),
  policyEndDate:       date('policy_end_date').notNull(),
  renewalDate:         date('renewal_date'),
  isActive:            boolean('is_active').notNull().default(true),
  isDefaultPlan:       boolean('is_default_plan').notNull().default(false),
  // Legacy fields kept for backward compat
  regulatoryScheme:    varchar('regulatory_scheme', { length: 20 }),
  employerContributionPct: numeric('employer_contribution_pct', { precision: 5, scale: 2 }).notNull().default('100'),
  eligibleGradeLevelMin: integer('eligible_grade_level_min'),
  eligibleGradeLevelMax: integer('eligible_grade_level_max'),
  coverageDetailsJson:   jsonb('coverage_details_json'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 11 — DOCUMENT TYPE CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

export const documentTypeConfigs = pgTable('document_type_configs', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:        uuid('legal_entity_id').references(() => legalEntities.id),
  // EMIRATES_ID | PASSPORT | VISA | LABOUR_CARD | CONTRACT | DEGREE | etc.
  documentType:         varchar('document_type', { length: 50 }).notNull(),
  nameEn:               varchar('name_en', { length: 200 }).notNull(),
  nameAr:               varchar('name_ar', { length: 200 }),
  isMandatory:          boolean('is_mandatory').notNull().default(false),
  // UAE_NATIONAL | GCC_NATIONAL | EXPAT | ALL
  nationalityScope:     varchar('nationality_scope', { length: 20 }).default('ALL'),
  alertDaysBeforeExpiry: integer('alert_days_before_expiry').array().notNull().default([90, 60, 30, 14]),
  alertRecipients:      text('alert_recipients').array().notNull().default(['HR_ADMIN']),
  maxFileSizeMb:        integer('max_file_size_mb').notNull().default(10),
  allowedMimeTypes:     text('allowed_mime_types').array().notNull().default(['application/pdf', 'image/jpeg', 'image/png']),
  isActive:             boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// 12 — FORM CONFIGURATIONS (D-08 / S2-07)
// Per-entity form layouts that drive `resolveFormConfig` in lib/config-resolver.
// The `config` JSONB stores `{ sections: FormSection[] }` so the runtime can
// reorder, hide, or extend sections without a schema change.
// UNIQUE (tenant_id, entity_type, role) — at most one active layout per scope.
// ══════════════════════════════════════════════════════════════════════════════

export const formConfigurations = pgTable('form_configurations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  // PERSON | CONTRACT | LEAVE_REQUEST (extend as new entity types ship)
  entityType:    varchar('entity_type', { length: 50 }).notNull(),
  // HR_ADMIN | EMPLOYEE | MANAGER | ALL — ALL is the fallback layout
  role:          varchar('role', { length: 50 }).notNull().default('ALL'),
  // { sections: [{ sectionCode, labelEn, labelAr, fields: [...] }, ...] }
  config:        jsonb('config').$type<{ sections: unknown[] }>().notNull(),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
}, (t) => ({
  scopeUniq: uniqueIndex('form_configurations_scope_uniq').on(
    t.tenantId, t.entityType, t.role,
  ),
}))

// ══════════════════════════════════════════════════════════════════════════════
// PAGE PERSONALIZATION
// Controls the sign-in page appearance and content per legal entity.
// ══════════════════════════════════════════════════════════════════════════════

export const pagePersonalization = pgTable('page_personalization', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  entityId:            uuid('entity_id').references(() => legalEntities.id, { onDelete: 'cascade' }),

  // Top banner
  topBannerText:       text('top_banner_text').notNull().default('AI Driven HR System'),
  topBannerVisible:    boolean('top_banner_visible').notNull().default(true),

  // Scrolling ticker
  tickerText:          text('ticker_text').notNull().default('AVANIIS Stock Price 100$ · Founder — Visionary Leader — Mr. Talal Al Gaddah'),
  tickerVisible:       boolean('ticker_visible').notNull().default(true),
  tickerSpeed:         integer('ticker_speed').notNull().default(30),

  // Carousel images: [{ id, url, alt, order, uploadedAt, fileSize? }]
  carouselImages:      jsonb('carousel_images').notNull().default([]),

  // Custom logo (null = use default)
  logoUrl:             text('logo_url'),

  // Carousel area height as percentage of left column (40–85)
  carouselHeightPct:   integer('carousel_height_pct').notNull().default(70),

  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:           uuid('updated_by'),
}, table => ({
  entityUnique: uniqueIndex('page_personalization_entity_unique').on(table.entityId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 13 — FEATURE PERMISSIONS (Step 4 — Admin Panel)
// Per-feature, per-role permission matrix managed via the admin UI.
// Rows with is_system_locked = true are display-only — UI cannot toggle them.
// ══════════════════════════════════════════════════════════════════════════════

export const featurePermissions = pgTable('feature_permissions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  featureKey:     varchar('feature_key', { length: 80 }).notNull(),
  featureLabel:   varchar('feature_label', { length: 200 }).notNull(),
  featureGroup:   varchar('feature_group', { length: 80 }).notNull(),
  // { view, create, edit, delete, approve, export } booleans
  employeePerms:  jsonb('employee_perms').$type<PermSet>().notNull(),
  managerPerms:   jsonb('manager_perms').$type<PermSet>().notNull(),
  hrAdminPerms:   jsonb('hr_admin_perms').$type<PermSet>().notNull(),
  isSystemLocked: boolean('is_system_locked').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Permission type shared between schema and application layer ──────────────

export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export'
export type PermSet    = Record<PermAction, boolean>

export type FeaturePermission    = typeof featurePermissions.$inferSelect
export type NewFeaturePermission = typeof featurePermissions.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// 15 — COMPANY CURRENCY SETTINGS
// Effective-dated, auditable currency configuration per legal entity.
// Separate table (not extending legal_entities) because:
//   • decimal_places, rounding_method, effective dates need full audit trail
//   • multiple historical configs per entity must co-exist (effective dating)
//   • legalEntities.defaultCurrency is char(3) only — cannot carry precision
// BR-CCY-001: Only one ACTIVE config may overlap a given effective date range
//             per legal entity.
// BR-CCY-002: Default AED / 2 dp / HALF_UP is applied when no config exists.
// ══════════════════════════════════════════════════════════════════════════════

export const companyCurrencySettings = pgTable('company_currency_settings', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:   uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // ISO 4217 three-letter currency code
  currencyCode:    char('currency_code', { length: 3 }).notNull(),
  currencyNameEn:  varchar('currency_name_en', { length: 100 }).notNull(),
  currencyNameAr:  varchar('currency_name_ar', { length: 100 }).notNull(),
  currencySymbol:  varchar('currency_symbol', { length: 10 }).notNull(),
  // 0–6 inclusive; most currencies use 2, KWD/BHD/OMR use 3, JPY uses 0
  decimalPlaces:   integer('decimal_places').notNull().default(2),
  // HALF_UP | HALF_EVEN | FLOOR | CEIL | TRUNCATE
  roundingMethod:  varchar('rounding_method', { length: 20 }).notNull().default('HALF_UP'),
  effectiveFrom:   date('effective_from').notNull(),
  effectiveTo:     date('effective_to'),
  isActive:        boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// INFERRED TYPESCRIPT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type CustomFieldDefinition  = typeof customFieldDefinitions.$inferSelect
export type WorkflowDefinition     = typeof workflowDefinitions.$inferSelect
export type WorkflowStage          = typeof workflowStages.$inferSelect
export type WorkflowRoutingRule    = typeof workflowRoutingRules.$inferSelect
export type WorkSchedule           = typeof workSchedules.$inferSelect
export type WorkSchedulePattern    = typeof workSchedulePatterns.$inferSelect
export type PublicHoliday          = typeof publicHolidays.$inferSelect
export type LeaveRuleSet           = typeof leaveRuleSets.$inferSelect
export type LeaveRuleLine          = typeof leaveRuleLines.$inferSelect
export type NotificationTemplate   = typeof notificationTemplates.$inferSelect
export type PolicySetting          = typeof policySettings.$inferSelect
export type ComplianceRule         = typeof complianceRules.$inferSelect
export type GradeSalaryRange       = typeof gradeSalaryRanges.$inferSelect
export type MedicalInsurancePlan   = typeof medicalInsurancePlans.$inferSelect
export type DocumentTypeConfig     = typeof documentTypeConfigs.$inferSelect
export type FormConfiguration      = typeof formConfigurations.$inferSelect

export type NewFormConfiguration   = typeof formConfigurations.$inferInsert
export type NewWorkflowDefinition  = typeof workflowDefinitions.$inferInsert
export type NewWorkflowInstance_deprecated = never  // moved to transactions.ts
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert
export type NewComplianceRule      = typeof complianceRules.$inferInsert
export type NewGradeSalaryRange    = typeof gradeSalaryRanges.$inferInsert
export type PagePersonalization    = typeof pagePersonalization.$inferSelect
export type NewPagePersonalization = typeof pagePersonalization.$inferInsert
export type CompanyCurrencySetting    = typeof companyCurrencySettings.$inferSelect
export type NewCompanyCurrencySetting = typeof companyCurrencySettings.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// 14 — ARIA AI AGENT CONFIGURATION
// Four tables that drive the ARIA AI agent: identity, model/provider settings,
// behaviour tuning, and knowledge sources for RAG.
// ══════════════════════════════════════════════════════════════════════════════

export const ariaAgentConfig = pgTable('aria_agent_config', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  agentName:    varchar('agent_name', { length: 100 }).notNull().default('ARIA'),
  agentNameAr:  varchar('agent_name_ar', { length: 100 }),
  agentRole:    varchar('agent_role', { length: 100 }).notNull().default('HR Intelligence Assistant'),
  // 'professional' | 'friendly' | 'analytical' | 'executive' | 'strict'
  agentTone:    varchar('agent_tone', { length: 50 }).notNull().default('professional'),
  avatarUrl:    varchar('avatar_url', { length: 500 }),
  // Branding — Migration 0040
  welcomeText:    text('welcome_text'),
  welcomeTextAr:  text('welcome_text_ar'),
  footerLabel:    varchar('footer_label', { length: 200 }),
  footerLabelAr:  varchar('footer_label_ar', { length: 200 }),
  accentColor:    varchar('accent_color', { length: 20 }),
  isActive:     boolean('is_active').notNull().default(true),
  ...audit(),
})

export const ariaModelConfig = pgTable('aria_model_config', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // 'anthropic' | 'openai' | 'azure_openai' | 'google'
  provider:                varchar('provider', { length: 50 }).notNull().default('anthropic'),
  modelId:                 varchar('model_id', { length: 100 }).notNull().default('claude-sonnet-4-6'),
  // AES-256-GCM via lib/encryption.ts — NEVER store plaintext
  apiKeyEncrypted:         varchar('api_key_encrypted', { length: 1000 }),
  // null = use SDK default; used for Azure OpenAI
  apiEndpoint:             varchar('api_endpoint', { length: 500 }),
  temperature:             numeric('temperature', { precision: 3, scale: 2 }).notNull().default('0.3'),
  maxTokens:               integer('max_tokens').notNull().default(1000),
  fallbackProvider:        varchar('fallback_provider', { length: 50 }),
  fallbackModelId:         varchar('fallback_model_id', { length: 100 }),
  fallbackApiKeyEncrypted: varchar('fallback_api_key_encrypted', { length: 1000 }),
  isActive:                boolean('is_active').notNull().default(true),
  ...audit(),
})

export const ariaBehaviourConfig = pgTable('aria_behaviour_config', {
  id:                        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // null = use default; if set, applied per promptMode
  systemPromptOverride:      text('system_prompt_override'),
  // 'prepend' | 'replace' | 'append'
  promptMode:                varchar('prompt_mode', { length: 20 }).notNull().default('prepend'),
  // 'advisory' | 'recommend_approve' | 'full_execution'
  authorityLevel:            varchar('authority_level', { length: 30 }).notNull().default('advisory'),
  enabledDataSources:        jsonb('enabled_data_sources').notNull().default(['hr', 'absence', 'compliance']),
  ragEnabled:                boolean('rag_enabled').notNull().default(true),
  ragMaxChunks:              integer('rag_max_chunks').notNull().default(5),
  anomalyDetection:          boolean('anomaly_detection').notNull().default(true),
  predictiveInsights:        boolean('predictive_insights').notNull().default(false),
  slaMonitoring:             boolean('sla_monitoring').notNull().default(true),
  conversationRetentionDays: integer('conversation_retention_days').notNull().default(90),
  contextDepthMessages:      integer('context_depth_messages').notNull().default(20),
  personalizationEnabled:    boolean('personalization_enabled').notNull().default(true),
  isActive:                  boolean('is_active').notNull().default(true),
  ...audit(),
})

export const ariaKnowledgeSources = pgTable('aria_knowledge_sources', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  sourceName:    varchar('source_name', { length: 200 }).notNull(),
  // 'pdf' | 'docx' | 'url' | 'text'
  sourceType:    varchar('source_type', { length: 30 }).notNull(),
  storageKey:    varchar('storage_key', { length: 500 }),
  fileSizeBytes: integer('file_size_bytes'),
  mimeType:      varchar('mime_type', { length: 100 }),
  // 'pending' | 'processing' | 'indexed' | 'failed'
  vectorStatus:  varchar('vector_status', { length: 30 }).notNull().default('pending'),
  chunkCount:    integer('chunk_count'),
  lastIndexedAt: timestamp('last_indexed_at', { withTimezone: true }),
  tags:          jsonb('tags').default([]),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
})

// ── ARIA inferred TypeScript types ───────────────────────────────────────────

export type AriaAgentConfig       = typeof ariaAgentConfig.$inferSelect
export type NewAriaAgentConfig    = typeof ariaAgentConfig.$inferInsert
export type AriaModelConfig       = typeof ariaModelConfig.$inferSelect
export type NewAriaModelConfig    = typeof ariaModelConfig.$inferInsert
export type AriaBehaviourConfig   = typeof ariaBehaviourConfig.$inferSelect
export type NewAriaBehaviourConfig = typeof ariaBehaviourConfig.$inferInsert
export type AriaKnowledgeSource   = typeof ariaKnowledgeSources.$inferSelect
export type NewAriaKnowledgeSource = typeof ariaKnowledgeSources.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// 16 — LEAVE BACKDATE POLICIES
// Per-entity per-leave-type backdating rules.
// No row for a (entity, type) combination = no restriction (any past date allowed).
// BR-LV-BDP-001: Only HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN may configure.
// BR-LV-BDP-002: One policy row per (tenant, legal_entity, absence_type) — enforced by UNIQUE constraint.
// ══════════════════════════════════════════════════════════════════════════════

export const leaveBackdatePolicies = pgTable('leave_backdate_policies', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  absenceTypeId:     uuid('absence_type_id').notNull().references(() => absenceTypes.id),
  backdatingEnabled: boolean('backdating_enabled').notNull().default(true),
  backdateLimitDays: integer('backdate_limit_days'),  // null = no day limit when enabled; 0 = same-day only
  ...audit(),
})

export type LeaveBackdatePolicy    = typeof leaveBackdatePolicies.$inferSelect
export type NewLeaveBackdatePolicy = typeof leaveBackdatePolicies.$inferInsert


================================================================================
FILE [P4-01]: drizzle/schema/document-files.ts
LINES: 49
================================================================================
/**
 * AVANIIS HR — Durable in-database document storage (PostgreSQL bytea)
 * Mirrors: drizzle/migrations/0052_document_file_data.sql
 *
 * Active when DOCUMENT_STORAGE_PROVIDER=postgres|db, or unset with DATABASE_URL
 * present (durable fallback). File bytes live in `file_data` (bytea); the
 * `storage_key` is the join key to person_documents.storage_key (and any other
 * table that stores a storage key, e.g. profile photos).
 *
 * BR-TENANT-001: carries tenant_id (Phase 1 single-tenant default).
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  customType,
} from 'drizzle-orm/pg-core'
import { TENANT_ID } from '../../lib/constants'

/**
 * PostgreSQL bytea column type.  postgres-js maps a JS Buffer parameter to bytea
 * on write and returns a Buffer on read, so no manual hex encoding is needed.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const documentFiles = pgTable(
  'document_files',
  {
    storageKey:     text('storage_key').primaryKey(),
    tenantId:       uuid('tenant_id').notNull().default(TENANT_ID),
    fileData:       bytea('file_data').notNull(),
    mimeType:       text('mime_type').notNull(),
    fileSizeBytes:  integer('file_size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    metadata:       jsonb('metadata').$type<Record<string, string>>(),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('idx_document_files_tenant').on(t.tenantId),
  }),
)


================================================================================
FILE [P4-01]: drizzle/schema/employee-letters.ts
LINES: 154
================================================================================
/**
 * Employee Letters — Option B Dynamic Template Engine
 *
 * 4 tables:
 *   letter_field_registry    — 19 token definitions (one-time seed)
 *   letter_template_types    — 6 letter type definitions (PCL/SC/STL/NOC/EXP/WL)
 *   letter_templates         — DB-stored templates with {{token}} placeholders
 *   employee_letters         — generated letter instances
 *   letter_email_jobs        — bulk email delivery tracking
 */
import {
  pgTable, uuid, varchar, text, boolean, timestamp, integer,
  jsonb, date, char,
} from 'drizzle-orm/pg-core'
import { legalEntities, persons } from './foundation'
import { TENANT_ID } from '../../lib/constants'

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   text('created_by_name').notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   text('updated_by_name'),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ── 1. Token registry ─────────────────────────────────────────────────────────

export const letterFieldRegistry = pgTable('letter_field_registry', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  tokenKey:      varchar('token_key', { length: 100 }).notNull().unique(),
  labelEn:       varchar('label_en', { length: 200 }).notNull(),
  labelAr:       varchar('label_ar', { length: 200 }).notNull(),
  category:      varchar('category', { length: 50 }).notNull(),
  dataType:      varchar('data_type', { length: 20 }).notNull().default('string'),
  isSystemToken: boolean('is_system_token').notNull().default(true),
  sourceTable:   varchar('source_table', { length: 100 }),
  sourceColumn:  varchar('source_column', { length: 100 }),
  isRequired:    boolean('is_required').notNull().default(false),
  resolverKey:   varchar('resolver_key', { length: 100 }),
  ...audit(),
})

// ── 2. Letter template types ──────────────────────────────────────────────────

export const letterTemplateTypes = pgTable('letter_template_types', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  typeCode:            varchar('type_code', { length: 10 }).notNull().unique(),
  nameEn:              varchar('name_en', { length: 200 }).notNull(),
  nameAr:              varchar('name_ar', { length: 200 }).notNull(),
  numberPrefix:        varchar('number_prefix', { length: 10 }).notNull(),
  numberSeed:          integer('number_seed').notNull().default(0),
  requiresApproval:    boolean('requires_approval').notNull().default(false),
  allowEssSelfRequest: boolean('allow_ess_self_request').notNull().default(false),
  isActive:            boolean('is_active').notNull().default(true),
  ...audit(),
})

// ── 3. Letter templates (DB-stored, editable in settings UI) ──────────────────

export const letterTemplates = pgTable('letter_templates', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  typeId:        uuid('type_id').notNull().references(() => letterTemplateTypes.id),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }),
  bodyEn:        text('body_en').notNull(),
  bodyAr:        text('body_ar'),
  isDefault:     boolean('is_default').notNull().default(false),
  isActive:      boolean('is_active').notNull().default(true),
  version:       integer('version').notNull().default(1),
  ...audit(),
})

// ── 4. Employee letter instances ──────────────────────────────────────────────

export const employeeLetters = pgTable('employee_letters', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:         uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:    uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  templateId:       uuid('template_id').references(() => letterTemplates.id),
  typeCode:         varchar('type_code', { length: 10 }).notNull(),
  letterNumber:     varchar('letter_number', { length: 50 }).notNull().unique(),

  // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | SIGNED | SENT | CANCELLED
  status:           varchar('status', { length: 30 }).notNull().default('DRAFT'),

  resolvedBodyEn:   text('resolved_body_en'),
  resolvedBodyAr:   text('resolved_body_ar'),
  tokenSnapshot:    jsonb('token_snapshot'),

  pdfUrl:                  varchar('pdf_url', { length: 500 }),
  // Base64 data URL fallback — durable in Neon when cloud storage is not
  // configured. Download priority: signedPdfUrl || pdfUrl || pdfData.
  pdfData:                 text('pdf_data'),
  // Real error message when PDF generation fails (surfaced to employee/HR).
  failureReason:           text('failure_reason'),
  signedPdfUrl:            varchar('signed_pdf_url', { length: 500 }),
  signingToken:            varchar('signing_token', { length: 200 }),
  signingTokenExpiresAt:   timestamp('signing_token_expires_at', { withTimezone: true }),
  signedAt:                timestamp('signed_at', { withTimezone: true }),
  signedByName:            varchar('signed_by_name', { length: 200 }),
  signedIp:                varchar('signed_ip', { length: 45 }),
  signedDevice:            varchar('signed_device', { length: 500 }),

  emailSentAt:      timestamp('email_sent_at', { withTimezone: true }),
  emailRecipient:   varchar('email_recipient', { length: 500 }),
  emailStatus:      varchar('email_status', { length: 30 }),

  // workflow_instances_v2: resourceType='letter_'+typeCode, resourceId=this.id
  workflowInstanceId:    uuid('workflow_instance_id'),
  requestedByEmployee:   boolean('requested_by_employee').notNull().default(false),
  requestedAt:           timestamp('requested_at', { withTimezone: true }),

  generatedBy:      uuid('generated_by'),
  generatedAt:      timestamp('generated_at', { withTimezone: true }),
  effectiveDate:    date('effective_date'),
  // 'en' | 'ar' | 'both'
  language:         varchar('language', { length: 4 }).notNull().default('en'),

  ...audit(),
})

// ── 5. Bulk email job tracking ────────────────────────────────────────────────

export const letterEmailJobs = pgTable('letter_email_jobs', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  jobRef:         varchar('job_ref', { length: 100 }).notNull(),
  letterId:       uuid('letter_id').notNull().references(() => employeeLetters.id),
  recipientEmail: varchar('recipient_email', { length: 500 }).notNull(),
  status:         varchar('status', { length: 20 }).notNull().default('PENDING'),
  errorMessage:   text('error_message'),
  attemptedAt:    timestamp('attempted_at', { withTimezone: true }),
  ...audit(),
})

// ── Types ─────────────────────────────────────────────────────────────────────

export type LetterFieldRegistry     = typeof letterFieldRegistry.$inferSelect
export type LetterTemplateType      = typeof letterTemplateTypes.$inferSelect
export type LetterTemplate          = typeof letterTemplates.$inferSelect
export type EmployeeLetter          = typeof employeeLetters.$inferSelect
export type EmployeeLetterNew       = typeof employeeLetters.$inferInsert
export type LetterEmailJob          = typeof letterEmailJobs.$inferSelect


================================================================================
FILE [P4-01]: drizzle/schema/foundation.ts
LINES: 1442
================================================================================
/**
 * AVANIIS HR — Foundation Schema
 * Mirrors: ERD_PHASE1_DATA_MODEL.md Parts 1–6
 *
 * BR-AUDIT-001: Every table carries 7 mandatory audit columns.
 * BR-TENANT-001: Every table carries tenant_id (Phase 1 single-tenant).
 * BR-NO-DELETE:  Records are NEVER hard-deleted; use effective dates / is_active.
 * Encrypted fields (emirates_id, passport_number, iban) are stored as ciphertext —
 * encryption/decryption happens in lib/encryption.ts before DB writes.
 */
import {
  pgTable,
  uuid,
  varchar,
  char,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// ─── Shared helpers ────────────────────────────────────────────────────────

// Single source of truth for the Phase 1 single-tenant default. Phase 3
// multi-tenant rollout drops the column-level default and resolves tenant
// from the request context instead.
import { TENANT_ID } from '../../lib/constants'

/** Returns fresh column instances for tenant_id (call per table). */
const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

/** Returns fresh column instances for the 7 mandatory audit columns. */
const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 1 — FOUNDATION / REFERENCE TABLES
// ══════════════════════════════════════════════════════════════════════════════

// V001 — Centralised picklist (nationality codes, document types, etc.)
export const lookupValues = pgTable('lookup_values', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  lookupType: varchar('lookup_type', { length: 100 }).notNull(),
  lookupCode: varchar('lookup_code', { length: 50 }).notNull(),
  valueEn:    varchar('value_en', { length: 200 }).notNull(),
  valueAr:    varchar('value_ar', { length: 200 }),
  sortOrder:  integer('sort_order').notNull().default(0),
  isActive:   boolean('is_active').notNull().default(true),
  ...audit(),
})

// V002 — Legal entities (AVANIIS subsidiaries under Avaniis)
export const legalEntities = pgTable('legal_entities', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  entityCode:           varchar('entity_code', { length: 20 }).notNull().unique(),
  nameEn:               varchar('name_en', { length: 200 }).notNull(),
  nameAr:               varchar('name_ar', { length: 200 }).notNull(),
  tradeLicenceNumber:   varchar('trade_licence_number', { length: 100 }),
  tradeLicenceExpiry:   date('trade_licence_expiry'),
  registrationNumber:   varchar('registration_number', { length: 100 }),
  // MAINLAND | DIFC | ADGM | FREEZONE — drives EOSB/DEWS routing
  entityType:           varchar('entity_type', { length: 20 }).notNull().default('MAINLAND'),
  jurisdiction:         varchar('jurisdiction', { length: 100 }).notNull().default('Dubai'),
  // TRADITIONAL | VSS | DEWS — BR-EOSB-001
  eosbScheme:           varchar('eosb_scheme', { length: 20 }).notNull().default('TRADITIONAL'),
  wpsEmployerCode:      varchar('wps_employer_code', { length: 50 }),
  mohreEstablishmentId: varchar('mohre_establishment_id', { length: 50 }),
  defaultCurrency:      char('default_currency', { length: 3 }).notNull().default('AED'),
  defaultLanguage:      varchar('default_language', { length: 10 }).notNull().default('en'),
  // ── Employee number configuration (Settings → Employee Numbers) ───────────
  // Format: `{empNumberPrefix}{padStart(empNumberDigits, '0')}` e.g. AVN0001
  // empNumberPrefix  — short prefix chosen by SUPER_ADMIN, e.g. AVN, Avaniis, KT
  // empNumberDigits  — how many digits to pad (3-8, default 4 → 0001)
  // empNumberSeed    — SUPER_ADMIN override: next = MAX(seed, currentMax) + 1
  empNumberPrefix:      varchar('emp_number_prefix', { length: 10 }),
  empNumberDigits:      integer('emp_number_digits').notNull().default(4),
  empNumberSeed:        integer('emp_number_seed').notNull().default(0),
  isActive:             boolean('is_active').notNull().default(true),
  // ── Document branding (Settings → Document Branding) ──────────────────
  primaryLogoUrl:        text('primary_logo_url'),
  secondaryLogoUrl:      text('secondary_logo_url'),
  headerImageUrl:        text('header_image_url'),
  footerImageUrl:        text('footer_image_url'),
  signatoryName:         text('signatory_name'),
  signatoryTitle:        text('signatory_title'),
  signatoryTitleAr:      text('signatory_title_ar'),
  signatorySignatureUrl: text('signatory_signature_url'),
  letterEmailFooter:     text('letter_email_footer'),
  airTicketEntitlement:  text('air_ticket_entitlement'),
  letterLogoChoice:      varchar('letter_logo_choice', { length: 10 }).notNull().default('primary'),
  ...audit(),
})

// V003 — Grade bands (salary levels 1–15, configurable per entity)
export const grades = pgTable('grades', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:    uuid('legal_entity_id').references(() => legalEntities.id),
  gradeCode:        varchar('grade_code', { length: 20 }).notNull(),
  gradeNameEn:      varchar('grade_name_en', { length: 100 }).notNull(),
  gradeNameAr:      varchar('grade_name_ar', { length: 100 }),
  gradeLevel:       integer('grade_level').notNull(),
  minSalary:        numeric('min_salary', { precision: 12, scale: 2 }),
  maxSalary:        numeric('max_salary', { precision: 12, scale: 2 }),
  midSalary:        numeric('mid_salary', { precision: 12, scale: 2 }),
  noticePeriodDays: integer('notice_period_days').notNull().default(30), // BR-NP-001
  isActive:         boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:       varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:    uuid('corrects_row_id').references((): AnyPgColumn => grades.id),
  ...audit(),
})

// V004 — Payroll definitions (defined before persons — persons.payroll_id refs this)
export const payrollDefinitions = pgTable('payroll_definitions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollCode:          varchar('payroll_code', { length: 30 }).notNull(),
  payrollNameEn:        varchar('payroll_name_en', { length: 200 }).notNull(),
  payrollNameAr:        varchar('payroll_name_ar', { length: 200 }),
  payFrequency:         varchar('pay_frequency', { length: 20 }).notNull().default('MONTHLY'),
  paymentDayOfMonth:    integer('payment_day_of_month').notNull().default(25),
  currency:             char('currency', { length: 3 }).notNull().default('AED'),
  legislativeDataGroup: varchar('legislative_data_group', { length: 50 }).notNull().default('UAE'),
  oracleLedgerId:       varchar('oracle_ledger_id', { length: 50 }),
  wpsBankCode:          varchar('wps_bank_code', { length: 20 }),
  isActive:             boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 2 — CORE HR: PERSON RECORD
// Defined early (before positions/departments) to resolve circular FK cycles.
// Forward refs (currentPositionId etc.) stored as plain uuid — FK enforced by DB.
// ══════════════════════════════════════════════════════════════════════════════

// V005 — Master person record
export const persons = pgTable('persons', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personNumber: varchar('person_number', { length: 30 }).notNull().unique(), // AVN-000123
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),

  // ── Identity ──────────────────────────────────────────────────────────────
  firstNameEn:  varchar('first_name_en', { length: 100 }).notNull(),
  middleNameEn: varchar('middle_name_en', { length: 100 }),
  lastNameEn:   varchar('last_name_en', { length: 100 }).notNull(),
  // Computed by application before every insert/update (lib/persons.ts)
  fullNameEn:   text('full_name_en'),
  fullNameAr:   varchar('full_name_ar', { length: 300 }).notNull(),
  preferredName: varchar('preferred_name', { length: 100 }),
  salutation:   varchar('salutation', { length: 20 }),
  dateOfBirth:  date('date_of_birth').notNull(),
  // MALE | FEMALE | NOT_SPECIFIED
  gender:       varchar('gender', { length: 20 }).notNull(),
  // SINGLE | MARRIED | DIVORCED | WIDOWED | NOT_SPECIFIED
  maritalStatus:      varchar('marital_status', { length: 30 }),
  numberOfDependents: integer('number_of_dependents').notNull().default(0),

  // ── Nationality ──────────────────────────────────────────────────────────
  nationalityCode:     char('nationality_code', { length: 3 }).notNull(),
  // UAE_NATIONAL | GCC_NATIONAL | EXPAT — drives EOSB vs GPSSA routing
  nationalityCategory: varchar('nationality_category', { length: 20 }).notNull(),
  religion:            varchar('religion', { length: 50 }),
  religionConsentGiven: boolean('religion_consent_given').notNull().default(false),
  // A+ | A- | B+ | B- | AB+ | AB- | O+ | O- — PDPL-sensitive; gate behind sensitiveDataConsent
  bloodType:           varchar('blood_type', { length: 10 }),

  // ── Emirates ID (AES-256-GCM encrypted ciphertext — PDPL compliance) ─────
  emiratesId:       varchar('emirates_id', { length: 500 }),
  emiratesIdExpiry: date('emirates_id_expiry'),
  // P1-H4: deterministic HMAC-SHA256 of the normalised identifier — carries the
  // UNIQUE index (migration 0065) the encrypted column can't. Written only when
  // IDENTITY_UNIQUENESS_ENFORCEMENT=true (post-0065). See lib/identity-hash.ts.
  emiratesIdHash:   varchar('emirates_id_hash', { length: 64 }),

  // ── Passport (AES-256-GCM encrypted ciphertext) ──────────────────────────
  passportNumber:   varchar('passport_number', { length: 500 }),
  passportNumberHash: varchar('passport_number_hash', { length: 64 }),
  passportCountry:  char('passport_country', { length: 3 }),
  passportIssueDate: date('passport_issue_date'),
  passportExpiry:   date('passport_expiry'),

  // ── UAE Residency Visa ───────────────────────────────────────────────────
  visaNumber:    varchar('visa_number', { length: 30 }),
  visaType:      varchar('visa_type', { length: 50 }),
  visaIssueDate: date('visa_issue_date'),
  visaExpiry:    date('visa_expiry'),
  // VALID | EXPIRING | EXPIRED | CANCELLED
  visaStatus:    varchar('visa_status', { length: 30 }),

  // ── Labour Card / Work Permit ────────────────────────────────────────────
  labourCardNumber:        varchar('labour_card_number', { length: 50 }),
  labourCardExpiry:        date('labour_card_expiry'),
  mohreLabourPermitNumber: varchar('mohre_labour_permit_number', { length: 50 }),

  // ── UAE National specific ────────────────────────────────────────────────
  familyBookNumber:        varchar('family_book_number', { length: 50 }),
  nafisRegistrationNumber: varchar('nafis_registration_number', { length: 50 }),

  // ── Employment ──────────────────────────────────────────────────────────
  // FULL_TIME | PART_TIME | TEMPORARY | TASK_BASED | FLEXIBLE | REMOTE | SHARED
  employmentType:         varchar('employment_type', { length: 30 }).notNull(),
  contractedHoursPerWeek: numeric('contracted_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // ACTIVE | ON_LEAVE | SUSPENDED | TERMINATED | RETIRED | DECEASED | PENDING_HIRE
  assignmentStatus:    varchar('assignment_status', { length: 30 }).notNull().default('ACTIVE'),
  hireDate:            date('hire_date').notNull(),
  seniorityDate:       date('seniority_date'),
  originalHireDate:    date('original_hire_date'),
  probationEndDate:    date('probation_end_date'),
  // ACTIVE | CONFIRMED | EXTENDED | FAILED — BR-37
  probationStatus:     varchar('probation_status', { length: 20 }).default('ACTIVE'),
  noticePeriodDays:    integer('notice_period_days').notNull().default(30),
  // FTE | CONTINGENT | CONTRACTOR — worker classification (separate from employmentType work arrangement)
  workerCategory:          varchar('worker_category', { length: 20 }),
  // HR-assigned business code (NOT the auto-generated person_number)
  employeeCode:            varchar('employee_code', { length: 50 }),
  // Stores the approved probation duration in months (survives after probation_end_date passes)
  probationMonthsGranted:  integer('probation_months_granted'),
  separationDate:      date('separation_date'),
  separationReason:    varchar('separation_reason', { length: 100 }),

  // ── Current Assignment (forward refs — positions/departments defined below) ─
  currentPositionId:  uuid('current_position_id'),
  currentJobId:       uuid('current_job_id'),
  currentDepartmentId: uuid('current_department_id'),
  currentLocationId:  uuid('current_location_id'),
  currentGradeId:     uuid('current_grade_id').references(() => grades.id),
  // Self-referential — AnyPgColumn annotation breaks circular type inference
  lineManagerId:       uuid('line_manager_id').references((): AnyPgColumn => persons.id),
  dottedLineManagerId: uuid('dotted_line_manager_id').references((): AnyPgColumn => persons.id),
  hrRepresentativeId:  uuid('hr_representative_id').references((): AnyPgColumn => persons.id),

  // ── Payroll ──────────────────────────────────────────────────────────────
  payrollId:    uuid('payroll_id').references(() => payrollDefinitions.id),
  payFrequency: varchar('pay_frequency', { length: 20 }).notNull().default('MONTHLY'),
  // Denormalised for fast access — source of truth is salary_elements
  basicSalary:  numeric('basic_salary', { precision: 12, scale: 2 }),
  totalPackage: numeric('total_package', { precision: 12, scale: 2 }),

  // ── Medical Insurance ────────────────────────────────────────────────────
  // insurancePlanId FK to medical_insurance_plans (configuration — Task 4)
  insurancePlanId:       uuid('insurance_plan_id'),
  insuranceCardNumber:   varchar('insurance_card_number', { length: 100 }),
  insuranceMemberId:     varchar('insurance_member_id', { length: 100 }),
  insuranceProviderName: varchar('insurance_provider_name', { length: 200 }),
  insuranceNetwork:      varchar('insurance_network', { length: 100 }),
  // BASIC | ENHANCED | PREMIUM | EXECUTIVE
  insuranceCategory:     varchar('insurance_category', { length: 50 }),
  insuranceEffectiveDate: date('insurance_effective_date'),
  insuranceExpiryDate:   date('insurance_expiry_date'),
  // ENROLLED | PENDING_ENROLMENT | RENEWAL_DUE | EXPIRED | CANCELLED | NOT_ENROLLED
  insuranceStatus:       varchar('insurance_status', { length: 30 }).notNull().default('NOT_ENROLLED'),
  insuranceDocumentId:   uuid('insurance_document_id'),
  annualPremiumAed:      numeric('annual_premium_aed', { precision: 10, scale: 2 }),
  employerPremiumAed:    numeric('employer_premium_aed', { precision: 10, scale: 2 }),
  employeePremiumAed:    numeric('employee_premium_aed', { precision: 10, scale: 2 }),
  dependentCountInsured: integer('dependent_count_insured').notNull().default(0),

  // ── UAE PDPL Consent (GAP-C04 FIX) ──────────────────────────────────────
  // UAE Personal Data Protection Law 2021 — consent recorded at data collection
  // Article 11: employment contract provides legal basis; sensitive data needs explicit consent
  pdplConsentGiven:    boolean('pdpl_consent_given').notNull().default(false),
  pdplConsentDate:     timestamp('pdpl_consent_date', { withTimezone: true }),
  pdplConsentVersion:  varchar('pdpl_consent_version', { length: 20 }),
  // Sensitive data consent (religion, health — optional fields)
  sensitiveDataConsent: boolean('sensitive_data_consent').notNull().default(false),
  sensitiveConsentDate: timestamp('sensitive_data_consent_date', { withTimezone: true }),

  // ── Nursing Break Entitlement (GAP-C09 FIX) ─────────────────────────────
  // BR-ML-004: 2 × 30-min daily breaks for 6 months post-delivery (FDL 33/2021 2024 amendment)
  // Set when maternity leave approved; cleared nightly after end date passes
  nursingBreakEndDate: date('nursing_break_end_date'),

  // ── Preferences ──────────────────────────────────────────────────────────
  preferredLanguage:   varchar('preferred_language', { length: 10 }).notNull().default('en'),
  notificationChannel: varchar('notification_channel', { length: 30 }).notNull().default('PUSH_AND_EMAIL'),

  // ── System ───────────────────────────────────────────────────────────────
  isSystemUser:          boolean('is_system_user').notNull().default(false),
  userAccountId:         uuid('user_account_id'),
  isActive:              boolean('is_active').notNull().default(true),
  dataQualityScore:      numeric('data_quality_score', { precision: 5, scale: 2 }),
  profileCompletionDate: date('profile_completion_date'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  // Org Chart — Azure Blob SAS URL for employee photo (cloud storage)
  profilePhotoUrl: varchar('profile_photo_url', { length: 500 }),
  // Base64 data URL fallback — populated alongside profilePhotoUrl.
  // Durable in Neon even when cloud storage is not configured (UAT/local).
  // Display priority: profilePhotoUrl || profilePhotoData
  profilePhotoData: text('profile_photo_data'),
  ...audit(),
})

// ── Org structure (defined after persons — head_person_id refs persons) ────

// V006 — Business units
export const businessUnits = pgTable('business_units', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  code:          varchar('code', { length: 30 }).notNull(),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }).notNull(),
  glSegmentCode: varchar('gl_segment_code', { length: 50 }),
  headPersonId:  uuid('head_person_id').references(() => persons.id),
  isActive:      boolean('is_active').notNull().default(true),
  ...audit(),
})

// V007 — Departments (self-referential via parentDepartmentId)
export const departments = pgTable('departments', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  businessUnitId:     uuid('business_unit_id').notNull().references(() => businessUnits.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  code:               varchar('code', { length: 30 }).notNull(),
  nameEn:             varchar('name_en', { length: 200 }).notNull(),
  nameAr:             varchar('name_ar', { length: 200 }).notNull(),
  // Sales | Finance | HR | IT | Legal | Operations | Executive | PRO
  departmentType:     varchar('department_type', { length: 50 }),
  costCentreCode:     varchar('cost_centre_code', { length: 50 }),
  glAccountCode:      varchar('gl_account_code', { length: 50 }),
  approvedHeadcount:  integer('approved_headcount').notNull().default(0),
  headPersonId:       uuid('head_person_id').references(() => persons.id),
  // Department-level default work schedule — inheritance tier between an
  // employee override and the entity/system default. The FK to work_schedules
  // is enforced in SQL (migration 0054); kept as a bare uuid here to avoid a
  // foundation↔configuration circular import. NULLABLE during Expand→Migrate→Contract.
  workScheduleId:     uuid('work_schedule_id'),
  // Self-ref for nested departments
  parentDepartmentId: uuid('parent_department_id').references((): AnyPgColumn => departments.id),
  isActive:           boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:         varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:      uuid('corrects_row_id').references((): AnyPgColumn => departments.id),
  ...audit(),
})

// V008 — Locations (offices, sites)
export const locations = pgTable('locations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  code:          varchar('code', { length: 30 }).notNull(),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }),
  addressLine1:  varchar('address_line1', { length: 300 }),
  addressLine2:  varchar('address_line2', { length: 300 }),
  city:          varchar('city', { length: 100 }),
  emirate:       varchar('emirate', { length: 50 }),
  country:       char('country', { length: 3 }).notNull().default('ARE'),
  poBox:         varchar('po_box', { length: 20 }),
  phone:         varchar('phone', { length: 30 }),
  timezone:      varchar('timezone', { length: 50 }).notNull().default('Asia/Dubai'),
  isActive:      boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:    varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => locations.id),
  ...audit(),
})

// V009 — Jobs (generic role templates — e.g., "Property Consultant")
export const jobs = pgTable('jobs', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:        uuid('legal_entity_id').references(() => legalEntities.id),
  jobCode:              varchar('job_code', { length: 30 }).notNull().unique(),
  jobTitleEn:           varchar('job_title_en', { length: 200 }).notNull(),
  jobTitleAr:           varchar('job_title_ar', { length: 200 }),
  // Technology | Finance | HR | Sales | Operations
  jobFamily:            varchar('job_family', { length: 100 }),
  jobFunction:          varchar('job_function', { length: 100 }),
  minGradeId:           uuid('min_grade_id').references(() => grades.id),
  maxGradeId:           uuid('max_grade_id').references(() => grades.id),
  isEmiratisationTarget: boolean('is_emiratisation_target').notNull().default(false),
  isManagementRole:     boolean('is_management_role').notNull().default(false),
  isExemptFromOvertime: boolean('is_exempt_from_overtime').notNull().default(false),
  jobDescriptionEn:     text('job_description_en'),
  jobDescriptionAr:     text('job_description_ar'),
  isActive:             boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure — Priority C)
  actionMode:           varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:        uuid('corrects_row_id').references((): AnyPgColumn => jobs.id),
  ...audit(),
})

// V010 — Positions (specific budgeted slots — "Property Consultant - Sales - G7")
export const positions = pgTable('positions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  departmentId:        uuid('department_id').notNull().references(() => departments.id),
  jobId:               uuid('job_id').notNull().references(() => jobs.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  positionCode:        varchar('position_code', { length: 30 }).notNull(),
  positionTitleEn:     varchar('position_title_en', { length: 200 }).notNull(),
  positionTitleAr:     varchar('position_title_ar', { length: 200 }),
  gradeId:             uuid('grade_id').references(() => grades.id),
  locationId:          uuid('location_id').references(() => locations.id),
  fteCount:            numeric('fte_count', { precision: 4, scale: 2 }).notNull().default('1.00'),
  isOccupied:          boolean('is_occupied').notNull().default(false),
  occupiedByPersonId:  uuid('occupied_by_person_id').references(() => persons.id),
  // Self-ref for position reporting hierarchy
  reportsToPositionId: uuid('reports_to_position_id').references((): AnyPgColumn => positions.id),
  budgetAmount:        numeric('budget_amount', { precision: 14, scale: 2 }),
  isActive:            boolean('is_active').notNull().default(true),
  // Org Chart visibility flags
  isConfidential:      boolean('is_confidential').notNull().default(false),
  // confidential = hidden from EMPLOYEE role, visible to HR+EXECUTIVE
  isFrozen:            boolean('is_frozen').notNull().default(false),
  // frozen = vacant but hiring suspended (budget freeze)
  // Set when is_occupied flips true → false; cleared when position becomes occupied
  vacancyStartDate:    date('vacancy_start_date'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  // Date-effective history infrastructure (Priority C)
  // isCurrent=true means this row is the live definition of the position
  effectiveStartDate:  date('effective_start_date'),
  effectiveEndDate:    date('effective_end_date'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => positions.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 2 (continued) — PERSON DETAIL TABLES
// ══════════════════════════════════════════════════════════════════════════════

export const personContacts = pgTable('person_contacts', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  // MOBILE_PRIMARY | MOBILE_SECONDARY | PERSONAL_EMAIL | WORK_EMAIL | HOME_PHONE | WORK_PHONE | WHATSAPP
  contactType:  varchar('contact_type', { length: 30 }).notNull(),
  contactValue: varchar('contact_value', { length: 200 }).notNull(),
  countryCode:  varchar('country_code', { length: 10 }),
  isPrimary:    boolean('is_primary').notNull().default(false),
  isVerified:   boolean('is_verified').notNull().default(false),
  verifiedDate: date('verified_date'),
  isActive:     boolean('is_active').notNull().default(true),
  ...audit(),
})

export const personAddresses = pgTable('person_addresses', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  // UAE_CURRENT | UAE_PERMANENT | HOME_COUNTRY | MAILING
  addressType:  varchar('address_type', { length: 30 }).notNull(),
  addressLine1: varchar('address_line1', { length: 300 }).notNull(),
  addressLine2: varchar('address_line2', { length: 300 }),
  city:         varchar('city', { length: 100 }).notNull(),
  stateEmirate: varchar('state_emirate', { length: 100 }),
  postalCode:   varchar('postal_code', { length: 20 }),
  country:      char('country', { length: 3 }).notNull(),
  poBox:        varchar('po_box', { length: 20 }),
  isPrimary:    boolean('is_primary').notNull().default(false),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:  date('effective_to'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:   varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => personAddresses.id),
  ...audit(),
})

export const personDocuments = pgTable('person_documents', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:              uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:         uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // Full taxonomy in lib/documents/document-types.ts — do not hardcode here
  documentType:          varchar('document_type', { length: 50 }).notNull(),
  // IDENTITY | EMPLOYMENT | PAYROLL | MEDICAL | EDUCATION | PERSONAL | BANKING | HR_COMPLIANCE | SUPPORTING
  documentCategory:      varchar('document_category', { length: 50 }),
  documentTitle:         varchar('document_title', { length: 200 }).notNull(),
  documentNumber:        varchar('document_number', { length: 100 }),
  issuingAuthority:      varchar('issuing_authority', { length: 200 }),
  issuingCountry:        char('issuing_country', { length: 3 }),
  issueDate:             date('issue_date'),
  expiryDate:            date('expiry_date'),
  isMandatory:           boolean('is_mandatory').notNull().default(false),
  // Default: alert at 90/60/30/14 days before expiry
  alertDaysBeforeExpiry: integer('alert_days_before_expiry').array().notNull().default([90, 60, 30, 14]),
  // Encrypted path in Azure Blob Storage UAE North
  storageKey:            varchar('storage_key', { length: 500 }),
  fileName:              varchar('file_name', { length: 300 }),
  fileSizeBytes:         integer('file_size_bytes'),
  mimeType:              varchar('mime_type', { length: 100 }),
  checksumSha256:        varchar('checksum_sha256', { length: 64 }),
  // VALID | EXPIRING_SOON | EXPIRED | UNDER_RENEWAL | CANCELLED
  documentStatus:        varchar('document_status', { length: 30 }).notNull().default('VALID'),
  // EMPLOYEE (self-upload) | HR (hr team) | PAYROLL (auto-generated) | SYSTEM
  sourceType:            varchar('source_type', { length: 20 }).notNull().default('HR'),
  // True: employee may replace via ESS upload
  employeeCanReplace:    boolean('employee_can_replace').notNull().default(false),
  // True: restricted to HR/Admin view only (warning letters, disciplinary)
  hrOnlyVisibility:      boolean('hr_only_visibility').notNull().default(false),
  // Cumulative download counter
  downloadCount:         integer('download_count').notNull().default(0),
  lastViewedAt:          timestamp('last_viewed_at', { withTimezone: true }),
  lastDownloadedAt:      timestamp('last_downloaded_at', { withTimezone: true }),
  // EMPLOYEE (identity docs: passport, visa, etc.) | LEAVE_REQUEST (medical cert) | OTHER_TX
  scopeType:             varchar('scope_type', { length: 30 }).notNull().default('EMPLOYEE'),
  // For LEAVE_REQUEST scope: the absence_entries.id this cert belongs to
  contextId:             uuid('context_id'),
  verifiedBy:            uuid('verified_by').references(() => persons.id),
  verifiedDate:          date('verified_date'),
  notes:                 text('notes'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:            varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:         uuid('corrects_row_id').references((): AnyPgColumn => personDocuments.id),
  ...audit(),
})

export const personBankDetails = pgTable('person_bank_details', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  bankName:     varchar('bank_name', { length: 200 }).notNull(),
  bankCode:     varchar('bank_code', { length: 20 }).notNull(),
  // AES-256-GCM encrypted ciphertext — AE + 21 digits in cleartext
  iban:         varchar('iban', { length: 500 }).notNull(),
  accountName:  varchar('account_name', { length: 200 }).notNull(),
  accountType:  varchar('account_type', { length: 30 }).notNull().default('CURRENT'),
  currency:     char('currency', { length: 3 }).notNull().default('AED'),
  isPrimary:    boolean('is_primary').notNull().default(true),
  isWpsAccount: boolean('is_wps_account').notNull().default(true),
  verifiedBy:   uuid('verified_by').references(() => persons.id),
  verifiedDate: date('verified_date'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:  date('effective_to'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:   varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => personBankDetails.id),
  ...audit(),
})

export const personDependents = pgTable('person_dependents', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  // 1–9; system-assigned sequential (CONSTRAINT max_9_dependents in migration)
  dependentNumber: integer('dependent_number').notNull(),
  // SPOUSE | CHILD | PARENT | PARENT_IN_LAW | SIBLING | OTHER
  relationship:    varchar('relationship', { length: 30 }).notNull(),
  firstNameEn:     varchar('first_name_en', { length: 100 }).notNull(),
  middleNameEn:    varchar('middle_name_en', { length: 100 }),
  lastNameEn:      varchar('last_name_en', { length: 100 }).notNull(),
  fullNameAr:      varchar('full_name_ar', { length: 300 }).notNull(),
  dateOfBirth:     date('date_of_birth').notNull(),
  gender:          varchar('gender', { length: 20 }).notNull(),
  nationalityCode: char('nationality_code', { length: 3 }).notNull(),
  // Passport (encrypted)
  passportNumber:         varchar('passport_number', { length: 500 }),
  passportCountry:        char('passport_country', { length: 3 }),
  passportIssueDate:      date('passport_issue_date'),
  passportExpiry:         date('passport_expiry'),
  passportDocumentId:     uuid('passport_document_id').references(() => personDocuments.id),
  // Emirates ID (encrypted)
  emiratesId:             varchar('emirates_id', { length: 500 }),
  emiratesIdExpiry:       date('emirates_id_expiry'),
  emiratesIdDocumentId:   uuid('emirates_id_document_id').references(() => personDocuments.id),
  // Visa
  visaNumber:             varchar('visa_number', { length: 30 }),
  // RESIDENCE_VISA | VISIT_VISA | TOURIST_VISA | STUDENT_VISA | NOT_APPLICABLE
  visaType:               varchar('visa_type', { length: 50 }),
  visaIssueDate:          date('visa_issue_date'),
  visaExpiry:             date('visa_expiry'),
  // VALID | EXPIRING | EXPIRED | CANCELLED | PENDING | NOT_APPLICABLE
  visaStatus:             varchar('visa_status', { length: 30 }).notNull().default('NOT_APPLICABLE'),
  visaDocumentId:         uuid('visa_document_id').references(() => personDocuments.id),
  visaSponsoredByCompany: boolean('visa_sponsored_by_company').notNull().default(false),
  visaSponsorPersonId:    uuid('visa_sponsor_person_id').references(() => persons.id),
  // Medical insurance
  isOnCompanyInsurance:   boolean('is_on_company_insurance').notNull().default(false),
  insurancePlanId:        uuid('insurance_plan_id'),
  insuranceCardNumber:    varchar('insurance_card_number', { length: 100 }),
  insuranceMemberId:      varchar('insurance_member_id', { length: 100 }),
  insuranceProviderName:  varchar('insurance_provider_name', { length: 200 }),
  insuranceNetwork:       varchar('insurance_network', { length: 100 }),
  insuranceCategory:      varchar('insurance_category', { length: 50 }),
  insuranceEffectiveDate: date('insurance_effective_date'),
  insuranceExpiryDate:    date('insurance_expiry_date'),
  insuranceStatus:        varchar('insurance_status', { length: 30 }).notNull().default('NOT_ENROLLED'),
  insuranceDocumentId:    uuid('insurance_document_id').references(() => personDocuments.id),
  annualPremiumAed:       numeric('annual_premium_aed', { precision: 10, scale: 2 }),
  employerPremiumAed:     numeric('employer_premium_aed', { precision: 10, scale: 2 }),
  employeePremiumAed:     numeric('employee_premium_aed', { precision: 10, scale: 2 }),
  // Disability — BR-SP-001 (nursing break entitlement)
  hasDisability:            boolean('has_disability').notNull().default(false),
  disabilityType:           varchar('disability_type', { length: 200 }),
  disabilityCertificateId:  uuid('disability_certificate_id').references(() => personDocuments.id),
  // Approval workflow (ESS submit → HR Admin approve)
  approvalStatus:   varchar('approval_status', { length: 30 }).notNull().default('PENDING'),
  approvedBy:       uuid('approved_by').references(() => persons.id),
  approvalDate:     date('approval_date'),
  rejectionReason:  text('rejection_reason'),
  // Effective dating
  effectiveFrom:  date('effective_from').notNull(),
  effectiveTo:    date('effective_to'),
  removalReason:  varchar('removal_reason', { length: 200 }),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:    varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => personDependents.id),
  ...audit(),
})

export const personEmergencyContacts = pgTable('person_emergency_contacts', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  contactNameEn:  varchar('contact_name_en', { length: 200 }).notNull(),
  contactNameAr:  varchar('contact_name_ar', { length: 200 }),
  relationship:   varchar('relationship', { length: 50 }).notNull(),
  phonePrimary:   varchar('phone_primary', { length: 30 }).notNull(),
  phoneSecondary: varchar('phone_secondary', { length: 30 }),
  email:          varchar('email', { length: 200 }),
  address:        text('address'),
  country:        char('country', { length: 3 }),
  priorityOrder:  integer('priority_order').notNull().default(1),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:     varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:  uuid('corrects_row_id').references((): AnyPgColumn => personEmergencyContacts.id),
  ...audit(),
})

export const personEducation = pgTable('person_education', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  institutionName: varchar('institution_name', { length: 300 }).notNull(),
  // Bachelor | Master | PhD | Diploma | Certificate
  degreeType:      varchar('degree_type', { length: 100 }),
  fieldOfStudy:    varchar('field_of_study', { length: 200 }),
  country:         char('country', { length: 3 }),
  startYear:       integer('start_year'),
  graduationYear:  integer('graduation_year'),
  isHighestDegree: boolean('is_highest_degree').notNull().default(false),
  documentId:      uuid('document_id').references(() => personDocuments.id),
  ...audit(),
})

export const personProfessionalCerts = pgTable('person_professional_certs', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  // CPA | CFA | RERA | PMP | CISA | etc.
  certName:           varchar('cert_name', { length: 300 }).notNull(),
  certNumber:         varchar('cert_number', { length: 100 }),
  issuingBody:        varchar('issuing_body', { length: 200 }),
  issueDate:          date('issue_date'),
  expiryDate:         date('expiry_date'),
  isMandatoryForRole: boolean('is_mandatory_for_role').notNull().default(false),
  documentId:         uuid('document_id').references(() => personDocuments.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 3 — EMPLOYMENT TABLES
// ══════════════════════════════════════════════════════════════════════════════

export const contracts = pgTable('contracts', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  contractNumber:      varchar('contract_number', { length: 50 }).notNull().unique(),
  contractType:        varchar('contract_type', { length: 30 }).notNull().default('FIXED_TERM'),
  employmentType:      varchar('employment_type', { length: 30 }).notNull(),
  startDate:           date('start_date').notNull(),
  // Mandatory — UAE Labour Law prohibits unlimited-term contracts
  endDate:             date('end_date').notNull(),
  probationStart:      date('probation_start'),
  // Max 6 months from start — BR-PR-001
  probationEnd:        date('probation_end'),
  // 30 / 60 / 90 days depending on service length — BR-NP-001
  noticePeriodDays:    integer('notice_period_days').notNull(),
  workingHoursPerWeek: numeric('working_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // OFFICE | REMOTE | HYBRID | FIELD
  workLocation:        varchar('work_location', { length: 30 }).notNull().default('OFFICE'),
  signedByEmployee:    boolean('signed_by_employee').notNull().default(false),
  signedDate:          date('signed_date'),
  contractDocumentId:  uuid('contract_document_id').references(() => personDocuments.id),
  renewalCount:        integer('renewal_count').notNull().default(0),
  previousContractId:  uuid('previous_contract_id').references((): AnyPgColumn => contracts.id),
  // DRAFT | ACTIVE | EXPIRED | TERMINATED | RENEWED
  status:              varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  terminationDate:     date('termination_date'),
  terminationReason:   varchar('termination_reason', { length: 200 }),
  notes:               text('notes'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  // History-versioning (Correction Mode infrastructure)
  actionMode:        varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:     uuid('corrects_row_id').references((): AnyPgColumn => contracts.id),
  isCurrent:         boolean('is_current').notNull().default(true),
  effectiveSequence: integer('effective_sequence').notNull().default(1),
  ...audit(),
})

export const workerAssignments = pgTable('worker_assignments', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:               uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:          uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  assignmentNumber:       varchar('assignment_number', { length: 30 }).notNull(),
  effectiveStartDate:     date('effective_start_date').notNull(),
  effectiveEndDate:       date('effective_end_date').default('9999-12-31'),
  // ACTIVE | INACTIVE | ON_LEAVE | SUSPENDED | TERMINATED
  assignmentStatus:       varchar('assignment_status', { length: 30 }).notNull(),
  // Position & role
  positionId:             uuid('position_id').references(() => positions.id),
  jobId:                  uuid('job_id').references(() => jobs.id),
  departmentId:           uuid('department_id').notNull().references(() => departments.id),
  locationId:             uuid('location_id').references(() => locations.id),
  gradeId:                uuid('grade_id').references(() => grades.id),
  businessUnitId:         uuid('business_unit_id').references(() => businessUnits.id),
  // Reporting
  lineManagerId:          uuid('line_manager_id').references(() => persons.id),
  dottedLineManagerId:    uuid('dotted_line_manager_id').references(() => persons.id),
  // Work details
  employmentType:         varchar('employment_type', { length: 30 }).notNull(),
  contractedHoursPerWeek: numeric('contracted_hours_per_week', { precision: 5, scale: 2 }).notNull().default('48.00'),
  // workScheduleId FK to work_schedules (configuration.ts — Task 4)
  workScheduleId:         uuid('work_schedule_id'),
  // HIRE | TRANSFER | PROMOTION | DEMOTION | SALARY_REVISION |
  // CONTRACT_EXTEND | SUSPEND | REINSTATE | TERMINATE | RETIRE |
  // SECONDMENT | RETURN_FROM_SECONDMENT
  actionType:             varchar('action_type', { length: 50 }).notNull(),
  actionReason:           varchar('action_reason', { length: 200 }),
  actionInitiatedBy:      uuid('action_initiated_by').notNull().references(() => persons.id),
  actionApprovedBy:       uuid('action_approved_by').references(() => persons.id),
  actionApprovalDate:     date('action_approval_date'),
  // Cost allocation
  primaryCostCentreCode:   varchar('primary_cost_centre_code', { length: 50 }),
  secondaryCostCentreCode: varchar('secondary_cost_centre_code', { length: 50 }),
  costSplitPercentage:     numeric('cost_split_percentage', { precision: 5, scale: 2 }),
  isCurrent:               boolean('is_current').notNull().default(true),
  // Acting assignment support (Org Chart Task A)
  isActing:                boolean('is_acting').notNull().default(false),
  actingEndDate:           date('acting_end_date'),
  // Project assignment (optional — BR-PROJ-001)
  projectId:               uuid('project_id').references(() => projects.id),
  projectAllocationPct:    numeric('project_allocation_pct', { precision: 5, scale: 2 }),
  // BR-INS-007: contractors excluded by default; HR Admin may grant exception
  insuranceExceptionGranted: boolean('insurance_exception_granted').notNull().default(false),
  notes:                   text('notes'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  // UPDATE = new business event (close+open); CORRECTION = in-place fix (no new row);
  // FUTURE_DATED = pre-loaded change, isCurrent=false until effectiveStartDate arrives.
  actionMode:             varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  // Ordering when two changes share the same effectiveStartDate (Oracle-style).
  effectiveSequence:      integer('effective_sequence').notNull().default(1),
  // FK to the row being corrected — populated only when actionMode = CORRECTION.
  correctsRowId:          uuid('corrects_row_id').references((): AnyPgColumn => workerAssignments.id),
  // Links back to the employment_actions or workflow_instances record that triggered this row.
  sourceTransactionId:    uuid('source_transaction_id'),
  ...audit(),
})

export const employmentActions = pgTable('employment_actions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:             uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  assignmentId:         uuid('assignment_id').references(() => workerAssignments.id),
  actionType:           varchar('action_type', { length: 50 }).notNull(),
  actionDate:           date('action_date').notNull(),
  effectiveDate:        date('effective_date').notNull(),
  reasonCode:           varchar('reason_code', { length: 50 }),
  reasonText:           varchar('reason_text', { length: 500 }),
  // Before-state snapshot
  beforeDepartmentId:   uuid('before_department_id'),
  beforePositionId:     uuid('before_position_id'),
  beforeGradeId:        uuid('before_grade_id'),
  beforeLocationId:     uuid('before_location_id'),
  beforeManagerId:      uuid('before_manager_id'),
  beforeBasicSalary:    numeric('before_basic_salary', { precision: 12, scale: 2 }),
  beforeEmploymentType: varchar('before_employment_type', { length: 30 }),
  beforeStatus:         varchar('before_status', { length: 30 }),
  // After-state snapshot
  afterDepartmentId:    uuid('after_department_id'),
  afterPositionId:      uuid('after_position_id'),
  afterGradeId:         uuid('after_grade_id'),
  afterLocationId:      uuid('after_location_id'),
  afterManagerId:       uuid('after_manager_id'),
  afterBasicSalary:     numeric('after_basic_salary', { precision: 12, scale: 2 }),
  afterEmploymentType:  varchar('after_employment_type', { length: 30 }),
  afterStatus:          varchar('after_status', { length: 30 }),
  // Workflow
  workflowInstanceId: uuid('workflow_instance_id'),
  initiatedBy:        uuid('initiated_by').notNull().references(() => persons.id),
  approvedBy:         uuid('approved_by').references(() => persons.id),
  approvalDate:       date('approval_date'),
  approvalNotes:      text('approval_notes'),
  rejectionReason:    text('rejection_reason'),
  // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED
  status: varchar('status', { length: 30 }).notNull().default('APPROVED'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4 — ABSENCE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

export const absencePlans = pgTable('absence_plans', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:            uuid('legal_entity_id').references(() => legalEntities.id),
  planCode:                 varchar('plan_code', { length: 50 }).notNull(),
  planNameEn:               varchar('plan_name_en', { length: 200 }).notNull(),
  planNameAr:               varchar('plan_name_ar', { length: 200 }),
  // CALENDAR_YEAR | ANNIVERSARY_YEAR | HIRE_DATE | NONE
  accrualMethod:            varchar('accrual_method', { length: 30 }).notNull(),
  carryForwardMaxDays:      numeric('carry_forward_max_days', { precision: 6, scale: 2 }).notNull().default('0'),
  carryForwardExpiryMonths: integer('carry_forward_expiry_months').notNull().default(0),
  allowNegativeBalance:     boolean('allow_negative_balance').notNull().default(false),
  accrualCeilingDays:       numeric('accrual_ceiling_days', { precision: 6, scale: 2 }),
  isActive:                 boolean('is_active').notNull().default(true),
  ...audit(),
})

export const absenceTypes = pgTable('absence_types', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:          uuid('legal_entity_id').references(() => legalEntities.id),
  absencePlanId:          uuid('absence_plan_id').references(() => absencePlans.id),
  typeCode:               varchar('type_code', { length: 30 }).notNull(),
  typeNameEn:             varchar('type_name_en', { length: 200 }).notNull(),
  typeNameAr:             varchar('type_name_ar', { length: 200 }),
  isStatutory:            boolean('is_statutory').notNull().default(true),
  // FULL_PAY | HALF_PAY | NO_PAY | TIERED
  isPaid:                 varchar('is_paid', { length: 20 }).notNull(),
  requiresMedicalCert:    boolean('requires_medical_cert').notNull().default(false),
  certRequiredAfterDays:  integer('cert_required_after_days').default(1),
  // MALE | FEMALE — maternity/paternity restrictions
  genderRestriction:      varchar('gender_restriction', { length: 10 }),
  religionRestriction:    varchar('religion_restriction', { length: 30 }),
  maxDaysPerYear:         numeric('max_days_per_year', { precision: 6, scale: 2 }),
  maxConsecutiveDays:     numeric('max_consecutive_days', { precision: 6, scale: 2 }),
  minServiceMonths:       integer('min_service_months').notNull().default(0),
  minNoticeDays:          integer('min_notice_days').notNull().default(0),
  payrollElementCode:     varchar('payroll_element_code', { length: 50 }),
  approvalRequired:       boolean('approval_required').notNull().default(true),
  // Balance-control gate (BR-LV-BAL-001). TRUE = this type draws down an
  // initialized leave balance; submission is BLOCKED when no absence_balances
  // row exists for the request year (fail-closed). FALSE = no balance control
  // (e.g. unpaid leave) — submission allowed, balance shown as not applicable.
  requiresBalance:        boolean('requires_balance').notNull().default(true),
  // Hajj leave — once per employment
  isOneTimePerEmployment: boolean('is_one_time_per_employment').notNull().default(false),
  isActive:               boolean('is_active').notNull().default(true),
  ...audit(),
})

export const absenceEntries = pgTable('absence_entries', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:   uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  absenceTypeId:   uuid('absence_type_id').notNull().references(() => absenceTypes.id),
  requestNumber:   varchar('request_number', { length: 30 }).notNull().unique(),
  startDate:       date('start_date').notNull(),
  endDate:         date('end_date').notNull(),
  durationDays:    numeric('duration_days', { precision: 6, scale: 2 }).notNull(),
  durationHours:   numeric('duration_hours', { precision: 6, scale: 2 }),
  isHalfDay:       boolean('is_half_day').notNull().default(false),
  // AM | PM
  halfDayPeriod:   varchar('half_day_period', { length: 10 }),
  returnDate:      date('return_date'),
  // PENDING | APPROVED | REJECTED | CANCELLED | TAKEN | RECALLED
  status:          varchar('status', { length: 30 }).notNull().default('PENDING'),
  // PORTAL | MOBILE | ARIA_TEXT | ARIA_VOICE | HR_ADMIN
  submittedVia:    varchar('submitted_via', { length: 20 }).notNull().default('PORTAL'),
  submittedBy:     uuid('submitted_by').notNull().references(() => persons.id),
  approvedBy:      uuid('approved_by').references(() => persons.id),
  approvalDate:    timestamp('approval_date', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  workflowInstanceId: uuid('workflow_instance_id'),
  // ARIA recommendation card
  ariaRecommendation:     varchar('aria_recommendation', { length: 20 }),
  ariaConfidenceScore:    numeric('aria_confidence_score', { precision: 5, scale: 4 }),
  ariaRecommendationJson: jsonb('aria_recommendation_json'),
  // Payroll linkage
  payrollElementCode:  varchar('payroll_element_code', { length: 50 }),
  payrollRunId:        uuid('payroll_run_id'),
  payDeductionAmount:  numeric('pay_deduction_amount', { precision: 12, scale: 2 }),
  // Medical certificate
  medicalCertRequired:   boolean('medical_cert_required').notNull().default(false),
  medicalCertUploaded:   boolean('medical_cert_uploaded').notNull().default(false),
  medicalCertDocumentId: uuid('medical_cert_document_id').references(() => personDocuments.id),
  medicalCertDeadline:   date('medical_cert_deadline'),
  // Balance snapshot at request time
  balanceBeforeDays: numeric('balance_before_days', { precision: 6, scale: 2 }),
  balanceAfterDays:  numeric('balance_after_days', { precision: 6, scale: 2 }),
  notes:             text('notes'),
  // JSONB cache of all custom field values — schema via custom_field_definitions
  extraData: jsonb('extra_data').$type<Record<string, unknown>>().notNull().default({}),
  ...audit(),
})

export const absenceBalances = pgTable('absence_balances', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  absenceTypeId:      uuid('absence_type_id').notNull().references(() => absenceTypes.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  balanceYear:        integer('balance_year').notNull(),
  openingBalanceDays: numeric('opening_balance_days', { precision: 6, scale: 2 }).notNull().default('0'),
  accruedDays:        numeric('accrued_days', { precision: 6, scale: 2 }).notNull().default('0'),
  takenDays:          numeric('taken_days', { precision: 6, scale: 2 }).notNull().default('0'),
  pendingDays:        numeric('pending_days', { precision: 6, scale: 2 }).notNull().default('0'),
  adjustedDays:       numeric('adjusted_days', { precision: 6, scale: 2 }).notNull().default('0'),
  carriedForwardDays: numeric('carried_forward_days', { precision: 6, scale: 2 }).notNull().default('0'),
  forfeitedDays:      numeric('forfeited_days', { precision: 6, scale: 2 }).notNull().default('0'),
  // GENERATED ALWAYS AS stored column
  // Computed by application: opening + accrued + carriedForward + adjusted - taken - pending - forfeited
  closingBalanceDays: numeric('closing_balance_days', { precision: 6, scale: 2 }),
  lastAccrualDate: date('last_accrual_date'),
  nextAccrualDate: date('next_accrual_date'),
  ...audit(),
})

// GAP-C07: Disability / Parental Accommodation Requests (UAE FDL 33/2021 Art 30)
export const accommodationRequests = pgTable('accommodation_requests', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:     uuid('person_id').notNull().references(() => persons.id),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // DISABILITY | PARENTAL | NURSING_BREAK
  requestType:  varchar('request_type', { length: 30 }).notNull(),
  descriptionEn: text('description_en').notNull(),
  descriptionAr: text('description_ar').notNull(),
  requestedAdjustments: text('requested_adjustments'),
  effectiveDate: date('effective_date').notNull(),
  endDate:       date('end_date'),
  // PENDING | APPROVED | REJECTED | CANCELLED
  status:        varchar('status', { length: 20 }).notNull().default('PENDING'),
  workflowInstanceId: uuid('workflow_instance_id'),
  supportingDocumentId: uuid('supporting_document_id').references(() => personDocuments.id),
  resolutionNotes: text('resolution_notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4B — ENROLLMENT & ASSIGNMENT HISTORY (Priority D)
// Date-effective tracking: close current row + open new row on each change.
// Pattern mirrors worker_assignments (effectiveStartDate/End, isCurrent, actionMode).
// ══════════════════════════════════════════════════════════════════════════════

export const leavePlanEnrolments = pgTable('leave_plan_enrolments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  absencePlanId:       uuid('absence_plan_id').notNull().references(() => absencePlans.id),
  enrollmentReason:    varchar('enrollment_reason', { length: 200 }),
  effectiveStartDate:  date('effective_start_date').notNull(),
  effectiveEndDate:    date('effective_end_date').default('9999-12-31'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:   integer('effective_sequence').notNull().default(1),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => leavePlanEnrolments.id),
  sourceTransactionId: uuid('source_transaction_id'),
  enrolledBy:          uuid('enrolled_by').references(() => persons.id),
  notes:               text('notes'),
  ...audit(),
})

export const workScheduleAssignments = pgTable('work_schedule_assignments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // FK to configuration.work_schedules — enforced by migration, not Drizzle (cross-file)
  workScheduleId:      uuid('work_schedule_id').notNull(),
  assignmentReason:    varchar('assignment_reason', { length: 200 }),
  effectiveStartDate:  date('effective_start_date').notNull(),
  effectiveEndDate:    date('effective_end_date').default('9999-12-31'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:   integer('effective_sequence').notNull().default(1),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => workScheduleAssignments.id),
  sourceTransactionId: uuid('source_transaction_id'),
  assignedBy:          uuid('assigned_by').references(() => persons.id),
  notes:               text('notes'),
  ...audit(),
})

export const payrollAssignments = pgTable('payroll_assignments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:       uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollId:           uuid('payroll_id').notNull().references(() => payrollDefinitions.id),
  // STANDARD | EXECUTIVE | HOURLY | DAILY — sub-group within a payroll run
  payrollGroup:        varchar('payroll_group', { length: 50 }).notNull().default('STANDARD'),
  changeReason:        varchar('change_reason', { length: 200 }),
  effectiveStartDate:  date('effective_start_date').notNull(),
  effectiveEndDate:    date('effective_end_date').default('9999-12-31'),
  isCurrent:           boolean('is_current').notNull().default(true),
  actionMode:          varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:   integer('effective_sequence').notNull().default(1),
  correctsRowId:       uuid('corrects_row_id').references((): AnyPgColumn => payrollAssignments.id),
  sourceTransactionId: uuid('source_transaction_id'),
  changedBy:           uuid('changed_by').references(() => persons.id),
  notes:               text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4C — MDM HISTORY TABLES (Phase 3)
//
// Append-only snapshot tables — written once per attribute change.
// FKs remain on the main tables (grades, departments, etc.); history rows
// answer "what did this object look like on date X?".
// validTo = NULL means the snapshot is still current.
// ══════════════════════════════════════════════════════════════════════════════

export const gradeHistory = pgTable('grade_history', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  gradeId:          uuid('grade_id').notNull().references(() => grades.id),
  // Snapshot of grade attributes at this point in time
  gradeCode:        varchar('grade_code', { length: 20 }).notNull(),
  gradeNameEn:      varchar('grade_name_en', { length: 100 }).notNull(),
  gradeNameAr:      varchar('grade_name_ar', { length: 100 }),
  gradeLevel:       integer('grade_level'),
  minSalary:        numeric('min_salary', { precision: 12, scale: 2 }),
  maxSalary:        numeric('max_salary', { precision: 12, scale: 2 }),
  midSalary:        numeric('mid_salary', { precision: 12, scale: 2 }),
  noticePeriodDays: integer('notice_period_days'),
  // Validity window
  validFrom:        date('valid_from').notNull(),
  validTo:          date('valid_to').default('9999-12-31'), // 9999-12-31 = still current
  isCurrent:        boolean('is_current').notNull().default(true),
  changeReason:     varchar('change_reason', { length: 300 }),
  changedBy:        uuid('changed_by').references(() => persons.id),
  changedAt:        timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const departmentHistory = pgTable('department_history', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  departmentId:       uuid('department_id').notNull().references(() => departments.id),
  // Snapshot
  code:               varchar('code', { length: 20 }).notNull(),
  nameEn:             varchar('name_en', { length: 150 }).notNull(),
  nameAr:             varchar('name_ar', { length: 150 }),
  departmentType:     varchar('department_type', { length: 50 }),
  approvedHeadcount:  integer('approved_headcount'),
  costCentreCode:     varchar('cost_centre_code', { length: 30 }),
  glAccountCode:      varchar('gl_account_code', { length: 30 }),
  parentDepartmentId: uuid('parent_department_id'),
  // Validity window
  validFrom:          date('valid_from').notNull(),
  validTo:            date('valid_to').default('9999-12-31'),
  isCurrent:          boolean('is_current').notNull().default(true),
  changeReason:       varchar('change_reason', { length: 300 }),
  changedBy:          uuid('changed_by').references(() => persons.id),
  changedAt:          timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const locationHistory = pgTable('location_history', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  locationId:   uuid('location_id').notNull().references(() => locations.id),
  // Snapshot
  code:         varchar('code', { length: 20 }).notNull(),
  nameEn:       varchar('name_en', { length: 150 }).notNull(),
  nameAr:       varchar('name_ar', { length: 150 }),
  addressLine1: varchar('address_line1', { length: 200 }),
  city:         varchar('city', { length: 100 }),
  emirate:      varchar('emirate', { length: 100 }),
  country:      varchar('country', { length: 3 }),
  timezone:     varchar('timezone', { length: 60 }),
  // Validity window
  validFrom:    date('valid_from').notNull(),
  validTo:      date('valid_to').default('9999-12-31'),
  isCurrent:    boolean('is_current').notNull().default(true),
  changeReason: varchar('change_reason', { length: 300 }),
  changedBy:    uuid('changed_by').references(() => persons.id),
  changedAt:    timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const jobHistory = pgTable('job_history', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  jobId:                 uuid('job_id').notNull().references(() => jobs.id),
  // Snapshot
  jobCode:               varchar('job_code', { length: 30 }).notNull(),
  jobTitleEn:            varchar('job_title_en', { length: 200 }).notNull(),
  jobTitleAr:            varchar('job_title_ar', { length: 200 }),
  jobFamily:             varchar('job_family', { length: 100 }),
  jobFunction:           varchar('job_function', { length: 100 }),
  isEmiratisationTarget: boolean('is_emiratisation_target'),
  isManagementRole:      boolean('is_management_role'),
  minGradeId:            uuid('min_grade_id'),
  maxGradeId:            uuid('max_grade_id'),
  // Validity window
  validFrom:             date('valid_from').notNull(),
  validTo:               date('valid_to').default('9999-12-31'),
  isCurrent:             boolean('is_current').notNull().default(true),
  changeReason:          varchar('change_reason', { length: 300 }),
  changedBy:             uuid('changed_by').references(() => persons.id),
  changedAt:             timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

export const positionHistory = pgTable('position_history', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  positionId:       uuid('position_id').notNull().references(() => positions.id),
  // Snapshot
  positionCode:     varchar('position_code', { length: 30 }).notNull(),
  positionTitleEn:  varchar('position_title_en', { length: 200 }).notNull(),
  positionTitleAr:  varchar('position_title_ar', { length: 200 }),
  departmentId:     uuid('department_id'),
  jobId:            uuid('job_id'),
  gradeId:          uuid('grade_id'),
  locationId:       uuid('location_id'),
  fteCount:         numeric('fte_count', { precision: 5, scale: 2 }),
  reportsToPositionId: uuid('reports_to_position_id'),
  budgetAmount:     numeric('budget_amount', { precision: 14, scale: 2 }),
  // Validity window
  validFrom:        date('valid_from').notNull(),
  validTo:          date('valid_to').default('9999-12-31'),
  isCurrent:        boolean('is_current').notNull().default(true),
  changeReason:     varchar('change_reason', { length: 300 }),
  changedBy:        uuid('changed_by').references(() => persons.id),
  changedAt:        timestamp('changed_at', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4b — PROJECT MDM
// ══════════════════════════════════════════════════════════════════════════════

// V-PROJ — Projects master data (BR-PROJ-001: code unique per legal entity)
export const projects = pgTable('projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  code:          varchar('code', { length: 30 }).notNull(),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }),
  // INTERNAL | EXTERNAL | CAPITAL | MAINTENANCE | RESEARCH | OTHER
  projectType:   varchar('project_type', { length: 50 }),
  glMappingCode: varchar('gl_mapping_code', { length: 50 }),
  description:   text('description'),
  startDate:     date('start_date'),
  endDate:       date('end_date'),
  isActive:      boolean('is_active').notNull().default(true),
  // History-versioning (Correction Mode infrastructure)
  actionMode:    varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId: uuid('corrects_row_id').references((): AnyPgColumn => projects.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 5 — PAYROLL TABLES
// ══════════════════════════════════════════════════════════════════════════════

export const salaryElements = pgTable('salary_elements', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:              uuid('person_id').notNull().references(() => persons.id),
  assignmentId:          uuid('assignment_id').notNull().references(() => workerAssignments.id),
  legalEntityId:         uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollId:             uuid('payroll_id').notNull().references(() => payrollDefinitions.id),
  elementCode:           varchar('element_code', { length: 50 }).notNull(),
  elementNameEn:         varchar('element_name_en', { length: 200 }).notNull(),
  elementNameAr:         varchar('element_name_ar', { length: 200 }),
  // EARNINGS | DEDUCTION | EMPLOYER_COST | EMPLOYER_LIABILITY | INFO
  elementClassification: varchar('element_classification', { length: 30 }).notNull(),
  amount:                numeric('amount', { precision: 14, scale: 2 }),
  percentageBasis:       varchar('percentage_basis', { length: 30 }),
  percentageValue:       numeric('percentage_value', { precision: 6, scale: 4 }),
  currency:              char('currency', { length: 3 }).notNull().default('AED'),
  isRecurring:           boolean('is_recurring').notNull().default(true),
  effectiveStartDate:    date('effective_start_date').notNull(),
  effectiveEndDate:      date('effective_end_date').default('9999-12-31'),
  // ── Date-effective versioning (Priority A) ───────────────────────────────
  actionMode:            varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  effectiveSequence:     integer('effective_sequence').notNull().default(1),
  correctsRowId:         uuid('corrects_row_id').references((): AnyPgColumn => salaryElements.id),
  processingOrder:       integer('processing_order').notNull().default(100),
  // Only basic salary is subject to EOSB — BR-EOSB-001
  isSubjectToEosb:       boolean('is_subject_to_eosb').notNull().default(false),
  isSubjectToGpssa:      boolean('is_subject_to_gpssa').notNull().default(false),
  isWpsReportable:       boolean('is_wps_reportable').notNull().default(true),
  glAccountCode:         varchar('gl_account_code', { length: 50 }),
  oracleElementId:       varchar('oracle_element_id', { length: 50 }),
  notes:                 text('notes'),
  ...audit(),
})

export const payrollRuns = pgTable('payroll_runs', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollId:               uuid('payroll_id').notNull().references(() => payrollDefinitions.id),
  legalEntityId:           uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // P2-P4 — run numbers are a PER-ENTITY sequence (nextRunNumber computes MAX
  // scoped to legal_entity_id). The uniqueness MUST therefore be composite, not
  // global: a global UNIQUE(run_number) made entity A and entity B collide on
  // PR-000001. See migration 0055 and the uniqueIndex below.
  runNumber:               varchar('run_number', { length: 30 }).notNull(),
  payPeriodStart:          date('pay_period_start').notNull(),
  payPeriodEnd:            date('pay_period_end').notNull(),
  paymentDate:             date('payment_date').notNull(),
  // REGULAR | OFF_CYCLE | CORRECTION | FINAL_SETTLEMENT
  runType:                 varchar('run_type', { length: 20 }).notNull().default('REGULAR'),
  // DRAFT | PRE_CHECKS_PASSED | CALCULATED | UNDER_REVIEW | LOCKED |
  // SIF_GENERATED | SUBMITTED_TO_BANK | CONFIRMED | ARCHIVED
  status:                  varchar('status', { length: 30 }).notNull().default('DRAFT'),
  // Totals (populated after calculation)
  employeeCount:           integer('employee_count'),
  totalGrossPay:           numeric('total_gross_pay', { precision: 14, scale: 2 }),
  totalDeductions:         numeric('total_deductions', { precision: 14, scale: 2 }),
  totalNetPay:             numeric('total_net_pay', { precision: 14, scale: 2 }),
  totalEmployerCost:       numeric('total_employer_cost', { precision: 14, scale: 2 }),
  totalEosbProvision:      numeric('total_eosb_provision', { precision: 14, scale: 2 }),
  totalGpssaEmployer:      numeric('total_gpssa_employer', { precision: 14, scale: 2 }),
  // WPS (BR-WPS-001 through BR-WPS-005)
  sifFileReference:        varchar('sif_file_reference', { length: 300 }),
  sifGeneratedAt:          timestamp('sif_generated_at', { withTimezone: true }),
  wpsSubmissionDate:       timestamp('wps_submission_date', { withTimezone: true }),
  wpsConfirmationRef:      varchar('wps_confirmation_ref', { length: 100 }),
  wpsConfirmationDate:     timestamp('wps_confirmation_date', { withTimezone: true }),
  wpsDeadline:             date('wps_deadline'),
  // Oracle GL integration
  glJournalReference:      varchar('gl_journal_reference', { length: 100 }),
  glPostedDate:            timestamp('gl_posted_date', { withTimezone: true }),
  glPostedBy:              uuid('gl_posted_by'),
  // Locking
  lockedAt:                timestamp('locked_at', { withTimezone: true }),
  lockedBy:                uuid('locked_by'),
  lockReason:              text('lock_reason'),
  // Finance approval
  financeApprovedBy:       uuid('finance_approved_by').references(() => persons.id),
  financeApprovalDate:     timestamp('finance_approval_date', { withTimezone: true }),
  notes:                   text('notes'),
  ...audit(),
}, (t) => ({
  // P2-P4 — per-entity run-number uniqueness (replaces the global UNIQUE).
  runNumberPerEntity: uniqueIndex('uq_payroll_run_number_per_entity')
    .on(t.tenantId, t.legalEntityId, t.runNumber),
}))

export const payrollResults = pgTable('payroll_results', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollRunId:          uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  personId:              uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:         uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  assignmentId:          uuid('assignment_id').references(() => workerAssignments.id),
  // Earnings
  basicSalary:           numeric('basic_salary', { precision: 12, scale: 2 }).notNull().default('0'),
  housingAllowance:      numeric('housing_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  transportAllowance:    numeric('transport_allowance', { precision: 12, scale: 2 }).notNull().default('0'),
  otherAllowances:       numeric('other_allowances', { precision: 12, scale: 2 }).notNull().default('0'),
  overtimePay:           numeric('overtime_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  bonus:                 numeric('bonus', { precision: 12, scale: 2 }).notNull().default('0'),
  commission:            numeric('commission', { precision: 12, scale: 2 }).notNull().default('0'),
  retroPay:              numeric('retro_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  totalGrossPay:         numeric('total_gross_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  // Deductions
  sickLeaveDeduction:     numeric('sick_leave_deduction', { precision: 12, scale: 2 }).notNull().default('0'),
  unpaidLeaveDeduction:   numeric('unpaid_leave_deduction', { precision: 12, scale: 2 }).notNull().default('0'),
  salaryAdvanceDeduct:    numeric('salary_advance_deduct', { precision: 12, scale: 2 }).notNull().default('0'),
  gpssaEmployeeDeduct:    numeric('gpssa_employee_deduct', { precision: 12, scale: 2 }).notNull().default('0'),
  medicalInsuranceDeduct: numeric('medical_insurance_deduct', { precision: 12, scale: 2 }).notNull().default('0'),
  otherDeductions:        numeric('other_deductions', { precision: 12, scale: 2 }).notNull().default('0'),
  totalDeductions:        numeric('total_deductions', { precision: 12, scale: 2 }).notNull().default('0'),
  netPay:                 numeric('net_pay', { precision: 12, scale: 2 }).notNull().default('0'),
  // Employer costs
  gpssaEmployerContrib:  numeric('gpssa_employer_contrib', { precision: 12, scale: 2 }).notNull().default('0'),
  eosbProvision:         numeric('eosb_provision', { precision: 12, scale: 2 }).notNull().default('0'),
  medicalInsuranceEr:    numeric('medical_insurance_er', { precision: 12, scale: 2 }).notNull().default('0'),
  totalEmployerCost:     numeric('total_employer_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  // WPS payment
  iban:             varchar('iban', { length: 23 }),
  bankCode:         varchar('bank_code', { length: 20 }),
  // PENDING | INCLUDED_IN_SIF | PAID | FAILED | ON_HOLD
  paymentStatus:    varchar('payment_status', { length: 30 }).notNull().default('PENDING'),
  paymentReference: varchar('payment_reference', { length: 100 }),
  // Variance monitoring
  priorMonthNetPay:  numeric('prior_month_net_pay', { precision: 12, scale: 2 }),
  variancePct:       numeric('variance_pct', { precision: 8, scale: 4 }),
  isVarianceFlagged: boolean('is_variance_flagged').notNull().default(false),
  varianceReason:    text('variance_reason'),
  // YTD accumulators
  ytdGrossPay:      numeric('ytd_gross_pay', { precision: 14, scale: 2 }).notNull().default('0'),
  ytdNetPay:        numeric('ytd_net_pay', { precision: 14, scale: 2 }).notNull().default('0'),
  ytdEosbProvision: numeric('ytd_eosb_provision', { precision: 14, scale: 2 }).notNull().default('0'),
  ytdGpssa:         numeric('ytd_gpssa', { precision: 14, scale: 2 }).notNull().default('0'),
  ...audit(),
})

export const eosbCalculations = pgTable('eosb_calculations', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:             uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // MONTHLY_PROVISION | ON_DEMAND_ESTIMATE | FINAL_SETTLEMENT
  calculationType:      varchar('calculation_type', { length: 30 }).notNull(),
  calculationDate:      date('calculation_date').notNull(),
  // Inputs
  hireDate:             date('hire_date').notNull(),
  terminationDate:      date('termination_date'),
  basicSalaryAtCalc:    numeric('basic_salary_at_calc', { precision: 12, scale: 2 }).notNull(),
  totalUnpaidLeaveDays: integer('total_unpaid_leave_days').notNull().default(0),
  // Service calculation
  totalCalendarDays:    integer('total_calendar_days').notNull(),
  netServiceDays:       integer('net_service_days').notNull(),
  serviceYears:         numeric('service_years', { precision: 8, scale: 4 }).notNull(),
  // Calculation breakdown — BR-EOSB-001 through BR-EOSB-007
  dailyRate:            numeric('daily_rate', { precision: 12, scale: 4 }).notNull(),
  daysRateYears1To5:    integer('days_rate_years_1_to_5').notNull().default(21),
  daysRateYearsBeyond5: integer('days_rate_years_beyond_5').notNull().default(30),
  eosbFirst5Years:      numeric('eosb_first_5_years', { precision: 14, scale: 2 }).notNull().default('0'),
  eosbBeyond5Years:     numeric('eosb_beyond_5_years', { precision: 14, scale: 2 }).notNull().default('0'),
  eosbBeforeCap:        numeric('eosb_before_cap', { precision: 14, scale: 2 }).notNull(),
  // Cap = 24 months basic salary
  capAmount:            numeric('cap_amount', { precision: 14, scale: 2 }),
  isCapped:             boolean('is_capped').notNull().default(false),
  eosbFinalAmount:      numeric('eosb_final_amount', { precision: 14, scale: 2 }).notNull(),
  partTimeRatio:        numeric('part_time_ratio', { precision: 6, scale: 4 }).notNull().default('1.0000'),
  eosbAfterRatio:       numeric('eosb_after_ratio', { precision: 14, scale: 2 }).notNull(),
  // Linked records
  payrollRunId:            uuid('payroll_run_id').references(() => payrollRuns.id),
  employmentActionId:      uuid('employment_action_id').references(() => employmentActions.id),
  // Full step-by-step calculation JSON for auditability
  calculationFormulaJson:  jsonb('calculation_formula_json'),
  triggeredByUser:         uuid('triggered_by_user').references(() => persons.id),
  notes:                   text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 6 — CROSS-MODULE: IMMUTABLE AUDIT LOG
// INSERT-ONLY — no UPDATE or DELETE ever (enforced at application layer)
// ══════════════════════════════════════════════════════════════════════════════

export const auditLog = pgTable('audit_log', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  eventTime: timestamp('event_time', { withTimezone: true }).defaultNow().notNull(),
  // Who
  actorId:       uuid('actor_id').notNull(),
  actorName:     varchar('actor_name', { length: 200 }).notNull(),
  actorRole:     varchar('actor_role', { length: 50 }).notNull(),
  actorEntityId: uuid('actor_entity_id'),
  // How
  // WEB | MOBILE | ARIA_TEXT | ARIA_VOICE | API | SYSTEM | BATCH
  channel:    varchar('channel', { length: 30 }).notNull(),
  ipAddress:  text('ip_address'),
  deviceInfo: varchar('device_info', { length: 300 }),
  sessionId:  uuid('session_id'),
  // What — e.g., EMPLOYEE.SALARY.VIEW | LEAVE.REQUEST.APPROVE
  eventType:    varchar('event_type', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId:   uuid('resource_id'),
  entityId:     uuid('entity_id'),
  // Change delta
  oldValues:     jsonb('old_values'),
  newValues:     jsonb('new_values'),
  changedFields: text('changed_fields').array(),
  // Context
  metadata:    jsonb('metadata'),
  description: text('description'),
  // audit_log intentionally has NO audit() spread — it is its own audit record
})

// ══════════════════════════════════════════════════════════════════════════════
// INFERRED TYPESCRIPT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type LegalEntity         = typeof legalEntities.$inferSelect
export type Grade               = typeof grades.$inferSelect
export type PayrollDefinition   = typeof payrollDefinitions.$inferSelect
export type Person              = typeof persons.$inferSelect
export type BusinessUnit        = typeof businessUnits.$inferSelect
export type Department          = typeof departments.$inferSelect
export type Location            = typeof locations.$inferSelect
export type Job                 = typeof jobs.$inferSelect
export type Position            = typeof positions.$inferSelect
export type PersonContact       = typeof personContacts.$inferSelect
export type PersonAddress       = typeof personAddresses.$inferSelect
export type PersonDocument      = typeof personDocuments.$inferSelect
export type PersonBankDetail    = typeof personBankDetails.$inferSelect
export type PersonDependent     = typeof personDependents.$inferSelect
export type PersonEmergency     = typeof personEmergencyContacts.$inferSelect
export type PersonEducation     = typeof personEducation.$inferSelect
export type PersonCert          = typeof personProfessionalCerts.$inferSelect
export type Contract            = typeof contracts.$inferSelect
export type WorkerAssignment    = typeof workerAssignments.$inferSelect
export type EmploymentAction    = typeof employmentActions.$inferSelect
export type AbsencePlan              = typeof absencePlans.$inferSelect
export type AbsenceType              = typeof absenceTypes.$inferSelect
export type AbsenceEntry             = typeof absenceEntries.$inferSelect
export type AbsenceBalance           = typeof absenceBalances.$inferSelect
export type LeavePlanEnrolment       = typeof leavePlanEnrolments.$inferSelect
export type WorkScheduleAssignment   = typeof workScheduleAssignments.$inferSelect
export type PayrollAssignment        = typeof payrollAssignments.$inferSelect
export type GradeHistory             = typeof gradeHistory.$inferSelect
export type DepartmentHistory        = typeof departmentHistory.$inferSelect
export type LocationHistory          = typeof locationHistory.$inferSelect
export type JobHistory               = typeof jobHistory.$inferSelect
export type PositionHistory          = typeof positionHistory.$inferSelect
export type SalaryElement       = typeof salaryElements.$inferSelect
export type PayrollRun          = typeof payrollRuns.$inferSelect
export type PayrollResult       = typeof payrollResults.$inferSelect
export type EosbCalculation     = typeof eosbCalculations.$inferSelect
export type AuditLogEntry       = typeof auditLog.$inferSelect
export type LookupValue         = typeof lookupValues.$inferSelect
export type Project             = typeof projects.$inferSelect

export type NewLegalEntity      = typeof legalEntities.$inferInsert
export type NewPerson           = typeof persons.$inferInsert
export type NewWorkerAssignment = typeof workerAssignments.$inferInsert
export type NewAbsenceEntry     = typeof absenceEntries.$inferInsert
export type NewEosbCalculation  = typeof eosbCalculations.$inferInsert
export type NewAuditLogEntry    = typeof auditLog.$inferInsert
export type NewProject          = typeof projects.$inferInsert


================================================================================
FILE [P4-01]: drizzle/schema/index.ts
LINES: 32
================================================================================
// Foundation tables: Parts 1–6 of ERD (persons, org structure, payroll, absence, audit)
export * from './foundation'

// Configuration tables: Task 4 + ERD §7.1–7.4, §7.10, §9.1, §10.1, §10.6
export * from './configuration'

// Transaction/operational tables: ERD §7.5–7.15, §9.2–9.3, §10.2–10.5, §10.7
export * from './transactions'

// Workflow Engine v2: hybrid hierarchy, condition trees, immutable snapshots, UAE SLA
export * from './workflow-engine'

// Attendance / Timesheet: biometric sync, manual entries, exceptions
export * from './timesheets'

// HR Action Requests: hiring_requests, transfer_requests (Task E)
export * from './actions'

// Org Chart Snapshot Cache: org_hierarchy_snapshots (Session 6)
export * from './org-cache'

// Employee Letters: token registry, template types, templates, letter instances
export * from './employee-letters'

// Probation Workflow: probation_reviews table (BR-37, BR-PW-001)
export * from './probation'

// Durable in-DB document storage: document_files (bytea) — migration 0052
export * from './document-files'

// Communication / Email Platform: provider settings, templates, messages, events
export * from './communication'


================================================================================
FILE [P4-01]: drizzle/schema/org-cache.ts
LINES: 39
================================================================================
/**
 * AVANIIS HR — Org Chart Snapshot Cache (Session 6)
 *
 * Stores pre-computed node/edge JSON per engine+scope so the SSR page
 * can skip the expensive recursive CTE and serve from this table instead
 * (~50 ms read vs ~800 ms cold CTE).
 *
 * The cron job (lib/jobs/org-chart-snapshot.ts) marks rows stale after
 * any structural write and recomputes them hourly.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { TENANT_ID } from '../../lib/constants'

export const orgHierarchySnapshots = pgTable('org_hierarchy_snapshots', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().default(TENANT_ID),
  engine:              varchar('engine', { length: 50 }).notNull(),
  scopeKey:            varchar('scope_key', { length: 200 }).notNull().default('full'),

  /** JSON arrays serialised from OrgFlowNode[] / OrgFlowEdge[] */
  nodes:               jsonb('nodes').notNull().default([]),
  edges:               jsonb('edges').notNull().default([]),
  /** OrgTreeMeta serialised as JSON */
  meta:                jsonb('meta').notNull().default({}),

  nodeCount:           integer('node_count').notNull().default(0),
  isStale:             boolean('is_stale').notNull().default(false),
  computedAt:          timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  recomputeStartedAt:  timestamp('recompute_started_at', { withTimezone: true }),
})


================================================================================
FILE [P4-01]: drizzle/schema/probation.ts
LINES: 90
================================================================================
/**
 * AVANIIS HR — Probation Review Workflow Table
 * BR-37: total probation cannot exceed 6 months (182 days) from hire_date.
 * BR-PW-001: only one active review per person at a time (enforced via partial unique index).
 * BR-NO-DELETE: review records are never deleted; status transitions only.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
} from 'drizzle-orm/pg-core'
import { persons, legalEntities } from './foundation'
import { employeeLetters }        from './employee-letters'
import { TENANT_ID }              from '../../lib/constants'

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// probation_reviews
// ══════════════════════════════════════════════════════════════════════════════

export const probationReviews = pgTable('probation_reviews', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),

  personId:          uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  initiatedByPersonId: uuid('initiated_by_person_id').notNull().references(() => persons.id),
  initiatedAt:       timestamp('initiated_at', { withTimezone: true }).notNull().defaultNow(),
  // HR_ADMIN | EMPLOYEE | MANAGER
  initiatedByChannel: varchar('initiated_by_channel', { length: 20 }).notNull().default('HR_ADMIN'),

  // Probation state snapshot at initiation (immutable after insert)
  probationEndDateAtInitiation: date('probation_end_date_at_initiation').notNull(),
  hireDateAtInitiation:         date('hire_date_at_initiation').notNull(),
  // BR-37: computed as hire_date + 182 days, stored on insert
  maxAllowedExtensionDate:      date('max_allowed_extension_date').notNull(),

  // Line Manager step
  // CONFIRM | EXTEND | FAIL (null until LM submits)
  lmRecommendation:    varchar('lm_recommendation', { length: 10 }),
  lmComments:          text('lm_comments'),
  lmRecommendedAt:     timestamp('lm_recommended_at', { withTimezone: true }),
  lmPersonId:          uuid('lm_person_id').references(() => persons.id),
  // only when lm_recommendation = 'EXTEND'; must be <= max_allowed_extension_date (BR-37)
  requestedExtensionEndDate: date('requested_extension_end_date'),

  // HR Admin step
  // APPROVED | REJECTED (null until HR decides)
  hrDecision:   varchar('hr_decision', { length: 10 }),
  hrComments:   text('hr_comments'),
  hrDecidedAt:  timestamp('hr_decided_at', { withTimezone: true }),
  hrPersonId:   uuid('hr_person_id').references(() => persons.id),

  // Overall review status
  // PENDING_LM | PENDING_HR | PENDING_ACKNOWLEDGMENT | COMPLETED | REJECTED | CANCELLED
  reviewStatus: varchar('review_status', { length: 30 }).notNull().default('PENDING_LM'),

  // Final outcome — set only when review_status = COMPLETED
  // CONFIRMED | EXTENDED | FAILED
  outcome: varchar('outcome', { length: 10 }),

  // Links to related records
  workflowInstanceId:          uuid('workflow_instance_id'),
  confirmationLetterId:        uuid('confirmation_letter_id').references(() => employeeLetters.id),
  extensionLetterId:           uuid('extension_letter_id').references(() => employeeLetters.id),
  // FK to chained termination workflow when outcome = FAILED
  terminationWorkflowInstanceId: uuid('termination_workflow_instance_id'),
  completedAt:                 timestamp('completed_at', { withTimezone: true }),

  ...audit(),
})

export type ProbationReview    = typeof probationReviews.$inferSelect
export type NewProbationReview = typeof probationReviews.$inferInsert


================================================================================
FILE [P4-01]: drizzle/schema/timesheets.ts
LINES: 149
================================================================================
/**
 * AVANIIS HR — Attendance / Timesheet Schema
 * Biometric attendance tracking, manual entries, exception handling.
 *
 * Import chain: foundation → configuration → transactions → timesheets
 * BR-AUDIT-001: All tables carry 7 audit columns.
 * BR-TENANT-001: All tables carry tenant_id.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  time,
  integer,
  numeric,
} from 'drizzle-orm/pg-core'
import { persons } from './foundation'
import { TENANT_ID } from '../../lib/constants'

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE RECORDS — one row per employee per calendar day
// ══════════════════════════════════════════════════════════════════════════════

export const attendanceRecords = pgTable('attendance_records', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  employeeNumber: varchar('employee_number', { length: 50 }),
  attendanceDate: date('attendance_date').notNull(),
  timeIn:         timestamp('time_in', { withTimezone: true }),
  timeOut:        timestamp('time_out', { withTimezone: true }),
  workedHours:    numeric('worked_hours', { precision: 5, scale: 2 }).default('0'),
  shiftStart:     time('shift_start'),
  shiftEnd:       time('shift_end'),
  contractedHours: numeric('contracted_hours', { precision: 4, scale: 2 }).default('8'),
  // PRESENT | LATE | EARLY_LEAVE | ABSENT | ON_LEAVE | PUBLIC_HOLIDAY | WEEKEND | MISS_PUNCH | PENDING_APPROVAL
  status:         varchar('status', { length: 30 }).notNull(),
  isLate:         boolean('is_late').default(false),
  lateMinutes:    integer('late_minutes').default(0),
  isEarlyLeave:   boolean('is_early_leave').default(false),
  earlyLeaveMinutes: integer('early_leave_minutes').default(0),
  isMissPunch:    boolean('is_miss_punch').default(false),
  overtimeHours:  numeric('overtime_hours', { precision: 4, scale: 2 }).default('0'),
  // DEVICE | MANUAL | EXCEL_UPLOAD | SYSTEM
  source:         varchar('source', { length: 20 }).default('DEVICE'),
  deviceId:       varchar('device_id', { length: 100 }),
  // AUTO | PENDING | APPROVED | REJECTED
  approvalStatus: varchar('approval_status', { length: 20 }).default('AUTO'),
  approvedById:   uuid('approved_by_id'),
  approvedByName: varchar('approved_by_name', { length: 200 }),
  approvedDate:   timestamp('approved_date', { withTimezone: true }),
  notes:          text('notes'),
  isActive:       boolean('is_active').default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE EXCEPTIONS — employee-raised correction requests
// ══════════════════════════════════════════════════════════════════════════════

export const attendanceExceptions = pgTable('attendance_exceptions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  attendanceRecordId:  uuid('attendance_record_id').references(() => attendanceRecords.id),
  exceptionDate:       date('exception_date').notNull(),
  // LATE_COMING | EARLY_LEAVING | MISS_PUNCH | BUSINESS_MEETING | OTHER
  exceptionType:       varchar('exception_type', { length: 30 }).notNull(),
  reason:              text('reason').notNull(),
  requestedTimeIn:     timestamp('requested_time_in', { withTimezone: true }),
  requestedTimeOut:    timestamp('requested_time_out', { withTimezone: true }),
  // PENDING | APPROVED | REJECTED
  status:              varchar('status', { length: 20 }).default('PENDING'),
  managerComment:      text('manager_comment'),
  reviewedById:        uuid('reviewed_by_id'),
  reviewedByName:      varchar('reviewed_by_name', { length: 200 }),
  reviewedDate:        timestamp('reviewed_date', { withTimezone: true }),
  workflowInstanceId:  uuid('workflow_instance_id'),
  isActive:            boolean('is_active').default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE SYNC LOG — one row per biometric device sync call
// ══════════════════════════════════════════════════════════════════════════════

export const deviceSyncLog = pgTable('device_sync_log', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  deviceId:         varchar('device_id', { length: 100 }).notNull(),
  deviceName:       varchar('device_name', { length: 200 }),
  syncTimestamp:    timestamp('sync_timestamp', { withTimezone: true }).defaultNow().notNull(),
  recordsReceived:  integer('records_received').default(0),
  recordsProcessed: integer('records_processed').default(0),
  recordsRejected:  integer('records_rejected').default(0),
  recordsFailed:    integer('records_failed').default(0),
  // SUCCESS | PARTIAL | FAILED
  status:           varchar('status', { length: 20 }),
  errorSummary:     text('error_summary'),
  createdDate:      timestamp('created_date', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE PUNCH RAW — raw punch records before processing
// ══════════════════════════════════════════════════════════════════════════════

export const devicePunchRaw = pgTable('device_punch_raw', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  deviceId:         varchar('device_id', { length: 100 }),
  employeeIdRaw:    varchar('employee_id_raw', { length: 100 }),
  employeeEmail:    varchar('employee_email', { length: 255 }),
  punchTimestamp:   timestamp('punch_timestamp', { withTimezone: true }).notNull(),
  // IN | OUT | UNKNOWN
  punchType:        varchar('punch_type', { length: 10 }),
  processed:        boolean('processed').default(false),
  rejected:         boolean('rejected').default(false),
  rejectReason:     varchar('reject_reason', { length: 200 }),
  createdDate:      timestamp('created_date', { withTimezone: true }).defaultNow(),
})

// ── TypeScript types ──────────────────────────────────────────────────────

export type AttendanceRecord    = typeof attendanceRecords.$inferSelect
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert

export type AttendanceException    = typeof attendanceExceptions.$inferSelect
export type NewAttendanceException = typeof attendanceExceptions.$inferInsert

export type DeviceSyncLog    = typeof deviceSyncLog.$inferSelect
export type DevicePunchRaw   = typeof devicePunchRaw.$inferSelect


================================================================================
FILE [P4-01]: drizzle/schema/transactions.ts
LINES: 634
================================================================================
/**
 * AVANIIS HR — Transactions Schema
 * Operational tables that are created/updated at runtime (not config-time).
 * ERD Parts 7 (missing tables), 9 (insurance enrolments), 10 (contributions).
 *
 * Import chain: foundation → configuration → transactions
 * (No circular imports)
 */
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  pgTable,
  uuid,
  varchar,
  char,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  jsonb,
  inet,
} from 'drizzle-orm/pg-core'
import {
  legalEntities,
  persons,
  departments,
  workerAssignments,
  payrollRuns,
  personDocuments,
  personDependents,
} from './foundation'
import {
  workflowDefinitions,
  workflowStages,
  medicalInsurancePlans,
} from './configuration'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers ────────────────────────────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.5 — WORKFLOW INSTANCES (operational, moved from configuration)
// Live approval transactions in-flight.
// ══════════════════════════════════════════════════════════════════════════════

export const workflowInstances = pgTable('workflow_instances', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  // The record this workflow is approving (e.g., absence_entry.id)
  resourceType:         varchar('resource_type', { length: 50 }).notNull(),
  resourceId:           uuid('resource_id').notNull(),
  initiatedByPersonId:  uuid('initiated_by_person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  currentStageId:       uuid('current_stage_id').references(() => workflowStages.id),
  currentStageOrder:    integer('current_stage_order').notNull().default(1),
  // PENDING | IN_PROGRESS | APPROVED | REJECTED | CANCELLED | ESCALATED
  status:               varchar('status', { length: 30 }).notNull().default('PENDING'),
  startedAt:            timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt:          timestamp('completed_at', { withTimezone: true }),
  slaDeadline:          timestamp('sla_deadline', { withTimezone: true }),
  escalatedAt:          timestamp('escalated_at', { withTimezone: true }),
  finalDecisionBy:      uuid('final_decision_by').references(() => persons.id),
  finalDecisionNote:    text('final_decision_note'),
  rejectionReason:      text('rejection_reason'),
  approvalChainJson:    jsonb('approval_chain_json'),
  // S9-03: per-instance one-shot delegation. When set, overrides the
  // current stage's role-based assignment for this single instance — the
  // delegate, not the role, is the authoritative approver. Cleared (set to
  // null) by the next decision so subsequent stages route normally.
  currentDelegateePersonId: uuid('current_delegatee_person_id').references(() => persons.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.6 — APPROVAL DELEGATIONS
// Temporary approval authority transfer (e.g., while on leave).
// ══════════════════════════════════════════════════════════════════════════════

export const approvalDelegations = pgTable('approval_delegations', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  delegatorId:    uuid('delegator_id').notNull().references(() => persons.id),
  delegateId:     uuid('delegate_id').notNull().references(() => persons.id),
  legalEntityId:  uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  delegationFrom: date('delegation_from').notNull(),
  delegationTo:   date('delegation_to').notNull(),
  // NULL = all transaction types; or array of specific types
  scopeTypes:     text('scope_types').array(),
  reason:         text('reason'),
  isActive:       boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.7 — NOTIFICATION LOG
// Tracks all system notifications sent across channels.
// ══════════════════════════════════════════════════════════════════════════════

export const notificationLog = pgTable('notification_log', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:     uuid('legal_entity_id').references(() => legalEntities.id),
  recipientPersonId: uuid('recipient_person_id').notNull().references(() => persons.id),
  // DOCUMENT_EXPIRY | LEAVE_REQUEST | LEAVE_APPROVED | LEAVE_REJECTED |
  // PAYROLL_DEADLINE | WPS_CONFIRMATION | CONTRACT_EXPIRY |
  // APPROVAL_REQUIRED | APPROVAL_ESCALATION | ARIA_ALERT | SYSTEM_ALERT
  notificationType:  varchar('notification_type', { length: 100 }).notNull(),
  // PUSH | EMAIL | SMS | IN_APP | ARIA
  channel:           varchar('channel', { length: 30 }).notNull(),
  subjectEn:         varchar('subject_en', { length: 500 }),
  subjectAr:         varchar('subject_ar', { length: 500 }),
  bodyEn:            text('body_en'),
  bodyAr:            text('body_ar'),
  referenceType:     varchar('reference_type', { length: 100 }),
  referenceId:       uuid('reference_id'),
  referencePath:     varchar('reference_path', { length: 500 }),
  sentAt:            timestamp('sent_at', { withTimezone: true }),
  deliveredAt:       timestamp('delivered_at', { withTimezone: true }),
  readAt:            timestamp('read_at', { withTimezone: true }),
  // PENDING | SENT | DELIVERED | READ | FAILED | BOUNCED
  status:            varchar('status', { length: 20 }).notNull().default('PENDING'),
  failureReason:     text('failure_reason'),
  retryCount:        integer('retry_count').notNull().default(0),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.8 — ONBOARDING / OFFBOARDING CHECKLISTS
// ══════════════════════════════════════════════════════════════════════════════

export const onboardingChecklists = pgTable('onboarding_checklists', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:  uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // ONBOARDING | OFFBOARDING
  checklistType:  varchar('checklist_type', { length: 20 }).notNull().default('ONBOARDING'),
  initiatedDate:  date('initiated_date').notNull(),
  targetDate:     date('target_date'),
  // NOT_STARTED | IN_PROGRESS | COMPLETED | OVERDUE
  status:         varchar('status', { length: 30 }).notNull().default('IN_PROGRESS'),
  completionDate: date('completion_date'),
  completionPct:  integer('completion_pct').notNull().default(0),
  notes:          text('notes'),
  ...audit(),
})

export const onboardingChecklistItems = pgTable('onboarding_checklist_items', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  checklistId:      uuid('checklist_id').notNull().references(() => onboardingChecklists.id),
  itemCode:         varchar('item_code', { length: 50 }).notNull(),
  itemNameEn:       varchar('item_name_en', { length: 300 }).notNull(),
  itemNameAr:       varchar('item_name_ar', { length: 300 }),
  // DOCUMENT | IT | HR | PAYROLL | MANAGER | TRAINING
  category:         varchar('category', { length: 50 }),
  isMandatory:      boolean('is_mandatory').notNull().default(true),
  dueDaysFromStart: integer('due_days_from_start'),
  // EMPLOYEE | HR_ADMIN | IT | MANAGER | PAYROLL_ADMIN
  assignedToRole:   varchar('assigned_to_role', { length: 50 }),
  assignedPersonId: uuid('assigned_person_id').references(() => persons.id),
  // PENDING | IN_PROGRESS | COMPLETED | WAIVED | OVERDUE
  status:           varchar('status', { length: 30 }).notNull().default('PENDING'),
  completedBy:      uuid('completed_by').references(() => persons.id),
  completedDate:    date('completed_date'),
  notes:            text('notes'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.9 — BLACKOUT PERIODS
// Periods when leave requests are blocked (e.g., year-end close, Expo events).
// ══════════════════════════════════════════════════════════════════════════════

export const blackoutPeriods = pgTable('blackout_periods', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:    uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  departmentId:     uuid('department_id').references(() => departments.id),
  nameEn:           varchar('name_en', { length: 200 }).notNull(),
  nameAr:           varchar('name_ar', { length: 200 }),
  startDate:        date('start_date').notNull(),
  endDate:          date('end_date').notNull(),
  // NULL = all leave types; or specific type codes
  absenceTypeCodes: text('absence_type_codes').array(),
  // % of team that must be present (100 = full blackout)
  minCoveragePct:   integer('min_coverage_pct').notNull().default(100),
  reason:           text('reason'),
  isActive:         boolean('is_active').notNull().default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.11 — WPS SIF RECORDS
// Individual employee records within a MoHRE WPS SIF file.
// ══════════════════════════════════════════════════════════════════════════════

export const wpsSifRecords = pgTable('wps_sif_records', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollRunId:         uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  personId:             uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:        uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  employerLabourCode:   varchar('employer_labour_code', { length: 50 }).notNull(),
  employeeLabourCard:   varchar('employee_labour_card', { length: 50 }),
  routingCode:          varchar('routing_code', { length: 20 }).notNull(),
  iban:                 varchar('iban', { length: 23 }).notNull(),
  netPayAed:            numeric('net_pay_aed', { precision: 12, scale: 2 }).notNull(),
  currency:             char('currency', { length: 3 }).notNull().default('AED'),
  paymentMonth:         integer('payment_month').notNull(),
  paymentYear:          integer('payment_year').notNull(),
  sifLineNumber:        integer('sif_line_number').notNull(),
  // INCLUDED | EXCLUDED | ON_HOLD | FAILED | PAID
  sifStatus:            varchar('sif_status', { length: 30 }).notNull().default('INCLUDED'),
  exclusionReason:      text('exclusion_reason'),
  bankConfirmationRef:  varchar('bank_confirmation_ref', { length: 100 }),
  bankConfirmationDate: date('bank_confirmation_date'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.12 — GL JOURNAL LINES
// Oracle ERP GL journal entries generated per payroll run.
// ══════════════════════════════════════════════════════════════════════════════

export const glJournalLines = pgTable('gl_journal_lines', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  payrollRunId:      uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  journalHeaderRef:  varchar('journal_header_ref', { length: 100 }),
  lineNumber:        integer('line_number').notNull(),
  accountCode:       varchar('account_code', { length: 50 }).notNull(),
  costCentreCode:    varchar('cost_centre_code', { length: 50 }),
  departmentId:      uuid('department_id').references(() => departments.id),
  elementCode:       varchar('element_code', { length: 50 }),
  debitAmount:       numeric('debit_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  creditAmount:      numeric('credit_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  descriptionEn:     varchar('description_en', { length: 300 }),
  descriptionAr:     varchar('description_ar', { length: 300 }),
  currency:          char('currency', { length: 3 }).notNull().default('AED'),
  postingDate:       date('posting_date').notNull(),
  oracleBatchId:     varchar('oracle_batch_id', { length: 100 }),
  oracleJournalId:   varchar('oracle_journal_id', { length: 100 }),
  // PENDING | POSTED | ERROR | REVERSED
  postingStatus:     varchar('posting_status', { length: 20 }).notNull().default('PENDING'),
  errorMessage:      text('error_message'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.13 — USER ACCOUNTS (SSO identity linking)
// Oracle IDCS + Microsoft AD identity → AVANIIS user.
// ══════════════════════════════════════════════════════════════════════════════

export const userAccounts = pgTable('user_accounts', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  // Oracle IDCS identity
  oracleIdcsUserId:    varchar('oracle_idcs_user_id', { length: 200 }).unique(),
  oracleEmployeeNumber: varchar('oracle_employee_number', { length: 50 }),
  // Microsoft AD identity
  msAdObjectId:        varchar('ms_ad_object_id', { length: 200 }).unique(),
  msUpn:               varchar('ms_upn', { length: 200 }),
  // Primary identity
  primaryEmail:        varchar('primary_email', { length: 200 }).notNull().unique(),
  // Bcrypt hash for LOCAL password auth. null = SSO-only account.
  passwordHash:        varchar('password_hash', { length: 72 }),
  // ORACLE_IDCS | MICROSOFT_AD | LOCAL
  primarySsoProvider:  varchar('primary_sso_provider', { length: 20 }).notNull().default('ORACLE_IDCS'),
  // AVANIIS access control
  avaniisRole:         varchar('avaniis_role', { length: 50 }).notNull(),
  allowedEntityIds:    uuid('allowed_entity_ids').array().notNull().default([]),
  primaryEntityId:     uuid('primary_entity_id').notNull().references(() => legalEntities.id),
  // MFA
  mfaEnrolled:         boolean('mfa_enrolled').notNull().default(false),
  // TOTP | SMS | EMAIL | IDCS_MFA | MS_AUTHENTICATOR
  mfaMethod:           varchar('mfa_method', { length: 30 }),
  mfaLastVerified:     timestamp('mfa_last_verified', { withTimezone: true }),
  // Login tracking
  lastLoginAt:         timestamp('last_login_at', { withTimezone: true }),
  lastLoginProvider:   varchar('last_login_provider', { length: 20 }),
  lastLoginIp:         inet('last_login_ip'),
  loginCount:          integer('login_count').notNull().default(0),
  failedLoginCount:    integer('failed_login_count').notNull().default(0),
  lockedUntil:         timestamp('locked_until', { withTimezone: true }),
  activeRefreshTokens: integer('active_refresh_tokens').notNull().default(0),
  // Status
  isActive:            boolean('is_active').notNull().default(true),
  deactivatedAt:       timestamp('deactivated_at', { withTimezone: true }),
  deactivatedReason:   varchar('deactivated_reason', { length: 200 }),
  // UI preferences — language, theme, density, date format
  preferences:         jsonb('preferences').$type<Record<string, string>>().notNull().default({}),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.14 — REFRESH TOKENS
// Issued after SSO; rotated on every use (token rotation pattern).
// ══════════════════════════════════════════════════════════════════════════════

export const refreshTokens = pgTable('refresh_tokens', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  userAccountId: uuid('user_account_id').notNull().references(() => userAccounts.id),
  // SHA-256 of actual token — raw token never stored
  tokenHash:     varchar('token_hash', { length: 64 }).notNull().unique(),
  issuedAt:      timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt:     timestamp('expires_at', { withTimezone: true }).notNull(),
  lastUsedAt:    timestamp('last_used_at', { withTimezone: true }),
  deviceInfo:    varchar('device_info', { length: 300 }),
  ipAddress:     inet('ip_address'),
  // ORACLE_IDCS | MICROSOFT_AD | LOCAL
  ssoProvider:   varchar('sso_provider', { length: 20 }),
  // Oracle IDCS / Microsoft AD session reference for Single Logout
  ssoSessionId:  varchar('sso_session_id', { length: 500 }),
  isRevoked:     boolean('is_revoked').notNull().default(false),
  revokedAt:     timestamp('revoked_at', { withTimezone: true }),
  // LOGOUT | SLO | EXPIRED | SUSPICIOUS | ADMIN | ROTATION
  revokedReason: varchar('revoked_reason', { length: 50 }),
  // No audit fields — this IS the auth audit trail
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §7.15 — SSO PROVIDER CONFIG
// Per-entity Oracle IDCS and Microsoft AD configuration.
// ══════════════════════════════════════════════════════════════════════════════

export const ssoProviderConfig = pgTable('sso_provider_config', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:         uuid('legal_entity_id').references(() => legalEntities.id),
  // ORACLE_IDCS | MICROSOFT_AD
  providerType:          varchar('provider_type', { length: 20 }).notNull(),
  isPrimary:             boolean('is_primary').notNull().default(false),
  isActive:              boolean('is_active').notNull().default(true),
  // Oracle IDCS specific
  oracleIdcsTenantUrl:   varchar('oracle_idcs_tenant_url', { length: 500 }),
  oracleSpEntityId:      varchar('oracle_sp_entity_id', { length: 500 }),
  oracleIdpMetadataUrl:  varchar('oracle_idp_metadata_url', { length: 500 }),
  oracleIdpCertExpiry:   date('oracle_idp_cert_expiry'),
  // Microsoft AD specific
  msTenantId:            varchar('ms_tenant_id', { length: 100 }),
  msClientId:            varchar('ms_client_id', { length: 100 }),
  msAuthorityUrl:        varchar('ms_authority_url', { length: 500 }),
  // Common
  metadataLastRefreshed: timestamp('metadata_last_refreshed', { withTimezone: true }),
  emailDomainHints:      text('email_domain_hints').array(),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §9.2 — MEDICAL INSURANCE ENROLMENTS
// Source of truth for who is enrolled in which plan.
// One row per employee/dependent per plan per policy year.
// ══════════════════════════════════════════════════════════════════════════════

export const medicalInsuranceEnrolments = pgTable('medical_insurance_enrolments', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:        uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:   uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  planId:          uuid('plan_id').notNull().references(() => medicalInsurancePlans.id),
  // EMPLOYEE | DEPENDENT
  enrolmentType:   varchar('enrolment_type', { length: 20 }).notNull().default('EMPLOYEE'),
  dependentId:     uuid('dependent_id').references(() => personDependents.id),
  // Card details
  insuranceCardNumber: varchar('insurance_card_number', { length: 100 }),
  insuranceMemberId:   varchar('insurance_member_id', { length: 100 }).notNull(),
  // Coverage period
  effectiveDate:   date('effective_date').notNull(),
  expiryDate:      date('expiry_date').notNull(),
  // Premium
  annualPremiumAed:   numeric('annual_premium_aed', { precision: 10, scale: 2 }).notNull(),
  employerPremiumAed: numeric('employer_premium_aed', { precision: 10, scale: 2 }).notNull(),
  employeePremiumAed: numeric('employee_premium_aed', { precision: 10, scale: 2 }).notNull().default('0'),
  // PENDING | ACTIVE | RENEWAL_DUE | EXPIRED | CANCELLED | SUSPENDED
  enrolmentStatus: varchar('enrolment_status', { length: 30 }).notNull().default('PENDING'),
  cardDocumentId:  uuid('card_document_id').references(() => personDocuments.id),
  submittedToInsurerDate: date('submitted_to_insurer_date'),
  insurerReference:       varchar('insurer_reference', { length: 100 }),
  cancellationDate:       date('cancellation_date'),
  cancellationReason:     varchar('cancellation_reason', { length: 200 }),
  // BR-INS-006: expiry may be extended beyond notice period end (exception)
  insuranceExpiryExtensionDate:   date('insurance_expiry_extension_date'),
  insuranceExpiryExtensionReason: varchar('insurance_expiry_extension_reason', { length: 200 }),
  notes:           text('notes'),
  // History-versioning (Correction Mode infrastructure)
  actionMode:      varchar('action_mode', { length: 15 }).notNull().default('UPDATE'),
  correctsRowId:   uuid('corrects_row_id').references((): AnyPgColumn => medicalInsuranceEnrolments.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §9.3 — MEDICAL INSURANCE POLICY SETTINGS
// Entity-level insurance rules (max dependents, who pays, enrolment grace, etc.)
// ══════════════════════════════════════════════════════════════════════════════

export const medicalInsurancePolicySettings = pgTable('medical_insurance_policy_settings', {
  id:                        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId:             uuid('legal_entity_id').notNull().unique().references(() => legalEntities.id),
  maxDependentsPerEmployee:  integer('max_dependents_per_employee').notNull().default(9),
  maxSpouses:                integer('max_spouses').notNull().default(1),
  maxChildren:               integer('max_children').notNull().default(9),
  parentsCovered:            boolean('parents_covered').notNull().default(false),
  parentsInLawCovered:       boolean('parents_in_law_covered').notNull().default(false),
  // Age limits
  childMaxAge:               integer('child_max_age').notNull().default(18),
  childStudentExtensionAge:  integer('child_student_extension_age').notNull().default(25),
  // Who pays for dependents?
  employerPaysSpouse:        boolean('employer_pays_spouse').notNull().default(true),
  employerPaysChildren:      boolean('employer_pays_children').notNull().default(true),
  employerPaysParents:       boolean('employer_pays_parents').notNull().default(false),
  employeeDependentCostPct:  numeric('employee_dependent_cost_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  // Enrolment rules
  autoEnrolOnHire:           boolean('auto_enrol_on_hire').notNull().default(true),
  enrolmentGraceDays:        integer('enrolment_grace_days').notNull().default(30),
  dependentAddGraceDays:     integer('dependent_add_grace_days').notNull().default(30),
  // Alert schedule
  renewalAlertDays:          integer('renewal_alert_days').array().notNull().default([90, 60, 30, 14]),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.2 — DEWS CONTRIBUTIONS
// DIFC employees: Workplace Savings Scheme (replaces EOSB for DIFC entities).
// Applies when legal_entity.entity_type = 'DIFC'. BR-DIFC-003.
// ══════════════════════════════════════════════════════════════════════════════

export const dewsContributions = pgTable('dews_contributions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollRunId:       uuid('payroll_run_id').references(() => payrollRuns.id),
  periodYear:         integer('period_year').notNull(),
  periodMonth:        integer('period_month').notNull(),
  // UNDER_5_YEARS | 5_YEARS_PLUS
  serviceBand:        varchar('service_band', { length: 20 }).notNull(),
  // BR-DIFC-003: under 5 yrs = 5.83%, 5+ yrs = 8.33%
  contributionRate:   numeric('contribution_rate', { precision: 6, scale: 4 }).notNull(),
  basicSalary:        numeric('basic_salary', { precision: 14, scale: 2 }).notNull(),
  // basic_salary × contribution_rate
  contributionAmount: numeric('contribution_amount', { precision: 14, scale: 2 }).notNull(),
  fundManager:        varchar('fund_manager', { length: 200 }).notNull().default('Zurich International Life'),
  fundReference:      varchar('fund_reference', { length: 100 }),
  submissionDate:     date('submission_date'),
  // PENDING | SUBMITTED | CONFIRMED | FAILED
  submissionStatus:   varchar('submission_status', { length: 20 }).notNull().default('PENDING'),
  submissionRef:      varchar('submission_ref', { length: 100 }),
  // Must submit within 15 days of month start (BR-DIFC-003)
  dueDate:            date('due_date').notNull(),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.3 — GPSSA CONTRIBUTIONS
// UAE National private-sector pension. Applies when nationality_category = 'UAE_NATIONAL'.
// Employer 15% + Employee 5% of basic salary. BR-GPSSA-001.
// ══════════════════════════════════════════════════════════════════════════════

export const gpssaContributions = pgTable('gpssa_contributions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollRunId:       uuid('payroll_run_id').references(() => payrollRuns.id),
  periodYear:         integer('period_year').notNull(),
  periodMonth:        integer('period_month').notNull(),
  basicSalary:        numeric('basic_salary', { precision: 14, scale: 2 }).notNull(),
  // BR-GPSSA-001: Employer = 15%, Employee = 5%
  employerRate:       numeric('employer_rate', { precision: 6, scale: 4 }).notNull().default('0.1500'),
  employeeRate:       numeric('employee_rate', { precision: 6, scale: 4 }).notNull().default('0.0500'),
  employerAmount:     numeric('employer_amount', { precision: 14, scale: 2 }).notNull(),
  employeeAmount:     numeric('employee_amount', { precision: 14, scale: 2 }).notNull(),
  // totalContribution = employerAmount + employeeAmount (computed by application)
  totalContribution:  numeric('total_contribution', { precision: 14, scale: 2 }).notNull(),
  gpssaMemberId:      varchar('gpssa_member_id', { length: 50 }),
  // 15th of each month (BR-GPSSA-002)
  dueDate:            date('due_date').notNull(),
  submissionDate:     date('submission_date'),
  // PENDING | SUBMITTED | CONFIRMED | FAILED
  submissionStatus:   varchar('submission_status', { length: 20 }).notNull().default('PENDING'),
  submissionRef:      varchar('submission_ref', { length: 100 }),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.4 — TIMESHEET PERIODS
// Defines the submission windows for timesheets.
// ══════════════════════════════════════════════════════════════════════════════

export const timesheetPeriods = pgTable('timesheet_periods', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // WEEKLY | BIWEEKLY | MONTHLY
  periodType:    varchar('period_type', { length: 20 }).notNull(),
  periodStart:   date('period_start').notNull(),
  periodEnd:     date('period_end').notNull(),
  // OPEN | SUBMISSION_CLOSED | LOCKED | PROCESSED
  status:        varchar('status', { length: 20 }).notNull().default('OPEN'),
  payrollRunId:  uuid('payroll_run_id').references(() => payrollRuns.id),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.5 — TIMESHEET ENTRIES
// Daily hours per employee per timesheet period.
// ══════════════════════════════════════════════════════════════════════════════

export const timesheetEntries = pgTable('timesheet_entries', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  periodId:       uuid('period_id').notNull().references(() => timesheetPeriods.id),
  legalEntityId:  uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  // Daily hours array: index 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  dailyHours:     numeric('daily_hours', { precision: 4, scale: 2 }).array().notNull().default(['0', '0', '0', '0', '0', '0', '0']),
  totalHours:     numeric('total_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  regularHours:   numeric('regular_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  overtimeHours:  numeric('overtime_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  // DRAFT | SUBMITTED | APPROVED | REJECTED | PROCESSED
  status:         varchar('status', { length: 20 }).notNull().default('DRAFT'),
  submittedAt:    timestamp('submitted_at', { withTimezone: true }),
  reviewerId:     uuid('reviewer_id').references(() => persons.id),
  reviewerName:   varchar('reviewer_name', { length: 200 }),
  reviewNote:     text('review_note'),
  reviewedAt:     timestamp('reviewed_at', { withTimezone: true }),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ERD §10.7 — VSS CONTRIBUTIONS
// Voluntary Savings Scheme (Cabinet Resolution 96/2023).
// Applies to mainland entities that opt in via entity.eosb_scheme = 'VSS'.
// ══════════════════════════════════════════════════════════════════════════════

export const vssContributions = pgTable('vss_contributions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:           uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:      uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  payrollRunId:       uuid('payroll_run_id').references(() => payrollRuns.id),
  periodYear:         integer('period_year').notNull(),
  periodMonth:        integer('period_month').notNull(),
  basicSalary:        numeric('basic_salary', { precision: 14, scale: 2 }).notNull(),
  // Employer rate set by entity (minimum = EOSB-equivalent)
  employerRate:       numeric('employer_rate', { precision: 6, scale: 4 }).notNull(),
  // Optional employee top-up
  employeeRate:       numeric('employee_rate', { precision: 6, scale: 4 }).notNull().default('0'),
  employerAmount:     numeric('employer_amount', { precision: 14, scale: 2 }).notNull(),
  employeeAmount:     numeric('employee_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  totalContribution:  numeric('total_contribution', { precision: 14, scale: 2 }).notNull(),
  fundManager:        varchar('fund_manager', { length: 200 }),
  fundMemberId:       varchar('fund_member_id', { length: 100 }),
  dueDate:            date('due_date').notNull(),
  // PENDING | SUBMITTED | CONFIRMED | FAILED
  submissionStatus:   varchar('submission_status', { length: 20 }).notNull().default('PENDING'),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// EVENTS OUTBOX
// Transactional outbox pattern — Server Actions insert here inside their
// db.transaction() so domain events ship atomically with the state change.
// A background worker (node-cron — TD-09) polls for processed_at IS NULL,
// dispatches, and stamps processed_at. retry_count + error_text record failures.
// ══════════════════════════════════════════════════════════════════════════════

export const events = pgTable('events', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().default(TENANT_ID),
  // Domain event name — e.g., workflow.initiated | leave.approved | payroll.locked
  eventType:    varchar('event_type', { length: 100 }).notNull(),
  payload:      jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt:  timestamp('processed_at', { withTimezone: true }),
  retryCount:   integer('retry_count').notNull().default(0),
  errorText:    text('error_text'),
})

// ══════════════════════════════════════════════════════════════════════════════
// INFERRED TYPESCRIPT TYPES
// ══════════════════════════════════════════════════════════════════════════════

export type WorkflowInstance            = typeof workflowInstances.$inferSelect
export type ApprovalDelegation          = typeof approvalDelegations.$inferSelect
export type NotificationLogEntry        = typeof notificationLog.$inferSelect
export type OnboardingChecklist         = typeof onboardingChecklists.$inferSelect
export type OnboardingChecklistItem     = typeof onboardingChecklistItems.$inferSelect
export type BlackoutPeriod              = typeof blackoutPeriods.$inferSelect
export type WpsSifRecord                = typeof wpsSifRecords.$inferSelect
export type GlJournalLine               = typeof glJournalLines.$inferSelect
export type UserAccount                 = typeof userAccounts.$inferSelect
export type RefreshToken                = typeof refreshTokens.$inferSelect
export type SsoProviderConfig           = typeof ssoProviderConfig.$inferSelect
export type MedicalInsuranceEnrolment   = typeof medicalInsuranceEnrolments.$inferSelect
export type MedicalInsurancePolicySetting = typeof medicalInsurancePolicySettings.$inferSelect
export type DewsContribution            = typeof dewsContributions.$inferSelect
export type GpssaContribution           = typeof gpssaContributions.$inferSelect
export type TimesheetPeriod             = typeof timesheetPeriods.$inferSelect
export type TimesheetEntry              = typeof timesheetEntries.$inferSelect
export type VssContribution             = typeof vssContributions.$inferSelect

export type NewWorkflowInstance         = typeof workflowInstances.$inferInsert
export type NewUserAccount              = typeof userAccounts.$inferInsert
export type NewNotificationLogEntry     = typeof notificationLog.$inferInsert
export type NewWpsSifRecord             = typeof wpsSifRecords.$inferInsert
export type NewGlJournalLine            = typeof glJournalLines.$inferInsert
export type NewDewsContribution         = typeof dewsContributions.$inferInsert
export type NewGpssaContribution        = typeof gpssaContributions.$inferInsert
export type NewTimesheetEntry           = typeof timesheetEntries.$inferInsert
export type NewVssContribution          = typeof vssContributions.$inferInsert
export type EventOutbox                 = typeof events.$inferSelect
export type NewEventOutbox              = typeof events.$inferInsert


================================================================================
FILE [P4-01]: drizzle/schema/workflow-engine.ts
LINES: 637
================================================================================
/**
 * AVANIIS HR — Workflow Engine v2 Schema
 * Hybrid hierarchy (LINE_MANAGER / POSITION / CUSTOM_GROUP) + AND/OR condition trees
 * Immutable snapshots, UAE working-hours SLA, INSERT-only audit log.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  jsonb,
  inet,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { legalEntities, persons } from './foundation'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers ────────────────────────────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ─── Enums ──────────────────────────────────────────────────────────────────

export const hierarchyTypeEnum = pgEnum('hierarchy_type_enum', [
  'LINE_MANAGER',
  'POSITION',
  'CUSTOM_GROUP',
])

export const stepEffectEnum = pgEnum('step_effect_enum', [
  'NORMAL',
  'ADD_IF_MATCHES',
  'REPLACE',
  'SKIP_PREVIOUS',
  'INJECT_BEFORE',
  'INJECT_AFTER',
  'PARALLEL_ADD',
])

export const slaBreachActionEnum = pgEnum('sla_breach_action_enum', [
  'ESCALATE',
  'AUTO_APPROVE',
  'AUTO_REJECT',
  'SEND_REMINDER',
  'BLOCK_FREEZE',
])

export const approverNotFoundActionEnum = pgEnum('approver_not_found_action_enum', [
  'ESCALATE_UP',
  'USE_FALLBACK',
  'ASSIGN_HR_ADMIN',
  'BLOCK_WITH_ERROR',
])

export const groupMemberTypeEnum = pgEnum('group_member_type_enum', [
  'STATIC',
  'DYNAMIC',
  'HYBRID',
])

export const groupVotingMethodEnum = pgEnum('group_voting_method_enum', [
  'ANY_ONE',
  'MAJORITY',
  'ALL',
  'WEIGHTED',
])

export const instanceStatusEnum = pgEnum('instance_status_enum', [
  'PENDING',
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ESCALATED',
  'ON_HOLD',
  'RECALLED',
])

export const stepStatusEnum = pgEnum('step_status_enum', [
  'WAITING',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DELEGATED',
  'ESCALATED',
  'SKIPPED',
  'AUTO_APPROVED',
  'RECALLED',
])

export const auditActionEnum = pgEnum('audit_action_enum', [
  'SUBMITTED',
  'STEP_APPROVED',
  'STEP_REJECTED',
  'STEP_DELEGATED',
  'STEP_ESCALATED',
  'STEP_SKIPPED',
  'INSTANCE_APPROVED',
  'INSTANCE_REJECTED',
  'INSTANCE_CANCELLED',
  'INSTANCE_RECALLED',
  'SLA_REMINDER_SENT',
  'SLA_ESCALATED',
  'TOKEN_ISSUED',
  'TOKEN_USED',
  'TOKEN_EXPIRED',
  'RULE_EVALUATED',
  'HIERARCHY_RESOLVED',
  'SNAPSHOT_CREATED',
])

export const notificationStatusEnum = pgEnum('notification_status_enum', [
  'QUEUED',
  'SENT',
  'FAILED',
  'SKIPPED',
])

// ─── Condition tree TypeScript types ────────────────────────────────────────

export type ConditionOperator =
  | 'EQUALS' | 'NOT_EQUALS'
  | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL'
  | 'IN' | 'NOT_IN'
  | 'IS_TRUE' | 'IS_FALSE'
  | 'IS_NULL' | 'IS_NOT_NULL'
  | 'CONTAINS' | 'STARTS_WITH'

export type ConditionDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ARRAY'

export interface SimpleCondition {
  id: string
  field: string           // e.g. 'leave.days', 'employee.grade_level', 'employee.nationality_category'
  operator: ConditionOperator
  value?: unknown
  dataType: ConditionDataType
  labelEn?: string
}

export interface GroupCondition {
  id: string
  operator: 'AND' | 'OR'
  conditions: ConditionNode[]
}

export type ConditionNode = SimpleCondition | GroupCondition

// ─── Snapshot types ──────────────────────────────────────────────────────────

export interface ResolvedApprover {
  personId: string
  personName: string
  stepOrder: number
  stepCode: string
  hierarchyType: string
  hierarchyLevel?: number
  resolvedAt: string   // ISO timestamp
}

export interface HierarchySnapshot {
  encryptedAt: string
  resolvedSteps: ResolvedApprover[]
  resolvedBy: string   // system version
}

export interface ContextSnapshot {
  encryptedAt: string
  resourceType: string
  resourceId: string
  fields: Record<string, unknown>
}

// ══════════════════════════════════════════════════════════════════════════════
// 1 — WORKFLOW_RULES
// ══════════════════════════════════════════════════════════════════════════════

export const workflowRules = pgTable('workflow_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  ruleCode:    varchar('rule_code', { length: 80 }).notNull(),
  ruleNameEn:  varchar('rule_name_en', { length: 200 }).notNull(),
  ruleNameAr:  varchar('rule_name_ar', { length: 200 }),
  description: text('description'),

  conditionTree: jsonb('condition_tree').$type<ConditionNode>().notNull(),

  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('workflow_rules_code_tenant_uniq').on(t.tenantId, t.ruleCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 2 — WORKFLOW_DEFINITIONS_V2
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDefinitionsV2 = pgTable('workflow_definitions_v2', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  workflowCode:   varchar('workflow_code', { length: 50 }).notNull(),
  workflowNameEn: varchar('workflow_name_en', { length: 200 }).notNull(),
  workflowNameAr: varchar('workflow_name_ar', { length: 200 }),
  description:    text('description'),

  triggerEvent: varchar('trigger_event', { length: 50 }).notNull(),

  selectorRuleId: uuid('selector_rule_id').references(() => workflowRules.id),

  defaultHierarchyType:    hierarchyTypeEnum('default_hierarchy_type').notNull().default('LINE_MANAGER'),
  onApproverNotFound:      approverNotFoundActionEnum('on_approver_not_found').notNull().default('ESCALATE_UP'),
  fallbackPersonId:        uuid('fallback_person_id').references(() => persons.id),

  defaultSlaHours:       integer('default_sla_hours').notNull().default(48),
  defaultEscalationHours: integer('default_escalation_hours').notNull().default(72),

  requiresMedicalCert:    boolean('requires_medical_cert').notNull().default(false),
  requiresManagerComment: boolean('requires_manager_comment').notNull().default(false),
  encryptSnapshot:        boolean('encrypt_snapshot').notNull().default(true),

  isActive: boolean('is_active').notNull().default(true),
  version:  integer('version').notNull().default(1),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('workflow_defs_v2_code_tenant_uniq').on(t.tenantId, t.workflowCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 3 — APPROVAL_GROUPS
// ══════════════════════════════════════════════════════════════════════════════

export const approvalGroups = pgTable('approval_groups', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  groupCode:   varchar('group_code', { length: 80 }).notNull(),
  groupNameEn: varchar('group_name_en', { length: 200 }).notNull(),
  groupNameAr: varchar('group_name_ar', { length: 200 }),

  memberType:       groupMemberTypeEnum('member_type').notNull().default('STATIC'),
  dynamicCondition: jsonb('dynamic_condition').$type<ConditionNode>(),
  votingMethod:     groupVotingMethodEnum('voting_method').notNull().default('ANY_ONE'),
  minApprovals:     integer('min_approvals').notNull().default(1),

  isActive: boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('approval_groups_code_tenant_uniq').on(t.tenantId, t.groupCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 4 — APPROVAL_GROUP_MEMBERS
// ══════════════════════════════════════════════════════════════════════════════

export const approvalGroupMembers = pgTable('approval_group_members', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  groupId:   uuid('group_id').notNull().references(() => approvalGroups.id, { onDelete: 'cascade' }),
  personId:  uuid('person_id').notNull().references(() => persons.id),

  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:   date('effective_to'),
  isPrimary:     boolean('is_primary').notNull().default(false),
  voteWeight:    integer('vote_weight').notNull().default(1),

  ...audit(),
}, (t) => ({
  groupIdx:  index('approval_group_members_group_idx').on(t.groupId),
  personIdx: index('approval_group_members_person_idx').on(t.personId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 5 — WORKFLOW_STEPS_V2
// ══════════════════════════════════════════════════════════════════════════════

export const workflowStepsV2 = pgTable('workflow_steps_v2', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull()
    .references(() => workflowDefinitionsV2.id, { onDelete: 'cascade' }),

  stepOrder:   integer('step_order').notNull(),
  stepCode:    varchar('step_code', { length: 80 }),
  stepNameEn:  varchar('step_name_en', { length: 200 }).notNull(),
  stepNameAr:  varchar('step_name_ar', { length: 200 }),

  hierarchyType:     hierarchyTypeEnum('hierarchy_type').notNull(),
  hierarchyLevel:    integer('hierarchy_level'),
  hierarchyGroupId:  uuid('hierarchy_group_id').references(() => approvalGroups.id),
  hierarchyRole:     varchar('hierarchy_role', { length: 100 }),
  hierarchyPersonId: uuid('hierarchy_person_id').references(() => persons.id),

  activationConditionId: uuid('activation_condition_id').references(() => workflowRules.id),

  stepEffect:           stepEffectEnum('step_effect').notNull().default('NORMAL'),
  effectTargetStepCode: varchar('effect_target_step_code', { length: 80 }),

  slaHours:            integer('sla_hours').notNull().default(48),
  onSlaBreach:         slaBreachActionEnum('on_sla_breach').notNull().default('ESCALATE'),
  escalationPersonId:  uuid('escalation_person_id').references(() => persons.id),
  escalationGroupId:   uuid('escalation_group_id').references(() => approvalGroups.id),

  onApproverNotFound: approverNotFoundActionEnum('on_approver_not_found'),

  isFyiOnly:            boolean('is_fyi_only').notNull().default(false),
  canDelegate:          boolean('can_delegate').notNull().default(true),
  isOptional:           boolean('is_optional').notNull().default(false),
  skipIfAlreadyApproved: boolean('skip_if_already_approved').notNull().default(true),

  isActive: boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  defOrderIdx: index('workflow_steps_v2_def_order_idx').on(t.workflowDefinitionId, t.stepOrder),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 6 — WORKFLOW_SLA_CALENDARS
// ══════════════════════════════════════════════════════════════════════════════

export const workflowSlaCalendars = pgTable('workflow_sla_calendars', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),

  calendarCode:   varchar('calendar_code', { length: 50 }).notNull(),
  calendarNameEn: varchar('calendar_name_en', { length: 200 }).notNull(),

  // ISO weekday numbers: 0=Sun, 1=Mon, ..., 6=Sat. UAE: [0,1,2,3,4]
  workingDays: integer('working_days').array().notNull().default([0, 1, 2, 3, 4]),

  timezone:     varchar('timezone', { length: 50 }).notNull().default('Asia/Dubai'),
  dayStartTime: varchar('day_start_time', { length: 5 }).notNull().default('09:00'),
  dayEndTime:   varchar('day_end_time', { length: 5 }).notNull().default('18:00'),

  ramadanStartTime: varchar('ramadan_start_time', { length: 5 }),
  ramadanEndTime:   varchar('ramadan_end_time', { length: 5 }),
  ramadanStartDate: date('ramadan_start_date'),
  ramadanEndDate:   date('ramadan_end_date'),

  isActive:  boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),

  ...audit(),
}, (t) => ({
  codeUniq: uniqueIndex('workflow_sla_calendars_code_tenant_uniq').on(t.tenantId, t.calendarCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 7 — WORKFLOW_INSTANCES_V2
// ══════════════════════════════════════════════════════════════════════════════

export const workflowInstancesV2 = pgTable('workflow_instances_v2', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull()
    .references(() => workflowDefinitionsV2.id),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),

  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId:   uuid('resource_id').notNull(),

  initiatedByPersonId: uuid('initiated_by_person_id').notNull().references(() => persons.id),

  status:           instanceStatusEnum('status').notNull().default('PENDING'),
  currentStepId:    uuid('current_step_id').references(() => workflowStepsV2.id),
  currentStepOrder: integer('current_step_order').notNull().default(1),

  hierarchySnapshot: jsonb('hierarchy_snapshot').$type<HierarchySnapshot>().notNull(),
  contextSnapshot:   jsonb('context_snapshot').$type<ContextSnapshot>().notNull(),
  resolvedSteps:     jsonb('resolved_steps').$type<ResolvedApprover[]>().notNull(),

  slaCalendarId:  uuid('sla_calendar_id').references(() => workflowSlaCalendars.id),
  slaDeadline:    timestamp('sla_deadline', { withTimezone: true }),
  escalatedAt:    timestamp('escalated_at', { withTimezone: true }),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),

  startedAt:         timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt:       timestamp('completed_at', { withTimezone: true }),
  finalDecisionBy:   uuid('final_decision_by').references(() => persons.id),
  finalDecisionNote: text('final_decision_note'),
  rejectionReason:   text('rejection_reason'),

  recalledAt:    timestamp('recalled_at', { withTimezone: true }),
  recalledBy:    uuid('recalled_by').references(() => persons.id),
  recallReason:  text('recall_reason'),

  ...audit(),
}, (t) => ({
  resourceIdx:  index('workflow_instances_v2_resource_idx').on(t.resourceType, t.resourceId),
  initiatorIdx: index('workflow_instances_v2_initiator_idx').on(t.initiatedByPersonId),
  statusIdx:    index('workflow_instances_v2_status_idx').on(t.status),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 8 — WORKFLOW_STEP_INSTANCES
// ══════════════════════════════════════════════════════════════════════════════

export const workflowStepInstances = pgTable('workflow_step_instances', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId: uuid('instance_id').notNull()
    .references(() => workflowInstancesV2.id, { onDelete: 'cascade' }),
  stepId:     uuid('step_id').notNull().references(() => workflowStepsV2.id),

  stepOrder: integer('step_order').notNull(),
  status:    stepStatusEnum('status').notNull().default('WAITING'),

  assignedToPersonId: uuid('assigned_to_person_id').references(() => persons.id),
  assignedToGroupId:  uuid('assigned_to_group_id').references(() => approvalGroups.id),

  delegatedFromPersonId: uuid('delegated_from_person_id').references(() => persons.id),
  delegatedToPersonId:   uuid('delegated_to_person_id').references(() => persons.id),
  delegatedAt:           timestamp('delegated_at', { withTimezone: true }),

  decidedByPersonId: uuid('decided_by_person_id').references(() => persons.id),
  // APPROVE | REJECT | DELEGATE
  decision:          varchar('decision', { length: 20 }),
  decisionNote:      text('decision_note'),
  decidedAt:         timestamp('decided_at', { withTimezone: true }),

  slaDeadline: timestamp('sla_deadline', { withTimezone: true }),
  remindedAt:  timestamp('reminded_at', { withTimezone: true }),

  emailTokenJti: varchar('email_token_jti', { length: 64 }),

  ...audit(),
}, (t) => ({
  instanceIdx: index('workflow_step_instances_instance_idx').on(t.instanceId),
  assigneeIdx: index('workflow_step_instances_assignee_idx').on(t.assignedToPersonId, t.status),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 9 — WORKFLOW_AUDIT_LOG (INSERT-ONLY)
// ══════════════════════════════════════════════════════════════════════════════

export const workflowAuditLog = pgTable('workflow_audit_log', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull().references(() => workflowInstancesV2.id),
  stepInstanceId: uuid('step_instance_id').references(() => workflowStepInstances.id),

  action:        auditActionEnum('action').notNull(),
  actorPersonId: uuid('actor_person_id').references(() => persons.id),
  actorName:     varchar('actor_name', { length: 200 }),

  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  eventData: jsonb('event_data'),

  loggedAt: timestamp('logged_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  instanceIdx: index('workflow_audit_log_instance_idx').on(t.instanceId, t.loggedAt),
  actorIdx:    index('workflow_audit_log_actor_idx').on(t.actorPersonId, t.loggedAt),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 10 — WORKFLOW_EMAIL_TOKENS
// ══════════════════════════════════════════════════════════════════════════════

export const workflowEmailTokens = pgTable('workflow_email_tokens', {
  jti:        varchar('jti', { length: 64 }).primaryKey(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull().references(() => workflowInstancesV2.id),
  stepInstanceId: uuid('step_instance_id').notNull().references(() => workflowStepInstances.id),

  intendedAction:    varchar('intended_action', { length: 20 }).notNull(),
  issuedToPersonId:  uuid('issued_to_person_id').notNull().references(() => persons.id),
  expiresAt:         timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt:            timestamp('used_at', { withTimezone: true }),
  ipAddress:         inet('ip_address'),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  instanceIdx: index('workflow_email_tokens_instance_idx').on(t.instanceId),
  expiresIdx:  index('workflow_email_tokens_expires_idx').on(t.expiresAt),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 11 — WORKFLOW_DELEGATION_RULES
// ══════════════════════════════════════════════════════════════════════════════

export const workflowDelegationRules = pgTable('workflow_delegation_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  delegatorId:   uuid('delegator_id').notNull().references(() => persons.id),
  delegateId:    uuid('delegate_id').notNull().references(() => persons.id),
  legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),

  workflowCodes:   varchar('workflow_codes', { length: 50 }).array(),
  delegationFrom:  date('delegation_from').notNull(),
  delegationTo:    date('delegation_to').notNull(),
  status:          varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  delegationReason: text('delegation_reason'),

  ...audit(),
}, (t) => ({
  delegatorIdx: index('workflow_delegation_rules_delegator_idx').on(t.delegatorId, t.status),
}))

// ══════════════════════════════════════════════════════════════════════════════
// 12 — WORKFLOW_NOTIFICATION_QUEUE
// ══════════════════════════════════════════════════════════════════════════════

export const workflowNotificationQueue = pgTable('workflow_notification_queue', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  instanceId:     uuid('instance_id').notNull().references(() => workflowInstancesV2.id),
  stepInstanceId: uuid('step_instance_id').references(() => workflowStepInstances.id),

  channel:           varchar('channel', { length: 20 }).notNull().default('EMAIL'),
  recipientPersonId: uuid('recipient_person_id').notNull().references(() => persons.id),
  recipientEmail:    varchar('recipient_email', { length: 300 }),

  templateCode: varchar('template_code', { length: 100 }).notNull(),
  subject:      varchar('subject', { length: 500 }),
  bodyHtml:     text('body_html'),
  bodyText:     text('body_text'),
  actionUrl:    text('action_url'),

  status:        notificationStatusEnum('status').notNull().default('QUEUED'),
  sendAfter:     timestamp('send_after', { withTimezone: true }).defaultNow().notNull(),
  sentAt:        timestamp('sent_at', { withTimezone: true }),
  failedAt:      timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  retryCount:    integer('retry_count').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx:   index('workflow_notification_queue_status_idx').on(t.status, t.sendAfter),
  instanceIdx: index('workflow_notification_queue_instance_idx').on(t.instanceId),
}))

// ─── Relations ──────────────────────────────────────────────────────────────

export const workflowDefinitionsV2Relations = relations(workflowDefinitionsV2, ({ many, one }) => ({
  steps: many(workflowStepsV2),
  instances: many(workflowInstancesV2),
  selectorRule: one(workflowRules, {
    fields: [workflowDefinitionsV2.selectorRuleId],
    references: [workflowRules.id],
  }),
}))

export const workflowStepsV2Relations = relations(workflowStepsV2, ({ one }) => ({
  definition: one(workflowDefinitionsV2, {
    fields: [workflowStepsV2.workflowDefinitionId],
    references: [workflowDefinitionsV2.id],
  }),
  activationCondition: one(workflowRules, {
    fields: [workflowStepsV2.activationConditionId],
    references: [workflowRules.id],
  }),
  group: one(approvalGroups, {
    fields: [workflowStepsV2.hierarchyGroupId],
    references: [approvalGroups.id],
  }),
}))

export const workflowInstancesV2Relations = relations(workflowInstancesV2, ({ one, many }) => ({
  definition: one(workflowDefinitionsV2, {
    fields: [workflowInstancesV2.workflowDefinitionId],
    references: [workflowDefinitionsV2.id],
  }),
  stepInstances: many(workflowStepInstances),
  auditLog: many(workflowAuditLog),
}))

export const workflowStepInstancesRelations = relations(workflowStepInstances, ({ one }) => ({
  instance: one(workflowInstancesV2, {
    fields: [workflowStepInstances.instanceId],
    references: [workflowInstancesV2.id],
  }),
  step: one(workflowStepsV2, {
    fields: [workflowStepInstances.stepId],
    references: [workflowStepsV2.id],
  }),
}))

export const approvalGroupsRelations = relations(approvalGroups, ({ many }) => ({
  members: many(approvalGroupMembers),
}))

export const approvalGroupMembersRelations = relations(approvalGroupMembers, ({ one }) => ({
  group: one(approvalGroups, {
    fields: [approvalGroupMembers.groupId],
    references: [approvalGroups.id],
  }),
}))

// ─── Inferred TypeScript types ───────────────────────────────────────────────

export type WorkflowRule              = typeof workflowRules.$inferSelect
export type NewWorkflowRule           = typeof workflowRules.$inferInsert
export type WorkflowDefinitionV2      = typeof workflowDefinitionsV2.$inferSelect
export type NewWorkflowDefinitionV2   = typeof workflowDefinitionsV2.$inferInsert
export type ApprovalGroup             = typeof approvalGroups.$inferSelect
export type NewApprovalGroup          = typeof approvalGroups.$inferInsert
export type ApprovalGroupMember       = typeof approvalGroupMembers.$inferSelect
export type WorkflowStepV2            = typeof workflowStepsV2.$inferSelect
export type NewWorkflowStepV2         = typeof workflowStepsV2.$inferInsert
export type WorkflowSlaCalendar       = typeof workflowSlaCalendars.$inferSelect
export type WorkflowInstanceV2        = typeof workflowInstancesV2.$inferSelect
export type NewWorkflowInstanceV2     = typeof workflowInstancesV2.$inferInsert
export type WorkflowStepInstance      = typeof workflowStepInstances.$inferSelect
export type NewWorkflowStepInstance   = typeof workflowStepInstances.$inferInsert
export type WorkflowAuditLogEntry     = typeof workflowAuditLog.$inferSelect
export type WorkflowEmailToken        = typeof workflowEmailTokens.$inferSelect
export type WorkflowDelegationRule    = typeof workflowDelegationRules.$inferSelect
export type WorkflowNotificationQueue = typeof workflowNotificationQueue.$inferSelect

