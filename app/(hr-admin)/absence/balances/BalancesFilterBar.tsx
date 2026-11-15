'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import {
  BALANCE_STATUS_LABEL_EN, CARRY_FORWARD_STATUS_LABEL_EN,
  type BalanceStatus, type CarryForwardStatus,
} from './filters'

// Display-only status labels (stored enum values are unchanged).
const BALANCE_STATUS_LABEL_AR: Record<BalanceStatus, string> = {
  positive: 'موجب', negative: 'سالب', zero: 'صفر', expiring: 'قارب الانتهاء',
}
const CARRY_FORWARD_STATUS_LABEL_AR: Record<CarryForwardStatus, string> = {
  eligible: 'مؤهّل', not_eligible: 'غير مؤهّل', expired: 'منتهٍ',
}

interface EntityOption { id: string; nameEn: string; nameAr: string | null }
interface TypeOption   { id: string; typeCode: string; typeNameEn: string }
interface NamedOption  { id: string; nameEn: string; code: string }

interface ActiveFilters {
  year:         number
  entityId?:    string
  typeId?:      string
  departmentId?: string
  projectId?:   string
  q?:           string
  startDate?:   string
  endDate?:     string
  status?:      BalanceStatus
  cf?:          CarryForwardStatus
}

interface Props {
  filters:           ActiveFilters
  entityOptions:     EntityOption[]
  typeOptions:       TypeOption[]
  departmentOptions: NamedOption[]
  projectOptions:    NamedOption[]
  entityLocked:      boolean
}

const ANY = '__any__'

const selStyle: React.CSSProperties = {
  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)',
  padding: '6px 10px', fontSize: 'var(--text-body)', color: 'var(--ink-1)', width: '100%',
  fontFamily: 'var(--font-sans)',
}
const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block',
}

/**
 * Phase 1 — Leave Balances filter bar (auto-apply, no "Apply" button).
 *
 * Discrete dropdowns push to the URL instantly; the Employee search and the
 * date inputs are debounced (350ms). State lives entirely in the URL so the
 * Server Component re-queries and the view stays bookmarkable. Renders active
 * filter chips and a Reset control. Department/Project are Phase 2 (absent).
 */
export function BalancesFilterBar({ filters, entityOptions, typeOptions, departmentOptions, projectOptions, entityLocked }: Props) {
  const router   = useRouter()
  const params   = useSearchParams()
  const pathname = usePathname()
  const locale   = useLocale()
  const isAr     = locale === 'ar'

  const pushParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v && v !== ANY) sp.set(k, v)
        else sp.delete(k)
      }
      sp.delete('expanded') // collapse any open drill-down on filter change
      router.push(`${pathname}?${sp.toString()}`)
    },
    [params, router, pathname],
  )

  // Debounced inputs (employee search + dates).
  const [q, setQ] = useState(filters.q ?? '')
  const [startDate, setStartDate] = useState(filters.startDate ?? '')
  const [endDate, setEndDate] = useState(filters.endDate ?? '')

  // Keep local state in sync when the URL changes externally (e.g. Reset, chips).
  useEffect(() => { setQ(filters.q ?? '') }, [filters.q])
  useEffect(() => { setStartDate(filters.startDate ?? '') }, [filters.startDate])
  useEffect(() => { setEndDate(filters.endDate ?? '') }, [filters.endDate])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounced = useCallback((updates: Record<string, string | undefined>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushParam(updates), 350)
  }, [pushParam])

  const years = [filters.year - 2, filters.year - 1, filters.year, filters.year + 1]

  // Active chips (non-default filters only).
  const chips: Array<{ key: string; label: string }> = []
  if (filters.entityId) {
    const e = entityOptions.find(o => o.id === filters.entityId)
    chips.push({ key: 'entityId', label: `${isAr ? 'الجهة' : 'Entity'}: ${(isAr ? e?.nameAr : null) ?? e?.nameEn ?? filters.entityId}` })
  }
  if (filters.typeId) {
    const t = typeOptions.find(o => o.id === filters.typeId)
    chips.push({ key: 'typeId', label: `${isAr ? 'نوع الإجازة' : 'Leave type'}: ${t?.typeCode ?? filters.typeId}` })
  }
  if (filters.departmentId) {
    const d = departmentOptions.find(o => o.id === filters.departmentId)
    chips.push({ key: 'departmentId', label: `${isAr ? 'القسم' : 'Department'}: ${d?.nameEn ?? filters.departmentId}` })
  }
  if (filters.projectId) {
    const p = projectOptions.find(o => o.id === filters.projectId)
    chips.push({ key: 'projectId', label: `${isAr ? 'المشروع' : 'Project'}: ${p?.nameEn ?? filters.projectId}` })
  }
  if (filters.q)         chips.push({ key: 'q', label: `${isAr ? 'الموظف' : 'Employee'}: ${filters.q}` })
  if (filters.startDate) chips.push({ key: 'startDate', label: `${isAr ? 'من' : 'From'}: ${filters.startDate}` })
  if (filters.endDate)   chips.push({ key: 'endDate', label: `${isAr ? 'إلى' : 'To'}: ${filters.endDate}` })
  if (filters.status)    chips.push({ key: 'status', label: `${isAr ? 'الحالة' : 'Status'}: ${(isAr ? BALANCE_STATUS_LABEL_AR : BALANCE_STATUS_LABEL_EN)[filters.status]}` })
  if (filters.cf)        chips.push({ key: 'cf', label: `${isAr ? 'الترحيل' : 'Carry-forward'}: ${(isAr ? CARRY_FORWARD_STATUS_LABEL_AR : CARRY_FORWARD_STATUS_LABEL_EN)[filters.cf]}` })

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div data-responsive-grid="true" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}>
        {/* Legal Entity */}
        <div>
          <label style={labelStyle} htmlFor="f-entity">{isAr ? 'الجهة القانونية' : 'Legal Entity'}</label>
          <select
            id="f-entity" style={selStyle} disabled={entityLocked}
            value={filters.entityId ?? ANY}
            onChange={e => pushParam({ entityId: e.target.value })}
          >
            <option value={ANY}>{isAr ? 'كل الجهات' : 'All Entities'}</option>
            {entityOptions.map(o => <option key={o.id} value={o.id}>{(isAr ? o.nameAr : null) ?? o.nameEn}</option>)}
          </select>
        </div>

        {/* Leave Type */}
        <div>
          <label style={labelStyle} htmlFor="f-type">{isAr ? 'نوع الإجازة' : 'Leave Type'}</label>
          <select
            id="f-type" style={selStyle}
            value={filters.typeId ?? ANY}
            onChange={e => pushParam({ typeId: e.target.value })}
          >
            <option value={ANY}>{isAr ? 'كل أنواع الإجازات' : 'All Leave Types'}</option>
            {typeOptions.map(o => <option key={o.id} value={o.id}>{o.typeCode} — {o.typeNameEn}</option>)}
          </select>
        </div>

        {/* Department */}
        <div>
          <label style={labelStyle} htmlFor="f-dept">{isAr ? 'القسم' : 'Department'}</label>
          <select
            id="f-dept" style={selStyle}
            value={filters.departmentId ?? ANY}
            onChange={e => pushParam({ departmentId: e.target.value })}
          >
            <option value={ANY}>{isAr ? 'كل الأقسام' : 'All Departments'}</option>
            {departmentOptions.map(o => <option key={o.id} value={o.id}>{o.nameEn}</option>)}
          </select>
        </div>

        {/* Project */}
        <div>
          <label style={labelStyle} htmlFor="f-project">{isAr ? 'المشروع' : 'Project'}</label>
          <select
            id="f-project" style={selStyle}
            value={filters.projectId ?? ANY}
            onChange={e => pushParam({ projectId: e.target.value })}
          >
            <option value={ANY}>{isAr ? 'كل المشاريع' : 'All Projects'}</option>
            {projectOptions.map(o => <option key={o.id} value={o.id}>{o.nameEn}</option>)}
          </select>
        </div>

        {/* Employee search (debounced) */}
        <div>
          <label style={labelStyle} htmlFor="f-q">{isAr ? 'الموظف (الاسم / الرقم)' : 'Employee (name / number)'}</label>
          <input
            id="f-q" style={selStyle} type="search" placeholder={tk(locale, 'common.search')}
            value={q}
            onChange={e => { setQ(e.target.value); debounced({ q: e.target.value || undefined }) }}
          />
        </div>

        {/* Balance Year */}
        <div>
          <label style={labelStyle} htmlFor="f-year">{isAr ? 'سنة الرصيد' : 'Balance Year'}</label>
          <select
            id="f-year" style={selStyle}
            value={String(filters.year)}
            onChange={e => pushParam({ year: e.target.value })}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Start Date (debounced) — record activity date, not the leave period */}
        <div>
          <label style={labelStyle} htmlFor="f-start" title={isAr ? 'يُصفّى بحسب تاريخ إنشاء الرصيد أو تحديثه أو آخر استحقاق — لا تواريخ الإجازة المأخوذة.' : 'Filters by when the balance was created, updated, or last accrued — not the dates leave was taken.'}>{isAr ? 'النشاط من' : 'Activity From'}</label>
          <input
            id="f-start" style={selStyle} type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); debounced({ startDate: e.target.value || undefined }) }}
          />
        </div>

        {/* End Date (debounced) — record activity date */}
        <div>
          <label style={labelStyle} htmlFor="f-end" title={isAr ? 'يُصفّى بحسب تاريخ إنشاء الرصيد أو تحديثه أو آخر استحقاق — لا تواريخ الإجازة المأخوذة.' : 'Filters by when the balance was created, updated, or last accrued — not the dates leave was taken.'}>{isAr ? 'النشاط إلى' : 'Activity To'}</label>
          <input
            id="f-end" style={selStyle} type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); debounced({ endDate: e.target.value || undefined }) }}
          />
        </div>

        {/* Balance Status */}
        <div>
          <label style={labelStyle} htmlFor="f-status">{isAr ? 'حالة الرصيد' : 'Balance Status'}</label>
          <select
            id="f-status" style={selStyle}
            value={filters.status ?? ANY}
            onChange={e => pushParam({ status: e.target.value })}
          >
            <option value={ANY}>{isAr ? 'الكل' : 'All'}</option>
            <option value="positive">{isAr ? BALANCE_STATUS_LABEL_AR.positive : 'Positive'}</option>
            <option value="negative">{isAr ? BALANCE_STATUS_LABEL_AR.negative : 'Negative'}</option>
            <option value="zero">{isAr ? BALANCE_STATUS_LABEL_AR.zero : 'Zero'}</option>
            <option value="expiring">{isAr ? BALANCE_STATUS_LABEL_AR.expiring : 'Expiring Soon'}</option>
          </select>
        </div>

        {/* Carry-Forward Status */}
        <div>
          <label style={labelStyle} htmlFor="f-cf">{isAr ? 'حالة الترحيل' : 'Carry-Forward Status'}</label>
          <select
            id="f-cf" style={selStyle}
            value={filters.cf ?? ANY}
            onChange={e => pushParam({ cf: e.target.value })}
          >
            <option value={ANY}>{isAr ? 'الكل' : 'All'}</option>
            <option value="eligible">{isAr ? CARRY_FORWARD_STATUS_LABEL_AR.eligible : 'Eligible'}</option>
            <option value="not_eligible">{isAr ? CARRY_FORWARD_STATUS_LABEL_AR.not_eligible : 'Not Eligible'}</option>
            <option value="expired">{isAr ? CARRY_FORWARD_STATUS_LABEL_AR.expired : 'Expired'}</option>
          </select>
        </div>
      </div>

      {/* Active chips + Reset */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {chips.map(c => (
            <button
              key={c.key}
              onClick={() => pushParam({ [c.key]: undefined })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--ink-2)', borderRadius: 999, padding: '3px 10px',
                fontSize: 'var(--text-caption)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {c.label}
              <span aria-hidden style={{ color: 'var(--ink-3)' }}>✕</span>
            </button>
          ))}
          <button
            onClick={() => router.push(pathname)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--brand-active)',
              fontSize: 'var(--text-caption)', fontWeight: 600, cursor: 'pointer', padding: '3px 6px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {isAr ? 'مسح التصفية' : 'Reset filters'}
          </button>
        </div>
      )}
    </div>
  )
}
