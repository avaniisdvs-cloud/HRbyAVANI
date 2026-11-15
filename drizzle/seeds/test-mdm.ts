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

// ── Fixed UUIDs for test MDM data ──────────────────────────────────────────

// Legal Entities
const ENTITY_TEST_001 = 'aaaa0001-0000-0000-0000-000000000001'
const ENTITY_TEST_002 = 'aaaa0001-0000-0000-0000-000000000002'
const ENTITY_TEST_003 = 'aaaa0001-0000-0000-0000-000000000003'

// Business Unit
const BU_TEST_001 = 'aaaa0002-0000-0000-0000-000000000001'

// Departments
const DEPT_TEST_001 = 'aaaa0003-0000-0000-0000-000000000001'
const DEPT_TEST_002 = 'aaaa0003-0000-0000-0000-000000000002'
const DEPT_TEST_003 = 'aaaa0003-0000-0000-0000-000000000003'
const DEPT_TEST_004 = 'aaaa0003-0000-0000-0000-000000000004'
const DEPT_TEST_005 = 'aaaa0003-0000-0000-0000-000000000005'
const DEPT_TEST_006 = 'aaaa0003-0000-0000-0000-000000000006'

// Grades
const GRD_TEST_001 = 'aaaa0004-0000-0000-0000-000000000001'
const GRD_TEST_002 = 'aaaa0004-0000-0000-0000-000000000002'
const GRD_TEST_003 = 'aaaa0004-0000-0000-0000-000000000003'
const GRD_TEST_004 = 'aaaa0004-0000-0000-0000-000000000004'
const GRD_TEST_005 = 'aaaa0004-0000-0000-0000-000000000005'

// Locations
const LOC_TEST_001 = 'aaaa0005-0000-0000-0000-000000000001'
const LOC_TEST_002 = 'aaaa0005-0000-0000-0000-000000000002'
const LOC_TEST_003 = 'aaaa0005-0000-0000-0000-000000000003'

// Jobs
const JOB_TEST_001 = 'aaaa0006-0000-0000-0000-000000000001'
const JOB_TEST_002 = 'aaaa0006-0000-0000-0000-000000000002'
const JOB_TEST_003 = 'aaaa0006-0000-0000-0000-000000000003'
const JOB_TEST_004 = 'aaaa0006-0000-0000-0000-000000000004'
const JOB_TEST_005 = 'aaaa0006-0000-0000-0000-000000000005'

// Positions
const POS_TEST_001 = 'aaaa0007-0000-0000-0000-000000000001'
const POS_TEST_002 = 'aaaa0007-0000-0000-0000-000000000002'
const POS_TEST_003 = 'aaaa0007-0000-0000-0000-000000000003'
const POS_TEST_004 = 'aaaa0007-0000-0000-0000-000000000004'
const POS_TEST_005 = 'aaaa0007-0000-0000-0000-000000000005'
const POS_TEST_006 = 'aaaa0007-0000-0000-0000-000000000006'
const POS_TEST_007 = 'aaaa0007-0000-0000-0000-000000000007'
const POS_TEST_008 = 'aaaa0007-0000-0000-0000-000000000008'

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

// ── Seed functions ─────────────────────────────────────────────────────────

async function seedLegalEntities() {
  await db.insert(schema.legalEntities).values([
    {
      id:           ENTITY_TEST_001,
      ...SYS,
      entityCode:   'AVN-TEST-001',
      nameEn:       'AVANIIS Property Dev (Test)',
      nameAr:       'أفانيس (اختبار)',
      entityType:   'MAINLAND',
      jurisdiction: 'Dubai',
      eosbScheme:   'TRADITIONAL',
      isActive:     true,
    },
    {
      id:           ENTITY_TEST_002,
      ...SYS,
      entityCode:   'AVN-TEST-DIFC',
      nameEn:       'AVANIIS DIFC (Test)',
      nameAr:       'أفانيس مركز دبي المالي العالمي (اختبار)',
      entityType:   'DIFC',
      jurisdiction: 'DIFC',
      eosbScheme:   'DEWS',
      isActive:     true,
    },
    {
      id:           ENTITY_TEST_003,
      ...SYS,
      entityCode:   'AVN-TEST-FZ',
      nameEn:       'AVANIIS Free Zone (Test)',
      nameAr:       'أفانيس المنطقة الحرة (اختبار)',
      entityType:   'FREEZONE',
      jurisdiction: 'JAFZA',
      eosbScheme:   'TRADITIONAL',
      isActive:     true,
    },
  ]).onConflictDoNothing()

  return '3 legal entities inserted (or already present)'
}

async function seedBusinessUnit() {
  await db.insert(schema.businessUnits).values([
    {
      id:            BU_TEST_001,
      ...SYS,
      legalEntityId: ENTITY_TEST_001,
      code:          'BU-TEST',
      nameEn:        'AVANIIS Test BU',
      nameAr:        'وحدة الأعمال التجريبية أفانيس',
      isActive:      true,
    },
  ]).onConflictDoNothing()

  return '1 business unit inserted (or already present)'
}

async function seedDepartments() {
  await db.insert(schema.departments).values([
    {
      id:             DEPT_TEST_001,
      ...SYS,
      businessUnitId: BU_TEST_001,
      legalEntityId:  ENTITY_TEST_001,
      code:           'DEPT-TEST-001',
      nameEn:         'Sales & Leasing',
      nameAr:         'التسويق والتأجير',
      departmentType: 'Sales',
      isActive:       true,
    },
    {
      id:             DEPT_TEST_002,
      ...SYS,
      businessUnitId: BU_TEST_001,
      legalEntityId:  ENTITY_TEST_001,
      code:           'DEPT-TEST-002',
      nameEn:         'Finance',
      nameAr:         'المالية',
      departmentType: 'Finance',
      isActive:       true,
    },
    {
      id:             DEPT_TEST_003,
      ...SYS,
      businessUnitId: BU_TEST_001,
      legalEntityId:  ENTITY_TEST_001,
      code:           'DEPT-TEST-003',
      nameEn:         'Human Resources',
      nameAr:         'الموارد البشرية',
      departmentType: 'HR',
      isActive:       true,
    },
    {
      id:             DEPT_TEST_004,
      ...SYS,
      businessUnitId: BU_TEST_001,
      legalEntityId:  ENTITY_TEST_001,
      code:           'DEPT-TEST-004',
      nameEn:         'Information Technology',
      nameAr:         'تقنية المعلومات',
      departmentType: 'IT',
      isActive:       true,
    },
    {
      id:             DEPT_TEST_005,
      ...SYS,
      businessUnitId: BU_TEST_001,
      legalEntityId:  ENTITY_TEST_001,
      code:           'DEPT-TEST-005',
      nameEn:         'Operations',
      nameAr:         'العمليات',
      departmentType: 'Operations',
      isActive:       true,
    },
    {
      id:             DEPT_TEST_006,
      ...SYS,
      businessUnitId: BU_TEST_001,
      legalEntityId:  ENTITY_TEST_001,
      code:           'DEPT-TEST-006',
      nameEn:         'Marketing',
      nameAr:         'التسويق',
      isActive:       true,
    },
  ]).onConflictDoNothing()

  return '6 departments inserted (or already present)'
}

async function seedGrades() {
  await db.insert(schema.grades).values([
    {
      id:               GRD_TEST_001,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      gradeCode:        'GRD-TEST-01',
      gradeNameEn:      'Grade 1',
      gradeNameAr:      'الدرجة الأولى',
      gradeLevel:       1,
      minSalary:        '5000',
      midSalary:        '6000',
      maxSalary:        '7000',
      noticePeriodDays: 30,
      isActive:         true,
    },
    {
      id:               GRD_TEST_002,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      gradeCode:        'GRD-TEST-02',
      gradeNameEn:      'Grade 2',
      gradeNameAr:      'الدرجة الثانية',
      gradeLevel:       2,
      minSalary:        '7000',
      midSalary:        '9000',
      maxSalary:        '11000',
      noticePeriodDays: 30,
      isActive:         true,
    },
    {
      id:               GRD_TEST_003,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      gradeCode:        'GRD-TEST-03',
      gradeNameEn:      'Grade 3',
      gradeNameAr:      'الدرجة الثالثة',
      gradeLevel:       3,
      minSalary:        '11000',
      midSalary:        '14000',
      maxSalary:        '18000',
      noticePeriodDays: 30,
      isActive:         true,
    },
    {
      id:               GRD_TEST_004,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      gradeCode:        'GRD-TEST-04',
      gradeNameEn:      'Grade 4',
      gradeNameAr:      'الدرجة الرابعة',
      gradeLevel:       4,
      minSalary:        '18000',
      midSalary:        '24000',
      maxSalary:        '32000',
      noticePeriodDays: 90,
      isActive:         true,
    },
    {
      id:               GRD_TEST_005,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      gradeCode:        'GRD-TEST-05',
      gradeNameEn:      'Grade 5',
      gradeNameAr:      'الدرجة الخامسة',
      gradeLevel:       5,
      minSalary:        '32000',
      midSalary:        '45000',
      maxSalary:        '65000',
      noticePeriodDays: 90,
      isActive:         true,
    },
  ]).onConflictDoNothing()

  return '5 grades inserted (or already present)'
}

async function seedLocations() {
  await db.insert(schema.locations).values([
    {
      id:            LOC_TEST_001,
      ...SYS,
      legalEntityId: ENTITY_TEST_001,
      code:          'LOC-TEST-001',
      nameEn:        'AVANIIS Tower Business Bay',
      nameAr:        'برج أفانيس بزنس باي',
      addressLine1:  'AVANIIS Tower, Business Bay',
      city:          'Dubai',
      emirate:       'Dubai',
      country:       'ARE',
      timezone:      'Asia/Dubai',
      isActive:      true,
    },
    {
      id:            LOC_TEST_002,
      ...SYS,
      legalEntityId: ENTITY_TEST_001,
      code:          'LOC-TEST-002',
      nameEn:        'DIFC Gate Village',
      nameAr:        'قرية البوابة مركز دبي المالي',
      addressLine1:  'Gate Village, DIFC',
      city:          'Dubai',
      emirate:       'Dubai',
      country:       'ARE',
      timezone:      'Asia/Dubai',
      isActive:      true,
    },
    {
      id:            LOC_TEST_003,
      ...SYS,
      legalEntityId: ENTITY_TEST_001,
      code:          'LOC-TEST-003',
      nameEn:        'JAFZA',
      nameAr:        'منطقة جبل علي الحرة',
      addressLine1:  'Jebel Ali Free Zone',
      city:          'Dubai',
      emirate:       'Dubai',
      country:       'ARE',
      timezone:      'Asia/Dubai',
      isActive:      true,
    },
  ]).onConflictDoNothing()

  return '3 locations inserted (or already present)'
}

async function seedJobs() {
  await db.insert(schema.jobs).values([
    {
      id:                   JOB_TEST_001,
      ...SYS,
      legalEntityId:        ENTITY_TEST_001,
      jobCode:              'JOB-TEST-001',
      jobTitleEn:           'Property Consultant',
      jobTitleAr:           'مستشار عقاري',
      minGradeId:           GRD_TEST_001,
      maxGradeId:           GRD_TEST_003,
      isEmiratisationTarget: false,
      isManagementRole:     false,
      isActive:             true,
    },
    {
      id:                   JOB_TEST_002,
      ...SYS,
      legalEntityId:        ENTITY_TEST_001,
      jobCode:              'JOB-TEST-002',
      jobTitleEn:           'Sales Manager',
      jobTitleAr:           'مدير المبيعات',
      isEmiratisationTarget: true,
      isManagementRole:     true,
      isActive:             true,
    },
    {
      id:                   JOB_TEST_003,
      ...SYS,
      legalEntityId:        ENTITY_TEST_001,
      jobCode:              'JOB-TEST-003',
      jobTitleEn:           'HR Manager',
      jobTitleAr:           'مدير الموارد البشرية',
      isEmiratisationTarget: false,
      isManagementRole:     true,
      isActive:             true,
    },
    {
      id:                   JOB_TEST_004,
      ...SYS,
      legalEntityId:        ENTITY_TEST_001,
      jobCode:              'JOB-TEST-004',
      jobTitleEn:           'Finance Analyst',
      jobTitleAr:           'محلل مالي',
      isEmiratisationTarget: false,
      isManagementRole:     false,
      isActive:             true,
    },
    {
      id:                   JOB_TEST_005,
      ...SYS,
      legalEntityId:        ENTITY_TEST_001,
      jobCode:              'JOB-TEST-005',
      jobTitleEn:           'IT Engineer',
      jobTitleAr:           'مهندس تقنية المعلومات',
      isEmiratisationTarget: false,
      isManagementRole:     false,
      isActive:             true,
    },
  ]).onConflictDoNothing()

  return '5 jobs inserted (or already present)'
}

async function seedPositions() {
  await db.insert(schema.positions).values([
    {
      id:               POS_TEST_001,
      ...SYS,
      departmentId:     DEPT_TEST_001,
      jobId:            JOB_TEST_001,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-001',
      positionTitleEn:  'Property Consultant',
      positionTitleAr:  'مستشار عقاري',
      gradeId:          GRD_TEST_002,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_002,
      ...SYS,
      departmentId:     DEPT_TEST_001,
      jobId:            JOB_TEST_001,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-002',
      positionTitleEn:  'Senior Property Consultant',
      positionTitleAr:  'مستشار عقاري أول',
      gradeId:          GRD_TEST_003,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_003,
      ...SYS,
      departmentId:     DEPT_TEST_001,
      jobId:            JOB_TEST_002,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-003',
      positionTitleEn:  'Sales Manager',
      positionTitleAr:  'مدير المبيعات',
      gradeId:          GRD_TEST_004,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_004,
      ...SYS,
      departmentId:     DEPT_TEST_003,
      jobId:            JOB_TEST_003,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-004',
      positionTitleEn:  'HR Officer',
      positionTitleAr:  'موظف موارد بشرية',
      gradeId:          GRD_TEST_002,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_005,
      ...SYS,
      departmentId:     DEPT_TEST_003,
      jobId:            JOB_TEST_003,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-005',
      positionTitleEn:  'HR Manager',
      positionTitleAr:  'مدير الموارد البشرية',
      gradeId:          GRD_TEST_004,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_006,
      ...SYS,
      departmentId:     DEPT_TEST_002,
      jobId:            JOB_TEST_004,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-006',
      positionTitleEn:  'Finance Analyst',
      positionTitleAr:  'محلل مالي',
      gradeId:          GRD_TEST_003,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_007,
      ...SYS,
      departmentId:     DEPT_TEST_004,
      jobId:            JOB_TEST_005,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-007',
      positionTitleEn:  'IT Engineer',
      positionTitleAr:  'مهندس تقنية المعلومات',
      gradeId:          GRD_TEST_003,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
    {
      id:               POS_TEST_008,
      ...SYS,
      departmentId:     DEPT_TEST_005,
      jobId:            JOB_TEST_002,
      legalEntityId:    ENTITY_TEST_001,
      positionCode:     'POS-TEST-008',
      positionTitleEn:  'Operations Manager',
      positionTitleAr:  'مدير العمليات',
      gradeId:          GRD_TEST_004,
      locationId:       LOC_TEST_001,
      isActive:         true,
      extraData:        {},
    },
  ]).onConflictDoNothing()

  return '8 positions inserted (or already present)'
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.info('\n=== AGENT-1A: MDM Test Data Seed ===\n')

  await run('SEED-1A-001', 'Legal entities seeded',   seedLegalEntities)
  await run('SEED-1A-002', 'Business unit seeded',    seedBusinessUnit)
  await run('SEED-1A-003', 'Departments seeded',      seedDepartments)
  await run('SEED-1A-004', 'Grades seeded',           seedGrades)
  await run('SEED-1A-005', 'Locations seeded',        seedLocations)
  await run('SEED-1A-006', 'Jobs seeded',             seedJobs)
  await run('SEED-1A-007', 'Positions seeded',        seedPositions)

  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length

  console.info(`\n=== Summary: ${pass} passed, ${fail} failed ===\n`)

  const output = {
    agent:     'AGENT-1A',
    category:  'MDM Seed Data',
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
  fs.writeFileSync('/tmp/test_results/AGENT-1A.json', JSON.stringify(output, null, 2))
  console.info('Results written to /tmp/test_results/AGENT-1A.json')

  await client.end()
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
