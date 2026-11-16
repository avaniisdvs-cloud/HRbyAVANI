'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useTransition, useCallback, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Inbox, Flag, MoreHorizontal } from 'lucide-react'
import { formatDMY } from '@/lib/utils'
import { SortableHeader } from '@/components/ui/SortableHeader'
import type { SortDirection } from '@/hooks/useTableSort'
import type { PersonListRow } from '@/modules/core-hr/types'
import { PersonEditDrawer } from './_components/PersonEditDrawer'

// ── Avatar helpers ─────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'var(--avatar-1)','var(--avatar-2)','var(--avatar-3)','var(--avatar-4)',
  'var(--avatar-5)','var(--avatar-6)','var(--avatar-7)','var(--avatar-8)',
  'var(--avatar-9)','var(--avatar-10)',
]

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ status, locale }: { status: string; locale: string }) {
  type Variant = { bg: string; fg: string; dot: string }
  const variants: Record<string, Variant> = {
    ACTIVE:       { bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)', dot: 'var(--status-approved-dot)' },
    ON_LEAVE:     { bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)',  dot: 'var(--status-pending-dot)'  },
    SUSPENDED:    { bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)', dot: 'var(--status-rejected-dot)' },
    PENDING_HIRE: { bg: 'var(--accent-100)', fg: 'var(--accent-700)', dot: 'var(--accent-700)' },
    TERMINATED:   { bg: 'var(--surface)',             fg: 'var(--ink-3)',              dot: 'var(--ink-4)'               },
    INACTIVE:     { bg: 'var(--surface)',             fg: 'var(--ink-3)',              dot: 'var(--ink-4)'               },
  }
  const statusLabels: Record<string, { en: string; ar: string }> = {
    ACTIVE:       { en: 'ACTIVE',       ar: 'نشط'        },
    ON_LEAVE:     { en: 'ON LEAVE',     ar: 'في إجازة'    },
    SUSPENDED:    { en: 'SUSPENDED',    ar: 'موقوف'       },
    PENDING_HIRE: { en: 'PENDING HIRE', ar: 'قيد التعيين'  },
    TERMINATED:   { en: 'TERMINATED',   ar: 'منتهي'       },
    INACTIVE:     { en: 'INACTIVE',     ar: 'غير نشط'     },
  }
  const v = variants[status] ?? variants.INACTIVE!
  const label = statusLabels[status]
    ? (locale === 'ar' ? statusLabels[status]!.ar : statusLabels[status]!.en)
    : status.replace(/_/g, ' ')
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: v.bg, color: v.fg,
      borderRadius: 999, padding: '3px 10px',
      fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PersonsTableClient({
  rows,
  locale,
  sortColumn:    initSortColumn,
  sortDirection: initSortDirection,
  canEdit,
}: {
  rows:          PersonListRow[]
  locale:        string
  sortColumn:    string | null
  sortDirection: 'asc' | 'desc' | null
  canEdit?:      boolean
}) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [sortCol, setSortCol] = useState<string | null>(initSortColumn)
  const [sortDir, setSortDir] = useState<SortDirection>(initSortDirection)
  const [editTarget, setEditTarget] = useState<PersonListRow | null>(null)

  const handleSort = useCallback((column: string) => {
    let nextDir: SortDirection
    if (sortCol === column) {
      nextDir = sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc'
    } else {
      nextDir = 'asc'
    }
    const nextCol = nextDir === null ? null : column
    setSortCol(nextCol)
    setSortDir(nextDir)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (nextCol && nextDir) {
      params.set('sortBy',  nextCol)
      params.set('sortDir', nextDir)
    } else {
      params.delete('sortBy')
      params.delete('sortDir')
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }, [sortCol, sortDir, pathname, router, searchParams])

  const cellLink = { display: 'block', padding: '14px 20px', textDecoration: 'none', color: 'inherit' } as const

  return (
    <>
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
    }}>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {/* Avatar — non-sortable */}
              <th style={{
                padding: '12px 20px', background: 'var(--surface)',
                borderBottom: '1px solid var(--border)', width: 52,
              }} />
              <SortableHeader label={locale === 'ar' ? 'رقم الموظف' : 'Employee #'} column="employee_number" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم'      : 'Name'}        column="name"            activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'القسم'      : 'Department'}  column="department"      activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الوظيفة'    : 'Position'}    column="position"        activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الجنسية'    : 'Nationality'} column="nationality"     activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة'     : 'Status'}      column="status"          activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'تاريخ التعيين' : 'Hired'}   column="hire_date"       activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              {canEdit && (
                <th style={{
                  width: 48,
                  padding: '12px 8px',
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                }} />
              )}
            </tr>
          </thead>
          <tbody style={{ opacity: isPending ? 0.5 : 1, pointerEvents: isPending ? 'none' : 'auto', transition: 'opacity 0.15s ease' }}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 9 : 8} style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: 'var(--accent-100)', display: 'grid',
                      placeItems: 'center', color: 'var(--brand-active)',
                    }}>
                      <Inbox size={20} strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
                      {locale === 'ar' ? 'لا يوجد موظفون' : 'No employees found'}
                    </div>
                    <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', maxWidth: 300 }}>
                      {locale === 'ar' ? 'جرّب تعديل الفلاتر أو ' : 'Try adjusting the filters or '}
                      <Link href="/persons/new" style={{ color: 'var(--brand-active)', textDecoration: 'underline' }}>
                        {locale === 'ar' ? 'إضافة موظف جديد ←' : 'add a new employee →'}
                      </Link>
                    </div>
                  </div>
                </td>
              </tr>
            ) : rows.map((r, i) => {
              const avatarColor = AVATAR_PALETTE[i % AVATAR_PALETTE.length]!
              const href = `/persons/${r.id}`
              return (
                <tr
                  key={r.id}
                  className="hover:bg-surface"
                  style={{
                    borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 120ms',
                  }}
                >
                  <td style={{ padding: 0, verticalAlign: 'middle' }}>
                    <Link href={href} style={{ ...cellLink, padding: '12px 20px' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: avatarColor, color: 'var(--card)',
                        display: 'grid', placeItems: 'center',
                        fontFamily: 'var(--font-serif)', fontSize: 'var(--text-caption)', fontWeight: 600,
                        flexShrink: 0,
                      }} aria-hidden>
                        {initials(r.fullNameEn)}
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', verticalAlign: 'middle' }}>
                    <Link href={href} style={{ ...cellLink, color: 'var(--brand-active)', fontWeight: 600 }}>
                      {r.personNumber}
                    </Link>
                  </td>
                  <td style={{ padding: 0, verticalAlign: 'middle' }}>
                    <Link href={href} style={cellLink}>
                      <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{r.fullNameEn ?? '—'}</div>
                    </Link>
                  </td>
                  <td style={{ padding: 0, fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                    <Link href={href} style={cellLink}>{r.departmentNameEn ?? '—'}</Link>
                  </td>
                  <td style={{ padding: 0, fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                    <Link href={href} style={cellLink}>{r.positionTitleEn ?? '—'}</Link>
                  </td>
                  <td style={{ padding: 0, fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                    <Link href={href} style={cellLink}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.nationalityCode}
                        {r.isEmiratisationEligible && (
                          <Flag size={12} strokeWidth={1.75} style={{ color: 'var(--brand-active)' }} aria-label={locale === 'ar' ? 'مؤهل للتوطين' : 'Emiratisation eligible'} />
                        )}
                      </span>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                        {r.nationalityCategory.replace('_', ' ')}
                      </span>
                    </Link>
                  </td>
                  <td style={{ padding: 0, verticalAlign: 'middle' }}>
                    <Link href={href} style={cellLink}>
                      <StatusPill status={r.assignmentStatus} locale={locale} />
                    </Link>
                  </td>
                  <td style={{ padding: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    <Link href={href} style={cellLink}>{formatDMY(r.hireDate)}</Link>
                  </td>
                  {canEdit && (
                    <td style={{ padding: '0 8px', verticalAlign: 'middle', textAlign: 'center', width: 48 }}>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); setEditTarget(r) }}
                        aria-label={locale === 'ar' ? 'تعديل الموظف' : 'Edit person'}
                        style={{
                          display:      'inline-flex',
                          alignItems:   'center',
                          justifyContent: 'center',
                          width:        28,
                          height:       28,
                          borderRadius: 6,
                          border:       '1px solid var(--border)',
                          background:   'var(--card)',
                          color:        'var(--ink-3)',
                          cursor:       'pointer',
                          padding:      0,
                          flexShrink:   0,
                        }}
                      >
                        <MoreHorizontal size={14} strokeWidth={1.75} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table></TableScrollRegion>
      </div>
    </div>

    <PersonEditDrawer
      open={editTarget !== null}
      person={editTarget}
      onClose={() => setEditTarget(null)}
      onSaved={() => { setEditTarget(null); router.refresh() }}
    />
    </>
  )
}
