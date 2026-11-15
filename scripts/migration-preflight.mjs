#!/usr/bin/env node
/**
 * Migration preflight report (READ-ONLY, LOCAL-ONLY).
 *
 * SAFE: reads migration files + ledgers from disk only. Makes NO database
 * connection and applies NOTHING. Use it to plan a production migration window.
 *
 *   node scripts/migration-preflight.mjs
 *
 * Reports: ordered migration list, _wip_ flags, numbering gaps, and ledger
 * consistency (files vs ledger entries) for DEV/UAT and Production ledgers.
 * It does NOT apply migrations and does NOT mark anything "applied".
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MIG_DIR = path.join(ROOT, 'drizzle', 'migrations')
const LEDGERS = {
  'DEV/UAT': path.join(ROOT, 'docs/environment/migration-ledger.test.md'),
  Production: path.join(ROOT, 'docs/environment/migration-ledger.production.md'),
}

function listMigrations() {
  return fs.readdirSync(MIG_DIR)
    .filter(f => /^\d{4}.*\.sql$/.test(f))
    .map(f => ({ file: f, num: parseInt(f.slice(0, 4), 10), wip: /_wip_/.test(f) }))
    .sort((a, b) => a.num - b.num)
}

function numberingGaps(mig) {
  const nums = [...new Set(mig.map(m => m.num))].sort((a, b) => a - b)
  const gaps = []
  for (let i = 1; i < nums.length; i++) {
    for (let n = nums[i - 1] + 1; n < nums[i]; n++) gaps.push(n)
  }
  return { first: nums[0], last: nums[nums.length - 1], gaps }
}

function ledgerNums(file) {
  if (!fs.existsSync(file)) return new Set()
  const text = fs.readFileSync(file, 'utf8')
  const nums = new Set()
  for (const m of text.matchAll(/\b(\d{4})_[a-z0-9_]+\.sql/gi)) nums.add(parseInt(m[1], 10))
  return nums
}

const mig = listMigrations()
const { first, last, gaps } = numberingGaps(mig)

console.log('═══ MIGRATION PREFLIGHT (read-only; no DB, nothing applied) ═══')
console.log(`migrations dir: drizzle/migrations`)
console.log(`count: ${mig.length}  range: ${String(first).padStart(4,'0')}–${String(last).padStart(4,'0')}`)
console.log(`numbering gaps: ${gaps.length ? gaps.map(n => String(n).padStart(4,'0')).join(', ') : 'none'}`)

const wip = mig.filter(m => m.wip)
console.log(`\n_wip_ migrations (DO NOT apply to production until audited/reissued): ${wip.length ? wip.map(m => m.file).join(', ') : 'none'}`)

console.log('\n— Ledger consistency (files present but NOT listed in ledger) —')
for (const [name, file] of Object.entries(LEDGERS)) {
  const led = ledgerNums(file)
  const missing = mig.filter(m => !led.has(m.num)).map(m => m.file)
  console.log(`  ${name}: ${fs.existsSync(file) ? '' : '(ledger file missing) '}${missing.length ? missing.join(', ') : 'all migration numbers referenced'}`)
}

console.log('\nℹ️  NOTE: "present but not in ledger" / "not in production ledger" is NOT a blocker')
console.log('    by itself. A migration may legitimately be DEV/UAT-verified but production-pending')
console.log('    because no production DB exists yet (BLK-013), or be deferred to another workstream')
console.log('    (e.g. payroll 0066). For the evidence-aware classification of 0063–0067 (BLK-014)')
console.log('    run:  pnpm migration:governance   — canonical record:')
console.log('    docs/production-readiness/migration-0063-0067-governance.md')

console.log('\n⚠️  This report PREPARES a migration window. It does NOT apply or approve')
console.log('    any migration. Production apply remains pending DBA + CAB approval,')
console.log('    backup, clone rehearsal, verification, and sign-off.')
