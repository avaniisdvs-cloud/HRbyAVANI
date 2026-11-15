/**
 * Settings hub categories — Phase 3 redesign.
 *
 * Maps the 7 configuration categories to existing routes.
 * Consumed by the settings hub page and CommandPalette search.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Palette, Users, Banknote, HeartPulse, FileText, Bot, Globe, Mail,
} from 'lucide-react'

export interface SettingsItem {
  id:          string
  labelEn:     string
  labelAr:     string
  hint:        string
  route:       string
  comingSoon?: boolean
  status?:     'warn' | 'review'
  isNew?:      boolean
  /** SUPER_ADMIN-only platform/system item — hidden from HR_ADMIN & HR_DIRECTOR. */
  superAdminOnly?: boolean
}

export interface SettingsCategory {
  id:       string
  labelEn:  string
  labelAr:  string
  icon:     LucideIcon
  tint:     string
  descEn:   string
  descAr:   string
  items:    SettingsItem[]
}

export const SETTINGS_HUB: SettingsCategory[] = [
  {
    id: 'general', labelEn: 'General', labelAr: 'عام',
    icon: Palette, tint: '#374151',
    descEn: 'Workspace identity, locale, and time conventions.',
    descAr: 'هوية مساحة العمل والاتفاقيات الزمنية.',
    items: [
      { id: 'branding',        labelEn: 'Branding',       labelAr: 'العلامة التجارية', hint: 'Logos, colors, themes',         route: '/settings/branding',       superAdminOnly: true },
      { id: 'appearance',      labelEn: 'Appearance',     labelAr: 'المظهر',           hint: 'Light · dark · system',         route: '/settings/appearance' },
      { id: 'work-schedules-g',labelEn: 'Working week',   labelAr: 'أسبوع العمل',      hint: 'Shifts & schedule patterns',    route: '/settings/work-schedules' },
    ],
  },
  {
    id: 'hr', labelEn: 'HR Configuration', labelAr: 'إعدادات الموارد البشرية',
    icon: Users, tint: '#2563EB',
    descEn: 'Policies, leave, compliance, and people processes.',
    descAr: 'السياسات والإجازات والامتثال وعمليات الأفراد.',
    items: [
      { id: 'policy',          labelEn: 'Policy library',   labelAr: 'مكتبة السياسات',    hint: 'Active rules & policies',        route: '/settings/policy' },
      { id: 'compliance',      labelEn: 'Compliance rules', labelAr: 'قواعد الامتثال',    hint: 'UAE Labour Law · 57 rules',       route: '/settings/compliance',     status: 'review' },
      { id: 'leave-rules',     labelEn: 'Leave rules',      labelAr: 'قواعد الإجازة',     hint: 'Accrual · carryover · cap',      route: '/settings/leave-rules' },
      { id: 'absence-types',   labelEn: 'Absence types',    labelAr: 'أنواع الغياب',       hint: '11 types · 3 require docs',      route: '/settings/absence-types' },
      { id: 'work-schedules',  labelEn: 'Work schedules',   labelAr: 'جداول العمل',        hint: 'Shifts · roster patterns',        route: '/master-data/work-schedules' },
      { id: 'emp-numbers',     labelEn: 'Employee numbers', labelAr: 'أرقام الموظفين',     hint: 'Auto · K-00001 series',           route: '/settings/employee-numbers' },
    ],
  },
  {
    id: 'payroll', labelEn: 'Payroll & Finance', labelAr: 'الرواتب والمالية',
    icon: Banknote, tint: '#059669',
    descEn: 'Currencies, pay structure, and bank integration.',
    descAr: 'العملات وهياكل الرواتب والتكامل المصرفي.',
    items: [
      { id: 'currency',       labelEn: 'Company currency',  labelAr: 'عملة الشركة',         hint: 'Multi-currency support',         route: '/settings/currency-setup' },
      { id: 'pay-components', labelEn: 'Pay components',    labelAr: 'مكونات الراتب',       hint: 'Base · allowances · deductions', route: '/payroll/components',      comingSoon: true },
      { id: 'tax-tables',     labelEn: 'Tax tables',        labelAr: 'جداول الضرائب',       hint: 'UAE · KSA · regional',           route: '/payroll/tax',             comingSoon: true },
      { id: 'bank-files',     labelEn: 'Bank file formats', labelAr: 'تنسيقات ملفات البنك', hint: 'MT940 · SAMA · ACH',             route: '/payroll/bank-files',      comingSoon: true },
    ],
  },
  {
    id: 'insurance', labelEn: 'Insurance', labelAr: 'التأمين',
    icon: HeartPulse, tint: '#DC2626',
    descEn: 'Plans, policies, and renewal cycles.',
    descAr: 'الخطط والسياسات ودورات التجديد.',
    items: [
      { id: 'ins-plans',   labelEn: 'Insurance plans',  labelAr: 'خطط التأمين',       hint: 'Plans & coverage tiers',     route: '/settings/insurance-plans',  status: 'warn' },
      { id: 'ins-policy',  labelEn: 'Insurance policy', labelAr: 'وثيقة التأمين',      hint: 'Insurer details & renewal',  route: '/settings/insurance-policy' },
      { id: 'eligibility', labelEn: 'Eligibility',      labelAr: 'الأهلية',             hint: 'Grade-based rules',           route: '/settings/insurance-plans',  comingSoon: true },
      { id: 'claims-wf',   labelEn: 'Claims workflow',  labelAr: 'سير عمل المطالبات',  hint: '3-stage approval',            route: '/settings/insurance-policy', comingSoon: true },
    ],
  },
  {
    id: 'documents', labelEn: 'Documents', labelAr: 'المستندات',
    icon: FileText, tint: '#7C3AED',
    descEn: 'Templates, branding, and document management.',
    descAr: 'القوالب والعلامة التجارية وإدارة المستندات.',
    items: [
      { id: 'doc-branding',    labelEn: 'Document branding', labelAr: 'تصميم المستندات',  hint: 'Letterhead · footers',        route: '/settings/document-branding' },
      { id: 'form-layouts',    labelEn: 'Form layouts',      labelAr: 'تصاميم النماذج',   hint: 'PDF & web forms',             route: '/settings/form-layout' },
      { id: 'custom-fields',   labelEn: 'Custom fields',     labelAr: 'الحقول المخصصة',    hint: 'Employee profile fields',     route: '/settings/custom-fields' },
      { id: 'letter-templates',labelEn: 'Letter templates',  labelAr: 'قوالب الخطابات',   hint: 'HR letter generator',         route: '/settings/letter-templates' },
    ],
  },
  {
    id: 'ai', labelEn: 'AI & Access', labelAr: 'الذكاء الاصطناعي والوصول',
    icon: Bot, tint: '#0891B2',
    descEn: 'ARIA assistant configuration, branding, and access control.',
    descAr: 'إعدادات آريا وهويتها البصرية والتحكم في الوصول.',
    items: [
      { id: 'ai-agent',       labelEn: 'AI Agent (ARIA)',  labelAr: 'وكيل الذكاء (آريا)',  hint: 'Model, behaviour, branding & identity',  route: '/settings/ai-agent',          superAdminOnly: true },
      { id: 'permissions',    labelEn: 'Permissions',      labelAr: 'الصلاحيات',            hint: 'Role-based access control',     route: '/settings/permissions',       superAdminOnly: true },
      { id: 'feature-access', labelEn: 'Feature access',   labelAr: 'الوصول للميزات',       hint: 'Module-level toggles',          route: '/access/feature-permissions', isNew: true, superAdminOnly: true },
    ],
  },
  {
    id: 'system', labelEn: 'System', labelAr: 'النظام',
    icon: Globe, tint: '#64748B',
    descEn: 'Notifications, workflows, delegations, and audit logs.',
    descAr: 'الإشعارات وسير العمل والتفويضات وسجلات التدقيق.',
    items: [
      { id: 'communication', labelEn: 'Communication Settings', labelAr: 'إعدادات الاتصالات', hint: 'Graph API · SMTP · templates', route: '/settings/communication', isNew: true },
      { id: 'notifications', labelEn: 'Notifications', labelAr: 'الإشعارات',    hint: 'Email · SMS · in-app',            route: '/settings/notifications' },
      { id: 'workflows',     labelEn: 'Workflows',     labelAr: 'سير العمل',    hint: 'HR approval workflow templates',   route: '/settings/workflows' },
      { id: 'delegations',   labelEn: 'Delegations',   labelAr: 'التفويضات',    hint: 'Approval delegation rules',        route: '/settings/delegations' },
      { id: 'integrations',  labelEn: 'Integrations',  labelAr: 'التكاملات',    hint: '12 connected',                    route: '/settings/integrations',  comingSoon: true, superAdminOnly: true },
      { id: 'api-webhooks',  labelEn: 'API & webhooks',labelAr: 'واجهة برمجية', hint: 'Tokens, rate limits',             route: '/settings/api-webhooks',  comingSoon: true, superAdminOnly: true },
      { id: 'audit-log',     labelEn: 'Audit log',     labelAr: 'سجل التدقيق',  hint: 'Retention: 7 years',              route: '/settings/audit-log',     comingSoon: true },
    ],
  },
]
