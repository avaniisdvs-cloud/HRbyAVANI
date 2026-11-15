/**
 * UAT Migration Load Console — canonical master-data manifest.
 *
 * Pure typed data derived from docs/migration-factory/PHASE2-master-data-blueprint.md.
 * No DB calls, no side effects. FK targets are referenced by CODE; the seed action
 * resolves them to UUIDs at runtime. Arabic names fall back to English (auto-translate
 * can refine later — see lib/translation.ts).
 */

export const ENTITY_CODE = 'AVN-001' as const

export interface BusinessUnitDef { code: string; nameEn: string; nameAr: string }
export interface GradeDef        { code: string; nameEn: string; nameAr: string; level: number }
export interface LocationDef     { code: string; nameEn: string; nameAr: string; emirate: string }
export interface DepartmentDef   { code: string; nameEn: string; nameAr: string; headEmployeeNumber: string }
export interface PositionDef     { code: string; titleEn: string; deptCode: string; isHod: boolean }

export const BUSINESS_UNIT: BusinessUnitDef = {
  code: 'KPD-BU-01', nameEn: 'Avaniis Property Development', nameAr: 'أفانيس لتطوير العقارات',
}

export const GRADE: GradeDef = {
  code: 'KPD-G-01', nameEn: 'Standard', nameAr: 'معياري', level: 1,
}

export const LOCATIONS: LocationDef[] = [
  { code: 'KPD-LOC-01', nameEn: 'Avaniis Reserve Office', nameAr: 'مكتب محمية أفانيس', emirate: 'Dubai' },
  { code: 'KPD-LOC-02', nameEn: 'DIFC Office',            nameAr: 'مكتب مركز دبي المالي', emirate: 'Dubai' },
  { code: 'KPD-LOC-03', nameEn: 'Umm Al Sheif Office',    nameAr: 'مكتب أم الشيف',     emirate: 'Dubai' },
  { code: 'KPD-LOC-04', nameEn: 'Avaniis Resort Office',  nameAr: 'مكتب منتجع أفانيس', emirate: 'Dubai' },
]

/** Default office all pilot employees are assigned to (Decision 6). */
export const DEFAULT_LOCATION_CODE = 'KPD-LOC-01' as const

export const DEPARTMENTS: DepartmentDef[] = [
  { code: 'KPD-DP-001', nameEn: 'Development & Project Delivery',     nameAr: 'التطوير وتسليم المشاريع', headEmployeeNumber: 'K817'  },
  { code: 'KPD-DP-002', nameEn: 'Finance & Strategic Control',        nameAr: 'المالية والرقابة الاستراتيجية', headEmployeeNumber: 'K1051' },
  { code: 'KPD-DP-003', nameEn: 'Commercial & Revenue Operations',    nameAr: 'العمليات التجارية والإيرادات', headEmployeeNumber: 'K343'  },
  { code: 'KPD-DP-004', nameEn: 'Technology & Digital Transformation', nameAr: 'التكنولوجيا والتحول الرقمي', headEmployeeNumber: 'K1207' },
  { code: 'KPD-DP-005', nameEn: 'People & Organizational Intelligence', nameAr: 'الموارد البشرية والذكاء المؤسسي', headEmployeeNumber: 'K870'  },
  { code: 'KPD-DP-006', nameEn: 'Corporate Services & Governance',     nameAr: 'الخدمات المؤسسية والحوكمة', headEmployeeNumber: 'K33'   },
]

/** Department code by File-01 position-code prefix. */
export const DEPT_BY_PREFIX: Record<string, string> = {
  DEV: 'KPD-DP-001', FIN: 'KPD-DP-002', COM: 'KPD-DP-003',
  TEC: 'KPD-DP-004', PEO: 'KPD-DP-005', COR: 'KPD-DP-006',
}

// 48 positions (source File-01 codes kept verbatim per decision). [code, titleEn, isHod]
const RAW_POSITIONS: [string, string, boolean][] = [
  ['DEV-P001', 'Director of Project Delivery', true],
  ['DEV-P002', 'Senior Design Architect', false],
  ['DEV-P003', 'Design & Creative Manager', false],
  ['DEV-P004', 'Lead Design Architect', false],
  ['DEV-P005', 'Branding & Communications Manager', false],
  ['DEV-P006', 'Junior Design Architect', false],
  ['DEV-P007', 'Senior Project Control Specialist', false],
  ['DEV-P008', 'Project Architect', false],
  ['DEV-P009', 'Site Operations Supervisor', false],
  ['DEV-P010', 'Quality Assurance Specialist', false],
  ['DEV-P011', 'QA/QC Inspector', false],
  ['DEV-P012', 'AI Project Coordinator', false],
  ['DEV-P013', 'Project Documentation Manager', false],
  ['DEV-P014', 'Project Operations Specialist', false],
  ['DEV-P015', 'Project Engineering Specialist', false],
  ['FIN-P001', 'Chief Financial Officer', true],
  ['FIN-P002', 'Finance Operations Manager', false],
  ['FIN-P003', 'Senior Financial Specialist', false],
  ['FIN-P004', 'Financial Accounting Specialist', false],
  ['FIN-P005', 'Finance Operations Accountant', false],
  ['FIN-P006', 'Financial Analyst Specialist', false],
  ['COM-P001', 'Senior Portfolio Manager - CRM & Collections', false],
  ['COM-P002', 'Service Performance Analyst', false],
  ['COM-P003', 'Commercial Operations Manager', false],
  ['COM-P004', 'Commercial Contracts Manager', false],
  ['COM-P005', 'Client Relationship Manager', true],
  ['COM-P006', 'Security & Safety Manager', false],
  ['COM-P007', 'Fleet & Logistics Coordinator', false],
  ['COM-P008', 'Facilities & Services Manager', false],
  ['COM-P009', 'Marine Operations Lead', false],
  ['TEC-P001', 'Director of Technology & Innovation', true],
  ['TEC-P002', 'ConTech Innovation Manager', false],
  ['TEC-P003', 'Property Technology Manager', false],
  ['TEC-P004', 'Enterprise Systems Manager', false],
  ['TEC-P005', 'ERP Technical Lead', false],
  ['TEC-P006', 'ConTech Technical Lead', false],
  ['TEC-P007', 'Infrastructure Technology Lead', false],
  ['TEC-P008', 'Mobility Technology Lead', false],
  ['TEC-P009', 'IT Support Specialist', false],
  ['TEC-P010', 'Salesforce Technology Lead', false],
  ['PEO-P001', 'HR Admin Operations Manager', true],
  ['PEO-P002', 'Head of Governance & Compliance', false],
  ['COR-P001', 'Chief Executive Officer & Strategic Leader', true],
  ['COR-P002', 'Strategic Operations Lead', false],
  ['COR-P003', 'Business Transformation Coordinator', false],
  ['COR-P004', 'Business Transformation Executor', false],
  ['COR-P005', 'CEO Office Assistant', false],
  ['COR-P006', 'Operations Executive', false],
]

export const POSITIONS: PositionDef[] = RAW_POSITIONS.map(([code, titleEn, isHod]) => ({
  code, titleEn, isHod, deptCode: DEPT_BY_PREFIX[code.split('-')[0]],
}))

/** Job code derived from position code (…-P### → …-J###). Job title == position title. */
export const jobCodeForPosition = (positionCode: string): string => positionCode.replace('-P', '-J')

export const MANIFEST_SUMMARY = {
  entityCode: ENTITY_CODE,
  businessUnits: 1,
  grades: 1,
  locations: LOCATIONS.length,
  departments: DEPARTMENTS.length,
  positions: POSITIONS.length,
  jobs: POSITIONS.length,
} as const
