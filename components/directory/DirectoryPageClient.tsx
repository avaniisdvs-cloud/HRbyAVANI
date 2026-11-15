'use client'

import { useState, useTransition, useCallback } from 'react'
import { Search, Mail, Phone, Building2, MapPin } from 'lucide-react'
import { searchDirectory } from '@/modules/directory/actions'
import type { DirectoryPerson, DirectoryResult } from '@/modules/directory/actions'

// ── Avatar helpers ─────────────────────────────────────────────────────────

const PALETTE = [
  'var(--avatar-1)','var(--avatar-2)','var(--avatar-3)','var(--avatar-4)',
  'var(--avatar-5)','var(--avatar-6)','var(--avatar-7)','var(--avatar-8)',
  'var(--avatar-9)','var(--avatar-10)',
]

function avatarColor(name: string | null): string {
  if (!name) return PALETTE[0]!
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0]![0] ?? '?').toUpperCase()
  return ((parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')).toUpperCase()
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  initial:     DirectoryResult
  locale?:     'en' | 'ar'
  showEntity?: boolean  // admin view shows entity badge; employee hides it
}

// ── Person card ────────────────────────────────────────────────────────────

function PersonCard({
  person,
  locale,
  showEntity,
}: {
  person:     DirectoryPerson
  locale:     'en' | 'ar'
  showEntity: boolean
}) {
  const displayName = locale === 'ar' ? (person.fullNameAr || person.fullNameEn) : (person.fullNameEn || person.fullNameAr)
  const subName     = locale === 'ar' ? person.fullNameEn : person.fullNameAr
  const color       = avatarColor(person.fullNameEn)
  const ini         = initials(person.fullNameEn)

  return (
    <div style={{
      background:   'var(--card)',
      border:       '1px solid var(--border)',
      borderRadius: 12,
      padding:      '18px 20px',
      display:      'flex',
      flexDirection: 'column',
      gap:          12,
      transition:   'box-shadow 0.15s, border-color 0.15s',
    }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow   = '0 2px 12px rgba(0,0,0,0.08)'
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-200)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow   = 'none'
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
      }}
    >
      {/* Top row — avatar + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: color, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-sans)',
        }}>
          {ini}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14.5, fontWeight: 600, color: 'var(--ink-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {displayName ?? '—'}
          </div>
          {subName && (
            <div style={{
              fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              direction: locale === 'ar' ? 'ltr' : 'rtl',
            }}>
              {subName}
            </div>
          )}
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
          marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
            {person.personNumber}
          </div>
        </div>
      </div>

      {/* Position + department */}
      {(person.positionTitleEn || person.departmentNameEn) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {person.positionTitleEn && (
            <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', fontWeight: 500 }}>
              {person.positionTitleEn}
            </div>
          )}
          {person.departmentNameEn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              <Building2 size={12} strokeWidth={1.5} aria-hidden />
              {person.departmentNameEn}
            </div>
          )}
        </div>
      )}

      {/* Contact row */}
      {(person.workEmail || person.mobileNumber) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5,
        paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          {person.workEmail && (
            <a
              href={`mailto:${person.workEmail}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 'var(--text-caption)', color: 'var(--brand-active)', textDecoration: 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              title={person.workEmail}
            >
              <Mail size={12} strokeWidth={1.5} aria-hidden style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.workEmail}</span>
            </a>
          )}
          {person.mobileNumber && (
            <a
              href={`tel:${person.mobileNumber}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 'var(--text-caption)', color: 'var(--ink-2)', textDecoration: 'none',
              }}
            >
              <Phone size={12} strokeWidth={1.5} aria-hidden style={{ flexShrink: 0 }} />
              {person.mobileNumber}
            </a>
          )}
        </div>
      )}

      {/* Entity badge (admin view only) */}
      {showEntity && person.legalEntityCode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={11} strokeWidth={1.5} style={{ color: 'var(--ink-4)', flexShrink: 0 }} aria-hidden />
          <span style={{
            fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.04em',
            color: 'var(--brand-active)', textTransform: 'uppercase',
          }}>
            {person.legalEntityCode}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────────────────

export function DirectoryPageClient({ initial, locale = 'en', showEntity = false }: Props) {
  const [result,     setResult]     = useState<DirectoryResult>(initial)
  const [query,      setQuery]      = useState('')
  const [deptId,     setDeptId]     = useState('')
  const [isPending,  startTransition] = useTransition()

  const isRtl = locale === 'ar'

  const run = useCallback((q: string, dept: string, page: number) => {
    startTransition(async () => {
      const r = await searchDirectory({ query: q, departmentId: dept || undefined, page, pageSize: 20 })
      setResult(r)
    })
  }, [])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    run(q, deptId, 1)
  }

  function handleDeptChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const d = e.target.value
    setDeptId(d)
    run(query, d, 1)
  }

  function goPage(p: number) {
    run(query, deptId, p)
  }

  const empty = !isPending && result.rows.length === 0

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Search bar ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 200 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              [isRtl ? 'right' : 'left']: 12,
              top: '50%', transform: 'translateY(-50%)',
              color: 'var(--ink-4)', pointerEvents: 'none',
            }}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder={locale === 'ar' ? 'ابحث بالاسم أو الرقم أو القسم…' : 'Search by name, number, or department…'}
            style={{
              width: '100%', height: 38, boxSizing: 'border-box',
              paddingInlineStart: 36, paddingInlineEnd: 12,
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 'var(--text-body)', color: 'var(--ink-1)', background: 'var(--card)',
              outline: 'none', transition: 'border-color 0.15s',
              fontFamily: 'var(--font-sans)',
            }}
            onFocus={e  => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e   => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Department filter — populated client-side from results */}
        <select
          value={deptId}
          onChange={handleDeptChange}
          style={{
            height: 38, padding: '0 10px', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 'var(--text-body)', color: 'var(--ink-2)',
            background: 'var(--card)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', minWidth: 160,
          }}
        >
          <option value="">{locale === 'ar' ? 'كل الأقسام' : 'All departments'}</option>
          {Array.from(
            new Map(
              initial.rows
                .filter(r => r.departmentId && r.departmentNameEn)
                .map(r => [r.departmentId!, r.departmentNameEn!])
            ).entries()
          ).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {/* ── Meta row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {isPending
            ? (locale === 'ar' ? 'جارٍ البحث…' : 'Searching…')
            : locale === 'ar'
              ? `${result.total} موظف`
              : `${result.total} employee${result.total !== 1 ? 's' : ''}`
          }
        </span>
        {result.totalPages > 1 && (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {locale === 'ar'
              ? `صفحة ${result.page} من ${result.totalPages}`
              : `Page ${result.page} of ${result.totalPages}`}
          </span>
        )}
      </div>

      {/* ── Cards grid ────────────────────────────────────────────────── */}
      <div data-responsive-grid="true" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 14,
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 0.15s',
        minHeight: empty ? 180 : undefined,
      }}>
        {empty ? (
          <div style={{
            gridColumn: '1 / -1', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: 48, color: 'var(--ink-3)',
          }}>
            <Search size={32} strokeWidth={1.25} aria-hidden />
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {locale === 'ar' ? 'لا توجد نتائج' : 'No results found'}
            </div>
            {query && (
              <div style={{ fontSize: 'var(--text-body)' }}>
                {locale === 'ar'
                  ? `لا يوجد موظف يطابق "${query}"`
                  : `No employees match "${query}"`}
              </div>
            )}
          </div>
        ) : (
          result.rows.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              locale={locale}
              showEntity={showEntity}
            />
          ))
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {result.totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingTop: 8 }}>
          <button
            onClick={() => goPage(result.page - 1)}
            disabled={result.page <= 1 || isPending}
            style={{
              height: 32, padding: '0 14px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--card)',
              fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer',
              opacity: result.page <= 1 ? 0.4 : 1,
            }}
          >
            {locale === 'ar' ? 'التالي ‹' : '‹ Prev'}
          </button>

          {Array.from({ length: Math.min(result.totalPages, 7) }, (_, i) => {
            const p = result.totalPages <= 7
              ? i + 1
              : result.page <= 4
                ? i + 1
                : result.page >= result.totalPages - 3
                  ? result.totalPages - 6 + i
                  : result.page - 3 + i
            return (
              <button
                key={p}
                onClick={() => goPage(p)}
                disabled={isPending}
                style={{
                  width: 32, height: 32, borderRadius: 7,
                  borderTopWidth: "1px",
                  borderTopStyle: "solid",
                  borderRightWidth: "1px",
                  borderRightStyle: "solid",
                  borderBottomWidth: "1px",
                  borderBottomStyle: "solid",
                  borderLeftWidth: "1px",
                  borderLeftStyle: "solid",
                  borderTopColor: p === result.page ? 'var(--accent)' : 'var(--border)',
                  borderRightColor: p === result.page ? 'var(--accent)' : 'var(--border)',
                  borderBottomColor: p === result.page ? 'var(--accent)' : 'var(--border)',
                  borderLeftColor: p === result.page ? 'var(--accent)' : 'var(--border)',
                  background: p === result.page ? 'var(--accent)' : 'var(--card)',
                  color: p === result.page ? 'white' : 'var(--ink-2)',
                  fontSize: 'var(--text-body)', fontWeight: p === result.page ? 600 : 400, cursor: 'pointer',
                }}
              >
                {p}
              </button>
            )
          })}

          <button
            onClick={() => goPage(result.page + 1)}
            disabled={result.page >= result.totalPages || isPending}
            style={{
              height: 32, padding: '0 14px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--card)',
              fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer',
              opacity: result.page >= result.totalPages ? 0.4 : 1,
            }}
          >
            {locale === 'ar' ? '› السابق' : 'Next ›'}
          </button>
        </div>
      )}
    </div>
  )
}
