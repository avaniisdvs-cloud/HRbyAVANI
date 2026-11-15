/**
 * run-uat-cleanup.mjs
 * ONE-SHOT runner — executes CLEANUP then VERIFY and prints all result sets.
 * Authorized by explicit user instruction 2026-06-03.
 * DO NOT re-run without re-authorization.
 *
 * Usage:
 *   ENV_GOVERNANCE_MODE=single-dev-uat DATABASE_ENV=uat ALLOW_NON_PROD_CLOUD_DB_WRITE=true ALLOW_UAT_RELOAD_WRITE=true node scripts/run-uat-cleanup.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = resolve(__dirname, '..')

// ── Load .env.local ────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url)
try { require('dotenv').config({ path: resolve(root, '.env.local') }) } catch {}

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!DATABASE_URL) {
  console.error('ABORT: DATABASE_URL not set.')
  process.exit(1)
}

function hostOf(rawUrl) {
  try { return new URL(rawUrl).hostname } catch { return '' }
}

const databaseEnv = (process.env.DATABASE_ENV || '').trim().toLowerCase()
const governanceMode = (process.env.ENV_GOVERNANCE_MODE || 'single-dev-uat').trim().toLowerCase()
const prodHost = hostOf(process.env.PROD_DATABASE_URL || '')
const targetHost = hostOf(DATABASE_URL)
const isApprovedEnv = databaseEnv === 'test' || databaseEnv === 'uat'
const isKnownGovernanceMode = governanceMode === 'single-dev-uat' || governanceMode === 'uat-prod'
const productionComparisonRequired = governanceMode === 'uat-prod'

if (!isApprovedEnv) {
  console.error('ABORT: DATABASE_ENV must be test or uat for UAT cleanup.')
  process.exit(1)
}
if (!isKnownGovernanceMode) {
  console.error('ABORT: ENV_GOVERNANCE_MODE must be single-dev-uat or uat-prod.')
  process.exit(1)
}
if (productionComparisonRequired && !prodHost) {
  console.error('ABORT: PROD_DATABASE_URL is required when ENV_GOVERNANCE_MODE=uat-prod.')
  process.exit(1)
}
if (!targetHost || (prodHost && targetHost === prodHost)) {
  console.error('ABORT: target database host is missing or matches PROD_DATABASE_URL.')
  process.exit(1)
}
if (process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE !== 'true') {
  console.error('ABORT: ALLOW_NON_PROD_CLOUD_DB_WRITE=true not set. Refusing to run.')
  process.exit(1)
}
if (process.env.ALLOW_UAT_RELOAD_WRITE !== 'true') {
  console.error('ABORT: ALLOW_UAT_RELOAD_WRITE=true not set. Refusing to run.')
  process.exit(1)
}

// Print host only (no credentials) for audit trail
try {
  const u = new URL(DATABASE_URL)
  console.log(`\nTarget host : ${u.hostname}`)
  console.log(`DATABASE_ENV: ${databaseEnv}`)
  console.log(`Governance  : ${governanceMode}`)
} catch {}

// ── Load postgres driver ───────────────────────────────────────────────────────
const postgres = (await import('postgres')).default

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connection: { application_name: 'uat-cleanup-runner' },
})

// ── Read SQL files ─────────────────────────────────────────────────────────────
const cleanupPath = resolve(root, 'db/scripts/CLEANUP_UAT_BUSINESS_DATA.sql')
const verifyPath  = resolve(root, 'db/scripts/VERIFY_UAT_CLEANUP.sql')

let cleanupSql = readFileSync(cleanupPath, 'utf8')
let verifySql  = readFileSync(verifyPath,  'utf8')

// Strip the psql meta-command (\set) — not valid SQL, no-op in Neon editor.
// This is the ONLY transformation applied before execution.
cleanupSql = cleanupSql.replace(/^\\set.*$/gm, '-- [psql metacommand stripped by runner]')

// ── Helper: print a result set as an ASCII table ──────────────────────────────
function printTable(label, rows) {
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`  ${label}`)
  console.log('─'.repeat(72))
  if (!rows || rows.length === 0) { console.log('  (no rows)'); return }
  const cols = Object.keys(rows[0])
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)))
  const header = cols.map((c, i) => c.padEnd(widths[i])).join('  │  ')
  console.log('  ' + header)
  console.log('  ' + widths.map(w => '─'.repeat(w)).join('──┼──'))
  for (const row of rows) {
    console.log('  ' + cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  │  '))
  }
}

// ── Execute CLEANUP ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  PHASE 1 — CLEANUP_UAT_BUSINESS_DATA.sql')
console.log('═'.repeat(72))

let cleanupError = null
let beforeRows, afterRows, preservedRows

try {
  // Execute the whole script through the connection.
  // The DO $$ guard block, all DELETEs/UPDATEs, and the embedded SELECTs
  // all run inside the single BEGIN…COMMIT already in the SQL file.
  // postgres driver: unsafe() executes the raw multi-statement SQL.
  const results = await sql.unsafe(cleanupSql)

  // results is an array of result sets (one per statement returning rows).
  // The BEFORE SELECT, AFTER SELECT, and PRESERVED SELECT each return rows.
  // We identify them by the 'phase' column in the result.
  const resultSets = Array.isArray(results) ? results : [results]

  for (const rs of resultSets) {
    if (!rs || rs.length === 0) continue
    const phase = rs[0]?.phase
    if (phase === 'BEFORE')     { beforeRows    = rs; printTable('BEFORE COUNTS', rs) }
    if (phase === 'AFTER')      { afterRows     = rs; printTable('AFTER COUNTS',  rs) }
    if (phase === 'PRESERVED')  { preservedRows = rs; printTable('PRESERVED COUNTS', rs) }
  }

  console.log('\n✅  CLEANUP completed (COMMIT applied).')

} catch (err) {
  cleanupError = err
  console.error('\n❌  CLEANUP FAILED — SQL error follows. Stopping.')
  console.error(err.message)
}

if (cleanupError) {
  await sql.end()
  process.exit(1)
}

// ── Execute VERIFY ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  PHASE 2 — VERIFY_UAT_CLEANUP.sql')
console.log('═'.repeat(72))

let verifyError   = null
let overallVerdict = null

try {
  const vResults = await sql.unsafe(verifySql)
  const vSets = Array.isArray(vResults) ? vResults : [vResults]

  for (const rs of vSets) {
    if (!rs || rs.length === 0) continue
    const check = rs[0]?.check_name ?? ''
    printTable(check, rs)
    if (check === '8. OVERALL') overallVerdict = rs[0]
  }

} catch (err) {
  verifyError = err
  console.error('\n❌  VERIFY FAILED — SQL error:')
  console.error(err.message)
}

// ── Final summary ──────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log('  FINAL SUMMARY')
console.log('═'.repeat(72))
console.log(`  Cleanup executed  : ${cleanupError  ? '❌ FAILED' : '✅ SUCCESS (COMMIT)'}`)
console.log(`  Verify executed   : ${verifyError   ? '❌ FAILED' : '✅ SUCCESS'}`)
console.log(`  Overall verdict   : ${overallVerdict ? overallVerdict.verdict : '(not captured)'}`)
console.log(`  Seed/import run   : NO`)
console.log(`  Deploy triggered  : NO`)
console.log('═'.repeat(72))

await sql.end()
process.exit(verifyError || (overallVerdict && overallVerdict.verdict.startsWith('FAIL')) ? 1 : 0)
