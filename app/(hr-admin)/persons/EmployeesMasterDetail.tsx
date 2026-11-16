'use client'

/**
 * Employees — Option D "Modern" master–detail layout.
 *
 * Design handoff: design_handoff_employees_option_d (Claude Design, 2026-06).
 * Pattern: cohort segment filters on top → searchable people list on the
 * left (340px) → rich tabbed profile on the right.
 *
 * All visual values use the project design tokens (CLAUDE.md rule 7) —
 * the handoff's green/paper palette maps onto --accent / --surface / --ink.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Search, X, ChevronDown, Check, Users, Sparkles, Flag, Hourglass,
  CalendarDays, Building2, Briefcase, FileText, Download, ShieldAlert,
  UserRound,
} from 'lucide-react'
import type { PersonListRow } from '@/modules/core-hr'
import { getEmployeeProfile, type EmployeeProfile } from './profile-actions'

// ── i18n labels ─────────────────────────────────────────────────────────────

const L = {
  en: {
    people: 'people', of: 'of', legalEntities: 'legal entities',
    segAll: 'All people', segActive: 'Active', segUae: 'UAE Nationals',
    segProbation: 'On probation', segLeave: 'On leave',
    entity: 'Entity', department: 'Department',
    allEntities: 'All entities', allDepartments: 'All departments',
    searchPlaceholder: (n: number) => `Search ${n} people…`,
    noMatch: 'No people match', selectPerson: 'Select a person',
    openProfile: 'Open profile',
    tabOverview: 'Overview', tabJob: 'Job & Org', tabComp: 'Compensation',
    tabDocs: 'Documents', tabTimeline: 'Timeline',
    contact: 'Contact', employment: 'Employment', leaveBalance: 'Leave balance',
    compliance: 'Compliance', position: 'Position', organization: 'Organization',
    monthlyComp: 'Monthly compensation', payment: 'Payment', documents: 'Documents',
    timeline: 'Activity timeline', restricted: 'Restricted',
    workEmail: 'Work email', phone: 'Phone', location: 'Location', reportsTo: 'Reports to',
    contractType: 'Contract type', grade: 'Grade', hired: 'Hired', legalEntity: 'Legal entity',
    visaExpiry: 'Visa expiry', emiratesId: 'Emirates ID', nationality: 'Nationality', status: 'Status',
    jobTitle: 'Job title', project: 'Project', workLocation: 'Work location',
    employeeNo: 'Employee #', startDate: 'Start date', noticePeriod: 'Notice period',
    workerType: 'Worker type', basicSalary: 'Basic salary', allowances: 'Allowances',
    annual: 'Annual (×12)', bank: 'Bank', iban: 'IBAN', payFrequency: 'Pay frequency',
    currency: 'Currency', perMonth: '/ month', days: 'days',
    daysLeft: (r: string, t: string) => `${r} of ${t} days left`,
    taken: 'taken', uaeNational: 'UAE National', expat: 'Expat', gcc: 'GCC National',
    loadError: 'Could not load this profile.', loading: 'Loading profile…',
    noDocs: 'No documents on file', noEvents: 'No employment actions recorded',
    probationUntil: 'Probation until', noLeaveData: 'No leave balance recorded for this year',
    truncated: (shown: number, total: number) =>
      `Showing first ${shown} of ${total} — refine with search or filters`,
  },
  ar: {
    people: 'موظف', of: 'من', legalEntities: 'كيانات قانونية',
    segAll: 'كل الموظفين', segActive: 'نشط', segUae: 'مواطنو الإمارات',
    segProbation: 'تحت التجربة', segLeave: 'في إجازة',
    entity: 'الكيان', department: 'القسم',
    allEntities: 'كل الكيانات', allDepartments: 'كل الأقسام',
    searchPlaceholder: (n: number) => `ابحث في ${n} موظف…`,
    noMatch: 'لا يوجد موظفون مطابقون', selectPerson: 'اختر موظفاً',
    openProfile: 'فتح الملف',
    tabOverview: 'نظرة عامة', tabJob: 'الوظيفة والتنظيم', tabComp: 'التعويضات',
    tabDocs: 'المستندات', tabTimeline: 'السجل الزمني',
    contact: 'بيانات الاتصال', employment: 'التوظيف', leaveBalance: 'رصيد الإجازات',
    compliance: 'الامتثال', position: 'المنصب', organization: 'التنظيم',
    monthlyComp: 'التعويض الشهري', payment: 'الدفع', documents: 'المستندات',
    timeline: 'السجل الزمني', restricted: 'مقيد',
    workEmail: 'البريد الإلكتروني', phone: 'الهاتف', location: 'الموقع', reportsTo: 'المدير المباشر',
    contractType: 'نوع العقد', grade: 'الدرجة', hired: 'تاريخ التعيين', legalEntity: 'الكيان القانوني',
    visaExpiry: 'انتهاء التأشيرة', emiratesId: 'الهوية الإماراتية', nationality: 'الجنسية', status: 'الحالة',
    jobTitle: 'المسمى الوظيفي', project: 'المشروع', workLocation: 'موقع العمل',
    employeeNo: 'الرقم الوظيفي', startDate: 'تاريخ البدء', noticePeriod: 'فترة الإشعار',
    workerType: 'نوع العامل', basicSalary: 'الراتب الأساسي', allowances: 'البدلات',
    annual: 'سنوي (×12)', bank: 'البنك', iban: 'الآيبان', payFrequency: 'دورية الدفع',
    currency: 'العملة', perMonth: '/ شهرياً', days: 'يوم',
    daysLeft: (r: string, t: string) => `${r} من ${t} يوم متبقٍ`,
    taken: 'مستهلك', uaeNational: 'مواطن إماراتي', expat: 'وافد', gcc: 'مواطن خليجي',
    loadError: 'تعذر تحميل هذا الملف.', loading: 'جارٍ تحميل الملف…',
    noDocs: 'لا توجد مستندات', noEvents: 'لا توجد إجراءات توظيف مسجلة',
    probationUntil: 'فترة التجربة حتى', noLeaveData: 'لا يوجد رصيد إجازات مسجل لهذا العام',
    truncated: (shown: number, total: number) =>
      `يعرض أول ${shown} من ${total} — حسّن البحث أو الفلاتر`,
  },
}

const STATUS_LABEL: Record<string, { en: string; ar: string }> = {
  ACTIVE:       { en: 'Active',       ar: 'نشط' },
  ON_LEAVE:     { en: 'On leave',     ar: 'في إجازة' },
  SUSPENDED:    { en: 'Suspended',    ar: 'موقوف' },
  PENDING_HIRE: { en: 'Pending hire', ar: 'قيد التعيين' },
  TERMINATED:   { en: 'Terminated',   ar: 'منتهي' },
  RETIRED:      { en: 'Retired',      ar: 'متقاعد' },
  DECEASED:     { en: 'Deceased',     ar: 'متوفى' },
  INACTIVE:     { en: 'Inactive',     ar: 'غير نشط' },
}

// status → token mapping (dot colour, pill bg/fg)
const STATUS_TOKENS: Record<string, { bg: string; fg: string; dot: string }> = {
  ACTIVE:       { bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)', dot: 'var(--status-approved-dot)' },
  ON_LEAVE:     { bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)',  dot: 'var(--status-pending-dot)' },
  SUSPENDED:    { bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)', dot: 'var(--status-rejected-dot)' },
  PENDING_HIRE: { bg: 'var(--accent-050)',         fg: 'var(--accent-700)',         dot: 'var(--accent-700)' },
  TERMINATED:   { bg: 'var(--surface)',            fg: 'var(--ink-3)',              dot: 'var(--ink-4)' },
  INACTIVE:     { bg: 'var(--surface)',            fg: 'var(--ink-3)',              dot: 'var(--ink-4)' },
}

const AVATAR_PALETTE = [
  'var(--avatar-1)','var(--avatar-2)','var(--avatar-3)','var(--avatar-4)',
  'var(--avatar-5)','var(--avatar-6)','var(--avatar-7)','var(--avatar-8)',
  'var(--avatar-9)','var(--avatar-10)',
]

function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtAED(n: number): string {
  return 'AED ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

function isOnProbation(r: PersonListRow): boolean {
  return (r.probationStatus === 'ACTIVE' || r.probationStatus === 'EXTENDED')
    && r.assignmentStatus === 'ACTIVE'
}

// ── Small shared pieces ─────────────────────────────────────────────────────

function Avatar({ name, id, size, photoUrl }: {
  name: string | null; id: string; size: number; photoUrl?: string | null
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" style={{
        width: size, height: size, borderRadius: size >= 48 ? 16 : 9,
        objectFit: 'cover', flexShrink: 0,
      }} />
    )
  }
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: size >= 48 ? 16 : 9,
      background: avatarColor(id), color: "var(--on-accent)",
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size >= 48 ? 20 : 12.5, fontWeight: 700, flexShrink: 0,
      letterSpacing: '0.3px',
    }}>
      {initials(name)}
    </span>
  )
}

function StatusPill({ status, locale }: { status: string; locale: string }) {
  const v = STATUS_TOKENS[status] ?? STATUS_TOKENS.INACTIVE
  const label = STATUS_LABEL[status]
    ? (locale === 'ar' ? STATUS_LABEL[status].ar : STATUS_LABEL[status].en)
    : status.replace(/_/g, ' ')
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: v.bg, color: v.fg, borderRadius: 999, padding: '3px 10px',
      fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.4px', flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

/** Chip trigger + searchable single-select popover (handoff FilterSelect). */
function FilterSelect({ icon, label, value, options, allLabel, onChange, locale }: {
  icon: React.ReactNode
  label: string
  value: string | null            // option id, or null = all
  options: Array<{ id: string; label: string }>
  allLabel: string
  onChange: (id: string | null) => void
  locale: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const active = value !== null
  const display = active ? (options.find(o => o.id === value)?.label ?? label) : label
  const filtered = q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQ('') }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 36, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
          border: `1px solid ${active ? 'var(--accent-200)' : 'var(--border)'}`,
          background: active ? 'var(--accent-050)' : 'var(--card)',
          color: active ? 'var(--brand-active)' : 'var(--ink-2)',
          fontSize: 'var(--text-body)', fontWeight: 600, maxWidth: 230,
        }}
      >
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
        {active ? (
          <span
            role="button" tabIndex={0} aria-label={locale === 'ar' ? 'مسح الفلتر' : 'Clear filter'}
            onClick={e => { e.stopPropagation(); onChange(null); setOpen(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange(null); setOpen(false) } }}
            style={{ display: 'inline-flex', color: 'var(--brand-active)' }}
          >
            <X size={13} strokeWidth={2.2} />
          </span>
        ) : (
          <ChevronDown size={14} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0, zIndex: 40,
          minWidth: 240, maxWidth: 300, background: 'var(--card)',
          border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 10px 30px rgba(15,47,42,.16), 0 2px 6px rgba(15,47,42,.10)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px',
            borderBottom: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            <Search size={14} strokeWidth={2} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={label}
              aria-label={label}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 'var(--text-body)', color: 'var(--ink-1)', width: '100%',
              }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            <PopoverItem
              label={allLabel} selected={!active}
              onClick={() => { onChange(null); setOpen(false) }}
            />
            {filtered.map(o => (
              <PopoverItem
                key={o.id} label={o.label} selected={value === o.id}
                onClick={() => { onChange(o.id); setOpen(false) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PopoverItem({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', gap: 8, padding: '7px 10px', borderRadius: 8,
        border: 'none', cursor: 'pointer', textAlign: 'start',
        background: selected ? 'var(--accent-050)' : 'transparent',
        color: selected ? 'var(--brand-active)' : 'var(--ink-2)',
        fontSize: 'var(--text-body)', fontWeight: selected ? 650 : 500,
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {selected && <Check size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
    </button>
  )
}

// ── Profile detail panel ────────────────────────────────────────────────────

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 650, color: 'var(--ink-4)' }}>{k}</span>
      <span style={{
        fontSize: 'var(--text-body)', fontWeight: 550, color: 'var(--ink-1)',
        overflowWrap: 'anywhere',
      }}>
        {v ?? '—'}
      </span>
    </div>
  )
}

function ProfileCard({ title, children, badge }: {
  title: string; children: React.ReactNode; badge?: React.ReactNode
}) {
  return (
    <div style={{
      border: '1px solid var(--border)', background: 'var(--surface)',
      borderRadius: 10, padding: '14px 16px', position: 'relative', minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 11,
      }}>
        <span style={{
          fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '1px', color: 'var(--ink-4)',
        }}>
          {title}
        </span>
        {badge}
      </div>
      {children}
    </div>
  )
}

function KVGrid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: '12px 14px',
    }}>
      {children}
    </div>
  )
}

type TabId = 'overview' | 'job' | 'comp' | 'docs' | 'timeline'

function DetailPanel({ row, locale, canViewComp }: {
  row: PersonListRow
  locale: string
  canViewComp: boolean
}) {
  const t = locale === 'ar' ? L.ar : L.en
  const [tab, setTab] = useState<TabId>('overview')
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const cache = useRef(new Map<string, EmployeeProfile>())

  useEffect(() => {
    setTab('overview')
    const cached = cache.current.get(row.id)
    if (cached) { setProfile(cached); setState('ready'); return }
    let cancelled = false
    setState('loading')
    getEmployeeProfile(row.id).then(res => {
      if (cancelled) return
      if ('profile' in res) {
        cache.current.set(row.id, res.profile)
        setProfile(res.profile)
        setState('ready')
      } else {
        setState('error')
      }
    }).catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [row.id])

  const name = locale === 'ar' ? (row.fullNameAr || row.fullNameEn) : (row.fullNameEn || row.fullNameAr)
  const typeLabel = row.nationalityCategory === 'UAE_NATIONAL' ? t.uaeNational
    : row.nationalityCategory === 'GCC_NATIONAL' ? t.gcc : t.expat

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: t.tabOverview },
    { id: 'job', label: t.tabJob },
    ...(canViewComp ? [{ id: 'comp' as TabId, label: t.tabComp }] : []),
    { id: 'docs', label: t.tabDocs },
    { id: 'timeline', label: t.tabTimeline },
  ]

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(28,40,36,.05), 0 2px 6px rgba(28,40,36,.05)',
    }}>
      {/* Hero */}
      <div style={{
        display: 'flex', gap: 16, padding: '22px 24px', alignItems: 'flex-start',
        background: 'linear-gradient(155deg, var(--accent-050), var(--card) 70%)',
        borderBottom: '1px solid var(--border)',
      }}>
        <Avatar name={row.fullNameEn} id={row.id} size={60} photoUrl={profile?.profilePhotoUrl} />
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 650,
            letterSpacing: '-0.3px', color: 'var(--ink-1)', lineHeight: 1.2,
          }}>
            {name}
          </span>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
            {[row.positionTitleEn, row.departmentNameEn].filter(Boolean).join(' · ') || '—'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
          marginTop: 2, alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 500,
              color: 'var(--ink-2)', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px',
            }}>
              {row.personNumber}
            </span>
            <StatusPill status={row.assignmentStatus} locale={locale} />
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.3px',
              color: row.nationalityCategory === 'UAE_NATIONAL' ? 'var(--brand-active)' : 'var(--ink-3)',
              background: row.nationalityCategory === 'UAE_NATIONAL' ? 'var(--accent-100)' : 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 999, padding: '3px 9px',
            }}>
              {typeLabel}
            </span>
            {profile?.gradeName && (
              <span style={{
                fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 999, padding: '3px 9px',
              }}>
                {profile.gradeName}
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/persons/${row.id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: 'var(--accent)', color: 'var(--card)', borderRadius: 8,
            padding: '8px 14px', fontSize: 'var(--text-body)', fontWeight: 650, textDecoration: 'none',
          }}
        >
          <Briefcase size={14} strokeWidth={2} aria-hidden />
          {t.openProfile}
        </Link>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label={locale === 'ar' ? 'تفاصيل الموظف' : 'Employee details'} style={{
        overflowX: 'auto', display: 'flex', gap: 2, padding: '0 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--card)',
      }}>
        {TABS.map(tb => (
          <button
            key={tb.id}
            role="tab"
            id={`employee-tab-${tb.id}`}
            aria-selected={tab === tb.id}
            aria-controls="employee-tab-panel"
            tabIndex={tab === tb.id ? 0 : -1}
            onKeyDown={e => {
              const offset = e.key === 'ArrowRight' ? (locale === 'ar' ? -1 : 1) : e.key === 'ArrowLeft' ? (locale === 'ar' ? 1 : -1) : 0
              if (!offset && e.key !== 'Home' && e.key !== 'End') return
              e.preventDefault()
              const index = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (TABS.findIndex(item => item.id === tab) + offset + TABS.length) % TABS.length
              const next = TABS[index].id
              setTab(next)
              document.getElementById(`employee-tab-${next}`)?.focus()
            }}
            type="button"
            onClick={() => setTab(tb.id)}
            style={{
              padding: '11px 12px',
              whiteSpace: 'nowrap', flexShrink: 0,
              borderTopWidth: "0px",
              borderTopStyle: "none",
              borderTopColor: "currentColor",
              borderRightWidth: "0px",
              borderRightStyle: "none",
              borderRightColor: "currentColor",
              borderLeftWidth: "0px",
              borderLeftStyle: "none",
              borderLeftColor: "currentColor", cursor: 'pointer',
              background: 'transparent', fontSize: 'var(--text-body)',
              fontWeight: tab === tb.id ? 700 : 550,
              color: tab === tb.id ? 'var(--brand-active)' : 'var(--ink-3)',
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: (tab === tb.id) ? "var(--accent)" : "transparent",
              marginBottom: -1,
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div role="tabpanel" id="employee-tab-panel" aria-labelledby={`employee-tab-${tab}`} tabIndex={0} style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {state === 'loading' && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {t.loading}
          </div>
        )}
        {state === 'error' && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {t.loadError}
          </div>
        )}
        {state === 'ready' && profile && (
          <TabBody tab={tab} p={profile} row={row} locale={locale} t={t} />
        )}
      </div>
    </div>
  )
}

function TabBody({ tab, p, row, locale, t }: {
  tab: TabId
  p: EmployeeProfile
  row: PersonListRow
  locale: string
  t: typeof L.en
}) {
  if (tab === 'overview') {
    const leavePct = p.leave && p.leave.total > 0
      ? Math.max(0, Math.min(100, (p.leave.remaining / p.leave.total) * 100))
      : 0
    return (
      <>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
          <ProfileCard title={t.contact}>
            <KVGrid cols={2}>
              <KV k={t.workEmail} v={p.workEmail} />
              <KV k={t.phone} v={p.workPhone} />
              <KV k={t.location} v={p.locationName} />
              <KV k={t.reportsTo} v={p.managerName} />
            </KVGrid>
          </ProfileCard>
          <ProfileCard title={t.employment}>
            <KVGrid cols={2}>
              <KV k={t.contractType} v={p.employmentType.replace(/_/g, ' ')} />
              <KV k={t.grade} v={p.gradeName} />
              <KV k={t.hired} v={fmtDate(p.hireDate, locale)} />
              <KV k={t.legalEntity} v={p.entityName} />
            </KVGrid>
          </ProfileCard>
        </div>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
          <ProfileCard title={t.leaveBalance}>
            {p.leave ? (
              <div style={{ padding: '4px 2px' }}>
                <div style={{
                  height: 8, borderRadius: 999, background: 'var(--surface)',
                  border: '1px solid var(--border)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${leavePct}%`, borderRadius: 999,
                    background: 'linear-gradient(90deg, var(--accent-200), var(--accent))',
                  }} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 9,
                  fontSize: 'var(--text-body)', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums',
                }}>
                  <span>{t.daysLeft(p.leave.remaining.toLocaleString(), p.leave.total.toLocaleString())}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{p.leave.taken.toLocaleString()} {t.taken}</span>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{t.noLeaveData}</span>
            )}
          </ProfileCard>
          <ProfileCard title={t.compliance}>
            <KVGrid cols={2}>
              <KV k={t.visaExpiry} v={p.visaExpiry ? fmtDate(p.visaExpiry, locale) : '—'} />
              <KV k={t.emiratesId} v={p.emiratesIdMasked
                ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)' }}>{p.emiratesIdMasked}</span>
                : '—'} />
              <KV k={t.nationality} v={p.nationalityCode} />
              <KV k={t.status} v={<StatusPill status={p.assignmentStatus} locale={locale} />} />
            </KVGrid>
          </ProfileCard>
        </div>
      </>
    )
  }

  if (tab === 'job') {
    return (
      <>
        <ProfileCard title={t.position}>
          <KVGrid cols={3}>
            <KV k={t.jobTitle} v={p.positionTitle} />
            <KV k={t.department} v={p.departmentName} />
            <KV k={t.grade} v={p.gradeName} />
            <KV k={t.reportsTo} v={p.managerName} />
            <KV k={t.project} v={p.projectName} />
            <KV k={t.workLocation} v={p.locationName} />
          </KVGrid>
        </ProfileCard>
        <ProfileCard title={t.organization}>
          <KVGrid cols={3}>
            <KV k={t.legalEntity} v={p.entityName} />
            <KV k={t.contractType} v={p.employmentType.replace(/_/g, ' ')} />
            <KV k={t.employeeNo} v={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)' }}>{p.personNumber}</span>} />
            <KV k={t.startDate} v={fmtDate(p.hireDate, locale)} />
            <KV k={t.noticePeriod} v={`${p.noticePeriodDays} ${t.days}`} />
            <KV k={t.workerType} v={p.workerCategory ?? (row.nationalityCategory === 'UAE_NATIONAL' ? t.uaeNational : t.expat)} />
          </KVGrid>
        </ProfileCard>
        {p.probationStatus === 'ACTIVE' || p.probationStatus === 'EXTENDED' ? (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--status-pending-fg)' }}>
            {t.probationUntil} {fmtDate(p.probationEndDate, locale)}
          </span>
        ) : null}
      </>
    )
  }

  if (tab === 'comp') {
    const c = p.compensation
    if (!c) return null
    const hasSalary = c.basicSalary !== null || c.totalPackage !== null
    const basic = c.basicSalary ?? 0
    const total = c.totalPackage ?? basic
    const allowances = Math.max(0, total - basic)
    return (
      <>
        <ProfileCard title={t.monthlyComp}>
          <div style={{
            fontSize: 30, fontWeight: 750, color: 'var(--brand-active)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px',
          }}>
            {hasSalary ? fmtAED(total) : '—'}
            {hasSalary && (
              <span style={{ fontSize: 'var(--text-body)', fontWeight: 550, color: 'var(--ink-3)', marginInlineStart: 4 }}>
                {t.perMonth}
              </span>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <KVGrid cols={3}>
              <KV k={t.basicSalary} v={c.basicSalary !== null ? fmtAED(c.basicSalary) : '—'} />
              <KV k={t.allowances} v={c.totalPackage !== null && c.basicSalary !== null ? fmtAED(allowances) : '—'} />
              <KV k={t.annual} v={hasSalary ? fmtAED(total * 12) : '—'} />
            </KVGrid>
          </div>
        </ProfileCard>
        <ProfileCard
          title={t.payment}
          badge={(
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--text-caption)', fontWeight: 750, textTransform: 'uppercase',
              letterSpacing: '0.6px', color: 'var(--status-pending-fg)',
              background: 'var(--status-pending-bg)', borderRadius: 999, padding: '3px 9px',
            }}>
              <ShieldAlert size={11} strokeWidth={2.4} aria-hidden />
              {t.restricted}
            </span>
          )}
        >
          <KVGrid cols={2}>
            <KV k={t.bank} v={c.bankName} />
            <KV k={t.iban} v={c.ibanMasked
              ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)' }}>{c.ibanMasked}</span>
              : '—'} />
            <KV k={t.payFrequency} v={p.payFrequency.replace(/_/g, ' ')} />
            <KV k={t.currency} v={c.currency} />
          </KVGrid>
        </ProfileCard>
      </>
    )
  }

  if (tab === 'docs') {
    return (
      <ProfileCard title={t.documents}>
        {p.documents.length === 0 ? (
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{t.noDocs}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {p.documents.map((d, i) => (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: 'var(--accent-100)', color: 'var(--brand-active)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={16} strokeWidth={1.8} aria-hidden />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {d.title}
                  </span>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
                    {[d.type.replace(/_/g, ' '), fmtSize(d.sizeBytes),
                      d.expiryDate ? `exp ${fmtDate(d.expiryDate, locale)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Link
                  href={`/persons/${row.id}/documents`}
                  aria-label={d.title}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: 8, color: 'var(--ink-3)',
                    border: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0,
                  }}
                >
                  <Download size={14} strokeWidth={2} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        )}
      </ProfileCard>
    )
  }

  // timeline
  return (
    <ProfileCard title={t.timeline}>
      {p.timeline.length === 0 ? (
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{t.noEvents}</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {p.timeline.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, position: 'relative',
            paddingBottom: i === p.timeline.length - 1 ? 0 : 16 }}>
              {i < p.timeline.length - 1 && (
                <span aria-hidden style={{
                  position: 'absolute', top: 14, insetInlineStart: 5, bottom: 0,
                  width: 2, background: 'var(--border)',
                }} />
              )}
              <span aria-hidden style={{
                width: 12, height: 12, borderRadius: '50%',
                marginTop: 3, flexShrink: 0,
                border: '2.5px solid var(--accent)', background: 'var(--card)',
                position: 'relative', zIndex: 1,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 650, color: 'var(--ink-1)' }}>
                    {e.title}
                  </span>
                  <span style={{
                    fontSize: 'var(--text-caption)', color: 'var(--ink-4)', flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmtDate(e.date, locale)}
                  </span>
                </div>
                {e.sub && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                  marginTop: 2 }}>{e.sub}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ProfileCard>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

type SegmentId = 'all' | 'active' | 'uae' | 'probation' | 'leave'

export function EmployeesMasterDetail({
  rows, total, entities, departments, locale, canViewComp,
  initialSegment, initialEntityId, initialDepartmentId, initialSearch, contextChips,
}: {
  rows: PersonListRow[]
  total: number
  entities: Array<{ id: string; label: string }>
  departments: Array<{ id: string; label: string; legalEntityId: string }>
  locale: string
  canViewComp: boolean
  initialSegment?: SegmentId
  initialEntityId?: string | null
  initialDepartmentId?: string | null
  initialSearch?: string
  contextChips?: string[]
}) {
  const t = locale === 'ar' ? L.ar : L.en
  const [q, setQ] = useState(initialSearch ?? '')
  const [segment, setSegment] = useState<SegmentId>(initialSegment ?? 'all')
  const [entityId, setEntityId] = useState<string | null>(initialEntityId ?? null)
  const [deptId, setDeptId] = useState<string | null>(initialDepartmentId ?? null)

  const SEGMENTS: Array<{ id: SegmentId; label: string; icon: React.ReactNode }> = [
    { id: 'all', label: t.segAll, icon: <Users size={14} strokeWidth={2} aria-hidden /> },
    { id: 'active', label: t.segActive, icon: <Sparkles size={14} strokeWidth={2} aria-hidden /> },
    { id: 'uae', label: t.segUae, icon: <Flag size={14} strokeWidth={2} aria-hidden /> },
    { id: 'probation', label: t.segProbation, icon: <Hourglass size={14} strokeWidth={2} aria-hidden /> },
    { id: 'leave', label: t.segLeave, icon: <CalendarDays size={14} strokeWidth={2} aria-hidden /> },
  ]

  const list = useMemo(() => {
    let out = rows
    if (q.trim()) {
      const term = q.toLowerCase()
      out = out.filter(r =>
        (r.fullNameEn ?? '').toLowerCase().includes(term) ||
        r.fullNameAr.includes(q.trim()) ||
        r.personNumber.toLowerCase().includes(term) ||
        (r.positionTitleEn ?? '').toLowerCase().includes(term),
      )
    }
    if (segment === 'active') out = out.filter(r => r.assignmentStatus === 'ACTIVE')
    else if (segment === 'uae') out = out.filter(r => r.nationalityCategory === 'UAE_NATIONAL')
    else if (segment === 'probation') out = out.filter(isOnProbation)
    else if (segment === 'leave') out = out.filter(r => r.assignmentStatus === 'ON_LEAVE')
    if (entityId) out = out.filter(r => r.legalEntityId === entityId)
    if (deptId) out = out.filter(r => r.departmentId === deptId)
    return out
  }, [rows, q, segment, entityId, deptId])

  const [selId, setSelId] = useState<string | null>(rows[0]?.id ?? null)
  // Selection fallback — if the selected person is filtered out, use first row.
  const selected = list.find(r => r.id === selId) ?? list[0] ?? null

  const deptOptions = useMemo(
    () => (entityId ? departments.filter(d => d.legalEntityId === entityId) : departments),
    [departments, entityId],
  )

  const dotColor = (r: PersonListRow): string => {
    if (isOnProbation(r)) return 'var(--status-pending-dot)'
    return (STATUS_TOKENS[r.assignmentStatus] ?? STATUS_TOKENS.INACTIVE).dot
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {contextChips && contextChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {contextChips.map(chip => (
            <span key={chip} style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.3px',
              color: 'var(--brand-active)', background: 'var(--accent-050)',
              border: '1px solid var(--accent-200)', borderRadius: 999, padding: '3px 10px',
            }}>
              {chip}
            </span>
          ))}
        </div>
      )}

      {/* Segment bar + cohort filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', gap: 2, padding: 4,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          {SEGMENTS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 12px', borderRadius: 7,
                border: 'none', cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 600,
                background: segment === s.id ? 'var(--accent)' : 'transparent',
                color: segment === s.id ? 'var(--card)' : 'var(--ink-2)',
                transition: 'background .15s, color .15s',
              }}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <FilterSelect
          icon={<Building2 size={14} strokeWidth={2} aria-hidden />}
          label={t.entity} value={entityId} options={entities}
          allLabel={t.allEntities}
          onChange={id => { setEntityId(id); if (id) setDeptId(prev => (prev && departments.find(d => d.id === prev)?.legalEntityId !== id ? null : prev)) }}
          locale={locale}
        />
        <FilterSelect
          icon={<Briefcase size={14} strokeWidth={2} aria-hidden />}
          label={t.department} value={deptId} options={deptOptions}
          allLabel={t.allDepartments}
          onChange={setDeptId}
          locale={locale}
        />
      </div>

      {/* Split: list + detail */}
      <div data-responsive-grid="true" className="people-master-detail" style={{
        display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)',
        gap: 16, alignItems: 'start',
      }}>
        {/* List */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 1px 2px rgba(28,40,36,.05), 0 2px 6px rgba(28,40,36,.05)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px',
            background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          }}>
            <Search size={16} strokeWidth={2} style={{ color: 'var(--ink-4)', flexShrink: 0 }} aria-hidden />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t.searchPlaceholder(list.length)}
              aria-label={t.searchPlaceholder(list.length)}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 'var(--text-body)', color: 'var(--ink-1)', width: '100%',
              }}
            />
            {q && (
              <button
                type="button" onClick={() => setQ('')} aria-label={locale === 'ar' ? 'مسح البحث' : 'Clear search'}
                style={{
                  display: 'inline-flex', border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--ink-4)', padding: 2,
                }}
              >
                <X size={14} strokeWidth={2.2} aria-hidden />
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 330px)' }}>
            {list.length === 0 ? (
              <div style={{
                padding: '36px 16px', textAlign: 'center',
                fontSize: 'var(--text-body)', color: 'var(--ink-3)',
              }}>
                <UserRound size={20} strokeWidth={1.6} style={{ color: 'var(--ink-4)',
                marginBottom: 6 }} aria-hidden />
                <div>{t.noMatch}</div>
              </div>
            ) : list.map(r => {
              const isSel = selected?.id === r.id
              const rowName = locale === 'ar' ? (r.fullNameAr || r.fullNameEn) : (r.fullNameEn || r.fullNameAr)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelId(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 13px',
                    borderTopWidth: "0px",
                    borderTopStyle: "none",
                    borderTopColor: "currentColor",
                    borderRightWidth: "0px",
                    borderRightStyle: "none",
                    borderRightColor: "currentColor",
                    borderLeftWidth: "0px",
                    borderLeftStyle: "none",
                    borderLeftColor: "currentColor", cursor: 'pointer',
                    textAlign: 'start', position: 'relative',
                    background: isSel ? 'var(--accent-050)' : 'transparent',
                    borderBottomWidth: "1px",
                    borderBottomStyle: "solid",
                    borderBottomColor: "var(--border)",
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {isSel && (
                    <span aria-hidden style={{
                      position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0,
                      width: 3, background: 'var(--accent)',
                    }} />
                  )}
                  <Avatar name={r.fullNameEn} id={r.id} size={34} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 'var(--text-body)', fontWeight: 650, color: 'var(--ink-1)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {rowName}
                    </span>
                    <span style={{
                      fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.positionTitleEn ?? r.departmentNameEn ?? '—'}
                    </span>
                  </span>
                  <span
                    title={STATUS_LABEL[r.assignmentStatus]
                      ? (locale === 'ar' ? STATUS_LABEL[r.assignmentStatus].ar : STATUS_LABEL[r.assignmentStatus].en)
                      : r.assignmentStatus}
                    style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: dotColor(r),
                    }}
                  />
                </button>
              )
            })}
            {rows.length < total && (
              <div style={{ padding: '10px 13px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
                {t.truncated(rows.length, total)}
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        {selected ? (
          <DetailPanel key={selected.id} row={selected} locale={locale} canViewComp={canViewComp} />
        ) : (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 60, textAlign: 'center',
            fontSize: 'var(--text-body)', color: 'var(--ink-3)',
          }}>
            {t.selectPerson}
          </div>
        )}
      </div>
    </div>
  )
}
