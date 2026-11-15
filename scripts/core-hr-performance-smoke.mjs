#!/usr/bin/env node
/**
 * Core HR performance smoke (LOCAL/CI-SAFE).
 *
 * SAFE: NO database, NO network, NO production data. Generates SYNTHETIC data
 * in-memory and times the algorithmic shapes that dominate high-volume Core HR
 * surfaces, so a regression in those shapes is caught in CI before it reaches a
 * production-scale load test:
 *
 *   • Org chart      — build parent→children map + reporting chains   (people list)
 *   • People search  — case-insensitive filter over the full set      (/persons, directory)
 *   • Sort + paginate— sort by name, slice a page                      (list/grid pages)
 *   • Approvals queue— filter + group pending items                    (approvals)
 *   • Absence calendar— bucket events by day over a range             (absence calendar)
 *   • CSV export     — serialise the full set to CSV                   (reports/exports)
 *
 * This is an ALGORITHMIC smoke, NOT a substitute for a production-like, DB-backed
 * load test. Full performance closure still requires running tests/performance
 * (k6) against realistic headcount + concurrency on production-faithful data.
 * See docs/environment/CORE-HR-PERFORMANCE-READINESS.md.
 *
 * Usage:
 *   pnpm perf:core-hr:smoke                 # default 5,000 employees
 *   PERF_SMOKE_HEADCOUNT=20000 pnpm perf:core-hr:smoke
 *   node scripts/core-hr-performance-smoke.mjs --headcount 10000
 *
 * Exit code: 0 if all checks ≤ FAIL threshold; 1 if any check exceeds it.
 */

// ── Config ────────────────────────────────────────────────────────────────────
const argHead = (() => {
  const i = process.argv.indexOf('--headcount')
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : NaN
})()
const HEADCOUNT = Number.isFinite(argHead)
  ? argHead
  : parseInt(process.env.PERF_SMOKE_HEADCOUNT ?? '5000', 10)
const ABSENCE_EVENTS = HEADCOUNT * 6  // ~6 leave events / person / period

// Per-check thresholds in ms. WARN = expected ceiling on a dev laptop;
// FAIL = generous hard gate (regression guard, not a benchmark).
const THRESHOLDS = {
  'generate-synthetic-data': { warn: 400, fail: 2000 },
  'org-chart-build':         { warn: 150, fail: 1000 },
  'reporting-chains':        { warn: 200, fail: 1500 },
  'people-search':           { warn: 80,  fail: 600 },
  'sort-and-paginate':       { warn: 120, fail: 800 },
  'approvals-queue':         { warn: 80,  fail: 600 },
  'absence-calendar-bucket': { warn: 150, fail: 1200 },
  'csv-export-full':         { warn: 250, fail: 1800 },
}

// ── Tiny deterministic PRNG (no Math.random — reproducible across runs) ────────
let seed = 1234567
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function pick(arr) { return arr[Math.floor(rnd() * arr.length)] }

const FIRST = ['Ahmed', 'Fatima', 'Mohammed', 'Aisha', 'Omar', 'Layla', 'Yousef', 'Mariam', 'Khalid', 'Noura']
const LAST  = ['Al Mansoori', 'Al Maktoum', 'Hassan', 'Khan', 'Rahman', 'Saeed', 'Nasser', 'Hamdan', 'Suleiman', 'Farouk']
const DEPTS = Array.from({ length: 40 }, (_, i) => `dept-${i}`)

function ms(fn) {
  const t0 = process.hrtime.bigint()
  const out = fn()
  const t1 = process.hrtime.bigint()
  return { elapsed: Number(t1 - t0) / 1e6, out }
}

// ── Build synthetic dataset ─────────────────────────────────────────────────
const gen = ms(() => {
  const persons = new Array(HEADCOUNT)
  for (let i = 0; i < HEADCOUNT; i++) {
    persons[i] = {
      id: `p-${i}`,
      firstName: pick(FIRST),
      lastName: pick(LAST),
      employeeNumber: `EMP-${String(i).padStart(6, '0')}`,
      departmentId: pick(DEPTS),
      // First ~1% are roots; everyone else reports to a lower-index person.
      managerId: i < Math.max(1, Math.floor(HEADCOUNT * 0.01)) ? null : `p-${Math.floor(rnd() * i)}`,
      status: rnd() < 0.93 ? 'ACTIVE' : 'INACTIVE',
    }
    persons[i].fullName = `${persons[i].firstName} ${persons[i].lastName}`
  }
  const absences = new Array(ABSENCE_EVENTS)
  for (let i = 0; i < ABSENCE_EVENTS; i++) {
    absences[i] = {
      personId: `p-${Math.floor(rnd() * HEADCOUNT)}`,
      dayOffset: Math.floor(rnd() * 365),
      status: rnd() < 0.7 ? 'APPROVED' : 'PENDING',
    }
  }
  return { persons, absences }
})
const { persons, absences } = gen.out

// ── Checks ──────────────────────────────────────────────────────────────────
const results = [{ name: 'generate-synthetic-data', elapsed: gen.elapsed }]

// Org chart: parent → children adjacency map.
const childrenById = new Map()
results.push({ name: 'org-chart-build', ...ms(() => {
  for (const p of persons) {
    if (!p.managerId) continue
    const arr = childrenById.get(p.managerId)
    if (arr) arr.push(p.id); else childrenById.set(p.managerId, [p.id])
  }
  return childrenById.size
}) })

// Reporting chains: walk manager links to root for a sample of 2,000 people.
results.push({ name: 'reporting-chains', ...ms(() => {
  const byId = new Map(persons.map(p => [p.id, p]))
  let totalDepth = 0
  const sample = Math.min(2000, persons.length)
  for (let i = 0; i < sample; i++) {
    let cur = persons[Math.floor((i / sample) * persons.length)]
    let depth = 0
    const guard = new Set()
    while (cur?.managerId && !guard.has(cur.id) && depth < 1000) {
      guard.add(cur.id)
      cur = byId.get(cur.managerId)
      depth++
    }
    totalDepth += depth
  }
  return totalDepth
}) })

// People search: case-insensitive substring filter over the full set.
results.push({ name: 'people-search', ...ms(() => {
  const q = 'al ma'
  let hits = 0
  for (const p of persons) {
    if (p.fullName.toLowerCase().includes(q) || p.employeeNumber.toLowerCase().includes(q)) hits++
  }
  return hits
}) })

// Sort by name + paginate (page 50, size 25).
results.push({ name: 'sort-and-paginate', ...ms(() => {
  const sorted = [...persons].sort((a, b) => a.fullName.localeCompare(b.fullName))
  return sorted.slice(50 * 25, 50 * 25 + 25).length
}) })

// Approvals queue: filter pending + group by department.
results.push({ name: 'approvals-queue', ...ms(() => {
  const pending = absences.filter(a => a.status === 'PENDING')
  const byPerson = new Map()
  for (const a of pending) byPerson.set(a.personId, (byPerson.get(a.personId) ?? 0) + 1)
  return byPerson.size
}) })

// Absence calendar: bucket events into day cells across a 365-day range.
results.push({ name: 'absence-calendar-bucket', ...ms(() => {
  const days = new Array(365).fill(0)
  for (const a of absences) days[a.dayOffset]++
  return days.reduce((s, n) => s + n, 0)
}) })

// CSV export: serialise the full person set.
results.push({ name: 'csv-export-full', ...ms(() => {
  const header = 'id,employeeNumber,fullName,departmentId,status\n'
  const rows = new Array(persons.length)
  for (let i = 0; i < persons.length; i++) {
    const p = persons[i]
    rows[i] = `${p.id},${p.employeeNumber},"${p.fullName}",${p.departmentId},${p.status}`
  }
  return (header + rows.join('\n')).length
}) })

// ── Report ────────────────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' }
let failed = 0, warned = 0

console.log(`${C.bold}${C.cyan}═══ CORE HR PERFORMANCE SMOKE (synthetic, no DB) ═══${C.reset}`)
console.log(`${C.dim}headcount: ${HEADCOUNT.toLocaleString()}   absence events: ${ABSENCE_EVENTS.toLocaleString()}${C.reset}`)
console.log('')
console.log(`${'check'.padEnd(28)} ${'elapsed'.padStart(10)} ${'warn'.padStart(7)} ${'fail'.padStart(7)}   status`)
console.log('─'.repeat(72))
for (const r of results) {
  const th = THRESHOLDS[r.name] ?? { warn: Infinity, fail: Infinity }
  let status = `${C.green}PASS${C.reset}`
  if (r.elapsed > th.fail) { status = `${C.red}FAIL${C.reset}`; failed++ }
  else if (r.elapsed > th.warn) { status = `${C.yellow}WARN${C.reset}`; warned++ }
  console.log(`${r.name.padEnd(28)} ${(r.elapsed.toFixed(1) + 'ms').padStart(10)} ${(th.warn + 'ms').padStart(7)} ${(th.fail + 'ms').padStart(7)}   ${status}`)
}
console.log('─'.repeat(72))
const total = results.reduce((s, r) => s + r.elapsed, 0)
console.log(`${'TOTAL'.padEnd(28)} ${(total.toFixed(1) + 'ms').padStart(10)}`)
console.log('')

if (failed) {
  console.log(`${C.red}${C.bold}✗ ${failed} check(s) exceeded the FAIL threshold — investigate the algorithmic regression.${C.reset}`)
} else if (warned) {
  console.log(`${C.yellow}⚠ ${warned} check(s) over the WARN ceiling — acceptable for a smoke; watch for trend.${C.reset}`)
} else {
  console.log(`${C.green}✓ All checks within thresholds.${C.reset}`)
}
console.log(`${C.dim}NOT a production load test. Run tests/performance (k6) against production-faithful data + concurrency for full closure (P-8).${C.reset}`)
process.exit(failed ? 1 : 0)
