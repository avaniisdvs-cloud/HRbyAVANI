import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
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

// ── IDs ────────────────────────────────────────────────────────────────────

const LEGAL_ENTITY_UAE    = 'aaaa0001-0000-0000-0000-000000000001'
const LEGAL_ENTITY_DIFC   = 'aaaa0001-0000-0000-0000-000000000002'

const ABSENCE_PLAN_ID     = 'cccc0001-0000-0000-0000-000000000001'

const atId = (n: number) => `cccc0002-0000-0000-0000-${String(n).padStart(12, '0')}`

// ── Seed absence plan ──────────────────────────────────────────────────────

async function seedAbsencePlan() {
  await db.insert(schema.absencePlans).values({
    id:                       ABSENCE_PLAN_ID,
    ...SYS,
    legalEntityId:            LEGAL_ENTITY_UAE,
    planCode:                 'AP-TEST-UAE-MAINLAND',
    planNameEn:               'UAE Mainland Leave Plan (Test)',
    planNameAr:               'خطة الإجازات الإماراتية (اختبار)',
    accrualMethod:            'CALENDAR_YEAR',
    carryForwardMaxDays:      '30',
    carryForwardExpiryMonths: 3,
    allowNegativeBalance:     false,
    isActive:                 true,
  }).onConflictDoNothing()

  console.info('  absence plan seeded (or already existed)')
}

// ── Seed absence types ─────────────────────────────────────────────────────

async function seedAbsenceTypes(difcEntityExists: boolean) {
  const baseTypes = [
    // AT-001: Annual Leave
    {
      id:               atId(1),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'ALT-TEST',
      typeNameEn:       'Annual Leave (Test)',
      typeNameAr:       'إجازة سنوية',
      isStatutory:      true,
      isPaid:           'FULL_PAY',
      maxDaysPerYear:   '30',
      approvalRequired: true,
      isActive:         true,
    },
    // AT-002: Sick Leave
    {
      id:                    atId(2),
      ...SYS,
      legalEntityId:         LEGAL_ENTITY_UAE,
      absencePlanId:         ABSENCE_PLAN_ID,
      typeCode:              'SLT-TEST',
      typeNameEn:            'Sick Leave (Test)',
      typeNameAr:            'إجازة مرضية',
      isStatutory:           true,
      isPaid:                'TIERED',
      requiresMedicalCert:   true,
      certRequiredAfterDays: 3,
      maxDaysPerYear:        '90',
      isActive:              true,
    },
    // AT-003: Maternity Leave
    {
      id:                    atId(3),
      ...SYS,
      legalEntityId:         LEGAL_ENTITY_UAE,
      absencePlanId:         ABSENCE_PLAN_ID,
      typeCode:              'MLT-TEST',
      typeNameEn:            'Maternity Leave (Test)',
      typeNameAr:            'إجازة أمومة',
      isStatutory:           true,
      isPaid:                'TIERED',
      genderRestriction:     'FEMALE',
      requiresMedicalCert:   true,
      maxDaysPerYear:        '60',
      isActive:              true,
    },
    // AT-004: Paternity Leave
    {
      id:               atId(4),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'PLT-TEST',
      typeNameEn:       'Paternity Leave (Test)',
      typeNameAr:       'إجازة أبوة',
      isStatutory:      true,
      isPaid:           'FULL_PAY',
      genderRestriction:'MALE',
      maxDaysPerYear:   '5',
      isActive:         true,
    },
    // AT-005: Hajj Leave
    {
      id:                      atId(5),
      ...SYS,
      legalEntityId:           LEGAL_ENTITY_UAE,
      absencePlanId:           ABSENCE_PLAN_ID,
      typeCode:                'HJT-TEST',
      typeNameEn:              'Hajj Leave (Test)',
      typeNameAr:              'إجازة الحج',
      isStatutory:             true,
      isPaid:                  'NO_PAY',
      religionRestriction:     'MUSLIM',
      maxDaysPerYear:          '30',
      isOneTimePerEmployment:  true,
      isActive:                true,
    },
    // AT-006: Bereavement Leave
    {
      id:               atId(6),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'BVT-TEST',
      typeNameEn:       'Bereavement Leave (Test)',
      typeNameAr:       'إجازة الوفاة',
      isStatutory:      true,
      isPaid:           'FULL_PAY',
      maxDaysPerYear:   '5',
      isActive:         true,
    },
    // AT-007: Study Leave
    {
      id:               atId(7),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'STL-TEST',
      typeNameEn:       'Study Leave (Test)',
      typeNameAr:       'إجازة دراسية',
      isStatutory:      false,
      isPaid:           'FULL_PAY',
      maxDaysPerYear:   '10',
      approvalRequired: true,
      isActive:         true,
    },
    // AT-008: Unpaid Leave
    {
      id:               atId(8),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'UPL-TEST',
      typeNameEn:       'Unpaid Leave (Test)',
      typeNameAr:       'إجازة بدون راتب',
      isStatutory:      false,
      isPaid:           'NO_PAY',
      maxDaysPerYear:   '90',
      approvalRequired: true,
      isActive:         true,
    },
    // AT-009: Compensatory Leave
    {
      id:               atId(9),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'CLT-TEST',
      typeNameEn:       'Compensatory Leave (Test)',
      typeNameAr:       'إجازة تعويضية',
      isStatutory:      false,
      isPaid:           'FULL_PAY',
      approvalRequired: true,
      isActive:         true,
    },
    // AT-010: Emergency Leave
    {
      id:               atId(10),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_UAE,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'EML-TEST',
      typeNameEn:       'Emergency Leave (Test)',
      typeNameAr:       'إجازة طارئة',
      isStatutory:      false,
      isPaid:           'FULL_PAY',
      maxDaysPerYear:   '3',
      approvalRequired: false,
      isActive:         true,
    },
  ]

  await db.insert(schema.absenceTypes).values(baseTypes).onConflictDoNothing()
  console.info(`  ${baseTypes.length} absence types seeded (or already existed)`)

  // AT-011: DIFC Annual Leave — only if DIFC legal entity exists
  if (difcEntityExists) {
    await db.insert(schema.absenceTypes).values({
      id:               atId(11),
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_DIFC,
      absencePlanId:    ABSENCE_PLAN_ID,
      typeCode:         'DAL-TEST',
      typeNameEn:       'DIFC Annual Leave (Test)',
      typeNameAr:       'إجازة سنوية مركز دبي المالي',
      isStatutory:      false,
      isPaid:           'FULL_PAY',
      maxDaysPerYear:   '20',
      approvalRequired: true,
      isActive:         true,
    }).onConflictDoNothing()
    console.info('  AT-011 (DIFC Annual Leave) seeded')
  } else {
    console.warn('  AT-011 skipped — DIFC legal entity (aaaa0001-0000-0000-0000-000000000002) does not exist yet')
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.info('=== test-leave seed start ===')

  // Check if DIFC legal entity exists
  const difcCheck = await db
    .select({ id: schema.legalEntities.id })
    .from(schema.legalEntities)
    .where(sql`id = ${LEGAL_ENTITY_DIFC}::uuid`)
    .limit(1)

  const difcEntityExists = difcCheck.length > 0

  await seedAbsencePlan()
  await seedAbsenceTypes(difcEntityExists)

  console.info('=== test-leave seed complete ===')
  await client.end()
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
