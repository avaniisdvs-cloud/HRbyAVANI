#!/usr/bin/env tsx
/**
 * Migration governance report (BLK-014) — evidence-aware, READ-ONLY.
 *
 * SAFE: no DB, no network, applies nothing. Classifies migrations 0063–0067 using
 * lib/migration-governance.ts (the same logic the regression test asserts) and the
 * BLK-013 production-DB context, then prints the BLK-014 disposition.
 *
 *   pnpm migration:governance
 *
 * Replaces the naive "not in production ledger = blocker" interpretation with
 * precise per-migration classifications. The canonical record is
 * docs/production-readiness/migration-0063-0067-governance.md.
 */
import {
  BLK014_MIGRATION_FACTS,
  classifyMigration,
  disposeBlk014,
  isProductionDbProvisioned,
  type MigrationClass,
} from '../lib/migration-governance'

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' }
const prodDb = isProductionDbProvisioned(process.env)
const ctx = { productionDbProvisioned: prodDb }

const color = (c: MigrationClass) =>
  c === 'CLOSED_WITH_EVIDENCE' ? C.green
  : c === 'RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING' || c === 'HUMAN_GATED_BY_BLK_013' ? C.cyan
  : c === 'STILL_REQUIRED_PENDING' ? C.yellow
  : C.red

console.log(`${C.bold}${C.cyan}═══ BLK-014 MIGRATION GOVERNANCE (0063–0067) — read-only ═══${C.reset}`)
console.log(`production DB provisioned: ${prodDb ? 'yes' : `${C.bold}no${C.reset} (BLK-013; ENV_GOVERNANCE_MODE!=uat-prod)`}`)
console.log(`canonical record: docs/production-readiness/migration-0063-0067-governance.md`)
console.log('')

const classes: MigrationClass[] = []
for (const m of BLK014_MIGRATION_FACTS) {
  const cls = classifyMigration(m, ctx)
  classes.push(cls)
  console.log(`${C.bold}00${m.num}${C.reset} [${m.scope}]  ${color(cls)}${cls}${C.reset}`)
  console.log(`   ${C.dim}${m.purpose}${C.reset}`)
  console.log(`   ${C.dim}evidence: ${m.evidence}${C.reset}`)
}

const disposition = disposeBlk014(classes)
console.log('')
const dColor = disposition === 'CLOSED' ? C.green : disposition === 'OPEN' ? C.red : C.yellow
console.log(`${C.bold}BLK-014 disposition: ${dColor}${disposition}${C.reset}`)

if (disposition !== 'CLOSED') {
  const remaining = BLK014_MIGRATION_FACTS
    .map((m, i) => ({ m, c: classes[i] }))
    .filter(x => x.c === 'STILL_REQUIRED_PENDING' || x.c === 'INVESTIGATION_REQUIRED' || x.c === 'VALID_PRODUCTION_BLOCKER')
    .map(x => `00${x.m.num} (${x.c})`)
  const gated = BLK014_MIGRATION_FACTS
    .map((m, i) => ({ m, c: classes[i] }))
    .filter(x => x.c === 'RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING' || x.c === 'HUMAN_GATED_BY_BLK_013')
    .map(x => `00${x.m.num}`)
  if (remaining.length) console.log(`${C.yellow}narrowed remaining blocker: ${remaining.join(', ')}${C.reset}`)
  if (gated.length) console.log(`${C.dim}prod-provisioning-gated (BLK-013): ${gated.join(', ')} — not standalone blockers${C.reset}`)
}
console.log(`${C.dim}This report applies/changes nothing. 0067 apply is human-gated (DBA/Activation Board).${C.reset}`)
