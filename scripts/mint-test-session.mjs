#!/usr/bin/env node
/**
 * scripts/mint-test-session.mjs
 *
 * Programmatically mints a signed Auth.js v5 JWT session cookie for use in
 * automated staging soak tests and CI E2E test runs.
 *
 * The minted token is cryptographically equivalent to one issued by a real
 * sign-in flow — Auth.js uses the same encode() function with the same
 * AUTH_SECRET and salt (cookie name). No server-side request is made.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY CONSTRAINTS (mandatory — do not remove):
 *  • Requires AUTH_SECRET env var — MUST be staging-scoped; never production
 *  • Output files contain signed session cookies — treat as secrets
 *  • Never commit output JSON files to git (.gitignore blocks them)
 *  • Only use against staging/preview deployments with ENABLE_DEV_ACCOUNTS=true
 *  • Never log the raw JWT value to stdout in CI (--quiet flag suppresses it)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   AUTH_SECRET=<staging-secret> node scripts/mint-test-session.mjs \
 *     --role HR_ADMIN \
 *     --base-url https://staging.avaniis.dev \
 *     --output tests/e2e/auth/staging-hr-admin.json \
 *     [--quiet]        # suppress JWT echo (recommended for CI)
 *     [--ttl 3600]     # session TTL in seconds (default: 1800)
 *
 * Output: Playwright storageState JSON at --output path
 * Stdout: Cookie name + domain (quiet mode) or raw cookie= line (verbose)
 *
 * Supported roles: SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE
 */

import { encode } from 'next-auth/jwt'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { parseArgs } from 'util'

// ── Parse CLI args ────────────────────────────────────────────────────────────

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    role:       { type: 'string',  default: 'HR_ADMIN' },
    'base-url': { type: 'string',  default: 'https://staging.avaniis.dev' },
    output:     { type: 'string',  default: 'tests/e2e/auth/staging-hr-admin.json' },
    ttl:        { type: 'string',  default: '1800' },
    quiet:      { type: 'boolean', default: false },
  },
  strict: true,
})

const role     = values['role'].toUpperCase()
const baseUrl  = values['base-url']
const output   = values['output']
const ttl      = parseInt(values['ttl'], 10)
const quiet    = values['quiet']

// ── Validate ──────────────────────────────────────────────────────────────────

const VALID_ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']
if (!VALID_ROLES.includes(role)) {
  console.error(`[mint-test-session] ERROR: invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

const secret = process.env.AUTH_SECRET
if (!secret) {
  console.error('[mint-test-session] ERROR: AUTH_SECRET env var is required.')
  console.error('  Set it to the STAGING AUTH_SECRET (never production).')
  process.exit(1)
}

// Safety rail: refuse to mint against production URL unless explicitly overridden
const PRODUCTION_URL = process.env.PRODUCTION_APP_URL
if (new URL(baseUrl).protocol === 'https:' && !PRODUCTION_URL) {
  console.error('[mint-test-session] Set PRODUCTION_APP_URL before targeting a remote environment.')
  process.exit(1)
}
if (baseUrl === PRODUCTION_URL && !process.env.ALLOW_PRODUCTION_MINT) {
  console.error('[mint-test-session] ERROR: Refusing to mint against production URL.')
  console.error('  This script is staging-scoped. Set ALLOW_PRODUCTION_MINT=1 to override (not recommended).')
  process.exit(1)
}

// ── Build token payload (mirrors lib/auth.ts jwt() callback) ──────────────────
// Must match the shape that session() callback reads from token.

// All dev accounts (SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE) link to the
// System Administrator person in drizzle/seeds/seed-dev.ts (SYSTEM_ADMIN_PERSON_ID).
// personId must be present in the JWT so server actions that call requireRole()
// with a personId check (e.g. uploadMyDocument) work correctly in UAT tests.
const SYSTEM_ADMIN_PERSON_ID = '22222222-2222-2222-2222-222222222222'

// legalEntityId values mirror lib/auth.ts DEV_ACCOUNTS (must match real dev accounts
// so HR admin persons list filters correctly by entity).
// SUPER_ADMIN spans ENTITY_TEST_001; HR_ADMIN/MANAGER/EMPLOYEE use ENTITY_MAIN.
const ENTITY_TEST_001 = 'aaaa0001-0000-0000-0000-000000000001'
const ENTITY_MAIN     = '11111111-1111-1111-1111-111111111111'

// IDs must be valid UUIDs (8-4-4-4-12 hex chars) because they are used as
// created_by in person_documents and other uuid() columns.
// Pattern: cc000000-0000-0000-0000-000000000001..4 (distinct from real tenant UUIDs)
const ROLE_META = {
  SUPER_ADMIN: { email: 'super.admin@avaniis.dev',  name: 'Super Admin (Test)',  id: 'cc000000-0000-0000-0000-000000000001', personId: SYSTEM_ADMIN_PERSON_ID, legalEntityId: ENTITY_TEST_001 },
  HR_ADMIN:    { email: 'hr.admin@avaniis.dev',     name: 'HR Admin (Test)',     id: 'cc000000-0000-0000-0000-000000000002', personId: SYSTEM_ADMIN_PERSON_ID, legalEntityId: ENTITY_MAIN },
  MANAGER:     { email: 'manager@avaniis.dev',      name: 'Manager (Test)',      id: 'cc000000-0000-0000-0000-000000000003', personId: SYSTEM_ADMIN_PERSON_ID, legalEntityId: ENTITY_MAIN },
  EMPLOYEE:    { email: 'employee@avaniis.dev',     name: 'Employee (Test)',     id: 'cc000000-0000-0000-0000-000000000004', personId: SYSTEM_ADMIN_PERSON_ID, legalEntityId: ENTITY_MAIN },
}

const meta = ROLE_META[role]
const now  = Math.floor(Date.now() / 1000)

const tokenPayload = {
  // Standard JWT claims
  sub:  meta.id,
  iat:  now,
  exp:  now + ttl,
  jti:  `mint-${Date.now()}-${Math.random().toString(36).slice(2)}`,

  // Auth.js session.user fields (mapped by session() callback)
  id:            meta.id,
  name:          meta.name,
  email:         meta.email,
  role:          role,
  legalEntityId: meta.legalEntityId,    // matches real dev account entity per lib/auth.ts
  // Dev accounts all link to SYSTEM_ADMIN_PERSON_ID per drizzle/seeds/seed-dev.ts.
  // personId must be set so server actions (e.g. uploadMyDocument) work in UAT tests.
  personId:      meta.personId,
}

// ── Determine cookie name (Auth.js v5 convention) ─────────────────────────────
// HTTPS deployments use __Secure- prefix; HTTP (localhost) does not.

const isHttps    = baseUrl.startsWith('https://')
const cookieName = isHttps
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token'

// The salt MUST be the cookie name — Auth.js derives encryption key from secret+salt.
const salt = cookieName

// ── Mint the JWT ──────────────────────────────────────────────────────────────

let jwtValue
try {
  jwtValue = await encode({
    token:  tokenPayload,
    secret: secret,
    salt:   salt,
    maxAge: ttl,
  })
} catch (err) {
  console.error('[mint-test-session] ERROR: JWT encode failed:', err.message)
  process.exit(1)
}

// ── Build Playwright storageState JSON ────────────────────────────────────────

const url      = new URL(baseUrl)
const domain   = url.hostname        // e.g. staging.avaniis.dev
const expireTs = now + ttl           // Unix seconds

const storageState = {
  cookies: [
    {
      name:     cookieName,
      value:    jwtValue,
      domain:   domain,
      path:     '/',
      expires:  expireTs,
      httpOnly: true,
      secure:   isHttps,
      sameSite: 'Lax',
    },
  ],
  origins: [],
}

// ── Write output ──────────────────────────────────────────────────────────────

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(storageState, null, 2) + '\n', 'utf-8')

// ── Report ────────────────────────────────────────────────────────────────────

if (quiet) {
  // CI-safe: only log metadata, never the raw token value
  console.log(`[mint-test-session] OK`)
  console.log(`  role     : ${role}`)
  console.log(`  email    : ${meta.email}`)
  console.log(`  cookie   : ${cookieName}`)
  console.log(`  domain   : ${domain}`)
  console.log(`  ttl      : ${ttl}s (expires ${new Date((now + ttl) * 1000).toISOString()})`)
  console.log(`  output   : ${output}`)
} else {
  // Verbose: emit the cookie= line for manual k6 injection
  console.log(`[mint-test-session] Minted ${role} session`)
  console.log(`  cookie   : ${cookieName}`)
  console.log(`  domain   : ${domain}`)
  console.log(`  ttl      : ${ttl}s`)
  console.log(`  output   : ${output}`)
  console.log()
  console.log(`# For k6 AUTH_COOKIE env var:`)
  console.log(`export AUTH_COOKIE="${cookieName}=${jwtValue}"`)
}
