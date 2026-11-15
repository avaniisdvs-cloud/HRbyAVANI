/**
 * Administration landing model (Option C1).
 *
 * Single source for the simplified, grouped /settings landing page. Each card's
 * `roles` is the set of roles that may SEE the card — set to mirror the target
 * page's actual route guard so a visible card never leads to a forbidden
 * redirect. Group/role policy:
 *   - Payroll group: hidden from HR_ADMIN (per approved IA) even though some
 *     payroll pages technically permit HR_ADMIN.
 *   - Platform & System: SUPER_ADMIN only (Option B).
 *
 * This does NOT change any route guard, permission, or data ownership — it only
 * controls which cards render on the landing. Existing routes/guards are intact.
 */

import type { LucideIcon } from 'lucide-react'
import {
  ShieldCheck, Building2, CalendarClock, Banknote, UserCog, KeyRound, ServerCog, HeartPulse,
} from 'lucide-react'

export type AdminRole =
  | 'HR_ADMIN' | 'HR_DIRECTOR' | 'SUPER_ADMIN' | 'PAYROLL_ADMIN' | 'FINANCE'

export interface AdminCard {
  id:       string
  titleEn:  string
  titleAr:  string
  descEn:   string
  route:    string
  roles:    AdminRole[]      // who may SEE this card (mirrors the page guard)
  countKey?: string          // key into the counts map resolved server-side
  badge?:   'SOON'
}

export interface AdminGroup {
  id:       string
  titleEn:  string
  titleAr:  string
  descEn:   string
  icon:     LucideIcon
  tint:     string
  superAdminOnly?: boolean    // entire group hidden from non-SUPER_ADMIN
  cards:    AdminCard[]
}

const A: AdminRole = 'HR_ADMIN'
const D: AdminRole = 'HR_DIRECTOR'
const S: AdminRole = 'SUPER_ADMIN'
const P: AdminRole = 'PAYROLL_ADMIN'
const F: AdminRole = 'FINANCE'

export const ADMIN_LANDING: AdminGroup[] = [
  {
    id: 'hr-policies', titleEn: 'HR Policies', titleAr: 'سياسات الموارد البشرية',
    descEn: 'Statutory compliance and the active policy library.', icon: ShieldCheck, tint: '#4F46E5',
    cards: [
      { id: 'compliance',     titleEn: 'Compliance Rules', titleAr: 'قواعد الامتثال', descEn: 'UAE Labour Law rule set', route: '/settings/compliance', roles: [A, D, S], countKey: 'compliance' },
      { id: 'policy-library', titleEn: 'Policy Library',    titleAr: 'مكتبة السياسات', descEn: 'Active HR policies',       route: '/settings/policy',     roles: [D, S] },
    ],
  },
  {
    // Organization workspace is the SINGLE OWNER of org master data (legal
    // entities, business units, departments, positions, grades, jobs, locations,
    // work schedules, holiday calendars, projects, leave types). Administration
    // only SHORTCUTS into it — it must NOT duplicate the individual MDM items.
    // /master-data redirects to /master-data/legal-entities (the Organization
    // workspace entry point). All MDM pages remain reachable there.
    id: 'org-setup', titleEn: 'Organization Setup', titleAr: 'إعداد المؤسسة',
    descEn: 'Organisational structure and people master data.', icon: Building2, tint: '#0F766E',
    cards: [
      { id: 'open-org', titleEn: 'Open Organization', titleAr: 'فتح المؤسسة', descEn: 'Legal entities, business units, departments, positions, grades, jobs, locations, work schedules, holiday calendars and projects.', route: '/master-data', roles: [A, D, S] },
    ],
  },
  {
    id: 'leave-time', titleEn: 'Leave & Time', titleAr: 'الإجازات والوقت',
    descEn: 'Leave entitlement, absence types, schedules and holidays.', icon: CalendarClock, tint: '#2563EB',
    cards: [
      // Leave Rules, Absence Types and Backdate Policy are genuine Administration
      // config. Work Schedules and Holiday Calendars are Organization master data
      // (owned by the Organization workspace → Geography) — reach them via the
      // "Open Organization" shortcut above, not duplicated here.
      { id: 'leave-rules',     titleEn: 'Leave Rules',       titleAr: 'قواعد الإجازة',   descEn: 'Accrual, carry-over and cap rules', route: '/settings/leave-rules',          roles: [A, D, S], countKey: 'leaveRules' },
      { id: 'absence-types',   titleEn: 'Absence Types',     titleAr: 'أنواع الغياب',     descEn: 'Leave categories & document rules', route: '/settings/absence-types',        roles: [A, D, S], countKey: 'absenceTypes' },
      { id: 'backdate-policy', titleEn: 'Backdate Policy',   titleAr: 'سياسة الإدخال بأثر رجعي', descEn: 'Per-entity backdating limits', route: '/absence/backdate-policy',     roles: [A, D, S] },
    ],
  },
  {
    id: 'payroll', titleEn: 'Payroll', titleAr: 'الرواتب',
    descEn: 'Currency and pay structure.', icon: Banknote, tint: '#059669',
    cards: [
      // B1b — Company Currency restored for HR_ADMIN (its page guard permits
      // A,D,S and it was reachable before C1). The run/pay-component/WPS items
      // stay D,S,PAYROLL,FINANCE — HR_ADMIN is NOT exposed to those.
      { id: 'currency',       titleEn: 'Company Currency', titleAr: 'عملة الشركة',   descEn: 'Multi-currency support',        route: '/settings/currency-setup',   roles: [A, D, S] },
      { id: 'pay-components', titleEn: 'Pay Components',   titleAr: 'مكونات الراتب', descEn: 'Base · allowances · deductions', route: '/payroll/definitions',       roles: [D, S, P, F] },
      { id: 'salary-elements',titleEn: 'Salary Elements', titleAr: 'عناصر الراتب',  descEn: 'Earning & deduction elements',  route: '/payroll/salary-elements',   roles: [D, S, P, F] },
      { id: 'payroll-runs',   titleEn: 'Payroll Runs',    titleAr: 'دورات الرواتب', descEn: 'Run schedule & cut-off',        route: '/payroll/runs',              roles: [D, S, P, F] },
      { id: 'wps',            titleEn: 'WPS File',        titleAr: 'ملف حماية الأجور', descEn: 'UAE WPS / SIF export',        route: '/payroll/wps',               roles: [D, S, P, F] },
    ],
  },
  {
    // B1b — Insurance settings were reachable before C1 (page guards A,D,S) but
    // were dropped from the landing. Restored as their own group.
    id: 'insurance', titleEn: 'Insurance', titleAr: 'التأمين',
    descEn: 'Medical insurance plans and policy configuration.', icon: HeartPulse, tint: '#DC2626',
    cards: [
      { id: 'insurance-plans',  titleEn: 'Insurance Plans',  titleAr: 'خطط التأمين',   descEn: 'Plans & coverage tiers',  route: '/settings/insurance-plans',  roles: [A, D, S] },
      { id: 'insurance-policy', titleEn: 'Insurance Policy', titleAr: 'وثيقة التأمين',  descEn: 'Insurer details & renewal', route: '/settings/insurance-policy', roles: [A, D, S] },
    ],
  },
  {
    id: 'lifecycle', titleEn: 'Employee Lifecycle', titleAr: 'دورة حياة الموظف',
    descEn: 'Numbering, fields, forms and document templates.', icon: UserCog, tint: '#9333EA',
    cards: [
      { id: 'employee-numbers', titleEn: 'Employee Numbering', titleAr: 'ترقيم الموظفين', descEn: 'Auto K-00001 series',        route: '/settings/employee-numbers',  roles: [A, D, S] },
      { id: 'custom-fields',    titleEn: 'Custom Fields',      titleAr: 'الحقول المخصصة', descEn: 'Employee profile fields',    route: '/settings/custom-fields',     roles: [D, S] },
      { id: 'form-layout',      titleEn: 'Form Layout',        titleAr: 'تخطيط النماذج',  descEn: 'PDF & web form layouts',     route: '/settings/form-layout',       roles: [D, S] },
      // B1b (optional) — Appearance moved out of the Super-only Platform group so
      // HR_DIRECTOR (whose page guard permits D,S) is not accidentally locked out.
      // HR_ADMIN is excluded to match the /settings/appearance guard.
      { id: 'appearance',       titleEn: 'Appearance',         titleAr: 'المظهر',         descEn: 'Theme & display defaults',   route: '/settings/appearance',        roles: [D, S] },
      { id: 'letter-templates', titleEn: 'Letter Templates',   titleAr: 'قوالب الخطابات', descEn: 'HR letter generator',        route: '/settings/letter-templates',  roles: [A, D, S] },
      { id: 'doc-branding',     titleEn: 'Document Branding',  titleAr: 'تصميم المستندات', descEn: 'Letterhead & footers',      route: '/settings/document-branding', roles: [A, S] },
    ],
  },
  {
    id: 'access', titleEn: 'Access & Delegations', titleAr: 'الوصول والتفويضات',
    descEn: 'Approval delegation, workflows and notifications.', icon: KeyRound, tint: '#7C3AED',
    cards: [
      { id: 'delegations',  titleEn: 'Delegations',        titleAr: 'التفويضات',     descEn: 'Approval delegation rules',  route: '/settings/delegations',  roles: [A, D, S] },
      { id: 'workflows',    titleEn: 'Approval Workflows', titleAr: 'سير الموافقات', descEn: 'HR approval templates',      route: '/settings/workflows',    roles: [D, S] },
      { id: 'notifications',titleEn: 'Notifications',      titleAr: 'الإشعارات',      descEn: 'Email & in-app alerts',     route: '/settings/notifications',roles: [D, S] },
    ],
  },
  {
    id: 'platform', titleEn: 'Platform & System', titleAr: 'المنصة والنظام',
    descEn: 'System-wide controls — Super Admin only.', icon: ServerCog, tint: '#334155',
    superAdminOnly: true,
    cards: [
      { id: 'feature-permissions', titleEn: 'Feature Permissions', titleAr: 'صلاحيات الميزات', descEn: 'Module-level RBAC toggles',     route: '/access/feature-permissions', roles: [S] },
      { id: 'permissions',         titleEn: 'Permissions (RBAC)',  titleAr: 'الصلاحيات',        descEn: 'Role-based access control',     route: '/settings/permissions',       roles: [S] },
      { id: 'ai-agent',            titleEn: 'AI Agent (ARIA)',     titleAr: 'وكيل الذكاء (آريا)', descEn: 'Model, behaviour, branding, API', route: '/settings/ai-agent',       roles: [S] },
      { id: 'branding',            titleEn: 'Global Branding',     titleAr: 'الهوية البصرية',   descEn: 'Org-wide visual identity',     route: '/settings/branding',          roles: [S] },
      { id: 'integrations',        titleEn: 'Integrations',        titleAr: 'التكاملات',        descEn: 'Connected systems',            route: '/settings/integrations',      roles: [S], badge: 'SOON' },
      { id: 'api-webhooks',        titleEn: 'API & Webhooks',      titleAr: 'واجهة برمجية',     descEn: 'Tokens & rate limits',         route: '/settings/api-webhooks',      roles: [S], badge: 'SOON' },
    ],
  },
]

/**
 * Resolve the groups + cards visible to a given role. A group is shown only when
 * it has at least one visible card and the SUPER_ADMIN-only gate passes.
 */
export function visibleAdminGroups(role: string): AdminGroup[] {
  const isSuper = role === 'SUPER_ADMIN'
  return ADMIN_LANDING
    .filter(g => !g.superAdminOnly || isSuper)
    .map(g => ({ ...g, cards: g.cards.filter(c => c.roles.includes(role as AdminRole)) }))
    .filter(g => g.cards.length > 0)
}
