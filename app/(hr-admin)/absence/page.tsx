import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Loader2 } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { listLeaveRequests } from '@/modules/absence'
import { getLocale } from '@/lib/locale-server'
import { tk } from '@/lib/i18n-messages'
import { LeaveFilterBar } from './LeaveFilterBar'
import { LeaveTableClient } from './LeaveTableClient'

export const metadata = { title: 'Leave Requests · AVANIIS People' }

type SearchParams = {
  page?: string
  pageSize?: string
  status?: string
  fromDate?: string
  toDate?: string
  sortBy?: string
  sortDir?: string
}

const ALLOWED_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'TAKEN', 'RECALLED'] as const

export default async function LeaveListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'FINANCE']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await getLocale()
  const sp = searchParams ? await searchParams : {} as SearchParams

  const status = sp.status && ALLOWED_STATUSES.includes(sp.status as typeof ALLOWED_STATUSES[number])
    ? (sp.status as typeof ALLOWED_STATUSES[number])
    : undefined

  const sortBy  = sp.sortBy  || undefined
  const sortDir = (sp.sortDir === 'desc' ? 'desc' : sp.sortDir === 'asc' ? 'asc' : undefined) as 'asc' | 'desc' | undefined

  const filter: NonNullable<Parameters<typeof listLeaveRequests>[0]> = {
    page:          Math.max(1, Number(sp.page ?? '1') || 1),
    pageSize:      Math.min(200, Math.max(1, Number(sp.pageSize ?? '25') || 25)),
    status,
    fromDate:      sp.fromDate || undefined,
    toDate:        sp.toDate   || undefined,
    sortColumn:    sortBy,
    sortDirection: sortDir,
  }

  const pageResult = await listLeaveRequests(filter)
  const start = (pageResult.page - 1) * pageResult.pageSize
  const end   = Math.min(start + pageResult.pageSize, pageResult.total)

  const baseParams = new URLSearchParams()
  if (filter.status)   baseParams.set('status',   filter.status)
  if (filter.fromDate) baseParams.set('fromDate', filter.fromDate)
  if (filter.toDate)   baseParams.set('toDate',   filter.toDate)
  if (filter.pageSize !== 25) baseParams.set('pageSize', String(filter.pageSize))
  if (sortBy)  baseParams.set('sortBy',  sortBy)
  if (sortDir) baseParams.set('sortDir', sortDir)

  const linkFor = (page: number) => {
    const p = new URLSearchParams(baseParams)
    p.set('page', String(page))
    return `/absence?${p.toString()}`
  }

  return (
    <div
      className="page-in"
      style={{
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - 104px)',
        overflow: 'hidden', width: '100%', boxSizing: 'border-box',
        paddingBottom: 80,
      }}
    >

      {/* Page Header — never scrolls */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PageTitle style={{
            fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
            letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
          }}>
            {locale === 'ar' ? 'إدارة الإجازات' : 'Leave Management'}
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {pageResult.total === 0
              ? (locale === 'ar' ? 'لا توجد طلبات إجازة تطابق الفلاتر الحالية.' : 'No leave requests match the current filters.')
              : `Showing ${start + 1}–${end} of ${pageResult.total}`}
          </p>
        </div>
        <Link
          href="/absence/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: "var(--on-accent)",
            borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
            fontWeight: 600, textDecoration: 'none',
          }}
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
          {locale === 'ar' ? 'طلب إجازة جديد' : 'New request'}
        </Link>
      </div>

      {/* Filter bar — never scrolls */}
      <div style={{ flexShrink: 0 }}>
        <LeaveFilterBar filter={filter} locale={locale} />
      </div>

      {/* Table — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
            <Loader2 size={16} style={{ animation: 'spin 0.75s linear infinite' }} />
            {tk(locale, 'common.loading')}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        }>
          <LeaveTableClient
            key={`${sortBy ?? 'none'}-${sortDir ?? 'none'}-${filter.status ?? ''}-${filter.fromDate ?? ''}-${filter.toDate ?? ''}`}
            rows={pageResult.rows}
            locale={locale}
            sortColumn={sortBy ?? null}
            sortDirection={sortDir ?? null}
          />
        </Suspense>
      </div>

      {/* Pagination — never scrolls */}
      {pageResult.totalPages > 1 && (
        <div style={{ flexShrink: 0, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {locale === 'ar'
              ? `صفحة ${pageResult.page} من ${pageResult.totalPages}`
              : `Page ${pageResult.page} of ${pageResult.totalPages}`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {pageResult.page > 1 && (
              <Link href={linkFor(pageResult.page - 1)} style={{
                borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)',
                padding: '6px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', textDecoration: 'none',
              }}>
                {tk(locale, 'common.prev')}
              </Link>
            )}
            {pageResult.page < pageResult.totalPages && (
              <Link href={linkFor(pageResult.page + 1)} style={{
                borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)',
                padding: '6px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', textDecoration: 'none',
              }}>
                {tk(locale, 'common.next')}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
