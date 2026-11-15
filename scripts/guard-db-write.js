#!/usr/bin/env node
/**
 * guard-db-write.js
 *
 * Safety guard — blocks accidental write operations against production or
 * unverified cloud databases.
 *
 * Decision tree:
 *
 *  A. LOCAL host (localhost / 127.x / docker hostname)
 *     → ALLOWED by default.
 *
 *  B. PRODUCTION database — blocked unless ALLOW_PRODUCTION_DB_WRITE=true:
 *     - DATABASE_ENV=production  OR
 *     - DATABASE_URL host matches PROD_DATABASE_URL host  OR
 *     - Cloud URL with no non-production approval (see D)
 *     - Reload/clear operations remain blocked even with production override
 *
 *  C. NON-PRODUCTION cloud branch — allowed only when ALL are true:
 *     - DATABASE_URL points to a cloud host (Neon, AWS RDS, etc.)
 *     - DATABASE_ENV is one of: development | dev | test | uat
 *     - In ENV_GOVERNANCE_MODE=uat-prod, PROD_DATABASE_URL is configured
 *       and DATABASE_URL host does NOT match PROD_DATABASE_URL host
 *     - ALLOW_NON_PROD_CLOUD_DB_WRITE=true
 *     - For reload/clear operations: DATABASE_ENV is test|uat and
 *       ALLOW_UAT_RELOAD_WRITE=true
 *
 *  D. Cloud URL without explicit non-production approval — BLOCKED:
 *     - DATABASE_URL points to cloud
 *     - ALLOW_NON_PROD_CLOUD_DB_WRITE missing or false
 *
 *  E. Production host with non-prod override — STILL BLOCKED:
 *     - DATABASE_URL host matches PROD_DATABASE_URL host
 *     - ALLOW_NON_PROD_CLOUD_DB_WRITE=true is present but NOT sufficient
 *     - Only ALLOW_PRODUCTION_DB_WRITE=true unlocks generic writes
 *
 * Output policy:
 *   - NEVER print full DATABASE_URL (contains credentials).
 *   - NEVER print passwords, tokens, or secrets.
 *   - Print only: sanitized host (hostname+port only), DATABASE_ENV, decision.
 */

'use strict'

const path    = require('path')
const { URL } = require('url')

// ── Load .env.local (same as drizzle.config.ts) ───────────────────────────────
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') })
} catch {
  // dotenv unavailable — rely on process.env being set by caller
}

// ── Read environment variables ────────────────────────────────────────────────
const DATABASE_URL           = process.env.DATABASE_URL           || ''
const PROD_DB_URL            = process.env.PROD_DATABASE_URL      || ''
const DATABASE_ENV           = (process.env.DATABASE_ENV          || '').trim().toLowerCase()
const ENV_GOVERNANCE_MODE    = (process.env.ENV_GOVERNANCE_MODE || 'single-dev-uat').trim().toLowerCase()
const ALLOW_PROD_WRITE       = process.env.ALLOW_PRODUCTION_DB_WRITE    === 'true'
const ALLOW_NON_PROD_WRITE   = process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE === 'true'
const ALLOW_UAT_RELOAD_WRITE = process.env.ALLOW_UAT_RELOAD_WRITE === 'true'
const WRITE_OPERATION        = (process.env.DB_WRITE_OPERATION || 'generic').trim().toLowerCase()

// ── Cloud host patterns ────────────────────────────────────────────────────────
const CLOUD_PATTERNS = [
  /\.neon\.tech(:\d+)?$/i,
  /\.neon\.tech$/i,
  /\.amazonaws\.com$/i,
  /\.rds\.amazonaws\.com$/i,
  /\.supabase\.co$/i,
  /\.supabase\.in$/i,
  /\.cockroachlabs\.cloud$/i,
  /\.azure\.database\.windows\.net$/i,
  /\.database\.azure\.com$/i,
  /\.digitalocean\.com$/i,
  /\.fly\.dev$/i,
  /\.railway\.app$/i,
  /\.render\.com$/i,
  /\.planetscale\.com$/i,
]

// ── Safe local host patterns ──────────────────────────────────────────────────
const LOCAL_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^host\.docker\.internal$/i,
  /^postgres$/i,   // docker-compose service name
  /^db$/i,         // docker-compose service name
]

// ── Non-production DATABASE_ENV values ───────────────────────────────────────
const KNOWN_ENVS    = new Set(['development', 'dev', 'test', 'uat', 'production'])
const KNOWN_GOVERNANCE_MODES = new Set(['single-dev-uat', 'uat-prod'])
const NON_PROD_ENVS = new Set(['development', 'dev', 'test', 'uat'])
const UAT_ENVS      = new Set(['test', 'uat'])
const RELOAD_OPERATIONS = new Set(['reload', 'clear', 'reset', 'uat-reload', 'migration-reload'])

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHostname(rawUrl) {
  if (!rawUrl) return null
  try { return new URL(rawUrl).hostname || null } catch { return null }
}

/** Returns "hostname:port" — never includes user/password/path */
function safeHost(rawUrl) {
  if (!rawUrl) return '[not set]'
  try {
    const u = new URL(rawUrl)
    return u.port ? `${u.hostname}:${u.port}` : u.hostname
  } catch { return '[unparseable]' }
}

function isCloud(h)  { return !!h && CLOUD_PATTERNS.some(p => p.test(h)) }
function isLocal(h)  { return !!h && LOCAL_PATTERNS.some(p => p.test(h)) }
function isNonProd() { return NON_PROD_ENVS.has(DATABASE_ENV) }
function isKnownEnv() { return KNOWN_ENVS.has(DATABASE_ENV) }
function isKnownGovernanceMode() { return KNOWN_GOVERNANCE_MODES.has(ENV_GOVERNANCE_MODE) }
function isUatEnv()  { return UAT_ENVS.has(DATABASE_ENV) }
function isReloadOperation() { return RELOAD_OPERATIONS.has(WRITE_OPERATION) }
function productionComparisonRequired() { return ENV_GOVERNANCE_MODE === 'uat-prod' }

const B = '═'.repeat(72)   // block divider
const W = '▲'.repeat(72)   // warning divider

function blockProd(reason) {
  process.stderr.write(`\n${B}\n`)
  process.stderr.write(`  ⛔  WRITE BLOCKED — ${reason}\n`)
  process.stderr.write(`${B}\n\n`)
  process.stderr.write(`  Host:           ${safeHost(DATABASE_URL)}\n`)
  process.stderr.write(`  DATABASE_ENV:   ${DATABASE_ENV || '(not set)'}\n`)
  process.stderr.write(`  Governance:     ${ENV_GOVERNANCE_MODE || '(not set)'}\n`)
  process.stderr.write('\n')
  process.stderr.write('  This database is classified as PRODUCTION.\n')
  process.stderr.write('  Only authorised production writes may proceed.\n')
  process.stderr.write('\n')
  process.stderr.write('  To explicitly approve a production write, set:\n')
  process.stderr.write('    ALLOW_PRODUCTION_DB_WRITE=true\n')
  process.stderr.write('\n')
  process.stderr.write('  ALLOW_NON_PROD_CLOUD_DB_WRITE=true is NOT sufficient.\n')
  process.stderr.write(`${B}\n\n`)
  process.exit(1)
}

function blockProdReload(reason) {
  process.stderr.write(`\n${B}\n`)
  process.stderr.write(`  ⛔  RELOAD/CLEAR BLOCKED — ${reason}\n`)
  process.stderr.write(`${B}\n\n`)
  process.stderr.write(`  Host:           ${safeHost(DATABASE_URL)}\n`)
  process.stderr.write(`  DATABASE_ENV:   ${DATABASE_ENV || '(not set)'}\n`)
  process.stderr.write(`  Governance:     ${ENV_GOVERNANCE_MODE || '(not set)'}\n`)
  process.stderr.write(`  Operation:      ${WRITE_OPERATION}\n`)
  process.stderr.write('\n')
  process.stderr.write('  Reload and clear operations are never allowed against production.\n')
  process.stderr.write('  Use the active DEV/UAT database only.\n')
  process.stderr.write(`${B}\n\n`)
  process.exit(1)
}

function blockNonProd(reason, hint) {
  process.stderr.write(`\n${B}\n`)
  process.stderr.write(`  ⛔  WRITE BLOCKED — ${reason}\n`)
  process.stderr.write(`${B}\n\n`)
  process.stderr.write(`  Host:           ${safeHost(DATABASE_URL)}\n`)
  process.stderr.write(`  DATABASE_ENV:   ${DATABASE_ENV || '(not set)'}\n`)
  process.stderr.write(`  Governance:     ${ENV_GOVERNANCE_MODE || '(not set)'}\n`)
  process.stderr.write(`  PROD_DATABASE_URL configured: ${PROD_DB_URL ? 'yes' : 'no'}\n`)
  process.stderr.write(`  Operation:      ${WRITE_OPERATION}\n`)
  process.stderr.write('\n')
  if (hint) process.stderr.write(`  ${hint}\n\n`)
  process.stderr.write('  See docs/local-development.md for full setup instructions.\n')
  process.stderr.write(`${B}\n\n`)
  process.exit(1)
}

function warnProd() {
  process.stderr.write(`\n${W}\n`)
  process.stderr.write('  ⚠️   SEVERE WARNING — PRODUCTION DATABASE WRITE\n')
  process.stderr.write(`${W}\n\n`)
  process.stderr.write('  ALLOW_PRODUCTION_DB_WRITE=true is active.\n')
  process.stderr.write(`  Target host:    ${safeHost(DATABASE_URL)}\n`)
  process.stderr.write(`  DATABASE_ENV:   ${DATABASE_ENV || '(not set)'}\n`)
  process.stderr.write(`  Governance:     ${ENV_GOVERNANCE_MODE || '(not set)'}\n`)
  process.stderr.write('\n')
  process.stderr.write('  You are solely responsible for any changes made to this database.\n')
  process.stderr.write('  This override is for authorised maintenance windows only.\n')
  process.stderr.write(`${W}\n\n`)
}

function warnNonProd() {
  process.stderr.write(`\n${W}\n`)
  process.stderr.write('  ⚠️   WARNING — NON-PRODUCTION CLOUD DATABASE WRITE\n')
  process.stderr.write(`${W}\n\n`)
  process.stderr.write('  ALLOW_NON_PROD_CLOUD_DB_WRITE=true is active.\n')
  process.stderr.write(`  Target host:    ${safeHost(DATABASE_URL)}\n`)
  process.stderr.write(`  DATABASE_ENV:   ${DATABASE_ENV}\n`)
  process.stderr.write(`  Governance:     ${ENV_GOVERNANCE_MODE}\n`)
  process.stderr.write('\n')
  if (prodHost) process.stderr.write('  Confirmed: this host does not match PROD_DATABASE_URL.\n')
  else process.stderr.write('  Production URL not configured because governance mode is single-dev-uat.\n')
  process.stderr.write('  Proceeding against a non-production DEV/UAT cloud environment.\n')
  process.stderr.write(`${W}\n\n`)
}

// ── Guard logic ───────────────────────────────────────────────────────────────

// 0. DATABASE_URL must exist
if (!DATABASE_URL) {
  process.stderr.write('\n⛔  guard-db-write: DATABASE_URL is not set.\n')
  process.stderr.write('    Create .env.local from .env.local.example and set DATABASE_URL.\n\n')
  process.exit(1)
}

const dbHost   = parseHostname(DATABASE_URL)
const prodHost = parseHostname(PROD_DB_URL)
const isProdHost = !!(prodHost && dbHost && prodHost === dbHost)
const isProdEnv  = DATABASE_ENV === 'production'

if (!DATABASE_ENV) {
  blockNonProd(
    'DATABASE_ENV is required',
    'Set DATABASE_ENV to one of: development | dev | test | uat | production'
  )
}

if (!isKnownEnv()) {
  blockNonProd(
    'DATABASE_ENV is not recognised',
    'Set DATABASE_ENV to one of: development | dev | test | uat | production'
  )
}

if (!isKnownGovernanceMode()) {
  blockNonProd(
    'ENV_GOVERNANCE_MODE is not recognised',
    'Set ENV_GOVERNANCE_MODE to single-dev-uat or uat-prod'
  )
}

if (isProdEnv) {
  if (isReloadOperation()) blockProdReload('DATABASE_ENV=production')
  if (ALLOW_PROD_WRITE) { warnProd(); process.exit(0) }
  blockProd('DATABASE_ENV=production')
}

// 1. Local host → always safe
if (isLocal(dbHost)) {
  process.stdout.write(`\n  ✅  guard-db-write: local host (${dbHost}) — safe to proceed.\n\n`)
  process.exit(0)
}

// 2. Cloud URL detected — enter cloud decision tree
if (isCloud(dbHost)) {

  // 2a. Production host match (E) — ALLOW_NON_PROD_CLOUD_DB_WRITE not sufficient
  if (isProdHost) {
    if (isReloadOperation()) blockProdReload('DATABASE_URL host matches PROD_DATABASE_URL')
    if (ALLOW_PROD_WRITE) { warnProd(); process.exit(0) }
    blockProd('DATABASE_URL host matches PROD_DATABASE_URL (production host)')
  }

  // 2c. Non-production cloud with ALLOW_NON_PROD_CLOUD_DB_WRITE=true — validate all C conditions
  if (ALLOW_NON_PROD_WRITE) {
    if (!isNonProd()) {
      blockNonProd(
        'DATABASE_ENV is not a recognised non-production value',
        'Set DATABASE_ENV to one of: development | dev | test | uat'
      )
    }
    if (prodHost && dbHost === prodHost) {
      if (isReloadOperation()) blockProdReload('DATABASE_URL host matches PROD_DATABASE_URL')
      if (ALLOW_PROD_WRITE) { warnProd(); process.exit(0) }
      blockProd('DATABASE_URL host matches PROD_DATABASE_URL (production host)')
    }
    if (productionComparisonRequired() && !prodHost) {
      blockNonProd(
        'PROD_DATABASE_URL is required when ENV_GOVERNANCE_MODE=uat-prod',
        'Set PROD_DATABASE_URL so the guard can confirm this host differs from production.'
      )
    }
    if (isReloadOperation() && !isUatEnv()) {
      blockNonProd(
        'Reload/clear operations require DATABASE_ENV=test or uat',
        'Set DATABASE_ENV=test or DATABASE_ENV=uat for approved reload windows.'
      )
    }
    if (isReloadOperation() && !ALLOW_UAT_RELOAD_WRITE) {
      blockNonProd(
        'Reload/clear operations require ALLOW_UAT_RELOAD_WRITE=true',
        'Set ALLOW_UAT_RELOAD_WRITE=true only for an approved Test/UAT reload window.'
      )
    }
    // All conditions met → allow with non-prod warning (C)
    warnNonProd()
    process.exit(0)
  }

  // 2d. Cloud URL with no override at all (D)
  blockNonProd(
    'Cloud database detected — write operations require explicit approval',
    [
      'Options:',
      '  1. Use a local Docker database (safest):',
      '       DATABASE_URL=postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev',
      '  2. Use a Neon branch (non-production cloud):',
      '       neon branches create --name my-feature-branch',
      '       Set DATABASE_ENV=development,',
      '       and ALLOW_NON_PROD_CLOUD_DB_WRITE=true in .env.local',
      '       If ENV_GOVERNANCE_MODE=uat-prod, also set PROD_DATABASE_URL=<prod-url>.',
      '  3. Intentional generic production write (authorised maintenance only):',
      '       Set ALLOW_PRODUCTION_DB_WRITE=true',
      '       Reload/clear operations are still blocked in production.',
    ].join('\n  ')
  )
}

// 3. Unknown host (not local, not cloud — e.g. internal VPN, private network)
blockNonProd(
  'Unrecognised database host',
  'Only known local hosts or recognised cloud hosts with explicit non-production approval may proceed.'
)
