/**
 * AGENT-1B — Test seed: Work Schedules & Public Holidays
 * Idempotent: uses onConflictDoNothing() on fixed UUIDs.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../schema'
import { TENANT_ID } from '../../lib/constants'

// ── Bootstrap ────────────────────────────────────────────────────────────────

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000002'

const SYS = {
  tenantId:      TENANT_ID,
  createdBy:     SYSTEM_USER_ID,
  createdByName: 'Seed Script',
}

// Legal entity already seeded by AGENT-1A
const LEGAL_ENTITY_ID = 'aaaa0001-0000-0000-0000-000000000001'

// ── Work Schedules ────────────────────────────────────────────────────────────

async function seedWorkSchedules() {
  console.info('  Seeding work schedules...')

  const schedules = [
    {
      id:               'bbbb0001-0000-0000-0000-000000000001',
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_ID,
      scheduleCode:     'WS-TEST-001',
      scheduleNameEn:   'Standard 5-Day (Test)',
      scheduleNameAr:   'الجدول الزمني القياسي 5 أيام (اختبار)',
      scheduleType:     'STANDARD',
      mondayStart:      '09:00',
      mondayEnd:        '18:00',
      tuesdayStart:     '09:00',
      tuesdayEnd:       '18:00',
      wednesdayStart:   '09:00',
      wednesdayEnd:     '18:00',
      thursdayStart:    '09:00',
      thursdayEnd:      '18:00',
      fridayStart:      '09:00',
      fridayEnd:        '18:00',
      saturdayStart:    null,
      saturdayEnd:      null,
      sundayStart:      null,
      sundayEnd:        null,
      totalHoursPerWeek: '40.00',
      isActive:         true,
      isDefault:        true,
    },
    {
      id:               'bbbb0001-0000-0000-0000-000000000002',
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_ID,
      scheduleCode:     'WS-TEST-002',
      scheduleNameEn:   'Ramadan Schedule (Test)',
      scheduleNameAr:   'جدول رمضان (اختبار)',
      scheduleType:     'RAMADAN',
      mondayStart:      '09:00',
      mondayEnd:        '15:00',
      tuesdayStart:     '09:00',
      tuesdayEnd:       '15:00',
      wednesdayStart:   '09:00',
      wednesdayEnd:     '15:00',
      thursdayStart:    '09:00',
      thursdayEnd:      '15:00',
      fridayStart:      '09:00',
      fridayEnd:        '15:00',
      saturdayStart:    null,
      saturdayEnd:      null,
      sundayStart:      null,
      sundayEnd:        null,
      totalHoursPerWeek: '30.00',
      isActive:         true,
      isDefault:        false,
      isRamadanSchedule: true,
    },
    {
      id:               'bbbb0001-0000-0000-0000-000000000003',
      ...SYS,
      legalEntityId:    LEGAL_ENTITY_ID,
      scheduleCode:     'WS-TEST-003',
      scheduleNameEn:   'Shift Schedule (Test)',
      scheduleNameAr:   'جدول الورديات (اختبار)',
      scheduleType:     'SHIFT',
      mondayStart:      '08:00',
      mondayEnd:        '16:00',
      tuesdayStart:     '08:00',
      tuesdayEnd:       '16:00',
      wednesdayStart:   '08:00',
      wednesdayEnd:     '16:00',
      thursdayStart:    '08:00',
      thursdayEnd:      '16:00',
      fridayStart:      '08:00',
      fridayEnd:        '16:00',
      saturdayStart:    '08:00',
      saturdayEnd:      '16:00',
      sundayStart:      null,
      sundayEnd:        null,
      totalHoursPerWeek: '48.00',
      isActive:         true,
      isDefault:        false,
    },
  ]

  await db
    .insert(schema.workSchedules)
    .values(schedules)
    .onConflictDoNothing()

  console.info(`  Work schedules: up to ${schedules.length} inserted`)
  return schedules.length
}

// ── Public Holidays ───────────────────────────────────────────────────────────

async function seedPublicHolidays() {
  console.info('  Seeding public holidays (2026 UAE)...')

  const holidays = [
    {
      id:            'bbbb0002-0000-0000-0000-000000000001',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-001',
      holidayNameEn: "New Year's Day",
      holidayNameAr: 'رأس السنة الميلادية',
      holidayDate:   '2026-01-01',
      isFloating:    false,
      isConfirmed:   true,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000002',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-002',
      holidayNameEn: 'Eid Al Fitr Day 1',
      holidayNameAr: 'عيد الفطر',
      holidayDate:   '2026-03-31',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000003',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-003',
      holidayNameEn: 'Eid Al Fitr Day 2',
      holidayNameAr: 'عيد الفطر',
      holidayDate:   '2026-04-01',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000004',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-004',
      holidayNameEn: 'Eid Al Fitr Day 3',
      holidayNameAr: 'عيد الفطر',
      holidayDate:   '2026-04-02',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000005',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-005',
      holidayNameEn: 'Eid Al Adha Day 1',
      holidayNameAr: 'عيد الأضحى',
      holidayDate:   '2026-06-06',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000006',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-006',
      holidayNameEn: 'Eid Al Adha Day 2',
      holidayNameAr: 'عيد الأضحى',
      holidayDate:   '2026-06-07',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000007',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-007',
      holidayNameEn: 'Eid Al Adha Day 3',
      holidayNameAr: 'عيد الأضحى',
      holidayDate:   '2026-06-08',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000008',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-008',
      holidayNameEn: 'Islamic New Year',
      holidayNameAr: 'رأس السنة الهجرية',
      holidayDate:   '2026-07-27',
      isFloating:    false,
      isConfirmed:   true,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000009',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-009',
      holidayNameEn: "Prophet's Birthday",
      holidayNameAr: 'المولد النبوي',
      holidayDate:   '2026-10-05',
      isFloating:    true,
      isConfirmed:   false,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000010',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-010',
      holidayNameEn: 'UAE National Day',
      holidayNameAr: 'اليوم الوطني',
      holidayDate:   '2026-12-02',
      isFloating:    false,
      isConfirmed:   true,
      appliesTo:     'ALL',
    },
    {
      id:            'bbbb0002-0000-0000-0000-000000000011',
      ...SYS,
      legalEntityId: LEGAL_ENTITY_ID,
      holidayYear:   2026,
      holidayCode:   'UAE-2026-011',
      holidayNameEn: 'UAE National Day (2)',
      holidayNameAr: 'اليوم الوطني',
      holidayDate:   '2026-12-03',
      isFloating:    false,
      isConfirmed:   true,
      appliesTo:     'ALL',
    },
  ]

  await db
    .insert(schema.publicHolidays)
    .values(holidays)
    .onConflictDoNothing()

  console.info(`  Public holidays: up to ${holidays.length} inserted`)
  return holidays.length
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.info('AGENT-1B: Seeding work schedules and public holidays...')

  const wsCount  = await seedWorkSchedules()
  const phCount  = await seedPublicHolidays()

  console.info(`AGENT-1B: Done — ${wsCount} schedules, ${phCount} holidays attempted.`)
  await client.end()
}

main().catch(err => {
  console.error('AGENT-1B seed failed:', err)
  process.exit(1)
})
