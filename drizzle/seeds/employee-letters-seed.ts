/**
 * Seed: letter_field_registry (19 tokens), letter_template_types (8 types),
 *       letter_templates (1 default PCL template)
 *
 * Run: pnpm tsx drizzle/seeds/employee-letters-seed.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  letterFieldRegistry,
  letterTemplateTypes,
  letterTemplates,
} from '../schema/employee-letters'

const SYSTEM_USER_ID  = '00000000-0000-0000-0000-000000000001'
const SYSTEM_USER_NAME = 'System'

// Use DATABASE_URL (same as every other seed) — loaded from .env.local above
const client = postgres(process.env.DATABASE_URL!)
const db     = drizzle(client)

// ── 19 Token definitions ──────────────────────────────────────────────────────

const TOKENS = [
  // PERSON category
  { tokenKey: 'employee_name',        labelEn: 'Employee Full Name (EN)',   labelAr: 'اسم الموظف (إنجليزي)', category: 'PERSON',   dataType: 'string' },
  { tokenKey: 'employee_name_ar',     labelEn: 'Employee Full Name (AR)',   labelAr: 'اسم الموظف (عربي)',    category: 'PERSON',   dataType: 'string' },
  { tokenKey: 'employee_number',      labelEn: 'Employee Number',           labelAr: 'رقم الموظف',           category: 'PERSON',   dataType: 'string' },
  { tokenKey: 'nationality',          labelEn: 'Nationality',               labelAr: 'الجنسية',              category: 'PERSON',   dataType: 'string' },
  { tokenKey: 'passport_number',      labelEn: 'Passport Number',           labelAr: 'رقم جواز السفر',       category: 'PERSON',   dataType: 'string' },
  { tokenKey: 'emirates_id',          labelEn: 'Emirates ID',               labelAr: 'الهوية الإماراتية',    category: 'PERSON',   dataType: 'string' },
  // POSITION category
  { tokenKey: 'job_title',            labelEn: 'Job Title (EN)',            labelAr: 'المسمى الوظيفي (إنجليزي)', category: 'POSITION', dataType: 'string' },
  { tokenKey: 'job_title_ar',         labelEn: 'Job Title (AR)',            labelAr: 'المسمى الوظيفي (عربي)',    category: 'POSITION', dataType: 'string' },
  { tokenKey: 'department',           labelEn: 'Department (EN)',           labelAr: 'القسم (إنجليزي)',       category: 'POSITION', dataType: 'string' },
  { tokenKey: 'department_ar',        labelEn: 'Department (AR)',           labelAr: 'القسم (عربي)',          category: 'POSITION', dataType: 'string' },
  { tokenKey: 'hire_date',            labelEn: 'Hire Date',                 labelAr: 'تاريخ التوظيف',        category: 'POSITION', dataType: 'date'   },
  { tokenKey: 'probation_end_date',   labelEn: 'Probation End Date',        labelAr: 'تاريخ نهاية التجربة',  category: 'POSITION', dataType: 'date'   },
  { tokenKey: 'basic_salary',         labelEn: 'Basic Salary',              labelAr: 'الراتب الأساسي',       category: 'POSITION', dataType: 'currency' },
  { tokenKey: 'air_ticket_entitlement', labelEn: 'Air Ticket Entitlement',  labelAr: 'استحقاق تذكرة الطيران', category: 'POLICY',  dataType: 'string' },
  // ENTITY category
  { tokenKey: 'company_name',         labelEn: 'Company Name (EN)',         labelAr: 'اسم الشركة (إنجليزي)', category: 'ENTITY',   dataType: 'string' },
  { tokenKey: 'company_name_ar',      labelEn: 'Company Name (AR)',         labelAr: 'اسم الشركة (عربي)',    category: 'ENTITY',   dataType: 'string' },
  { tokenKey: 'signatory_name',       labelEn: 'Signatory Name',            labelAr: 'اسم الموقّع',          category: 'ENTITY',   dataType: 'string' },
  { tokenKey: 'signatory_title',      labelEn: 'Signatory Title (EN)',      labelAr: 'لقب الموقّع (إنجليزي)',category: 'ENTITY',   dataType: 'string' },
  // LETTER category
  { tokenKey: 'letter_date',          labelEn: 'Letter Date',               labelAr: 'تاريخ الخطاب',         category: 'LETTER',   dataType: 'date'   },
  { tokenKey: 'letter_number',        labelEn: 'Letter Number',             labelAr: 'رقم الخطاب',           category: 'LETTER',   dataType: 'string' },
]

// ── 8 Letter template types ───────────────────────────────────────────────────

const TYPES = [
  { typeCode: 'TER', nameEn: 'Termination Letter',            nameAr: 'خطاب إنهاء الخدمة',                   numberPrefix: 'TER', requiresApproval: false, allowEssSelfRequest: false },
  { typeCode: 'PCL', nameEn: 'Probation Confirmation Letter', nameAr: 'خطاب تأكيد اجتياز فترة التجربة',      numberPrefix: 'PCL', requiresApproval: false, allowEssSelfRequest: false },
  { typeCode: 'SAL', nameEn: 'Salary Amendment Letter',       nameAr: 'خطاب تعديل الراتب',                   numberPrefix: 'SAL', requiresApproval: true,  allowEssSelfRequest: false },
  { typeCode: 'PML', nameEn: 'Promotion Letter',              nameAr: 'خطاب ترقية',                           numberPrefix: 'PML', requiresApproval: true,  allowEssSelfRequest: false },
  { typeCode: 'DCL', nameEn: 'Designation Change Letter',     nameAr: 'خطاب تغيير المسمى الوظيفي',            numberPrefix: 'DCL', requiresApproval: true,  allowEssSelfRequest: false },
  { typeCode: 'EML', nameEn: 'Employment Letter',             nameAr: 'خطاب توظيف',                           numberPrefix: 'EML', requiresApproval: false, allowEssSelfRequest: true  },
  { typeCode: 'SC',  nameEn: 'Salary Certificate',            nameAr: 'شهادة راتب',                           numberPrefix: 'SC',  requiresApproval: false, allowEssSelfRequest: true  },
  { typeCode: 'STL', nameEn: 'Salary Transfer Letter',        nameAr: 'خطاب تحويل راتب',                      numberPrefix: 'STL', requiresApproval: true,  allowEssSelfRequest: true  },
  // ESS expansion — added by migration 0049
  { typeCode: 'LRL', nameEn: 'Loan Request Letter',           nameAr: 'خطاب طلب قرض',                         numberPrefix: 'LRL', requiresApproval: false, allowEssSelfRequest: true  },
  { typeCode: 'NDL', nameEn: 'NOC for Driving License',       nameAr: 'شهادة عدم ممانعة - رخصة القيادة',      numberPrefix: 'NDL', requiresApproval: false, allowEssSelfRequest: true  },
  { typeCode: 'NTV', nameEn: 'NOC for Travel / Visa',         nameAr: 'شهادة عدم ممانعة - سفر/تأشيرة',        numberPrefix: 'NTV', requiresApproval: false, allowEssSelfRequest: true  },
]

// ── Probation Confirmation Letter default template ────────────────────────────

const PCL_BODY_EN = `<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>Dear {{employee_name}},</p>

<p>We are pleased to inform you that following a satisfactory review of your performance during your probation period,
you have successfully completed your probation period that commenced on {{hire_date}} and ended on {{probation_end_date}}.</p>

<p>Effective from {{probation_end_date}}, you are confirmed as a permanent employee of {{company_name}}
in the position of <strong>{{job_title}}</strong>, {{department}}.</p>

<p>Your basic salary of <strong>{{basic_salary}}</strong> per month remains unchanged.</p>

<p>We look forward to your continued contribution to the organisation.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>`

const PCL_BODY_AR = `<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>السيد/السيدة {{employee_name_ar}} المحترم/ة،</p>

<p>يسعدنا إبلاغكم بأنه بعد مراجعة أدائكم خلال فترة التجربة والاطمئنان على مستواه،
فقد أتممتم فترة التجربة التي بدأت في {{hire_date}} وانتهت في {{probation_end_date}} بنجاح.</p>

<p>اعتباراً من {{probation_end_date}}، يُعدّ انضمامكم دائماً إلى {{company_name_ar}}
في منصب <strong>{{job_title_ar}}</strong>، {{department_ar}}.</p>

<p>يبقى راتبكم الأساسي <strong>{{basic_salary}}</strong> شهرياً دون تغيير.</p>

<p>نتطلع إلى استمرار مساهمتكم الفاعلة في نجاح المؤسسة.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>`

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding letter_field_registry...')
  await db.insert(letterFieldRegistry).values(
    TOKENS.map(t => ({
      ...t,
      tenantId:      SYSTEM_USER_ID,
      createdBy:     SYSTEM_USER_ID,
      createdByName: SYSTEM_USER_NAME,
    }))
  ).onConflictDoNothing()
  console.log(`  ✓ ${TOKENS.length} tokens`)

  console.log('Seeding letter_template_types...')
  const insertedTypes = await db.insert(letterTemplateTypes).values(
    TYPES.map(t => ({
      ...t,
      tenantId:      SYSTEM_USER_ID,
      createdBy:     SYSTEM_USER_ID,
      createdByName: SYSTEM_USER_NAME,
    }))
  ).onConflictDoNothing().returning({ id: letterTemplateTypes.id, typeCode: letterTemplateTypes.typeCode })
  console.log(`  ✓ ${insertedTypes.length} letter types`)

  const pclType = insertedTypes.find(t => t.typeCode === 'PCL')
  if (pclType) {
    console.log('Seeding default PCL template...')
    await db.insert(letterTemplates).values({
      tenantId:      SYSTEM_USER_ID,
      typeId:        pclType.id,
      nameEn:        'Default Probation Confirmation Letter',
      nameAr:        'نموذج افتراضي - خطاب تأكيد اجتياز فترة التجربة',
      bodyEn:        PCL_BODY_EN,
      bodyAr:        PCL_BODY_AR,
      isDefault:     true,
      isActive:      true,
      version:       1,
      createdBy:     SYSTEM_USER_ID,
      createdByName: SYSTEM_USER_NAME,
    })
    console.log('  ✓ PCL default template')
  }

  await client.end()
  console.log('Done.')
}

seed().catch(err => { console.error(err); process.exit(1) })
