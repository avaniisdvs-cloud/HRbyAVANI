/**
 * Navigation configuration for EMPLOYEE role.
 * Minimal nav: own profile, org chart, leave, timesheets, ARIA.
 */
import {
  Home,
  Network,
  CalendarDays,
  Clock,
  Grid,
  Bot,
  Database,
  FileText,
  CreditCard,
  type LucideIcon,
} from 'lucide-react'
import type { NavConfig } from './admin-nav'

export const EMPLOYEE_NAV: NavConfig = [
  {
    id:          'overview',
    labelEn:     'Overview',
    labelAr:     'نظرة عامة',
    icon:        Home,
    color:       '#0D7D8C',
    defaultOpen: true,
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

  {
    id:          'organisation',
    labelEn:     'Organisation',
    labelAr:     'المؤسسة',
    icon:        Network,
    color:       '#2563EB',
    defaultOpen: true,
    items: [
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
        route:   '/me/leave',
        match:   '/me/leave',
      },
      {
        id:      'my-timesheets',
        labelEn: 'My Timesheets',
        labelAr: 'جداول دوامي',
        icon:    Clock,
        route:   '/timesheets',
        match:   '/timesheets',
      },
    ],
  },

  {
    id:          'payroll',
    labelEn:     'Payroll',
    labelAr:     'الرواتب',
    icon:        FileText,
    color:       '#16A34A',
    defaultOpen: true,
    items: [
      {
        id:      'my-payslips',
        labelEn: 'My Payslips',
        labelAr: 'كشوف راتبي',
        icon:    FileText,
        route:   '/me/payslips',
        match:   '/me/payslips',
      },
      {
        id:      'my-bank-details',
        labelEn: 'Bank Details',
        labelAr: 'البيانات البنكية',
        icon:    CreditCard,
        route:   '/me/bank-details',
        match:   '/me/bank-details',
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
    id:          'data',
    labelEn:     'Data',
    labelAr:     'البيانات',
    icon:        Database,
    color:       '#7C3AED',
    defaultOpen: false,
    items: [
      {
        id:      'dataops',
        labelEn: 'Data Console',
        labelAr: 'وحدة تحكم البيانات',
        icon:    Database,
        route:   '/admin/dataops',
        match:   '/admin/dataops',
      },
    ],
  },
  {
    id: 'self-service-requests',
    labelEn: 'My Requests', labelAr: 'طلباتي', icon: FileText,
    color: 'var(--brand-active)', defaultOpen: true,
    items: [
      { id: 'accommodations', labelEn: 'Accommodation Request', labelAr: 'طلب التسهيلات', icon: FileText, route: '/me/accommodations' },
      { id: 'my-probation', labelEn: 'My Probation', labelAr: 'فترة تجربتي', icon: FileText, route: '/me/requests/probation' },
    ],
  },

]
