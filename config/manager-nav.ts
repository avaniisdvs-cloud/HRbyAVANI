/**
 * Navigation configuration for MANAGER role.
 */
import {
  Home,
  Users,
  CalendarDays,
  Clock,
  GitBranch,
  Grid,
  Network,
  Bot,
  FileBarChart,
  User,
  FolderOpen,
  FileText,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react'
import type { NavConfig } from './admin-nav'

export const MANAGER_NAV: NavConfig = [
  {
    id:          'overview',
    labelEn:     'Overview',
    labelAr:     'نظرة عامة',
    icon:        Home,
    color:       '#0D7D8C',
    defaultOpen: true,
    items: [
      {
        id:      'team-overview',
        labelEn: 'Team Overview',
        labelAr: 'نظرة عامة على الفريق',
        icon:    Home,
        route:   '/dashboard',
      },
      {
        id:      'my-profile',
        labelEn: 'My Profile',
        labelAr: 'ملفي الشخصي',
        icon:    User,
        route:   '/my-profile',
        match:   '/my-profile',
      },
    ],
  },

  {
    id:          'team',
    labelEn:     'My Team',
    labelAr:     'فريقي',
    icon:        Users,
    color:       '#2563EB',
    defaultOpen: true,
    items: [
      {
        id:      'my-team',
        labelEn: 'Team Members',
        labelAr: 'أعضاء الفريق',
        icon:    Users,
        route:   '/my-team',
        match:   '/my-team',
      },
      {
        id:      'org-chart',
        labelEn: 'Organisation Chart',
        labelAr: 'المخطط التنظيمي',
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
    ],
  },

  {
    id:          'approvals',
    labelEn:     'Approvals',
    labelAr:     'الموافقات',
    icon:        GitBranch,
    color:       '#D97706',
    defaultOpen: true,
    items: [
      {
        id:      'approvals',
        labelEn: 'Approvals',
        labelAr: 'الموافقات',
        icon:    GitBranch,
        route:   '/approvals',
        match:   '/approvals',
      },
    ],
  },

  {
    id:          'self-service',
    labelEn:     'My Self-Service',
    labelAr:     'خدماتي الذاتية',
    icon:        User,
    color:       '#0891B2',
    defaultOpen: true,
    items: [
      {
        id:      'my-documents',
        labelEn: 'My Documents',
        labelAr: 'وثائقي',
        icon:    FolderOpen,
        route:   '/my-documents',
        match:   '/my-documents',
      },
      {
        id:      'my-letters',
        labelEn: 'My Letters',
        labelAr: 'خطاباتي',
        icon:    FileText,
        route:   '/my-letters',
        match:   '/my-letters',
      },
      {
        id:      'my-insurance',
        labelEn: 'My Insurance',
        labelAr: 'تأميني',
        icon:    HeartPulse,
        route:   '/my-insurance',
        match:   '/my-insurance',
      },
    ],
  },

  {
    id:          'leave-time',
    labelEn:     'Leave & Time',
    labelAr:     'الإجازات والدوام',
    icon:        CalendarDays,
    color:       '#7C3AED',
    defaultOpen: true,
    items: [
      {
        id:      'my-leave',
        labelEn: 'My Leave',
        labelAr: 'إجازتي',
        icon:    CalendarDays,
        route:   '/absence/my',
        match:   '/absence/my',
      },
      {
        id:      'team-leave',
        labelEn: 'Team Leave',
        labelAr: 'إجازات الفريق',
        icon:    CalendarDays,
        route:   '/absence',
        match:   '/absence',
      },
      {
        id:      'my-timesheet',
        labelEn: 'My Timesheets',
        labelAr: 'جداول دوامي',
        icon:    Clock,
        route:   '/my-timesheet',
        match:   '/my-timesheet',
      },
      {
        id:      'timesheet',
        labelEn: 'Team Timesheets',
        labelAr: 'جداول دوام الفريق',
        icon:    Clock,
        route:   '/timesheets/team',
        match:   '/timesheets',
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
        id:      'leave-summary-report',
        labelEn: 'Leave Summary',
        labelAr: 'ملخص الإجازات',
        icon:    FileBarChart,
        route:   '/reports?report=leave-summary',
        match:   '/reports',
      },
      {
        id:      'leave-balances-report',
        labelEn: 'Leave Balances',
        labelAr: 'أرصدة الإجازات',
        icon:    FileBarChart,
        route:   '/reports?report=leave-balances',
        match:   '/reports',
      },
      {
        id:      'employee-movement-report',
        labelEn: 'Employee Movement',
        labelAr: 'حركة الموظفين',
        icon:    FileBarChart,
        route:   '/reports/employee-movement',
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

  // RBAC-BL-06: removed the "Data" group (Data Console → /admin/dataops).
  // DataOps is a SUPER_ADMIN-only raw DB console (gated in middleware since
  // RBAC-BL-07); it bounced for MANAGER and should never have appeared in the
  // manager menu. Removal is visibility-only — the route guard is unchanged.
]
