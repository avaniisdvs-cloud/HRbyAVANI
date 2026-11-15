/**
 * seed-dev.ts — Master dev seed orchestrator
 *
 * Runs every seed in dependency order. Fully idempotent — safe to re-run
 * after any database cleanup or migration reset without data loss.
 *
 * Usage (after any DB cleanup):
 *   pnpm db:seed:dev
 *
 * What it restores:
 *   1. Core MDM        — legal entities, grades, depts, positions, jobs, locations,
 *                        work schedules, holidays, absence types, leave rules,
 *                        compliance rules, workflows, form configs, ARIA config, etc.
 *   2. Test MDM        — AVN-TEST-001/002/003 entities, departments, positions (8 nodes)
 *   3. Test schedules  — work schedule patterns + public holidays
 *   4. Test leave      — absence plan + enrolments
 *   5. Test employees  — Talal Al Gaddah (AVN-TEST-001-000001) + worker assignment
 *   6. Test workflows  — backdated hire workflow definition
 *   7. Letter types    — 8 letter template types + 20 field tokens + default PCL template
 *   8. Dev accounts    — user_accounts for all 7 demo logins (needed for ARIA widget
 *                        and workflow actor resolution)
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { execSync } from 'child_process'
import path from 'path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, and } from 'drizzle-orm'
import * as schema from '../schema'
import { TENANT_ID } from '../../lib/constants'

// ── DB client ─────────────────────────────────────────────────────────────────

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..')

function step(label: string) {
  console.info(`\n${'─'.repeat(56)}`)
  console.info(`▶  ${label}`)
  console.info('─'.repeat(56))
}

function runSeed(scriptPath: string) {
  execSync(`pnpm tsx ${scriptPath}`, {
    cwd:   ROOT,
    stdio: 'inherit',
    env:   { ...process.env },
  })
}

// ── Step 8: seed dev user_accounts ────────────────────────────────────────────
//
// Links all 7 hardcoded dev-credentials accounts to the System Administrator
// person (22222222-...) so that:
//   • session.user.personId is populated after login
//   • ARIA widget renders
//   • Workflow actor UUIDs resolve to a real persons.id

const SYSTEM_ADMIN_PERSON_ID = '22222222-2222-2222-2222-222222222222'
const ENTITY_MAIN             = '11111111-1111-1111-1111-111111111111'
const ENTITY_TEST_001         = 'aaaa0001-0000-0000-0000-000000000001'

interface DevAccount {
  id:              string
  email:           string
  role:            string
  primaryEntityId: string
  allowedEntities: string[]
}

const DEV_ACCOUNTS: DevAccount[] = [
  {
    id:              'ua000001-0000-0000-0000-000000000001',
    email:           'super.admin@avaniis.dev',
    role:            'SUPER_ADMIN',
    primaryEntityId: ENTITY_TEST_001,
    allowedEntities: [ENTITY_TEST_001, ENTITY_MAIN],
  },
  {
    id:              'ua000001-0000-0000-0000-000000000002',
    email:           'hr.admin@avaniis.dev',
    role:            'HR_ADMIN',
    primaryEntityId: ENTITY_MAIN,
    allowedEntities: [ENTITY_MAIN],
  },
  {
    id:              'ua000001-0000-0000-0000-000000000003',
    email:           'hr.director@avaniis.dev',
    role:            'HR_DIRECTOR',
    primaryEntityId: ENTITY_MAIN,
    allowedEntities: [ENTITY_MAIN],
  },
  {
    id:              'ua000001-0000-0000-0000-000000000004',
    email:           'payroll@avaniis.dev',
    role:            'PAYROLL_ADMIN',
    primaryEntityId: ENTITY_MAIN,
    allowedEntities: [ENTITY_MAIN],
  },
  {
    id:              'ua000001-0000-0000-0000-000000000005',
    email:           'manager@avaniis.dev',
    role:            'MANAGER',
    primaryEntityId: ENTITY_MAIN,
    allowedEntities: [ENTITY_MAIN],
  },
  {
    id:              'ua000001-0000-0000-0000-000000000006',
    email:           'employee@avaniis.dev',
    role:            'EMPLOYEE',
    primaryEntityId: ENTITY_MAIN,
    allowedEntities: [ENTITY_MAIN],
  },
  {
    id:              'ua000001-0000-0000-0000-000000000007',
    email:           'finance@avaniis.dev',
    role:            'FINANCE',
    primaryEntityId: ENTITY_MAIN,
    allowedEntities: [ENTITY_MAIN],
  },
]

async function seedDevAccounts() {
  let inserted = 0
  let skipped  = 0

  for (const acc of DEV_ACCOUNTS) {
    const [existing] = await db
      .select({ id: schema.userAccounts.id })
      .from(schema.userAccounts)
      .where(and(
        eq(schema.userAccounts.tenantId,     TENANT_ID),
        eq(schema.userAccounts.primaryEmail, acc.email),
      ))
      .limit(1)

    if (existing) {
      skipped++
      continue
    }

    await db.insert(schema.userAccounts).values({
      id:                acc.id,
      tenantId:          TENANT_ID,
      personId:          SYSTEM_ADMIN_PERSON_ID,
      primaryEmail:      acc.email,
      primarySsoProvider: 'LOCAL',
      avaniisRole:       acc.role,
      allowedEntityIds:  acc.allowedEntities,
      primaryEntityId:   acc.primaryEntityId,
      createdBy:         SYSTEM_ADMIN_PERSON_ID,
      createdByName:     'Seed Script',
      isActive:          true,
    })
    inserted++
    console.info(`  [OK] ${acc.email} (${acc.role})`)
  }

  if (skipped > 0) {
    console.info(`  ${skipped} account(s) already present — skipped`)
  }
  console.info(`  ${inserted} account(s) inserted`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.info('\n╔══════════════════════════════════════════════════════╗')
  console.info('║          AVANIIS HR — Dev Seed Orchestrator          ║')
  console.info('╚══════════════════════════════════════════════════════╝\n')
  console.info('  Run after any DB cleanup / migration reset.')
  console.info('  All steps are idempotent — safe to run multiple times.\n')

  try {
    // ── 1. Core MDM (legal entities, grades, depts, positions, jobs, etc.) ──
    step('1/8  Core MDM seed  (drizzle/seed.ts)')
    runSeed('drizzle/seed.ts')

    // ── 2. Test MDM entities (AVN-TEST-001/002/003) ──────────────────────────
    step('2/8  Test MDM seed  (seeds/test-mdm.ts)')
    runSeed('drizzle/seeds/test-mdm.ts')

    // ── 3. Work schedules + public holidays ──────────────────────────────────
    step('3/8  Work schedules  (seeds/test-schedules.ts)')
    runSeed('drizzle/seeds/test-schedules.ts')

    // ── 4. Leave plans + enrolments ──────────────────────────────────────────
    step('4/8  Leave plans  (seeds/test-leave.ts)')
    runSeed('drizzle/seeds/test-leave.ts')

    // ── 5. Test employees (Talal Al Gaddah + worker assignment) ──────────────
    step('5/8  Test employees  (seeds/test-employees.ts)')
    runSeed('drizzle/seeds/test-employees.ts')

    // ── 6. Backdated hire workflow definition ─────────────────────────────────
    step('6/8  Test workflows  (seeds/test-workflows.ts)')
    runSeed('drizzle/seeds/test-workflows.ts')

    // ── 7. Letter template types + field tokens ───────────────────────────────
    step('7/8  Letter templates  (seeds/employee-letters-seed.ts)')
    runSeed('drizzle/seeds/employee-letters-seed.ts')

    // ── 8. Dev user_accounts (ARIA + workflow actor resolution) ──────────────
    step('8/8  Dev user accounts  (user_accounts)')
    await seedDevAccounts()

    // ── Done ──────────────────────────────────────────────────────────────────
    console.info('\n╔══════════════════════════════════════════════════════╗')
    console.info('║  ✅  All 8 seed steps complete — DB is ready         ║')
    console.info('╠══════════════════════════════════════════════════════╣')
    console.info('║  Next steps:                                         ║')
    console.info('║  1. Restart the dev server  (pnpm dev --port 3003)   ║')
    console.info('║  2. Sign out + sign back in to refresh your JWT      ║')
    console.info('║  3. All 7 demo logins are ready (password: demo)     ║')
    console.info('╚══════════════════════════════════════════════════════╝\n')
  } catch (err) {
    console.error('\n❌  Seed failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
