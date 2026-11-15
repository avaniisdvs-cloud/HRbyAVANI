import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema'
import { TENANT_ID } from '../lib/constants'

// ── Bootstrap ──────────────────────────────────────────────────────────────

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000002'

const SYS = {
  tenantId:      TENANT_ID,
  createdBy:     SYSTEM_USER_ID,
  createdByName: 'Seed Script',
}

// Deterministic UUID helpers — re-runnable without duplicates
const lv  = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const grd = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const bu  = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const dep = (n: number) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const loc = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const job = (n: number) => `60000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const pos = (n: number) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const abt = (n: number) => `80000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const sch = (n: number) => `90000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const lrs = (n: number) => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ins = (n: number) => `b0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const cmp = (n: number) => `c0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ntf = (n: number) => `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const wfd = (n: number) => `e0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const wfs = (n: number) => `f0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const fcg = (n: number) => `f1000000-0000-0000-0000-${String(n).padStart(12, '0')}`

const ENTITY_ID      = '11111111-1111-1111-1111-111111111111'
const ADMIN_ID       = '22222222-2222-2222-2222-222222222222'
const PAYROLL_ID     = '33333333-3333-3333-3333-333333333333'
const ABS_PLAN_ID    = '44444444-4444-4444-4444-444444444444'

// ── Section 1: Lookup Values ────────────────────────────────────────────────

async function seedLookups() {
  const existing = await db.select({ c: sql<number>`count(*)::int` }).from(schema.lookupValues)
  if (existing[0].c > 0) { console.info('  lookups already seeded — skipping'); return }

  const rows = [
    // NATIONALITY_CATEGORY
    { id: lv(1),  lookupType: 'NATIONALITY_CATEGORY', lookupCode: 'UAE_NATIONAL', valueEn: 'UAE National', valueAr: 'مواطن إماراتي', sortOrder: 1 },
    { id: lv(2),  lookupType: 'NATIONALITY_CATEGORY', lookupCode: 'GCC_NATIONAL', valueEn: 'GCC National', valueAr: 'مواطن خليجي', sortOrder: 2 },
    { id: lv(3),  lookupType: 'NATIONALITY_CATEGORY', lookupCode: 'EXPAT',        valueEn: 'Expatriate',   valueAr: 'وافد', sortOrder: 3 },
    // EMPLOYMENT_TYPE
    { id: lv(10), lookupType: 'EMPLOYMENT_TYPE', lookupCode: 'FULL_TIME',  valueEn: 'Full-Time',       valueAr: 'دوام كامل',   sortOrder: 1 },
    { id: lv(11), lookupType: 'EMPLOYMENT_TYPE', lookupCode: 'PART_TIME',  valueEn: 'Part-Time',       valueAr: 'دوام جزئي',   sortOrder: 2 },
    { id: lv(12), lookupType: 'EMPLOYMENT_TYPE', lookupCode: 'TEMPORARY',  valueEn: 'Temporary',       valueAr: 'مؤقت',        sortOrder: 3 },
    { id: lv(13), lookupType: 'EMPLOYMENT_TYPE', lookupCode: 'TASK_BASED', valueEn: 'Task-Based',      valueAr: 'قائم على المهام', sortOrder: 4 },
    { id: lv(14), lookupType: 'EMPLOYMENT_TYPE', lookupCode: 'FLEXIBLE',   valueEn: 'Flexible',        valueAr: 'مرن',         sortOrder: 5 },
    // GENDER
    { id: lv(20), lookupType: 'GENDER', lookupCode: 'MALE',          valueEn: 'Male',          valueAr: 'ذكر',          sortOrder: 1 },
    { id: lv(21), lookupType: 'GENDER', lookupCode: 'FEMALE',        valueEn: 'Female',        valueAr: 'أنثى',         sortOrder: 2 },
    { id: lv(22), lookupType: 'GENDER', lookupCode: 'NOT_SPECIFIED', valueEn: 'Not Specified', valueAr: 'غير محدد',     sortOrder: 3 },
    // MARITAL_STATUS
    { id: lv(30), lookupType: 'MARITAL_STATUS', lookupCode: 'SINGLE',   valueEn: 'Single',   valueAr: 'أعزب',   sortOrder: 1 },
    { id: lv(31), lookupType: 'MARITAL_STATUS', lookupCode: 'MARRIED',  valueEn: 'Married',  valueAr: 'متزوج',  sortOrder: 2 },
    { id: lv(32), lookupType: 'MARITAL_STATUS', lookupCode: 'DIVORCED', valueEn: 'Divorced', valueAr: 'مطلق',   sortOrder: 3 },
    { id: lv(33), lookupType: 'MARITAL_STATUS', lookupCode: 'WIDOWED',  valueEn: 'Widowed',  valueAr: 'أرمل',   sortOrder: 4 },
    // RELIGION
    { id: lv(40), lookupType: 'RELIGION', lookupCode: 'ISLAM',        valueEn: 'Islam',       valueAr: 'الإسلام',    sortOrder: 1 },
    { id: lv(41), lookupType: 'RELIGION', lookupCode: 'CHRISTIANITY', valueEn: 'Christianity',valueAr: 'المسيحية',   sortOrder: 2 },
    { id: lv(42), lookupType: 'RELIGION', lookupCode: 'HINDUISM',     valueEn: 'Hinduism',    valueAr: 'الهندوسية',  sortOrder: 3 },
    { id: lv(43), lookupType: 'RELIGION', lookupCode: 'BUDDHISM',     valueEn: 'Buddhism',    valueAr: 'البوذية',    sortOrder: 4 },
    { id: lv(44), lookupType: 'RELIGION', lookupCode: 'OTHER',        valueEn: 'Other',       valueAr: 'أخرى',       sortOrder: 5 },
    // DOCUMENT_TYPE
    { id: lv(50), lookupType: 'DOCUMENT_TYPE', lookupCode: 'EMIRATES_ID',     valueEn: 'Emirates ID',          valueAr: 'الهوية الإماراتية', sortOrder: 1 },
    { id: lv(51), lookupType: 'DOCUMENT_TYPE', lookupCode: 'PASSPORT',        valueEn: 'Passport',             valueAr: 'جواز سفر',          sortOrder: 2 },
    { id: lv(52), lookupType: 'DOCUMENT_TYPE', lookupCode: 'VISA',            valueEn: 'Residency Visa',       valueAr: 'تأشيرة إقامة',      sortOrder: 3 },
    { id: lv(53), lookupType: 'DOCUMENT_TYPE', lookupCode: 'LABOUR_CARD',     valueEn: 'Labour Card',          valueAr: 'بطاقة العمل',        sortOrder: 4 },
    { id: lv(54), lookupType: 'DOCUMENT_TYPE', lookupCode: 'CONTRACT',        valueEn: 'Employment Contract',  valueAr: 'عقد العمل',          sortOrder: 5 },
    { id: lv(55), lookupType: 'DOCUMENT_TYPE', lookupCode: 'DEGREE',          valueEn: 'Degree Certificate',   valueAr: 'شهادة جامعية',       sortOrder: 6 },
    { id: lv(56), lookupType: 'DOCUMENT_TYPE', lookupCode: 'PROFESSIONAL_CERT',valueEn:'Professional Certificate',valueAr:'شهادة مهنية',     sortOrder: 7 },
    // SEPARATION_REASON
    { id: lv(60), lookupType: 'SEPARATION_REASON', lookupCode: 'RESIGNATION',   valueEn: 'Resignation',        valueAr: 'استقالة',        sortOrder: 1 },
    { id: lv(61), lookupType: 'SEPARATION_REASON', lookupCode: 'TERMINATION',   valueEn: 'Termination',        valueAr: 'إنهاء خدمة',     sortOrder: 2 },
    { id: lv(62), lookupType: 'SEPARATION_REASON', lookupCode: 'CONTRACT_END',  valueEn: 'Contract End',       valueAr: 'انتهاء العقد',   sortOrder: 3 },
    { id: lv(63), lookupType: 'SEPARATION_REASON', lookupCode: 'RETIREMENT',    valueEn: 'Retirement',         valueAr: 'تقاعد',          sortOrder: 4 },
    { id: lv(64), lookupType: 'SEPARATION_REASON', lookupCode: 'REDUNDANCY',    valueEn: 'Redundancy',         valueAr: 'تسريح',          sortOrder: 5 },
    // JOB_FAMILY
    { id: lv(70), lookupType: 'JOB_FAMILY', lookupCode: 'REAL_ESTATE', valueEn: 'Real Estate',   valueAr: 'العقارات',       sortOrder: 1 },
    { id: lv(71), lookupType: 'JOB_FAMILY', lookupCode: 'FINANCE',     valueEn: 'Finance',       valueAr: 'المالية',        sortOrder: 2 },
    { id: lv(72), lookupType: 'JOB_FAMILY', lookupCode: 'HR',          valueEn: 'Human Resources',valueAr:'الموارد البشرية', sortOrder: 3 },
    { id: lv(73), lookupType: 'JOB_FAMILY', lookupCode: 'IT',          valueEn: 'Information Technology',valueAr:'تقنية المعلومات',sortOrder: 4 },
    { id: lv(74), lookupType: 'JOB_FAMILY', lookupCode: 'LEGAL',       valueEn: 'Legal',         valueAr: 'الشؤون القانونية', sortOrder: 5 },
    { id: lv(75), lookupType: 'JOB_FAMILY', lookupCode: 'OPERATIONS',  valueEn: 'Operations',    valueAr: 'العمليات',        sortOrder: 6 },
    { id: lv(76), lookupType: 'JOB_FAMILY', lookupCode: 'EXECUTIVE',   valueEn: 'Executive',     valueAr: 'التنفيذي',        sortOrder: 7 },
    { id: lv(77), lookupType: 'JOB_FAMILY', lookupCode: 'SALES',       valueEn: 'Sales',         valueAr: 'المبيعات',        sortOrder: 8 },
    // DEPARTMENT_TYPE
    { id: lv(80), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'Sales',      valueEn: 'Sales',          valueAr: 'المبيعات',         sortOrder: 1 },
    { id: lv(81), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'Finance',    valueEn: 'Finance',        valueAr: 'المالية',          sortOrder: 2 },
    { id: lv(82), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'HR',         valueEn: 'Human Resources',valueAr: 'الموارد البشرية',  sortOrder: 3 },
    { id: lv(83), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'IT',         valueEn: 'IT',             valueAr: 'تقنية المعلومات', sortOrder: 4 },
    { id: lv(84), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'Legal',      valueEn: 'Legal',          valueAr: 'الشؤون القانونية',sortOrder: 5 },
    { id: lv(85), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'Operations', valueEn: 'Operations',     valueAr: 'العمليات',        sortOrder: 6 },
    { id: lv(86), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'Executive',  valueEn: 'Executive',      valueAr: 'التنفيذي',        sortOrder: 7 },
    { id: lv(87), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'PRO',        valueEn: 'PRO Services',   valueAr: 'خدمات المراسل',   sortOrder: 8 },
    { id: lv(88), lookupType: 'DEPARTMENT_TYPE', lookupCode: 'Leasing',    valueEn: 'Leasing',        valueAr: 'التأجير',         sortOrder: 9 },
    // DEGREE_TYPE
    { id: lv(90), lookupType: 'DEGREE_TYPE', lookupCode: 'PhD',        valueEn: 'PhD / Doctorate', valueAr: 'دأفانيسه',      sortOrder: 1 },
    { id: lv(91), lookupType: 'DEGREE_TYPE', lookupCode: 'Master',     valueEn: 'Master\'s',        valueAr: 'ماجستير',      sortOrder: 2 },
    { id: lv(92), lookupType: 'DEGREE_TYPE', lookupCode: 'Bachelor',   valueEn: 'Bachelor\'s',      valueAr: 'بكالوريوس',    sortOrder: 3 },
    { id: lv(93), lookupType: 'DEGREE_TYPE', lookupCode: 'Diploma',    valueEn: 'Diploma',          valueAr: 'دبلوم',        sortOrder: 4 },
    { id: lv(94), lookupType: 'DEGREE_TYPE', lookupCode: 'Certificate',valueEn: 'Certificate',      valueAr: 'شهادة',        sortOrder: 5 },
    // UAE_BANK
    { id: lv(100), lookupType: 'UAE_BANK', lookupCode: 'ENBD',    valueEn: 'Emirates NBD',        valueAr: 'بنك الإمارات دبي الوطني', sortOrder: 1 },
    { id: lv(101), lookupType: 'UAE_BANK', lookupCode: 'FAB',     valueEn: 'First Abu Dhabi Bank',valueAr: 'بنك أبوظبي الأول',       sortOrder: 2 },
    { id: lv(102), lookupType: 'UAE_BANK', lookupCode: 'ADCB',    valueEn: 'Abu Dhabi Commercial Bank',valueAr:'بنك أبوظبي التجاري',  sortOrder: 3 },
    { id: lv(103), lookupType: 'UAE_BANK', lookupCode: 'MASHREQ', valueEn: 'Mashreq Bank',        valueAr: 'مصرف المشرق',            sortOrder: 4 },
    { id: lv(104), lookupType: 'UAE_BANK', lookupCode: 'DIB',     valueEn: 'Dubai Islamic Bank',  valueAr: 'بنك دبي الإسلامي',       sortOrder: 5 },
    { id: lv(105), lookupType: 'UAE_BANK', lookupCode: 'CBD',     valueEn: 'Commercial Bank of Dubai',valueAr:'البنك التجاري الدولي', sortOrder: 6 },
    // EOSB_SCHEME
    { id: lv(110), lookupType: 'EOSB_SCHEME', lookupCode: 'TRADITIONAL', valueEn: 'Traditional EOSB', valueAr: 'مكافأة نهاية الخدمة التقليدية', sortOrder: 1 },
    { id: lv(111), lookupType: 'EOSB_SCHEME', lookupCode: 'DEWS',        valueEn: 'DEWS (DIFC)',      valueAr: 'نظام ديوز',                      sortOrder: 2 },
    { id: lv(112), lookupType: 'EOSB_SCHEME', lookupCode: 'VSS',         valueEn: 'Voluntary Savings Scheme', valueAr: 'نظام الادخار الطوعي',   sortOrder: 3 },
    // INSURANCE_CATEGORY
    { id: lv(120), lookupType: 'INSURANCE_CATEGORY', lookupCode: 'BASIC',     valueEn: 'Basic',     valueAr: 'أساسي',  sortOrder: 1 },
    { id: lv(121), lookupType: 'INSURANCE_CATEGORY', lookupCode: 'ENHANCED',  valueEn: 'Enhanced',  valueAr: 'محسّن',   sortOrder: 2 },
    { id: lv(122), lookupType: 'INSURANCE_CATEGORY', lookupCode: 'PREMIUM',   valueEn: 'Premium',   valueAr: 'مميز',   sortOrder: 3 },
    { id: lv(123), lookupType: 'INSURANCE_CATEGORY', lookupCode: 'EXECUTIVE', valueEn: 'Executive', valueAr: 'تنفيذي', sortOrder: 4 },
  ]
  await db.insert(schema.lookupValues).values(rows.map(r => ({ ...SYS, isActive: true, ...r })))
  console.info(`  inserted ${rows.length} lookup values`)
}

// ── Section 2: Legal Entity ─────────────────────────────────────────────────

async function seedLegalEntity() {
  await db.insert(schema.legalEntities).values({
    id:                   ENTITY_ID,
    ...SYS,
    entityCode:           'AVN-001',
    nameEn:               'Avaniis',
    nameAr:               'أفانيس',
    tradeLicenceNumber:   'DED-123456',
    tradeLicenceExpiry:   '2027-01-31',
    registrationNumber:   'MOE-789012',
    entityType:           'MAINLAND',
    jurisdiction:         'Dubai',
    eosbScheme:           'TRADITIONAL',
    wpsEmployerCode:      'AVANIIS001',
    mohreEstablishmentId: 'MOHRE-AVN-001',
    defaultCurrency:      'AED',
    defaultLanguage:      'en',
    isActive:             true,
  }).onConflictDoNothing()
  console.info('  legal entity seeded')
}

// ── Section 3: Grades G1–G15 ────────────────────────────────────────────────

async function seedGrades() {
  const grades = [
    { n: 1,  code: 'G1',  nameEn: 'Grade 1 — Support Staff',     nameAr: 'الدرجة 1 — الدعم',          min: '3000',   max: '5000',   mid: '4000',   np: 30 },
    { n: 2,  code: 'G2',  nameEn: 'Grade 2 — Junior',            nameAr: 'الدرجة 2 — المبتدئ',        min: '5000',   max: '8000',   mid: '6500',   np: 30 },
    { n: 3,  code: 'G3',  nameEn: 'Grade 3 — Associate',         nameAr: 'الدرجة 3 — المشارك',        min: '8000',   max: '12000',  mid: '10000',  np: 30 },
    { n: 4,  code: 'G4',  nameEn: 'Grade 4 — Experienced',       nameAr: 'الدرجة 4 — ذو الخبرة',     min: '12000',  max: '18000',  mid: '15000',  np: 30 },
    { n: 5,  code: 'G5',  nameEn: 'Grade 5 — Senior Associate',  nameAr: 'الدرجة 5 — المشارك الأول', min: '18000',  max: '25000',  mid: '21500',  np: 30 },
    { n: 6,  code: 'G6',  nameEn: 'Grade 6 — Principal',         nameAr: 'الدرجة 6 — الرئيسي',       min: '25000',  max: '35000',  mid: '30000',  np: 30 },
    { n: 7,  code: 'G7',  nameEn: 'Grade 7 — Lead',              nameAr: 'الدرجة 7 — القيادي',       min: '35000',  max: '50000',  mid: '42500',  np: 30 },
    { n: 8,  code: 'G8',  nameEn: 'Grade 8 — Manager',           nameAr: 'الدرجة 8 — المدير',        min: '50000',  max: '70000',  mid: '60000',  np: 60 },
    { n: 9,  code: 'G9',  nameEn: 'Grade 9 — Senior Manager',    nameAr: 'الدرجة 9 — المدير الأول',  min: '70000',  max: '90000',  mid: '80000',  np: 60 },
    { n: 10, code: 'G10', nameEn: 'Grade 10 — Director',         nameAr: 'الدرجة 10 — المدير التنفيذي', min: '90000', max: '120000', mid: '105000', np: 90 },
    { n: 11, code: 'G11', nameEn: 'Grade 11 — Senior Director',  nameAr: 'الدرجة 11 — المدير الأول', min: '120000', max: '150000', mid: '135000', np: 90 },
    { n: 12, code: 'G12', nameEn: 'Grade 12 — Vice President',   nameAr: 'الدرجة 12 — نائب الرئيس', min: '150000', max: '200000', mid: '175000', np: 90 },
    { n: 13, code: 'G13', nameEn: 'Grade 13 — SVP',              nameAr: 'الدرجة 13 — نائب الرئيس الأول', min: '200000', max: '250000', mid: '225000', np: 90 },
    { n: 14, code: 'G14', nameEn: 'Grade 14 — EVP',              nameAr: 'الدرجة 14 — النائب التنفيذي',   min: '250000', max: '300000', mid: '275000', np: 90 },
    { n: 15, code: 'G15', nameEn: 'Grade 15 — C-Suite',          nameAr: 'الدرجة 15 — المستوى التنفيذي',  min: '300000', max: '500000', mid: '400000', np: 90 },
  ]
  await db.insert(schema.grades).values(
    grades.map(g => ({
      id:               grd(g.n),
      ...SYS,
      legalEntityId:    ENTITY_ID,
      gradeCode:        g.code,
      gradeNameEn:      g.nameEn,
      gradeNameAr:      g.nameAr,
      gradeLevel:       g.n,
      minSalary:        g.min,
      maxSalary:        g.max,
      midSalary:        g.mid,
      noticePeriodDays: g.np,
      isActive:         true,
    }))
  ).onConflictDoNothing()
  console.info('  15 grades seeded')
}

// ── Section 4: Payroll Definition ───────────────────────────────────────────

async function seedPayroll() {
  await db.insert(schema.payrollDefinitions).values({
    id:                   PAYROLL_ID,
    ...SYS,
    legalEntityId:        ENTITY_ID,
    payrollCode:          'AVN-PAY-AED',
    payrollNameEn:        'AVANIIS Monthly Payroll (AED)',
    payrollNameAr:        'كشف رواتب أفانيس الشهري',
    payFrequency:         'MONTHLY',
    paymentDayOfMonth:    25,
    currency:             'AED',
    legislativeDataGroup: 'UAE',
    wpsBankCode:          'ENBD',
    isActive:             true,
  }).onConflictDoNothing()
  console.info('  payroll definition seeded')
}

// ── Section 5: System Admin Person ─────────────────────────────────────────

async function seedAdminPerson() {
  await db.insert(schema.persons).values({
    id:                  ADMIN_ID,
    ...SYS,
    personNumber:        'AVN-001-000001',
    legalEntityId:       ENTITY_ID,
    firstNameEn:         'System',
    lastNameEn:          'Administrator',
    fullNameEn:          'System Administrator',
    fullNameAr:          'مسؤول النظام',
    dateOfBirth:         '1975-01-15',
    gender:              'MALE',
    nationalityCode:     'ARE',
    nationalityCategory: 'UAE_NATIONAL',
    employmentType:      'FULL_TIME',
    hireDate:            '2020-01-01',
    assignmentStatus:    'ACTIVE',
    currentGradeId:      grd(15),
    payrollId:           PAYROLL_ID,
    isSystemUser:        true,
    isActive:            true,
    preferredLanguage:   'en',
    notificationChannel: 'PUSH_AND_EMAIL',
    contractedHoursPerWeek: '45.00',
    noticePeriodDays:    90,
    numberOfDependents:  0,
    extraData:           {},
    insuranceStatus:     'NOT_ENROLLED',
    dependentCountInsured: 0,
    payFrequency:        'MONTHLY',
  }).onConflictDoNothing()
  console.info('  system admin person seeded')
}

// ── Section 6: Business Units ───────────────────────────────────────────────

async function seedBusinessUnits() {
  await db.insert(schema.businessUnits).values([
    { id: bu(1), ...SYS, legalEntityId: ENTITY_ID, code: 'BU-REO', nameEn: 'Real Estate Operations', nameAr: 'عمليات العقارات',  isActive: true },
    { id: bu(2), ...SYS, legalEntityId: ENTITY_ID, code: 'BU-CRP', nameEn: 'Corporate Services',     nameAr: 'الخدمات المؤسسية', isActive: true },
    { id: bu(3), ...SYS, legalEntityId: ENTITY_ID, code: 'BU-SMK', nameEn: 'Sales & Marketing',      nameAr: 'المبيعات والتسويق',isActive: true },
  ]).onConflictDoNothing()
  console.info('  3 business units seeded')
}

// ── Section 7: Departments ──────────────────────────────────────────────────

async function seedDepartments() {
  await db.insert(schema.departments).values([
    { id: dep(1), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(3), code: 'DEPT-SALES',  nameEn: 'Sales',             nameAr: 'المبيعات',            departmentType: 'Sales',      approvedHeadcount: 20, isActive: true },
    { id: dep(2), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(1), code: 'DEPT-LEAS',   nameEn: 'Leasing',           nameAr: 'التأجير',             departmentType: 'Leasing',    approvedHeadcount: 10, isActive: true },
    { id: dep(3), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(2), code: 'DEPT-FIN',    nameEn: 'Finance',           nameAr: 'الشؤون المالية',      departmentType: 'Finance',    approvedHeadcount: 8,  isActive: true },
    { id: dep(4), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(2), code: 'DEPT-HR',     nameEn: 'Human Resources',   nameAr: 'الموارد البشرية',     departmentType: 'HR',         approvedHeadcount: 6,  isActive: true },
    { id: dep(5), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(2), code: 'DEPT-IT',     nameEn: 'Information Technology',nameAr:'تقنية المعلومات',   departmentType: 'IT',         approvedHeadcount: 8,  isActive: true },
    { id: dep(6), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(2), code: 'DEPT-LEGAL',  nameEn: 'Legal & Compliance',nameAr: 'الشؤون القانونية',    departmentType: 'Legal',      approvedHeadcount: 4,  isActive: true },
    { id: dep(7), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(1), code: 'DEPT-OPS',    nameEn: 'Operations',        nameAr: 'العمليات',            departmentType: 'Operations', approvedHeadcount: 12, isActive: true },
    { id: dep(8), ...SYS, legalEntityId: ENTITY_ID, businessUnitId: bu(2), code: 'DEPT-PRO',    nameEn: 'PRO Services',      nameAr: 'خدمات المراسل',       departmentType: 'PRO',        approvedHeadcount: 4,  isActive: true },
  ]).onConflictDoNothing()
  console.info('  8 departments seeded')
}

// ── Section 8: Locations ────────────────────────────────────────────────────

async function seedLocations() {
  await db.insert(schema.locations).values([
    { id: loc(1), ...SYS, legalEntityId: ENTITY_ID, code: 'LOC-HQ',  nameEn: 'Head Office — Dubai Marina', nameAr: 'المقر الرئيسي — دبي مارينا',  addressLine1: 'Level 20, Marina Plaza', city: 'Dubai', emirate: 'Dubai', timezone: 'Asia/Dubai', isActive: true },
    { id: loc(2), ...SYS, legalEntityId: ENTITY_ID, code: 'LOC-MEY', nameEn: 'Meydan Office',              nameAr: 'مكتب ميدان',                    addressLine1: 'Meydan Tower, Level 5',  city: 'Dubai', emirate: 'Dubai', timezone: 'Asia/Dubai', isActive: true },
    { id: loc(3), ...SYS, legalEntityId: ENTITY_ID, code: 'LOC-BBY', nameEn: 'Business Bay Office',        nameAr: 'مكتب الخليج التجاري',           addressLine1: 'Bay Square, Building 3', city: 'Dubai', emirate: 'Dubai', timezone: 'Asia/Dubai', isActive: true },
  ]).onConflictDoNothing()
  console.info('  3 locations seeded')
}

// ── Section 9: Jobs ─────────────────────────────────────────────────────────

async function seedJobs() {
  await db.insert(schema.jobs).values([
    { id: job(1),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-CEO',    jobTitleEn: 'Chief Executive Officer',     jobTitleAr: 'الرئيس التنفيذي',             jobFamily: 'EXECUTIVE',   minGradeId: grd(15), maxGradeId: grd(15), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: false, isActive: true },
    { id: job(2),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-CFO',    jobTitleEn: 'Chief Financial Officer',     jobTitleAr: 'المدير المالي',                jobFamily: 'FINANCE',     minGradeId: grd(14), maxGradeId: grd(15), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: true,  isActive: true },
    { id: job(3),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-CHRO',   jobTitleEn: 'Chief Human Resources Officer',jobTitleAr:'مدير الموارد البشرية',         jobFamily: 'HR',          minGradeId: grd(13), maxGradeId: grd(14), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: true,  isActive: true },
    { id: job(4),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-HSLS',   jobTitleEn: 'Head of Sales',               jobTitleAr: 'رئيس المبيعات',                jobFamily: 'SALES',       minGradeId: grd(11), maxGradeId: grd(12), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: true,  isActive: true },
    { id: job(5),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-HFIN',   jobTitleEn: 'Head of Finance',             jobTitleAr: 'رئيس الشؤون المالية',          jobFamily: 'FINANCE',     minGradeId: grd(10), maxGradeId: grd(11), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: true,  isActive: true },
    { id: job(6),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-HHR',    jobTitleEn: 'Head of HR',                  jobTitleAr: 'رئيس الموارد البشرية',         jobFamily: 'HR',          minGradeId: grd(9),  maxGradeId: grd(10), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: true,  isActive: true },
    { id: job(7),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-HIT',    jobTitleEn: 'Head of IT',                  jobTitleAr: 'رئيس تقنية المعلومات',         jobFamily: 'IT',          minGradeId: grd(9),  maxGradeId: grd(10), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: false, isActive: true },
    { id: job(8),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-HLGL',   jobTitleEn: 'Head of Legal',               jobTitleAr: 'رئيس الشؤون القانونية',        jobFamily: 'LEGAL',       minGradeId: grd(9),  maxGradeId: grd(10), isManagementRole: true,  isExemptFromOvertime: true,  isEmiratisationTarget: false, isActive: true },
    { id: job(9),  ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-SRPROP', jobTitleEn: 'Senior Property Consultant',  jobTitleAr: 'مستشار عقاري أول',             jobFamily: 'REAL_ESTATE', minGradeId: grd(7),  maxGradeId: grd(8),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: true,  isActive: true },
    { id: job(10), ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-PROP',   jobTitleEn: 'Property Consultant',         jobTitleAr: 'مستشار عقاري',                jobFamily: 'REAL_ESTATE', minGradeId: grd(5),  maxGradeId: grd(7),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: true,  isActive: true },
    { id: job(11), ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-LEAS',   jobTitleEn: 'Leasing Consultant',          jobTitleAr: 'مستشار تأجير',                jobFamily: 'REAL_ESTATE', minGradeId: grd(5),  maxGradeId: grd(6),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: true,  isActive: true },
    { id: job(12), ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-FANA',   jobTitleEn: 'Financial Analyst',           jobTitleAr: 'محلل مالي',                   jobFamily: 'FINANCE',     minGradeId: grd(5),  maxGradeId: grd(7),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: true,  isActive: true },
    { id: job(13), ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-HRBP',   jobTitleEn: 'HR Business Partner',         jobTitleAr: 'شريك أعمال الموارد البشرية',  jobFamily: 'HR',          minGradeId: grd(7),  maxGradeId: grd(8),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: true,  isActive: true },
    { id: job(14), ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-ITBA',   jobTitleEn: 'IT Business Analyst',         jobTitleAr: 'محلل أعمال تقنية المعلومات',  jobFamily: 'IT',          minGradeId: grd(6),  maxGradeId: grd(7),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: false, isActive: true },
    { id: job(15), ...SYS, legalEntityId: ENTITY_ID, jobCode: 'JOB-PRO',    jobTitleEn: 'PRO Officer',                 jobTitleAr: 'موظف المراسل',                jobFamily: 'OPERATIONS',  minGradeId: grd(4),  maxGradeId: grd(6),  isManagementRole: false, isExemptFromOvertime: false, isEmiratisationTarget: false, isActive: true },
  ]).onConflictDoNothing()
  console.info('  15 jobs seeded')
}

// ── Section 10: Positions ───────────────────────────────────────────────────

async function seedPositions() {
  await db.insert(schema.positions).values([
    { id: pos(1),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(1), jobId: job(1),  positionCode: 'POS-CEO',    positionTitleEn: 'Chief Executive Officer',    gradeId: grd(15), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true },
    { id: pos(2),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(3), jobId: job(2),  positionCode: 'POS-CFO',    positionTitleEn: 'Chief Financial Officer',    gradeId: grd(15), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true },
    { id: pos(3),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(4), jobId: job(3),  positionCode: 'POS-CHRO',   positionTitleEn: 'Chief HR Officer',           gradeId: grd(14), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true },
    { id: pos(4),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(1), jobId: job(4),  positionCode: 'POS-HSLS',   positionTitleEn: 'Head of Sales',              gradeId: grd(12), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(1) },
    { id: pos(5),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(3), jobId: job(5),  positionCode: 'POS-HFIN',   positionTitleEn: 'Head of Finance',            gradeId: grd(11), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(2) },
    { id: pos(6),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(4), jobId: job(6),  positionCode: 'POS-HHR',    positionTitleEn: 'Head of HR',                 gradeId: grd(10), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(3) },
    { id: pos(7),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(5), jobId: job(7),  positionCode: 'POS-HIT',    positionTitleEn: 'Head of IT',                 gradeId: grd(10), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(1) },
    { id: pos(8),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(6), jobId: job(8),  positionCode: 'POS-HLGL',   positionTitleEn: 'Head of Legal',              gradeId: grd(10), locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(1) },
    { id: pos(9),  ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(1), jobId: job(9),  positionCode: 'POS-SRPC1',  positionTitleEn: 'Senior Property Consultant 1',gradeId: grd(7),  locationId: loc(1), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(4) },
    { id: pos(10), ...SYS, legalEntityId: ENTITY_ID, departmentId: dep(1), jobId: job(10), positionCode: 'POS-PC1',    positionTitleEn: 'Property Consultant 1',       gradeId: grd(6),  locationId: loc(2), fteCount: '1.00', isOccupied: false, isActive: true, reportsToPositionId: pos(4) },
  ]).onConflictDoNothing()
  console.info('  10 positions seeded')
}

// ── Section 11: Absence Plans & Types ──────────────────────────────────────

async function seedAbsence() {
  await db.insert(schema.absencePlans).values({
    id:                       ABS_PLAN_ID,
    ...SYS,
    legalEntityId:            ENTITY_ID,
    planCode:                 'UAE-MAINLAND-STD',
    planNameEn:               'UAE Mainland Standard Absence Plan',
    planNameAr:               'خطة الغياب القياسية — البر الرئيسي',
    accrualMethod:            'CALENDAR_YEAR',
    // GAP-M02 FIX (FIX-S9-02): AVANIIS carry-forward default — 15 days, 24 months.
    // Configurable per entity via Settings → Leave Rules (Sprint 5 S5-06).
    carryForwardMaxDays:      '15',
    carryForwardExpiryMonths: 24,
    allowNegativeBalance:     false,
    isActive:                 true,
  }).onConflictDoNothing()

  await db.insert(schema.absenceTypes).values([
    { id: abt(1),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'ANNUAL',          typeNameEn: 'Annual Leave',          typeNameAr: 'إجازة سنوية',        isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '30',  minServiceMonths: 0,  minNoticeDays: 3,  approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
    { id: abt(2),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'SICK',            typeNameEn: 'Sick Leave',            typeNameAr: 'إجازة مرضية',        isStatutory: true,  isPaid: 'TIERED',    requiresMedicalCert: true,  certRequiredAfterDays: 1, maxDaysPerYear: '90',  minServiceMonths: 3,  minNoticeDays: 0,  approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
    { id: abt(3),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'MATERNITY',       typeNameEn: 'Maternity Leave',       typeNameAr: 'إجازة أمومة',        isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: true,  maxDaysPerYear: '60',  minServiceMonths: 12, minNoticeDays: 30, approvalRequired: true,  isOneTimePerEmployment: false, genderRestriction: 'FEMALE', isActive: true },
    { id: abt(4),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'PATERNITY',       typeNameEn: 'Paternity Leave',       typeNameAr: 'إجازة أبوة',         isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '5',   minServiceMonths: 0,  minNoticeDays: 0,  approvalRequired: true,  isOneTimePerEmployment: false, genderRestriction: 'MALE',   isActive: true },
    { id: abt(5),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'HAJJ',            typeNameEn: 'Hajj Leave',            typeNameAr: 'إجازة الحج',         isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '30',  minServiceMonths: 24, minNoticeDays: 30, approvalRequired: true,  isOneTimePerEmployment: true,  religionRestriction: 'ISLAM', isActive: true },
    { id: abt(6),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'BEREAVEMENT',     typeNameEn: 'Bereavement Leave',     typeNameAr: 'إجازة وفاة',         isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '5',   minServiceMonths: 0,  minNoticeDays: 0,  approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
    { id: abt(7),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'STUDY',           typeNameEn: 'Study Leave',           typeNameAr: 'إجازة دراسية',       isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '10',  minServiceMonths: 12, minNoticeDays: 14, approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
    { id: abt(8),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'MARRIAGE',        typeNameEn: 'Marriage Leave',        typeNameAr: 'إجازة زواج',         isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '3',   minServiceMonths: 0,  minNoticeDays: 7,  approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
    { id: abt(9),  ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'UNPAID',          typeNameEn: 'Unpaid Leave',          typeNameAr: 'إجازة بدون راتب',    isStatutory: false, isPaid: 'NO_PAY',    requiresMedicalCert: false, maxDaysPerYear: '90',  minServiceMonths: 12, minNoticeDays: 14, approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
    // GAP-N06 FIX (FIX-S9-05): Compensatory leave for public-holiday work.
    // BR-PH-003 / BR-OT-001 / Article 26 FDL 33/2021 — public-holiday work earns
    // 150% pay PLUS 1 compensatory leave day. Granted via grantCompensatoryLeaveCredit.
    { id: abt(10), ...SYS, legalEntityId: ENTITY_ID, absencePlanId: ABS_PLAN_ID, typeCode: 'COMP',            typeNameEn: 'Compensatory Leave',    typeNameAr: 'إجازة تعويضية',     isStatutory: true,  isPaid: 'FULL_PAY',  requiresMedicalCert: false, maxDaysPerYear: '15',  minServiceMonths: 0,  minNoticeDays: 0,  approvalRequired: true,  isOneTimePerEmployment: false, isActive: true },
  ]).onConflictDoNothing()
  console.info('  absence plan + 10 absence types seeded')
}

// ── Section 12: Work Schedules ──────────────────────────────────────────────

async function seedWorkSchedules() {
  await db.insert(schema.workSchedules).values([
    {
      id: sch(1), ...SYS, legalEntityId: ENTITY_ID,
      scheduleCode: 'STD-5DAY', scheduleNameEn: 'Standard 5-Day (Mon–Fri)', scheduleNameAr: 'الجدول القياسي 5 أيام',
      scheduleType: 'STANDARD', weekendDays: [5, 6],
      totalHoursPerWeek: '45.00', breakMinutes: 60,
      sundayStart: '09:00',  sundayEnd: '18:00',
      mondayStart: '09:00',  mondayEnd: '18:00',
      tuesdayStart: '09:00', tuesdayEnd: '18:00',
      wednesdayStart: '09:00', wednesdayEnd: '18:00',
      thursdayStart: '09:00', thursdayEnd: '18:00',
      isDefault: true, isActive: true,
    },
    {
      id: sch(2), ...SYS, legalEntityId: ENTITY_ID,
      scheduleCode: 'RAMADAN', scheduleNameEn: 'Ramadan Schedule', scheduleNameAr: 'جدول شهر رمضان',
      scheduleType: 'RAMADAN', weekendDays: [5, 6],
      totalHoursPerWeek: '30.00', breakMinutes: 0,
      sundayStart: '09:00',  sundayEnd: '15:00',
      mondayStart: '09:00',  mondayEnd: '15:00',
      tuesdayStart: '09:00', tuesdayEnd: '15:00',
      wednesdayStart: '09:00', wednesdayEnd: '15:00',
      thursdayStart: '09:00', thursdayEnd: '15:00',
      isRamadanSchedule: true, ramadanHoursPerDay: '6.00',
      isDefault: false, isActive: true,
    },
  ]).onConflictDoNothing()

  // Standard schedule patterns: Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
  const stdDays = [
    { dayOfWeek: 0, isWorkingDay: true,  startTime: '09:00', endTime: '18:00', breakMinutes: 60 }, // Sunday
    { dayOfWeek: 1, isWorkingDay: true,  startTime: '09:00', endTime: '18:00', breakMinutes: 60 }, // Monday
    { dayOfWeek: 2, isWorkingDay: true,  startTime: '09:00', endTime: '18:00', breakMinutes: 60 }, // Tuesday
    { dayOfWeek: 3, isWorkingDay: true,  startTime: '09:00', endTime: '18:00', breakMinutes: 60 }, // Wednesday
    { dayOfWeek: 4, isWorkingDay: true,  startTime: '09:00', endTime: '18:00', breakMinutes: 60 }, // Thursday
    { dayOfWeek: 5, isWorkingDay: false, startTime: null,    endTime: null,    breakMinutes: 0  }, // Friday (off)
    { dayOfWeek: 6, isWorkingDay: false, startTime: null,    endTime: null,    breakMinutes: 0  }, // Saturday (off)
  ]
  const ramDays = stdDays.map(d => d.isWorkingDay
    ? { ...d, startTime: '09:00', endTime: '15:00', breakMinutes: 0 }
    : d
  )

  const patternRows = [
    ...stdDays.map((d, i) => ({ id: `e1${String(i).padStart(6,'0')}-0000-0000-0000-000000000001`, ...SYS, workScheduleId: sch(1), ...d })),
    ...ramDays.map((d, i) => ({ id: `e2${String(i).padStart(6,'0')}-0000-0000-0000-000000000002`, ...SYS, workScheduleId: sch(2), ...d })),
  ]
  await db.insert(schema.workSchedulePatterns).values(patternRows).onConflictDoNothing()
  console.info('  2 work schedules + 14 patterns seeded')
}

// ── Section 13: Public Holidays 2026 ───────────────────────────────────────

async function seedPublicHolidays() {
  const h2026 = [
    { id: 'fe202601-0000-0000-0000-000000000001', holidayCode: 'UAE-2026-NY',   holidayDate: '2026-01-01', holidayNameEn: "New Year's Day",              holidayNameAr: 'رأس السنة الميلادية',        holidayType: 'FIXED',    isConfirmed: true,  durationDays: 1, isFloating: false, appliesTo: 'ALL' },
    { id: 'fe202602-0000-0000-0000-000000000002', holidayCode: 'UAE-2026-EF1',  holidayDate: '2026-03-20', holidayNameEn: 'Eid Al Fitr — Day 1',          holidayNameAr: 'عيد الفطر — اليوم الأول',   holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe202603-0000-0000-0000-000000000003', holidayCode: 'UAE-2026-EF2',  holidayDate: '2026-03-21', holidayNameEn: 'Eid Al Fitr — Day 2',          holidayNameAr: 'عيد الفطر — اليوم الثاني',  holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe202604-0000-0000-0000-000000000004', holidayCode: 'UAE-2026-EF3',  holidayDate: '2026-03-22', holidayNameEn: 'Eid Al Fitr — Day 3',          holidayNameAr: 'عيد الفطر — اليوم الثالث',  holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe202605-0000-0000-0000-000000000005', holidayCode: 'UAE-2026-ARA',  holidayDate: '2026-05-27', holidayNameEn: 'Arafat Day (Eid Al Adha Eve)', holidayNameAr: 'يوم عرفة',                  holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'MUSLIMS_ONLY' },
    { id: 'fe202606-0000-0000-0000-000000000006', holidayCode: 'UAE-2026-EA1',  holidayDate: '2026-05-28', holidayNameEn: 'Eid Al Adha — Day 1',          holidayNameAr: 'عيد الأضحى — اليوم الأول',  holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe202607-0000-0000-0000-000000000007', holidayCode: 'UAE-2026-EA2',  holidayDate: '2026-05-29', holidayNameEn: 'Eid Al Adha — Day 2',          holidayNameAr: 'عيد الأضحى — اليوم الثاني', holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe202608-0000-0000-0000-000000000008', holidayCode: 'UAE-2026-EA3',  holidayDate: '2026-05-30', holidayNameEn: 'Eid Al Adha — Day 3',          holidayNameAr: 'عيد الأضحى — اليوم الثالث', holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe202609-0000-0000-0000-000000000009', holidayCode: 'UAE-2026-INY',  holidayDate: '2026-06-17', holidayNameEn: 'Islamic New Year',             holidayNameAr: 'رأس السنة الهجرية',         holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe20260a-0000-0000-0000-000000000010', holidayCode: 'UAE-2026-PRB',  holidayDate: '2026-08-26', holidayNameEn: "Prophet's Birthday",           holidayNameAr: 'المولد النبوي الشريف',      holidayType: 'VARIABLE', isConfirmed: false, durationDays: 1, isFloating: true,  appliesTo: 'ALL' },
    { id: 'fe20260b-0000-0000-0000-000000000011', holidayCode: 'UAE-2026-COM',  holidayDate: '2026-11-30', holidayNameEn: 'UAE Commemoration Day',        holidayNameAr: 'يوم الشهيد',                holidayType: 'FIXED',    isConfirmed: true,  durationDays: 1, isFloating: false, appliesTo: 'ALL' },
    { id: 'fe20260c-0000-0000-0000-000000000012', holidayCode: 'UAE-2026-ND1',  holidayDate: '2026-12-02', holidayNameEn: 'UAE National Day',             holidayNameAr: 'اليوم الوطني',              holidayType: 'FIXED',    isConfirmed: true,  durationDays: 1, isFloating: false, appliesTo: 'ALL' },
    { id: 'fe20260d-0000-0000-0000-000000000013', holidayCode: 'UAE-2026-ND2',  holidayDate: '2026-12-03', holidayNameEn: 'UAE National Day (2nd Day)',   holidayNameAr: 'اليوم الوطني — اليوم الثاني', holidayType: 'FIXED',  isConfirmed: true,  durationDays: 1, isFloating: false, appliesTo: 'ALL' },
  ]
  await db.insert(schema.publicHolidays).values(
    h2026.map(h => ({ ...SYS, ...h, legalEntityId: ENTITY_ID, holidayYear: 2026 }))
  ).onConflictDoNothing()
  console.info('  13 UAE 2026 public holidays seeded')
}

// ── Section 14: Leave Rule Set & Lines ─────────────────────────────────────

async function seedLeaveRules() {
  await db.insert(schema.leaveRuleSets).values({
    id:                  lrs(1),
    ...SYS,
    legalEntityId:       ENTITY_ID,
    ruleSetCode:         'UAE-MAINLAND-2024',
    ruleSetNameEn:       'UAE Mainland Leave Rules 2024 (Labour Law 33/2021)',
    ruleSetNameAr:       'قواعد الإجازات الإماراتية البر الرئيسي 2024',
    entityTypeScope:     'MAINLAND',
    nationalityScope:    'ALL',
    employmentTypeScope: 'ALL',
    effectiveFrom:       '2022-02-02', // UAE Labour Law 33/2021 effective date
    isActive:            true,
    isDefault:           true,
  }).onConflictDoNothing()

  // Leave rule lines — BR-AL-001 through BR-AL-010
  await db.insert(schema.leaveRuleLines).values([
    {
      id: `${lrs(1).slice(0,8)}-0001-0001-0001-000000000001`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'ANNUAL',
      // BR-AL-001: 22 days first year, 30 days from year 5
      entitlementTiersJson: [
        { minServiceMonths: 0,  maxServiceMonths: 60, daysEntitled: 22 },
        { minServiceMonths: 60, maxServiceMonths: null, daysEntitled: 30 },
      ],
      // GAP-M02 FIX (FIX-S9-02): carry-forward default — 15 days, 24 months.
      // BR-AL-003: 24-month postponement window per UAE Labour Law / AVANIIS policy.
      maxCarryForwardDays: '15',
      carryForwardExpiryMonths:  24,
      isProRated:          true,
      accrualFrequency:    'MONTHLY',
      minServiceMonths:    0,
      maxDaysPerYear:      '30',
      encashmentAllowed:   true,
      encashmentMaxDays:   '30',
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0002-0002-0002-000000000002`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'SICK',
      // BR-AL-002: 15 full-pay, 30 half-pay, 45 unpaid
      entitlementTiersJson: [
        { minServiceMonths: 3, tier: 'FULL_PAY',  days: 15 },
        { minServiceMonths: 3, tier: 'HALF_PAY',  days: 30 },
        { minServiceMonths: 3, tier: 'NO_PAY',    days: 45 },
      ],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    3,
      maxDaysPerYear:      '90',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0003-0003-0003-000000000003`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'MATERNITY',
      // BR-AL-004: 60 calendar days (post-2024 amendment)
      entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 60 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    12,
      maxDaysPerYear:      '60',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0004-0004-0004-000000000004`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'PATERNITY',
      // BR-AL-005: 5 days paternity
      entitlementTiersJson: [{ minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 5 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    0,
      maxDaysPerYear:      '5',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0005-0005-0005-000000000005`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'HAJJ',
      // BR-AL-006: 30 days, once per employment, Muslim employees only
      entitlementTiersJson: [{ minServiceMonths: 24, maxServiceMonths: null, daysEntitled: 30 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    24,
      maxDaysPerYear:      '30',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0006-0006-0006-000000000006`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'BEREAVEMENT',
      // BR-AL-007: 3 days (non-Muslim), 5 days (Muslim immediate family)
      entitlementTiersJson: [{ minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 5 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    0,
      maxDaysPerYear:      '5',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0007-0007-0007-000000000007`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'STUDY',
      // BR-AL-008: 10 days study leave for UAE nationals in educational programs
      entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 10 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    12,
      maxDaysPerYear:      '10',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0008-0008-0008-000000000008`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'MARRIAGE',
      // BR-AL-009: 3 days marriage leave
      entitlementTiersJson: [{ minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 3 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          false,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    0,
      maxDaysPerYear:      '3',
      encashmentAllowed:   false,
      isActive:            true,
    },
    {
      id: `${lrs(1).slice(0,8)}-0009-0009-0009-000000000009`,
      ...SYS,
      leaveRuleSetId:       lrs(1),
      absenceTypeCode:      'UNPAID',
      entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 90 }],
      maxCarryForwardDays: '0',
      carryForwardExpiryMonths:  0,
      isProRated:          true,
      accrualFrequency:    'ANNUALLY',
      minServiceMonths:    12,
      encashmentAllowed:   false,
      isActive:            true,
    },
  ]).onConflictDoNothing()

  // GAP-M03 FIX (FIX-S9-03) — DIFC Employment Law 2019 entitlements.
  // BR-DIFC-005: DIFC employees follow DIFC Employment Law, not UAE Mainland Labour Law.
  //   • ANNUAL    = 20 working days (vs 22 calendar days mainland)
  //   • MATERNITY = 65 working days (vs 60 calendar days mainland)
  //   • SICK      = 60 days = 10 full + 20 half + 30 unpaid (vs 15/30/45 mainland)
  // The DIFC rule set is entityTypeScope='DIFC' so resolveLeaveRuleSet picks
  // it over the mainland set whenever the person's legal entity is a DIFC entity.
  await db.insert(schema.leaveRuleSets).values({
    id:                  lrs(2),
    ...SYS,
    legalEntityId:       null, // Not entity-scoped — applies to any DIFC entity tenant-wide.
    ruleSetCode:         'UAE-DIFC-2019',
    ruleSetNameEn:       'DIFC Leave Rules 2019 (DIFC Employment Law 2019)',
    ruleSetNameAr:       'قواعد إجازات مركز دبي المالي العالمي 2019',
    entityTypeScope:     'DIFC',
    nationalityScope:    'ALL',
    employmentTypeScope: 'ALL',
    effectiveFrom:       '2019-08-28', // DIFC Employment Law 2019 effective date
    isActive:            true,
    isDefault:           false,
  }).onConflictDoNothing()

  await db.insert(schema.leaveRuleLines).values([
    {
      // DIFC line IDs use a distinct prefix (a1000000-...) so they cannot
      // collide with the mainland line IDs (a0000000-...). Both rule sets
      // share `lrs(N).slice(0,8)='a0000000'`, so a different namespace is
      // mandatory — using the same prefix collided on the SICK line.
      id: 'a1000000-0001-0001-0001-000000000001',
      ...SYS,
      leaveRuleSetId:       lrs(2),
      absenceTypeCode:      'ANNUAL',
      // BR-DIFC-005: DIFC annual leave = 20 working days at full service.
      entitlementTiersJson: [
        { minServiceMonths: 0,  maxServiceMonths: null, daysEntitled: 20 },
      ],
      maxCarryForwardDays:      '10',
      carryForwardExpiryMonths: 12,
      isProRated:               true,
      accrualFrequency:         'MONTHLY',
      minServiceMonths:         12,
      maxDaysPerYear:           '20',
      encashmentAllowed:        true,
      encashmentMaxDays:        '20',
      isActive:                 true,
    },
    {
      id: 'a1000000-0002-0002-0002-000000000002',
      ...SYS,
      leaveRuleSetId:       lrs(2),
      absenceTypeCode:      'MATERNITY',
      // BR-DIFC-005: DIFC maternity = 65 working days (vs 60 calendar mainland).
      entitlementTiersJson: [{ minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 65 }],
      maxCarryForwardDays:      '0',
      carryForwardExpiryMonths: 0,
      isProRated:               false,
      accrualFrequency:         'ANNUALLY',
      minServiceMonths:         0,
      maxDaysPerYear:           '65',
      encashmentAllowed:        false,
      isActive:                 true,
    },
    {
      id: 'a1000000-0003-0003-0003-000000000003',
      ...SYS,
      leaveRuleSetId:       lrs(2),
      absenceTypeCode:      'SICK',
      // BR-DIFC-005: DIFC sick leave = 60 days (10 full + 20 half + 30 unpaid).
      entitlementTiersJson: [
        { minServiceMonths: 0, tier: 'FULL_PAY', days: 10 },
        { minServiceMonths: 0, tier: 'HALF_PAY', days: 20 },
        { minServiceMonths: 0, tier: 'NO_PAY',   days: 30 },
      ],
      maxCarryForwardDays:      '0',
      carryForwardExpiryMonths: 0,
      isProRated:               false,
      accrualFrequency:         'ANNUALLY',
      minServiceMonths:         0,
      maxDaysPerYear:           '60',
      encashmentAllowed:        false,
      isActive:                 true,
    },
  ]).onConflictDoNothing()
  console.info('  1 leave rule set + 9 leave rule lines seeded (BR-AL-001 to BR-AL-010)')
  console.info('  1 DIFC leave rule set + 3 DIFC leave rule lines seeded (BR-DIFC-005)')
}

// ── Section 15: Compliance Rules ───────────────────────────────────────────

async function seedComplianceRules() {
  await db.insert(schema.complianceRules).values([
    {
      id: cmp(1), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-EOSB-001', module: 'PAYROLL', ruleType: 'CALCULATION',
      entityTypes: ['MAINLAND'], nationalityScope: 'EXPAT',
      descriptionEn: 'EOSB Traditional Calculation — UAE Mainland',
      descriptionAr: 'حساب مكافأة نهاية الخدمة التقليدية',
      articleRef: 'UAE Labour Law 33/2021, Articles 51-53',
      formula: { rate_year_1_to_5: 21, rate_beyond_5: 30, cap_months: 24, daily_rate_divisor: 30 },
      effectiveDate: '2022-02-02', isActive: true, isOverridable: false, priority: 10,
    },
    {
      id: cmp(2), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-EOSB-002', module: 'PAYROLL', ruleType: 'CALCULATION',
      entityTypes: ['MAINLAND'], nationalityScope: 'EXPAT',
      descriptionEn: 'EOSB Pro-Ration on Resignation (< 5 Years)',
      descriptionAr: 'تناسب مكافأة نهاية الخدمة عند الاستقالة',
      articleRef: 'UAE Labour Law 33/2021, Article 51(3)',
      formula: { proration_1_to_3_years_pct: 33.33, proration_3_to_5_years_pct: 66.67, proration_over_5_years_pct: 100 },
      effectiveDate: '2022-02-02', isActive: true, isOverridable: false, priority: 9,
    },
    {
      id: cmp(3), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-WPS-001', module: 'PAYROLL', ruleType: 'VALIDATION',
      entityTypes: ['MAINLAND'], nationalityScope: 'ALL',
      descriptionEn: 'WPS Payment Deadline — 14th of Following Month',
      descriptionAr: 'الموعد النهائي لنظام حماية الأجور',
      articleRef: 'MOHRE WPS Regulations',
      formula: { payment_deadline_day: 14, grace_days: 0, penalty_per_day: 'VARIABLE' },
      effectiveDate: '2022-01-01', isActive: true, isOverridable: false, priority: 10,
    },
    {
      id: cmp(4), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-GPSSA-001', module: 'PAYROLL', ruleType: 'CALCULATION',
      entityTypes: ['MAINLAND', 'FREEZONE'], nationalityScope: 'UAE_NATIONAL',
      descriptionEn: 'GPSSA Contribution — UAE Nationals',
      descriptionAr: 'اشتراكات الهيئة العامة للمعاشات',
      articleRef: 'GPSSA Federal Law 7/1999',
      formula: { employee_contribution_pct: 5, employer_contribution_pct: 12.5, pensionable_salary_cap_aed: 50000 },
      effectiveDate: '2000-01-01', isActive: true, isOverridable: false, priority: 10,
    },
    {
      id: cmp(5), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-NP-001', module: 'CORE_HR', ruleType: 'CALCULATION',
      entityTypes: ['MAINLAND'], nationalityScope: 'ALL',
      descriptionEn: 'Notice Period — UAE Labour Law',
      descriptionAr: 'فترة الإشعار — قانون العمل الإماراتي',
      articleRef: 'UAE Labour Law 33/2021, Article 43',
      formula: { default_days: 30, service_lt_3yr_days: 30, service_3_to_5yr_days: 60, service_gte_5yr_days: 90, max_days: 90 },
      effectiveDate: '2022-02-02', isActive: true, isOverridable: true, priority: 5,
    },
    {
      id: cmp(6), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-PR-001', module: 'CORE_HR', ruleType: 'VALIDATION',
      entityTypes: ['MAINLAND'], nationalityScope: 'ALL',
      descriptionEn: 'Probation Period Maximum — 6 Months',
      descriptionAr: 'الحد الأقصى لفترة التجربة 6 أشهر',
      articleRef: 'UAE Labour Law 33/2021, Article 9',
      formula: { max_months: 6, notice_during_probation_days: 14 },
      effectiveDate: '2022-02-02', isActive: true, isOverridable: false, priority: 5,
    },
    {
      id: cmp(7), ...SYS, legalEntityId: ENTITY_ID,
      ruleId: 'BR-OT-001', module: 'PAYROLL', ruleType: 'CALCULATION',
      entityTypes: ['MAINLAND'], nationalityScope: 'ALL',
      descriptionEn: 'Overtime Rate — UAE Labour Law',
      descriptionAr: 'معدل العمل الإضافي',
      articleRef: 'UAE Labour Law 33/2021, Article 19',
      formula: { normal_overtime_rate: 1.25, friday_overtime_rate: 1.50, max_daily_hours: 2, max_weekly_hours: 12 },
      effectiveDate: '2022-02-02', isActive: true, isOverridable: false, priority: 5,
    },
  ]).onConflictDoNothing()
  console.info('  7 compliance rules seeded (BR-EOSB, BR-WPS, BR-GPSSA, BR-NP, BR-PR, BR-OT)')
}

// ── Section 16: Grade Salary Ranges ────────────────────────────────────────

async function seedGradeSalaryRanges() {
  const ranges = [
    { n: 1,  min: '3000',   mid: '4000',   max: '5000'   },
    { n: 2,  min: '5000',   mid: '6500',   max: '8000'   },
    { n: 3,  min: '8000',   mid: '10000',  max: '12000'  },
    { n: 4,  min: '12000',  mid: '15000',  max: '18000'  },
    { n: 5,  min: '18000',  mid: '21500',  max: '25000'  },
    { n: 6,  min: '25000',  mid: '30000',  max: '35000'  },
    { n: 7,  min: '35000',  mid: '42500',  max: '50000'  },
    { n: 8,  min: '50000',  mid: '60000',  max: '70000'  },
    { n: 9,  min: '70000',  mid: '80000',  max: '90000'  },
    { n: 10, min: '90000',  mid: '105000', max: '120000' },
    { n: 11, min: '120000', mid: '135000', max: '150000' },
    { n: 12, min: '150000', mid: '175000', max: '200000' },
    { n: 13, min: '200000', mid: '225000', max: '250000' },
    { n: 14, min: '250000', mid: '275000', max: '300000' },
    { n: 15, min: '300000', mid: '400000', max: '500000' },
  ]
  await db.insert(schema.gradeSalaryRanges).values(
    ranges.map(r => ({
      id:            `cc000000-0000-0000-0000-${String(r.n).padStart(12,'0')}`,
      ...SYS,
      legalEntityId: ENTITY_ID,
      gradeId:       grd(r.n),
      currency:      'AED',
      basicMin:      r.min,
      basicMid:      r.mid,
      basicMax:      r.max,
      effectiveStartDate: '2024-01-01',
      housingType:   'PERCENTAGE',
      housingValue:  '0.25',
      transportType: 'FIXED_AMOUNT',
      transportValue:'1500',
      phoneAllowance:'0',
      carAllowance:  '0',
    }))
  ).onConflictDoNothing()
  console.info('  15 grade salary ranges seeded')
}

// ── Section 17: Medical Insurance Plans ────────────────────────────────────

async function seedInsurancePlans() {
  await db.insert(schema.medicalInsurancePlans).values([
    {
      id: ins(1), ...SYS, legalEntityId: ENTITY_ID,
      planCode: 'DHA-BASIC-2024', planNameEn: 'DHA Mandatory Basic Plan', planNameAr: 'خطة هيئة الصحة بدبي الأساسية',
      providerName: 'Daman National Health Insurance',
      policyNumber: 'DAMAN-AVN-2024-001',
      regulatoryScheme: 'DHA', planCategory: 'BASIC',
      networkName: 'Daman Smart Network',
      employeePremiumAed:   '2400.00',
      employerContributionPct: '100',
      eligibleGradeLevelMin: 1, eligibleGradeLevelMax: 7,
      maxDependents: 9,
      policyStartDate: '2024-01-01', policyEndDate: '2024-12-31',
      isActive: true, isDefaultPlan: true,
    },
    {
      id: ins(2), ...SYS, legalEntityId: ENTITY_ID,
      planCode: 'ENHANCED-2024', planNameEn: 'Enhanced Medical Plan — Management', planNameAr: 'الخطة الطبية المحسّنة — الإدارة',
      providerName: 'Cigna Global Health',
      policyNumber: 'CIGNA-AVN-2024-001',
      regulatoryScheme: 'PRIVATE', planCategory: 'ENHANCED',
      networkName: 'Cigna Extended Network UAE',
      employeePremiumAed:   '7200.00',
      spousePremiumAed:     '6000.00',
      childPremiumAed:      '4800.00',
      employerContributionPct: '100',
      eligibleGradeLevelMin: 8, eligibleGradeLevelMax: 15,
      maxDependents: 9,
      policyStartDate: '2024-01-01', policyEndDate: '2024-12-31',
      isActive: true, isDefaultPlan: false,
    },
  ]).onConflictDoNothing()
  console.info('  2 medical insurance plans seeded')
}

// ── Section 18: Document Type Config ───────────────────────────────────────

async function seedDocumentTypeConfigs() {
  await db.insert(schema.documentTypeConfigs).values([
    { id: `dc000001-0000-0000-0000-000000000001`, ...SYS, legalEntityId: ENTITY_ID, documentType: 'EMIRATES_ID',     nameEn: 'Emirates ID',             nameAr: 'الهوية الإماراتية',    isMandatory: true,  nationalityScope: 'UAE_NATIONAL', alertDaysBeforeExpiry: [90,60,30,14], alertRecipients: ['EMPLOYEE','HR_ADMIN','PRO'], maxFileSizeMb: 5,  allowedMimeTypes: ['application/pdf','image/jpeg','image/png'], isActive: true },
    { id: `dc000002-0000-0000-0000-000000000002`, ...SYS, legalEntityId: ENTITY_ID, documentType: 'PASSPORT',        nameEn: 'Passport',                nameAr: 'جواز السفر',           isMandatory: true,  nationalityScope: 'ALL',          alertDaysBeforeExpiry: [90,60,30,14], alertRecipients: ['EMPLOYEE','HR_ADMIN'],       maxFileSizeMb: 5,  allowedMimeTypes: ['application/pdf','image/jpeg','image/png'], isActive: true },
    { id: `dc000003-0000-0000-0000-000000000003`, ...SYS, legalEntityId: ENTITY_ID, documentType: 'VISA',            nameEn: 'UAE Residency Visa',      nameAr: 'تأشيرة الإقامة',       isMandatory: true,  nationalityScope: 'EXPAT',        alertDaysBeforeExpiry: [90,60,30,14], alertRecipients: ['EMPLOYEE','HR_ADMIN','PRO'], maxFileSizeMb: 5,  allowedMimeTypes: ['application/pdf','image/jpeg','image/png'], isActive: true },
    { id: `dc000004-0000-0000-0000-000000000004`, ...SYS, legalEntityId: ENTITY_ID, documentType: 'LABOUR_CARD',     nameEn: 'Labour Card / Work Permit',nameAr: 'بطاقة العمل',          isMandatory: true,  nationalityScope: 'EXPAT',        alertDaysBeforeExpiry: [90,60,30,14], alertRecipients: ['EMPLOYEE','HR_ADMIN','PRO'], maxFileSizeMb: 5,  allowedMimeTypes: ['application/pdf','image/jpeg','image/png'], isActive: true },
    { id: `dc000005-0000-0000-0000-000000000005`, ...SYS, legalEntityId: ENTITY_ID, documentType: 'CONTRACT',        nameEn: 'Employment Contract',     nameAr: 'عقد العمل',            isMandatory: true,  nationalityScope: 'ALL',          alertDaysBeforeExpiry: [30,14],       alertRecipients: ['HR_ADMIN'],                 maxFileSizeMb: 10, allowedMimeTypes: ['application/pdf'], isActive: true },
    { id: `dc000006-0000-0000-0000-000000000006`, ...SYS, legalEntityId: ENTITY_ID, documentType: 'DEGREE',          nameEn: 'Academic Degree',         nameAr: 'الشهادة الجامعية',     isMandatory: false, nationalityScope: 'ALL',          alertDaysBeforeExpiry: [],            alertRecipients: ['HR_ADMIN'],                 maxFileSizeMb: 10, allowedMimeTypes: ['application/pdf','image/jpeg','image/png'], isActive: true },
  ]).onConflictDoNothing()
  console.info('  6 document type configs seeded')
}

// ── Section 19: Notification Templates ─────────────────────────────────────

async function seedNotificationTemplates() {
  await db.insert(schema.notificationTemplates).values([
    {
      id: ntf(1), ...SYS, legalEntityId: ENTITY_ID,
      templateCode: 'DOC_EXPIRY_ALERT', templateNameEn: 'Document Expiry Alert',
      eventType: 'DOCUMENT_EXPIRING', channel: 'EMAIL', language: 'en',
      subjectEn: 'Action Required: {{document.type}} expiring in {{days_remaining}} days',
      bodyEn: 'Dear {{person.full_name_en}},\n\nYour {{document.type}} ({{document.number}}) is due to expire on {{document.expiry_date}}.\n\nPlease arrange renewal at your earliest convenience.\n\nAVANIIS HR Team',
      availableVarsJson: { 'person.full_name_en': 'string', 'document.type': 'string', 'document.number': 'string', 'document.expiry_date': 'date', 'days_remaining': 'number' },
      recipientRoles: ['EMPLOYEE', 'HR_ADMIN', 'PRO'],
      advanceNoticeDays: [90, 60, 30, 14],
      isActive: true,
    },
    {
      id: ntf(2), ...SYS, legalEntityId: ENTITY_ID,
      templateCode: 'LEAVE_REQUEST_PENDING', templateNameEn: 'Leave Request — Pending Approval',
      eventType: 'WORKFLOW_PENDING', channel: 'IN_APP', language: 'en',
      subjectEn: 'Leave Request Pending Your Approval — {{person.full_name_en}}',
      bodyEn: '{{person.full_name_en}} has submitted a {{leave.type}} request from {{leave.start_date}} to {{leave.end_date}} ({{leave.duration_days}} days). Please review and take action.\n\nARIA Recommendation: {{aria.recommendation}} ({{aria.confidence}}% confidence)\n{{aria.summary}}',
      availableVarsJson: {
        'person.full_name_en':   'string',
        'leave.type':            'string',
        'leave.start_date':      'date',
        'leave.end_date':        'date',
        'leave.duration_days':   'number',
        'aria.recommendation':   'string',
        'aria.confidence':       'number',
        'aria.summary':          'string',
      },
      recipientRoles: ['MANAGER'],
      isActive: true,
    },
    {
      id: ntf(3), ...SYS, legalEntityId: ENTITY_ID,
      templateCode: 'LEAVE_APPROVED', templateNameEn: 'Leave Request Approved',
      eventType: 'LEAVE_APPROVED', channel: 'PUSH', language: 'en',
      subjectEn: 'Your leave request has been approved',
      bodyEn: 'Dear {{person.full_name_en}}, your {{leave.type}} from {{leave.start_date}} to {{leave.end_date}} has been approved by {{approver.full_name_en}}.',
      availableVarsJson: { 'person.full_name_en': 'string', 'leave.type': 'string', 'leave.start_date': 'date', 'leave.end_date': 'date', 'approver.full_name_en': 'string' },
      recipientRoles: ['EMPLOYEE'],
      isActive: true,
    },
    {
      id: ntf(4), ...SYS, legalEntityId: ENTITY_ID,
      templateCode: 'SALARY_PROCESSED', templateNameEn: 'Salary Processing Complete',
      eventType: 'SALARY_PROCESSED', channel: 'EMAIL', language: 'en',
      subjectEn: 'Your salary for {{payroll.period}} has been processed',
      bodyEn: 'Dear {{person.full_name_en}},\n\nYour salary for {{payroll.period}} (Net: AED {{payroll.net_pay}}) has been processed and will be credited on {{payroll.payment_date}}.\n\nAVANIIS HR & Payroll',
      availableVarsJson: { 'person.full_name_en': 'string', 'payroll.period': 'string', 'payroll.net_pay': 'number', 'payroll.payment_date': 'date' },
      recipientRoles: ['EMPLOYEE'],
      isActive: true,
    },
    {
      id: ntf(5), ...SYS, legalEntityId: ENTITY_ID,
      templateCode: 'PROBATION_REVIEW_DUE', templateNameEn: 'Probation Review Due',
      eventType: 'PROBATION_REVIEW_DUE', channel: 'EMAIL', language: 'en',
      subjectEn: 'Probation Review Due — {{person.full_name_en}} ({{days_remaining}} days remaining)',
      bodyEn: 'Dear {{manager.full_name_en}},\n\nThe probation period for {{person.full_name_en}} ({{person.job_title}}) ends on {{person.probation_end_date}}. Please initiate a probation review.',
      availableVarsJson: { 'person.full_name_en': 'string', 'person.job_title': 'string', 'person.probation_end_date': 'date', 'manager.full_name_en': 'string', 'days_remaining': 'number' },
      recipientRoles: ['MANAGER', 'HR_ADMIN'],
      advanceNoticeDays: [30, 14, 7],
      isActive: true,
    },
    {
      id: ntf(6), ...SYS, legalEntityId: ENTITY_ID,
      templateCode: 'LEAVE_REJECTED', templateNameEn: 'Leave Request Rejected',
      eventType: 'LEAVE_REJECTED', channel: 'PUSH', language: 'en',
      subjectEn: 'Your leave request has been declined',
      bodyEn: 'Dear {{person.full_name_en}}, your {{leave.type}} request from {{leave.start_date}} to {{leave.end_date}} has been declined. Reason: {{rejection_reason}}. Please contact your manager.',
      availableVarsJson: { 'person.full_name_en': 'string', 'leave.type': 'string', 'leave.start_date': 'date', 'leave.end_date': 'date', 'rejection_reason': 'string' },
      recipientRoles: ['EMPLOYEE'],
      isActive: true,
    },
  ]).onConflictDoNothing()
  console.info('  6 notification templates seeded')
}

// ── Section 20: Policy Settings ─────────────────────────────────────────────

async function seedPolicySettings() {
  const policies: Array<{
    key:           string
    nameEn:        string
    nameAr?:       string
    valueType:     string
    value:         string
    module:        string
    isOverridable?: boolean
    notes?:        string
  }> = [
    { key: 'probation.max_months',              nameEn: 'Maximum Probation Months',               valueType: 'NUMBER',  value: '6',    module: 'EMPLOYEES' },
    { key: 'notice_period.default_days',         nameEn: 'Default Notice Period (Days)',            valueType: 'NUMBER',  value: '30',   module: 'EMPLOYEES' },
    { key: 'notice_period.grade_8_plus_days',    nameEn: 'Notice Period for Grade 8+ (Days)',       valueType: 'NUMBER',  value: '90',   module: 'EMPLOYEES' },
    { key: 'annual_leave.min_days_per_booking',  nameEn: 'Minimum Leave Days Per Booking',          valueType: 'NUMBER',  value: '1',    module: 'LEAVE' },
    { key: 'annual_leave.max_advance_days',      nameEn: 'Maximum Days in Advance for Leave Booking',valueType:'NUMBER', value: '90',   module: 'LEAVE' },
    { key: 'annual_leave.min_balance_for_encash',nameEn: 'Minimum Balance Before Encashment',       valueType: 'NUMBER',  value: '15',   module: 'LEAVE' },
    { key: 'payroll.wps_payment_day',            nameEn: 'WPS Payment Deadline Day of Month',       valueType: 'NUMBER',  value: '14',   module: 'PAYROLL' },
    { key: 'payroll.overtime_auto_flag_hours',   nameEn: 'Overtime Hours Auto-Flag Threshold',      valueType: 'NUMBER',  value: '10',   module: 'PAYROLL' },
    { key: 'documents.passport_expiry_alert_days',nameEn:'Passport Expiry Alert Days',             valueType: 'JSON',    value: '[90,60,30,14]', module: 'EMPLOYEES' },
    { key: 'documents.visa_expiry_alert_days',   nameEn: 'Visa Expiry Alert Days',                  valueType: 'JSON',    value: '[90,60,30,14]', module: 'EMPLOYEES' },
    // GAP-M01 FIX (FIX-S9-01): sick-leave medical-cert threshold — configurable per organisation.
    // BR-SL-002: UAE Labour Law Article 31, FDL 33/2021 — minimum Day 1 (threshold=0).
    // Avaniis policy = 2. HR_DIRECTOR can update via Settings → Policy Settings.
    {
      key:           'SICK_LEAVE_CERT_THRESHOLD_DAYS',
      nameEn:        'Sick Leave — Medical Certificate Required After (Days)',
      nameAr:        'الإجازة المرضية — الشهادة الطبية مطلوبة بعد (أيام)',
      valueType:     'NUMBER',
      value:         '0',
      module:        'LEAVE',
      isOverridable: true,
      notes:         'BR-SL-002 / Article 31 FDL 33/2021. 0=cert required from Day 1 (UAE minimum). 2=Avaniis policy. Allowed range 0–3.',
    },
    // UI appearance settings — controlled via Settings → Appearance page.
    {
      key:           'UI_ACCENT_THEME',
      nameEn:        'Accent theme',
      nameAr:        'لون المظهر',
      valueType:     'STRING',
      value:         'teal',
      module:        'UI',
      isOverridable: true,
    },
    {
      key:           'UI_DARK_MODE',
      nameEn:        'Dark mode',
      nameAr:        'الوضع الداكن',
      valueType:     'STRING',
      value:         'false',
      module:        'UI',
      isOverridable: true,
    },
    {
      key:           'UI_DENSITY',
      nameEn:        'Display density',
      nameAr:        'كثافة العرض',
      valueType:     'STRING',
      value:         'comfortable',
      module:        'UI',
      isOverridable: true,
    },
  ]
  await db.insert(schema.policySettings).values(
    policies.map((p, i) => ({
      id:            `bb000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,
      ...SYS,
      legalEntityId: ENTITY_ID,
      settingKey:    p.key,
      settingNameEn: p.nameEn,
      settingNameAr: p.nameAr,
      valueType:     p.valueType,
      settingValue:  p.value,
      moduleCode:    p.module,
      isOverridable: p.isOverridable ?? false,
      effectiveFrom: '2024-01-01',
      notes:         p.notes,
    }))
  ).onConflictDoNothing()
  console.info(`  ${policies.length} policy settings seeded`)
}

// ── Section 21: Workflow Definitions ───────────────────────────────────────

async function seedWorkflows() {
  await db.insert(schema.workflowDefinitions).values([
    {
      id: wfd(1), ...SYS, legalEntityId: ENTITY_ID,
      workflowCode: 'WF-LEAVE-STD', workflowNameEn: 'Leave Request — Standard Approval',
      workflowNameAr: 'طلب الإجازة — الموافقة القياسية',
      triggerEvent: 'LEAVE_REQUEST', approvalMode: 'SEQUENTIAL', slaHours: 48, escalationHours: 72,
      isActive: true, version: 1,
    },
    {
      id: wfd(2), ...SYS, legalEntityId: ENTITY_ID,
      workflowCode: 'WF-HIRE-STD', workflowNameEn: 'New Hire — Standard Approval',
      workflowNameAr: 'التوظيف الجديد — الموافقة القياسية',
      triggerEvent: 'HIRE', approvalMode: 'SEQUENTIAL', slaHours: 72, escalationHours: 120,
      isActive: true, version: 1,
    },
    {
      id: wfd(3), ...SYS, legalEntityId: ENTITY_ID,
      workflowCode: 'WF-SAL-REVISION', workflowNameEn: 'Salary Revision — Finance Approval',
      workflowNameAr: 'تعديل الراتب — موافقة المالية',
      triggerEvent: 'SALARY_REVISION', approvalMode: 'SEQUENTIAL', slaHours: 96, escalationHours: 144,
      isActive: true, version: 1,
    },
  ]).onConflictDoNothing()

  // Workflow stages for leave approval
  await db.insert(schema.workflowStages).values([
    { id: wfs(1), ...SYS, workflowDefinitionId: wfd(1), stageOrder: 1, stageNameEn: 'Line Manager Approval', stageNameAr: 'موافقة المدير المباشر', approverType: 'DYNAMIC', dynamicApproverExpr: 'person.line_manager_id', canDelegate: true, isOptional: false, stageSlaHours: 24, actionType: 'APPROVE_REJECT' },
    { id: wfs(2), ...SYS, workflowDefinitionId: wfd(1), stageOrder: 2, stageNameEn: 'HR Acknowledgement',    stageNameAr: 'إقرار الموارد البشرية',  approverType: 'ROLE',    approverRoleCode: 'HR_MANAGER',            canDelegate: true, isOptional: false, stageSlaHours: 24, actionType: 'ACKNOWLEDGE' },
    // Hire workflow stages
    { id: wfs(3), ...SYS, workflowDefinitionId: wfd(2), stageOrder: 1, stageNameEn: 'Department Head Approval',stageNameAr:'موافقة رئيس القسم',   approverType: 'ROLE',    approverRoleCode: 'DEPARTMENT_HEAD',       canDelegate: true, isOptional: false, stageSlaHours: 48, actionType: 'APPROVE_REJECT' },
    { id: wfs(4), ...SYS, workflowDefinitionId: wfd(2), stageOrder: 2, stageNameEn: 'HR Admin Review',         stageNameAr:'مراجعة إدارة الموارد',  approverType: 'ROLE',    approverRoleCode: 'HR_MANAGER',            canDelegate: true, isOptional: false, stageSlaHours: 24, actionType: 'APPROVE_REJECT' },
    // Salary revision stages
    { id: wfs(5), ...SYS, workflowDefinitionId: wfd(3), stageOrder: 1, stageNameEn: 'Line Manager Approval',  stageNameAr:'موافقة المدير المباشر',  approverType: 'DYNAMIC', dynamicApproverExpr: 'person.line_manager_id', canDelegate: false, isOptional: false, stageSlaHours: 48, actionType: 'APPROVE_REJECT' },
    { id: wfs(6), ...SYS, workflowDefinitionId: wfd(3), stageOrder: 2, stageNameEn: 'HR Director Approval',   stageNameAr:'موافقة مدير الموارد',    approverType: 'ROLE',    approverRoleCode: 'HR_MANAGER',            canDelegate: false, isOptional: false, stageSlaHours: 48, actionType: 'APPROVE_REJECT' },
    { id: wfs(7), ...SYS, workflowDefinitionId: wfd(3), stageOrder: 3, stageNameEn: 'Finance Approval',       stageNameAr:'موافقة المالية',         approverType: 'ROLE',    approverRoleCode: 'FINANCE_HEAD',          canDelegate: false, isOptional: false, stageSlaHours: 48, actionType: 'APPROVE_REJECT' },
  ]).onConflictDoNothing()
  console.info('  3 workflow definitions + 7 workflow stages seeded')
}

// ── Section 22: Form Configurations (S2-07 / D-08) ──────────────────────────

async function seedFormConfigurations() {
  // Mirrors lib/config-resolver.ts DEFAULT_SECTIONS so the runtime resolver hits
  // the DB row first and falls back to the in-code defaults only if the seed
  // hasn't run. UNIQUE(tenant_id, entity_type, role) keeps re-runs idempotent.
  await db.insert(schema.formConfigurations).values([
    {
      id: fcg(1), ...SYS, legalEntityId: ENTITY_ID,
      entityType: 'PERSON', role: 'ALL', isActive: true,
      config: {
        sections: [
          { sectionCode: 'PERSONAL_INFO',   labelEn: 'Personal Information',   labelAr: 'المعلومات الشخصية', fields: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'nationality'] },
          { sectionCode: 'EMPLOYMENT_INFO', labelEn: 'Employment Information', labelAr: 'معلومات الوظيفة',   fields: ['jobTitle', 'department', 'grade', 'manager'] },
          { sectionCode: 'CONTACT',         labelEn: 'Contact Details',        labelAr: 'بيانات الاتصال',    fields: ['workEmail', 'mobileNumber', 'address'] },
          { sectionCode: 'DOCUMENTS',       labelEn: 'Documents',              labelAr: 'الوثائق',           fields: ['emiratesId', 'passport', 'visa'] },
          { sectionCode: 'CUSTOM',          labelEn: 'Custom Fields',          labelAr: 'الحقول المخصصة',    fields: [] },
        ],
      },
    },
    {
      id: fcg(2), ...SYS, legalEntityId: ENTITY_ID,
      entityType: 'CONTRACT', role: 'ALL', isActive: true,
      config: {
        sections: [
          { sectionCode: 'CONTRACT_TERMS', labelEn: 'Contract Terms', labelAr: 'شروط العقد',       fields: ['contractType', 'startDate', 'endDate', 'noticePeriod'] },
          { sectionCode: 'COMPENSATION',   labelEn: 'Compensation',   labelAr: 'الراتب والمزايا',  fields: ['basicSalary', 'housingAllowance', 'transportAllowance'] },
          { sectionCode: 'BENEFITS',       labelEn: 'Benefits',       labelAr: 'المزايا',          fields: ['medicalPlan', 'annualLeave'] },
        ],
      },
    },
    {
      id: fcg(3), ...SYS, legalEntityId: ENTITY_ID,
      entityType: 'LEAVE_REQUEST', role: 'ALL', isActive: true,
      config: {
        sections: [
          { sectionCode: 'REQUEST_DETAILS', labelEn: 'Request Details', labelAr: 'تفاصيل الطلب',  fields: ['leaveType', 'startDate', 'endDate', 'reason'] },
          { sectionCode: 'CUSTOM',          labelEn: 'Custom Fields',   labelAr: 'الحقول المخصصة', fields: [] },
        ],
      },
    },
  ]).onConflictDoNothing()
  console.info('  3 form configurations seeded (PERSON, CONTRACT, LEAVE_REQUEST)')
}

// ── ARIA Config Defaults ─────────────────────────────────────────────────────

async function seedAriaConfig() {
  const existing = await db.select({ c: sql<number>`count(*)::int` }).from(schema.ariaAgentConfig)
  if (existing[0].c > 0) { console.info('  ARIA config already seeded — skipping'); return }

  await Promise.all([
    db.insert(schema.ariaAgentConfig).values({
      ...SYS,
      agentName: 'ARIA',
      agentRole: 'HR Intelligence Assistant',
      agentTone: 'professional',
      isActive: true,
    }),
    db.insert(schema.ariaModelConfig).values({
      ...SYS,
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      temperature: '0.3',
      maxTokens: 1000,
      isActive: true,
    }),
    db.insert(schema.ariaBehaviourConfig).values({
      ...SYS,
      promptMode: 'prepend',
      authorityLevel: 'advisory',
      enabledDataSources: ['hr', 'absence', 'compliance'],
      ragEnabled: true,
      ragMaxChunks: 5,
      anomalyDetection: true,
      predictiveInsights: false,
      slaMonitoring: true,
      conversationRetentionDays: 90,
      contextDepthMessages: 20,
      personalizationEnabled: true,
      isActive: true,
    }),
  ])
  console.info('  inserted ARIA config defaults')
}

// ── Section N: Company Currency Settings (default AED for all UAE entities) ──
// BR-CCY-002: seed AED / 2 dp / HALF_UP for every legal entity so the
// currency setup page is pre-populated and payroll display works on day 1.

const ccy = (n: number) => `cc000000-0000-0000-0000-${String(n).padStart(12, '0')}`

async function seedCurrencySettings() {
  // Fetch all legal entities for this tenant
  const entities = await db
    .select({ id: schema.legalEntities.id })
    .from(schema.legalEntities)
    .where(sql`tenant_id = ${TENANT_ID}::uuid`)

  if (entities.length === 0) {
    console.info('  no legal entities found — skipping currency seed')
    return
  }

  let seeded = 0
  for (let i = 0; i < entities.length; i++) {
    const entityId = entities[i].id
    await db.insert(schema.companyCurrencySettings).values({
      id:              ccy(i + 1),
      tenantId:        TENANT_ID,
      legalEntityId:   entityId,
      currencyCode:    'AED',
      currencyNameEn:  'UAE Dirham',
      currencyNameAr:  'درهم إماراتي',
      currencySymbol:  'AED',
      decimalPlaces:   2,
      roundingMethod:  'HALF_UP',
      effectiveFrom:   '2024-01-01',
      effectiveTo:     null,
      isActive:        true,
      createdBy:       SYSTEM_USER_ID,
      createdByName:   'Seed Script',
    }).onConflictDoNothing()
    seeded++
  }
  console.info(`  AED default currency seeded for ${seeded} legal entit${seeded !== 1 ? 'ies' : 'y'}`)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.info('\n🌱  AVANIIS HR — Seed Script')
  console.info('─'.repeat(50))
  try {
    await seedLookups()
    await seedLegalEntity()
    await seedGrades()
    await seedPayroll()
    await seedAdminPerson()
    await seedBusinessUnits()
    await seedDepartments()
    await seedLocations()
    await seedJobs()
    await seedPositions()
    await seedAbsence()
    await seedWorkSchedules()
    await seedPublicHolidays()
    await seedLeaveRules()
    await seedComplianceRules()
    await seedGradeSalaryRanges()
    await seedInsurancePlans()
    await seedDocumentTypeConfigs()
    await seedNotificationTemplates()
    await seedPolicySettings()
    await seedWorkflows()
    await seedFormConfigurations()
    await seedAriaConfig()
    await seedCurrencySettings()
    console.info('─'.repeat(50))
    console.info('✅  Seed complete\n')
  } catch (err) {
    console.error('❌  Seed failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
