'use client'

/**
 * ProbationGeneratePanel — Enterprise-grade PCL generate screen.
 *
 * Left panel  : Sortable employee data table (probation end date ASC)
 * Right panel : Selected employee summary card + probation insights + quick actions
 *
 * Workflow:
 *  1. HR sees only eligible under-probation employees (filtered server-side)
 *  2. Click row → employee details appear in right panel instantly
 *  3. Click "Generate Letter" → resolves template tokens, creates draft letter record
 *  4. On success → calls onGenerated() to switch to Letters tab
 */

import { useState, useTransition } from 'react'
import {
  FileText, Loader2, AlertCircle, CheckCircle2,
  Calendar, Clock, User, Building2, Briefcase,
  ChevronDown, ChevronUp, Search,
} from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { bulkGenerateLetters } from '@/modules/employee-letters/actions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProbationEmployee {
  id:               string
  personNumber:     string | null
  fullNameEn:       string | null
  fullNameAr:       string | null
  profilePhotoUrl:  string | null
  jobTitleEn:       string | null
  jobTitleAr:       string | null
  departmentNameEn: string | null
  departmentNameAr: string | null
  hireDate:         string | null
  probationEndDate: string | null
  probationStatus:  string | null
  assignmentStatus: string | null
  employmentType:   string | null
  legalEntityId:    string | null
  legalEntityName:  string | null
  managerNameEn:    string | null
  managerNumber:    string | null
}

interface Props {
  employees:   ProbationEmployee[]
  onGenerated: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasArabic(s: string | null | undefined): boolean {
  return !!s && /[؀-ۿ]/.test(s)
}

function calcDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end   = new Date(endDate)
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calcProbationStartDate(hireDate: string | null): string {
  return hireDate ? fmtDate(hireDate) : '—'
}

function daysChip(days: number | null) {
  if (days === null) return { label: '—', bg: 'var(--surface)', fg: 'var(--ink-3)' }
  if (days < 0)      return { label: `${Math.abs(days)}d overdue`, bg: '#FEE2E2', fg: '#DC2626' }
  if (days <= 7)     return { label: `${days}d`, bg: '#FEF3C7', fg: '#D97706' }
  if (days <= 30)    return { label: `${days}d`, bg: '#DBEAFE', fg: '#2563EB' }
  return               { label: `${days}d`, bg: '#F0FDF4', fg: '#16A34A' }
}

function Initials({ name, photo, size = 36 }: { name: string | null; photo?: string | null; size?: number }) {
  if (photo) {
    return (
      <img
        src={photo} alt={name ?? ''}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  const initials = (name ?? '?')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('')
  const hue = (name ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},45%,55%)`, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size > 40 ? 16 : 12, fontWeight: 700, letterSpacing: '0.03em',
    }}>
      {initials}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

type SortKey = 'probationEndDate' | 'fullNameEn' | 'hireDate'

export function ProbationGeneratePanel({ employees, onGenerated }: Props) {
  const locale = useLocale()
  const [selected,   setSelected]   = useState<ProbationEmployee | null>(null)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState<SortKey>('probationEndDate')
  const [sortAsc,    setSortAsc]    = useState(true)
  const [isPending,  startTransition] = useTransition()
  const [toast,      setToast]      = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [generated,  setGenerated]  = useState<{ letterId: string } | null>(null)

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const visible = employees
    .filter(e => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (e.fullNameEn   ?? '').toLowerCase().includes(q) ||
        (e.personNumber ?? '').toLowerCase().includes(q) ||
        (e.departmentNameEn ?? '').toLowerCase().includes(q) ||
        (e.jobTitleEn   ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      let av: string | null = null, bv: string | null = null
      if (sortKey === 'probationEndDate') { av = a.probationEndDate; bv = b.probationEndDate }
      if (sortKey === 'fullNameEn')       { av = a.fullNameEn;       bv = b.fullNameEn }
      if (sortKey === 'hireDate')         { av = a.hireDate;         bv = b.hireDate }
      if (!av && !bv) return 0
      if (!av) return 1; if (!bv) return -1
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p)
    else { setSortKey(key); setSortAsc(true) }
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  function handleGenerate() {
    if (!selected) return
    setToast(null)
    setGenerated(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('typeCode',  'PCL')
      fd.set('personIds', JSON.stringify([selected.id]))
      fd.set('language',  'en')
      const results = await bulkGenerateLetters(fd)
      const r = results[0]
      if (!r) { setToast({ type: 'error', msg: locale === 'ar' ? 'لم يصل أي نتيجة من الخادم' : 'No result returned from server' }); return }
      if (r.error) { setToast({ type: 'error', msg: r.error }); return }
      setGenerated({ letterId: r.letterId! })
      setToast({ type: 'success', msg: locale === 'ar' ? `تم إنشاء الخطاب — ${selected.fullNameEn}` : `Letter generated — ${selected.fullNameEn}` })
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const daysRemaining = selected ? calcDaysRemaining(selected.probationEndDate) : null
  const dChip = daysChip(daysRemaining)

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null : sortAsc
      ? <ChevronUp size={11} style={{ display: 'inline', marginLeft: 2 }} />
      : <ChevronDown size={11} style={{ display: 'inline', marginLeft: 2 }} />

  const thStyle: React.CSSProperties = {
    padding: '9px 12px', textAlign: 'left',
    fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--ink-3)',
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    background: 'var(--surface)',
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', fontSize: 'var(--text-body)',
    color: 'var(--ink-2)', whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  }

  return (
    <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

      {/* ── LEFT: Employee table ──────────────────────────────────────────── */}
      <div>
        {/* Search bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 14,
        }}>
          <div style={{
            position: 'relative', flex: 1, maxWidth: 340,
          }}>
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--ink-3)',
              pointerEvents: 'none',
            }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={locale === 'ar' ? 'البحث بالاسم أو رقم الموظف أو القسم…' : 'Search by name, employee #, department…'}
              style={{
                width: '100%', height: 34, borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--ink-1)', fontSize: 'var(--text-body)',
                paddingLeft: 30, paddingRight: 10,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
            {locale === 'ar'
              ? `${visible.length} موظف مؤهّل`
              : `${visible.length} employee${visible.length !== 1 ? 's' : ''} eligible`}
          </span>
        </div>

        {/* Table */}
        {visible.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 0',
            border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--ink-3)', fontSize: 'var(--text-body)',
          }}>
            {employees.length === 0
              ? (locale === 'ar' ? 'لا يوجد موظفون تحت فترة التجربة حالياً.' : 'No employees are currently under probation.')
              : (locale === 'ar' ? 'لا يوجد موظفون مطابقون لبحثك.' : 'No employees match your search.')}
          </div>
        ) : (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 10,
            overflow: 'hidden', background: 'var(--card)',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>{locale === 'ar' ? 'رقم الموظف' : 'Emp #'}</th>
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('fullNameEn')}>
                      {locale === 'ar' ? 'الاسم' : 'Name'} <SortIcon k="fullNameEn" />
                    </th>
                    <th style={thStyle}>{locale === 'ar' ? 'القسم' : 'Department'}</th>
                    <th style={thStyle}>{locale === 'ar' ? 'المنصب' : 'Position'}</th>
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('hireDate')}>
                      {locale === 'ar' ? 'تاريخ الالتحاق' : 'Joined'} <SortIcon k="hireDate" />
                    </th>
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('probationEndDate')}>
                      {locale === 'ar' ? 'نهاية فترة التجربة' : 'Probation End'} <SortIcon k="probationEndDate" />
                    </th>
                    <th style={thStyle}>{locale === 'ar' ? 'الأيام المتبقية' : 'Days Left'}</th>
                    <th style={thStyle}>{locale === 'ar' ? 'المدير المباشر' : 'Reporting Manager'}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((emp, idx) => {
                    const days  = calcDaysRemaining(emp.probationEndDate)
                    const chip  = daysChip(days)
                    const isRow = selected?.id === emp.id
                    return (
                      <tr
                        key={emp.id}
                        onClick={() => { setSelected(emp); setGenerated(null); setToast(null) }}
                        style={{
                          borderBottom: idx < visible.length - 1 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                          background: isRow
                            ? 'color-mix(in srgb, var(--accent) 6%, transparent)'
                            : 'transparent',
                          transition: 'background 0.1s',
                          outline: isRow ? `2px solid var(--accent)` : 'none',
                          outlineOffset: -2,
                        }}
                        onMouseEnter={e => {
                          if (!isRow) (e.currentTarget as HTMLElement).style.background = 'var(--surface)'
                        }}
                        onMouseLeave={e => {
                          if (!isRow) (e.currentTarget as HTMLElement).style.background = 'transparent'
                        }}
                      >
                        <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                          {emp.personNumber ?? '—'}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--ink-1)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Initials name={emp.fullNameEn} photo={emp.profilePhotoUrl} size={28} />
                            <div>
                              <div style={{ fontSize: 'var(--text-body)' }}>{emp.fullNameEn ?? '—'}</div>
                              {hasArabic(emp.fullNameAr) && (
                                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl' }}>
                                  {emp.fullNameAr}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>{emp.departmentNameEn ?? '—'}</td>
                        <td style={tdStyle}>{emp.jobTitleEn ?? '—'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>
                          {fmtDate(emp.hireDate)}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>
                          {fmtDate(emp.probationEndDate)}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px', borderRadius: 4,
                            fontSize: 'var(--text-caption)', fontWeight: 600,
                            background: chip.bg, color: chip.fg,
                          }}>
                            {chip.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--ink-3)' }}>
                          {emp.managerNameEn ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Employee summary card + actions ────────────────────────── */}
      <div style={{ position: 'sticky', top: 16 }}>
        {!selected ? (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 12,
            padding: '32px 20px', textAlign: 'center',
          }}>
            <User size={28} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
              {locale === 'ar'
                ? 'اختر موظفاً من الجدول لعرض تفاصيل فترة التجربة وإنشاء الخطاب.'
                : 'Select an employee from the table to see their probation details and generate a letter.'}
            </p>
          </div>
        ) : (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 12,
            background: 'var(--card)', overflow: 'hidden',
          }}>
            {/* Employee identity */}
            <div style={{
              padding: '20px', background: 'color-mix(in srgb, var(--accent) 4%, var(--card))',
              borderBottom: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <Initials name={selected.fullNameEn} photo={selected.profilePhotoUrl} size={56} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-1)' }}>
                  {selected.fullNameEn ?? '—'}
                </div>
                {hasArabic(selected.fullNameAr) && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', marginTop: 2 }}>
                    {selected.fullNameAr}
                  </div>
                )}
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {selected.personNumber}
                </div>
              </div>
            </div>

            {/* Key details */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <Detail icon={<Briefcase size={13} />}   label={locale === 'ar' ? 'المنصب' : 'Position'}   value={selected.jobTitleEn ?? '—'} />
              <Detail icon={<Building2 size={13} />}   label={locale === 'ar' ? 'القسم' : 'Department'} value={selected.departmentNameEn ?? '—'} />
              <Detail icon={<User size={13} />}        label={locale === 'ar' ? 'المدير' : 'Manager'}    value={selected.managerNameEn ?? '—'} />
              <Detail icon={<Calendar size={13} />}    label={locale === 'ar' ? 'تاريخ الالتحاق' : 'Joined'}     value={fmtDate(selected.hireDate)} mono />
              <Detail icon={<Calendar size={13} />}    label={locale === 'ar' ? 'بداية التجربة' : 'Prob. Start'} value={calcProbationStartDate(selected.hireDate)} mono />
              <Detail icon={<Calendar size={13} />}    label={locale === 'ar' ? 'نهاية التجربة' : 'Prob. End'}  value={fmtDate(selected.probationEndDate)} mono />
              <Detail icon={<Clock size={13} />}       label={locale === 'ar' ? 'الكيان' : 'Entity'}     value={selected.legalEntityName ?? '—'} />
            </div>

            {/* Probation insights */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                {locale === 'ar' ? 'مؤشرات فترة التجربة' : 'Probation Insights'}
              </p>
              {/* Days remaining */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 8, marginBottom: 6,
                background: dChip.bg,
              }}>
                <span style={{ fontSize: 'var(--text-caption)', color: dChip.fg }}>
                  {daysRemaining === null
                    ? (locale === 'ar' ? 'لم يُحدَّد تاريخ الانتهاء' : 'No end date set')
                    : daysRemaining < 0
                      ? (locale === 'ar' ? 'متأخر — إجراء مطلوب' : 'Overdue — action required')
                      : daysRemaining === 0
                        ? (locale === 'ar' ? 'تنتهي اليوم' : 'Ends today')
                        : (locale === 'ar' ? `${daysRemaining} يوماً متبقياً` : `${daysRemaining} days remaining`)}
                </span>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: dChip.fg }}>
                  {daysRemaining !== null && daysRemaining >= 0 ? dChip.label : '!'}
                </span>
              </div>
              {/* Status chip */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderRadius: 8,
                background: 'color-mix(in srgb, #F59E0B 10%, transparent)',
              }}>
                <span style={{ fontSize: 'var(--text-caption)', color: '#92400E' }}>{locale === 'ar' ? 'حالة فترة التجربة' : 'Probation Status'}</span>
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: '#B45309' }}>
                  {(selected.probationStatus ?? 'ACTIVE').toUpperCase()}
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
                {locale === 'ar' ? 'الإجراءات' : 'Actions'}
              </p>

              {/* Toast */}
              {toast && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                  fontSize: 'var(--text-caption)',
                  background: toast.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                  color:      toast.type === 'success' ? '#166534' : '#991B1B',
                }}>
                  {toast.type === 'success'
                    ? <CheckCircle2 size={14} />
                    : <AlertCircle  size={14} />}
                  {toast.msg}
                </div>
              )}

              {/* Generate letter */}
              {!generated && (
                <button
                  onClick={handleGenerate}
                  disabled={isPending}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 0', borderRadius: 8, border: 'none',
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 'var(--text-body)', fontWeight: 600, cursor: isPending ? 'wait' : 'pointer',
                    opacity: isPending ? 0.8 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  {isPending
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {locale === 'ar' ? 'جارٍ الإنشاء…' : 'Generating…'}</>
                    : <><FileText size={14} /> {locale === 'ar' ? 'إنشاء خطاب فترة التجربة' : 'Generate Probation Letter'}</>}
                </button>
              )}

              {/* Post-generation actions */}
              {generated && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={onGenerated}
                    style={{
                      width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
                      background: 'var(--accent)', color: '#fff',
                      fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <FileText size={14} />
                    {locale === 'ar' ? 'عرض الخطاب المُنشأ' : 'View Generated Letter'}
                  </button>
                  <button
                    onClick={() => { setGenerated(null); setToast(null) }}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--ink-2)', fontSize: 'var(--text-caption)', cursor: 'pointer',
                    }}
                  >
                    {locale === 'ar' ? 'إنشاء خطاب آخر' : 'Generate Another'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small detail row ──────────────────────────────────────────────────────────

function Detail({
  icon, label, value, mono = false,
}: {
  icon:  React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      marginBottom: 8, fontSize: 'var(--text-caption)',
    }}>
      <span style={{ color: 'var(--ink-3)', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--ink-3)', flexShrink: 0, minWidth: 80 }}>{label}</span>
      <span style={{
        color: 'var(--ink-1)', fontWeight: 500,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontSize: mono ? 11 : 12,
      }}>
        {value}
      </span>
    </div>
  )
}
