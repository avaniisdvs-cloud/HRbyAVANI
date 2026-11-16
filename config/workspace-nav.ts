/**
 * Workspace navigation — Phase 1 redesign (README §2 IA).
 *
 * 11 task-oriented workspaces that replace the flat grouped AdminSidebar.
 * Every existing route is preserved exactly; only the visual home changes.
 * Routes marked `comingSoon: true` have no current URL — the backend module
 * exists but no page has been built yet (Payroll).
 *
 * Consumed by: WorkspaceRail, WorkspaceSecondaryNav
 *
 * ⚠️ REGRESSION GUARD — TWO NAV FILES MUST STAY IN SYNC:
 *   THIS FILE  → used by HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN (WorkspaceSecondaryNav)
 *   admin-nav.ts → used by MANAGER role only (AdminSidebar)
 *
 * Adding a new MDM route? Add it to BOTH files or admin-only users will lose it here.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Home,
  Users,
  Building2,
  CalendarDays,
  Banknote,
  GitBranch,
  FileText,
  BarChart3,
  Bot,
  ShieldCheck,
  Database,
  Upload,
  Network,
  Grid,
  ClipboardCheck,
  LogOut,
  Lock,
  CalendarCheck,
  CalendarClock,
  Clock,
  Building,
  Briefcase,
  Layers,
  MapPin,
  CalendarRange,
  Tag,
  Wrench,
  HeartPulse,
  Settings2,
  Boxes,
  FolderKanban,
  Mail,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkspaceItem {
  id:          string
  labelEn:     string
  labelAr:     string
  icon?:       LucideIcon
  route:       string
  /** Prefix for active-state matching (overrides route when set) */
  match?:      string
  isNew?:      boolean
  comingSoon?: boolean
  /** SUPER_ADMIN-only item — hidden from HR_ADMIN & HR_DIRECTOR in the secondary nav. */
  superAdminOnly?: boolean
  /** Restrict visibility to these roles (in addition to SUPER_ADMIN, who always sees all). */
  allowedRoles?: string[]
}

export interface WorkspaceNavGroup {
  /** Optional section heading inside the secondary nav */
  label?:   string
  labelAr?: string
  items:    WorkspaceItem[]
}

export interface Workspace {
  id:             string
  labelEn:        string
  labelAr:        string
  icon:           LucideIcon
  /** Keyboard shortcut hint shown in expanded rail */
  shortcut?:      string
  /** Direct route for single-page workspaces (no secondary nav needed) */
  route?:         string
  match?:         string
  nav:            WorkspaceNavGroup[]
  superAdminOnly?: boolean
}

export type WorkspaceConfig = Workspace[]

// ── Helper — resolve active workspace from pathname ───────────────────────────

export function getActiveWorkspaceId(
  pathname: string,
  workspaces: WorkspaceConfig,
  role?: string,
): string | null {
  const visible = role === 'SUPER_ADMIN'
    ? workspaces
    : workspaces.filter(w => !w.superAdminOnly)

  for (const ws of visible) {
    for (const group of ws.nav) {
      for (const item of group.items) {
        if (item.comingSoon) continue
        const prefix = item.match ?? item.route
        if (prefix === '/dashboard') {
          if (pathname === '/dashboard') return ws.id
          continue
        }
        if (pathname === prefix || pathname.startsWith(prefix + '/')) {
          return ws.id
        }
      }
    }
    // workspace-level direct route (no secondary nav)
    if (ws.route) {
      const wsPrefix = ws.match ?? ws.route
      if (pathname === wsPrefix || pathname.startsWith(wsPrefix + '/')) {
        return ws.id
      }
    }
  }
  return null
}

// ── Payroll workstream nav gate ───────────────────────────────────────────────
//
// COSMETIC nav-visibility mirror of the authoritative server-side payroll gate
// (lib/features/payroll-feature-gate.ts → PAYROLL_WORKSTREAM_ENABLED). This client
// mirror only controls whether the Payroll workspace appears in navigation; it can
// NEVER grant access. The real gate lives in payroll/layout.tsx + payroll server
// actions. Default: hidden (Payroll deferred from the Core HR-only release).
export function isPayrollNavEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED === 'true'
}

/**
 * Role- AND feature-filtered workspace list for navigation surfaces.
 * Removes SUPER_ADMIN-only workspaces for non-super-admins, and removes the
 * Payroll workspace entirely unless the payroll workstream is enabled.
 */
export function getVisibleWorkspaces(role?: string): WorkspaceConfig {
  const base = role === 'SUPER_ADMIN'
    ? WORKSPACE_NAV
    : WORKSPACE_NAV.filter(w => !w.superAdminOnly)
  return isPayrollNavEnabled() ? base : base.filter(w => w.id !== 'payroll')
}

// ── 11 workspaces ─────────────────────────────────────────────────────────────

export const WORKSPACE_NAV: WorkspaceConfig = [
  // 1 — Overview
  {
    id:       'overview',
    labelEn:  'Overview',
    labelAr:  'نظرة عامة',
    icon:     Home,
    shortcut: '⌘1',
    nav: [
      {
        items: [
          { id: 'dashboard',  labelEn: 'Dashboard',  labelAr: 'لوحة التحكم', icon: Home,         route: '/dashboard' },
          { id: 'approvals',  labelEn: 'Approvals',  labelAr: 'الموافقات',   icon: ClipboardCheck, route: '/approvals', match: '/approvals' },
          { id: 'workflow-operations', labelEn: 'Workflow Operations', labelAr: 'عمليات سير العمل', icon: BarChart3, route: '/approvals/operations', match: '/approvals/operations', allowedRoles: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'], isNew: true },
        ],
      },
    ],
  },

  // 2 — People
  {
    id:       'people',
    labelEn:  'People',
    labelAr:  'الأفراد',
    icon:     Users,
    shortcut: '⌘2',
    nav: [
      {
        items: [
          { id: 'employees', labelEn: 'Employees',         labelAr: 'الموظفون',                icon: Users,   route: '/persons' },
          { id: 'directory', labelEn: 'Directory',         labelAr: 'الدليل',                  icon: Grid,    route: '/directory' },
          { id: 'org-chart', labelEn: 'Employee Organization Structure',         labelAr: 'الهيكل التنظيمي للموظفين',         icon: Network, route: '/org-chart' },
          { id: 'my-team',   labelEn: 'My Team',           labelAr: 'فريقي',                   icon: Users,   route: '/my-team',  match: '/my-team' },
          { id: 'import',    labelEn: 'Import Employees',  labelAr: 'استيراد الموظفين',        icon: Upload,  route: '/persons/import', match: '/persons/import', isNew: true },
        ],
      },
      {
        label:   'Lifecycle',
        labelAr: 'دورة حياة الموظف',
        items: [
          { id: 'probation',     labelEn: 'Probation',     labelAr: 'فترة التجربة',        icon: ClipboardCheck, route: '/admin/probation',     match: '/admin/probation' },
          { id: 'exit',          labelEn: 'Exit Clearance', labelAr: 'إجراءات المغادرة',    icon: LogOut,         route: '/admin/exit-clearance', match: '/admin/exit-clearance' },
        ],
      },
      {
        label:   'Access',
        labelAr: 'الوصول',
        items: [
          { id: 'users-roles', labelEn: 'Users & Roles', labelAr: 'المستخدمون والصلاحيات', icon: ShieldCheck, route: '/users' },
        ],
      },
    ],
  },

  // 3 — Organization (= Master Data)
  {
    id:       'org',
    labelEn:  'Organization',
    labelAr:  'المنظمة',
    icon:     Building2,
    shortcut: '⌘3',
    nav: [
      {
        items: [
          { id: 'legal-entities',  labelEn: 'Legal Entities',  labelAr: 'الكيانات القانونية', icon: Building2, route: '/master-data/legal-entities' },
          { id: 'business-units', labelEn: 'Business Units', labelAr: 'وحدات العمل',        icon: Boxes,     route: '/master-data/business-units' },
          { id: 'departments',    labelEn: 'Departments',    labelAr: 'الأقسام',             icon: Building,  route: '/master-data/departments' },
          { id: 'positions',      labelEn: 'Positions',      labelAr: 'المناصب',            icon: Briefcase, route: '/master-data/positions' },
          { id: 'grades',         labelEn: 'Grades',         labelAr: 'الدرجات',            icon: Layers,    route: '/master-data/grades' },
        ],
      },
      {
        label:   'Geography',
        labelAr: 'الجغرافيا',
        items: [
          { id: 'locations',        labelEn: 'Locations',         labelAr: 'المواقع',                      icon: MapPin,       route: '/master-data/locations' },
          { id: 'work-schedules',   labelEn: 'Work Schedules',    labelAr: 'جداول العمل',                  icon: CalendarRange, route: '/master-data/work-schedules' },
          { id: 'holiday-calendars',labelEn: 'Holiday Calendars', labelAr: 'تقويمات الإجازات الرسمية',    icon: CalendarDays, route: '/master-data/holiday-calendars' },
        ],
      },
      {
        label:   'Job Model',
        labelAr: 'النموذج الوظيفي',
        items: [
          { id: 'jobs',        labelEn: 'Jobs',        labelAr: 'الأدوار الوظيفية', icon: Wrench, route: '/master-data/jobs' },
          { id: 'leave-types', labelEn: 'Leave Types', labelAr: 'أنواع الإجازات',   icon: Tag,    route: '/master-data/leave-types' },
        ],
      },
      {
        label:   'Projects',
        labelAr: 'المشاريع',
        items: [
          { id: 'projects', labelEn: 'Projects', labelAr: 'المشاريع', icon: FolderKanban, route: '/master-data/projects' },
        ],
      },
    ],
  },

  // 4 — Leave & Time
  {
    id:       'leave',
    labelEn:  'Leave & Time',
    labelAr:  'الإجازات والدوام',
    icon:     CalendarDays,
    shortcut: '⌘4',
    nav: [
      {
        items: [
          { id: 'leave-requests', labelEn: 'Leave Requests', labelAr: 'طلبات الإجازة',    icon: CalendarDays,  route: '/absence',          match: '/absence' },
          { id: 'leave-balances', labelEn: 'Leave Balances', labelAr: 'أرصدة الإجازات',   icon: BarChart3,     route: '/absence/balances' },
          { id: 'leave-calendar', labelEn: 'Leave Calendar', labelAr: 'تقويم الإجازات',   icon: CalendarCheck, route: '/absence/calendar' },
        ],
      },
      {
        label:   'Time',
        labelAr: 'الدوام',
        items: [
          { id: 'timesheets',      labelEn: 'Timesheets',      labelAr: 'جداول الدوام',          icon: Clock, route: '/timesheets',      match: '/timesheets' },
          { id: 'team-timesheets', labelEn: 'Team Timesheets', labelAr: 'جداول دوام الفريق',     icon: Clock, route: '/timesheets/team',  match: '/timesheets/team' },
        ],
      },
      // C2-R1: the "Configuration" subgroup (Leave Rules, Backdate Policy) was
      // removed from this operational workspace. Those are configuration pages
      // owned by Administration → Settings (config/admin-landing.ts, Leave & Time
      // group). Linking them here routed into /settings/* and flipped the active
      // workspace to Administration — the duplicate "Leave & Time → Settings →
      // Leave Rules" trail. Leave & Time now shows operational items only.
    ],
  },

  // 5 — Payroll (existing pages; visible only when the workstream is enabled)
  {
    id:       'payroll',
    labelEn:  'Payroll',
    labelAr:  'الرواتب',
    icon:     Banknote,
    shortcut: '⌘5',
    nav: [
      {
        items: [
          { id: 'payroll-runs',    labelEn: 'Payroll Runs',   labelAr: 'دورات الرواتب',     icon: Banknote,  route: '/payroll/runs' },
          { id: 'pay-components',  labelEn: 'Pay Components', labelAr: 'مكونات الراتب',     icon: Layers,    route: '/payroll/salary-elements' },
          { id: 'bank-files',      labelEn: 'Bank Files',     labelAr: 'ملفات البنك',       icon: FileText,  route: '/payroll/wps' },
        ],
      },
      {
        label:   'Setup',
        labelAr: 'الإعداد',
        items: [
          { id: 'payroll-definitions', labelEn: 'Payroll Definitions', labelAr: 'تعريفات الرواتب', icon: Banknote, route: '/payroll/definitions' },
          { id: 'payroll-reports', labelEn: 'Payroll Reports', labelAr: 'تقارير الرواتب', icon: FileText, route: '/payroll/reports' },
          { id: 'tax-tables', labelEn: 'Tax Tables', labelAr: 'جداول الضرائب',   icon: FileText, route: '/payroll/tax',        comingSoon: true },
          { id: 'benefits',   labelEn: 'Benefits',   labelAr: 'الفوائد',          icon: HeartPulse, route: '/payroll/benefits', comingSoon: true },
        ],
      },
    ],
  },

  // 6 — Workflows
  {
    id:       'workflows',
    labelEn:  'Workflows',
    labelAr:  'سير العمل',
    icon:     GitBranch,
    shortcut: '⌘6',
    nav: [
      {
        items: [
          { id: 'workflow-runs',   labelEn: 'Workflow Runs',   labelAr: 'تشغيلات سير العمل', icon: ClipboardCheck, route: '/workflows',                            match: '/workflows' },
          { id: 'workflow-builder',labelEn: 'Workflow Builder', labelAr: 'منشئ سير العمل',   icon: Settings2,      route: '/configuration/workflows',              match: '/configuration/workflows' },
          { id: 'approval-groups', labelEn: 'Approval Groups', labelAr: 'مجموعات الموافقة', icon: Users,          route: '/configuration/workflows/groups',        match: '/configuration/workflows/groups' },
          { id: 'delegations',     labelEn: 'Delegations',     labelAr: 'التفويضات',         icon: GitBranch,      route: '/configuration/workflows/delegations',   match: '/configuration/workflows/delegations' },
        ],
      },
    ],
  },

  // 7 — Documents
  {
    id:       'documents',
    labelEn:  'Documents',
    labelAr:  'المستندات',
    icon:     FileText,
    shortcut: '⌘7',
    nav: [
      {
        items: [
          { id: 'employee-letters', labelEn: 'Employee Letters', labelAr: 'خطابات الموظفين', icon: FileText, route: '/employee-letters', match: '/employee-letters', isNew: true },
        ],
      },
    ],
  },

  // 8 — Reports
  {
    id:       'reports',
    labelEn:  'Reports',
    labelAr:  'التقارير',
    icon:     BarChart3,
    shortcut: '⌘8',
    nav: [
      {
        items: [
          { id: 'all-reports',       labelEn: 'All Reports',       labelAr: 'جميع التقارير',   icon: BarChart3,  route: '/reports' },
          { id: 'employee-history',  labelEn: 'Employee History',  labelAr: 'سجل الموظف',       icon: Clock,      route: '/reports/employee-history' },
          { id: 'employee-movement', labelEn: 'Employee Movement', labelAr: 'حركة الموظفين',    icon: BarChart3,  route: '/reports/employee-movement' },
          { id: 'insurance-reports', labelEn: 'Insurance Reports', labelAr: 'تقارير التأمين', icon: HeartPulse, route: '/reports/insurance' },
          { id: 'pending-changes',   labelEn: 'Pending Future Changes', labelAr: 'التغييرات المستقبلية المعلقة', icon: CalendarClock, route: '/pending-changes', isNew: true },
        ],
      },
    ],
  },

  // 9 — AI Assistant (ARIA)
  {
    id:       'ai',
    labelEn:  'AI Assistant',
    labelAr:  'المساعد الذكي',
    icon:     Bot,
    shortcut: '⌘9',
    nav: [
      {
        items: [
          { id: 'aria', labelEn: 'Ask ARIA', labelAr: 'اسأل آريا', icon: Bot, route: '/aria', match: '/aria', isNew: true },
        ],
      },
    ],
  },

  // 10 — Administration
  {
    id:       'admin',
    labelEn:  'Administration',
    labelAr:  'الإدارة',
    icon:     ShieldCheck,
    shortcut: '⌘0',
    nav: [
      {
        label:   'Configuration',
        labelAr: 'الإعدادات',
        items: [
          { id: 'settings',             labelEn: 'Settings',             labelAr: 'الإعدادات',          icon: Settings2,  route: '/settings',                  match: '/settings' },
          { id: 'communication',        labelEn: 'Communication Settings', labelAr: 'إعدادات الاتصالات', icon: Mail,      route: '/settings/communication',    match: '/settings/communication', isNew: true },
          { id: 'company-branding', labelEn: 'Company Branding', labelAr: 'هوية الشركة', icon: Settings2, route: '/settings/branding', superAdminOnly: true },
          { id: 'feature-permissions',  labelEn: 'Feature Permissions',  labelAr: 'صلاحيات الميزات',   icon: Lock,       route: '/access/feature-permissions', isNew: true, superAdminOnly: true },
        ],
      },
    ],
  },

  // 11 — Enterprise Data Hub (SUPER_ADMIN only)
  {
    id:             'dataops',
    labelEn:        'Enterprise Data Hub',
    labelAr:        'مركز بيانات المؤسسة',
    icon:           Database,
    superAdminOnly: true,
    nav: [
      {
        items: [
          { id: 'console', labelEn: 'Console', labelAr: 'وحدة التحكم', icon: Database, route: '/admin/dataops', match: '/admin/dataops', isNew: true },
        ],
      },
    ],
  },

  // 12 — Enterprise Data Migration Factory (SUPER_ADMIN only). Append-only; never add to admin-nav.ts.
  {
    id:             'migration',
    labelEn:        'Enterprise Data Migration Factory',
    labelAr:        'مصنع ترحيل بيانات المؤسسة',
    icon:           Upload,
    route:          '/admin/migration',
    match:          '/admin/migration',
    superAdminOnly: true,
    nav: [],
  },
]
