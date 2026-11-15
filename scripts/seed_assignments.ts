/**
 * Seed script — worker_assignments + absence_balances for dev/test.
 * Run once: pnpm tsx scripts/seed_assignments.ts
 *
 * Creates:
 *   1. One active worker_assignment per person (is_current = true)
 *   2. 2026 absence_balances for KPD007 (ANNUAL + SICK)
 */
import postgres from 'postgres'
import { randomUUID } from 'crypto'

const sql = postgres('postgresql://avaniis:avaniis_dev@localhost:5433/avaniis_hr', { max: 1 })

const TENANT      = '00000000-0000-0000-0000-000000000001'
const ENTITY      = 'aaaa0001-0000-0000-0000-000000000001'  // AVANIIS Property Dev (Test)
const TODAY       = '2026-05-13'
const CREATED_BY  = '22222222-2222-2222-2222-222222222222'  // System Admin

// Departments
const DEPT_DIGITAL    = '9efe523b-14d3-45f2-aa57-1cf677668feb'
const DEPT_HC         = 'c98979f8-9b5e-40a7-8c0b-5fc436df470d'  // Human Capital
const DEPT_COMMERCIAL = '6beeec0b-fa9c-449b-8c2f-ce058d246edd'
const DEPT_FINANCE    = '877d1076-958c-4650-b241-f9d82b2013c4'
const DEPT_OPERATIONS = '694af8af-8444-4c9a-a47b-b1ecb8f6efbd'
const DEPT_PROJECTS   = '6ec73bbe-3177-4df1-a03e-87ce0c2e5226'

// Person IDs
const P_SYSADMIN  = '22222222-2222-2222-2222-222222222222'  // AVN-000001 System Admin
const P_KPD001    = '88d8ef5c-d1b2-44a4-ae3b-c5b014d1fa6b'
const P_KPD002    = 'd2a47246-95bb-4b36-a970-4c278d9a6910'
const P_KPD003    = '9285042e-309c-4773-b5f3-c0c9e91b73a4'
const P_KPD004    = 'a0de6914-0610-4db1-89c1-2083057a0279'  // Dorababu Kethari — MANAGER
const P_KPD005    = '5bd7fdce-f945-4949-bf30-02ea5aeaebf4'
const P_KPD006    = 'd542984e-8e57-48e0-ac45-3126b0c731f9'
const P_KPD007    = 'bd2c0410-6602-4c40-99ba-760ba1c5dc09'  // Mahendra Boyila — EMPLOYEE

// Absence type IDs
const TYPE_ANNUAL = '97ee54dc-48cc-45bc-b2fa-cf3ac2f8fd73'
const TYPE_SICK   = '8a888888-9469-4218-b110-d170e9742f79'

type Assignment = {
  personId:     string
  deptId:       string
  managerId:    string | null
  jobTitle:     string
  assignNum:    string
}

const assignments: Assignment[] = [
  { personId: P_SYSADMIN, deptId: DEPT_DIGITAL,    managerId: null,     jobTitle: 'System Administrator',          assignNum: 'ASG-001' },
  { personId: P_KPD001,   deptId: DEPT_OPERATIONS,  managerId: P_KPD004, jobTitle: 'Contingent Worker',             assignNum: 'ASG-002' },
  { personId: P_KPD002,   deptId: DEPT_PROJECTS,    managerId: P_KPD004, jobTitle: 'Project Manager',               assignNum: 'ASG-003' },
  { personId: P_KPD003,   deptId: DEPT_COMMERCIAL,  managerId: P_KPD004, jobTitle: 'Commercial Manager',            assignNum: 'ASG-004' },
  { personId: P_KPD004,   deptId: DEPT_DIGITAL,     managerId: P_SYSADMIN, jobTitle: 'Technology Director',         assignNum: 'ASG-005' },
  { personId: P_KPD005,   deptId: DEPT_HC,          managerId: P_KPD004, jobTitle: 'HR Business Partner',           assignNum: 'ASG-006' },
  { personId: P_KPD006,   deptId: DEPT_FINANCE,     managerId: P_KPD004, jobTitle: 'Finance Analyst',               assignNum: 'ASG-007' },
  { personId: P_KPD007,   deptId: DEPT_DIGITAL,     managerId: P_KPD004, jobTitle: 'Software Engineer',             assignNum: 'ASG-008' },
]

async function main() {
  console.log('--- Seeding worker_assignments ---')

  for (const a of assignments) {
    const id = randomUUID()
    await sql`
      INSERT INTO worker_assignments (
        id, tenant_id, person_id, legal_entity_id,
        assignment_number, effective_start_date, assignment_status,
        department_id, line_manager_id,
        is_current, employment_type,
        action_type, action_reason, action_initiated_by,
        created_by, created_by_name, created_date
      ) VALUES (
        ${id}, ${TENANT}, ${a.personId}, ${ENTITY},
        ${a.assignNum}, ${TODAY}, 'ACTIVE',
        ${a.deptId}, ${a.managerId},
        true, 'FULL_TIME',
        'HIRE', 'Initial assignment', ${CREATED_BY},
        ${CREATED_BY}, 'System Seed', NOW()
      )
      ON CONFLICT DO NOTHING
    `
    console.log(`  ✓ ${a.assignNum} — ${a.personId} → dept ${a.deptId}, manager ${a.managerId ?? 'none'}`)
  }

  console.log('\n--- Seeding absence_balances (2026) for KPD007 ---')

  // ANNUAL leave: 2.5 days/month × 5 months elapsed = 12.5 days accrued (UAE Art 29)
  await sql`
    INSERT INTO absence_balances (
      id, tenant_id, person_id, legal_entity_id, absence_type_id,
      balance_year, opening_balance_days, accrued_days,
      taken_days, pending_days, adjusted_days,
      carried_forward_days, forfeited_days, closing_balance_days,
      created_by, created_by_name
    ) VALUES (
      ${randomUUID()}, ${TENANT}, ${P_KPD007}, ${ENTITY}, ${TYPE_ANNUAL},
      2026, 0, 12.5,
      0, 0, 0,
      0, 0, 12.5,
      ${CREATED_BY}, 'System Seed'
    )
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ ANNUAL leave balance — 12.5 days available')

  // SICK leave: 15 full-pay days (UAE Art 31, first 15 days)
  await sql`
    INSERT INTO absence_balances (
      id, tenant_id, person_id, legal_entity_id, absence_type_id,
      balance_year, opening_balance_days, accrued_days,
      taken_days, pending_days, adjusted_days,
      carried_forward_days, forfeited_days, closing_balance_days,
      created_by, created_by_name
    ) VALUES (
      ${randomUUID()}, ${TENANT}, ${P_KPD007}, ${ENTITY}, ${TYPE_SICK},
      2026, 0, 15,
      0, 0, 0,
      0, 0, 15,
      ${CREATED_BY}, 'System Seed'
    )
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ SICK leave balance — 15 days available')

  console.log('\nDone.')
  await sql.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
