/**
 * Navigation configuration for the MANAGER role only.
 * Consumed by AdminSidebar to render a collapsible grouped nav.
 *
 * ⚠️ REGRESSION GUARD — TWO NAV FILES MUST STAY IN SYNC:
 *   THIS FILE    → used by MANAGER role only (AdminSidebar)
 *   workspace-nav.ts → used by HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN (WorkspaceSecondaryNav)
 *
 * Adding a new MDM route? Add it to BOTH files or admin users will not see it.
 */
import {
  Home,
  Users,
  ShieldCheck,
  Network,
  Grid,
  CalendarDays,
  CalendarCheck,
  BarChart3,
  Clock,
  GitBranch,
  FileBarChart,
  Building2,
  Building,
  Briefcase,
  Layers,
  MapPin,
  CalendarRange,
  Tag,
  Wrench,
  Settings2,
  Lock,
  Bot,
  Database,
  FileText,
  HeartPulse,
  ClipboardCheck,
  LogOut,
  Upload,
  CalendarClock,
  Boxes,
  FolderKanban,
  Mail,
  type LucideIcon,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface NavItem {
  id:          string
  labelEn:     string
  labelAr:     string
  icon:        LucideIcon
  route:       string
  match?:      string        // prefix for active-state matching (overrides route)
  badge?:      string | number
  isNew?:      boolean
  comingSoon?: boolean
}

export interface NavGroup {
  id:             string
  labelEn:        string
  labelAr:        string
  icon:           LucideIcon
  color:          string        // accent color for this group (hex)
  defaultOpen:    boolean
  items:          NavItem[]
  superAdminOnly?: boolean      // if true, only rendered for SUPER_ADMIN
}

export type NavConfig = NavGroup[]

// ── HR Admin nav (7 groups) ────────────────────────────────────────────────

export const ADMIN_NAV: NavConfig = [
  {
    id:          'overview',
    labelEn:     'Overview',
    labelAr:     'نظرة عامة',
    icon:        Home,
    color:       '#0D7D8C',
    defaultOpen: false,
    items: [
      {
        id:      'dashboard',
        labelEn: 'Dashboard',
        labelAr: 'لوحة التحكم',
        icon:    Home,
        route:   '/dashboard',
      },
    ],
  },

  ...(process.env.NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED === 'true' ? [{
    id: 'payroll', labelEn: 'Payroll', labelAr: 'الرواتب', icon: FileBarChart,
    color: 'var(--accent)', defaultOpen: false,
    items: [
      { id: 'payroll-runs', labelEn: 'Payroll Runs', labelAr: 'دورات الرواتب', icon: FileBarChart, route: '/payroll/runs' },
      { id: 'pay-components', labelEn: 'Pay Components', labelAr: 'مكونات الراتب', icon: Layers, route: '/payroll/salary-elements' },
      { id: 'bank-files', labelEn: 'Bank Files', labelAr: 'ملفات البنك', icon: FileText, route: '/payroll/wps' },
      { id: 'payroll-definitions', labelEn: 'Payroll Definitions', labelAr: 'تعريفات الرواتب', icon: Settings2, route: '/payroll/definitions' },
      { id: 'payroll-reports', labelEn: 'Payroll Reports', labelAr: 'تقارير الرواتب', icon: FileBarChart, route: '/payroll/reports' },
    ],
  }] : []),

  {
    id:          'people',
    labelEn:     'People & Workforce',
    labelAr:     'الأفراد والقوى العاملة',
    icon:        Users,
    color:       '#2563EB',
    defaultOpen: false,
    items: [
      {
        id:      'employees',
        labelEn: 'Employees',
        labelAr: 'الموظفون',
        icon:    Users,
        route:   '/persons',
      },
      {
        id:      'import-employees',
        labelEn: 'Import Employees',
        labelAr: 'استيراد الموظفين',
        icon:    Upload,
        route:   '/persons/import',
        match:   '/persons/import',
        isNew:   true,
      },
      {
        id:      'users-roles',
        labelEn: 'Users & Roles',
        labelAr: 'المستخدمون والصلاحيات',
        icon:    ShieldCheck,
        route:   '/users',
      },
      {
        id:      'org-chart',
        labelEn: 'Employee Organization Structure',
        labelAr: 'الهيكل التنظيمي للموظفين',
        icon:    Network,
        route:   '/org-chart',
      },
      {
        id:      'directory',
        labelEn: 'Directory',
        labelAr: 'الدليل',
        icon:    Grid,
        route:   '/directory',
      },
      {
        id:      'probation',
        labelEn: 'Probation',
        labelAr: 'فترة التجربة',
        icon:    ClipboardCheck,
        route:   '/admin/probation',
        match:   '/admin/probation',
      },
      {
        id:      'exit-clearance',
        labelEn: 'Exit Clearance',
        labelAr: 'إجراءات المغادرة',
        icon:    LogOut,
        route:   '/admin/exit-clearance',
        match:   '/admin/exit-clearance',
      },
    ],
  },

  {
    id:          'leave-time',
    labelEn:     'Leave & Time',
    labelAr:     'الإجازات والدوام',
    icon:        CalendarDays,
    color:       '#7C3AED',
    defaultOpen: false,
    items: [
      {
        id:      'leave-requests',
        labelEn: 'Leave Requests',
        labelAr: 'طلبات الإجازة',
        icon:    CalendarDays,
        route:   '/absence',
        match:   '/absence',
      },
      {
        id:      'leave-calendar',
        labelEn: 'Leave Calendar',
        labelAr: 'تقويم الإجازات',
        icon:    CalendarCheck,
        route:   '/absence/calendar',
      },
      {
        id:      'leave-balances',
        labelEn: 'Leave Balances',
        labelAr: 'أرصدة الإجازات',
        icon:    BarChart3,
        route:   '/absence/balances',
      },
      {
        id:      'timesheets',
        labelEn: 'Timesheets',
        labelAr: 'جداول الدوام',
        icon:    Clock,
        route:   '/timesheets',
        match:   '/timesheets',
      },
      {
        id:      'team-timesheets',
        labelEn: 'Team Timesheets',
        labelAr: 'جداول دوام الفريق',
        icon:    Clock,
        route:   '/timesheets/team',
        match:   '/timesheets/team',
      },
      // C2-R1: orphan "Backdate Policy" config item removed for nav consistency.
      // Configuration is owned by Administration → Settings, not operational nav.
    ],
  },

  {
    id:          'workflows',
    labelEn:     'Workflows',
    labelAr:     'سير العمل',
    icon:        GitBranch,
    color:       '#D97706',
    defaultOpen: false,
    items: [
      {
        id:      'approvals',
        labelEn: 'Approvals',
        labelAr: 'الموافقات',
        icon:    GitBranch,
        route:   '/approvals',
        match:   '/approvals',
      },
      {
        id:      'workflow-builder',
        labelEn: 'Workflow Builder',
        labelAr: 'منشئ سير العمل',
        icon:    Settings2,
        route:   '/configuration/workflows',
        match:   '/configuration/workflows',
      },
      {
        id:      'approval-groups',
        labelEn: 'Approval Groups',
        labelAr: 'مجموعات الموافقة',
        icon:    Users,
        route:   '/configuration/workflows/groups',
        match:   '/configuration/workflows/groups',
      },
      {
        id:      'delegations',
        labelEn: 'Delegations',
        labelAr: 'التفويضات',
        icon:    GitBranch,
        route:   '/configuration/workflows/delegations',
        match:   '/configuration/workflows/delegations',
      },
    ],
  },

  {
    id:          'reports',
    labelEn:     'Reports',
    labelAr:     'التقارير',
    icon:        FileBarChart,
    color:       '#16A34A',
    defaultOpen: false,
    items: [
      {
        id:      'reports-main',
        labelEn: 'Reports',
        labelAr: 'التقارير',
        icon:    FileBarChart,
        route:   '/reports',
      },
      {
        id:      'reports-employee-history',
        labelEn: 'Employee History',
        labelAr: 'سجل الموظف',
        icon:    Clock,
        route:   '/reports/employee-history',
      },
      {
        id:      'reports-employee-movement',
        labelEn: 'Employee Movement',
        labelAr: 'حركة الموظفين',
        icon:    FileBarChart,
        route:   '/reports/employee-movement',
      },
      {
        id:      'reports-insurance',
        labelEn: 'Insurance Reports',
        labelAr: 'تقارير التأمين',
        icon:    HeartPulse,
        route:   '/reports/insurance',
      },
      {
        id:      'pending-changes',
        labelEn: 'Pending Future Changes',
        labelAr: 'التغييرات المستقبلية المعلقة',
        icon:    CalendarClock,
        route:   '/pending-changes',
        isNew:   true,
      },
    ],
  },

  {
    id:          'master-data',
    labelEn:     'Master Data',
    labelAr:     'البيانات الرئيسية',
    icon:        Building2,
    color:       '#64748B',
    defaultOpen: false,
    items: [
      {
        id:      'legal-entities',
        labelEn: 'Legal Entities',
        labelAr: 'الكيانات القانونية',
        icon:    Building2,
        route:   '/master-data/legal-entities',
      },
      {
        id:      'business-units',
        labelEn: 'Business Units',
        labelAr: 'وحدات العمل',
        icon:    Boxes,
        route:   '/master-data/business-units',
      },
      {
        id:      'departments',
        labelEn: 'Departments',
        labelAr: 'الأقسام',
        icon:    Building,
        route:   '/master-data/departments',
      },
      {
        id:      'positions',
        labelEn: 'Positions',
        labelAr: 'المناصب',
        icon:    Briefcase,
        route:   '/master-data/positions',
      },
      {
        id:      'grades',
        labelEn: 'Grades',
        labelAr: 'الدرجات',
        icon:    Layers,
        route:   '/master-data/grades',
      },
      {
        id:      'locations',
        labelEn: 'Locations',
        labelAr: 'المواقع',
        icon:    MapPin,
        route:   '/master-data/locations',
      },
      {
        id:      'work-schedules',
        labelEn: 'Work Schedules',
        labelAr: 'جداول العمل',
        icon:    CalendarRange,
        route:   '/master-data/work-schedules',
      },
      {
        id:      'holiday-calendars',
        labelEn: 'Holiday Calendars',
        labelAr: 'تقويمات الإجازات الرسمية',
        icon:    CalendarDays,
        route:   '/master-data/holiday-calendars',
      },
      {
        id:      'leave-types',
        labelEn: 'Leave Types',
        labelAr: 'أنواع الإجازات',
        icon:    Tag,
        route:   '/master-data/leave-types',
      },
      {
        id:      'jobs',
        labelEn: 'Jobs',
        labelAr: 'الأدوار الوظيفية',
        icon:    Wrench,
        route:   '/master-data/jobs',
      },
      {
        id:      'projects',
        labelEn: 'Projects',
        labelAr: 'المشاريع',
        icon:    FolderKanban,
        route:   '/master-data/projects',
      },
    ],
  },

  {
    id:          'documents',
    labelEn:     'Documents',
    labelAr:     'المستندات',
    icon:        FileText,
    color:       '#0EA5E9',
    defaultOpen: false,
    items: [
      {
        id:      'employee-letters',
        labelEn: 'Employee Letters',
        labelAr: 'خطابات الموظفين',
        icon:    FileText,
        route:   '/employee-letters',
        match:   '/employee-letters',
        isNew:   true,
      },
    ],
  },

  {
    id:          'admin-access',
    labelEn:     'Admin & Access',
    labelAr:     'الإدارة والوصول',
    icon:        Settings2,
    color:       '#6B7280',
    defaultOpen: false,
    items: [
      {
        id:      'settings',
        labelEn: 'Settings',
        labelAr: 'الإعدادات',
        icon:    Settings2,
        route:   '/settings',
        match:   '/settings',
      },
      {
        id:      'communication',
        labelEn: 'Communication Settings',
        labelAr: 'إعدادات الاتصالات',
        icon:    Mail,
        route:   '/settings/communication',
        match:   '/settings/communication',
        isNew:   true,
      },
      {
        id:      'feature-permissions',
        labelEn: 'Feature Permissions',
        labelAr: 'صلاحيات الميزات',
        icon:    Lock,
        route:   '/access/feature-permissions',
        isNew:   true,
      },
    ],
  },

  {
    id:          'ai-assistant',
    labelEn:     'AI ASSISTANT',
    labelAr:     'المساعد الذكي',
    icon:        Bot,
    color:       'var(--accent)',
    defaultOpen: true,
    items: [
      {
        id:      'aria',
        labelEn: 'ARIA',
        labelAr: 'آريا',
        icon:    Bot,
        route:   '/aria',
        match:   '/aria',
        isNew:   true,
      },
    ],
  },

  {
    id:             'system',
    labelEn:        'DATABASE',
    labelAr:        'قاعدة البيانات',
    icon:           Database,
    color:          '#7C3AED',
    defaultOpen:    false,
    superAdminOnly: true,
    items: [
      {
        id:      'dataops',
        labelEn: 'Enterprise Data Hub',
        labelAr: 'مركز بيانات المؤسسة',
        icon:    Database,
        route:   '/admin/dataops',
        match:   '/admin/dataops',
        isNew:   true,
      },
    ],
  },
]
