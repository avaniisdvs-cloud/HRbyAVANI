/** Synthetic local-preview identities. These never enable production login. */
export const PREVIEW_ENTITY_ID = '11111111-1111-1111-1111-111111111111'

export const PREVIEW_ACCOUNTS = [
  { number: 1, personId: '22222222-2222-2222-2222-222222222222', email: 'super.admin@avaniis.dev', name: 'Alex Morgan', nameAr: 'أليكس مورغان', role: 'SUPER_ADMIN' },
  { number: 2, personId: 'dddd0001-0000-0000-0000-000000000002', email: 'hr.admin@avaniis.dev', name: 'Sara Ahmed', nameAr: 'سارة أحمد', role: 'HR_ADMIN' },
  { number: 3, personId: 'dddd0001-0000-0000-0000-000000000003', email: 'payroll@avaniis.dev', name: 'Omar Hassan', nameAr: 'عمر حسن', role: 'PAYROLL_ADMIN' },
  { number: 4, personId: 'dddd0001-0000-0000-0000-000000000004', email: 'manager@avaniis.dev', name: 'Maya Patel', nameAr: 'مايا باتيل', role: 'MANAGER' },
  { number: 5, personId: 'dddd0001-0000-0000-0000-000000000005', email: 'employee@avaniis.dev', name: 'Adam Wilson', nameAr: 'آدم ويلسون', role: 'EMPLOYEE' },
  { number: 6, personId: 'dddd0001-0000-0000-0000-000000000006', email: 'employee.two@avaniis.dev', name: 'Lina Ali', nameAr: 'لينا علي', role: 'EMPLOYEE' },
] as const
