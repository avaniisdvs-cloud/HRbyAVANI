import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { listUsers, listDepartmentsForUsers } from '@/modules/auth/actions'
import { UsersClient } from './_UsersClient'

export const metadata = { title: 'Users & Roles' }

type SearchParams = {
  search?:    string
  role?:      string
  userType?:  string
  page?:      string
  sortBy?:    string
  sortDir?:   string
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const sp = searchParams ? await searchParams : {} as SearchParams

  const page      = Math.max(1, Number(sp.page ?? '1') || 1)
  const sortBy    = sp.sortBy  || undefined
  const sortDir   = (sp.sortDir === 'desc' ? 'desc' : sp.sortDir === 'asc' ? 'asc' : undefined) as 'asc' | 'desc' | undefined

  const validUserTypes = ['employee', 'system', 'non-employee'] as const
  type ValidUserType = typeof validUserTypes[number]
  const userType = validUserTypes.includes(sp.userType as ValidUserType)
    ? sp.userType as ValidUserType
    : undefined

  const [result, deptList] = await Promise.all([
    listUsers({
      search:        sp.search || undefined,
      role:          sp.role   || undefined,
      userType,
      page,
      pageSize:      25,
      sortColumn:    sortBy,
      sortDirection: sortDir,
    }),
    listDepartmentsForUsers(null),
  ])

  const baseParams = new URLSearchParams()
  if (sp.search)   baseParams.set('search',   sp.search)
  if (sp.role)     baseParams.set('role',     sp.role)
  if (sp.userType) baseParams.set('userType', sp.userType)
  if (sortBy)                baseParams.set('sortBy',   sortBy)
  if (sortDir)               baseParams.set('sortDir',  sortDir)

  const linkFor = (p: number) => {
    const q = new URLSearchParams(baseParams)
    q.set('page', String(p))
    return `/users?${q.toString()}`
  }

  const start = (result.page - 1) * result.pageSize
  const end   = Math.min(start + result.pageSize, result.total)

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
      {/* Header — never scrolls */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PageTitle style={{
            fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600,
            letterSpacing: '-0.4px', color: 'var(--ink-1)', margin: 0,
          }}>
            Users &amp; Roles
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {result.total === 0
              ? 'No users match the current filters.'
              : `Showing ${start + 1}–${end} of ${result.total}`}
          </p>
        </div>
        <Link
          href="/users/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: 'var(--card)',
            borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
            fontWeight: 600, textDecoration: 'none',
          }}
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
          Add User
        </Link>
      </div>

      {/* Table + search — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <UsersClient
          key={`${sortBy ?? 'none'}-${sortDir ?? 'none'}`}
          rows={result.rows}
          currentUserRole={session.user.role}
          currentUserId={session.user.id}
          departments={deptList}
          sortColumn={sortBy ?? null}
          sortDirection={sortDir ?? null}
          defaultSearch={sp.search ?? ''}
          defaultRole={sp.role ?? ''}
          defaultUserType={sp.userType ?? ''}
        />
      </div>

      {/* Pagination — never scrolls */}
      {result.totalPages > 1 && (
        <div style={{
          flexShrink: 0, marginTop: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            Page {result.page} of {result.totalPages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {result.page > 1 && (
              <Link href={linkFor(result.page - 1)} style={{
                borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)',
                padding: '6px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', textDecoration: 'none',
              }}>
                ← Prev
              </Link>
            )}
            {result.page < result.totalPages && (
              <Link href={linkFor(result.page + 1)} style={{
                borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)',
                padding: '6px 14px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', textDecoration: 'none',
              }}>
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
