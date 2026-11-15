import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../schema'
import { TENANT_ID } from '../../lib/constants'

// ── Bootstrap ──────────────────────────────────────────────────────────────

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000002'

const SYS = {
  tenantId:      TENANT_ID,
  createdBy:     SYSTEM_USER_ID,
  createdByName: 'Seed Script',
}

// ── Fixed UUIDs ────────────────────────────────────────────────────────────

// Person UUIDs: dddd0001-0000-0000-0000-00000000000X
const emp = (n: number) =>
  `dddd0001-0000-0000-0000-${String(n).padStart(12, '0')}`

// User Account UUIDs: eeee0001-0000-0000-0000-00000000000X
const ua = (n: number) =>
  `eeee0001-0000-0000-0000-${String(n).padStart(12, '0')}`

// Legal entity refs (seeded by AGENT-1A / test-mdm.ts)
const ENTITY_MAIN = 'aaaa0001-0000-0000-0000-000000000001'
const ENTITY_DIFC = 'aaaa0001-0000-0000-0000-000000000002'

// Encrypted placeholder — AES-256-GCM fields must never store plaintext
const ENC = 'ENCRYPTED_TEST_PLACEHOLDER'

// bcrypt hash of 'TestPass2026!' — stored on the person record for reference
// (schema note: userAccounts is SSO-based; LOCAL provider used for test accounts)
// const TEST_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LpMwobiT6Yi'

// ── Result tracking ────────────────────────────────────────────────────────

interface TestResult {
  id: string
  name: string
  status: 'PASS' | 'FAIL'
  detail: string
}

const results: TestResult[] = []

async function run(id: string, name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn()
    results.push({ id, name, status: 'PASS', detail })
    console.info(`  [PASS] ${name} — ${detail}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    results.push({ id, name, status: 'FAIL', detail: msg })
    console.error(`  [FAIL] ${name} — ${msg}`)
  }
}

// ── Seed: Persons ──────────────────────────────────────────────────────────

async function seedPersons() {
  // EMP-TEST-001: Mohammed Al Rashidi
  await run('SEED-1D-EMP-001', 'Insert person EMP-TEST-001 (Mohammed Al Rashidi)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(1),
      ...SYS,
      personNumber:        'AVN-T000001',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Mohammed',
      lastNameEn:          'Al Rashidi',
      fullNameEn:          'Mohammed Al Rashidi',
      fullNameAr:          'محمد الراشدي',
      dateOfBirth:         '1990-03-15',
      gender:              'MALE',
      nationalityCode:     'ARE',
      nationalityCategory: 'UAE_NATIONAL',
      emiratesId:          ENC,
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2022-01-01',
      probationEndDate:    '2022-07-01',
      noticePeriodDays:    90,
      basicSalary:         '18000',
      totalPackage:        '25000',
    }).onConflictDoNothing()
    return 'emp(1) inserted or already present'
  })

  // EMP-TEST-002: Sarah Ahmed Al Mansouri
  await run('SEED-1D-EMP-002', 'Insert person EMP-TEST-002 (Sarah Ahmed Al Mansouri)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(2),
      ...SYS,
      personNumber:        'AVN-T000002',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Sarah Ahmed',
      lastNameEn:          'Al Mansouri',
      fullNameEn:          'Sarah Ahmed Al Mansouri',
      fullNameAr:          'سارة أحمد المنصوري',
      dateOfBirth:         '1995-06-20',
      gender:              'FEMALE',
      nationalityCode:     'ARE',
      nationalityCategory: 'UAE_NATIONAL',
      emiratesId:          ENC,
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2021-06-01',
      noticePeriodDays:    30,
      basicSalary:         '16000',
      totalPackage:        '21500',
    }).onConflictDoNothing()
    return 'emp(2) inserted or already present'
  })

  // EMP-TEST-003: John Smith
  await run('SEED-1D-EMP-003', 'Insert person EMP-TEST-003 (John Smith)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(3),
      ...SYS,
      personNumber:        'AVN-T000003',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'John',
      lastNameEn:          'Smith',
      fullNameEn:          'John Smith',
      fullNameAr:          'جون سميث',
      dateOfBirth:         '1988-11-10',
      gender:              'MALE',
      nationalityCode:     'GBR',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      passportExpiry:      '2026-06-30',
      visaExpiry:          '2026-07-15',
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2023-03-01',
      noticePeriodDays:    30,
      basicSalary:         '12000',
      totalPackage:        '16000',
    }).onConflictDoNothing()
    return 'emp(3) inserted or already present'
  })

  // EMP-TEST-004: Fatima Al Zaabi
  await run('SEED-1D-EMP-004', 'Insert person EMP-TEST-004 (Fatima Al Zaabi)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(4),
      ...SYS,
      personNumber:        'AVN-T000004',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Fatima',
      lastNameEn:          'Al Zaabi',
      fullNameEn:          'Fatima Al Zaabi',
      fullNameAr:          'فاطمة الزعابي',
      dateOfBirth:         '1992-09-05',
      gender:              'FEMALE',
      nationalityCode:     'ARE',
      nationalityCategory: 'UAE_NATIONAL',
      emiratesId:          ENC,
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2024-05-01',
      probationEndDate:    '2024-11-01',
      noticePeriodDays:    30,
      numberOfDependents:  2,
      basicSalary:         '8000',
      totalPackage:        '11000',
    }).onConflictDoNothing()
    return 'emp(4) inserted or already present'
  })

  // EMP-TEST-005: Raj Kumar Patel
  await run('SEED-1D-EMP-005', 'Insert person EMP-TEST-005 (Raj Kumar Patel)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(5),
      ...SYS,
      personNumber:        'AVN-T000005',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Raj Kumar',
      lastNameEn:          'Patel',
      fullNameEn:          'Raj Kumar Patel',
      fullNameAr:          'راج كومار باتيل',
      dateOfBirth:         '1985-04-22',
      gender:              'MALE',
      nationalityCode:     'IND',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2020-01-15',
      noticePeriodDays:    30,
      basicSalary:         '11000',
      totalPackage:        '14500',
    }).onConflictDoNothing()
    return 'emp(5) inserted or already present'
  })

  // EMP-TEST-006: Aisha Binti Abdullah
  await run('SEED-1D-EMP-006', 'Insert person EMP-TEST-006 (Aisha Binti Abdullah)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(6),
      ...SYS,
      personNumber:        'AVN-T000006',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Aisha Binti',
      lastNameEn:          'Abdullah',
      fullNameEn:          'Aisha Binti Abdullah',
      fullNameAr:          'عائشة بنت عبدالله',
      dateOfBirth:         '1993-12-01',
      gender:              'FEMALE',
      nationalityCode:     'MYS',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2025-11-01',
      noticePeriodDays:    30,
      basicSalary:         '7500',
      totalPackage:        '9800',
    }).onConflictDoNothing()
    return 'emp(6) inserted or already present'
  })

  // EMP-TEST-007: Carlos Rodriguez
  await run('SEED-1D-EMP-007', 'Insert person EMP-TEST-007 (Carlos Rodriguez)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(7),
      ...SYS,
      personNumber:        'AVN-T000007',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Carlos',
      lastNameEn:          'Rodriguez',
      fullNameEn:          'Carlos Rodriguez',
      fullNameAr:          'كارلوس رودريغيز',
      dateOfBirth:         '1980-07-15',
      gender:              'MALE',
      nationalityCode:     'ESP',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2019-03-01',
      noticePeriodDays:    30,
      basicSalary:         '20000',
      totalPackage:        '28000',
    }).onConflictDoNothing()
    return 'emp(7) inserted or already present'
  })

  // EMP-TEST-008: Nour Al Hashimi
  await run('SEED-1D-EMP-008', 'Insert person EMP-TEST-008 (Nour Al Hashimi)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(8),
      ...SYS,
      personNumber:        'AVN-T000008',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Nour',
      lastNameEn:          'Al Hashimi',
      fullNameEn:          'Nour Al Hashimi',
      fullNameAr:          'نور الهاشمي',
      dateOfBirth:         '1997-02-28',
      gender:              'FEMALE',
      nationalityCode:     'JOR',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2025-01-01',
      noticePeriodDays:    30,
      basicSalary:         '6000',
      totalPackage:        '8300',
    }).onConflictDoNothing()
    return 'emp(8) inserted or already present'
  })

  // EMP-TEST-009: Ahmed Hassan Ibrahim (DIFC entity)
  await run('SEED-1D-EMP-009', 'Insert person EMP-TEST-009 (Ahmed Hassan Ibrahim)', async () => {
    // EMP-009 uses DIFC legal entity seeded by AGENT-1A (test-mdm.ts)
    // If ENTITY_DIFC doesn't exist yet, this insert will fail FK constraint — caught above
    await db.insert(schema.persons).values({
      id:                  emp(9),
      ...SYS,
      personNumber:        'AVN-T000009',
      legalEntityId:       ENTITY_DIFC,
      firstNameEn:         'Ahmed Hassan',
      lastNameEn:          'Ibrahim',
      fullNameEn:          'Ahmed Hassan Ibrahim',
      fullNameAr:          'أحمد حسن إبراهيم',
      dateOfBirth:         '1991-05-19',
      gender:              'MALE',
      nationalityCode:     'EGY',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2023-06-01',
      noticePeriodDays:    30,
      basicSalary:         '9000',
      totalPackage:        '12000',
    }).onConflictDoNothing()
    return 'emp(9) inserted or already present (DIFC entity)'
  })

  // EMP-TEST-010: Priya Nair
  await run('SEED-1D-EMP-010', 'Insert person EMP-TEST-010 (Priya Nair)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(10),
      ...SYS,
      personNumber:        'AVN-T000010',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Priya',
      lastNameEn:          'Nair',
      fullNameEn:          'Priya Nair',
      fullNameAr:          'بريا ناير',
      dateOfBirth:         '1990-08-30',
      gender:              'FEMALE',
      nationalityCode:     'IND',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2022-09-01',
      noticePeriodDays:    30,
      basicSalary:         '12000',
      totalPackage:        '16000',
    }).onConflictDoNothing()
    return 'emp(10) inserted or already present'
  })

  // EMP-TEST-011: Khalid Mohammed Al Naqbi (reports to EMP-001)
  await run('SEED-1D-EMP-011', 'Insert person EMP-TEST-011 (Khalid Mohammed Al Naqbi)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(11),
      ...SYS,
      personNumber:        'AVN-T000011',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Khalid Mohammed',
      lastNameEn:          'Al Naqbi',
      fullNameEn:          'Khalid Mohammed Al Naqbi',
      fullNameAr:          'خالد محمد النقبي',
      dateOfBirth:         '1988-01-10',
      gender:              'MALE',
      nationalityCode:     'ARE',
      nationalityCategory: 'UAE_NATIONAL',
      emiratesId:          ENC,
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2021-01-01',
      noticePeriodDays:    30,
      lineManagerId:       emp(1),
      basicSalary:         '14000',
      totalPackage:        '19500',
    }).onConflictDoNothing()
    return 'emp(11) inserted or already present'
  })

  // EMP-TEST-012: Ana Silva
  await run('SEED-1D-EMP-012', 'Insert person EMP-TEST-012 (Ana Silva)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(12),
      ...SYS,
      personNumber:        'AVN-T000012',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Ana',
      lastNameEn:          'Silva',
      fullNameEn:          'Ana Silva',
      fullNameAr:          'آنا سيلفا',
      dateOfBirth:         '1994-03-25',
      gender:              'FEMALE',
      nationalityCode:     'PRT',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2023-01-01',
      noticePeriodDays:    30,
      basicSalary:         '15000',
      totalPackage:        '20500',
    }).onConflictDoNothing()
    return 'emp(12) inserted or already present'
  })

  // EMP-TEST-013: Omar Haddad (SUSPENDED)
  await run('SEED-1D-EMP-013', 'Insert person EMP-TEST-013 (Omar Haddad)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(13),
      ...SYS,
      personNumber:        'AVN-T000013',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Omar',
      lastNameEn:          'Haddad',
      fullNameEn:          'Omar Haddad',
      fullNameAr:          'عمر حداد',
      dateOfBirth:         '1986-11-05',
      gender:              'MALE',
      nationalityCode:     'LBN',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'SUSPENDED',
      hireDate:            '2020-06-01',
      noticePeriodDays:    30,
      basicSalary:         '17000',
      totalPackage:        '24000',
    }).onConflictDoNothing()
    return 'emp(13) inserted or already present (SUSPENDED)'
  })

  // EMP-TEST-014: Lindiwe Dlamini
  await run('SEED-1D-EMP-014', 'Insert person EMP-TEST-014 (Lindiwe Dlamini)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(14),
      ...SYS,
      personNumber:        'AVN-T000014',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Lindiwe',
      lastNameEn:          'Dlamini',
      fullNameEn:          'Lindiwe Dlamini',
      fullNameAr:          'ليندي دلاميني',
      dateOfBirth:         '1992-07-14',
      gender:              'FEMALE',
      nationalityCode:     'ZAF',
      nationalityCategory: 'EXPAT',
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2025-05-01',
      probationEndDate:    '2025-11-01',
      noticePeriodDays:    30,
      basicSalary:         '8000',
      totalPackage:        '11000',
    }).onConflictDoNothing()
    return 'emp(14) inserted or already present'
  })

  // EMP-TEST-015: Yusuf Al Rahman (HR Director / senior)
  await run('SEED-1D-EMP-015', 'Insert person EMP-TEST-015 (Yusuf Al Rahman)', async () => {
    await db.insert(schema.persons).values({
      id:                  emp(15),
      ...SYS,
      personNumber:        'AVN-T000015',
      legalEntityId:       ENTITY_MAIN,
      firstNameEn:         'Yusuf',
      lastNameEn:          'Al Rahman',
      fullNameEn:          'Yusuf Al Rahman',
      fullNameAr:          'يوسف الرحمان',
      dateOfBirth:         '1975-09-20',
      gender:              'MALE',
      nationalityCode:     'ARE',
      nationalityCategory: 'UAE_NATIONAL',
      emiratesId:          ENC,
      passportNumber:      ENC,
      employmentType:      'FULL_TIME',
      assignmentStatus:    'ACTIVE',
      hireDate:            '2018-01-01',
      noticePeriodDays:    90,
      basicSalary:         '45000',
      totalPackage:        '60000',
    }).onConflictDoNothing()
    return 'emp(15) inserted or already present'
  })
}

// ── Seed: User Accounts ────────────────────────────────────────────────────

async function seedUserAccounts() {
  // Roles per spec:
  // 001 = LINE_MANAGER, 002 = HR_ADMIN, 003-014 = EMPLOYEE, 015 = HR_DIRECTOR

  const accounts: Array<{
    n: number
    email: string
    role: string
    entityId: string
  }> = [
    { n: 1,  email: 'emp-test-001@avaniis-test.com', role: 'LINE_MANAGER',  entityId: ENTITY_MAIN },
    { n: 2,  email: 'emp-test-002@avaniis-test.com', role: 'HR_ADMIN',      entityId: ENTITY_MAIN },
    { n: 3,  email: 'emp-test-003@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 4,  email: 'emp-test-004@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 5,  email: 'emp-test-005@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 6,  email: 'emp-test-006@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 7,  email: 'emp-test-007@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 8,  email: 'emp-test-008@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 9,  email: 'emp-test-009@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_DIFC },
    { n: 10, email: 'emp-test-010@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 11, email: 'emp-test-011@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 12, email: 'emp-test-012@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 13, email: 'emp-test-013@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 14, email: 'emp-test-014@avaniis-test.com', role: 'EMPLOYEE',      entityId: ENTITY_MAIN },
    { n: 15, email: 'emp-test-015@avaniis-test.com', role: 'HR_DIRECTOR',   entityId: ENTITY_MAIN },
  ]

  for (const acc of accounts) {
    const padded = String(acc.n).padStart(3, '0')
    await run(
      `SEED-1D-UA-${padded}`,
      `Insert user account for emp-test-${padded}@avaniis-test.com`,
      async () => {
        await db.insert(schema.userAccounts).values({
          id:                 ua(acc.n),
          ...SYS,
          personId:           emp(acc.n),
          primaryEmail:       acc.email,
          primarySsoProvider: 'LOCAL',
          avaniisRole:        acc.role,
          primaryEntityId:    acc.entityId,
          allowedEntityIds:   [acc.entityId],
          mfaEnrolled:        false,
          isActive:           true,
        }).onConflictDoNothing()
        return `${acc.email} (${acc.role}) inserted or already present`
      },
    )
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.info('\n=== AGENT-1D: Test Employees Seed ===\n')

  await seedPersons()
  await seedUserAccounts()

  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length

  console.info(`\n=== Summary: ${pass} passed, ${fail} failed ===\n`)

  const output = {
    agent:     'AGENT-1D',
    category:  'Test Employees',
    timestamp: new Date().toISOString(),
    tests:     results,
    summary: {
      total: results.length,
      pass,
      fail,
      skip: 0,
      warn: 0,
    },
  }

  const fs = await import('fs')
  fs.mkdirSync('/tmp/test_results', { recursive: true })
  fs.writeFileSync('/tmp/test_results/AGENT-1D.json', JSON.stringify(output, null, 2))
  console.info('Results written to /tmp/test_results/AGENT-1D.json')

  await client.end()
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
